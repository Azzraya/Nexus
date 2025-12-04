const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("screening")
    .setDescription("Member screening system - auto-kick suspicious accounts")
    .addSubcommand((subcommand) =>
      subcommand.setName("enable").setDescription("Enable member screening")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("disable").setDescription("Disable member screening")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("config")
        .setDescription("Configure screening settings")
        .addIntegerOption((option) =>
          option
            .setName("min_account_age")
            .setDescription("Minimum account age in days (default: 7)")
            .setMinValue(0)
            .setMaxValue(365)
        )
        .addBooleanOption((option) =>
          option
            .setName("require_avatar")
            .setDescription("Require members to have an avatar")
        )
        .addIntegerOption((option) =>
          option
            .setName("auto_ban_threshold")
            .setDescription("Auto-ban if risk score >= X (default: 80)")
            .setMinValue(50)
            .setMaxValue(100)
        )
        .addIntegerOption((option) =>
          option
            .setName("auto_kick_threshold")
            .setDescription("Auto-kick if risk score >= X (default: 60)")
            .setMinValue(30)
            .setMaxValue(100)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("quarantine")
        .setDescription("Set quarantine role for suspicious members")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to assign to quarantined members")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("log")
        .setDescription("Set screening log channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel for screening logs")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("test")
        .setDescription("Test screening on a user")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to test screening on")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("View screening configuration and stats")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("logs")
        .setDescription("View recent screening logs")
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Days to look back (default: 7)")
            .setMinValue(1)
            .setMaxValue(90)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "enable") {
      await db.updateMemberScreeningConfig(interaction.guild.id, {
        enabled: 1,
      });

      return interaction.reply({
        embeds: [
          {
            title: "✅ Member Screening Enabled",
            description:
              "New members will now be screened automatically.\n\n**Tip:** Configure thresholds with `/screening config`",
            color: 0x00ff00,
            fields: [
              {
                name: "Default Settings",
                value:
                  "• Min Account Age: 7 days\n• Auto-kick: 60% risk\n• Auto-ban: 80% risk",
                inline: false,
              },
            ],
          },
        ],
      });
    }

    if (subcommand === "disable") {
      await db.updateMemberScreeningConfig(interaction.guild.id, {
        enabled: 0,
      });

      return interaction.reply({
        embeds: [
          {
            title: "❌ Member Screening Disabled",
            description: "New members will no longer be automatically screened",
            color: 0xff0000,
          },
        ],
      });
    }

    if (subcommand === "config") {
      const minAge = interaction.options.getInteger("min_account_age");
      const requireAvatar = interaction.options.getBoolean("require_avatar");
      const banThreshold = interaction.options.getInteger("auto_ban_threshold");
      const kickThreshold = interaction.options.getInteger(
        "auto_kick_threshold"
      );

      const updates = {};
      if (minAge !== null) updates.min_account_age_days = minAge;
      if (requireAvatar !== null)
        updates.require_avatar = requireAvatar ? 1 : 0;
      if (banThreshold !== null) updates.auto_ban_threshold = banThreshold;
      if (kickThreshold !== null) updates.auto_kick_threshold = kickThreshold;

      await db.updateMemberScreeningConfig(interaction.guild.id, updates);

      const config = await db.getMemberScreeningConfig(interaction.guild.id);

      return interaction.reply({
        embeds: [
          {
            title: "⚙️ Member Screening Configured",
            fields: [
              {
                name: "Minimum Account Age",
                value: `${config.min_account_age_days} days`,
                inline: true,
              },
              {
                name: "Require Avatar",
                value: config.require_avatar ? "✅ Yes" : "❌ No",
                inline: true,
              },
              {
                name: "Auto-Ban Threshold",
                value: `${config.auto_ban_threshold}%`,
                inline: true,
              },
              {
                name: "Auto-Kick Threshold",
                value: `${config.auto_kick_threshold}%`,
                inline: true,
              },
            ],
            color: 0x0099ff,
          },
        ],
      });
    }

    if (subcommand === "quarantine") {
      const role = interaction.options.getRole("role");

      await db.updateMemberScreeningConfig(interaction.guild.id, {
        quarantine_role: role.id,
        quarantine_threshold: 40,
      });

      return interaction.reply({
        embeds: [
          {
            title: "🔒 Quarantine Role Set",
            description: `Members with 40%+ risk score will be assigned ${role}`,
            color: 0xffa500,
          },
        ],
      });
    }

    if (subcommand === "log") {
      const channel = interaction.options.getChannel("channel");

      await db.updateMemberScreeningConfig(interaction.guild.id, {
        screening_log_channel: channel.id,
      });

      return interaction.reply({
        embeds: [
          {
            title: "📋 Screening Log Channel Set",
            description: `Screening actions will be logged to ${channel}`,
            color: 0x0099ff,
          },
        ],
      });
    }

    if (subcommand === "test") {
      const user = interaction.options.getUser("user");

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Create a fake member object for testing
      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      if (!member) {
        return interaction.editReply({
          content: "❌ User not in this server",
        });
      }

      const MemberScreening = require("../utils/memberScreening");
      const screening =
        interaction.client.memberScreening ||
        new MemberScreening(interaction.client);

      const result = await screening.screenMember(member, interaction.guild);

      const embed = new EmbedBuilder()
        .setTitle(`🔍 Screening Test - ${user.tag}`)
        .setDescription(
          result.passed ? "✅ Would PASS screening" : "❌ Would FAIL screening"
        )
        .setColor(result.passed ? 0x00ff00 : 0xff0000)
        .addFields(
          {
            name: "Risk Score",
            value: `${result.riskScore || 0}%`,
            inline: true,
          },
          { name: "Action", value: result.action || "None", inline: true },
          {
            name: "Flags",
            value:
              result.flags && result.flags.length > 0
                ? result.flags.join("\n")
                : "No flags",
            inline: false,
          }
        )
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "status") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const config = await db.getMemberScreeningConfig(interaction.guild.id);

      if (!config) {
        return interaction.editReply({
          content:
            "❌ Screening not configured. Use `/screening enable` to get started",
        });
      }

      const MemberScreening = require("../utils/memberScreening");
      const screening =
        interaction.client.memberScreening ||
        new MemberScreening(interaction.client);
      const stats = await screening.getScreeningStats(interaction.guild.id, 30);

      const embed = new EmbedBuilder()
        .setTitle("🔍 Member Screening Status")
        .setDescription(
          config.enabled
            ? "✅ Member screening is **active**"
            : "❌ Member screening is **disabled**"
        )
        .setColor(config.enabled ? 0x00ff00 : 0xff0000)
        .addFields(
          {
            name: "📊 Configuration",
            value: [
              `Min Account Age: **${config.min_account_age_days} days**`,
              `Require Avatar: **${config.require_avatar ? "Yes" : "No"}**`,
              `Username Patterns: **${
                config.check_username_patterns ? "Enabled" : "Disabled"
              }**`,
              `Threat Intel Check: **${
                config.check_threat_intel ? "Enabled" : "Disabled"
              }**`,
            ].join("\n"),
            inline: true,
          },
          {
            name: "⚠️ Thresholds",
            value: [
              `Auto-Ban: **${config.auto_ban_threshold}%**`,
              `Auto-Kick: **${config.auto_kick_threshold}%**`,
              `Quarantine: **${config.quarantine_threshold}%**`,
              `Alert: **${config.alert_threshold}%**`,
            ].join("\n"),
            inline: true,
          },
          {
            name: "📈 Stats (Last 30 Days)",
            value: [
              `Total Screened: **${stats.total}**`,
              `Banned: **${stats.banned}**`,
              `Kicked: **${stats.kicked}**`,
              `Quarantined: **${stats.quarantined}**`,
              `Avg Risk Score: **${stats.avgRiskScore}%**`,
            ].join("\n"),
            inline: false,
          }
        )
        .setTimestamp();

      if (config.screening_log_channel) {
        embed.addFields({
          name: "Log Channel",
          value: `<#${config.screening_log_channel}>`,
          inline: false,
        });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "logs") {
      const days = interaction.options.getInteger("days") || 7;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const since = Date.now() - days * 24 * 60 * 60 * 1000;
      const logs = await db.getMemberScreeningLogs(interaction.guild.id, since);

      if (logs.length === 0) {
        return interaction.editReply({
          content: `No screening logs found in the last ${days} days`,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Member Screening Logs")
        .setDescription(`Last ${logs.length} screening actions (${days} days)`)
        .setColor(0x0099ff)
        .setTimestamp();

      logs.slice(0, 10).forEach((log, i) => {
        embed.addFields({
          name: `${i + 1}. ${log.action.toUpperCase()} - ${log.risk_score}%`,
          value: `<@${log.user_id}> • <t:${Math.floor(
            log.timestamp / 1000
          )}:R>\n${log.reason}`,
          inline: false,
        });
      });

      embed.setFooter({
        text: `Showing ${Math.min(logs.length, 10)} of ${logs.length} logs`,
      });

      return interaction.editReply({ embeds: [embed] });
    }
  },
};
