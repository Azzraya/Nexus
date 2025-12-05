const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const BehavioralAnalysis = require("../utils/behavioralAnalysis");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("behavior")
    .setDescription("Analyze user behavior patterns ")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("analyze")
        .setDescription("Analyze a user's behavior")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to analyze")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("summary")
        .setDescription("Get behavior summary for a user")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to analyze")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const user = interaction.options.getUser("user");

    if (subcommand === "analyze") {
      await interaction.deferReply();

      const summary = await BehavioralAnalysis.getBehaviorSummary(
        interaction.guild.id,
        user.id
      );

      const embed = new EmbedBuilder()
        .setTitle(`👤 Behavior Analysis: ${user.tag}`)
        .addFields(
          {
            name: "📊 Summary",
            value: [
              `Total Behaviors: **${summary.totalBehaviors}**`,
              `Risk Score: **${summary.riskScore}%**`,
              `Anomalies: **${summary.anomalies.length}**`,
            ].join("\n"),
            inline: true,
          },
          {
            name: "📈 Behavior Types",
            value:
              Object.entries(summary.behaviorTypes)
                .map(([type, count]) => `**${type}:** ${count}`)
                .join("\n") || "No data",
            inline: true,
          }
        )
        .setColor(
          summary.riskScore >= 70
            ? 0xff0000
            : summary.riskScore >= 40
              ? 0xff8800
              : 0x0099ff
        )
        .setTimestamp();

      if (summary.anomalies.length > 0) {
        embed.addFields({
          name: "⚠️ Anomalies Detected",
          value: summary.anomalies
            .map((a) => `**${a.type}** (${a.severity}): ${a.description}`)
            .join("\n"),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === "summary") {
      await interaction.deferReply();

      const summary = await BehavioralAnalysis.getBehaviorSummary(
        interaction.guild.id,
        user.id
      );

      const embed = new EmbedBuilder()
        .setTitle(`📋 Behavior Summary: ${user.tag}`)
        .setDescription(
          `**Risk Level:** ${
            summary.riskScore >= 70
              ? "🔴 High"
              : summary.riskScore >= 40
                ? "🟡 Medium"
                : "🟢 Low"
          }`
        )
        .addFields({
          name: "Details",
          value: [
            `Total Behaviors Tracked: ${summary.totalBehaviors}`,
            `Anomalies Found: ${summary.anomalies.length}`,
            `Behavior Types: ${Object.keys(summary.behaviorTypes).length}`,
          ].join("\n"),
          inline: false,
        })
        .setColor(0x0099ff)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
