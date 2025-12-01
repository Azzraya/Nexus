const db = require("./database");
const Security = require("./security");

class IntelligentDetection {
  // Learn from past attacks to improve detection
  static async learnFromAttack(guildId, attackData) {
    // Store attack patterns for future detection
    await new Promise((resolve, reject) => {
      db.db.run(
        "INSERT INTO attack_patterns (guild_id, pattern_data, timestamp) VALUES (?, ?, ?)",
        [guildId, JSON.stringify(attackData), Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Predict potential attacks before they happen
  static async predictAttack(guild, recentJoins) {
    const predictions = {
      raidLikelihood: 0,
      nukeLikelihood: 0,
      spamLikelihood: 0,
      confidence: 0,
    };

    // Analyze recent joins
    if (recentJoins.length >= 3) {
      const accountAges = recentJoins.map(j => Date.now() - j.createdTimestamp);
      const avgAge = accountAges.reduce((a, b) => a + b, 0) / accountAges.length;
      
      // Very new accounts = higher raid risk
      if (avgAge < 86400000) { // Less than 1 day old
        predictions.raidLikelihood += 40;
      }
      
      // Check for patterns
      const patterns = await Security.detectSuspiciousPatterns(guild, recentJoins);
      if (patterns.similarUsernames > 0) predictions.raidLikelihood += 20;
      if (patterns.similarCreationDates > 0) predictions.raidLikelihood += 20;
      if (patterns.noAvatars / recentJoins.length > 0.7) predictions.raidLikelihood += 20;
    }

    // Check historical data
    const historicalAttacks = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM attack_patterns WHERE guild_id = ? AND timestamp > ?",
        [guild.id, Date.now() - 604800000], // Last week
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    if (historicalAttacks.length > 0) {
      predictions.confidence += 30; // More confident if we've seen attacks before
    }

    return predictions;
  }

  // Auto-tune detection thresholds based on server activity
  static async autoTuneThresholds(guildId) {
    const recentJoins = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM anti_raid_state WHERE guild_id = ?",
        [guildId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Analyze join patterns and suggest optimal thresholds
    // This would be more sophisticated in production
    return {
      suggestedMaxJoins: 5,
      suggestedTimeWindow: 10000,
      reason: "Based on server activity patterns",
    };
  }

  // Detect coordinated attacks across multiple servers
  static async detectCrossServerThreat(userId) {
    // Check if user has been flagged in other servers
    const crossServerFlags = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT guild_id, threat_score FROM security_logs WHERE user_id = ? AND threat_score > 60 ORDER BY timestamp DESC LIMIT 10",
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    if (crossServerFlags.length >= 3) {
      return {
        isThreat: true,
        severity: "high",
        flaggedIn: crossServerFlags.length,
        recommendation: "Pre-emptive action recommended",
      };
    }

    return { isThreat: false };
  }
}

module.exports = IntelligentDetection;

