const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require("discord.js");
const Reporting = require("../utils/reporting");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("report")
    .setDescription("Generate advanced security reports ")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("generate")
        .setDescription("Generate a new report")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Report type")
            .setRequired(true)
            .addChoices(
              { name: "Full Report", value: "full" },
              { name: "Security", value: "security" },
              { name: "Moderation", value: "moderation" },
              { name: "Activity", value: "activity" }
            )
        )
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Number of days to report")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(90)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List generated reports")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View a specific report")
        .addIntegerOption((option) =>
          option.setName("id").setDescription("Report ID").setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "generate") {
      await interaction.deferReply();

      const type = interaction.options.getString("type");
      const days = interaction.options.getInteger("days") || 7;

      const report = await Reporting.generateReport(
        interaction.guild.id,
        type,
        days,
        interaction.user.id
      );

      const embed = new EmbedBuilder()
        .setTitle(`📊 ${type.charAt(0).toUpperCase() + type.slice(1)} Report`)
        .setDescription(`Report for the last ${days} days`)
        .setColor(0x0099ff)
        .setTimestamp();

      if (report.security) {
        embed.addFields({
          name: "🛡️ Security",
          value: [
            `Total Threats: **${report.security.totalThreats}**`,
            `Raids Detected: **${report.security.totalRaids}**`,
            `Avg Threat Score: **${report.security.avgThreatScore}%**`,
            `High Threats: **${report.security.highThreats}**`,
          ].join("\n"),
          inline: true,
        });
      }

      if (report.moderation) {
        embed.addFields({
          name: "🔨 Moderation",
          value: [
            `Total Actions: **${report.moderation.totalActions}**`,
            `Warnings: **${report.moderation.totalWarnings}**`,
            `Top Moderator: <@${
              report.moderation.topModerators[0]?.userId || "N/A"
            }>`,
          ].join("\n"),
          inline: true,
        });
      }

      if (report.activity) {
        embed.addFields({
          name: "📈 Activity",
          value: [
            `Total Messages: **${report.activity.totalMessages}**`,
            `Active Users: **${report.activity.activeUsers}**`,
            `Commands Used: **${report.activity.totalCommands}**`,
          ].join("\n"),
          inline: true,
        });
      }

      if (report.insights && report.insights.length > 0) {
        embed.addFields({
          name: "💡 Insights",
          value: report.insights
            .map(
              (i) =>
                `${
                  i.type === "critical"
                    ? "🔴"
                    : i.type === "warning"
                    ? "🟡"
                    : "ℹ️"
                } ${i.message}`
            )
            .join("\n"),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === "list") {
      const reports = await db.getReports(interaction.guild.id);

      if (reports.length === 0) {
        return interaction.reply({
          content: "❌ No reports found. Generate one with `/report generate`",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📊 Reports")
        .setDescription(
          reports
            .map(
              (r) =>
                `**${r.id}.** ${r.report_type} - ${new Date(
                  r.period_start
                ).toLocaleDateString()} to ${new Date(
                  r.period_end
                ).toLocaleDateString()}`
            )
            .join("\n")
        )
        .setColor(0x0099ff);

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "view") {
      await interaction.deferReply();

      const id = interaction.options.getInteger("id");
      const reports = await db.getReports(interaction.guild.id, null, 100);
      const report = reports.find((r) => r.id === id);

      if (!report) {
        return interaction.editReply({
          content: "❌ Report not found",
        });
      }

      const reportData = report.report_data;
      const embed = new EmbedBuilder()
        .setTitle(`📊 Report #${id}`)
        .setDescription(
          `Type: ${report.report_type}\nPeriod: ${new Date(
            report.period_start
          ).toLocaleDateString()} - ${new Date(
            report.period_end
          ).toLocaleDateString()}`
        )
        .setColor(0x0099ff)
        .setTimestamp(new Date(report.generated_at));

      if (reportData.security) {
        embed.addFields({
          name: "🛡️ Security Summary",
          value: JSON.stringify(reportData.security, null, 2).substring(
            0,
            1000
          ),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
