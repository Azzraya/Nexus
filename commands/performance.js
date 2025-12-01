const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const PerformanceMonitor = require("../utils/performanceMonitor");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("performance")
    .setDescription("View bot performance metrics")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const monitor = interaction.client.performanceMonitor;
    if (!monitor) {
      return interaction.reply({
        content: "❌ Performance monitoring not available!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const stats = monitor.getStats();
    const uptimeDays = Math.floor(stats.uptime / (1000 * 60 * 60 * 24));
    const uptimeHours = Math.floor(
      (stats.uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const uptimeMinutes = Math.floor(
      (stats.uptime % (1000 * 60 * 60)) / (1000 * 60)
    );

    const embed = new EmbedBuilder()
      .setTitle("⚡ Performance Metrics")
      .addFields(
        {
          name: "⏱️ Uptime",
          value: `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m`,
          inline: true,
        },
        {
          name: "💾 Memory Usage",
          value: `**RSS:** ${stats.memory.rss} MB\n**Heap:** ${stats.memory.heapUsed}/${stats.memory.heapTotal} MB\n**External:** ${stats.memory.external} MB`,
          inline: false,
        },
        {
          name: "📊 Commands",
          value: `**Total Executed:** ${stats.commands.total}\n**Avg Time:** ${stats.commands.averageTime.toFixed(2)}ms`,
          inline: true,
        },
        {
          name: "🗄️ Database",
          value: `**Total Queries:** ${stats.database.totalQueries}\n**Avg Time:** ${stats.database.averageTime.toFixed(2)}ms`,
          inline: true,
        },
        {
          name: "📨 Events",
          value: `**Total Processed:** ${stats.events.total}`,
          inline: true,
        }
      )
      .setColor(0x00ff00)
      .setTimestamp();

    if (stats.commands.slowest.length > 0) {
      embed.addFields({
        name: "🐌 Slowest Commands",
        value: stats.commands.slowest
          .map((c) => `\`${c.command}\`: ${c.time.toFixed(2)}ms`)
          .join("\n"),
        inline: false,
      });
    }

    if (stats.database.slowest.length > 0) {
      embed.addFields({
        name: "🐌 Slowest Queries",
        value: stats.database.slowest
          .map((q) => `\`${q.query}\`: ${q.time.toFixed(2)}ms`)
          .join("\n"),
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
