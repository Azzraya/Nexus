// Real-Time Audit Log Monitoring System
// EXCEEDS WICK - Continuous monitoring of audit logs for suspicious patterns
const db = require("./database");
const logger = require("./logger");
const ErrorHandler = require("./errorHandler");

class AuditLogMonitor {
  constructor(client) {
    this.client = client;
    this.monitoringGuilds = new Map(); // guildId -> {interval, lastCheck}
    this.suspiciousPatterns = new Map(); // guildId -> Map<userId, patternData>
    this.permissionTestCache = new Map(); // userId-guildId -> {changes: [], timestamps: []}
    this.coordinatedAttackCache = new Map(); // guildId -> {users: Set, actions: [], window}
    this.checkInterval = 30000; // Check every 30 seconds
    this.patternWindow = 60000; // 1 minute window for pattern detection
  }

  // Start monitoring a guild's audit logs
  startMonitoring(guild) {
    if (this.monitoringGuilds.has(guild.id)) {
      return; // Already monitoring
    }

    logger.info(
      "AuditLogMonitor",
      `Starting audit log monitoring for ${guild.name} (${guild.id})`
    );

    const interval = setInterval(async () => {
      try {
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
    });
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
      const auditLogs = await guild.fetchAuditLogs({
        limit: 100,
        type: null, // Get all types
      });

      const recentLogs = Array.from(auditLogs.entries.values())
        .filter((entry) => Date.now() - entry.createdTimestamp < this.patternWindow);

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

      // Update last check time
      const monitoring = this.monitoringGuilds.get(guild.id);
      if (monitoring) {
        monitoring.lastCheck = Date.now();
      }
    } catch (error) {
      // Handle permission errors gracefully
      if (error.code === 50013 || error.code === 403) {
        logger.debug(
          "AuditLogMonitor",
          `No audit log access for ${guild.name}`
        );
        this.stopMonitoring(guild.id);
      } else {
        throw error;
      }
    }
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
