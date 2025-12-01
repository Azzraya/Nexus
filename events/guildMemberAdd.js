const db = require("../utils/database");
const AdvancedAntiRaid = require("../utils/advancedAntiRaid");
const JoinGate = require("../utils/joinGate");
const ErrorHandler = require("../utils/errorHandler");
const logger = require("../utils/logger");

module.exports = {
  name: "guildMemberAdd",
  async execute(member, client) {
    // Run initial checks in parallel for better performance (EXCEEDS WICK)
    const ThreatIntelligence = require("../utils/threatIntelligence");
    const initialChecks = await Promise.all([
      ThreatIntelligence.checkThreat(member.user.id).catch(() => ({ hasThreat: false, riskScore: 0 })),
      JoinGate.checkMember(member, member.guild).catch(() => ({ filtered: false })),
      client.workflows 
        ? client.workflows.checkTriggers(member.guild.id, "guildMemberAdd", {
            user: member.user,
            member: member,
            guild: member.guild,
          }).catch(() => {})
        : Promise.resolve()
    ]);
    
    const threatCheck = initialChecks[0];
    const joinGateCheck = initialChecks[1];
    
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
      ).catch(() => {});
    }
    if (joinGateCheck.filtered) {
      // Execute action based on join gate
      if (joinGateCheck.action === "ban") {
        await ErrorHandler.safeExecute(
          member.ban({
            reason: `Join Gate: ${joinGateCheck.reason}`,
            deleteMessageDays: 1,
          }),
          `guildMemberAdd [${member.guild.id}]`,
          `Join Gate ban for ${member.user.id}`
        );
        return;
      } else if (joinGateCheck.action === "kick") {
        await ErrorHandler.safeExecute(
          member.kick(`Join Gate: ${joinGateCheck.reason}`),
          `guildMemberAdd [${member.guild.id}]`,
          `Join Gate kick for ${member.user.id}`
        );
        return;
      } else if (joinGateCheck.action === "timeout") {
        const constants = require("../utils/constants");
        await ErrorHandler.safeExecute(
          member.timeout(
            constants.JOIN_GATE.DEFAULT_TIMEOUT_DURATION,
            `Join Gate: ${joinGateCheck.reason}`
          ),
          `guildMemberAdd [${member.guild.id}]`,
          `Join Gate timeout for ${member.user.id}`
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
      // Check advanced anti-raid (multi-algorithm detection)
      const raidDetected = await AdvancedAntiRaid.detectRaid(
        member.guild,
        member
      );
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
        return; // Advanced system handled it
      }
    }

    // Check account age (common raid indicator)
    const accountAge = Date.now() - member.user.createdTimestamp;
    const daysOld = accountAge / (1000 * 60 * 60 * 24);

    if (daysOld < 7) {
      // Very new account - add heat
      await client.addHeat(
        member.guild.id,
        member.id,
        10,
        "New account (< 7 days old)"
      );
    }

    // Check if server is in lockdown
    if (client.antiRaid.lockdown.get(member.guild.id)) {
      // Auto-kick during lockdown
      await ErrorHandler.safeExecute(
        member.kick("Server is in lockdown mode"),
        `guildMemberAdd [${member.guild.id}]`,
        `Lockdown kick for ${member.user.id}`
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
        await ErrorHandler.safeExecute(
          member.ban({
            reason: `Security threat detected (Score: ${threat.score})`,
            deleteMessageDays: 1,
          }),
          `guildMemberAdd [${member.guild.id}]`,
          `Auto-ban for threat score ${threat.score}`
        );
        return;
      } else if (threat.score >= 60 && threat.action === "kick") {
        await ErrorHandler.safeExecute(
          member.kick(`Security threat detected (Score: ${threat.score})`),
          `guildMemberAdd [${member.guild.id}]`,
          `Auto-kick for threat score ${threat.score}`
        );
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
        if (role) {
          await member.roles.add(role);
        }
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
  },
};
