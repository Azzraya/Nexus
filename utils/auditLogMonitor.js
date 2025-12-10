// Real-Time Audit Log Monitoring System
// EXCEEDS WICK - Continuous monitoring of audit logs for suspicious patterns
const { AuditLogEvent } = require("discord.js");
const db = require("./database");
const logger = require("./logger");
const ErrorHandler = require("./errorHandler");

class AuditLogMonitor {
  constructor(client) {
    this.client = client;
    this.monitoringGuilds = new Map(); // guildId -> {interval, lastCheck, consecutiveErrors}
    this.suspiciousPatterns = new Map(); // guildId -> Map<userId, patternData>
    this.permissionTestCache = new Map(); // userId-guildId -> {changes: [], timestamps: []}
    this.coordinatedAttackCache = new Map(); // guildId -> {users: Set, actions: [], window}
    this.checkInterval = 900000; // Check every 15 minutes (optimized to prevent rate limiting)
    this.patternWindow = 60000; // 1 minute window for pattern detection
    this.maxConsecutiveErrors = 5; // Stop monitoring after 5 consecutive errors
  }

  // Start monitoring a guild's audit logs
  startMonitoring(guild) {
    if (this.monitoringGuilds.has(guild.id)) {
      return; // Already monitoring
    }

    // Verify guild exists and bot is still in it
    if (!guild || !this.client.guilds.cache.has(guild.id)) {
      logger.debug(
        "AuditLogMonitor",
        `Cannot start monitoring - guild ${guild?.id || "unknown"} not accessible`
      );
      return;
    }

    // Use debug level to avoid console spam - summary is logged in ready.js
    logger.debug(
      "AuditLogMonitor",
      `Starting audit log monitoring for ${guild.name} (${guild.id})`
    );

    const interval = setInterval(async () => {
      try {
        // Verify guild still exists before each check
        if (!this.client.guilds.cache.has(guild.id)) {
          logger.debug(
            "AuditLogMonitor",
            `Guild ${guild.id} no longer accessible during interval, stopping`
          );
          this.stopMonitoring(guild.id);
          return;
        }
        await this.analyzeAuditLogs(guild);
      } catch (error) {
        logger.error("AuditLogMonitor", "Error analyzing audit logs", {
          message: error?.message || String(error),
          stack: error?.stack,
          name: error?.name,
          guildId: guild.id,
        });
      }
    }, this.checkInterval);

    this.monitoringGuilds.set(guild.id, {
      interval,
      lastCheck: Date.now(),
      consecutiveErrors: 0,
      guild: guild, // Store guild reference for cleanup
    });
  }

  // Clean up monitoring for guilds that no longer exist
  cleanupStaleGuilds() {
    for (const [guildId, monitoring] of this.monitoringGuilds.entries()) {
      if (!this.client.guilds.cache.has(guildId)) {
        logger.debug(
          "AuditLogMonitor",
          `Cleaning up stale monitoring for guild ${guildId}`
        );
        this.stopMonitoring(guildId);
      }
    }
  }

  // Stop monitoring a guild
  stopMonitoring(guildId) {
    const monitoring = this.monitoringGuilds.get(guildId);
    if (monitoring) {
      clearInterval(monitoring.interval);
      this.monitoringGuilds.delete(guildId);
      logger.info("AuditLogMonitor", `Stopped monitoring guild ${guildId}`);
    }
  }

  // Analyze audit logs for suspicious patterns
  async analyzeAuditLogs(guild) {
    try {
      // Verify guild still exists and bot is still in it
      if (!guild || !this.client.guilds.cache.has(guild.id)) {
        logger.debug(
          "AuditLogMonitor",
          `Guild ${guild?.id || "unknown"} no longer accessible, stopping monitoring`
        );
        this.stopMonitoring(guild?.id);
        return;
      }

      // Fetch audit logs with retry logic for socket errors
      const auditLogs = await this.fetchAuditLogsWithRetry(guild);
      if (!auditLogs) return; // Skip this cycle if fetch failed

      const recentLogs = Array.from(auditLogs.entries.values()).filter(
        (entry) => Date.now() - entry.createdTimestamp < this.patternWindow
      );

      // Pattern 1: Permission Testing Detection (Slow Nuke)
      await this.detectPermissionTesting(guild, recentLogs);

      // Pattern 2: Coordinated Multi-User Attacks
      await this.detectCoordinatedAttacks(guild, recentLogs);

      // Pattern 3: Rapid Escalation Pattern
      await this.detectRapidEscalation(guild, recentLogs);

      // Pattern 4: Unusual Action Sequences
      await this.detectUnusualSequences(guild, recentLogs);

      // Pattern 5: Cross-User Permission Changes
      await this.detectCrossUserPermissionChanges(guild, recentLogs);

      // Update last check time and reset error counter on success
      const monitoring = this.monitoringGuilds.get(guild.id);
      if (monitoring) {
        monitoring.lastCheck = Date.now();
        monitoring.consecutiveErrors = 0; // Reset error counter on success
      }
    } catch (error) {
      const monitoring = this.monitoringGuilds.get(guild.id);
      if (!monitoring) return; // Already stopped

      // Increment error counter
      monitoring.consecutiveErrors = (monitoring.consecutiveErrors || 0) + 1;

      // Handle "Unknown Guild" error - stop immediately
      const isUnknownGuild =
        error.code === 10004 ||
        error.httpStatus === 404 ||
        error.message?.includes("Unknown Guild") ||
        error.message?.includes("guild not found");

      if (isUnknownGuild) {
        logger.debug(
          "AuditLogMonitor",
          `Guild ${guild.id} is unknown/left, stopping monitoring immediately`
        );
        this.stopMonitoring(guild.id);
        return;
      }

      // Handle permission errors - only stop after multiple consecutive failures
      const isPermissionError =
        error.code === 50013 ||
        error.code === 403 ||
        error.message?.includes("Missing Access") ||
        error.message?.includes("Missing Permissions");

      if (isPermissionError) {
        logger.debug(
          "AuditLogMonitor",
          `Permission error for ${guild.name || guild.id} (${guild.id}): ${error.message || error.code} (${monitoring.consecutiveErrors}/${this.maxConsecutiveErrors})`
        );

        // Only stop after multiple consecutive permission errors
        if (monitoring.consecutiveErrors >= this.maxConsecutiveErrors) {
          logger.warn(
            "AuditLogMonitor",
            `Stopped monitoring ${guild.name || guild.id} (${guild.id}) after ${monitoring.consecutiveErrors} consecutive permission errors`
          );
          this.stopMonitoring(guild.id);
        }
        // Otherwise, just skip this cycle and try again next time
        return;
      }

      // Handle connection timeout errors - suppress logging to avoid spam
      const isTimeoutError =
        error.name === "ConnectTimeoutError" ||
        error.name === "TimeoutError" ||
        error.message?.includes("Connect Timeout") ||
        error.message?.includes("timeout") ||
        error.message?.includes("ETIMEDOUT") ||
        error.code === "ETIMEDOUT";

      if (isTimeoutError) {
        // Only log at debug level for timeouts, and stop monitoring after many consecutive timeouts
        if (monitoring.consecutiveErrors >= this.maxConsecutiveErrors * 3) {
          logger.debug(
            "AuditLogMonitor",
            `Stopped monitoring ${guild.name || guild.id} (${guild.id}) after ${monitoring.consecutiveErrors} consecutive connection timeouts`
          );
          this.stopMonitoring(guild.id);
        }
        // Otherwise, silently skip this cycle
        return;
      }

      // For other errors, log but don't stop immediately
      logger.error("AuditLogMonitor", "Error analyzing audit logs", {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
        guildId: guild.id,
        guildName: guild.name,
        consecutiveErrors: monitoring.consecutiveErrors,
      });

      // Only stop after many consecutive errors (not just permission errors)
      if (monitoring.consecutiveErrors >= this.maxConsecutiveErrors * 2) {
        logger.warn(
          "AuditLogMonitor",
          `Stopped monitoring ${guild.name} (${guild.id}) after ${monitoring.consecutiveErrors} consecutive errors`
        );
        this.stopMonitoring(guild.id);
      }
    }
  }

  // Fetch audit logs with retry logic for network errors
  async fetchAuditLogsWithRetry(guild, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Verify guild still exists before attempting to fetch
        if (!this.client.guilds.cache.has(guild.id)) {
          logger.debug(
            "AuditLogMonitor",
            `Guild ${guild.id} no longer in cache, stopping monitoring`
          );
          this.stopMonitoring(guild.id);
          return null;
        }

        // Only fetch specific audit log types we need for security monitoring
        // Using AuditLogEvent enum to ensure proper type conversion
        const auditLogs = await guild.fetchAuditLogs({
          limit: 50, // Reduced from 100
          type: [
            AuditLogEvent.ChannelCreate,
            AuditLogEvent.ChannelUpdate,
            AuditLogEvent.ChannelDelete,
            AuditLogEvent.MemberKick,
            AuditLogEvent.MemberBanAdd,
            AuditLogEvent.MemberBanRemove,
            AuditLogEvent.MemberUpdate,
            AuditLogEvent.MemberRoleUpdate,
            AuditLogEvent.MemberMove,
            AuditLogEvent.MemberDisconnect,
            AuditLogEvent.BotAdd,
            AuditLogEvent.RoleCreate,
            AuditLogEvent.RoleUpdate,
            AuditLogEvent.RoleDelete,
            AuditLogEvent.InviteCreate,
            AuditLogEvent.InviteUpdate,
            AuditLogEvent.InviteDelete,
            AuditLogEvent.WebhookCreate,
            AuditLogEvent.WebhookUpdate,
            AuditLogEvent.WebhookDelete,
            AuditLogEvent.MessageDelete,
          ],
        });
        return auditLogs;
      } catch (error) {
        lastError = error;

        // Handle "Unknown Guild" error - stop immediately, no retry
        const isUnknownGuild =
          error.code === 10004 ||
          error.httpStatus === 404 ||
          error.message?.includes("Unknown Guild") ||
          error.message?.includes("guild not found");

        if (isUnknownGuild) {
          logger.debug(
            "AuditLogMonitor",
            `Guild ${guild.id} is unknown/left, stopping monitoring`
          );
          this.stopMonitoring(guild.id);
          return null;
        }

        // Handle connection timeout errors (suppress logging to avoid spam)
        const isTimeoutError =
          error.name === "ConnectTimeoutError" ||
          error.name === "TimeoutError" ||
          error.message?.includes("Connect Timeout") ||
          error.message?.includes("timeout") ||
          error.message?.includes("ETIMEDOUT") ||
          error.code === "ETIMEDOUT";

        // Handle socket/network errors with retry
        const isSocketError =
          error.name === "SocketError" ||
          error.message?.includes("socket") ||
          error.message?.includes("ECONNRESET") ||
          error.message?.includes("other side closed") ||
          error.code === "ECONNRESET";

        // Handle rate limit errors
        const isRateLimit = error.code === 429 || error.httpStatus === 429;

        if (isTimeoutError || isSocketError || isRateLimit) {
          if (attempt < maxRetries) {
            // Exponential backoff: 1s, 2s, 4s
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            // Only log at debug level for timeouts to avoid spam
            if (isTimeoutError) {
              logger.debug(
                "AuditLogMonitor",
                `Connection timeout for ${guild.name || guild.id}, retry ${attempt}/${maxRetries} after ${delay}ms`
              );
            } else {
              logger.debug(
                "AuditLogMonitor",
                `Retry ${attempt}/${maxRetries} for ${guild.name || guild.id} after ${delay}ms (${error.name || error.message})`
              );
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          } else {
            // Max retries reached, silently skip for timeouts
            if (isTimeoutError) {
              logger.debug(
                "AuditLogMonitor",
                `Max retries reached for ${guild.name || guild.id} due to connection timeouts, skipping this cycle`
              );
            } else {
              logger.debug(
                "AuditLogMonitor",
                `Max retries reached for ${guild.name || guild.id}, skipping this cycle`
              );
            }
            return null;
          }
        }

        // For other errors, throw immediately
        throw error;
      }
    }

    return null;
  }

  // Detect permission testing (slow nuke preparation)
  async detectPermissionTesting(guild, logs) {
    const permissionChanges = logs.filter(
      (entry) =>
        entry.actionType === "MEMBER_ROLE_UPDATE" ||
        entry.actionType === "CHANNEL_UPDATE" ||
        entry.actionType === "ROLE_UPDATE"
    );

    for (const entry of permissionChanges) {
      const userId = entry.executor.id;
      const key = `${userId}-${guild.id}`;

      if (!this.permissionTestCache.has(key)) {
        this.permissionTestCache.set(key, {
          changes: [],
          timestamps: [],
          firstChange: Date.now(),
        });
      }

      const cache = this.permissionTestCache.get(key);
      cache.changes.push({
        type: entry.actionType,
        target: entry.target?.id || entry.targetId,
        timestamp: entry.createdTimestamp,
      });
      cache.timestamps.push(entry.createdTimestamp);

      // Clean old entries (outside pattern window)
      const cutoff = Date.now() - this.patternWindow;
      cache.changes = cache.changes.filter((c) => c.timestamp > cutoff);
      cache.timestamps = cache.timestamps.filter((t) => t > cutoff);

      // Detect pattern: Multiple permission changes in short time = testing
      if (cache.changes.length >= 3) {
        const timeSpan =
          Math.max(...cache.timestamps) - Math.min(...cache.timestamps);
        if (timeSpan < 30000) {
          // 3+ changes in 30 seconds = suspicious
          await this.handleSuspiciousPattern(
            guild,
            userId,
            "permission_testing",
            {
              changes: cache.changes.length,
              timeSpan,
              confidence: Math.min(90, 50 + cache.changes.length * 10),
            }
          );
        }
      }
    }
  }

  // Detect coordinated attacks from multiple users
  async detectCoordinatedAttacks(guild, logs) {
    const attackActions = logs.filter(
      (entry) =>
        entry.actionType === "MEMBER_BAN_ADD" ||
        entry.actionType === "MEMBER_KICK" ||
        entry.actionType === "CHANNEL_DELETE" ||
        entry.actionType === "ROLE_DELETE"
    );

    if (attackActions.length < 3) return;

    const users = new Set(attackActions.map((e) => e.executor.id));
    if (users.size < 2) return; // Need multiple users

    const timeSpan =
      Math.max(...attackActions.map((e) => e.createdTimestamp)) -
      Math.min(...attackActions.map((e) => e.createdTimestamp));

    if (timeSpan < 60000) {
      // Multiple users, multiple attacks in 1 minute = coordinated
      await this.handleSuspiciousPattern(
        guild,
        Array.from(users).join(","),
        "coordinated_attack",
        {
          userCount: users.size,
          actionCount: attackActions.length,
          timeSpan,
          confidence: Math.min(
            95,
            60 + users.size * 10 + attackActions.length * 5
          ),
        }
      );
    }
  }

  // Detect rapid escalation (testing -> small attack -> full attack)
  async detectRapidEscalation(guild, logs) {
    const actionTypes = logs.map((e) => e.actionType);
    const executors = new Map();

    logs.forEach((entry) => {
      // Skip entries without executor (system actions, deleted users)
      if (!entry.executor || !entry.executor.id) {
        return;
      }

      const userId = entry.executor.id;
      if (!executors.has(userId)) {
        executors.set(userId, []);
      }
      executors.get(userId).push({
        type: entry.actionType,
        timestamp: entry.createdTimestamp,
      });
    });

    for (const [userId, actions] of executors) {
      if (actions.length < 3) continue;

      // Check for escalation pattern: permission change -> small action -> big action
      const hasPermissionChange = actions.some(
        (a) =>
          a.type === "MEMBER_ROLE_UPDATE" ||
          a.type === "CHANNEL_UPDATE" ||
          a.type === "ROLE_UPDATE"
      );
      const hasSmallAction = actions.some(
        (a) => a.type === "MEMBER_KICK" || a.type === "CHANNEL_CREATE"
      );
      const hasBigAction = actions.some(
        (a) =>
          a.type === "MEMBER_BAN_ADD" ||
          a.type === "CHANNEL_DELETE" ||
          a.type === "ROLE_DELETE"
      );

      if (hasPermissionChange && hasSmallAction && hasBigAction) {
        const timeSpan =
          Math.max(...actions.map((a) => a.timestamp)) -
          Math.min(...actions.map((a) => a.timestamp));
        if (timeSpan < 120000) {
          // 2 minutes = rapid escalation
          await this.handleSuspiciousPattern(
            guild,
            userId,
            "rapid_escalation",
            {
              actionCount: actions.length,
              timeSpan,
              confidence: 85,
            }
          );
        }
      }
    }
  }

  // Detect unusual action sequences
  async detectUnusualSequences(guild, logs) {
    const sequences = new Map();

    logs.forEach((entry) => {
      const userId = entry.executor.id;
      if (!sequences.has(userId)) {
        sequences.set(userId, []);
      }
      sequences.get(userId).push(entry.actionType);
    });

    for (const [userId, sequence] of sequences) {
      // Unusual pattern: Create then immediately delete
      const createDeletePattern = sequence.some((action, i) => {
        if (i === 0) return false;
        const prev = sequence[i - 1];
        return (
          (prev.includes("CREATE") && action.includes("DELETE")) ||
          (prev.includes("UPDATE") && action.includes("DELETE"))
        );
      });

      if (createDeletePattern) {
        await this.handleSuspiciousPattern(guild, userId, "unusual_sequence", {
          sequence: sequence.slice(-5).join(" -> "),
          confidence: 70,
        });
      }
    }
  }

  // Detect cross-user permission changes (suspicious delegation)
  async detectCrossUserPermissionChanges(guild, logs) {
    const roleUpdates = logs.filter(
      (e) => e.actionType === "MEMBER_ROLE_UPDATE"
    );

    for (const entry of roleUpdates) {
      const executor = entry.executor.id;
      const target = entry.target?.id;

      if (target && executor !== target) {
        // User A giving permissions to User B = potential attack preparation
        const key = `${executor}-${target}-${guild.id}`;
        if (!this.suspiciousPatterns.has(guild.id)) {
          this.suspiciousPatterns.set(guild.id, new Map());
        }

        const guildPatterns = this.suspiciousPatterns.get(guild.id);
        if (!guildPatterns.has(key)) {
          guildPatterns.set(key, {
            count: 0,
            firstSeen: Date.now(),
          });
        }

        const pattern = guildPatterns.get(key);
        pattern.count++;

        if (pattern.count >= 2) {
          // Multiple cross-user permission changes = suspicious
          await this.handleSuspiciousPattern(
            guild,
            executor,
            "cross_user_permission_change",
            {
              targetUserId: target,
              changeCount: pattern.count,
              confidence: Math.min(80, 50 + pattern.count * 10),
            }
          );
        }
      }
    }
  }

  // Handle detected suspicious pattern
  async handleSuspiciousPattern(guild, userId, patternType, details) {
    const config = await db.getServerConfig(guild.id);
    if (!config || !config.anti_nuke_enabled) return;

    // Check whitelist
    const isWhitelisted = await db.isWhitelisted(guild.id, userId);
    if (isWhitelisted) return;

    const threatScore = details.confidence || 70;

    // Log security event
    await db.logSecurityEvent(
      guild.id,
      "audit_log_pattern",
      userId,
      JSON.stringify({
        patternType,
        ...details,
      }),
      threatScore,
      patternType
    );

    // High confidence = immediate action
    if (threatScore >= 80) {
      try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member && member.bannable) {
          await member.ban({
            reason: `[Nexus] Detected ${patternType} pattern in audit logs`,
            deleteMessageDays: 0,
          });

          logger.warn(
            "AuditLogMonitor",
            `Banned ${userId} in ${guild.name} for ${patternType}`
          );
        }
      } catch (error) {
        logger.error("AuditLogMonitor", "Failed to ban user", {
          message: error?.message || String(error),
          stack: error?.stack,
          guildId: guild.id,
          userId,
        });
      }
    } else if (threatScore >= 60) {
      // Medium confidence = alert admins
      const modChannel = config.mod_log_channel
        ? guild.channels.cache.get(config.mod_log_channel)
        : null;

      if (modChannel) {
        const { EmbedBuilder } = require("discord.js");
        const embed = new EmbedBuilder()
          .setTitle("⚠️ Suspicious Pattern Detected")
          .setDescription(
            `User <@${userId}> detected performing suspicious actions`
          )
          .addFields(
            { name: "Pattern Type", value: patternType, inline: true },
            { name: "Threat Score", value: `${threatScore}%`, inline: true },
            {
              name: "Details",
              value: JSON.stringify(details, null, 2).substring(0, 1024),
              inline: false,
            }
          )
          .setColor(0xffa500)
          .setTimestamp();

        modChannel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }
}

module.exports = AuditLogMonitor;
