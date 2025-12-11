// Event-Based Action Tracking System
// Replaces audit log monitor - tracks actions from Discord events instead of polling
// EXCEEDS WICK - Real-time tracking without rate limit issues
const logger = require("./logger");

class EventActionTracker {
  constructor(client) {
    this.client = client;
    // In-memory cache: guildId -> [{action, userId, timestamp, details}]
    this.actionCache = new Map();
    this.patternWindow = 60000; // 1 minute window for pattern detection
    this.maxCacheSize = 1000; // Max actions per guild
    this.suspiciousPatterns = new Map(); // guildId -> Map<userId, patternData>
    this.permissionTestCache = new Map(); // userId-guildId -> {changes: [], timestamps: []}
    this.coordinatedAttackCache = new Map(); // guildId -> {users: Set, actions: [], window}
  }

  // Track an action from an event
  trackAction(guildId, actionType, userId, details = {}) {
    if (!this.actionCache.has(guildId)) {
      this.actionCache.set(guildId, []);
    }

    const actions = this.actionCache.get(guildId);
    const action = {
      actionType,
      userId,
      timestamp: Date.now(),
      details,
    };

    actions.push(action);

    // Limit cache size (keep most recent)
    if (actions.length > this.maxCacheSize) {
      actions.shift(); // Remove oldest
    }

    // Clean up old actions (older than pattern window)
    const cutoff = Date.now() - this.patternWindow * 2; // Keep 2x window for analysis
    while (actions.length > 0 && actions[0].timestamp < cutoff) {
      actions.shift();
    }

    // Run pattern detection on recent actions
    this.detectPatterns(guildId, actions).catch((err) => {
      logger.debug(
        "EventActionTracker",
        `Pattern detection error: ${err.message}`
      );
    });
  }

  // Get recent actions for a guild
  getRecentActions(guildId, windowMs = this.patternWindow) {
    const actions = this.actionCache.get(guildId) || [];
    const cutoff = Date.now() - windowMs;
    return actions.filter((a) => a.timestamp >= cutoff);
  }

  // Detect suspicious patterns (same logic as audit log monitor, but using cached events)
  async detectPatterns(guildId, actions) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;

    const recentActions = this.getRecentActions(guildId);

    // Pattern 1: Permission Testing Detection
    await this.detectPermissionTesting(guild, recentActions);

    // Pattern 2: Coordinated Multi-User Attacks
    await this.detectCoordinatedAttacks(guild, recentActions);

    // Pattern 3: Rapid Escalation Pattern
    await this.detectRapidEscalation(guild, recentActions);

    // Pattern 4: Unusual Action Sequences
    await this.detectUnusualSequences(guild, recentActions);

    // Pattern 5: Cross-User Permission Changes
    await this.detectCrossUserPermissionChanges(guild, recentActions);
  }

  // Detect permission testing (slow nuke preparation)
  async detectPermissionTesting(guild, actions) {
    const permissionChanges = actions.filter(
      (a) =>
        a.actionType === "MEMBER_ROLE_UPDATE" ||
        a.actionType === "CHANNEL_UPDATE" ||
        a.actionType === "ROLE_UPDATE"
    );

    for (const action of permissionChanges) {
      const userId = action.userId;
      const key = `${userId}-${guild.id}`;

      if (!this.permissionTestCache.has(key)) {
        this.permissionTestCache.set(key, {
          changes: [],
          timestamps: [],
          firstChange: Date.now(),
        });
      }

      const cache = this.permissionTestCache.get(key);
      cache.changes.push(action.actionType);
      cache.timestamps.push(action.timestamp);

      // Clean old entries
      const cutoff = Date.now() - 300000; // 5 minutes
      cache.timestamps = cache.timestamps.filter((t) => t >= cutoff);
      cache.changes = cache.changes.slice(-cache.timestamps.length);

      // Detect pattern: Many permission changes in short time
      if (cache.changes.length >= 5 && cache.timestamps.length >= 5) {
        const timeSpan =
          Math.max(...cache.timestamps) - Math.min(...cache.timestamps);
        if (timeSpan < 300000) {
          // 5+ changes in 5 minutes = permission testing
          await this.handleSuspiciousPattern(
            guild,
            userId,
            "permission_testing",
            {
              changeCount: cache.changes.length,
              timeSpan,
              confidence: Math.min(90, 50 + cache.changes.length * 5),
            }
          );
        }
      }
    }
  }

  // Detect coordinated multi-user attacks
  async detectCoordinatedAttacks(guild, actions) {
    const attackActions = actions.filter(
      (a) =>
        a.actionType === "MEMBER_BAN_ADD" ||
        a.actionType === "MEMBER_KICK" ||
        a.actionType === "CHANNEL_DELETE" ||
        a.actionType === "ROLE_DELETE"
    );

    if (attackActions.length < 3) return;

    const users = new Set(attackActions.map((a) => a.userId));
    if (users.size < 2) return; // Need multiple users

    const timeSpan =
      Math.max(...attackActions.map((a) => a.timestamp)) -
      Math.min(...attackActions.map((a) => a.timestamp));

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

  // Detect rapid escalation
  async detectRapidEscalation(guild, actions) {
    const executors = new Map();

    actions.forEach((action) => {
      const userId = action.userId;
      if (!executors.has(userId)) {
        executors.set(userId, []);
      }
      executors.get(userId).push({
        type: action.actionType,
        timestamp: action.timestamp,
      });
    });

    for (const [userId, userActions] of executors) {
      if (userActions.length < 3) continue;

      // Check for escalation pattern: permission change -> small action -> big action
      const hasPermissionChange = userActions.some(
        (a) =>
          a.type === "MEMBER_ROLE_UPDATE" ||
          a.type === "CHANNEL_UPDATE" ||
          a.type === "ROLE_UPDATE"
      );
      const hasSmallAction = userActions.some(
        (a) => a.type === "MEMBER_KICK" || a.type === "CHANNEL_CREATE"
      );
      const hasBigAction = userActions.some(
        (a) =>
          a.type === "MEMBER_BAN_ADD" ||
          a.type === "CHANNEL_DELETE" ||
          a.type === "ROLE_DELETE"
      );

      if (hasPermissionChange && hasSmallAction && hasBigAction) {
        const timeSpan =
          Math.max(...userActions.map((a) => a.timestamp)) -
          Math.min(...userActions.map((a) => a.timestamp));
        if (timeSpan < 120000) {
          // 2 minutes = rapid escalation
          await this.handleSuspiciousPattern(
            guild,
            userId,
            "rapid_escalation",
            {
              actionCount: userActions.length,
              timeSpan,
              confidence: 85,
            }
          );
        }
      }
    }
  }

  // Detect unusual action sequences
  async detectUnusualSequences(guild, actions) {
    const sequences = new Map();

    actions.forEach((action) => {
      const userId = action.userId;
      if (!sequences.has(userId)) {
        sequences.set(userId, []);
      }
      sequences.get(userId).push(action.actionType);
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

  // Detect cross-user permission changes
  async detectCrossUserPermissionChanges(guild, actions) {
    const roleUpdates = actions.filter(
      (a) => a.actionType === "MEMBER_ROLE_UPDATE"
    );

    for (const action of roleUpdates) {
      const executor = action.userId;
      const target = action.details?.targetUserId;

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
            executor,
            target,
          });
        }

        const pattern = guildPatterns.get(key);
        pattern.count++;

        if (pattern.count >= 3) {
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

  // Handle suspicious pattern detection
  async handleSuspiciousPattern(guild, userId, patternType, data) {
    const patternKey = `${guild.id}-${userId}-${patternType}`;

    // Prevent duplicate alerts
    if (this.suspiciousPatterns.has(guild.id)) {
      const guildPatterns = this.suspiciousPatterns.get(guild.id);
      if (guildPatterns.has(patternKey)) {
        const existing = guildPatterns.get(patternKey);
        // Only alert if pattern is new or confidence increased significantly
        if (
          Date.now() - existing.lastAlert < 300000 &&
          data.confidence <= existing.confidence
        ) {
          return; // Already alerted recently
        }
      }
    }

    logger.warn(
      "EventActionTracker",
      `🚨 Suspicious pattern detected: ${patternType} by ${userId} in ${guild.name} (${guild.id})`,
      data
    );

    // Store pattern
    if (!this.suspiciousPatterns.has(guild.id)) {
      this.suspiciousPatterns.set(guild.id, new Map());
    }
    this.suspiciousPatterns.get(guild.id).set(patternKey, {
      ...data,
      lastAlert: Date.now(),
      patternType,
    });

    // Notify anti-nuke system if available
    if (this.client.advancedAntiNuke) {
      // Convert pattern type to threat type
      const threatTypeMap = {
        permission_testing: "slow_nuke_prep",
        coordinated_attack: "coordinated_attack",
        rapid_escalation: "rapid_escalation",
        unusual_sequence: "suspicious_activity",
        cross_user_permission_change: "permission_abuse",
      };

      const threatType = threatTypeMap[patternType] || "suspicious_pattern";
      await this.client.advancedAntiNuke
        .monitorAction(guild, threatType, userId, {
          patternType,
          ...data,
        })
        .catch(() => {}); // Silent fail
    }
  }

  // Cleanup old data
  cleanup() {
    const cutoff = Date.now() - this.patternWindow * 2;
    for (const [guildId, actions] of this.actionCache.entries()) {
      const filtered = actions.filter((a) => a.timestamp >= cutoff);
      if (filtered.length === 0) {
        this.actionCache.delete(guildId);
      } else {
        this.actionCache.set(guildId, filtered);
      }
    }
  }
}

module.exports = EventActionTracker;
