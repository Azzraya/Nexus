const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("analytics")
    .setDescription("Advanced analytics and insights ")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Analytics type")
        .setRequired(true)
        .addChoices(
          { name: "Moderation Trends", value: "moderation" },
          { name: "Security Trends", value: "security" },
          { name: "User Activity", value: "activity" },
          { name: "Threat Patterns", value: "threats" },
          { name: "Performance Metrics", value: "performance" },
          { name: "AI Insights", value: "insights" }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName("days")
        .setDescription("Time period in days (1-30)")
        .setMinValue(1)
        .setMaxValue(30)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const type = interaction.options.getString("type");
    const days = interaction.options.getInteger("days") || 7;
    const startTime = Date.now() - days * 86400000;

    await interaction.deferReply();

    if (type === "moderation") {
      const actions = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT action, COUNT(*) as count, DATE(timestamp/1000, 'unixepoch') as date FROM moderation_logs WHERE guild_id = ? AND timestamp > ? GROUP BY action, date ORDER BY date DESC",
          [interaction.guild.id, startTime],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      const totalByAction = {};
      actions.forEach((a) => {
        totalByAction[a.action] = (totalByAction[a.action] || 0) + a.count;
      });

      const embed = new EmbedBuilder()
        .setTitle(`📊 Moderation Analytics (Last ${days} days)`)
        .setDescription("Detailed moderation trends and patterns")
        .addFields(
          {
            name: "📈 Action Breakdown",
            value:
              Object.entries(totalByAction)
                .map(
                  ([action, count]) => `**${action.toUpperCase()}:** ${count}`
                )
                .join("\n") || "No data",
            inline: true,
          },
          {
            name: "📅 Daily Average",
            value: `${Math.round(
              Object.values(totalByAction).reduce((a, b) => a + b, 0) / days
            )} actions/day`,
            inline: true,
          }
        )
        .setColor(0x0099ff)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else if (type === "security") {
      const threats = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT threat_score, event_type, DATE(timestamp/1000, 'unixepoch') as date FROM security_logs WHERE guild_id = ? AND timestamp > ? ORDER BY timestamp DESC",
          [interaction.guild.id, startTime],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      const avgScore =
        threats.reduce((sum, t) => sum + t.threat_score, 0) /
        (threats.length || 1);
      const highRisk = threats.filter((t) => t.threat_score >= 80).length;

      const embed = new EmbedBuilder()
        .setTitle(`🛡️ Security Analytics (Last ${days} days)`)
        .addFields({
          name: "📊 Statistics",
          value: [
            `Total Threats: **${threats.length}**`,
            `Avg Score: **${Math.round(avgScore)}%**`,
            `High Risk: **${highRisk}**`,
            `Risk Level: ${
              avgScore >= 70
                ? "🔴 High"
                : avgScore >= 40
                ? "🟡 Medium"
                : "🟢 Low"
            }`,
          ].join("\n"),
          inline: false,
        })
        .setColor(
          avgScore >= 70 ? 0xff0000 : avgScore >= 40 ? 0xffff00 : 0x00ff00
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else if (type === "activity") {
      const activity = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT user_id, messages_sent, commands_used FROM user_stats WHERE guild_id = ? ORDER BY messages_sent DESC LIMIT 10",
          [interaction.guild.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle(`📈 User Activity Analytics`)
        .setDescription("Top active users")
        .addFields({
          name: "🏆 Top Users",
          value:
            activity.length > 0
              ? activity
                  .map(
                    (a, i) =>
                      `${i + 1}. <@${a.user_id}> - ${a.messages_sent} msgs, ${
                        a.commands_used
                      } cmds`
                  )
                  .join("\n")
              : "No activity data",
          inline: false,
        })
        .setColor(0x0099ff)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else if (type === "insights") {
      await this.showAIInsights(interaction, days);
    }
  },

  async showAIInsights(interaction, days) {
    const SmartRecommendations = require("../utils/smartRecommendations");

    // Get AI-generated insights
    const insights = await SmartRecommendations.generateInsights(
      interaction.guild.id,
      interaction.guild,
      days
    );

    const embed = new EmbedBuilder()
      .setTitle("🤖 AI-Generated Insights")
      .setDescription(
        "Intelligent analysis of your server's activity and security"
      )
      .setColor(0x5865f2)
      .setTimestamp();

    if (insights.length > 0) {
      insights.slice(0, 5).forEach((insight, index) => {
        embed.addFields({
          name: `${index + 1}. ${insight.title}`,
          value:
            insight.description +
            (insight.recommendation
              ? `\n\n💡 **Recommendation:** ${insight.recommendation}`
              : ""),
          inline: false,
        });
      });
    } else {
      embed.setDescription(
        "No insights available yet. The AI needs more data to generate insights."
      );
    }

    embed.setFooter({ text: `Analysis period: Last ${days} days` });

    await interaction.editReply({ embeds: [embed] });
  },
};
