const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const threatPredictor = require("../utils/threatPredictor");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("predict")
    .setDescription("AI-powered threat prediction and pattern analysis")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("now")
        .setDescription("Analyze current server state for raid patterns")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("history")
        .setDescription("View prediction history and accuracy")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "now") {
      await interaction.deferReply({ ephemeral: true });

      const prediction = await threatPredictor.predictThreat(interaction.guild);

      const embed = new EmbedBuilder()
        .setTitle("🤖 AI Threat Prediction Analysis")
        .setDescription(
          `Current threat assessment for ${interaction.guild.name}`
        )
        .setColor(
          prediction.level === "Critical"
            ? "#c53030"
            : prediction.level === "High"
            ? "#f56565"
            : prediction.level === "Medium"
            ? "#ed8936"
            : prediction.level === "Low"
            ? "#ecc94b"
            : "#48bb78"
        )
        .addFields(
          {
            name: "⚠️ Threat Score",
            value: `**${prediction.score}/100** (${prediction.level})`,
            inline: true,
          },
          {
            name: "📊 Recent Joins",
            value: `${prediction.recentJoins} in last 60s`,
            inline: true,
          },
          {
            name: "🔍 Patterns Detected",
            value:
              prediction.patterns.length > 0
                ? prediction.patterns.join(", ")
                : "None",
            inline: false,
          }
        )
        .setTimestamp();

      // Add pattern details
      if (
        prediction.patternDetails &&
        Object.keys(prediction.patternDetails).length > 0
      ) {
        const patternText = Object.entries(prediction.patternDetails)
          .map(
            ([key, data]) =>
              `**${key}:** ${data.value} (+${Math.round(
                data.contribution
              )} points)`
          )
          .join("\n");

        embed.addFields({
          name: "📋 Pattern Breakdown",
          value: patternText,
          inline: false,
        });
      }

      // Add recommendations
      if (prediction.recommendations.length > 0) {
        embed.addFields({
          name: "💡 Recommended Actions",
          value: prediction.recommendations.join("\n"),
          inline: false,
        });
      } else {
        embed.addFields({
          name: "✅ Status",
          value: "No immediate action needed. Server looks safe.",
          inline: false,
        });
      }

      embed.setFooter({
        text:
          prediction.score >= 70
            ? "🚨 High threat - Take action immediately!"
            : prediction.score >= 30
            ? "Monitor closely for changes"
            : "Server appears secure",
      });

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === "history") {
      await interaction.deferReply({ ephemeral: true });

      const history = await threatPredictor.getPredictionHistory(
        interaction.guild.id
      );

      if (history.length === 0) {
        return await interaction.editReply({
          content: "📊 No prediction history yet. Use `/predict now` to start!",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📊 Threat Prediction History")
        .setDescription(
          `Last ${history.length} AI predictions for ${interaction.guild.name}`
        )
        .setColor("#667eea")
        .setTimestamp();

      history.slice(0, 10).forEach((pred, index) => {
        const patterns = JSON.parse(pred.patterns_detected || "[]");
        embed.addFields({
          name: `${index + 1}. <t:${Math.floor(pred.timestamp / 1000)}:R>`,
          value: [
            `**Score:** ${pred.prediction_score}/100`,
            `**Patterns:** ${
              patterns.length > 0 ? patterns.join(", ") : "None"
            }`,
            pred.was_accurate !== null
              ? `**Accurate:** ${pred.was_accurate ? "✅ Yes" : "❌ No"}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
          inline: true,
        });
      });

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
