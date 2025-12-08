const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("compare")
    .setDescription("Compare your server's security to others"),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const ServerComparison = require("../utils/serverComparison");
      const comparison = new ServerComparison(interaction.client);

      const report = await comparison.generateComparisonReport(
        interaction.guild.id
      );

      const embed = new EmbedBuilder()
        .setTitle("📊 Server Security Comparison")
        .setDescription(
          `**${interaction.guild.name}**\n\n` +
            `**Your Score:** ${report.ranking.yourScore}/100 ${report.badge.emoji}\n` +
            `**Global Rank:** #${report.ranking.betterThan + 1} of ${report.ranking.totalServers}\n` +
            `**Percentile:** Better than ${report.ranking.percentile}% of servers\n\n` +
            `**Badge:** ${report.badge.emoji} ${report.badge.name}`
        )
        .setColor(parseInt(report.badge.color.replace("#", ""), 16))
        .addFields(
          {
            name: "📈 Your Breakdown",
            value: Object.entries(report.breakdown)
              .map(
                ([key, value]) =>
                  `${this.formatKey(key)}: ${value}/${this.getMaxScore(key)}`
              )
              .join("\n"),
            inline: true,
          },
          {
            name: "📊 Network Average",
            value: Object.entries(report.averages)
              .map(([key, value]) => `${this.formatKey(key)}: ${value}`)
              .join("\n"),
            inline: true,
          }
        )
        .addFields({
          name: "💡 Top Recommendations",
          value:
            report.recommendations
              .slice(0, 3)
              .map(
                (r) =>
                  `${r.priority === "critical" ? "🔴" : "🟡"} **${r.action}** (${r.impact})`
              )
              .join("\n") || "Your server is optimally configured! 🎉",
        })
        .setFooter({
          text: "Use /dashboard for detailed analysis and improvements",
        });

      await interaction.editReply({ embeds: [embed] });

      logger.info("Command", `/compare executed in ${interaction.guild.name}`);
    } catch (error) {
      logger.error("Command", "Compare error", error);
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription("Failed to generate comparison. Please try again.")
        .setColor(0xf44336);

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  formatKey(key) {
    const names = {
      antiRaid: "Anti-Raid",
      antiNuke: "Anti-Nuke",
      autoMod: "Auto-Mod",
      verification: "Verification",
      logging: "Logging",
      heatSystem: "Heat System",
      joinGate: "Join Gate",
      webhooks: "Webhooks",
      overall: "Overall",
    };
    return names[key] || key;
  },

  getMaxScore(key) {
    const max = {
      antiRaid: 20,
      antiNuke: 25,
      autoMod: 15,
      verification: 10,
      logging: 10,
      heatSystem: 10,
      joinGate: 5,
      webhooks: 5,
    };
    return max[key] || 100;
  },
};
