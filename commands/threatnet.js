const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const ThreatIntelligence = require("../utils/threatIntelligence");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("threatnet")
    .setDescription(
      "Threat Intelligence Network - Cross-server threat sharing "
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("report")
        .setDescription("Report a threat to the network")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to report")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Threat type")
            .setRequired(true)
            .addChoices(
              { name: "Raid", value: "raid" },
              { name: "Spam", value: "spam" },
              { name: "Scam", value: "scam" },
              { name: "Harassment", value: "harassment" },
              { name: "Other", value: "other" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("severity")
            .setDescription("Threat severity")
            .setRequired(true)
            .addChoices(
              { name: "Critical", value: "critical" },
              { name: "High", value: "high" },
              { name: "Medium", value: "medium" },
              { name: "Low", value: "low" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("details")
            .setDescription("Additional details")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("check")
        .setDescription("Check if a user is in the threat database")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to check")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("verify")
        .setDescription("Verify a threat report")
        .addIntegerOption((option) =>
          option
            .setName("threat_id")
            .setDescription("Threat ID to verify")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("sensitivity")
        .setDescription("Configure threat detection sensitivity")
        .addIntegerOption((option) =>
          option
            .setName("threshold")
            .setDescription("Risk score threshold (0-100, default: 30)")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(100)
        )
        .addIntegerOption((option) =>
          option
            .setName("critical")
            .setDescription("Critical severity weight (default: 40)")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(100)
        )
        .addIntegerOption((option) =>
          option
            .setName("high")
            .setDescription("High severity weight (default: 30)")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(100)
        )
        .addIntegerOption((option) =>
          option
            .setName("medium")
            .setDescription("Medium severity weight (default: 20)")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(100)
        )
        .addIntegerOption((option) =>
          option
            .setName("low")
            .setDescription("Low severity weight (default: 10)")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(100)
        )
        .addIntegerOption((option) =>
          option
            .setName("recent_multiplier")
            .setDescription("Recent threat multiplier (default: 5)")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(50)
        )
        .addIntegerOption((option) =>
          option
            .setName("recent_days")
            .setDescription("Days to consider recent (default: 7)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(30)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "report") {
      const user = interaction.options.getUser("user");
      const type = interaction.options.getString("type");
      const severity = interaction.options.getString("severity");
      const details =
        interaction.options.getString("details") || "No details provided";

      await ThreatIntelligence.reportThreat(
        user.id,
        type,
        { details, reportedBy: interaction.user.id },
        severity,
        interaction.guild.id
      );

      await interaction.reply({
        content: `✅ Threat reported to network: ${user.tag} (${type}, ${severity})`,
        ephemeral: true,
      });
    } else if (subcommand === "check") {
      await interaction.deferReply();

      const user = interaction.options.getUser("user");
      const threatInfo = await ThreatIntelligence.checkThreat(
        user.id,
        interaction.guild.id
      );

      const embed = new EmbedBuilder()
        .setTitle(`🔍 Threat Check: ${user.tag}`)
        .addFields(
          {
            name: "Status",
            value: threatInfo.hasThreat ? "⚠️ Threat Found" : "✅ No Threats",
            inline: true,
          },
          {
            name: "Risk Score",
            value: `${threatInfo.riskScore}%`,
            inline: true,
          },
          {
            name: "Threat Count",
            value: `${threatInfo.threatCount || 0}`,
            inline: true,
          },
          {
            name: "Verified Reports",
            value: `${threatInfo.verifiedCount || 0}`,
            inline: true,
          },
          {
            name: "Recent Threats",
            value: `${threatInfo.recentCount || 0} (last 7 days)`,
            inline: true,
          }
        )
        .setColor(threatInfo.hasThreat ? 0xff0000 : 0x00ff00)
        .setTimestamp();

      if (threatInfo.threats && threatInfo.threats.length > 0) {
        embed.addFields({
          name: "Recent Threats",
          value: threatInfo.threats
            .slice(0, 5)
            .map(
              (t) =>
                `**${t.threat_type}** (${t.severity}) - ${new Date(
                  t.reported_at
                ).toLocaleDateString()}`
            )
            .join("\n"),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === "verify") {
      const threatId = interaction.options.getInteger("threat_id");
      await ThreatIntelligence.verifyThreat(threatId);

      await interaction.reply({
        content: `✅ Threat #${threatId} verified`,
        ephemeral: true,
      });
    } else if (subcommand === "sensitivity") {
      await interaction.deferReply();

      const currentSettings = await db.getThreatSensitivity(
        interaction.guild.id
      );
      const newSettings = { ...currentSettings };

      // Update only provided values
      const threshold = interaction.options.getInteger("threshold");
      const critical = interaction.options.getInteger("critical");
      const high = interaction.options.getInteger("high");
      const medium = interaction.options.getInteger("medium");
      const low = interaction.options.getInteger("low");
      const recentMultiplier =
        interaction.options.getInteger("recent_multiplier");
      const recentDays = interaction.options.getInteger("recent_days");

      if (threshold !== null) newSettings.risk_threshold = threshold;
      if (critical !== null) newSettings.severity_critical = critical;
      if (high !== null) newSettings.severity_high = high;
      if (medium !== null) newSettings.severity_medium = medium;
      if (low !== null) newSettings.severity_low = low;
      if (recentMultiplier !== null)
        newSettings.recent_multiplier = recentMultiplier;
      if (recentDays !== null) newSettings.recent_days = recentDays;

      await db.setThreatSensitivity(interaction.guild.id, newSettings);

      const embed = new EmbedBuilder()
        .setTitle("⚙️ Threat Sensitivity Updated")
        .setDescription("Threat detection sensitivity has been configured.")
        .addFields(
          {
            name: "Risk Threshold",
            value: `${newSettings.risk_threshold}%`,
            inline: true,
          },
          {
            name: "Severity Weights",
            value: `Critical: ${newSettings.severity_critical}\nHigh: ${newSettings.severity_high}\nMedium: ${newSettings.severity_medium}\nLow: ${newSettings.severity_low}`,
            inline: true,
          },
          {
            name: "Recent Threats",
            value: `Multiplier: ${newSettings.recent_multiplier}\nDays: ${newSettings.recent_days}`,
            inline: true,
          }
        )
        .setColor(0x0099ff)
        .setTimestamp()
        .setFooter({
          text: "Lower threshold = more sensitive | Higher weights = more impact",
        });

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
