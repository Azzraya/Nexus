const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("health")
    .setDescription("Check your server's overall health score and status")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const health = await this.calculateHealth(interaction.guild);
      const embed = this.createHealthEmbed(health, interaction.guild);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error calculating health:", error);
      await interaction.editReply({
        content: "❌ An error occurred while calculating server health.",
      });
    }
  },

  async calculateHealth(guild) {
    let score = 0;
    let maxScore = 0;
    const categories = {
      security: { score: 0, max: 0, issues: [] },
      moderation: { score: 0, max: 0, issues: [] },
      activity: { score: 0, max: 0, issues: [] },
      configuration: { score: 0, max: 0, issues: [] },
    };

    const config = await db.getServerConfig(guild.id);

    // Security Category (40 points max)
    categories.security.max = 40;
    if (config?.anti_raid_enabled) {
      categories.security.score += 10;
    } else {
      categories.security.issues.push("Anti-raid disabled");
    }
    if (config?.anti_nuke_enabled) {
      categories.security.score += 10;
    } else {
      categories.security.issues.push("Anti-nuke disabled");
    }
    if (config?.heat_system_enabled) {
      categories.security.score += 10;
    } else {
      categories.security.issues.push("Heat system disabled");
    }
    if (config?.auto_mod_enabled) {
      categories.security.score += 10;
    } else {
      categories.security.issues.push("Auto-moderation disabled");
    }

    // Moderation Category (30 points max)
    categories.moderation.max = 30;
    if (config?.mod_log_channel) {
      categories.moderation.score += 15;
    } else {
      categories.moderation.issues.push("Mod log channel not set");
    }

    const recentActions = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT COUNT(*) as count FROM moderation_logs WHERE guild_id = ? AND timestamp > ?",
        [guild.id, Date.now() - 86400000],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.count || 0);
        }
      );
    });

    if (recentActions > 0) {
      categories.moderation.score += 15; // Active moderation
    } else {
      categories.moderation.issues.push(
        "No moderation activity (may be normal)"
      );
    }

    // Activity Category (20 points max)
    categories.activity.max = 20;
    const memberCount = guild.memberCount;
    if (memberCount > 100) {
      categories.activity.score += 10;
    } else if (memberCount > 50) {
      categories.activity.score += 5;
    } else {
      categories.activity.issues.push("Small server (< 50 members)");
    }

    const recentMessages = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT SUM(messages_sent) as total FROM user_stats WHERE guild_id = ? AND last_active > ?",
        [guild.id, Date.now() - 86400000],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.total || 0);
        }
      );
    });

    if (recentMessages > 100) {
      categories.activity.score += 10;
    } else if (recentMessages > 50) {
      categories.activity.score += 5;
    } else {
      categories.activity.issues.push("Low message activity");
    }

    // Configuration Category (10 points max)
    categories.configuration.max = 10;
    if (config) {
      categories.configuration.score += 5;
    } else {
      categories.configuration.issues.push("Server not configured");
    }

    const joinGate = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT * FROM join_gate_config WHERE guild_id = ? AND enabled = 1",
        [guild.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (joinGate) {
      categories.configuration.score += 5;
    } else {
      categories.configuration.issues.push("Join gate not configured");
    }

    // Calculate total
    Object.values(categories).forEach((cat) => {
      score += cat.score;
      maxScore += cat.max;
    });

    const percentage = Math.round((score / maxScore) * 100);
    const level = this.getHealthLevel(percentage);

    return {
      score,
      maxScore,
      percentage,
      level,
      categories,
      recommendations: this.generateRecommendations(categories),
    };
  },

  getHealthLevel(percentage) {
    if (percentage >= 90)
      return { name: "Excellent", emoji: "🟢", color: 0x00ff00 };
    if (percentage >= 75) return { name: "Good", emoji: "🟡", color: 0xffff00 };
    if (percentage >= 60) return { name: "Fair", emoji: "🟠", color: 0xff8800 };
    if (percentage >= 40) return { name: "Poor", emoji: "🔴", color: 0xff0000 };
    return { name: "Critical", emoji: "⚫", color: 0x000000 };
  },

  generateRecommendations(categories) {
    const recommendations = [];

    if (categories.security.issues.length > 0) {
      recommendations.push(
        "Enable security features: `/setup preset` or `/config view`"
      );
    }
    if (categories.moderation.issues.some((i) => i.includes("Mod log"))) {
      recommendations.push("Set mod log channel: `/config modlog #channel`");
    }
    if (
      categories.configuration.issues.some((i) => i.includes("not configured"))
    ) {
      recommendations.push("Complete setup: `/setup wizard`");
    }
    if (
      categories.activity.issues.length > 0 &&
      categories.activity.score < 10
    ) {
      recommendations.push(
        "Consider promoting your server to increase activity"
      );
    }

    return recommendations;
  },

  createHealthEmbed(health, guild) {
    const embed = new EmbedBuilder()
      .setTitle(`${health.level.emoji} Server Health: ${health.level.name}`)
      .setDescription(
        `**Overall Score: ${health.percentage}%**\n` +
          `${health.score} / ${health.maxScore} points\n\n` +
          `Your server's health is ${health.level.name.toLowerCase()}. ` +
          `This score is based on security, moderation, activity, and configuration.`
      )
      .setColor(health.level.color)
      .setTimestamp()
      .setFooter({ text: `Server: ${guild.name}` });

    // Category breakdowns
    Object.entries(health.categories).forEach(([name, cat]) => {
      const percentage = Math.round((cat.score / cat.max) * 100);
      const emoji = percentage >= 75 ? "✅" : percentage >= 50 ? "⚠️" : "❌";

      embed.addFields({
        name: `${emoji} ${
          name.charAt(0).toUpperCase() + name.slice(1)
        } (${percentage}%)`,
        value:
          cat.issues.length > 0
            ? cat.issues.slice(0, 2).join("\n") +
              (cat.issues.length > 2 ? `\n+${cat.issues.length - 2} more` : "")
            : "All good!",
        inline: true,
      });
    });

    // Recommendations
    if (health.recommendations.length > 0) {
      embed.addFields({
        name: "💡 Recommendations",
        value: health.recommendations.slice(0, 3).join("\n"),
        inline: false,
      });
    }

    // Health badge
    const badges = {
      Excellent: "🏆 Platinum",
      Good: "🥇 Gold",
      Fair: "🥈 Silver",
      Poor: "🥉 Bronze",
      Critical: "⚠️ Needs Attention",
    };

    embed.addFields({
      name: "🏅 Health Badge",
      value: badges[health.level.name] || "No badge",
      inline: true,
    });

    return embed;
  },
};
