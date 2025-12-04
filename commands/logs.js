const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");
const EnhancedLogging = require("../utils/enhancedLogging");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Advanced log management with search and export ")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("search")
        .setDescription("Search logs")
        .addStringOption((option) =>
          option
            .setName("query")
            .setDescription("Search text")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("category")
            .setDescription("Filter by category")
            .setRequired(false)
            .addChoices(
              { name: "Moderation", value: "moderation" },
              { name: "Security", value: "security" },
              { name: "Automation", value: "automation" },
              { name: "System", value: "system" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("severity")
            .setDescription("Filter by severity")
            .setRequired(false)
            .addChoices(
              { name: "Info", value: "info" },
              { name: "Warning", value: "warning" },
              { name: "Error", value: "error" },
              { name: "Critical", value: "critical" }
            )
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Filter by user")
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Result limit")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("export")
        .setDescription("Export logs to file")
        .addStringOption((option) =>
          option
            .setName("format")
            .setDescription("Export format")
            .setRequired(false)
            .addChoices(
              { name: "JSON", value: "json" },
              { name: "CSV", value: "csv" }
            )
        )
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Number of days to export")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(90)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("stats")
        .setDescription("View log statistics")
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Number of days")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(90)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "search") {
      await interaction.deferReply();

      const filters = {};
      const query = interaction.options.getString("query");
      if (query) filters.searchText = query;

      const category = interaction.options.getString("category");
      if (category) filters.category = category;

      const severity = interaction.options.getString("severity");
      if (severity) filters.severity = severity;

      const user = interaction.options.getUser("user");
      if (user) filters.userId = user.id;

      filters.limit = interaction.options.getInteger("limit") || 20;

      const logs = await EnhancedLogging.search(interaction.guild.id, filters);

      if (logs.length === 0) {
        return interaction.editReply({
          content: "❌ No logs found matching your criteria",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Log Search Results")
        .setDescription(
          logs
            .slice(0, 10)
            .map(
              (log) =>
                `**${log.id}** [${log.severity.toUpperCase()}] ${
                  log.action || "N/A"
                } - ${new Date(log.timestamp).toLocaleString()}`
            )
            .join("\n")
        )
        .setColor(0x0099ff)
        .setFooter({ text: `Showing ${logs.length} results` });

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === "export") {
      await interaction.deferReply();

      const format = interaction.options.getString("format") || "json";
      const days = interaction.options.getInteger("days") || 7;

      const filters = {
        startTime: Date.now() - days * 86400000,
        limit: 10000,
      };

      const exported = await EnhancedLogging.export(
        interaction.guild.id,
        format,
        filters
      );

      const attachment = new AttachmentBuilder(Buffer.from(exported), {
        name: `logs_${interaction.guild.id}_${Date.now()}.${format}`,
      });

      await interaction.editReply({
        content: `✅ Exported ${days} days of logs`,
        files: [attachment],
      });
    } else if (subcommand === "stats") {
      await interaction.deferReply();

      const days = interaction.options.getInteger("days") || 7;
      const stats = await EnhancedLogging.getStats(
        interaction.guild.id,
        days * 86400000
      );

      const embed = new EmbedBuilder()
        .setTitle("📊 Log Statistics")
        .addFields(
          {
            name: "Total Logs",
            value: `${stats.total}`,
            inline: true,
          },
          {
            name: "By Category",
            value:
              Object.entries(stats.byCategory)
                .map(([k, v]) => `**${k}:** ${v}`)
                .join("\n") || "None",
            inline: true,
          },
          {
            name: "By Severity",
            value:
              Object.entries(stats.bySeverity)
                .map(([k, v]) => `**${k}:** ${v}`)
                .join("\n") || "None",
            inline: true,
          }
        )
        .setColor(0x0099ff)
        .setFooter({ text: `Last ${days} days` });

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
