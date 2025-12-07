const db = require("./database");
const logger = require("./logger");
const ErrorHandler = require("./errorHandler");

class AdvancedAntiNuke {
  constructor(client) {
    this.client = client;
    this.monitoring = new Map(); // Track suspicious activity
    this.actionHistory = new Map(); // Track recent actions per user
    this.guildConfigCache = new Map(); // PERFORMANCE: Cache guild configs to avoid repeated fetches
    this.baseThresholds = {
      channelsDeleted: 2, // 2+ channels deleted in SHORT TIME = nuke (AGGRESSIVE)
      channelsCreated: 4, // 4+ channels created in 5 seconds = spam creation
      rolesDeleted: 2, // 2+ roles deleted in 5 seconds = potential threat
      rolesCreated: 3, // 3+ roles created in 5 seconds
      membersBanned: 3, // 3+ bans in 5 seconds
      membersKicked: 4, // 4+ kicks in 5 seconds
      webhooksCreated: 3, // 3+ webhooks in 5 seconds
      emojisDeleted: 3, // 3+ emojis deleted in 5 seconds
      emojisCreated: 6, // 6+ emojis created in 5 seconds (spam)
      voiceRaid: 10, // 10+ voice joins in 10 seconds
    };
    this.thresholds = { ...this.baseThresholds }; // Will be adapted per server
    this.rateLimitQueue = new Map(); // Rate limit protection (guildId -> queue)
    this.threatPriority = new Map(); // Track threat priority levels
    this.lockedGuilds = new Set(); // Track guilds in lockdown
    this.processedThreats = new Set(); // Prevent duplicate handling
    this.spamChannels = new Map(); // Track spam channels (channelId -> {creator, createdAt, messageCount})
    this.channelMessageCounts = new Map(); // Track messages per channel (channelId -> count)
    this.webhookSpam = new Map(); // Track webhook spam (webhookId -> {creator, createdAt, messageCount})
    this.emojiSpam = new Map(); // Track emoji spam per user (userId -> {count, lastMessage, guildId})
    this.voiceRaids = new Map(); // Track voice channel raids (guildId -> {joinCount, lastJoin, userIds})
    this.whitelistCache = new Map(); // Cache whitelisted users (guildId -> Set<userId>)
    this.predictiveThreats = new Map(); // Track predictive threat patterns (guildId -> Map<userId, {pattern, confidence, timestamp}>)
    this.permissionChanges = new Map(); // Track permission changes per user (userId-guildId -> {changes: [], firstChange, count})
    this.attackerCreatedChannels = new Map(); // Track channels created by attackers (userId-guildId -> Set<channelId>)
    this.attackerCreatedRoles = new Map(); // Track roles created by attackers (userId-guildId -> Set<roleId>)
    this.attackerCreatedWebhooks = new Map(); // Track webhooks created by attackers (userId-guildId -> Set<webhookId>)
  }

  // Get server-size-aware adaptive thresholds
  getAdaptiveThresholds(guild) {
    const memberCount = guild.memberCount || 1;

    // Calculate multiplier based on server size
    // Larger servers may have more legitimate bulk operations
    let multiplier = 1.0;
    if (memberCount >= 5000) {
      multiplier = 2.0; // Very large servers: double thresholds
    } else if (memberCount >= 2000) {
      multiplier = 1.5; // Large servers: 1.5x thresholds
    } else if (memberCount >= 1000) {
      multiplier = 1.2; // Medium-large servers: slight increase
    }
    // Small/medium servers (< 1000): use base thresholds (1.0x)

    // Apply multiplier to base thresholds
    return {
      channelsDeleted: Math.max(
        1,
        Math.ceil(this.baseThresholds.channelsDeleted * multiplier)
      ),
      channelsCreated: Math.ceil(
        this.baseThresholds.channelsCreated * multiplier
      ),
      rolesDeleted: Math.max(
        1,
        Math.ceil(this.baseThresholds.rolesDeleted * multiplier)
      ),
      rolesCreated: Math.ceil(this.baseThresholds.rolesCreated * multiplier),
      membersBanned: Math.ceil(this.baseThresholds.membersBanned * multiplier),
      membersKicked: Math.ceil(this.baseThresholds.membersKicked * multiplier),
      webhooksCreated: Math.ceil(
        this.baseThresholds.webhooksCreated * multiplier
      ),
      emojisDeleted: Math.ceil(this.baseThresholds.emojisDeleted * multiplier),
      emojisCreated: Math.ceil(this.baseThresholds.emojisCreated * multiplier),
      voiceRaid: Math.ceil(this.baseThresholds.voiceRaid * multiplier),
    };
  }

  // Check if user is whitelisted (EXCEEDS WICK - prevents false positives)
  async isWhitelisted(guildId, userId) {
    if (!this.whitelistCache.has(guildId)) {
      // Load whitelist from database
      const whitelist = await db.getWhitelistedUsers(guildId);
      this.whitelistCache.set(
        guildId,
        new Set(whitelist.map((u) => u.user_id))
      );
    }
    return this.whitelistCache.get(guildId)?.has(userId) || false;
  }

  // Predictive threat detection (EXCEEDS WICK - detects threats before they happen)
  async detectPredictiveThreat(guild, userId, actionType) {
    const guildId = guild.id;
    const key = `${guildId}-${userId}`;

    if (!this.predictiveThreats.has(guildId)) {
      this.predictiveThreats.set(guildId, new Map());
    }

    const userThreats = this.predictiveThreats.get(guildId);
    if (!userThreats.has(userId)) {
      userThreats.set(userId, {
        patterns: [],
        confidence: 0,
        firstSeen: Date.now(),
      });
    }

    const threatData = userThreats.get(userId);

    // Track suspicious patterns
    const suspiciousPatterns = [
      { pattern: "rapid_permission_changes", threshold: 3, window: 10000 },
      { pattern: "testing_permissions", threshold: 2, window: 30000 },
      { pattern: "unusual_activity_spike", threshold: 5, window: 60000 },
    ];

    // Check for rapid permission changes (testing if they can nuke)
    if (actionType.includes("role") || actionType.includes("channel")) {
      threatData.patterns.push({
        type: "rapid_permission_changes",
        timestamp: Date.now(),
      });

      const recentPatterns = threatData.patterns.filter(
        (p) =>
          p.type === "rapid_permission_changes" &&
          Date.now() - p.timestamp < 10000
      );

      if (recentPatterns.length >= 3) {
        threatData.confidence += 30;
        // Silent monitoring - only log on action
      }
    }

    // Clean old patterns
    threatData.patterns = threatData.patterns.filter(
      (p) => Date.now() - p.timestamp < 60000
    );

    // Silent monitoring - detection happens, but only critical actions are logged
    return threatData.confidence >= 80;
  }

  // Permission change rate limiting (EXCEEDS WICK - prevents permission testing)
  async trackPermissionChange(guild, userId, changeType, targetId, targetType) {
    const key = `${userId}-${guild.id}`;
    const now = Date.now();

    if (!this.permissionChanges.has(key)) {
      this.permissionChanges.set(key, {
        changes: [],
        firstChange: now,
        count: 0,
      });
    }

    const data = this.permissionChanges.get(key);

    // Add this change
    data.changes.push({
      type: changeType,
      targetId,
      targetType,
      timestamp: now,
    });
    data.count++;

    // Clean old changes (older than 30 seconds)
    data.changes = data.changes.filter((c) => now - c.timestamp < 30000);

    // Reset if no activity for 30 seconds
    if (data.changes.length > 0 && now - data.changes[0].timestamp > 30000) {
      data.firstChange = now;
      data.count = 1;
    }

    // Check for suspicious permission testing patterns
    const recentChanges = data.changes.filter((c) => now - c.timestamp < 10000);

    // Pattern 1: Rapid permission changes (3+ in 10 seconds)
    if (recentChanges.length >= 3) {
      logger.warn(
        `[Anti-Nuke] Permission testing detected: ${userId} made ${recentChanges.length} permission changes in 10 seconds`
      );
      return {
        suspicious: true,
        reason: "rapid_permission_changes",
        count: recentChanges.length,
        confidence: 40 + recentChanges.length * 10,
      };
    }

    // Pattern 2: Testing on multiple targets (5+ different targets in 30 seconds)
    const uniqueTargets = new Set(data.changes.map((c) => c.targetId));
    if (uniqueTargets.size >= 5) {
      logger.warn(
        `[Anti-Nuke] Permission testing detected: ${userId} modified permissions on ${uniqueTargets.size} different targets`
      );
      return {
        suspicious: true,
        reason: "multiple_target_testing",
        count: uniqueTargets.size,
        confidence: 50 + uniqueTargets.size * 5,
      };
    }

    // Pattern 3: Escalation pattern (creating/modifying admin roles)
    const escalations = recentChanges.filter(
      (c) =>
        c.type === "role_create" ||
        (c.type === "role_update" && c.targetType === "admin")
    );
    if (escalations.length >= 2) {
      logger.warn(
        `[Anti-Nuke] Permission escalation detected: ${userId} attempting to create/modify admin permissions`
      );
      return {
        suspicious: true,
        reason: "permission_escalation",
        count: escalations.length,
        confidence: 70,
      };
    }

    return { suspicious: false };
  }

  async monitorAction(guild, actionType, userId, details = {}) {
    // Skip monitoring the bot itself (prevents false positives when bot creates roles)
    if (userId === this.client.user.id) {
      return;
    }

    // Check whitelist first (EXCEEDS WICK)
    if (await this.isWhitelisted(guild.id, userId)) {
      logger.debug(
        `[Anti-Nuke] User ${userId} is whitelisted in ${guild.name} - skipping monitoring`
      );
      return; // Whitelisted users are exempt
    }

    // Track permission changes if this is a permission-related action
    if (
      actionType.includes("role") ||
      actionType.includes("channel") ||
      actionType.includes("permission")
    ) {
      const permCheck = await this.trackPermissionChange(
        guild,
        userId,
        actionType,
        details.targetId,
        details.targetType
      );

      if (permCheck.suspicious) {
        // Only log if confidence is very high (reduce spam)
        if (permCheck.confidence >= 80) {
          logger.warn(
            `[Anti-Nuke] 🚨 Permission testing: ${userId} (${permCheck.confidence}%)`
          );
        }

        // If confidence is high enough, take action
        if (permCheck.confidence >= 60) {
          try {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return; // Member already banned/kicked - stop processing

            // Remove dangerous permissions immediately
            const roles = member.roles.cache.filter(
              (r) =>
                r.permissions.has("Administrator") ||
                r.permissions.has("ManageGuild") ||
                r.permissions.has("ManageRoles") ||
                r.permissions.has("ManageChannels")
            );

            for (const [, role] of roles) {
              try {
                await member.roles.remove(
                  role,
                  `Anti-Nuke: ${permCheck.reason}`
                );
                logger.info(
                  `[Anti-Nuke] Removed role ${role.name} from ${member.user.tag}`
                );
              } catch (err) {
                // Silent - role removal failures are expected when member is banned
              }
            }

            // Notify admins
            const logChannel = guild.channels.cache.find(
              (ch) => ch.name.includes("log") || ch.name.includes("mod")
            );
            if (logChannel) {
              await logChannel.send({
                embeds: [
                  {
                    title: "🚨 Permission Testing Detected",
                    description: `**User:** <@${userId}>\n**Reason:** ${permCheck.reason}\n**Confidence:** ${permCheck.confidence}%\n**Action:** Removed dangerous permissions`,
                    color: 0xff0000,
                    timestamp: new Date().toISOString(),
                  },
                ],
              });
            }

            // Don't return - still call trackAction to trigger full threat response
          } catch (error) {
            logger.error(
              "[Anti-Nuke] Failed to handle permission testing:",
              error
            );
          }
        }
      }
    }

    // Predictive threat detection (EXCEEDS WICK)
    const isHighThreat = await this.detectPredictiveThreat(
      guild,
      userId,
      actionType
    );
    // Predictive threat detection runs silently unless action is taken

    // Use adaptive thresholds (EXCEEDS WICK - intelligent adaptation)
    const thresholds = this.getAdaptiveThresholds(guild);

    const key = `${guild.id}-${userId}`;
    const now = Date.now();

    // Special handling for channel creation - mark as potential spam channel
    if (actionType === "channelCreate" && details.channelId) {
      this.spamChannels.set(details.channelId, {
        creator: userId,
        createdAt: now,
        messageCount: 0,
        guildId: guild.id,
      });

      // If server is in lockdown, DELETE channel immediately
      if (this.lockedGuilds.has(guild.id)) {
        try {
          const channel = await guild.channels
            .fetch(details.channelId)
            .catch(() => null);
          if (channel) {
            await channel
              .delete("Anti-Nuke: Channel created during lockdown")
              .catch((err) => {
                logger.debug(
                  `[Anti-Nuke] Failed to delete channel ${channel.id} during lockdown:`,
                  err.message
                );
              });
            this.spamChannels.delete(details.channelId);
            logger.warn(
              `[Anti-Nuke] Immediately deleted channel ${details.channelId} created during lockdown`
            );
          }
        } catch (error) {
          // Continue
        }
      }

      // Auto-delete spam channels after 30 seconds if they have spam
      setTimeout(() => {
        this.checkAndDeleteSpamChannel(guild, details.channelId);
      }, 30000);
    }

    if (!this.actionHistory.has(key)) {
      this.actionHistory.set(key, {
        actions: [],
        lastAction: 0,
        threatScore: 0,
      });
    }

    const userHistory = this.actionHistory.get(key);
    userHistory.actions.push({
      type: actionType,
      timestamp: now,
      details,
    });

    // Track channels created by this user (for cleanup during recovery)
    if (actionType === "channelCreate" && details.channelId) {
      if (!this.attackerCreatedChannels.has(key)) {
        this.attackerCreatedChannels.set(key, new Set());
      }
      this.attackerCreatedChannels.get(key).add(details.channelId);

      // Auto-cleanup tracking after 5 minutes if no threat detected
      setTimeout(() => {
        const channels = this.attackerCreatedChannels.get(key);
        if (channels) {
          channels.delete(details.channelId);
          if (channels.size === 0) {
            this.attackerCreatedChannels.delete(key);
          }
        }
      }, 300000); // 5 minutes
    }

    // Track roles created by this user (for cleanup during recovery)
    if (actionType === "roleCreate" && details.roleId) {
      if (!this.attackerCreatedRoles.has(key)) {
        this.attackerCreatedRoles.set(key, new Set());
      }
      this.attackerCreatedRoles.get(key).add(details.roleId);

      // Auto-cleanup tracking after 5 minutes if no threat detected
      setTimeout(() => {
        const roles = this.attackerCreatedRoles.get(key);
        if (roles) {
          roles.delete(details.roleId);
          if (roles.size === 0) {
            this.attackerCreatedRoles.delete(key);
          }
        }
      }, 300000); // 5 minutes
    }

    // Track webhooks created by this user (for cleanup during recovery)
    if (actionType === "webhookCreate" && details.webhookId) {
      if (!this.attackerCreatedWebhooks.has(key)) {
        this.attackerCreatedWebhooks.set(key, new Set());
      }
      this.attackerCreatedWebhooks.get(key).add(details.webhookId);

      // Auto-cleanup tracking after 5 minutes if no threat detected
      setTimeout(() => {
        const webhooks = this.attackerCreatedWebhooks.get(key);
        if (webhooks) {
          webhooks.delete(details.webhookId);
          if (webhooks.size === 0) {
            this.attackerCreatedWebhooks.delete(key);
          }
        }
      }, 300000); // 5 minutes
    }

    // Clean old actions (older than 5 seconds - FASTER detection window)
    userHistory.actions = userHistory.actions.filter(
      (a) => now - a.timestamp < 5000
    );

    // Check thresholds
    const counts = this.countActions(userHistory.actions);
    let threatDetected = false;
    let threatType = null;

    // AGGRESSIVE: Rate-based detection for channel deletions
    // If 2+ channels deleted AND they happened within 1 second of each other = NUKE
    if (counts.channelsDeleted >= 2) {
      const channelDeletions = userHistory.actions.filter(
        (a) => a.type === "channelDelete"
      );
      if (channelDeletions.length >= 2) {
        // Check if any 2 deletions happened within 1 second
        for (let i = 0; i < channelDeletions.length - 1; i++) {
          const timeDiff =
            channelDeletions[i + 1].timestamp - channelDeletions[i].timestamp;
          if (timeDiff < 1000) {
            // 2 channels deleted within 1 second = DEFINITE NUKE
            threatDetected = true;
            threatType = "rapid_channel_deletion";
            // Only log once per threat (not on every subsequent channel)
            if (
              !this.processedThreats.has(`${guild.id}-${userId}-rapid_nuke`)
            ) {
              logger.warn(
                `[Anti-Nuke] 🚨 RAPID NUKE: 2 channels ${timeDiff}ms apart - Banning ${userId}`
              );
            }
            break;
          }
        }
      }
    }

    // PERFORMANCE: Check thresholds with early return (faster than else-if chain)
    if (
      !threatDetected &&
      counts.channelsDeleted >= thresholds.channelsDeleted
    ) {
      threatDetected = true;
      threatType = "mass_channel_deletion";
    }
    if (
      !threatDetected &&
      counts.channelsCreated >= thresholds.channelsCreated
    ) {
      threatDetected = true;
      threatType = "mass_channel_creation";
    }
    if (!threatDetected && counts.rolesDeleted >= thresholds.rolesDeleted) {
      threatDetected = true;
      threatType = "mass_role_deletion";
    }
    if (!threatDetected && counts.rolesCreated >= thresholds.rolesCreated) {
      threatDetected = true;
      threatType = "mass_role_creation";
    }
    if (!threatDetected && counts.membersBanned >= thresholds.membersBanned) {
      threatDetected = true;
      threatType = "mass_ban";
    }
    if (!threatDetected && counts.membersKicked >= thresholds.membersKicked) {
      threatDetected = true;
      threatType = "mass_kick";
    }
    if (
      !threatDetected &&
      counts.webhooksCreated >= thresholds.webhooksCreated
    ) {
      threatDetected = true;
      threatType = "mass_webhook_creation";
    }
    if (!threatDetected && counts.emojisDeleted >= thresholds.emojisDeleted) {
      threatDetected = true;
      threatType = "mass_emoji_deletion";
    }
    if (!threatDetected && counts.emojisCreated >= thresholds.emojisCreated) {
      threatDetected = true;
      threatType = "mass_emoji_creation";
    }
    if (!threatDetected && counts.voiceRaid >= 1) {
      threatDetected = true;
      threatType = "voice_raid";
    }

    // COMBINED THREAT DETECTION - Multiple suspicious actions = immediate threat
    const totalSuspiciousActions =
      counts.channelsDeleted +
      counts.channelsCreated +
      counts.rolesDeleted +
      counts.rolesCreated +
      counts.membersBanned +
      counts.membersKicked +
      counts.webhooksCreated +
      counts.emojisDeleted +
      counts.emojisCreated;

    if (totalSuspiciousActions >= 4 && !threatDetected) {
      threatDetected = true;
      threatType = "combined_attack";
    }

    if (threatDetected) {
      await this.handleThreat(guild, userId, threatType, counts);
    }

    // Update threat score
    userHistory.threatScore = this.calculateThreatScore(counts);
    userHistory.lastAction = now;

    return { threatDetected, threatType, threatScore: userHistory.threatScore };
  }

  countActions(actions) {
    return {
      channelsDeleted: actions.filter((a) => a.type === "channelDelete").length,
      channelsCreated: actions.filter((a) => a.type === "channelCreate").length,
      rolesDeleted: actions.filter((a) => a.type === "roleDelete").length,
      rolesCreated: actions.filter((a) => a.type === "roleCreate").length,
      membersBanned: actions.filter((a) => a.type === "banAdd").length,
      membersKicked: actions.filter((a) => a.type === "memberRemove").length,
      webhooksCreated: actions.filter((a) => a.type === "webhookCreate").length,
      emojisDeleted: actions.filter((a) => a.type === "emojiDelete").length,
      emojisCreated: actions.filter((a) => a.type === "emojiCreate").length,
      voiceRaid: actions.filter((a) => a.type === "voiceRaid").length,
    };
  }

  calculateThreatScore(counts) {
    let score = 0;
    score += counts.channelsDeleted * 20;
    score += counts.channelsCreated * 15;
    score += counts.rolesDeleted * 25;
    score += counts.rolesCreated * 15;
    score += counts.membersBanned * 30;
    score += counts.membersKicked * 20;
    score += counts.webhooksCreated * 10;
    score += counts.emojisDeleted * 15;
    return Math.min(score, 100);
  }

  async handleThreat(guild, userId, threatType, counts) {
    // Prevent duplicate handling
    const threatKey = `${guild.id}-${userId}-${threatType}`;
    if (this.processedThreats.has(threatKey)) {
      return; // Already handling this threat
    }
    this.processedThreats.add(threatKey);

    // Clean old processed threats after 30 seconds
    setTimeout(() => {
      this.processedThreats.delete(threatKey);
    }, 30000);

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      // User left or doesn't exist - still lock down server
      await this.lockdownServer(guild, threatType, counts);
      return;
    }

    // Check if user is owner - STILL ACT but log differently
    const isOwner = member.id === guild.ownerId;
    const isAdmin = member.permissions.has("Administrator");

    logger.warn(
      `[Anti-Nuke] 🚨 CRITICAL THREAT: ${threatType} by ${userId} (${
        isOwner ? "OWNER" : isAdmin ? "ADMIN" : "USER"
      }) in ${guild.id}`
    );

    // Get config
    const config = await db.getServerConfig(guild.id);
    if (!config || !config.anti_nuke_enabled) {
      logger.warn(
        `[Anti-Nuke] Anti-nuke disabled for ${guild.id} - ENABLING AUTOMATICALLY`
      );
      // Auto-enable if disabled during attack
      await db.setServerConfig(guild.id, { anti_nuke_enabled: 1 });
    }

    // PERFORMANCE FIX: Attempt ban IMMEDIATELY, don't wait for role manipulation
    // Get bot permissions right away
    const botMember = await guild.members
      .fetch(this.client.user.id)
      .catch(() => null);
    if (!botMember) {
      logger.error(
        `[Anti-Nuke] Could not fetch bot member - cannot take action`
      );
      return;
    }

    const hasBanPerms = botMember.permissions.has("BanMembers");
    const hasKickPerms = botMember.permissions.has("KickMembers");

    // TRY TO BAN IMMEDIATELY
    let actionTaken = false;
    if (hasBanPerms) {
      try {
        await member.ban({
          reason: `Anti-Nuke EMERGENCY: ${threatType} detected`,
          deleteMessageSeconds: 604800,
        });
        logger.success(
          `[Anti-Nuke] ✅ BANNED ${userId} | ${threatType} | Waiting for removal...`
        );
        actionTaken = true;

        // Wait 3 seconds for Discord to actually remove the attacker from the server
        // This prevents trying to recover while attack is still in progress
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Verify attacker is actually gone before starting recovery
        const stillPresent = await guild.members
          .fetch(userId)
          .catch(() => null);
        if (stillPresent) {
          logger.warn(
            `[Anti-Nuke] Attacker still in server after ban - waiting longer...`
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        logger.info(`[Anti-Nuke] Starting recovery...`);

        // Trigger auto-recovery after attacker is removed
        this.attemptRecovery(guild, threatType, counts, userId).catch(
          (error) => {
            logger.error(`[Anti-Nuke] Recovery failed:`, error);
          }
        );

        return; // Success - exit early
      } catch (banError) {
        logger.error(`[Anti-Nuke] Immediate ban failed: ${banError.message}`);
        // Continue to try other methods
      }
    }

    // If ban failed, try kick
    if (!actionTaken && hasKickPerms) {
      try {
        await member.kick(`Anti-Nuke: ${threatType} detected`);
        logger.success(
          `[Anti-Nuke] ✅ KICKED ${userId} | ${threatType} | Waiting for removal...`
        );
        actionTaken = true;

        // Wait 2 seconds for Discord to actually remove the attacker from the server
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify attacker is actually gone before starting recovery
        const stillPresent = await guild.members
          .fetch(userId)
          .catch(() => null);
        if (stillPresent) {
          logger.warn(
            `[Anti-Nuke] Attacker still in server after kick - waiting longer...`
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        logger.info(`[Anti-Nuke] Starting recovery...`);

        // Trigger auto-recovery after attacker is removed
        this.attemptRecovery(guild, threatType, counts, userId).catch(
          (error) => {
            logger.error(`[Anti-Nuke] Recovery failed:`, error);
          }
        );

        return; // Success - exit early
      } catch (kickError) {
        logger.error(`[Anti-Nuke] Immediate kick failed: ${kickError.message}`);
      }
    }

    // If immediate action failed, THEN try role manipulation (slower fallback)
    if (!actionTaken) {
      logger.warn(
        `[Anti-Nuke] Immediate ban/kick failed - attempting role manipulation fallback`
      );
    }

    // FALLBACK: Try role manipulation (this is slower and often fails)
    // Since attacker bot's application role has Admin, we MUST be above it in hierarchy
    try {
      const botMember = await guild.members
        .fetch(this.client.user.id)
        .catch(() => null);
      if (!botMember) {
        logger.error(`[Anti-Nuke] Could not fetch bot member in ${guild.id}`);
        return; // Can't proceed without bot member
      }

      if (member.roles.highest) {
        const botHighestRole = botMember.roles.highest;
        const attackerHighestRole = member.roles.highest;

        logger.warn(
          `[Anti-Nuke] Role check - Bot: ${botHighestRole.position}, Attacker: ${attackerHighestRole.position}`
        );

        // If attacker's role is above or equal to bot's, elevate bot's role
        if (
          attackerHighestRole &&
          attackerHighestRole.position >= botHighestRole.position
        ) {
          try {
            // Refresh roles cache first
            await guild.roles.fetch();

            // Get all roles sorted by position (highest first)
            const allRoles = Array.from(guild.roles.cache.values())
              .filter((r) => r.id !== guild.id) // Exclude @everyone
              .sort((a, b) => b.position - a.position);

            // Find attacker's role position in the sorted list
            const attackerRoleIndex = allRoles.findIndex(
              (r) => r.id === attackerHighestRole.id
            );

            // Calculate new position - must be STRICTLY above attacker (at least +1)
            // Discord role positions: higher number = higher in hierarchy
            // If positions are equal, we need to be at least 1 higher
            const maxPosition = allRoles.length; // Highest possible position
            const minRequiredPosition = attackerHighestRole.position + 1;
            const newPosition = Math.min(
              Math.max(minRequiredPosition, botHighestRole.position + 1),
              maxPosition
            );

            // If new position equals attacker's position, we need to go higher
            if (newPosition <= attackerHighestRole.position) {
              logger.warn(
                `[Anti-Nuke] Calculated position ${newPosition} is not above attacker ${
                  attackerHighestRole.position
                }, using ${attackerHighestRole.position + 1}`
              );
              // Force it to be at least 1 above
              const forcedPosition = Math.min(
                attackerHighestRole.position + 1,
                maxPosition
              );
              // But we can't go above max, so if we're at max, we can't elevate
              if (forcedPosition > maxPosition) {
                logger.error(
                  `[Anti-Nuke] Cannot elevate bot role - already at maximum position ${maxPosition}`
                );
                throw new Error(
                  "Bot role cannot be elevated above attacker - at maximum position"
                );
              }
            }

            // Check if bot has Administrator or ManageRoles permission
            const hasAdmin = botMember.permissions.has("Administrator");
            const hasManageRoles = botMember.permissions.has("ManageRoles");

            if (hasAdmin || hasManageRoles) {
              logger.warn(
                `[Anti-Nuke] Attempting to elevate bot role from ${botHighestRole.position} to ${newPosition} (attacker at ${attackerHighestRole.position})`
              );

              // Try to set position - with Admin, this should work
              await botHighestRole.setPosition(newPosition, {
                reason:
                  "Anti-Nuke: Emergency role elevation - must be above attacker bot",
              });

              logger.warn(
                `[Anti-Nuke] Elevated bot role to position ${newPosition} above attacker in ${guild.id}`
              );

              // Wait longer for Discord to process the role change and refresh cache
              await new Promise((resolve) => setTimeout(resolve, 2000));

              // Refresh guild roles cache
              await guild.roles.fetch();

              // Refresh bot member to get updated permissions
              const refreshedBotMember = await guild.members.fetch(
                this.client.user.id,
                { force: true }
              );
              const refreshedBotRole = refreshedBotMember.roles.highest;

              logger.warn(
                `[Anti-Nuke] After elevation - Bot role position: ${refreshedBotRole.position}, Attacker: ${attackerHighestRole.position}`
              );
            } else {
              logger.error(
                `[Anti-Nuke] Bot lacks both Administrator and ManageRoles permissions - cannot elevate role in ${guild.id}`
              );
            }
          } catch (error) {
            logger.error(`[Anti-Nuke] Could not elevate bot role:`, error);
            logger.error(`[Anti-Nuke] Error details:`, {
              message: error?.message || String(error),
              stack: error?.stack,
              name: error?.name,
            });
            // Continue anyway - try other methods, but it will likely fail
          }
        } else {
          logger.info(
            `[Anti-Nuke] Bot role (${botHighestRole.position}) is already above attacker (${attackerHighestRole.position})`
          );
        }
      }
    } catch (error) {
      logger.error(`[Anti-Nuke] Error checking role hierarchy:`, error);
    }

    // IMMEDIATE LOCKDOWN FIRST - Don't wait for ban
    await this.lockdownServer(guild, threatType, counts);

    // Immediate action: Remove all permissions and ban
    try {
      // CRITICAL: If attacker has Administrator permission, we MUST remove it first
      // Admin permission bypasses role hierarchy, so we need to strip it
      const botMember = await guild.members
        .fetch(this.client.user.id)
        .catch(() => null);
      const botRoleIds = botMember
        ? botMember.roles.cache.map((r) => r.id)
        : [];

      // If attacker has Administrator permission, try to remove it from their roles
      if (member.permissions.has("Administrator")) {
        logger.warn(
          `[Anti-Nuke] Attacker has Administrator permission - attempting to strip it`
        );

        // Try to remove Administrator permission from all of attacker's roles
        for (const role of member.roles.cache.values()) {
          if (role.id === guild.id) continue; // Skip @everyone
          if (role.permissions.has("Administrator")) {
            try {
              // Remove Administrator permission from the role
              const newPerms = role.permissions.remove("Administrator");
              if (botMember?.permissions.has("ManageRoles") && role.editable) {
                await role.setPermissions(
                  newPerms,
                  "Anti-Nuke: Remove admin from attacker role"
                );
                logger.warn(
                  `[Anti-Nuke] Removed Administrator permission from role ${role.name}`
                );
              }
            } catch (error) {
              logger.error(
                `[Anti-Nuke] Could not remove admin from role ${role.name}:`,
                error
              );
            }
          }
        }

        // Reduced wait time (EXCEEDS WICK - faster response)
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Remove ALL roles from attacker (this will strip admin if we couldn't remove it from the role)
      // This is the most aggressive approach - remove everything except @everyone
      // Since bot has Admin, it should be able to remove roles regardless of hierarchy
      const allRolesToRemove = member.roles.cache.filter(
        (r) => r.id !== guild.id && !botRoleIds.includes(r.id) // Don't filter by editable - try all roles
      );

      if (allRolesToRemove.size > 0) {
        logger.warn(
          `[Anti-Nuke] Attempting to remove ${allRolesToRemove.size} roles from attacker ${userId}`
        );

        try {
          // Try to remove all roles at once - this should work with Admin permission
          await member.roles.set(
            [],
            "Anti-Nuke: EMERGENCY - Strip all permissions"
          );
          logger.warn(
            `[Anti-Nuke] Successfully removed all ${allRolesToRemove.size} roles from attacker ${userId}`
          );
        } catch (error) {
          // If that fails, try removing them one by one (even if not "editable")
          logger.warn(
            `[Anti-Nuke] Bulk role removal failed, trying individually:`,
            error
          );
          let removedCount = 0;
          for (const role of allRolesToRemove.values()) {
            try {
              // Try to remove even if role is "above" bot - Admin permission should allow this
              await member.roles.remove(
                role,
                "Anti-Nuke: Emergency role removal"
              );
              removedCount++;
            } catch (err) {
              logger.warn(
                `[Anti-Nuke] Could not remove role ${role.name} (${role.id}):`,
                err.message
              );
              // Continue with next role
            }
          }
          logger.warn(
            `[Anti-Nuke] Removed ${removedCount}/${allRolesToRemove.size} roles individually`
          );
        }

        // Reduced wait time (EXCEEDS WICK - faster response)
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Refresh member to get updated permissions
        try {
          await member.fetch(true);
          logger.warn(
            `[Anti-Nuke] Refreshed member - Admin permission: ${member.permissions.has(
              "Administrator"
            )}`
          );
        } catch (err) {
          logger.error(`[Anti-Nuke] Could not refresh member:`, err);
        }
      }

      // Check if bot has ban permissions - refresh to get latest permissions after role elevation
      const botMemberCheck = await guild.members
        .fetch(this.client.user.id, { force: true })
        .catch(() => null);

      // Also refresh guild to ensure role cache is updated
      await guild.roles.fetch();

      const hasBanPerms = botMemberCheck?.permissions.has("BanMembers");
      const hasKickPerms = botMemberCheck?.permissions.has("KickMembers");

      // Log current role positions for debugging
      if (botMemberCheck && member.roles.highest) {
        logger.warn(
          `[Anti-Nuke] Before ban attempt - Bot role: ${botMemberCheck.roles.highest.position}, Attacker role: ${member.roles.highest.position}`
        );
      }

      let removed = false;

      if (hasBanPerms) {
        // Ban the user IMMEDIATELY
        try {
          await member.ban({
            reason: `Anti-Nuke EMERGENCY: ${threatType} | Server protection activated`,
            deleteMessageSeconds: 604800, // 7 days in seconds (fixed deprecation)
          });
          removed = true;
          logger.info(
            `[Anti-Nuke] Successfully banned ${userId} from ${guild.id}`
          );
        } catch (banError) {
          // If ban fails, try kick
          logger.error(`[Anti-Nuke] Ban failed, attempting kick:`, banError);
          if (hasKickPerms) {
            try {
              await member.kick("Anti-Nuke: Emergency removal");
              removed = true;
              logger.info(
                `[Anti-Nuke] Successfully kicked ${userId} from ${guild.id}`
              );
            } catch (kickError) {
              logger.error(`[Anti-Nuke] Kick also failed:`, kickError);
            }
          }
        }
      } else if (hasKickPerms) {
        // No ban perms - try kick
        logger.warn(
          `[Anti-Nuke] Bot lacks BanMembers permission, attempting kick`
        );
        try {
          await member.kick("Anti-Nuke: Emergency removal");
          removed = true;
          logger.info(
            `[Anti-Nuke] Successfully kicked ${userId} from ${guild.id}`
          );
        } catch (kickError) {
          logger.error(`[Anti-Nuke] Kick failed:`, kickError);
        }
      } else {
        logger.error(
          `[Anti-Nuke] Bot lacks both BanMembers and KickMembers permissions!`
        );
      }

      // If still not removed, try timeout as last resort
      if (!removed) {
        const hasTimeoutPerms =
          botMemberCheck?.permissions.has("ModerateMembers");
        if (hasTimeoutPerms) {
          try {
            await member.timeout(
              28 * 24 * 60 * 60 * 1000,
              "Anti-Nuke: Emergency timeout (max duration)"
            );
            logger.warn(
              `[Anti-Nuke] Timed out ${userId} as last resort in ${guild.id}`
            );
            removed = true;
          } catch (timeoutError) {
            logger.error(`[Anti-Nuke] Timeout also failed:`, timeoutError);
          }
        } else {
          logger.error(
            `[Anti-Nuke] Bot lacks ModerateMembers permission - cannot timeout ${userId}`
          );
        }

        // Final fallback: Log detailed error and try aggressive role removal
        if (!removed) {
          logger.error(
            `[Anti-Nuke] CRITICAL: All removal methods failed for ${userId} in ${guild.id}`
          );
          logger.error(
            `[Anti-Nuke] Bot permissions: BanMembers=${hasBanPerms}, KickMembers=${hasKickPerms}, ModerateMembers=${hasTimeoutPerms}`
          );
          if (botMemberCheck && member.roles.highest) {
            logger.error(
              `[Anti-Nuke] Role hierarchy issue: Bot position ${botMemberCheck.roles.highest.position}, Attacker position ${member.roles.highest.position}`
            );

            // Send detailed explanation to Discord alert channel
            const config = await db.getServerConfig(guild.id);
            const alertChannelId =
              config?.alert_channel || config?.mod_log_channel;
            if (alertChannelId) {
              try {
                const channel = guild.channels.cache.get(alertChannelId);
                if (channel) {
                  const { EmbedBuilder } = require("discord.js");
                  await channel.send({
                    embeds: [
                      new EmbedBuilder()
                        .setTitle("⚠️ Role Hierarchy Issue")
                        .setDescription(
                          `**Anti-Nuke could not take action against <@${userId}>**\n\n` +
                            `The attacker's role is at or above the bot's role position.\n` +
                            `Even with Administrator permission, Discord requires role hierarchy for moderation actions.`
                        )
                        .addFields(
                          {
                            name: "Bot Role Position",
                            value: `${botMemberCheck.roles.highest.position}`,
                            inline: true,
                          },
                          {
                            name: "Attacker Role Position",
                            value: `${member.roles.highest.position}`,
                            inline: true,
                          },
                          {
                            name: "Solution",
                            value:
                              "Position the bot's role **ABOVE** all other roles in `Server Settings → Roles`.\n\nUse `/security rolecheck` for detailed instructions.",
                          }
                        )
                        .setColor(0xff0000)
                        .setTimestamp(),
                    ],
                  });
                }
              } catch (alertError) {
                logger.debug(
                  `[Anti-Nuke] Could not send role hierarchy alert:`,
                  alertError.message
                );
              }
            }
          }

          // Try to remove all roles one more time (aggressive)
          try {
            const allRemovableRoles = member.roles.cache.filter(
              (r) => r.id !== guild.id && r.editable
            );
            if (allRemovableRoles.size > 0) {
              await member.roles.set(
                [],
                "Anti-Nuke: Last resort - remove all roles"
              );
              logger.warn(
                `[Anti-Nuke] Removed all roles from ${userId} as final attempt`
              );
            }
          } catch (roleError) {
            logger.error(`[Anti-Nuke] Final role removal failed:`, roleError);
          }
        }
      }

      // Log threat and alert admins in parallel (EXCEEDS WICK - faster response)
      await Promise.all([
        this.logThreat(guild, userId, threatType, counts, removed),
        this.alertAdmins(guild, userId, threatType, counts),
      ]);

      // Reduced wait time - only wait if we need to (EXCEEDS WICK - faster recovery)
      if (removed) {
        // Only wait 1 second instead of 3 (optimized for speed)
        await new Promise((resolve) => setTimeout(resolve, 1000));

        logger.info(
          `[Anti-Nuke] Attacker ${userId} was successfully removed, starting server recovery...`
        );
        // Start recovery immediately (don't wait for full cleanup)
        this.attemptRecovery(guild, threatType, counts, userId).catch(
          (error) => {
            logger.error(`[Anti-Nuke] Recovery failed:`, error);
          }
        );
      } else {
        logger.warn(
          `[Anti-Nuke] Attacker ${userId} was not removed - skipping recovery to prevent interference`
        );
      }
    } catch (error) {
      logger.error(`[Anti-Nuke] Error handling threat:`, error);
      ErrorHandler.logError(error, "AdvancedAntiNuke", "Handle threat");
    }
  }

  async lockdownServer(guild, threatType, counts) {
    // Prevent multiple lockdowns
    if (this.lockedGuilds.has(guild.id)) {
      return;
    }
    this.lockedGuilds.add(guild.id);

    try {
      // DELETE ALL CHANNELS CREATED IN LAST 30 SECONDS (spam channels)
      let deletedSpamChannels = 0;
      const now = Date.now();
      const spamChannelIds = [];

      for (const [channelId, channelData] of this.spamChannels.entries()) {
        if (
          channelData.guildId === guild.id &&
          now - channelData.createdAt < 30000
        ) {
          spamChannelIds.push(channelId);
        }
      }

      // Delete spam channels in parallel batches with rate limit protection (EXCEEDS WICK)
      const spamBatchSize = 5; // Process 5 at a time to avoid rate limits
      for (let i = 0; i < spamChannelIds.length; i += spamBatchSize) {
        const batch = spamChannelIds.slice(i, i + spamBatchSize);
        await Promise.all(
          batch.map(async (channelId) => {
            try {
              const channel = await guild.channels
                .fetch(channelId)
                .catch(() => null);
              if (channel) {
                await channel
                  .delete("Anti-Nuke: Spam channel cleanup during lockdown")
                  .catch((error) => {
                    // Handle rate limits gracefully (EXCEEDS WICK)
                    if (error.code === 429 || error.status === 429) {
                      logger.warn(
                        `[Anti-Nuke] Rate limited while deleting spam channel ${channelId}, will retry`
                      );
                      // Retry after delay
                      setTimeout(
                        async () => {
                          try {
                            await channel.delete(
                              "Anti-Nuke: Spam channel cleanup (retry)"
                            );
                            deletedSpamChannels++;
                          } catch (retryError) {
                            // Give up after retry
                          }
                        },
                        (error.retryAfter || 1) * 1000
                      );
                    }
                  });
                deletedSpamChannels++;
              }
            } catch (error) {
              // Continue
              if (error.code === 429 || error.status === 429) {
                logger.warn(
                  `[Anti-Nuke] Rate limited during spam channel cleanup`
                );
              }
            }
            this.spamChannels.delete(channelId);
          })
        );
        // Small delay between batches to avoid rate limits
        if (i + spamBatchSize < spamChannelIds.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Also delete ANY channel created in the last 60 seconds (aggressive cleanup)
      const allChannels = Array.from(guild.channels.cache.values()).filter(
        (c) => {
          const createdTimestamp = c.createdTimestamp || 0;
          return now - createdTimestamp < 60000; // Created in last 60 seconds
        }
      );

      // Delete in parallel batches with rate limit protection (EXCEEDS WICK)
      const channelBatchSize = 5; // Process 5 at a time to avoid rate limits
      const channelArray = Array.from(allChannels);
      for (let i = 0; i < channelArray.length; i += channelBatchSize) {
        const batch = channelArray.slice(i, i + channelBatchSize);
        await Promise.all(
          batch.map(async (channel) => {
            try {
              // Don't delete system channels or categories
              if (channel.type === 4 || channel.type === 15) return; // Category or Forum
              await channel
                .delete("Anti-Nuke: Recent channel cleanup")
                .catch((error) => {
                  // Handle rate limits gracefully (EXCEEDS WICK)
                  if (error.code === 429 || error.status === 429) {
                    logger.warn(
                      `[Anti-Nuke] Rate limited while deleting channel ${channel.id}`
                    );
                  }
                });
              deletedSpamChannels++;
            } catch (error) {
              // Continue
              if (error.code === 429 || error.status === 429) {
                logger.warn(`[Anti-Nuke] Rate limited during channel cleanup`);
              }
            }
          })
        );
        // Small delay between batches to avoid rate limits
        if (i + channelBatchSize < channelArray.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      if (deletedSpamChannels > 0) {
        logger.info(
          `[Anti-Nuke] Deleted ${deletedSpamChannels} spam channels during lockdown in ${guild.id}`
        );
      }

      // Lockdown: Set all channels to read-only for @everyone AND prevent channel creation
      const botMember = await guild.members
        .fetch(this.client.user.id)
        .catch(() => null);
      if (!botMember) return;

      const channels = guild.channels.cache.filter(
        (c) =>
          c.isTextBased() && c.permissionsFor(botMember)?.has("ManageChannels")
      );

      let lockedCount = 0;
      for (const channel of channels.values()) {
        try {
          await channel.permissionOverwrites.edit(guild.roles.everyone, {
            SendMessages: false,
            AddReactions: false,
            CreatePublicThreads: false,
            CreatePrivateThreads: false,
            ViewChannel: true, // Keep visible but locked
          });
          lockedCount++;
        } catch (error) {
          // Continue with other channels
        }
      }

      // Prevent @everyone from creating channels - use permission overwrites on server
      try {
        if (botMember.permissions.has("ManageRoles")) {
          // Update @everyone role to remove channel creation permissions
          const everyoneRole = guild.roles.everyone;
          const newPerms = everyoneRole.permissions.remove([
            "CreateInstantInvite",
            "CreatePrivateThreads",
            "CreatePublicThreads",
            "ManageChannels",
          ]);
          await everyoneRole
            .setPermissions(newPerms, "Anti-Nuke: Prevent channel creation")
            .catch((err) => {
              logger.debug(
                `[Anti-Nuke] Failed to update @everyone permissions:`,
                err.message
              );
            });
        }
      } catch (error) {
        logger.error(`[Anti-Nuke] Error preventing channel creation:`, error);
      }

      logger.info(
        `[Anti-Nuke] Lockdown activated: ${lockedCount} channels locked, ${deletedSpamChannels} spam channels deleted in ${guild.id}`
      );

      // Auto-unlock after 5 minutes (actually restore permissions!)
      setTimeout(
        async () => {
          await this.unlockServer(guild);
          logger.info(`[Anti-Nuke] Lockdown auto-released for ${guild.id}`);
        },
        5 * 60 * 1000
      );
    } catch (error) {
      logger.error(`[Anti-Nuke] Error during lockdown:`, error);
    }
  }

  /**
   * Unlock server and restore all permissions
   * @param {Guild} guild - The guild to unlock
   */
  async unlockServer(guild) {
    if (!this.lockedGuilds.has(guild.id)) {
      return; // Already unlocked
    }

    try {
      const botMember = await guild.members
        .fetch(this.client.user.id)
        .catch(() => null);
      if (!botMember) {
        // Still remove from locked to prevent permanent lock
        this.lockedGuilds.delete(guild.id);
        return;
      }

      // Restore channel permissions by removing overwrites (set to null resets to default)
      const channels = guild.channels.cache.filter(
        (c) =>
          c.isTextBased() && c.permissionsFor(botMember)?.has("ManageChannels")
      );

      logger.info(
        `[Anti-Nuke] Unlocking ${channels.size} channels in ${guild.id}`
      );

      let unlockedCount = 0;
      let failedCount = 0;
      for (const channel of channels.values()) {
        try {
          // Try to delete the overwrite first (removes it completely)
          const everyoneOverwrite = channel.permissionOverwrites.cache.get(
            guild.roles.everyone.id
          );

          if (everyoneOverwrite) {
            // If overwrite exists, try to delete specific permissions or the whole overwrite
            try {
              // Delete specific permission overwrites we set during lockdown
              await channel.permissionOverwrites.edit(guild.roles.everyone, {
                SendMessages: null, // Remove overwrite (resets to default)
                AddReactions: null,
                CreatePublicThreads: null,
                CreatePrivateThreads: null,
              });
              unlockedCount++;
            } catch (editError) {
              // If editing fails, try deleting the entire overwrite
              try {
                await everyoneOverwrite.delete(
                  "Anti-Nuke: Remove lockdown overwrites"
                );
                unlockedCount++;
              } catch (deleteError) {
                // Last resort: explicitly set to true
                await channel.permissionOverwrites.edit(guild.roles.everyone, {
                  SendMessages: true,
                  AddReactions: true,
                  CreatePublicThreads: true,
                  CreatePrivateThreads: true,
                });
                unlockedCount++;
              }
            }
          } else {
            // No overwrite exists, channel should already be unlocked
            unlockedCount++;
          }
        } catch (error) {
          failedCount++;
          // Log error but continue with other channels
          logger.warn(
            `[Anti-Nuke] Failed to unlock channel ${channel.id} (${channel.name}):`,
            error.message
          );
        }
      }

      logger.info(
        `[Anti-Nuke] Unlocked ${unlockedCount}/${channels.size} channels (${failedCount} failed) in ${guild.id}`
      );

      // Restore @everyone role permissions (add back what we removed)
      try {
        if (botMember.permissions.has("ManageRoles")) {
          const everyoneRole = guild.roles.everyone;
          // Add back the permissions we removed during lockdown
          const restoredPerms = everyoneRole.permissions.add([
            "CreateInstantInvite",
            "CreatePrivateThreads",
            "CreatePublicThreads",
            "ManageChannels",
          ]);
          await everyoneRole
            .setPermissions(
              restoredPerms,
              "Anti-Nuke: Restore permissions after lockdown"
            )
            .catch((err) => {
              logger.debug(
                `[Anti-Nuke] Failed to restore @everyone permissions:`,
                err.message
              );
            });
        }
      } catch (error) {
        logger.error(
          `[Anti-Nuke] Error restoring @everyone permissions:`,
          error
        );
      }

      // Remove from locked guilds
      this.lockedGuilds.delete(guild.id);

      logger.info(
        `[Anti-Nuke] Server unlocked: ${unlockedCount} channels restored in ${guild.id}`
      );
    } catch (error) {
      logger.error(`[Anti-Nuke] Error unlocking server:`, error);
      // Still remove from locked guilds to prevent permanent lock
      this.lockedGuilds.delete(guild.id);
    }
  }

  async logThreat(guild, userId, threatType, counts, actionTaken) {
    try {
      await new Promise((resolve, reject) => {
        // Try with new columns first
        db.db.run(
          "INSERT INTO security_logs (guild_id, user_id, threat_type, threat_score, action_taken, details, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            guild.id,
            userId,
            threatType,
            this.calculateThreatScore(counts),
            actionTaken ? 1 : 0,
            JSON.stringify(counts),
            Date.now(),
          ],
          (err) => {
            if (err) {
              // If columns don't exist, try without them
              if (err.message.includes("no such column")) {
                db.db.run(
                  "INSERT INTO security_logs (guild_id, user_id, event_type, threat_score, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                  [
                    guild.id,
                    userId,
                    threatType,
                    this.calculateThreatScore(counts),
                    JSON.stringify(counts),
                    Date.now(),
                  ],
                  (err2) => {
                    if (err2) reject(err2);
                    else resolve();
                  }
                );
              } else {
                reject(err);
              }
            } else {
              resolve();
            }
          }
        );
      });
    } catch (error) {
      logger.error(`[Anti-Nuke] Error logging threat:`, error);
      // Don't throw - logging failure shouldn't stop threat handling
    }
  }

  async attemptRecovery(guild, threatType, counts, attackerUserId) {
    try {
      logger.info(
        `[Anti-Nuke] Starting recovery process for ${guild.id} after ${threatType}`
      );

      // STEP 1: Delete all channels created by the attacker ONLY
      // IMPORTANT: This ONLY deletes channels created by the detected threat user
      // Channels created by server owner, mods, or other members are NOT touched
      if (attackerUserId) {
        const key = `${attackerUserId}-${guild.id}`;
        const attackerChannels = this.attackerCreatedChannels.get(key);

        if (attackerChannels && attackerChannels.size > 0) {
          logger.info(
            `[Anti-Nuke] Cleaning up ${attackerChannels.size} spam channels created ONLY by detected threat ${attackerUserId}`
          );

          let deletedCount = 0;
          const attackWindow = Date.now() - 300000; // Only delete channels created in last 5 minutes

          for (const channelId of attackerChannels) {
            try {
              const channel = await guild.channels
                .fetch(channelId)
                .catch(() => null);
              if (channel) {
                // Extra safety: Only delete if channel is very recent (created during attack window)
                const channelAge = Date.now() - channel.createdTimestamp;
                if (channelAge > 300000) {
                  logger.debug(
                    `[Anti-Nuke] Skipping channel ${channel.name} - too old (${Math.floor(channelAge / 1000)}s), likely legitimate`
                  );
                  continue;
                }

                await channel.delete(
                  "Anti-Nuke: Cleaning up spam channel created during attack"
                );
                deletedCount++;
                logger.debug(
                  `[Anti-Nuke] Deleted spam channel: ${channel.name} (${channelId})`
                );
              }
            } catch (error) {
              logger.debug(
                `[Anti-Nuke] Failed to delete spam channel ${channelId}:`,
                error.message
              );
            }
          }

          logger.success(
            `[Anti-Nuke] ✅ Cleaned up ${deletedCount}/${attackerChannels.size} spam channels (only attacker's channels)`
          );

          // Clear the tracking
          this.attackerCreatedChannels.delete(key);
        }

        // Clean up spam roles created by attacker
        const attackerRoles = this.attackerCreatedRoles.get(key);
        if (attackerRoles && attackerRoles.size > 0) {
          logger.info(
            `[Anti-Nuke] Cleaning up ${attackerRoles.size} spam roles created ONLY by detected threat ${attackerUserId}`
          );

          let deletedRoles = 0;
          for (const roleId of attackerRoles) {
            try {
              const role = await guild.roles.fetch(roleId).catch(() => null);
              if (role) {
                // Extra safety: Only delete if role is very recent
                const roleAge = Date.now() - role.createdTimestamp;
                if (roleAge > 300000) {
                  logger.debug(
                    `[Anti-Nuke] Skipping role ${role.name} - too old (${Math.floor(roleAge / 1000)}s), likely legitimate`
                  );
                  continue;
                }

                // Don't delete @everyone or managed roles (bot roles)
                if (role.id === guild.id || role.managed) {
                  continue;
                }

                await role.delete(
                  "Anti-Nuke: Cleaning up spam role created during attack"
                );
                deletedRoles++;
                logger.debug(
                  `[Anti-Nuke] Deleted spam role: ${role.name} (${roleId})`
                );
              }
            } catch (error) {
              logger.debug(
                `[Anti-Nuke] Failed to delete spam role ${roleId}:`,
                error.message
              );
            }
          }

          logger.success(
            `[Anti-Nuke] ✅ Cleaned up ${deletedRoles}/${attackerRoles.size} spam roles`
          );

          this.attackerCreatedRoles.delete(key);
        }

        // Clean up spam webhooks created by attacker
        const attackerWebhooks = this.attackerCreatedWebhooks.get(key);
        if (attackerWebhooks && attackerWebhooks.size > 0) {
          logger.info(
            `[Anti-Nuke] Cleaning up ${attackerWebhooks.size} spam webhooks created ONLY by detected threat ${attackerUserId}`
          );

          let deletedWebhooks = 0;
          for (const webhookId of attackerWebhooks) {
            try {
              // Fetch all webhooks in guild and find this one
              const channels = await guild.channels.fetch();
              for (const channel of channels.values()) {
                if (channel.isTextBased()) {
                  try {
                    const webhooks = await channel.fetchWebhooks();
                    const webhook = webhooks.get(webhookId);
                    if (webhook) {
                      await webhook.delete(
                        "Anti-Nuke: Cleaning up spam webhook created during attack"
                      );
                      deletedWebhooks++;
                      logger.debug(
                        `[Anti-Nuke] Deleted spam webhook: ${webhook.name} (${webhookId})`
                      );
                      break;
                    }
                  } catch (err) {
                    // Channel might not have webhook permissions
                    continue;
                  }
                }
              }
            } catch (error) {
              logger.debug(
                `[Anti-Nuke] Failed to delete spam webhook ${webhookId}:`,
                error.message
              );
            }
          }

          logger.success(
            `[Anti-Nuke] ✅ Cleaned up ${deletedWebhooks}/${attackerWebhooks.size} spam webhooks`
          );

          this.attackerCreatedWebhooks.delete(key);
        }
      }

      // STEP 2: Restore legitimate channels from snapshot
      // Get the attack start time (when threat was first detected)
      // We need snapshots created BEFORE the attack started
      const attackStartTime = Date.now() - (this.windowMs || 10000); // Approximate attack start (10 seconds before now)

      // Try to get the actual threat detection time from security logs
      const threatLog = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT timestamp FROM security_logs WHERE guild_id = ? AND threat_type = ? ORDER BY timestamp DESC LIMIT 1",
          [guild.id, threatType],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      }).catch(() => null);

      // Use threat log timestamp if available, otherwise use approximate
      const minSnapshotTime = threatLog
        ? threatLog.timestamp - 5000
        : attackStartTime - 60000; // 5 seconds before threat, or 1 minute before now

      logger.info(
        `[Anti-Nuke] Looking for snapshots created before ${new Date(
          minSnapshotTime
        ).toISOString()}`
      );

      // Get snapshots created BEFORE the attack started (try "full" first, then "auto", then any)
      let snapshots = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM recovery_snapshots WHERE guild_id = ? AND snapshot_type = ? AND created_at < ? ORDER BY created_at DESC LIMIT 1",
          [guild.id, "full", minSnapshotTime],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (snapshots.length === 0) {
        snapshots = await new Promise((resolve, reject) => {
          db.db.all(
            "SELECT * FROM recovery_snapshots WHERE guild_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT 1",
            [guild.id, minSnapshotTime],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        });
      }

      if (snapshots.length === 0) {
        logger.warn(
          `[Anti-Nuke] No recovery snapshots found for ${guild.id} created before the attack - attempting fallback recovery from memory/Discord`
        );

        // Fallback: Try to restore from memory/Discord (like Wick does when imaging is disabled)
        // This is finicky and may not restore everything, but it's better than nothing
        const fallbackResult = await this.attemptFallbackRecovery(
          guild,
          threatType,
          counts
        );

        if (fallbackResult.recovered > 0) {
          logger.info(
            `[Anti-Nuke] Fallback recovery completed: ${fallbackResult.recovered} items recovered from memory/Discord`
          );
        } else {
          logger.warn(
            `[Anti-Nuke] Fallback recovery failed - no items could be recovered. Consider using /backup create to create a backup snapshot before an attack occurs`
          );
        }
        return;
      }

      const snapshot = snapshots[0];
      const snapshotAge = Date.now() - snapshot.created_at;
      const snapshotAgeMinutes = Math.floor(snapshotAge / 60000);

      logger.info(
        `[Anti-Nuke] Found snapshot from ${new Date(
          snapshot.created_at
        ).toISOString()} (${snapshotAgeMinutes} minutes before attack), starting recovery...`
      );

      const AutoRecovery = require("./autoRecovery");
      const recoveryResult = await AutoRecovery.recover(guild, snapshot.id);

      logger.info(
        `[Anti-Nuke] Recovery completed for ${guild.id}: ${recoveryResult.recovered} items recovered`
      );

      // Alert admins about recovery
      const config = await db.getServerConfig(guild.id);
      const alertChannelId = config?.alert_channel || config?.mod_log_channel;

      if (alertChannelId) {
        try {
          const channel = guild.channels.cache.get(alertChannelId);
          if (channel) {
            const { EmbedBuilder } = require("discord.js");
            const embed = new EmbedBuilder()
              .setTitle("🔄 Server Recovery Complete")
              .setDescription(
                `The server has been automatically recovered after the ${threatType} attack.\n\n` +
                  `**Recovered:** ${recoveryResult.recovered} items\n` +
                  `**Snapshot:** Created ${new Date(
                    snapshot.created_at
                  ).toLocaleString()}`
              )
              .setColor(0x00ff00)
              .setTimestamp();

            await channel.send({ embeds: [embed] });
          }
        } catch (error) {
          logger.error(`[Anti-Nuke] Error sending recovery alert:`, error);
        }
      }
    } catch (error) {
      logger.error(`[Anti-Nuke] Error attempting recovery:`, error);
      ErrorHandler.logError(error, "AdvancedAntiNuke", "Attempt recovery");
    }
  }

  async alertAdmins(
    guild,
    userId,
    threatType,
    counts,
    isOwner = false,
    isAdmin = false
  ) {
    try {
      // ONLY send DM alerts to all admins (no channel alerts)
      const { EmbedBuilder } = require("discord.js");
      const dmEmbed = new EmbedBuilder()
        .setTitle("🚨 CRITICAL: Server Under Attack!")
        .setDescription(
          `**Your server ${guild.name} is under attack!**\n\n` +
            `**Threat Type:** ${threatType}\n` +
            `**Attacker:** <@${userId}>${
              isOwner ? " (SERVER OWNER)" : isAdmin ? " (ADMIN)" : ""
            }\n` +
            `**Action Taken:** User banned/kicked, server locked down\n` +
            `**Status:** Server is in lockdown mode for 5 minutes`
        )
        .addFields({
          name: "📊 Attack Details",
          value:
            Object.entries(counts)
              .filter(([_, value]) => value > 0)
              .map(([key, value]) => `**${key}:** ${value}`)
              .join("\n") || "Multiple suspicious actions",
          inline: false,
        })
        .setColor(0xff0000)
        .setTimestamp();

      // DM all admins
      const adminMembers = guild.members.cache.filter(
        (m) =>
          m.permissions.has("Administrator") && !m.user.bot && m.id !== userId
      );

      // Also DM owner
      const owner = await guild.fetchOwner().catch(() => null);
      if (owner && !adminMembers.has(owner.id)) {
        adminMembers.set(owner.id, owner);
      }

      // Send DMs in parallel batches with rate limit protection (EXCEEDS WICK)
      const adminArray = Array.from(adminMembers.values());
      const dmBatchSize = 3; // Process 3 DMs at a time to avoid rate limits
      for (let i = 0; i < adminArray.length; i += dmBatchSize) {
        const batch = adminArray.slice(i, i + dmBatchSize);
        await Promise.all(
          batch.map(async (admin) => {
            try {
              await admin.send({ embeds: [dmEmbed] }).catch((error) => {
                // Handle rate limits gracefully (EXCEEDS WICK)
                if (error.code === 429 || error.status === 429) {
                  logger.warn(
                    `[Anti-Nuke] Rate limited while sending DM to ${admin.id}`
                  );
                }
              });
            } catch (error) {
              // Continue if DM fails (DMs disabled, etc.)
              if (error.code === 429 || error.status === 429) {
                logger.warn(`[Anti-Nuke] Rate limited during admin DM alerts`);
              }
            }
          })
        );
        // Small delay between batches to avoid rate limits
        if (i + dmBatchSize < adminArray.length) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      logger.info(
        `[Anti-Nuke] Sent DM alerts to ${adminMembers.size} admins for threat in ${guild.id}`
      );
    } catch (error) {
      logger.error(`[Anti-Nuke] Error sending DM alerts:`, error);
    }
  }

  // Monitor message spam in channels
  async monitorChannelMessage(channel, userId) {
    if (!this.spamChannels.has(channel.id)) {
      // Not a newly created channel, skip
      return;
    }

    const channelData = this.spamChannels.get(channel.id);
    channelData.messageCount++;

    // AGGRESSIVE: If more than 3 messages in a newly created channel within 5 seconds = SPAM
    const channelAge = Date.now() - channelData.createdAt;
    if (channelAge < 5000 && channelData.messageCount > 3) {
      // SPAM CHANNEL DETECTED - Delete it IMMEDIATELY
      logger.warn(
        `[Anti-Nuke] 🚨 SPAM CHANNEL: ${channel.id} in ${channel.guild.id} - ${channelData.messageCount} messages in ${channelAge}ms`
      );

      try {
        await channel.delete(
          "Anti-Nuke: Spam channel detected - immediate deletion"
        );
        this.spamChannels.delete(channel.id);

        // Also monitor the creator for mass channel creation - TRIGGER THREAT
        const threatResult = await this.monitorAction(
          channel.guild,
          "channelCreate",
          channelData.creator,
          {
            channelId: channel.id,
            channelName: channel.name,
            spamDetected: true,
            messageCount: channelData.messageCount,
          }
        );

        // If threat detected, handle it
        if (threatResult.threatDetected) {
          logger.warn(
            `[Anti-Nuke] Spam channel creator ${channelData.creator} triggered threat detection`
          );
        }
      } catch (error) {
        logger.error(`[Anti-Nuke] Error deleting spam channel:`, error);
        // If deletion fails, still trigger threat on creator
        await this.monitorAction(
          channel.guild,
          "channelCreate",
          channelData.creator,
          { channelId: channel.id, spamDetected: true, deletionFailed: true }
        );
      }
    }

    // Also check for rapid messages from same user
    const messageKey = `${channel.id}-${userId}`;
    if (!this.channelMessageCounts.has(messageKey)) {
      this.channelMessageCounts.set(messageKey, {
        count: 0,
        firstMessage: Date.now(),
      });
    }

    const msgData = this.channelMessageCounts.get(messageKey);
    msgData.count++;

    // If user sends more than 3 messages in 2 seconds = spam
    const timeSinceFirst = Date.now() - msgData.firstMessage;
    if (timeSinceFirst < 2000 && msgData.count > 3) {
      // User is spamming - timeout them
      try {
        const member = await channel.guild.members.fetch(userId);
        if (member && !member.permissions.has("Administrator")) {
          await member.timeout(
            10 * 60 * 1000,
            "Anti-Nuke: Message spam detected"
          );
          logger.warn(
            `[Anti-Nuke] Timed out spammer ${userId} in ${channel.guild.id}`
          );
        }
      } catch (error) {
        // Ignore errors
      }
    }

    // Clean old message counts
    if (timeSinceFirst > 10000) {
      this.channelMessageCounts.delete(messageKey);
    }
  }

  async checkAndDeleteSpamChannel(guild, channelId) {
    const channelData = this.spamChannels.get(channelId);
    if (!channelData) return;

    try {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        this.spamChannels.delete(channelId);
        return;
      }

      // If channel has excessive messages or was created suspiciously, delete it
      if (channelData.messageCount > 10) {
        await channel.delete("Anti-Nuke: Spam channel cleanup");
        this.spamChannels.delete(channelId);
        logger.info(
          `[Anti-Nuke] Deleted spam channel ${channelId} with ${channelData.messageCount} messages`
        );
      } else {
        // Remove from tracking if it's clean
        this.spamChannels.delete(channelId);
      }
    } catch (error) {
      this.spamChannels.delete(channelId);
    }
  }

  // Fallback recovery from memory/Discord (when no snapshots exist)
  async attemptFallbackRecovery(guild, threatType, counts) {
    const recovered = [];
    const skipped = [];

    try {
      logger.info(
        `[Anti-Nuke] Attempting fallback recovery for ${guild.name} (no snapshots available)`
      );

      // Fetch current state from Discord
      await guild.channels.fetch().catch((err) => {
        logger.debug(
          `[Anti-Nuke] Failed to fetch channels for fallback recovery:`,
          err.message
        );
      });
      await guild.roles.fetch().catch((err) => {
        logger.debug(
          `[Anti-Nuke] Failed to fetch roles for fallback recovery:`,
          err.message
        );
      });

      // Try to restore based on what we know was deleted
      // This is limited because we don't have full snapshot data
      // This is the "finicky" part Wick mentions - we can't restore everything perfectly

      if (
        threatType === "mass_channel_deletion" ||
        threatType === "mass_channel_creation"
      ) {
        // Try to restore basic channel structure
        // Create a general channel if none exist
        const textChannels = guild.channels.cache.filter(
          (c) => c.isTextBased() && !c.isThread()
        );

        if (textChannels.size === 0) {
          try {
            const generalChannel = await guild.channels.create({
              name: "general",
              type: 0, // Text channel
              reason: "Fallback recovery: Restore basic channel structure",
            });
            recovered.push({
              type: "channel",
              id: generalChannel.id,
              name: generalChannel.name,
            });
            logger.info(
              `[Anti-Nuke] Created fallback channel: #${generalChannel.name}`
            );
          } catch (error) {
            logger.error(
              `[Anti-Nuke] Failed to create fallback channel:`,
              error
            );
          }
        }
      }

      if (threatType === "mass_role_deletion") {
        // Try to restore basic roles
        // We can't restore exact permissions, but we can create basic roles
        // This is very limited without snapshot data
        logger.warn(
          `[Anti-Nuke] Fallback recovery cannot restore deleted roles without snapshot data - permissions and exact structure are unknown`
        );
      }

      logger.info(
        `[Anti-Nuke] Fallback recovery complete: ${recovered.length} items recovered, ${skipped.length} items skipped (limited recovery - snapshots recommended)`
      );

      return {
        success: recovered.length > 0,
        recovered: recovered.length,
        skipped: skipped.length,
        items: recovered,
        limited: true, // Indicates this is a limited recovery
      };
    } catch (error) {
      logger.error(`[Anti-Nuke] Error in fallback recovery:`, error);
      return {
        success: false,
        recovered: 0,
        skipped: 0,
        items: [],
        limited: true,
      };
    }
  }

  // Clean old history (run periodically)
  cleanup() {
    const now = Date.now();
    for (const [key, history] of this.actionHistory.entries()) {
      if (now - history.lastAction > 60000) {
        // Remove if inactive for 1 minute
        this.actionHistory.delete(key);
      }
    }

    // Clean old spam channel tracking
    for (const [channelId, data] of this.spamChannels.entries()) {
      if (now - data.createdAt > 60000) {
        // Remove channels older than 1 minute
        this.spamChannels.delete(channelId);
      }
    }

    // Clean old message counts
    for (const [key, data] of this.channelMessageCounts.entries()) {
      if (now - data.firstMessage > 30000) {
        this.channelMessageCounts.delete(key);
      }
    }

    // Clean old webhook spam tracking
    for (const [webhookId, data] of this.webhookSpam.entries()) {
      if (now - data.createdAt > 60000) {
        this.webhookSpam.delete(webhookId);
      }
    }

    // Clean old emoji spam tracking
    for (const [userId, data] of this.emojiSpam.entries()) {
      if (now - data.lastMessage > 30000) {
        this.emojiSpam.delete(userId);
      }
    }

    // Clean old voice raid tracking
    for (const [guildId, data] of this.voiceRaids.entries()) {
      if (now - data.lastJoin > 60000) {
        this.voiceRaids.delete(guildId);
      }
    }

    // Clean old predictive threat patterns (EXCEEDS WICK - memory optimization)
    for (const [guildId, userThreats] of this.predictiveThreats.entries()) {
      for (const [userId, threatData] of userThreats.entries()) {
        // Remove if inactive for 5 minutes
        if (now - threatData.firstSeen > 300000) {
          userThreats.delete(userId);
        } else {
          // Clean old patterns
          threatData.patterns = threatData.patterns.filter(
            (p) => now - p.timestamp < 60000
          );
        }
      }
      if (userThreats.size === 0) {
        this.predictiveThreats.delete(guildId);
      }
    }

    // Clean empty rate limit queues (EXCEEDS WICK - memory optimization)
    for (const [guildId, queue] of this.rateLimitQueue.entries()) {
      if (queue.length === 0 && !queue.processing) {
        this.rateLimitQueue.delete(guildId);
      }
    }

    // Clean processed threats set (prevent memory buildup)
    if (this.processedThreats.size > 1000) {
      // Keep only recent 500 entries
      const entries = Array.from(this.processedThreats);
      this.processedThreats.clear();
      entries.slice(-500).forEach((entry) => this.processedThreats.add(entry));
    }

    // Clean locked guilds if lockdown expired (should be handled elsewhere, but safety check)
    // This is a safety net - actual unlock happens in unlockServer
  }

  // Monitor emoji spam in messages
  async monitorEmojiSpam(message, userId) {
    if (!message.content) return;

    // Count emojis in message
    const emojiRegex =
      /<a?:[\w]+:\d+>|[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const emojiMatches = message.content.match(emojiRegex) || [];
    const emojiCount = emojiMatches.length;

    // If message has 10+ emojis, it's spam
    if (emojiCount >= 10) {
      const key = `${message.guild.id}-${userId}`;
      if (!this.emojiSpam.has(key)) {
        this.emojiSpam.set(key, {
          count: 0,
          lastMessage: Date.now(),
          guildId: message.guild.id,
        });
      }

      const spamData = this.emojiSpam.get(key);
      spamData.count++;
      spamData.lastMessage = Date.now();

      // If 3+ spam messages in 10 seconds, delete and warn
      if (spamData.count >= 3 && Date.now() - spamData.lastMessage < 10000) {
        try {
          await message.delete().catch((err) => {
            logger.debug(
              `[Anti-Nuke] Failed to delete emoji spam message:`,
              err.message
            );
          });
          logger.warn(
            `[Anti-Nuke] Deleted emoji spam message from ${userId} in ${message.guild.id}`
          );

          // Warn user
          const member = await message.guild.members
            .fetch(userId)
            .catch(() => null);
          if (member) {
            await member
              .send(
                `⚠️ Your message in ${message.guild.name} was deleted for emoji spam. Please avoid sending excessive emojis.`
              )
              .catch((err) => {
                logger.debug(
                  `[Anti-Nuke] Failed to send DM warning for emoji spam:`,
                  err.message
                );
              });
          }
        } catch (error) {
          logger.error(`[Anti-Nuke] Error handling emoji spam:`, error);
        }
      }
    }
  }

  // Monitor webhook spam
  async monitorWebhookSpam(webhook, userId) {
    const key = `${webhook.guild.id}-${webhook.id}`;
    if (!this.webhookSpam.has(key)) {
      this.webhookSpam.set(key, {
        creator: userId,
        createdAt: Date.now(),
        messageCount: 0,
        guildId: webhook.guild.id,
      });
    }

    const webhookData = this.webhookSpam.get(key);
    webhookData.messageCount++;

    // If webhook sends 5+ messages in 10 seconds, it's spam
    if (
      webhookData.messageCount >= 5 &&
      Date.now() - webhookData.createdAt < 10000
    ) {
      try {
        await webhook.delete("Anti-Nuke: Webhook spam detected");
        logger.warn(
          `[Anti-Nuke] Deleted spam webhook ${webhook.id} in ${webhook.guild.id}`
        );
        this.webhookSpam.delete(key);
      } catch (error) {
        logger.error(`[Anti-Nuke] Error deleting spam webhook:`, error);
      }
    }
  }
}

module.exports = AdvancedAntiNuke;
