const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("voice")
    .setDescription("Voice channel moderation")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("move")
        .setDescription("Move a user to another voice channel")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to move")
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Target voice channel")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disconnect")
        .setDescription("Disconnect a user from voice")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to disconnect")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("mute")
        .setDescription("Mute a user in voice")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to mute")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("unmute")
        .setDescription("Unmute a user in voice")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to unmute")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("stats")
        .setDescription("View voice activity statistics")
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Days to analyze (default: 7)")
            .setMinValue(1)
            .setMaxValue(90)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("monitoring")
        .setDescription("Configure voice monitoring")
        .addBooleanOption((option) =>
          option
            .setName("raid_detection")
            .setDescription("Enable voice raid detection")
        )
        .addChannelOption((option) =>
          option.setName("log_channel").setDescription("Channel for voice logs")
        )
        .addBooleanOption((option) =>
          option
            .setName("auto_create")
            .setDescription("Auto-create channels when full")
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const user = interaction.options.getUser("user");

    try {
      const member = await interaction.guild.members.fetch(user.id);

      if (subcommand === "move") {
        const channel = interaction.options.getChannel("channel");
        if (channel.type !== 2) {
          return interaction.reply({
            content: "❌ Target must be a voice channel!",
            flags: MessageFlags.Ephemeral,
          });
        }

        await member.voice.setChannel(channel);
        await interaction.reply({
          embeds: [
            {
              title: "✅ User Moved",
              description: `Moved ${user.tag} to ${channel.name}`,
              color: 0x00ff00,
            },
          ],
        });
      } else if (subcommand === "disconnect") {
        await member.voice.disconnect();
        await interaction.reply({
          embeds: [
            {
              title: "✅ User Disconnected",
              description: `Disconnected ${user.tag} from voice`,
              color: 0x00ff00,
            },
          ],
        });
      } else if (subcommand === "mute") {
        await member.voice.setMute(true);
        await interaction.reply({
          embeds: [
            {
              title: "✅ User Muted",
              description: `Muted ${user.tag} in voice`,
              color: 0x00ff00,
            },
          ],
        });
      } else if (subcommand === "unmute") {
        await member.voice.setMute(false);
        await interaction.reply({
          embeds: [
            {
              title: "✅ User Unmuted",
              description: `Unmuted ${user.tag} in voice`,
              color: 0x00ff00,
            },
          ],
        });
      }
    } catch (error) {
      await interaction.reply(ErrorMessages.commandFailed(error.message));
    }

    if (subcommand === "stats") {
      const days = interaction.options.getInteger("days") || 7;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (!interaction.client.voiceMonitoring) {
        return interaction.editReply({
          content: "❌ Voice monitoring is not enabled",
        });
      }

      const db = require("../utils/database");
      const stats = await interaction.client.voiceMonitoring.getVoiceStats(
        interaction.guild.id,
        days
      );

      const embed = new EmbedBuilder()
        .setTitle("🎤 Voice Activity Statistics")
        .setDescription(`Voice activity for the last ${days} days`)
        .setColor(0x0099ff)
        .addFields({
          name: "📊 Overview",
          value: [
            `Total Sessions: **${stats.totalSessions}**`,
            `Unique Users: **${stats.uniqueUsers}**`,
            `Avg Duration: **${Math.floor(stats.avgDuration / 60000)} min**`,
          ].join("\n"),
          inline: false,
        })
        .setTimestamp();

      // Top channels
      const topChannels = Object.entries(stats.topChannels)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (topChannels.length > 0) {
        embed.addFields({
          name: "🏆 Most Active Channels",
          value: topChannels
            .map(([channelId, count]) => `<#${channelId}>: **${count}** joins`)
            .join("\n"),
          inline: false,
        });
      }

      // Top users
      const topUsers = Object.entries(stats.topUsers)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (topUsers.length > 0) {
        embed.addFields({
          name: "🎯 Most Active Users",
          value: topUsers
            .map(([userId, count]) => `<@${userId}>: **${count}** sessions`)
            .join("\n"),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "monitoring") {
      const raidDetection = interaction.options.getBoolean("raid_detection");
      const logChannel = interaction.options.getChannel("log_channel");
      const autoCreate = interaction.options.getBoolean("auto_create");

      const db = require("../utils/database");
      const updates = {};

      if (raidDetection !== null)
        updates.raid_detection_enabled = raidDetection ? 1 : 0;
      if (logChannel) updates.log_channel = logChannel.id;
      if (autoCreate !== null) updates.auto_create_enabled = autoCreate ? 1 : 0;

      await db.updateVoiceMonitoringConfig(interaction.guild.id, updates);

      const embed = new EmbedBuilder()
        .setTitle("⚙️ Voice Monitoring Configured")
        .setColor(0x0099ff)
        .setTimestamp();

      const config = await db.getVoiceMonitoringConfig(interaction.guild.id);

      embed.addFields(
        {
          name: "Raid Detection",
          value: config.raid_detection_enabled ? "✅ Enabled" : "❌ Disabled",
          inline: true,
        },
        {
          name: "Auto-Create Channels",
          value: config.auto_create_enabled ? "✅ Enabled" : "❌ Disabled",
          inline: true,
        }
      );

      if (config.log_channel) {
        embed.addFields({
          name: "Log Channel",
          value: `<#${config.log_channel}>`,
          inline: false,
        });
      }

      await interaction.reply({ embeds: [embed] });
    }
  },
};
