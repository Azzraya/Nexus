const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("quicksetup")
    .setDescription("Interactive setup wizard to configure Nexus in minutes")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const { guild } = interaction;

    // Initial setup embed
    const setupEmbed = new EmbedBuilder()
      .setTitle("🚀 Nexus Quick Setup Wizard")
      .setDescription(
        "Let's get Nexus configured for your server! This wizard will help you:\n\n" +
          "✅ Enable core security features\n" +
          "✅ Configure logging channels\n" +
          "✅ Set up moderation roles\n" +
          "✅ Enable automod systems\n\n" +
          "Click the buttons below to configure each feature."
      )
      .setColor(0x667eea)
      .setFooter({ text: "You can always change these settings later" });

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setup_security")
        .setLabel("Security")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🛡️"),
      new ButtonBuilder()
        .setCustomId("setup_logging")
        .setLabel("Logging")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📝"),
      new ButtonBuilder()
        .setCustomId("setup_automod")
        .setLabel("Automod")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🤖"),
      new ButtonBuilder()
        .setCustomId("setup_complete")
        .setLabel("Finish")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅")
    );

    await interaction.reply({
      embeds: [setupEmbed],
      components: [buttons],
      flags: MessageFlags.Ephemeral,
    });

    // Button collector
    const collector = interaction.channel.createMessageComponentCollector({
      time: 300000, // 5 minutes
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: "This setup is not for you!",
          ephemeral: true,
        });
      }

      if (i.customId === "setup_security") {
        // Defer reply to prevent timeout
        await i.deferReply({ ephemeral: true });

        // Enable security features
        await db.setServerConfig(guild.id, {
          anti_raid_enabled: 1,
          anti_nuke_enabled: 1,
          join_gate_enabled: 1,
          heat_system_enabled: 1,
          security_alerts_enabled: 1,
        });

        await i.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("🛡️ Security Features Enabled")
              .setDescription(
                "✅ **Anti-Raid** - 4 detection algorithms\n" +
                  "✅ **Anti-Nuke** - Prevents server destruction\n" +
                  "✅ **Join Gate** - Automatic member screening\n" +
                  "✅ **Heat System** - Tracks suspicious activity\n" +
                  "✅ **Security Alerts** - Get notified of threats"
              )
              .setColor(0x00ff88),
          ],
          ephemeral: true,
        });
      } else if (i.customId === "setup_logging") {
        // Suggest creating a logs channel
        let logChannel = guild.channels.cache.find(
          (ch) => ch.name === "nexus-logs"
        );

        if (!logChannel) {
          // Ask if they want to create it
          await i.reply({
            content:
              "Would you like me to create a **#nexus-logs** channel for moderation logs?",
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId("create_log_channel")
                  .setLabel("Create Channel")
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId("skip_log_channel")
                  .setLabel("Skip")
                  .setStyle(ButtonStyle.Secondary)
              ),
            ],
            ephemeral: true,
          });

          const logCollector = i.channel.createMessageComponentCollector({
            time: 30000,
          });

          logCollector.on("collect", async (btnInt) => {
            if (btnInt.customId === "create_log_channel") {
              try {
                logChannel = await guild.channels.create({
                  name: "nexus-logs",
                  type: ChannelType.GuildText,
                  topic: "Nexus Bot moderation logs and security alerts",
                  permissionOverwrites: [
                    {
                      id: guild.roles.everyone.id,
                      deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                      id: interaction.user.id,
                      allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                      ],
                    },
                  ],
                });

                await db.setServerConfig(guild.id, {
                  mod_log_channel: logChannel.id,
                });

                await btnInt.update({
                  content: `✅ Created ${logChannel} and configured logging!`,
                  components: [],
                });
              } catch (error) {
                let errorMsg = "❌ Failed to create channel. ";

                if (error.code === 50013) {
                  errorMsg +=
                    "**Missing Permissions**: I need the `Manage Channels` permission.";
                } else if (error.code === 50001) {
                  errorMsg +=
                    "**Missing Access**: I don't have access to create channels.";
                } else if (error.code === 30013) {
                  errorMsg +=
                    "**Maximum Channels**: Server has reached the maximum number of channels.";
                } else {
                  errorMsg += `**Error**: ${error.message}`;
                }

                errorMsg +=
                  "\n\n💡 **Manual Setup**: Create a channel called `#nexus-logs` and use `/config logchannel #nexus-logs` to configure it.";

                await btnInt.update({
                  content: errorMsg,
                  components: [],
                });
              }
            } else {
              await btnInt.update({
                content: "⏭️ Skipped log channel setup.",
                components: [],
              });
            }
          });
        } else {
          await db.setServerConfig(guild.id, {
            mod_log_channel: logChannel.id,
          });

          await i.reply({
            content: `✅ Configured logging to ${logChannel}`,
            ephemeral: true,
          });
        }
      } else if (i.customId === "setup_automod") {
        // Defer reply to prevent timeout
        await i.deferReply({ ephemeral: true });

        // Enable automod
        await new Promise((resolve, reject) => {
          db.db.run(
            `INSERT OR REPLACE INTO automod_config (guild_id, enabled, spam_enabled, link_scanning_enabled, caps_enabled) VALUES (?, 1, 1, 1, 1)`,
            [guild.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        await i.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("🤖 Automod Enabled")
              .setDescription(
                "✅ **Spam Detection** - Prevents message spam\n" +
                  "✅ **Link Scanning** - Blocks malicious links\n" +
                  "✅ **Caps Detection** - Limits excessive caps\n\n" +
                  "Configure more with `/automod config`"
              )
              .setColor(0x00ff88),
          ],
          ephemeral: true,
        });
      } else if (i.customId === "setup_complete") {
        collector.stop();

        const config = await db.getServerConfig(guild.id);

        await i.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Setup Complete!")
              .setDescription(
                "Nexus is now configured and protecting your server!\n\n" +
                  "**Next Steps:**\n" +
                  "• Use `/help` to see all commands\n" +
                  "• Configure advanced features with specific commands\n" +
                  "• Visit the [dashboard](https://regular-puma-clearly.ngrok-free.app) for more options"
              )
              .addFields(
                {
                  name: "Security Features",
                  value: config?.anti_raid_enabled
                    ? "✅ Enabled"
                    : "❌ Disabled",
                  inline: true,
                },
                {
                  name: "Automod",
                  value: config?.automod_enabled ? "✅ Enabled" : "❌ Disabled",
                  inline: true,
                },
                {
                  name: "Logging",
                  value: config?.mod_log_channel
                    ? `✅ <#${config.mod_log_channel}>`
                    : "❌ Not set",
                  inline: true,
                }
              )
              .setColor(0x00ff88)
              .setFooter({ text: "Thank you for choosing Nexus!" }),
          ],
          components: [],
        });
      }
    });

    collector.on("end", async (collected, reason) => {
      if (reason === "time") {
        await interaction.editReply({
          content:
            "⏱️ Setup wizard timed out. Run `/quicksetup` again to continue.",
          components: [],
        });
      }
    });
  },
};
