const db = require("./database");
const logger = require("./logger");

class AdvancedAntiRaid {
  // Multiple detection algorithms working together
  static detectionAlgorithms = {
    // Algorithm 1: Rate-based detection (Wick's method)
    rateBased: (joins, timeWindow, threshold) => {
      const recentJoins = joins.filter(
        (j) => Date.now() - j.timestamp < timeWindow
      );
      return recentJoins.length >= threshold;
    },

    // Algorithm 2: Pattern-based detection (detects coordinated joins)
    patternBased: (joins) => {
      // Require at least 5 joins for pattern detection
      if (joins.length < 5) return false;

      // Check for similar account ages (common in raids) - more strict
      const accountAges = joins.map((j) => j.accountAge);
      const avgAge =
        accountAges.reduce((a, b) => a + b, 0) / accountAges.length;
      const variance =
        accountAges.reduce((sum, age) => sum + Math.pow(age - avgAge, 2), 0) /
        accountAges.length;

      // Low variance = similar account ages = likely raid (stricter threshold)
      if (variance < 43200000 && joins.length >= 7) return true; // Less than 12 hours variance, need 7+ joins

      // Check for similar usernames (bot accounts often have patterns) - more strict
      const usernames = joins.map((j) => j.username.toLowerCase());
      const commonPatterns = usernames.filter(
        (name, i, arr) =>
          arr.filter((n) => n.includes(name.slice(0, 4))).length > 3 // Stricter (was 3 chars, 2 matches)
      );
      if (commonPatterns.length > 2 && joins.length >= 7) return true; // Need more patterns and joins

      return false;
    },

    // Algorithm 3: Behavioral analysis
    behavioral: (joins) => {
      // Require at least 5 joins to avoid false positives
      if (joins.length < 5) return false;

      // Check for accounts with no avatar (common in bot accounts)
      const noAvatarCount = joins.filter((j) => !j.hasAvatar).length;
      if (noAvatarCount / joins.length > 0.9) return true; // Very high threshold (was 0.8)

      // Check for accounts with default discriminator patterns
      const defaultDiscriminators = joins.filter(
        (j) => parseInt(j.discriminator) < 1000
      ).length;
      if (defaultDiscriminators / joins.length > 0.8) return true; // Higher threshold (was 0.6)

      // Check for very new accounts (less than 1 day old)
      const newAccounts = joins.filter(
        (j) => Date.now() - j.createdTimestamp < 86400000
      ).length;
      if (newAccounts / joins.length > 0.8 && joins.length >= 7) return true; // Need more joins

      return false;
    },

    // Algorithm 4: Network analysis (check for IP patterns - simplified)
    networkBased: (joins) => {
      // In a real implementation, you'd track IPs
      // For now, we use account creation patterns
      const creationTimes = joins.map((j) => j.createdTimestamp);
      const timeClusters = this.findClusters(creationTimes, 3600000); // 1 hour clusters
      if (timeClusters.length > 0 && timeClusters[0].length >= 3) return true;
      return false;
    },
  };

  static findClusters(times, window) {
    const clusters = [];
    const sorted = [...times].sort((a, b) => a - b);

    let currentCluster = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] < window) {
        currentCluster.push(sorted[i]);
      } else {
        if (currentCluster.length >= 2) clusters.push(currentCluster);
        currentCluster = [sorted[i]];
      }
    }
    if (currentCluster.length >= 2) clusters.push(currentCluster);

    return clusters;
  }

  // Calculate server-size-aware thresholds
  static getServerSizeMultiplier(memberCount) {
    if (memberCount < 100) return 1.0; // Small: 5 joins/10s (STRICT)
    if (memberCount < 500) return 1.6; // Medium: 8 joins/10s (BALANCED)
    if (memberCount < 2000) return 3.0; // Large: 15 joins/10s (RELAXED)
    return 5.0; // Huge: 25 joins/10s (VERY RELAXED)
  }

  static getServerSizeTier(memberCount) {
    if (memberCount < 100) return "Small (< 100)";
    if (memberCount < 500) return "Medium (100-500)";
    if (memberCount < 2000) return "Large (500-2K)";
    return "Huge (2K+)";
  }

  static async detectRaid(guild, member) {
    const config = await db.getServerConfig(guild.id);
    if (!config || !config.anti_raid_enabled) return false;

    // Get server size multiplier (dynamic scaling)
    const memberCount = guild.memberCount || 1;
    const serverSizeMultiplier = this.getServerSizeMultiplier(memberCount);

    // Get threat sensitivity settings (affects how aggressive detection is)
    const sensitivity = await db.getThreatSensitivity(guild.id);
    // Convert sensitivity to multipliers (lower threshold = more sensitive = higher multipliers)
    // Default threshold is 30, so we scale based on that
    const sensitivityMultiplier = sensitivity.risk_threshold / 30; // 1.0 = default, <1.0 = more sensitive, >1.0 = less sensitive
    const isLessSensitive = sensitivityMultiplier > 1.0; // Higher threshold = less sensitive

    // Combine server size and sensitivity multipliers
    const finalMultiplier = serverSizeMultiplier * sensitivityMultiplier;

    // Check whitelist first (before any detection)
    const isWhitelisted = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT * FROM security_whitelist WHERE guild_id = ? AND user_id = ?",
        [guild.id, member.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });

    if (isWhitelisted) return false; // Skip detection for whitelisted users

    // Get join history
    const joinData = await this.getJoinHistory(guild.id);
    const memberData = {
      id: member.id,
      username: member.user.username,
      discriminator: member.user.discriminator,
      accountAge: Date.now() - member.user.createdTimestamp,
      createdTimestamp: member.user.createdTimestamp,
      hasAvatar: member.user.avatar !== null,
      timestamp: Date.now(),
    };

    joinData.joins.push(memberData);

    // Run all detection algorithms with server-size-aware thresholds
    const scaledMaxJoins = Math.ceil(
      (config.anti_raid_max_joins || 5) * finalMultiplier
    );
    const results = {
      rateBased: this.detectionAlgorithms.rateBased(
        joinData.joins,
        config.anti_raid_time_window || 10000,
        scaledMaxJoins // Scale threshold by server size + sensitivity
      ),
      patternBased: this.detectionAlgorithms.patternBased(joinData.joins),
      behavioral: this.detectionAlgorithms.behavioral(joinData.joins),
      networkBased: this.detectionAlgorithms.networkBased(joinData.joins),
    };

    // Calculate threat score (0-100) - adjusted by server size + sensitivity
    // Adjust minimum joins based on combined multiplier
    const baseMinJoins = 5;
    const minJoinsForThreatScore = Math.ceil(baseMinJoins * finalMultiplier);

    let threatScore = 0;
    if (joinData.joins.length >= minJoinsForThreatScore) {
      // Adjust threat score contributions based on sensitivity
      const baseRateScore = 30;
      const basePatternScore = 25;
      const baseBehavioralScore = 15;
      const baseNetworkScore = 10;

      if (results.rateBased)
        threatScore += Math.ceil(baseRateScore / sensitivityMultiplier);
      if (results.patternBased)
        threatScore += Math.ceil(basePatternScore / sensitivityMultiplier);
      if (results.behavioral)
        threatScore += Math.ceil(baseBehavioralScore / sensitivityMultiplier);
      if (results.networkBased)
        threatScore += Math.ceil(baseNetworkScore / sensitivityMultiplier);
    } else {
      threatScore = 0;
    }

    // Adjust minimum joins for raid detection based on server size + sensitivity
    // Larger servers or less sensitive settings = need more joins
    const minJoinsForRaid = Math.ceil(baseMinJoins * finalMultiplier);

    if (joinData.joins.length < minJoinsForRaid) {
      return false; // Not enough joins to be considered a raid
    }

    // Adjust thresholds based on server size + sensitivity
    // Larger servers = need more joins for pattern/behavioral detection
    const patternBehavioralMinJoins = Math.ceil(7 * finalMultiplier);
    const networkMinJoins = Math.ceil(10 * finalMultiplier);

    // Adjust threat score threshold (larger servers = higher threshold needed)
    const threatScoreThreshold = Math.ceil(85 * finalMultiplier);

    // Only trigger if multiple algorithms agree OR threat score is very high
    const isRaid =
      (results.rateBased && results.patternBased) || // Both rate and pattern must trigger
      (results.rateBased && results.behavioral) || // Rate + behavioral
      (results.patternBased &&
        results.behavioral &&
        joinData.joins.length >= patternBehavioralMinJoins) || // Pattern + behavioral (needs more joins if less sensitive)
      (results.networkBased && joinData.joins.length >= networkMinJoins) || // Network needs many joins
      threatScore >= threatScoreThreshold; // Threshold adjusted by sensitivity

    if (isRaid) {
      // Only pass RECENT joins (within last 2 minutes) to prevent banning old members
      const twoMinutesAgo = Date.now() - 120000; // 2 minutes
      const recentJoins = joinData.joins.filter(
        (join) => join.timestamp && join.timestamp >= twoMinutesAgo
      );

      // Only handle raid if we have recent suspicious joins
      if (recentJoins.length > 0) {
        await this.handleRaid(
          guild,
          recentJoins,
          threatScore,
          results,
          finalMultiplier
        );
        return true;
      }
    }

    // Clean old joins (older than 1 minute)
    joinData.joins = joinData.joins.filter(
      (j) => Date.now() - j.timestamp < 60000
    );
    await this.saveJoinHistory(guild.id, joinData);

    return false;
  }

  static async getJoinHistory(guildId) {
    return new Promise((resolve, reject) => {
      db.db.get(
        "SELECT data FROM anti_raid_state WHERE guild_id = ?",
        [guildId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row ? JSON.parse(row.data) : { joins: [] });
        }
      );
    });
  }

  static async saveJoinHistory(guildId, data) {
    return new Promise((resolve, reject) => {
      db.db.run(
        "INSERT OR REPLACE INTO anti_raid_state (guild_id, data) VALUES (?, ?)",
        [guildId, JSON.stringify(data)],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  static async handleRaid(
    guild,
    suspiciousJoins,
    threatScore,
    detectionResults,
    finalMultiplier = 1.0
  ) {
    const config = await db.getServerConfig(guild.id);
    const action = config.anti_raid_action || "ban";

    const memberCount = guild.memberCount || 1;
    const serverSizeTier = this.getServerSizeTier(memberCount);

    logger.warn(
      `Raid detected in ${guild.name} (${guild.id}) [${serverSizeTier}]: Threat score ${threatScore}, ${suspiciousJoins.length} suspicious joins`
    );

    // Only take action on the most suspicious members (not all joins)
    // Filter to only ban members that match multiple criteria
    // Adjust suspicion threshold based on server size + sensitivity
    const baseSuspicionThreshold = 3;
    const suspicionThreshold = Math.ceil(
      baseSuspicionThreshold * finalMultiplier
    );

    const highlySuspicious = suspiciousJoins.filter((join) => {
      let suspicionScore = 0;

      // Account age (new accounts are more suspicious)
      if (Date.now() - join.createdTimestamp < 86400000) suspicionScore += 2; // Less than 1 day old
      if (Date.now() - join.createdTimestamp < 3600000) suspicionScore += 1; // Less than 1 hour old

      // Account characteristics
      if (!join.hasAvatar) suspicionScore += 1; // No avatar
      if (parseInt(join.discriminator) < 1000) suspicionScore += 1; // Default discriminator

      // Threshold adjusted by sensitivity (less sensitive = need higher suspicion)
      return suspicionScore >= suspicionThreshold;
    });

    // If we don't have enough highly suspicious members, don't ban anyone
    // This prevents banning legitimate users
    if (highlySuspicious.length === 0) {
      logger.warn(
        `Raid detected but no highly suspicious members to ban in ${guild.name}`
      );
      // Still enable lockdown but don't ban anyone
      try {
        const { Client } = require("discord.js");
        // Try to get client from index.js
        const indexModule = require("../index.js");
        if (indexModule.client?.antiRaid?.lockdown) {
          indexModule.client.antiRaid.lockdown.set(guild.id, {
            enabled: true,
            startedAt: Date.now(),
            reason: "Raid detected - lockdown enabled",
          });
        }
      } catch (error) {
        // If we can't set lockdown, just log
        logger.warn("Could not set lockdown:", error.message);
      }
      return;
    }

    // Take action on highly suspicious members only
    // IMPORTANT: Only ban members who joined RECENTLY (within last 2 minutes)
    // This prevents banning existing members
    const twoMinutesAgo = Date.now() - 120000;
    const recentSuspicious = highlySuspicious.filter(
      (join) => join.timestamp && join.timestamp >= twoMinutesAgo
    );

    if (recentSuspicious.length === 0) {
      logger.warn(
        `Raid detected but no recent suspicious joins to ban in ${guild.name}`
      );
      return;
    }

    let successCount = 0;
    for (const join of recentSuspicious) {
      try {
        // Double-check: Only ban if they joined recently
        const member = await guild.members.fetch(join.id).catch(() => null);
        if (!member) continue;

        // Verify member joined recently (within last 5 minutes as safety)
        const memberJoinTime = member.joinedTimestamp;
        const fiveMinutesAgo = Date.now() - 300000;
        if (memberJoinTime && memberJoinTime < fiveMinutesAgo) {
          // Member joined more than 5 minutes ago - skip (existing member)
          logger.warn(
            `Skipping ban for ${member.user.tag} - joined ${Math.floor(
              (Date.now() - memberJoinTime) / 1000
            )}s ago (existing member)`
          );
          continue;
        }

        if (action === "ban") {
          await member.ban({
            reason: `Anti-raid protection (Threat: ${threatScore}%)`,
            deleteMessageDays: 1,
          });
        } else if (action === "kick") {
          await member.kick("Anti-raid protection");
        } else if (action === "quarantine") {
          // Add quarantine role if configured
          const quarantineRole = guild.roles.cache.find((r) =>
            r.name.toLowerCase().includes("quarantine")
          );
          if (quarantineRole) {
            await member.roles.add(quarantineRole);
          }
        }

        successCount++;

        // Log to database
        await db.db.run(
          "INSERT INTO anti_raid_logs (guild_id, user_id, action_taken, timestamp) VALUES (?, ?, ?, ?)",
          [guild.id, join.id, action, Date.now()]
        );
      } catch (error) {
        logger.error(`Failed to ${action} ${join.id}: ${error.message}`);
      }
    }

    // Enable lockdown
    const lockdownMap =
      require("../index.js").client?.antiRaid?.lockdown || new Map();
    lockdownMap.set(guild.id, true);

    // Send detailed alert
    const logChannel = guild.channels.cache.find(
      (ch) => ch.name.includes("log") || ch.name.includes("mod")
    );
    if (logChannel) {
      await logChannel.send({
        embeds: [
          {
            title: "🚨 Advanced Anti-Raid Protection Triggered",
            description: `**Threat Score:** ${threatScore}%\n**Suspicious Joins:** ${
              suspiciousJoins.length
            }\n**Action Taken:** ${action}\n**Successfully ${
              action === "ban"
                ? "banned"
                : action === "kick"
                  ? "kicked"
                  : action + "ed"
            }:** ${successCount}`,
            fields: [
              {
                name: "Detection Results",
                value: `Rate-Based: ${
                  detectionResults.rateBased ? "✅" : "❌"
                }\nPattern-Based: ${
                  detectionResults.patternBased ? "✅" : "❌"
                }\nBehavioral: ${
                  detectionResults.behavioral ? "✅" : "❌"
                }\nNetwork-Based: ${
                  detectionResults.networkBased ? "✅" : "❌"
                }`,
                inline: true,
              },
            ],
            color: 0xff0000,
            timestamp: new Date().toISOString(),
          },
        ],
      });
    }

    // Clear join history
    await this.saveJoinHistory(guild.id, { joins: [] });
  }
}

module.exports = AdvancedAntiRaid;
