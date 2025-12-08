const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View global security leaderboard")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Leaderboard type")
        .addChoices(
          { name: "Global Rankings", value: "global" },
          { name: "Your Server Stats", value: "server" },
          { name: "Growth Leaders", value: "growth" }
        )
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const type = interaction.options.getString("type") || "global";
      const ServerComparison = require("../utils/serverComparison");
      const comparison = new ServerComparison(interaction.client);

      if (type === "server") {
        // Show this server's ranking
        const report = await comparison.generateComparisonReport(
          interaction.guild.id
        );

        const embed = new EmbedBuilder()
          .setTitle(`📊 ${interaction.guild.name}'s Security Stats`)
          .setDescription(
            `**Security Score:** ${report.ranking.yourScore}/100\n` +
              `**Global Rank:** #${report.ranking.betterThan + 1} of ${report.ranking.totalServers}\n` +
              `**Percentile:** Top ${100 - report.ranking.percentile}%\n` +
              `**Badge:** ${report.badge.emoji} ${report.badge.name}`
          )
          .setColor(report.badge.color)
          .addFields(
            {
              name: "📈 Score Breakdown",
              value:
                Object.entries(report.breakdown)
                  .map(([key, value]) => `${this.formatKey(key)}: ${value}`)
                  .join("\n") || "No data",
            },
            {
              name: "💡 Top Recommendations",
              value:
                report.recommendations
                  .slice(0, 3)
                  .map(
                    (r) =>
                      `${r.priority === "critical" ? "🔴" : "🟡"} ${r.action}`
                  )
                  .join("\n") || "All good!",
            }
          )
          .setFooter({ text: "Use /dashboard to view full report" });

        await interaction.editReply({ embeds: [embed] });
      } else if (type === "growth") {
        const GrowthAnalytics = require("../utils/growthAnalytics");
        const growth = new GrowthAnalytics(interaction.client);

        const stats = await growth.getGrowthStats(interaction.guild.id, "week");

        const embed = new EmbedBuilder()
          .setTitle("📈 Growth Leaderboard")
          .setDescription(
            `**Your Server's Growth (7 days):**\n` +
              `Joins: ${stats.joins}\n` +
              `Leaves: ${stats.leaves}\n` +
              `Net Growth: ${stats.netGrowth > 0 ? "+" : ""}${stats.netGrowth}\n` +
              `Growth Rate: ${stats.growthRate.toFixed(1)}%`
          )
          .setColor(stats.netGrowth > 0 ? 0x4caf50 : 0xf44336);

        await interaction.editReply({ embeds: [embed] });
      } else {
        // Global leaderboard
        const leaderboard = await comparison.getAnonymizedLeaderboard(10);

        const embed = new EmbedBuilder()
          .setTitle("🏆 Global Security Leaderboard")
          .setDescription("Top 10 servers by security score (anonymized)")
          .setColor(0x9333ea);

        leaderboard.forEach((entry, index) => {
          const medal =
            index === 0
              ? "🥇"
              : index === 1
                ? "🥈"
                : index === 2
                  ? "🥉"
                  : `#${index + 1}`;
          embed.addFields({
            name: `${medal} ${entry.badge} ${entry.serverSize}`,
            value: `Score: ${entry.score}/100`,
            inline: true,
          });
        });

        embed.setFooter({
          text: "Use /leaderboard type:server to see your rank!",
        });

        await interaction.editReply({ embeds: [embed] });
      }

      logger.info(
        "Command",
        `/leaderboard executed in ${interaction.guild.name}`
      );
    } catch (error) {
      logger.error("Command", "Leaderboard error", error);
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription("Failed to load leaderboard. Please try again.")
        .setColor(0xf44336);

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  formatKey(key) {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());
  },
};
