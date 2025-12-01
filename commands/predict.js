const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const IntelligentDetection = require("../utils/intelligentDetection");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("predict")
    .setDescription("Predict potential security threats")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply();

    // Get recent joins
    const recentJoins = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM anti_raid_state WHERE guild_id = ?",
        [interaction.guild.id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    const members = [];
    for (const join of recentJoins.slice(0, 10)) {
      try {
        const member = await interaction.guild.members
          .fetch(join.user_id)
          .catch(() => null);
        if (member) members.push(member);
      } catch (error) {
        const ErrorHandler = require("../utils/errorHandler");
        ErrorHandler.logError(
          error,
          `predict [${interaction.guild.id}]`,
          `Fetch member ${userId}`
        );
      }
    }

    const predictions = await IntelligentDetection.predictAttack(
      interaction.guild,
      members
    );

    const embed = new EmbedBuilder()
      .setTitle("🔮 Threat Prediction")
      .addFields(
        {
          name: "Raid Likelihood",
          value: `${predictions.raidLikelihood}%`,
          inline: true,
        },
        {
          name: "Nuke Likelihood",
          value: `${predictions.nukeLikelihood}%`,
          inline: true,
        },
        {
          name: "Spam Likelihood",
          value: `${predictions.spamLikelihood}%`,
          inline: true,
        },
        {
          name: "Confidence",
          value: `${predictions.confidence}%`,
          inline: true,
        }
      )
      .setColor(
        predictions.raidLikelihood > 50
          ? 0xff0000
          : predictions.raidLikelihood > 30
          ? 0xff8800
          : 0x00ff00
      )
      .setTimestamp();

    // Add predictive insights
    const insights = [];
    if (predictions.raidLikelihood > 50) {
      insights.push("🔴 High raid risk detected - Consider lockdown mode");
      embed.addFields({
        name: "⚠️ Immediate Action Recommended",
        value:
          "• Enable lockdown: `/lockdown enable`\n• Increase anti-raid sensitivity\n• Monitor join rate closely",
        inline: false,
      });
    } else if (predictions.raidLikelihood > 30) {
      insights.push("🟡 Moderate raid risk - Monitor closely");
      embed.addFields({
        name: "💡 Preventive Measures",
        value:
          "• Review recent joins: `/scan recent`\n• Check threat network: `/threatnet check`\n• Consider increasing join gate strictness",
        inline: false,
      });
    }

    if (predictions.nukeLikelihood > 40) {
      insights.push("🔴 High nuke risk - Review admin permissions");
      embed.addFields({
        name: "🛡️ Nuke Protection",
        value:
          "• Review admin roles: `/security audit`\n• Enable rescue key: `/rescue generate`\n• Check role hierarchy",
        inline: false,
      });
    }

    // Add trend analysis if available
    const trends = await this.analyzeTrends(interaction.guild.id);
    if (trends) {
      embed.addFields({
        name: "📈 Trend Analysis",
        value: trends,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },

  async analyzeTrends(guildId) {
    try {
      const db = require("../utils/database");

      // Get join rate trend (last 7 days vs previous 7 days)
      const recentJoins = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT COUNT(*) as count FROM anti_raid_logs WHERE guild_id = ? AND timestamp > ? AND timestamp < ?",
          [guildId, Date.now() - 604800000, Date.now() - 172800000],
          (err, row) => {
            if (err) reject(err);
            else resolve(row?.count || 0);
          }
        );
      });

      const previousJoins = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT COUNT(*) as count FROM anti_raid_logs WHERE guild_id = ? AND timestamp > ? AND timestamp < ?",
          [guildId, Date.now() - 1209600000, Date.now() - 604800000],
          (err, row) => {
            if (err) reject(err);
            else resolve(row?.count || 0);
          }
        );
      });

      if (recentJoins > previousJoins * 1.5) {
        return `⚠️ Join rate increased ${Math.round(
          ((recentJoins - previousJoins) / previousJoins) * 100
        )}% - Potential raid preparation`;
      } else if (recentJoins < previousJoins * 0.5) {
        return `✅ Join rate decreased - Server activity normalizing`;
      }

      return null;
    } catch (error) {
      return null;
    }
  },
};
