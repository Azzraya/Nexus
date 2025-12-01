const db = require("./database");
const logger = require("./logger");
const ErrorHandler = require("./errorHandler");

class AdvancedAntiNuke {
  constructor(client) {
    this.client = client;
    this.monitoring = new Map(); // Track suspicious activity
    this.actionHistory = new Map(); // Track recent actions per user
    this.thresholds = {
      channelsDeleted: 1, // Even 1 channel deletion in 5 seconds = THREAT (nuke bots delete ALL)
      channelsCreated: 2, // 2+ channels created in 5 seconds = spam creation
      rolesDeleted: 1, // Even 1 role deletion = potential threat
      rolesCreated: 2, // 2+ roles created in 5 seconds
      membersBanned: 2, // 2+ bans in 5 seconds
      membersKicked: 2, // 2+ kicks in 5 seconds
      webhooksCreated: 2, // 2+ webhooks in 5 seconds
      emojisDeleted: 2, // 2+ emojis deleted in 5 seconds
      emojisCreated: 5, // 5+ emojis created in 5 seconds (spam)
      voiceRaid: 10, // 10+ voice joins in 10 seconds
    };
    this.lockedGuilds = new Set(); // Track guilds in lockdown
    this.processedThreats = new Set(); // Prevent duplicate handling
    this.spamChannels = new Map(); // Track spam channels (channelId -> {creator, createdAt, messageCount})
    this.channelMessageCounts = new Map(); // Track messages per channel (channelId -> count)
    this.webhookSpam = new Map(); // Track webhook spam (webhookId -> {creator, createdAt, messageCount})
    this.emojiSpam = new Map(); // Track emoji spam per user (userId -> {count, lastMessage, guildId})
    this.voiceRaids = new Map(); // Track voice channel raids (guildId -> {joinCount, lastJoin, userIds})
  }

  async monitorAction(guild, actionType, userId, details = {}) {
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
              .catch(() => {});
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

    // Clean old actions (older than 5 seconds - FASTER detection window)
    userHistory.actions = userHistory.actions.filter(
      (a) => now - a.timestamp < 5000
    );

    // Check thresholds
    const counts = this.countActions(userHistory.actions);
    let threatDetected = false;
    let threatType = null;

    // Check individual thresholds
    if (counts.channelsDeleted >= this.thresholds.channelsDeleted) {
      threatDetected = true;
      threatType = "mass_channel_deletion";
    } else if (counts.channelsCreated >= this.thresholds.channelsCreated) {
      threatDetected = true;
      threatType = "mass_channel_creation";
    } else if (counts.rolesDeleted >= this.thresholds.rolesDeleted) {
      threatDetected = true;
      threatType = "mass_role_deletion";
    } else if (counts.rolesCreated >= this.thresholds.rolesCreated) {
      threatDetected = true;
      threatType = "mass_role_creation";
    } else if (counts.membersBanned >= this.thresholds.membersBanned) {
      threatDetected = true;
      threatType = "mass_ban";
    } else if (counts.membersKicked >= this.thresholds.membersKicked) {
      threatDetected = true;
      threatType = "mass_kick";
    } else if (counts.webhooksCreated >= this.thresholds.webhooksCreated) {
      threatDetected = true;
      threatType = "mass_webhook_creation";
    } else if (counts.emojisDeleted >= this.thresholds.emojisDeleted) {
      threatDetected = true;
      threatType = "mass_emoji_deletion";
    } else if (counts.emojisCreated >= this.thresholds.emojisCreated) {
      threatDetected = true;
      threatType = "mass_emoji_creation";
    } else if (counts.voiceRaid >= 1) {
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

    // CRITICAL: Move bot's role above attacker FIRST - AGGRESSIVE ELEVATION
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
            logger.error(`[Anti-Nuke] Error details:`, error.message);
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

        // Wait a moment for Discord to process
        await new Promise((resolve) => setTimeout(resolve, 1000));
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

        // Wait longer for Discord to process role removal
        await new Promise((resolve) => setTimeout(resolve, 2000));

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
              `[Anti-Nuke] Bot role position: ${botMemberCheck.roles.highest.position}, Attacker role position: ${member.roles.highest.position}`
            );
            logger.error(
              `[Anti-Nuke] ⚠️ ROLE HIERARCHY ISSUE: The attacker's role is at or above the bot's role position. ` +
                `Even with Administrator permission, Discord requires role hierarchy for moderation actions. ` +
                `SOLUTION: Position the bot's role ABOVE all other roles in Server Settings → Roles. ` +
                `Use /security rolecheck for detailed instructions.`
            );
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

      // Log threat
      await this.logThreat(guild, userId, threatType, counts, removed);

      // Alert admins first (so they know what's happening)
      await this.alertAdmins(guild, userId, threatType, counts);

      // Wait a moment for Discord to process the ban/kick and for cleanup to complete
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Attempt auto-recovery AFTER attacker is removed
      // Only recover if we successfully removed the attacker (or at least tried)
      if (removed) {
        logger.info(
          `[Anti-Nuke] Attacker ${userId} was successfully removed, starting server recovery...`
        );
        await this.attemptRecovery(guild, threatType, counts);
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

      // Delete spam channels in parallel for speed
      await Promise.all(
        spamChannelIds.map(async (channelId) => {
          try {
            const channel = await guild.channels
              .fetch(channelId)
              .catch(() => null);
            if (channel) {
              await channel.delete(
                "Anti-Nuke: Spam channel cleanup during lockdown"
              );
              deletedSpamChannels++;
            }
          } catch (error) {
            // Continue
          }
          this.spamChannels.delete(channelId);
        })
      );

      // Also delete ANY channel created in the last 60 seconds (aggressive cleanup)
      const allChannels = Array.from(guild.channels.cache.values()).filter(
        (c) => {
          const createdTimestamp = c.createdTimestamp || 0;
          return now - createdTimestamp < 60000; // Created in last 60 seconds
        }
      );

      // Delete in parallel for speed
      await Promise.all(
        allChannels.map(async (channel) => {
          try {
            // Don't delete system channels or categories
            if (channel.type === 4 || channel.type === 15) return; // Category or Forum
            await channel
              .delete("Anti-Nuke: Recent channel cleanup")
              .catch(() => {});
            deletedSpamChannels++;
          } catch (error) {
            // Continue
          }
        })
      );

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
            .catch(() => {});
        }
      } catch (error) {
        logger.error(`[Anti-Nuke] Error preventing channel creation:`, error);
      }

      logger.info(
        `[Anti-Nuke] Lockdown activated: ${lockedCount} channels locked, ${deletedSpamChannels} spam channels deleted in ${guild.id}`
      );

      // Auto-unlock after 5 minutes
      setTimeout(() => {
        this.lockedGuilds.delete(guild.id);
        logger.info(`[Anti-Nuke] Lockdown auto-released for ${guild.id}`);
      }, 5 * 60 * 1000);
    } catch (error) {
      logger.error(`[Anti-Nuke] Error during lockdown:`, error);
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

  async attemptRecovery(guild, threatType, counts) {
    try {
      logger.info(
        `[Anti-Nuke] Starting recovery process for ${guild.id} after ${threatType}`
      );

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
          `[Anti-Nuke] No recovery snapshots found for ${guild.id} created before the attack - cannot auto-recover`
        );
        logger.warn(
          `[Anti-Nuke] Consider using /backup create to create a backup snapshot before an attack occurs`
        );
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

      // Send DMs in parallel
      await Promise.all(
        Array.from(adminMembers.values()).map(async (admin) => {
          try {
            await admin.send({ embeds: [dmEmbed] }).catch(() => {});
          } catch (error) {
            // Continue if DM fails (DMs disabled, etc.)
          }
        })
      );

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
          await message.delete().catch(() => {});
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
              .catch(() => {});
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
