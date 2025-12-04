const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("compare")
    .setDescription("Compare your server configuration with optimal settings")
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("What to compare")
        .addChoices(
          { name: "All (Full Report)", value: "all" },
          { name: "Security Only", value: "security" },
          { name: "Moderation Only", value: "moderation" },
          { name: "Configuration Only", value: "configuration" }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const category = interaction.options.getString("category") || "all";
    const config = await db.getServerConfig(interaction.guild.id);

    if (!config) {
      return await interaction.editReply({
        content: "❌ Server not configured. Use `/setup` first!",
      });
    }

    // Optimal settings benchmark
    const optimal = {
      security: {
        anti_raid_enabled: true,
        anti_nuke_enabled: true,
        join_gate_enabled: true,
        verification_enabled: true,
        heat_system_enabled: true,
        auto_mod_enabled: true,
      },
      moderation: {
        mod_role: true,
        admin_role: true,
        log_channel: true,
        mod_log_channel: true,
        mute_role: true,
      },
      configuration: {
        alert_channel: true,
        welcome_channel: true,
        verification_role: true,
        ticket_category: true,
      },
    };

    const embed = new EmbedBuilder()
      .setTitle(`📊 Server Configuration Comparison`)
      .setDescription(`${interaction.guild.name} vs Optimal Settings`)
      .setColor("#667eea")
      .setTimestamp();

    // Calculate scores
    const scores = {};
    const missing = {};

    for (const [cat, settings] of Object.entries(optimal)) {
      if (category !== "all" && category !== cat) continue;

      let total = Object.keys(settings).length;
      let matches = 0;
      missing[cat] = [];

      for (const [key, required] of Object.entries(settings)) {
        if (config[key]) {
          matches++;
        } else if (required) {
          missing[cat].push(key);
        }
      }

      scores[cat] = {
        percentage: Math.round((matches / total) * 100),
        matches,
        total,
      };
    }

    // Add fields for each category
    for (const [cat, score] of Object.entries(scores)) {
      const emoji =
        score.percentage >= 90 ? "✅" : score.percentage >= 70 ? "🟡" : "🔴";
      const status =
        score.percentage >= 90
          ? "Excellent"
          : score.percentage >= 70
          ? "Good"
          : "Needs Work";

      embed.addFields({
        name: `${emoji} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`,
        value: [
          `**Score:** ${score.percentage}% (${score.matches}/${score.total})`,
          `**Status:** ${status}`,
          missing[cat].length > 0
            ? `**Missing:** ${missing[cat].map((k) => `\`${k}\``).join(", ")}`
            : "**Complete!** ✅",
        ].join("\n"),
        inline: true,
      });
    }

    // Overall score
    const overallTotal = Object.values(scores).reduce(
      (sum, s) => sum + s.total,
      0
    );
    const overallMatches = Object.values(scores).reduce(
      (sum, s) => sum + s.matches,
      0
    );
    const overallPercentage = Math.round((overallMatches / overallTotal) * 100);

    embed.addFields({
      name: "🎯 Overall Configuration Score",
      value: `**${overallPercentage}%** (${overallMatches}/${overallTotal} features configured)`,
      inline: false,
    });

    // Recommendations
    if (overallPercentage < 100) {
      const allMissing = Object.values(missing).flat();
      const topRecommendations = allMissing.slice(0, 3);

      if (topRecommendations.length > 0) {
        embed.addFields({
          name: "💡 Top Recommendations",
          value: topRecommendations
            .map((item, i) => `${i + 1}. Enable \`${item.replace(/_/g, " ")}\``)
            .join("\n"),
          inline: false,
        });
      }
    } else {
      embed.addFields({
        name: "🎉 Perfect Configuration!",
        value: "Your server matches all optimal settings. Great job!",
        inline: false,
      });
    }

    embed.setFooter({
      text:
        overallPercentage >= 90
          ? "Excellent configuration!"
          : "Use /setup to improve your score",
    });

    await interaction.editReply({ embeds: [embed] });
  },
};
