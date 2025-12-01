const { InteractionType, MessageFlags } = require("discord.js");
const db = require("../utils/database");
const ErrorHandler = require("../utils/errorHandler");
const logger = require("../utils/logger");

module.exports = {
  name: "interactionCreate",
  async execute(interaction, client) {
    if (interaction.type === InteractionType.ApplicationCommand) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        // Log command usage
        logger.info(`Command used: /${interaction.commandName}`, {
          guildId: interaction.guild.id,
          guildName: interaction.guild.name,
          userId: interaction.user.id,
          userTag: interaction.user.tag,
          commandName: interaction.commandName,
        });

        // Log command usage to database
        try {
          await new Promise((resolve, reject) => {
            db.db.run(
              "INSERT INTO command_usage_log (guild_id, guild_name, user_id, user_tag, command_name, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
              [
                interaction.guild.id,
                interaction.guild.name,
                interaction.user.id,
                interaction.user.tag,
                interaction.commandName,
                Date.now(),
              ],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
        } catch (logError) {
          // Don't fail command if logging fails
          ErrorHandler.logError(
            logError,
            "interactionCreate",
            "Log command usage to database"
          );
        }

        // Track performance
        const startTime = Date.now();
        await command.execute(interaction);
        const executionTime = Date.now() - startTime;
        
        if (client.performanceMonitor) {
          client.performanceMonitor.trackCommand(command.data.name, executionTime);
        }

        await db.updateUserStats(
          interaction.guild.id,
          interaction.user.id,
          "commands_used"
        );
      } catch (error) {
        // Use ErrorHelper for better error messages
        const ErrorHelper = require("../utils/errorHelper");

        // Log error with full context
        ErrorHelper.logError(error, {
          commandName: interaction.commandName,
          userId: interaction.user.id,
          guildId: interaction.guild?.id,
          channelId: interaction.channel?.id,
        });

        // Get user-friendly error message
        const errorInfo = ErrorHelper.getErrorMessage(error, {
          commandName: interaction.commandName,
          userId: interaction.user.id,
          guildId: interaction.guild?.id,
        });

        // Create troubleshooting embed
        const embed = ErrorHelper.createTroubleshootingEmbed(error, {
          commandName: interaction.commandName,
          userId: interaction.user.id,
          guildId: interaction.guild?.id,
        });

        // Try to reply, but don't crash if that fails too
        if (interaction.replied || interaction.deferred) {
          await ErrorHandler.safeExecute(
            interaction.editReply({ embeds: [embed] }),
            "interactionCreate",
            `Edit error reply for ${interaction.commandName}`
          );
        } else {
          await ErrorHandler.safeExecute(
            interaction.reply({
              embeds: [embed],
              flags: MessageFlags.Ephemeral,
            }),
            "interactionCreate",
            `Reply with error for ${interaction.commandName}`
          );
        }
      }
    } else if (interaction.type === InteractionType.MessageComponent) {
      // Handle button interactions
      if (interaction.isButton()) {
        // Handle wizard buttons FIRST (before other button checks)
        if (
          interaction.customId &&
          interaction.customId.startsWith("wizard_")
        ) {
          const setupCommand = client.commands.get("setup");
          if (setupCommand) {
            try {
              if (interaction.customId === "wizard_start") {
                await interaction.deferUpdate();
                await setupCommand.handleWizardStep(interaction, "start");
                return;
              }

              if (interaction.customId === "wizard_cancel") {
                await interaction.update({
                  content: "❌ Setup wizard cancelled.",
                  embeds: [],
                  components: [],
                });
                return;
              }

              // Handle preset selection (wizard_gaming, wizard_community, etc.)
              if (
                [
                  "wizard_gaming",
                  "wizard_community",
                  "wizard_business",
                  "wizard_streaming",
                  "wizard_educational",
                ].includes(interaction.customId)
              ) {
                await interaction.deferUpdate();
                const presetType = interaction.customId.replace("wizard_", "");
                // Add options to the original interaction object
                // This preserves all interaction properties (guild, editReply, etc.)
                interaction.options = {
                  getSubcommand: () => "preset",
                  getString: (name) => (name === "type" ? presetType : null),
                };
                await setupCommand.applyPreset(interaction);
                return;
              }
            } catch (error) {
              logger.error("Error handling wizard button:", error);
              const ErrorHandler = require("../utils/errorHandler");
              ErrorHandler.logError(
                error,
                "interactionCreate",
                "Handle wizard button"
              );
              if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                  content:
                    "❌ An error occurred. Please try `/setup preset` instead.",
                  flags: MessageFlags.Ephemeral,
                });
              } else {
                await interaction.editReply({
                  content:
                    "❌ An error occurred. Please try `/setup preset` instead.",
                });
              }
            }
            return;
          }
        }

        // Handle poll votes
        if (
          interaction.customId &&
          interaction.customId.startsWith("poll_vote_")
        ) {
          const pollCommand = client.commands.get("poll");
          if (pollCommand && pollCommand.handlePollVote) {
            try {
              await pollCommand.handlePollVote(interaction);
            } catch (error) {
              logger.error("Error handling poll vote:", error);
              const ErrorHandler = require("../utils/errorHandler");
              ErrorHandler.logError(
                error,
                "interactionCreate",
                "Handle poll vote"
              );
            }
          }
          return;
        }

        // Handle suggestion votes
        if (
          interaction.customId &&
          (interaction.customId === "suggest_upvote" ||
            interaction.customId === "suggest_downvote")
        ) {
          const suggestCommand = client.commands.get("suggest");
          if (suggestCommand && suggestCommand.handleSuggestionVote) {
            try {
              await suggestCommand.handleSuggestionVote(interaction);
            } catch (error) {
              logger.error("Error handling suggestion vote:", error);
              const ErrorHandler = require("../utils/errorHandler");
              ErrorHandler.logError(
                error,
                "interactionCreate",
                "Handle suggestion vote"
              );
            }
          }
          return;
        }

        // Handle dashboard buttons
        if (
          interaction.customId &&
          interaction.customId.startsWith("dashboard_")
        ) {
          const view = interaction.customId.split("_")[1]; // security, moderation, activity, performance
          const { EmbedBuilder } = require("discord.js");
          const db = require("../utils/database");

          await interaction.deferUpdate();

          try {
            if (view === "security") {
              // Security dashboard
              const recentThreats = await new Promise((resolve, reject) => {
                db.db.all(
                  "SELECT * FROM security_logs WHERE guild_id = ? AND timestamp > ? ORDER BY threat_score DESC LIMIT 10",
                  [interaction.guild.id, Date.now() - 86400000],
                  (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                  }
                );
              });

              const avgThreatScore = await new Promise((resolve, reject) => {
                db.db.get(
                  "SELECT AVG(threat_score) as avg FROM security_logs WHERE guild_id = ? AND timestamp > ?",
                  [interaction.guild.id, Date.now() - 86400000],
                  (err, row) => {
                    if (err) reject(err);
                    else resolve(row?.avg || 0);
                  }
                );
              });

              const embed = new EmbedBuilder()
                .setTitle("🛡️ Security Dashboard")
                .addFields(
                  {
                    name: "📊 24h Statistics",
                    value: [
                      `Threats Detected: **${recentThreats.length}**`,
                      `Avg Threat Score: **${Math.round(avgThreatScore)}%**`,
                      `High Risk (>80%): **${
                        recentThreats.filter((t) => t.threat_score >= 80).length
                      }**`,
                    ].join("\n"),
                    inline: true,
                  },
                  {
                    name: "🔍 Top Threats",
                    value:
                      recentThreats.length > 0
                        ? recentThreats
                            .slice(0, 5)
                            .map(
                              (t, i) =>
                                `${i + 1}. <@${t.user_id}> - ${t.threat_score}%`
                            )
                            .join("\n")
                        : "No threats detected",
                    inline: false,
                  }
                )
                .setColor(0xff0000)
                .setTimestamp();

              const {
                ActionRowBuilder,
                ButtonBuilder,
                ButtonStyle,
              } = require("discord.js");
              const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId("dashboard_overview")
                  .setLabel("Overview")
                  .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                  .setCustomId("dashboard_security")
                  .setLabel("Security")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("dashboard_moderation")
                  .setLabel("Moderation")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("dashboard_activity")
                  .setLabel("Activity")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("dashboard_performance")
                  .setLabel("Performance")
                  .setStyle(ButtonStyle.Success)
              );

              await interaction.editReply({
                embeds: [embed],
                components: [buttons],
              });
              return;
            } else if (view === "moderation") {
              // Moderation dashboard
              const recentActions = await new Promise((resolve, reject) => {
                db.db.all(
                  "SELECT action, COUNT(*) as count FROM moderation_logs WHERE guild_id = ? AND timestamp > ? GROUP BY action",
                  [interaction.guild.id, Date.now() - 86400000],
                  (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                  }
                );
              });

              const embed = new EmbedBuilder()
                .setTitle("🔨 Moderation Dashboard")
                .addFields(
                  {
                    name: "📊 24h Actions",
                    value:
                      recentActions.length > 0
                        ? recentActions
                            .map(
                              (a) => `**${a.action.toUpperCase()}:** ${a.count}`
                            )
                            .join("\n")
                        : "No actions taken",
                    inline: true,
                  },
                  {
                    name: "📈 Trends",
                    value: "Use `/analytics` for detailed trends",
                    inline: true,
                  }
                )
                .setColor(0x0099ff)
                .setTimestamp();

              const {
                ActionRowBuilder,
                ButtonBuilder,
                ButtonStyle,
              } = require("discord.js");
              const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId("dashboard_overview")
                  .setLabel("Overview")
                  .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                  .setCustomId("dashboard_security")
                  .setLabel("Security")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("dashboard_moderation")
                  .setLabel("Moderation")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("dashboard_activity")
                  .setLabel("Activity")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("dashboard_performance")
                  .setLabel("Performance")
                  .setStyle(ButtonStyle.Success)
              );

              await interaction.editReply({
                embeds: [embed],
                components: [buttons],
              });
              return;
            } else if (view === "activity") {
              const activity = await new Promise((resolve, reject) => {
                db.db.all(
                  "SELECT user_id, messages_sent, commands_used FROM user_stats WHERE guild_id = ? ORDER BY messages_sent DESC LIMIT 10",
                  [interaction.guild.id],
                  (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                  }
                );
              });

              const embed = new EmbedBuilder()
                .setTitle("📈 Activity Dashboard")
                .addFields({
                  name: "🏆 Top Users",
                  value:
                    activity.length > 0
                      ? activity
                          .slice(0, 10)
                          .map(
                            (a, i) =>
                              `${i + 1}. <@${a.user_id}> - ${
                                a.messages_sent
                              } msgs, ${a.commands_used} cmds`
                          )
                          .join("\n")
                      : "No activity data",
                  inline: false,
                })
                .setColor(0x0099ff)
                .setTimestamp();

              const {
                ActionRowBuilder,
                ButtonBuilder,
                ButtonStyle,
              } = require("discord.js");
              const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId("dashboard_overview")
                  .setLabel("Overview")
                  .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                  .setCustomId("dashboard_security")
                  .setLabel("Security")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("dashboard_moderation")
                  .setLabel("Moderation")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("dashboard_activity")
                  .setLabel("Activity")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("dashboard_performance")
                  .setLabel("Performance")
                  .setStyle(ButtonStyle.Success)
              );

              await interaction.editReply({
                embeds: [embed],
                components: [buttons],
              });
              return;
            } else if (view === "performance") {
              const embed = new EmbedBuilder()
                .setTitle("⚡ Performance Dashboard")
                .addFields({
                  name: "Bot Performance",
                  value: [
                    `WebSocket Ping: **${interaction.client.ws.ping}ms**`,
                    `Uptime: **${Math.floor(
                      interaction.client.uptime / 1000 / 60
                    )} minutes**`,
                    `Servers: **${interaction.client.guilds.cache.size}**`,
                    `Users: **${interaction.client.users.cache.size}**`,
                  ].join("\n"),
                  inline: false,
                })
                .setColor(0x00ff00)
                .setTimestamp();

              const {
                ActionRowBuilder,
                ButtonBuilder,
                ButtonStyle,
              } = require("discord.js");
              const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId("dashboard_overview")
                  .setLabel("Overview")
                  .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                  .setCustomId("dashboard_security")
                  .setLabel("Security")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("dashboard_moderation")
                  .setLabel("Moderation")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("dashboard_activity")
                  .setLabel("Activity")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("dashboard_performance")
                  .setLabel("Performance")
                  .setStyle(ButtonStyle.Success)
              );

              await interaction.editReply({
                embeds: [embed],
                components: [buttons],
              });
              return;
            } else if (view === "overview") {
              // Overview dashboard
              const totalCases = await new Promise((resolve, reject) => {
                db.db.get(
                  "SELECT COUNT(*) as count FROM moderation_logs WHERE guild_id = ?",
                  [interaction.guild.id],
                  (err, row) => {
                    if (err) reject(err);
                    else resolve(row?.count || 0);
                  }
                );
              });

              const totalWarnings = await new Promise((resolve, reject) => {
                db.db.get(
                  "SELECT COUNT(*) as count FROM warnings WHERE guild_id = ?",
                  [interaction.guild.id],
                  (err, row) => {
                    if (err) reject(err);
                    else resolve(row?.count || 0);
                  }
                );
              });

              const recentRaids = await new Promise((resolve, reject) => {
                db.db.get(
                  "SELECT COUNT(*) as count FROM anti_raid_logs WHERE guild_id = ? AND timestamp > ?",
                  [interaction.guild.id, Date.now() - 86400000],
                  (err, row) => {
                    if (err) reject(err);
                    else resolve(row?.count || 0);
                  }
                );
              });

              const config = await db.getServerConfig(interaction.guild.id);

              const embed = new EmbedBuilder()
                .setTitle("📊 Nexus Dashboard - Overview")
                .setDescription("Comprehensive server analytics and insights")
                .addFields(
                  {
                    name: "🛡️ Security Status",
                    value: [
                      `Anti-Raid: ${config?.anti_raid_enabled ? "✅" : "❌"}`,
                      `Anti-Nuke: ${config?.anti_nuke_enabled ? "✅" : "❌"}`,
                      `Join Gate: ${config?.join_gate_enabled ? "✅" : "❌"}`,
                      `Heat System: ${
                        config?.heat_system_enabled ? "✅" : "❌"
                      }`,
                    ].join("\n"),
                    inline: true,
                  },
                  {
                    name: "📈 Statistics",
                    value: [
                      `Total Cases: **${totalCases}**`,
                      `Total Warnings: **${totalWarnings}**`,
                      `Raids (24h): **${recentRaids}**`,
                      `Members: **${interaction.guild.memberCount}**`,
                    ].join("\n"),
                    inline: true,
                  },
                  {
                    name: "⚡ Quick Actions",
                    value: "Use buttons below to view detailed sections",
                    inline: false,
                  }
                )
                .setColor(0x0099ff)
                .setTimestamp()
                .setFooter({ text: "Nexus - Beyond Wick" });

              const {
                ActionRowBuilder,
                ButtonBuilder,
                ButtonStyle,
              } = require("discord.js");
              const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId("dashboard_security")
                  .setLabel("Security")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("dashboard_moderation")
                  .setLabel("Moderation")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("dashboard_activity")
                  .setLabel("Activity")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("dashboard_performance")
                  .setLabel("Performance")
                  .setStyle(ButtonStyle.Success)
              );

              await interaction.editReply({
                embeds: [embed],
                components: [buttons],
              });
              return;
            }
          } catch (error) {
            console.error("Error handling dashboard button:", error);
            await interaction.followUp({
              content: "❌ An error occurred while loading the dashboard view.",
              flags: MessageFlags.Ephemeral,
            });
          }
        }

        // Handle create_ticket button
        if (interaction.customId === "create_ticket") {
          const config = await db.getServerConfig(interaction.guild.id);
          if (!config || !config.ticket_category) {
            return interaction.reply({
              content:
                "❌ Ticket system not configured! Use `/ticket setup` first.",
              flags: MessageFlags.Ephemeral,
            });
          }

          const category = interaction.guild.channels.cache.get(
            config.ticket_category
          );
          if (!category) {
            return interaction.reply({
              content: "❌ Ticket category not found!",
              flags: MessageFlags.Ephemeral,
            });
          }

          const ticketChannel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: 0, // Text channel
            parent: category.id,
            permissionOverwrites: [
              {
                id: interaction.guild.id,
                deny: ["ViewChannel"],
              },
              {
                id: interaction.user.id,
                allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"],
              },
            ],
          });

          await db.createTicket(
            interaction.guild.id,
            ticketChannel.id,
            interaction.user.id
          );

          await interaction.reply({
            content: `✅ Ticket created: ${ticketChannel}`,
            flags: MessageFlags.Ephemeral,
          });

          await ticketChannel.send({
            content: `${interaction.user}, your ticket has been created!`,
            embeds: [
              {
                title: "🎫 Ticket",
                description:
                  "Please describe your issue. Staff will assist you shortly.",
                color: 0x0099ff,
              },
            ],
          });
          return;
        }

        // Handle verification
        if (interaction.customId === "verify_button") {
          const config = await db.getServerConfig(interaction.guild.id);
          if (
            !config ||
            !config.verification_enabled ||
            !config.verification_role
          ) {
            return interaction.reply({
              content: "❌ Verification system not configured!",
              flags: MessageFlags.Ephemeral,
            });
          }

          const role = interaction.guild.roles.cache.get(
            config.verification_role
          );
          if (!role) {
            return interaction.reply({
              content: "❌ Verification role not found!",
              flags: MessageFlags.Ephemeral,
            });
          }

          try {
            await interaction.member.roles.add(role);
            await interaction.reply({
              content: "✅ You have been verified!",
              flags: MessageFlags.Ephemeral,
            });
          } catch (error) {
            await interaction.reply({
              content: "❌ Failed to verify. Please contact an administrator.",
              flags: MessageFlags.Ephemeral,
            });
          }
          return;
        }

        // Handle reaction roles
        if (interaction.customId.startsWith("reactionrole_")) {
          const roleId = interaction.customId.split("_")[1];
          const role = interaction.guild.roles.cache.get(roleId);

          if (!role) {
            return interaction.reply({
              content: "❌ Role not found!",
              flags: MessageFlags.Ephemeral,
            });
          }

          if (interaction.member.roles.cache.has(roleId)) {
            await interaction.member.roles.remove(role);
            await interaction.reply({
              content: `✅ Removed role: ${role.name}`,
              flags: MessageFlags.Ephemeral,
            });
          } else {
            await interaction.member.roles.add(role);
            await interaction.reply({
              content: `✅ Added role: ${role.name}`,
              flags: MessageFlags.Ephemeral,
            });
          }
          return;
        }

        // Handle report actions
        if (interaction.customId.startsWith("report_")) {
          const parts = interaction.customId.split("_");
          const action = parts[1]; // ban, kick, warn, dismiss
          const userId = parts[2];

          if (!interaction.member.permissions.has("ModerateMembers")) {
            return interaction.reply({
              content: "❌ You don't have permission to moderate!",
              flags: MessageFlags.Ephemeral,
            });
          }

          const user = await interaction.client.users
            .fetch(userId)
            .catch(() => null);
          if (!user) {
            return interaction.reply({
              content: "❌ User not found!",
              flags: MessageFlags.Ephemeral,
            });
          }

          const Moderation = require("../utils/moderation");

          if (action === "ban") {
            await Moderation.ban(
              interaction.guild,
              user,
              interaction.user,
              "Reported by user"
            );
          } else if (action === "kick") {
            await Moderation.kick(
              interaction.guild,
              user,
              interaction.user,
              "Reported by user"
            );
          } else if (action === "warn") {
            await Moderation.warn(
              interaction.guild,
              user,
              interaction.user,
              "Reported by user"
            );
          }

          // Update message
          await interaction.message.edit({
            components: [],
            embeds: [
              {
                title: "✅ Report Handled",
                description: `Action taken: **${action.toUpperCase()}**\nHandled by: ${
                  interaction.user.tag
                }`,
                color: 0x00ff00,
              },
            ],
          });

          await interaction.reply({
            content: `✅ ${
              action === "dismiss"
                ? "Report dismissed"
                : `${action}ed ${user.tag}`
            }`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        // Handle giveaway entries
        if (interaction.customId.startsWith("giveaway_")) {
          const giveawayData = await new Promise((resolve, reject) => {
            db.db.get(
              "SELECT * FROM giveaways WHERE message_id = ?",
              [interaction.message.id],
              (err, row) => {
                if (err) reject(err);
                else resolve(row);
              }
            );
          });

          if (!giveawayData) {
            return interaction.reply({
              content: "❌ Giveaway not found!",
              flags: MessageFlags.Ephemeral,
            });
          }

          if (Date.now() > giveawayData.ends_at) {
            return interaction.reply({
              content: "❌ This giveaway has ended!",
              flags: MessageFlags.Ephemeral,
            });
          }

          const entries = JSON.parse(giveawayData.entries || "[]");
          if (entries.includes(interaction.user.id)) {
            return interaction.reply({
              content: "❌ You're already entered!",
              flags: MessageFlags.Ephemeral,
            });
          }

          entries.push(interaction.user.id);
          await new Promise((resolve, reject) => {
            db.db.run(
              "UPDATE giveaways SET entries = ? WHERE message_id = ?",
              [JSON.stringify(entries), interaction.message.id],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });

          await interaction.reply({
            content: "✅ You've entered the giveaway!",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }
    }
  },
};
