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
      const result = recentJoins.length >= threshold;
      // Debug logging
      if (recentJoins.length > 0) {
        logger.debug(
          `[Anti-Raid] Rate-based check: ${recentJoins.length} joins in ${timeWindow}ms window, threshold: ${threshold}, triggered: ${result}`
        );
      }
      return result;
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

    // Use in-memory cache for rapid joins (avoids DB race conditions when 73 members join in 2 seconds)
    // Get or create cache entry for this guild
    if (!this.joinCache.has(guild.id)) {
      // Load from DB if cache doesn't exist
      const dbData = await this.getJoinHistory(guild.id);
      this.joinCache.set(guild.id, {
        joins: dbData.joins || [],
        lastCleanup: Date.now(),
      });
    }

    const cacheEntry = this.joinCache.get(guild.id);
    const joinData = { joins: [...cacheEntry.joins] }; // Copy to avoid mutations

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
    
    // Update cache immediately (synchronous, no DB delay)
    cacheEntry.joins = joinData.joins;

    // Log every join for debugging
    logger.info(
      `[Anti-Raid] Member joined ${guild.name}: ${member.user.tag} (${member.id}), total joins in history: ${joinData.joins.length}`
    );

    // Run all detection algorithms with server-size-aware thresholds
    // Use a more reasonable threshold - don't scale too aggressively
    const baseMaxJoins = config.anti_raid_max_joins || 5;
    const scaledMaxJoins = Math.max(
      3,
      Math.ceil(baseMaxJoins * Math.min(finalMultiplier, 2.0))
    ); // Cap multiplier at 2.0

    const timeWindow = config.anti_raid_time_window || 10000;
    const results = {
      rateBased: this.detectionAlgorithms.rateBased(
        joinData.joins,
        timeWindow,
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
    // Lowered base from 5 to 2 to be much more sensitive
    // For very small servers, use minimum of 2 joins
    const minJoinsForRaid = Math.max(2, Math.ceil(2 * finalMultiplier));

    // Debug logging
    logger.debug(
      `[Anti-Raid] Detection check for ${guild.name}: ${joinData.joins.length} joins, min required: ${minJoinsForRaid}, multiplier: ${finalMultiplier.toFixed(2)}, timeWindow: ${config.anti_raid_time_window || 10000}ms`
    );

    // Don't return early - let detection algorithms run even with fewer joins
    // They will handle their own minimum thresholds

    // Adjust thresholds based on server size + sensitivity
    // Larger servers = need more joins for pattern/behavioral detection
    const patternBehavioralMinJoins = Math.ceil(7 * finalMultiplier);
    const networkMinJoins = Math.ceil(10 * finalMultiplier);

    // Adjust threat score threshold (larger servers = higher threshold needed)
    // Lowered from 50 to 30 to be much more sensitive
    const threatScoreThreshold = Math.max(30, Math.ceil(30 * finalMultiplier));

    // More aggressive detection: Trigger on high join count OR rate-based detection
    // If we have a lot of joins in a short time, it's definitely a raid
    const totalJoins = joinData.joins.length;
    const recentJoinsCount = joinData.joins.filter(
      (j) => Date.now() - j.timestamp < timeWindow
    ).length;

    // Trigger if:
    // 1. Rate-based detection triggers (joins within time window exceed threshold)
    // 2. Total joins exceed a reasonable threshold (e.g., 5+ joins = likely raid)
    // 3. Recent joins (within time window) exceed threshold
    const isRaid =
      totalJoins >= 5 || // 5+ total joins = definitely a raid (lowered from 10)
      recentJoinsCount >= scaledMaxJoins || // Joins within time window exceed threshold
      (totalJoins >= 3 && results.rateBased) || // 3+ joins and rate-based triggers
      (results.rateBased && results.patternBased) || // Both rate and pattern
      (results.rateBased && results.behavioral) || // Rate + behavioral
      (results.patternBased &&
        results.behavioral &&
        totalJoins >= patternBehavioralMinJoins) || // Pattern + behavioral
      (results.networkBased && totalJoins >= networkMinJoins) || // Network needs many joins
      (results.temporalPattern && totalJoins >= minJoinsForRaid) || // Temporal pattern detection
      (results.graphBased && totalJoins >= networkMinJoins) || // Graph-based network detection
      (totalJoins >= 3 && threatScore >= threatScoreThreshold); // 3+ joins and high threat score

    // Debug logging for detection results
    logger.info(
      `[Anti-Raid] Detection check for ${guild.name}: totalJoins=${totalJoins}, recentJoins=${recentJoinsCount}, rateBased=${results.rateBased}, isRaid=${isRaid}`
    );

    if (isRaid) {
      logger.warn(
        `[Anti-Raid] RAID DETECTED in ${guild.name} with ${totalJoins} total joins!`
      );

      // Get ALL joins from the last 5 minutes (not just 2 minutes) to catch the raid
      const fiveMinutesAgo = Date.now() - 300000; // 5 minutes
      const recentJoins = joinData.joins.filter(
        (join) => join.timestamp && join.timestamp >= fiveMinutesAgo
      );

      // Handle raid IMMEDIATELY - no waiting, trigger right away
      // Use all recent joins, or if none recent but total is high, use all recent joins
      if (recentJoins.length > 0 || totalJoins >= 3) {
        // Use all recent joins, or if none recent but total is high, use all joins from last 5 minutes
        const joinsToBan =
          recentJoins.length > 0 ? recentJoins : joinData.joins.slice(-Math.min(totalJoins, 50)); // Use all joins if no recent, up to 50

        logger.warn(
          `[Anti-Raid] Handling raid: ${joinsToBan.length} members to ban in ${guild.name}`
        );

        // Clear cache and save to DB before handling raid
        await this.saveJoinHistory(guild.id, joinData);
        cacheEntry.lastCleanup = Date.now();
        
        await this.handleRaid(
          guild,
          joinsToBan,
          threatScore,
          results,
          finalMultiplier
        );
        
        // Clear cache after raid is handled
        this.joinCache.delete(guild.id);
        
        return true;
      } else {
        logger.warn(
          `[Anti-Raid] Raid detected but no recent joins to ban in ${guild.name} (total: ${totalJoins}, recent: ${recentJoins.length})`
        );
      }
    }

    // Clean old joins (older than time window + buffer to allow detection)
    // Keep joins for at least 2x the time window to allow for detection
    const cleanupWindow = Math.max(timeWindow * 2, 30000); // At least 30 seconds
    joinData.joins = joinData.joins.filter(
      (j) => Date.now() - j.timestamp < cleanupWindow
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

    // When a raid is confirmed, ban ALL recent joins (they're already filtered to recent in detectRaid)
    // Only apply additional filtering for very large servers to prevent false positives
    const isLargeServer = memberCount > 1000;

    // For large servers, still apply some suspicion filtering to prevent false positives
    // For smaller servers, if raid is detected, ban all recent joins
    let membersToBan = suspiciousJoins;

    if (isLargeServer && finalMultiplier > 1.5) {
      // Large server with low sensitivity - apply light suspicion filtering
      const baseSuspicionThreshold = 1; // Lowered from 3
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

        // If raid is confirmed and we have many joins, lower threshold
        if (suspiciousJoins.length >= 10) suspicionScore += 1; // Bonus point for confirmed raid

        return suspicionScore >= suspicionThreshold;
      });

      // Only use filtered list if we have results, otherwise use all
      if (highlySuspicious.length > 0) {
        membersToBan = highlySuspicious;
      } else if (suspiciousJoins.length >= 15) {
        // If we have 15+ joins in a raid, ban all even if they don't meet suspicion threshold
        membersToBan = suspiciousJoins;
        logger.warn(
          `Raid detected with ${suspiciousJoins.length} joins - banning all recent joins despite low suspicion scores in ${guild.name}`
        );
      } else {
        // Small raid on large server - be more cautious
        logger.warn(
          `Raid detected but no highly suspicious members to ban in ${guild.name} (${suspiciousJoins.length} joins, threshold: ${suspicionThreshold})`
        );
        // Still enable lockdown
        try {
          const indexModule = require("../index.js");
          if (indexModule.client?.antiRaid?.lockdown) {
            indexModule.client.antiRaid.lockdown.set(guild.id, {
              enabled: true,
              startedAt: Date.now(),
              reason: "Raid detected - lockdown enabled",
            });
          }
        } catch (error) {
          logger.warn("Could not set lockdown:", error.message);
        }
        return;
      }
    }

    // Double-check: Only ban members who joined RECENTLY (within last 2 minutes)
    // This prevents banning existing members
    const twoMinutesAgo = Date.now() - 120000;
    const recentSuspicious = membersToBan.filter(
      (join) => join.timestamp && join.timestamp >= twoMinutesAgo
    );

    if (recentSuspicious.length === 0) {
      logger.warn(
        `Raid detected but no recent suspicious joins to ban in ${guild.name}`
      );
      return;
    }

    // Check bot permissions before attempting any actions
    const botMember = await guild.members
      .fetch(guild.client.user.id)
      .catch(() => null);
    if (!botMember) {
      logger.error(
        `[Anti-Raid] Cannot fetch bot member in ${guild.name} - cannot take action`
      );
      return;
    }

    const hasBanPerms = botMember.permissions.has("BanMembers");
    const hasKickPerms = botMember.permissions.has("KickMembers");
    const hasManageRolesPerms = botMember.permissions.has("ManageRoles");

    if (action === "ban" && !hasBanPerms) {
      logger.error(
        `[Anti-Raid] Bot lacks BanMembers permission in ${guild.name} - cannot ban raiders`
      );
      return;
    }
    if (action === "kick" && !hasKickPerms) {
      logger.error(
        `[Anti-Raid] Bot lacks KickMembers permission in ${guild.name} - cannot kick raiders`
      );
      return;
    }
    if (action === "quarantine" && !hasManageRolesPerms) {
      logger.error(
        `[Anti-Raid] Bot lacks ManageRoles permission in ${guild.name} - cannot quarantine raiders`
      );
      return;
    }

    logger.info(
      `[Anti-Raid] Banning ${recentSuspicious.length} members from raid in ${guild.name} (${suspiciousJoins.length} total joins detected)`
    );

    let successCount = 0;
    let failedCount = 0;
    for (const join of recentSuspicious) {
      try {
        // Double-check: Only ban if they joined recently
        const member = await guild.members.fetch(join.id).catch(() => null);
        if (!member) {
          failedCount++;
          continue;
        }

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
          failedCount++;
          continue;
        }

        // Check role hierarchy - bot must be able to ban this member
        if (
          botMember.roles.highest.position <= member.roles.highest.position &&
          member.id !== guild.ownerId
        ) {
          logger.warn(
            `Cannot ban ${member.user.tag} - bot role hierarchy too low (bot: ${botMember.roles.highest.position}, member: ${member.roles.highest.position})`
          );
          failedCount++;
          continue;
        }

        if (action === "ban") {
          await member.ban({
            reason: `Anti-raid protection (Threat: ${threatScore}%)`,
            deleteMessageDays: 1,
          });
          logger.info(
            `[Anti-Raid] Banned ${member.user.tag} (${member.id}) from ${guild.name}`
          );
        } else if (action === "kick") {
          await member.kick("Anti-raid protection");
          logger.info(
            `[Anti-Raid] Kicked ${member.user.tag} (${member.id}) from ${guild.name}`
          );
        } else if (action === "quarantine") {
          // Add quarantine role if configured
          const quarantineRole = guild.roles.cache.find((r) =>
            r.name.toLowerCase().includes("quarantine")
          );
          if (quarantineRole) {
            await member.roles.add(quarantineRole);
            logger.info(
              `[Anti-Raid] Quarantined ${member.user.tag} (${member.id}) in ${guild.name}`
            );
          }
        }

        successCount++;

        // Log to database
        db.db.run(
          "INSERT INTO anti_raid_logs (guild_id, user_id, action_taken, timestamp) VALUES (?, ?, ?, ?)",
          [guild.id, join.id, action, Date.now()],
          (err) => {
            if (err) {
              logger.error(
                `[Anti-Raid] Failed to log ban to database: ${err.message}`
              );
            }
          }
        );
      } catch (error) {
        failedCount++;
        logger.error(
          `[Anti-Raid] Failed to ${action} ${join.id} in ${guild.name}: ${error.message}`
        );
        // Log specific error types
        if (error.code === 50013) {
          logger.error(
            `[Anti-Raid] Missing permissions to ${action} ${join.id}`
          );
        } else if (error.code === 50035) {
          logger.error(
            `[Anti-Raid] Invalid form body when attempting to ${action} ${join.id}`
          );
        }
      }
    }

    logger.info(
      `[Anti-Raid] Action complete in ${guild.name}: ${successCount} successful, ${failedCount} failed out of ${recentSuspicious.length} attempts`
    );

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
