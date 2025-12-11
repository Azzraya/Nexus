const db = require("../utils/database");
const AdvancedAntiRaid = require("../utils/advancedAntiRaid");
const JoinGate = require("../utils/joinGate");
const ErrorHandler = require("../utils/errorHandler");
const logger = require("../utils/logger");
const performanceMonitor = require("../utils/performanceMonitor");

module.exports = {
  name: "guildMemberAdd",
  async execute(member, client) {
    // Use both logger and console.log to ensure we see it
    const logMsg = `[guildMemberAdd] Member joined: ${member.user.tag} (${member.id}) in ${member.guild.name} (${member.guild.id})`;
    logger.info(logMsg);
    console.log(logMsg); // Backup logging

    // Track growth analytics
    if (client.growthAnalytics) {
      client.growthAnalytics.trackJoin(
        member.guild.id,
        member.user.id,
        "invite"
      );
    }

    // Track behavioral patterns
    if (client.behavioralFP) {
      client.behavioralFP.trackBehavior(
        member.user.id,
        member.guild.id,
        "join",
        {
          accountAge: Date.now() - member.user.createdTimestamp,
        }
      );
    }

    // Start performance tracking
    const perfId = `member_join_${member.id}_${Date.now()}`;
    performanceMonitor.start(perfId, "member_join_full", {
      guildId: member.guild.id,
      userId: member.id,
    });
    // Run initial checks in parallel for better performance 
    const ThreatIntelligence = require("../utils/threatIntelligence");
    const initialChecks = await Promise.all([
      ThreatIntelligence.checkThreat(member.user.id).catch(() => ({
        hasThreat: false,
        riskScore: 0,
      })),
      JoinGate.checkMember(member, member.guild).catch(() => ({
        filtered: false,
      })),
      // Member Screening (EXCEEDS WICK - proactive security)
      client.memberScreening
        ? client.memberScreening
            .screenMember(member, member.guild)
            .catch(() => ({ passed: true }))
        : Promise.resolve({ passed: true }),
      client.workflows
        ? client.workflows
            .checkTriggers(member.guild.id, "guildMemberAdd", {
              user: member.user,
              member: member,
              guild: member.guild,
            })
            .catch((err) => {
              logger.debug(
                `[guildMemberAdd] Workflow trigger failed:`,
                err.message
              );
            })
        : Promise.resolve(),
    ]);

    const threatCheck = initialChecks[0];
    const joinGateCheck = initialChecks[1];
    const screeningResult = initialChecks[2];

    // Handle member screening first 
    if (screeningResult && !screeningResult.passed) {
      const screeningConfig = await db.getMemberScreeningConfig(
        member.guild.id
      );
      if (client.memberScreening && screeningConfig) {
        await client.memberScreening.executeScreeningAction(
          member,
          screeningResult,
          screeningConfig
        );

        // If banned or kicked, stop further processing
        if (
          screeningResult.action === "ban" ||
          screeningResult.action === "kick"
        ) {
          const totalPerfResult = performanceMonitor.end(perfId);
          if (totalPerfResult) {
            logger.success(
              `🚀 Screening ${
                screeningResult.action
              }: ${totalPerfResult.duration.toFixed(2)}ms`
            );
          }
          return;
        }
      }
    }

    // Handle high threat immediately
    if (threatCheck.hasThreat && threatCheck.riskScore >= 50) {
      const Notifications = require("../utils/notifications");
      await Notifications.send(
        member.guild.id,
        "high_threat",
        {
          userId: member.user.id,
          threatScore: threatCheck.riskScore,
          details: `User has ${threatCheck.threatCount} threat reports in network`,
        },
        client
      ).catch((err) => {
        logger.debug(`[guildMemberAdd] Notification send failed:`, err.message);
      });
    }
    if (joinGateCheck.filtered) {
      // Execute action based on join gate
      if (joinGateCheck.action === "ban") {
        await ErrorHandler.safeExecute(
          () =>
            member.ban({
              reason: `Join Gate: ${joinGateCheck.reason}`,
              deleteMessageDays: 1,
            }),
          `guildMemberAdd [${member.guild.id}]`
        );
        return;
      } else if (joinGateCheck.action === "kick") {
        await ErrorHandler.safeExecute(
          () => member.kick(`Join Gate: ${joinGateCheck.reason}`),
          `guildMemberAdd [${member.guild.id}]`
        );
        return;
      } else if (joinGateCheck.action === "timeout") {
        const constants = require("../utils/constants");
        await ErrorHandler.safeExecute(
          () =>
            member.timeout(
              constants.JOIN_GATE.DEFAULT_TIMEOUT_DURATION,
              `Join Gate: ${joinGateCheck.reason}`
            ),
          `guildMemberAdd [${member.guild.id}]`
        );
      }
    }

    // Check security whitelist FIRST (before anti-raid to prevent false bans)
    const isWhitelisted = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT * FROM security_whitelist WHERE guild_id = ? AND user_id = ?",
        [member.guild.id, member.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });

    // Skip anti-raid if whitelisted
    if (!isWhitelisted) {
      logger.debug(
        `[guildMemberAdd] Member ${member.user.tag} is not whitelisted, running anti-raid detection`
      );

      // Check advanced anti-raid (multi-algorithm detection)
      const raidPerfId = `raid_detection_${member.id}_${Date.now()}`;
      performanceMonitor.start(raidPerfId, "raid_detection", {
        guildId: member.guild.id,
        userId: member.id,
      });

      logger.debug(
        `[guildMemberAdd] Calling AdvancedAntiRaid.detectRaid for ${member.user.tag}`
      );

      const raidDetected = await AdvancedAntiRaid.detectRaid(
        member.guild,
        member
      );

      logger.debug(
        `[guildMemberAdd] detectRaid returned: ${raidDetected} for ${member.user.tag}`
      );

      const raidPerfResult = performanceMonitor.end(raidPerfId);
      if (raidPerfResult) {
        logger.info(
          `⚡ Raid detection took ${raidPerfResult.duration.toFixed(2)}ms`
        );
      }

      if (raidDetected) {
        // Send notification
        const Notifications = require("../utils/notifications");
        await Notifications.send(
          member.guild.id,
          "raid_detected",
          {
            userCount: 1,
            threatScore: 100,
            details: "Raid detected and handled",
          },
          client
        );

        // Log total response time
        const totalPerfResult = performanceMonitor.end(perfId);
        if (totalPerfResult) {
          logger.success(
            `🚀 Total raid response: ${totalPerfResult.duration.toFixed(
              2
            )}ms (Detection: ${raidPerfResult.duration.toFixed(2)}ms)`
          );
        }

        return; // Advanced system handled it
      }
    }

    // Check account age (common raid indicator)
    const accountAge = Date.now() - member.user.createdTimestamp;
    const daysOld = accountAge / (1000 * 60 * 60 * 24);

    if (daysOld < 7) {
      // Very new account - add heat
      if (
        client.heatSystem &&
        typeof client.heatSystem.addHeat === "function"
      ) {
        await client.heatSystem.addHeat(
          member.guild.id,
          member.id,
          10,
          "New account (< 7 days old)"
        );
      }
    }

    // Check if server is in lockdown
    if (client.antiRaid.lockdown.get(member.guild.id)) {
      // Auto-kick during lockdown
      await ErrorHandler.safeExecute(
        () => member.kick("Server is in lockdown mode"),
        `guildMemberAdd [${member.guild.id}]`
      );
      return;
    }

    // Advanced Verification System
    const config = await db.getServerConfig(member.guild.id);
    if (config && config.verification_enabled && config.verification_role) {
      // Initialize verification system if not already done
      if (!client.verificationSystem) {
        const VerificationSystem = require("../utils/verificationSystem");
        client.verificationSystem = new VerificationSystem(client);
      }

      // Start verification process
      try {
        const verificationResult =
          await client.verificationSystem.startVerification(member, config);

        if (verificationResult && !verificationResult.sent) {
          logger.warn(
            `[Verification] Failed to send verification to ${member.user.id} in ${member.guild.id}: ${verificationResult.reason}`
          );
        }
      } catch (error) {
        logger.error(`[Verification] Error starting verification:`, error);
      }
    }

    // Whitelist already checked above, reuse the variable
    if (!isWhitelisted) {
      // Run security check
      const Security = require("../utils/security");
      const threat = await Security.detectThreat(
        member.guild,
        member.user,
        "join"
      );

      // Log security event
      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO security_logs (guild_id, event_type, user_id, details, threat_score, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
          [
            member.guild.id,
            "member_join",
            member.id,
            JSON.stringify({ threat_level: threat.level }),
            threat.score,
            Date.now(),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Send alert if configured
      if (config && config.alert_channel && config.alert_threshold) {
        if (threat.score >= config.alert_threshold) {
          const alertChannel = member.guild.channels.cache.get(
            config.alert_channel
          );
          if (alertChannel) {
            alertChannel
              .send({
                embeds: [
                  {
                    title: "🚨 Security Alert",
                    description: `**User:** ${member.user.tag} (${
                      member.id
                    })\n**Threat Score:** ${
                      threat.score
                    }%\n**Level:** ${threat.level.toUpperCase()}\n**Recommended Action:** ${
                      threat.action || "Monitor"
                    }`,
                    color:
                      threat.score >= 80
                        ? 0xff0000
                        : threat.score >= 60
                          ? 0xff8800
                          : 0xffff00,
                    timestamp: new Date().toISOString(),
                  },
                ],
              })
              .catch(
                ErrorHandler.createSafeCatch(
                  `guildMemberAdd [${member.guild.id}]`,
                  `Send security alert for ${member.user.id}`
                )
              );
          }
        }
      }

      // Auto-action based on threat
      if (threat.score >= 80 && threat.action === "ban") {
        const banPerfId = `ban_action_${member.id}_${Date.now()}`;
        performanceMonitor.start(banPerfId, "ban_action", {
          guildId: member.guild.id,
          userId: member.id,
          threatScore: threat.score,
        });

        await ErrorHandler.safeExecute(
          () =>
            member.ban({
              reason: `Security threat detected (Score: ${threat.score})`,
              deleteMessageDays: 1,
            }),
          `guildMemberAdd [${member.guild.id}]`
        );

        const banPerfResult = performanceMonitor.end(banPerfId);
        const totalPerfResult = performanceMonitor.end(perfId);
        if (banPerfResult && totalPerfResult) {
          logger.success(
            `🚀 Ban response: ${banPerfResult.duration.toFixed(
              2
            )}ms | Total: ${totalPerfResult.duration.toFixed(2)}ms`
          );
        }

        return;
      } else if (threat.score >= 60 && threat.action === "kick") {
        const kickPerfId = `kick_action_${member.id}_${Date.now()}`;
        performanceMonitor.start(kickPerfId, "kick_action", {
          guildId: member.guild.id,
          userId: member.id,
          threatScore: threat.score,
        });

        await ErrorHandler.safeExecute(
          () =>
            member.kick(`Security threat detected (Score: ${threat.score})`),
          `guildMemberAdd [${member.guild.id}]`
        );

        const kickPerfResult = performanceMonitor.end(kickPerfId);
        const totalPerfResult = performanceMonitor.end(perfId);
        if (kickPerfResult && totalPerfResult) {
          logger.success(
            `🚀 Kick response: ${kickPerfResult.duration.toFixed(
              2
            )}ms | Total: ${totalPerfResult.duration.toFixed(2)}ms`
          );
        }

        return;
      }
    }

    // Send welcome message (reuse config from above)
    if (config && config.welcome_channel && config.welcome_message) {
      const welcomeChannel = member.guild.channels.cache.get(
        config.welcome_channel
      );
      if (welcomeChannel && welcomeChannel.isTextBased()) {
        // Check if bot has permission to send messages in this channel
        const botMember = member.guild.members.me;
        const canSend = welcomeChannel
          .permissionsFor(botMember)
          ?.has(["ViewChannel", "SendMessages"]);

        if (canSend) {
          const message = config.welcome_message
            .replace(/{user}/g, member.toString())
            .replace(/{server}/g, member.guild.name)
            .replace(/{membercount}/g, member.guild.memberCount);

          welcomeChannel
            .send({
              embeds: [
                {
                  title: "👋 Welcome!",
                  description: message,
                  color: 0x00ff00,
                  thumbnail: {
                    url: member.user.displayAvatarURL({ dynamic: true }),
                  },
                },
              ],
            })
            .catch(
              ErrorHandler.createSafeCatch(
                `guildMemberAdd [${member.guild.id}]`,
                `Send welcome message for ${member.user.id}`
              )
            );
        } else {
          // Silently skip if bot doesn't have permissions (don't log as error)
          logger.debug(
            `[guildMemberAdd] Skipping welcome message - bot lacks permissions in channel ${config.welcome_channel} for guild ${member.guild.id}`
          );
        }
      } else {
        // Channel doesn't exist, isn't accessible, or isn't text-based - silently skip
        if (welcomeChannel && !welcomeChannel.isTextBased()) {
          logger.debug(
            `[guildMemberAdd] Welcome channel ${config.welcome_channel} is not a text channel for guild ${member.guild.id}`
          );
        } else {
          logger.debug(
            `[guildMemberAdd] Welcome channel ${config.welcome_channel} not found or inaccessible for guild ${member.guild.id}`
          );
        }
      }
    }

    // Auto-role assignment
    const autoRoles = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT role_id FROM auto_roles WHERE guild_id = ? AND type = ?",
        [member.guild.id, "join"],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    for (const autoRole of autoRoles) {
      try {
        const role = member.guild.roles.cache.get(autoRole.role_id);
        if (!role) continue; // Role doesn't exist anymore

        // Check if bot has Manage Roles permission
        const botMember = member.guild.members.me;
        if (!botMember.permissions.has("ManageRoles")) {
          logger.warn(
            "GuildMemberAdd",
            `Cannot assign auto-role: Missing ManageRoles permission in ${member.guild.name}`
          );
          continue;
        }

        // Check if bot's role is high enough
        if (botMember.roles.highest.position <= role.position) {
          logger.warn(
            "GuildMemberAdd",
            `Cannot assign role ${role.name}: Bot's role is too low in hierarchy`
          );
          continue;
        }

        // Check if role is manageable (not managed by integration)
        if (role.managed) {
          logger.warn(
            "GuildMemberAdd",
            `Cannot assign role ${role.name}: Role is managed by integration`
          );
          continue;
        }

        await member.roles.add(role);
      } catch (error) {
        ErrorHandler.logError(
          error,
          `guildMemberAdd [${member.guild.id}]`,
          `Assign auto-role ${autoRole.role_id} to ${member.user.id}`
        );
      }
    }

    // Log analytics
    await db.logAnalytics(member.guild.id, "member_join", {
      user_id: member.id,
      account_age_days: daysOld,
    });

    // Enhanced logging
    const EnhancedLogging = require("../utils/enhancedLogging");
    await EnhancedLogging.log(member.guild.id, "member_join", "member", {
      userId: member.id,
      action: "join",
      details: `Member joined: ${member.user.tag} (${member.user.id})`,
      metadata: {
        username: member.user.username,
        discriminator: member.user.discriminator,
        accountAge: Date.now() - member.user.createdTimestamp,
        hasAvatar: !!member.user.avatar,
        isBot: member.user.bot,
      },
      severity: "info",
    });

    // Check for mod log channel (reuse config from above)
    if (config && config.mod_log_channel) {
      const logChannel = member.guild.channels.cache.get(
        config.mod_log_channel
      );
      if (logChannel) {
        const { EmbedBuilder } = require("discord.js");
        const embed = new EmbedBuilder()
          .setTitle("✅ Member Joined")
          .setDescription(`**${member.user.tag}** joined the server`)
          .addFields(
            {
              name: "User",
              value: `${member.user} (${member.user.id})`,
              inline: true,
            },
            {
              name: "Account Created",
              value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
              inline: true,
            },
            {
              name: "Account Age",
              value: `${Math.floor(
                (Date.now() - member.user.createdTimestamp) / 86400000
              )} days`,
              inline: true,
            }
          )
          .setColor(0x00ff00)
          .setThumbnail(member.user.displayAvatarURL())
          .setTimestamp();

        logChannel
          .send({ embeds: [embed] })
          .catch(
            ErrorHandler.createSafeCatch(
              `guildMemberAdd [${member.guild.id}]`,
              `Send mod log for member join`
            )
          );
      }
    }

    // End performance tracking for normal joins
    const totalPerfResult = performanceMonitor.end(perfId);
    if (totalPerfResult && totalPerfResult.duration > 100) {
      // Only log if took more than 100ms
      logger.warn(
        `⚠️ Slow member join processing: ${totalPerfResult.duration.toFixed(
          2
        )}ms for ${member.user.tag}`
      );
    }
  },
};
