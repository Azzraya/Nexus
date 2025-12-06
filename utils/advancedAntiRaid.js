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

    // Algorithm 4: Network analysis (IP-based detection - FULLY IMPLEMENTED)
    networkBased: async (joins, guildId) => {
      // Track IP addresses from invite clicks and correlate with joins
      const db = require("./database");

      // Get IP addresses for recent joins by checking invite tracking
      const joinUserIds = joins.map((j) => j.userId || j.id);
      const ipClusters = new Map(); // IP -> [userIds]

      // Check pending invite sources for IP addresses
      for (const userId of joinUserIds) {
        try {
          const ipData = await new Promise((resolve, reject) => {
            db.db.all(
              `SELECT ip_address FROM pending_invite_sources 
               WHERE user_id = ? AND timestamp > ? 
               ORDER BY timestamp DESC LIMIT 1`,
              [userId, Date.now() - 24 * 60 * 60 * 1000], // Last 24 hours
              (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
              }
            );
          });

          if (ipData.length > 0 && ipData[0].ip_address) {
            const ip = ipData[0].ip_address;
            if (!ipClusters.has(ip)) {
              ipClusters.set(ip, []);
            }
            ipClusters.get(ip).push(userId);
          }
        } catch (error) {
          // Continue if IP lookup fails
        }
      }

      // Also check ip_logs table for recent activity
      try {
        const recentIPs = await new Promise((resolve, reject) => {
          db.db.all(
            `SELECT DISTINCT ip_address, discord_user_id 
             FROM ip_logs 
             WHERE discord_user_id IN (${joinUserIds.map(() => "?").join(",")}) 
             AND timestamp > ?`,
            [...joinUserIds, Date.now() - 24 * 60 * 60 * 1000],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        });

        recentIPs.forEach((row) => {
          if (row.ip_address && row.discord_user_id) {
            if (!ipClusters.has(row.ip_address)) {
              ipClusters.set(row.ip_address, []);
            }
            if (!ipClusters.get(row.ip_address).includes(row.discord_user_id)) {
              ipClusters.get(row.ip_address).push(row.discord_user_id);
            }
          }
        });
      } catch (error) {
        // Continue if IP lookup fails
      }

      // Detect IP clusters: Multiple users from same IP = suspicious
      for (const [ip, userIds] of ipClusters) {
        if (userIds.length >= 3) {
          // 3+ users from same IP = likely bot farm
          return true;
        }
      }

      // Fallback: Use account creation patterns if IP data unavailable
      const creationTimes = joins.map((j) => j.createdTimestamp);
      const timeClusters = this.findClusters(creationTimes, 3600000); // 1 hour clusters
      if (timeClusters.length > 0 && timeClusters[0].length >= 3) return true;

      return false;
    },

    // Algorithm 5: Temporal Pattern Analysis (EXCEEDS WICK - time-based attack detection)
    temporalPattern: (joins) => {
      if (joins.length < 5) return false;

      const timestamps = joins.map((j) => j.timestamp).sort((a, b) => a - b);

      // Detect burst patterns (many joins in very short time)
      const burstWindows = [];
      for (let i = 0; i < timestamps.length - 1; i++) {
        const window = timestamps.slice(i, i + 5);
        if (window.length === 5) {
          const span = window[4] - window[0];
          if (span < 5000) {
            // 5 joins in < 5 seconds = burst pattern
            burstWindows.push(window);
          }
        }
      }
      if (burstWindows.length > 0) return true;

      // Detect wave patterns (coordinated waves of joins)
      const intervals = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push(timestamps[i] - timestamps[i - 1]);
      }
      const avgInterval =
        intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance =
        intervals.reduce(
          (sum, interval) => sum + Math.pow(interval - avgInterval, 2),
          0
        ) / intervals.length;

      // Low variance = consistent timing = coordinated wave attack
      if (variance < 1000000 && intervals.length >= 5) return true; // < 1 second variance

      return false;
    },

    // Algorithm 6: Graph-Based Network Analysis (EXCEEDS WICK - detect attack networks)
    graphBased: (joins) => {
      if (joins.length < 7) return false;

      // Build similarity graph
      const similarities = [];
      for (let i = 0; i < joins.length; i++) {
        for (let j = i + 1; j < joins.length; j++) {
          const similarity = this.calculateUserSimilarity(joins[i], joins[j]);
          if (similarity > 0.6) {
            similarities.push({ i, j, similarity });
          }
        }
      }

      // Find connected components (clusters of similar accounts)
      const visited = new Set();
      const components = [];

      for (let i = 0; i < joins.length; i++) {
        if (visited.has(i)) continue;

        const component = [];
        const queue = [i];
        visited.add(i);

        while (queue.length > 0) {
          const current = queue.shift();
          component.push(current);

          similarities.forEach(({ i: idx1, j: idx2 }) => {
            if (idx1 === current && !visited.has(idx2)) {
              visited.add(idx2);
              queue.push(idx2);
            } else if (idx2 === current && !visited.has(idx1)) {
              visited.add(idx1);
              queue.push(idx1);
            }
          });
        }

        if (component.length >= 3) {
          components.push(component);
        }
      }

      // Multiple large components = attack network
      if (components.length >= 2 && components.some((c) => c.length >= 4))
        return true;

      return false;
    },
  };

  // Calculate similarity between two users (for graph analysis)
  static calculateUserSimilarity(user1, user2) {
    let similarity = 0;
    let factors = 0;

    // Account age similarity
    const ageDiff = Math.abs(user1.accountAge - user2.accountAge);
    const maxAge = Math.max(user1.accountAge, user2.accountAge);
    if (maxAge > 0) {
      similarity += 1 - ageDiff / maxAge;
      factors++;
    }

    // Username similarity
    const usernameSim = this.stringSimilarity(user1.username, user2.username);
    similarity += usernameSim;
    factors++;

    // Avatar similarity
    if (user1.hasAvatar === user2.hasAvatar) {
      similarity += 1;
      factors++;
    }

    // Discriminator similarity (if close, might be sequential)
    const disc1 = parseInt(user1.discriminator) || 0;
    const disc2 = parseInt(user2.discriminator) || 0;
    if (Math.abs(disc1 - disc2) < 100) {
      similarity += 0.5;
      factors++;
    }

    return factors > 0 ? similarity / factors : 0;
  }

  // String similarity (Levenshtein-based)
  static stringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  static levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }

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
      networkBased: await this.detectionAlgorithms.networkBased(
        joinData.joins,
        guild.id
      ),
      temporalPattern: this.detectionAlgorithms.temporalPattern(joinData.joins),
      graphBased: this.detectionAlgorithms.graphBased(joinData.joins),
    };

    // Calculate threat score (0-100) - adjusted by server size + sensitivity
    // Adjust minimum joins based on combined multiplier
    const baseMinJoins = 5;
    const minJoinsForThreatScore = Math.ceil(baseMinJoins * finalMultiplier);

    let threatScore = 0;
    if (joinData.joins.length >= minJoinsForThreatScore) {
      // Adjust threat score contributions based on sensitivity
      const baseRateScore = 25;
      const basePatternScore = 20;
      const baseBehavioralScore = 15;
      const baseNetworkScore = 10;
      const baseTemporalScore = 15;
      const baseGraphScore = 15;

      if (results.rateBased)
        threatScore += Math.ceil(baseRateScore / sensitivityMultiplier);
      if (results.patternBased)
        threatScore += Math.ceil(basePatternScore / sensitivityMultiplier);
      if (results.behavioral)
        threatScore += Math.ceil(baseBehavioralScore / sensitivityMultiplier);
      if (results.networkBased)
        threatScore += Math.ceil(baseNetworkScore / sensitivityMultiplier);
      if (results.temporalPattern)
        threatScore += Math.ceil(baseTemporalScore / sensitivityMultiplier);
      if (results.graphBased)
        threatScore += Math.ceil(baseGraphScore / sensitivityMultiplier);
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
      (results.temporalPattern && joinData.joins.length >= minJoinsForRaid) || // Temporal pattern detection
      (results.graphBased && joinData.joins.length >= networkMinJoins) || // Graph-based network detection
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
