const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("predict")
    .setDescription("AI-powered threat predictions")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Prediction type")
        .addChoices(
          { name: "Raid Likelihood", value: "raid" },
          { name: "Member Churn", value: "churn" },
          { name: "Growth Forecast", value: "growth" }
        )
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const type = interaction.options.getString("type") || "raid";
      const PredictiveAnalytics = require("../utils/predictiveAnalytics");
      const predictive = new PredictiveAnalytics(interaction.client);

      if (type === "raid") {
        const prediction = await predictive.predictRaidLikelihood(
          interaction.guild.id,
          48
        );

        const riskColor =
          prediction.likelihood >= 70
            ? 0xf44336
            : prediction.likelihood >= 40
              ? 0xff9800
              : 0x4caf50;

        const embed = new EmbedBuilder()
          .setTitle("🔮 Raid Prediction")
          .setDescription(
            `**Likelihood in next 48 hours:** ${prediction.likelihood}%\n` +
              `**Confidence:** ${prediction.confidence}%\n\n` +
              `**Risk Factors:**\n` +
              prediction.riskFactors.factors
                .map((f) => `• ${f.description} (${f.weight}% risk)`)
                .join("\n")
          )
          .setColor(riskColor)
          .addFields({
            name: "💡 Recommendations",
            value:
              prediction.recommendations
                .slice(0, 3)
                .map(
                  (r) =>
                    `${r.priority === "critical" ? "🔴" : "🟡"} ${r.action}`
                )
                .join("\n") || "No immediate actions needed",
          })
          .setFooter({
            text: `Based on ${prediction.confidence}% confidence | Use /dashboard for live monitoring`,
          });

        await interaction.editReply({ embeds: [embed] });
      } else if (type === "churn") {
        const churnPrediction = await predictive.predictChurn(
          interaction.guild.id
        );

        const embed = new EmbedBuilder()
          .setTitle("📉 Member Churn Prediction")
          .setDescription(
            `**Churn Probability:** ${churnPrediction.probability.toFixed(1)}%\n` +
              `**Expected Losses:** ~${churnPrediction.expectedLosses} members\n\n` +
              `**Factors:**\n` +
              churnPrediction.factors.join("\n")
          )
          .setColor(churnPrediction.probability > 50 ? 0xf44336 : 0x4caf50)
          .setFooter({ text: "Use /dashboard for detailed analytics" });

        await interaction.editReply({ embeds: [embed] });
      } else if (type === "growth") {
        const GrowthAnalytics = require("../utils/growthAnalytics");
        const growth = new GrowthAnalytics(interaction.client);

        const forecast = await growth.forecastGrowth(interaction.guild.id, 30);

        const embed = new EmbedBuilder()
          .setTitle("📈 30-Day Growth Forecast")
          .setDescription(
            `**Current Growth Rate:** ${forecast.currentGrowthRate > 0 ? "+" : ""}${forecast.currentGrowthRate.toFixed(1)} members/day\n` +
              `**30-Day Prediction:** ${forecast.forecast[29]?.predicted || 0} new members\n` +
              `**Forecast Reliability:** ${forecast.reliability}`
          )
          .setColor(0x2196f3)
          .addFields(
            {
              name: "7-Day Forecast",
              value: `+${forecast.forecast[6]?.predicted || 0} members`,
              inline: true,
            },
            {
              name: "14-Day Forecast",
              value: `+${forecast.forecast[13]?.predicted || 0} members`,
              inline: true,
            },
            {
              name: "30-Day Forecast",
              value: `+${forecast.forecast[29]?.predicted || 0} members`,
              inline: true,
            }
          )
          .setFooter({ text: "Predictions based on recent growth trends" });

        await interaction.editReply({ embeds: [embed] });
      }

      logger.info(
        "Command",
        `/predict type:${type} executed in ${interaction.guild.name}`
      );
    } catch (error) {
      logger.error("Command", "Predict error", error);
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription("Failed to generate prediction. Please try again.")
        .setColor(0xf44336);

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};
