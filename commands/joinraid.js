const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("joinraid")
    .setDescription("Configure Join Raid detection (advanced anti-raid)")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("enable")
        .setDescription("Enable Join Raid detection")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Disable Join Raid detection")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("config")
        .setDescription("Configure Join Raid settings")
        .addIntegerOption((option) =>
          option
            .setName("threshold")
            .setDescription("Join threshold before trigger (default: 5)")
            .setMinValue(2)
            .setMaxValue(20)
        )
        .addIntegerOption((option) =>
          option
            .setName("window")
            .setDescription("Time window in seconds (default: 10)")
            .setMinValue(5)
            .setMaxValue(60)
        )
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Action to take on detected raid")
            .addChoices(
              { name: "Ban", value: "ban" },
              { name: "Kick", value: "kick" },
              { name: "Quarantine", value: "quarantine" }
            )
        )
        .addBooleanOption((option) =>
          option
            .setName("pattern_detection")
            .setDescription("Enable pattern-based detection")
        )
        .addBooleanOption((option) =>
          option
            .setName("behavioral_detection")
            .setDescription("Enable behavioral analysis")
        )
        .addBooleanOption((option) =>
          option
            .setName("network_detection")
            .setDescription("Enable network-based detection")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("View Join Raid detection status and recent activity")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const config = await db.getServerConfig(interaction.guild.id);

    if (subcommand === "enable") {
      await db.setServerConfig(interaction.guild.id, {
        anti_raid_enabled: 1,
      });

      await interaction.reply({
        embeds: [
          {
            title: "✅ Join Raid Detection Enabled",
            description:
              "Advanced multi-algorithm join raid detection is now active.",
            color: 0x00ff00,
          },
        ],
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "disable") {
      await db.setServerConfig(interaction.guild.id, {
        anti_raid_enabled: 0,
      });

      await interaction.reply({
        embeds: [
          {
            title: "❌ Join Raid Detection Disabled",
            description: "Join raid detection is now inactive.",
            color: 0xff0000,
          },
        ],
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "config") {
      const threshold = interaction.options.getInteger("threshold");
      const window = interaction.options.getInteger("window");
      const action = interaction.options.getString("action");
      const patternDetection = interaction.options.getBoolean("pattern_detection");
      const behavioralDetection = interaction.options.getBoolean(
        "behavioral_detection"
      );
      const networkDetection = interaction.options.getBoolean(
        "network_detection"
      );

      const updates = {};
      if (threshold) updates.anti_raid_max_joins = threshold;
      if (window) updates.anti_raid_time_window = window * 1000;
      if (action) updates.anti_raid_action = action;
      if (patternDetection !== null)
        updates.anti_raid_pattern_detection = patternDetection ? 1 : 0;
      if (behavioralDetection !== null)
        updates.anti_raid_behavioral_detection = behavioralDetection ? 1 : 0;
      if (networkDetection !== null)
        updates.anti_raid_network_detection = networkDetection ? 1 : 0;

      await db.setServerConfig(interaction.guild.id, updates);

      await interaction.reply({
        embeds: [
          {
            title: "⚙️ Join Raid Configuration Updated",
            description: "Your join raid detection settings have been updated.",
            color: 0x0099ff,
          },
        ],
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "status") {
      const isEnabled = config?.anti_raid_enabled !== 0;

      // Get recent raid logs
      const recentRaids = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM anti_raid_logs WHERE guild_id = ? AND timestamp > ? ORDER BY timestamp DESC LIMIT 10",
          [interaction.guild.id, Date.now() - 86400000], // Last 24 hours
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("🛡️ Join Raid Detection Status")
        .addFields(
          {
            name: "Status",
            value: isEnabled ? "✅ Enabled" : "❌ Disabled",
            inline: true,
          },
          {
            name: "Threshold",
            value: `${config?.anti_raid_max_joins || 5} joins`,
            inline: true,
          },
          {
            name: "Time Window",
            value: `${(config?.anti_raid_time_window || 10000) / 1000}s`,
            inline: true,
          },
          {
            name: "Action",
            value: (config?.anti_raid_action || "ban").toUpperCase(),
            inline: true,
          },
          {
            name: "Recent Activity (24h)",
            value:
              recentRaids.length > 0
                ? `${recentRaids.length} actions taken`
                : "No raids detected",
            inline: true,
          },
          {
            name: "Detection Algorithms",
            value: [
              "✅ Rate-Based (Always Active)",
              config?.anti_raid_pattern_detection !== 0
                ? "✅ Pattern-Based"
                : "❌ Pattern-Based",
              config?.anti_raid_behavioral_detection !== 0
                ? "✅ Behavioral"
                : "❌ Behavioral",
              config?.anti_raid_network_detection !== 0
                ? "✅ Network-Based"
                : "❌ Network-Based",
            ].join("\n"),
            inline: false,
          }
        )
        .setColor(isEnabled ? 0x00ff00 : 0xff0000)
        .setTimestamp();

      if (recentRaids.length > 0) {
        const actionCounts = {};
        recentRaids.forEach((raid) => {
          actionCounts[raid.action_taken] =
            (actionCounts[raid.action_taken] || 0) + 1;
        });

        embed.addFields({
          name: "Actions Taken",
          value: Object.entries(actionCounts)
            .map(([action, count]) => `**${action.toUpperCase()}:** ${count}`)
            .join("\n"),
          inline: false,
        });
      }

      await interaction.reply({ embeds: [embed] });
    }
  },
};

