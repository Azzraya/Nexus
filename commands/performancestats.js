const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const performanceMonitor = require("../utils/performanceMonitor");
const cache = require("../utils/cache");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("performancestats")
    .setDescription("View bot performance statistics (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const summary = performanceMonitor.getSummary();
    const slowest = performanceMonitor.getSlowestCommands(5);
    const mostUsed = performanceMonitor.getAllStats().slice(0, 5);
    const cacheStats = cache.getStats();

    const embed = new EmbedBuilder()
      .setTitle("📊 Performance Statistics")
      .setColor("#667eea")
      .addFields(
        {
          name: "📈 Overall Performance",
          value: [
            `Total Commands Tracked: **${summary.totalCommands}**`,
            `Total Executions: **${summary.totalExecutions}**`,
            `Success Rate: **${summary.overallSuccessRate}**`,
            `Avg Duration: **${summary.avgCommandDuration}**`,
          ].join("\n"),
          inline: false,
        },
        {
          name: "🐌 Slowest Commands (Avg)",
          value: slowest.length > 0 
            ? slowest.map(s => `\`/${s.command}\` - ${s.avgDuration}ms (${s.executions}x)`).join("\n")
            : "No data yet",
          inline: true,
        },
        {
          name: "🔥 Most Used Commands",
          value: mostUsed.length > 0
            ? mostUsed.map(s => `\`/${s.command}\` - ${s.executions}x`).join("\n")
            : "No data yet",
          inline: true,
        },
        {
          name: "💾 Cache Statistics",
          value: [
            `Hit Rate: **${cacheStats.hitRate}**`,
            `Entries: **${cacheStats.size}**`,
            `Hits: ${cacheStats.hits} | Misses: ${cacheStats.misses}`,
          ].join("\n"),
          inline: false,
        }
      )
      .setFooter({ text: "Performance data since last restart" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

