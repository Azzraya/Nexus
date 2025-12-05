// Zero-Day Attack Detection System
// EXCEEDS WICK - Detects unknown attack patterns before they become widespread
const db = require("./database");
const logger = require("./logger");

class ZeroDayDetection {
  constructor(client) {
    this.client = client;
    this.anomalyPatterns = new Map(); // guildId -> Map<patternHash, patternData>
    this.attackSignatures = new Map(); // patternHash -> {count, firstSeen, lastSeen, confidence}
    this.learningWindow = 7 * 24 * 60 * 60 * 1000; // 7 days
    this.minConfidence = 0.7;
  }

  // Analyze behavior sequence for anomalies
  async analyzeSequence(guildId, userId, sequence) {
    const patternHash = this.hashSequence(sequence);
    const key = `${guildId}-${patternHash}`;

    // Track pattern occurrence
    if (!this.anomalyPatterns.has(guildId)) {
      this.anomalyPatterns.set(guildId, new Map());
    }

    const guildPatterns = this.anomalyPatterns.get(guildId);
    if (!guildPatterns.has(patternHash)) {
      guildPatterns.set(patternHash, {
        occurrences: [],
        firstSeen: Date.now(),
        users: new Set(),
      });
    }

    const pattern = guildPatterns.get(patternHash);
    pattern.occurrences.push({
      userId,
      timestamp: Date.now(),
    });
    pattern.users.add(userId);

    // Check if this is a new/unknown pattern
    const isNewPattern = !this.attackSignatures.has(patternHash);
    const isAnomaly = await this.detectAnomaly(guildId, patternHash, pattern);

    if (isAnomaly || isNewPattern) {
      const confidence = await this.calculateConfidence(patternHash, pattern);
      
      if (confidence >= this.minConfidence) {
        await this.handleZeroDayThreat(guildId, userId, patternHash, sequence, confidence);
      }
    }

    return { isAnomaly, confidence: await this.calculateConfidence(patternHash, pattern) };
  }

  // Hash behavior sequence for pattern matching
  hashSequence(sequence) {
    // Create a normalized hash of the action sequence
    const normalized = sequence
      .map((action) => {
        // Normalize action types
        if (action.type?.includes("CREATE")) return "CREATE";
        if (action.type?.includes("DELETE")) return "DELETE";
        if (action.type?.includes("UPDATE")) return "UPDATE";
        if (action.type?.includes("BAN")) return "BAN";
        if (action.type?.includes("KICK")) return "KICK";
        return action.type || "UNKNOWN";
      })
      .join("->");

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  // Detect if pattern is anomalous
  async detectAnomaly(guildId, patternHash, pattern) {
    // Check if pattern is rare (seen < 3 times total)
    if (pattern.occurrences.length < 3) {
      // Check if it's seen across multiple users (coordinated)
      if (pattern.users.size >= 2) {
        return true; // Multiple users, rare pattern = suspicious
      }
    }

    // Check if pattern frequency is increasing rapidly
    const recentOccurrences = pattern.occurrences.filter(
      (o) => Date.now() - o.timestamp < 3600000 // Last hour
    );
    const olderOccurrences = pattern.occurrences.filter(
      (o) => Date.now() - o.timestamp >= 3600000 && Date.now() - o.timestamp < 7200000 // Hour before that
    );

    if (recentOccurrences.length > olderOccurrences.length * 3) {
      return true; // Rapid increase = emerging attack
    }

    // Check if pattern matches known attack signatures but with variations
    const knownSignature = this.attackSignatures.get(patternHash);
    if (knownSignature && knownSignature.confidence < 0.5) {
      // Low confidence known pattern = might be evolving
      return true;
    }

    return false;
  }

  // Calculate confidence that pattern is an attack
  async calculateConfidence(patternHash, pattern) {
    let confidence = 0;

    // Factor 1: Rarity (rare patterns are more suspicious)
    const totalPatterns = Array.from(this.anomalyPatterns.values())
      .reduce((sum, guildPatterns) => sum + guildPatterns.size, 0);
    const rarity = 1 / Math.max(1, totalPatterns / 1000);
    confidence += Math.min(30, rarity * 30);

    // Factor 2: Multi-user occurrence (coordinated = more suspicious)
    if (pattern.users.size >= 2) {
      confidence += Math.min(25, pattern.users.size * 10);
    }

    // Factor 3: Frequency increase
    const recentCount = pattern.occurrences.filter(
      (o) => Date.now() - o.timestamp < 3600000
    ).length;
    if (recentCount > 2) {
      confidence += Math.min(20, recentCount * 5);
    }

    // Factor 4: Pattern complexity (complex sequences = more suspicious)
    const complexity = pattern.occurrences[0]?.sequence?.length || 0;
    if (complexity > 5) {
      confidence += Math.min(15, complexity * 2);
    }

    // Factor 5: Time clustering (rapid succession = suspicious)
    if (pattern.occurrences.length >= 2) {
      const timestamps = pattern.occurrences.map((o) => o.timestamp).sort((a, b) => a - b);
      const avgInterval =
        timestamps.slice(1).reduce((sum, ts, i) => sum + (ts - timestamps[i]), 0) /
        (timestamps.length - 1);
      if (avgInterval < 10000) {
        // < 10 seconds between occurrences
        confidence += 10;
      }
    }

    return Math.min(100, confidence);
  }

  // Handle detected zero-day threat
  async handleZeroDayThreat(guildId, userId, patternHash, sequence, confidence) {
    // Log to database
    await new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO security_logs (guild_id, event_type, user_id, details, threat_score, threat_type, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          guildId,
          "zero_day_threat",
          userId,
          JSON.stringify({
            patternHash,
            sequence: sequence.slice(-10), // Last 10 actions
            confidence,
          }),
          Math.round(confidence),
          "zero_day_attack",
          Date.now(),
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Update attack signature
    if (!this.attackSignatures.has(patternHash)) {
      this.attackSignatures.set(patternHash, {
        count: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        confidence: 0,
      });
    }

    const signature = this.attackSignatures.get(patternHash);
    signature.count++;
    signature.lastSeen = Date.now();
    signature.confidence = Math.max(signature.confidence, confidence);

    // High confidence = alert admins
    if (confidence >= 80) {
      logger.warn("ZeroDayDetection", `High-confidence zero-day threat detected in ${guildId}: ${patternHash} (${confidence}% confidence)`);
      
      // Get guild config for mod channel
      const config = await db.getServerConfig(guildId);
      if (config?.mod_log_channel) {
        const guild = this.client?.guilds?.cache?.get(guildId);
        if (guild) {
          const modChannel = guild.channels.cache.get(config.mod_log_channel);
          if (modChannel) {
            const { EmbedBuilder } = require("discord.js");
            const embed = new EmbedBuilder()
              .setTitle("🚨 Zero-Day Attack Detected")
              .setDescription(`Unknown attack pattern detected with ${confidence}% confidence`)
              .addFields(
                { name: "User", value: `<@${userId}>`, inline: true },
                { name: "Pattern Hash", value: patternHash.substring(0, 20) + "...", inline: true },
                { name: "Confidence", value: `${confidence}%`, inline: true },
                { name: "Sequence", value: sequence.slice(-5).map(s => s.type || "UNKNOWN").join(" -> ").substring(0, 1024), inline: false }
              )
              .setColor(0xff0000)
              .setTimestamp();

            modChannel.send({ embeds: [embed] }).catch(() => {});
          }
        }
      }
    }
  }

  // Learn from confirmed attacks
  async learnFromAttack(guildId, patternHash, confirmed = true) {
    if (confirmed && this.attackSignatures.has(patternHash)) {
      const signature = this.attackSignatures.get(patternHash);
      signature.confidence = Math.min(100, signature.confidence + 10);
      signature.lastSeen = Date.now();
    }
  }

  // Get threat intelligence for pattern
  getThreatIntelligence(patternHash) {
    return this.attackSignatures.get(patternHash) || null;
  }
}

module.exports = ZeroDayDetection;

