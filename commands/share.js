/**
 * Share Command
 * Generate shareable stats cards for social media
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const db = require("../utils/database");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("share")
    .setDescription("📊 Generate shareable stats for your server")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("stats")
        .setDescription("Share your server's security stats")
        .addStringOption((option) =>
          option
            .setName("period")
            .setDescription("Time period")
            .addChoices(
              { name: "Last 7 Days", value: "7" },
              { name: "Last 30 Days", value: "30" },
              { name: "All Time", value: "all" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("comparison")
        .setDescription("Share Nexus vs Wick comparison")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("achievement")
        .setDescription("Share a security achievement")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Achievement type")
            .addChoices(
              { name: "Raids Blocked", value: "raids" },
              { name: "Threats Stopped", value: "threats" },
              { name: "Days Protected", value: "days" },
              { name: "Perfect Security Score", value: "perfect" }
            )
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === "stats") {
        await this.shareStats(interaction);
      } else if (subcommand === "comparison") {
        await this.shareComparison(interaction);
      } else if (subcommand === "achievement") {
        await this.shareAchievement(interaction);
      }
    } catch (error) {
      logger.error("Share Command Error:", error);

      // Check if interaction has already been replied to
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ An error occurred while generating shareable content.",
          ephemeral: true,
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          content: "❌ An error occurred while generating shareable content.",
        });
      }
      // If already replied, don't try to reply again
    }
  },

  /**
   * Share server security stats
   */
  async shareStats(interaction) {
    await interaction.deferReply();

    const period = interaction.options.getString("period") || "30";
    const guild = interaction.guild;

    // Calculate time range
    const now = Date.now();
    const startTime =
      period === "all" ? 0 : now - parseInt(period) * 24 * 60 * 60 * 1000;

    // Get stats from database
    const stats = await this.getServerStats(guild.id, startTime);

    // Create shareable embed
    const embed = new EmbedBuilder()
      .setTitle(`🛡️ ${guild.name} - Protected by Nexus`)
      .setThumbnail(
        guild.iconURL() || interaction.client.user.displayAvatarURL()
      )
      .setColor(0x667eea)
      .addFields(
        {
          name: "🚫 Threats Blocked",
          value: `**${stats.threatsBlocked}**`,
          inline: true,
        },
        {
          name: "⚔️ Raids Stopped",
          value: `**${stats.raidsBlocked}**`,
          inline: true,
        },
        {
          name: "🛡️ Security Score",
          value: `**${stats.healthScore}/100**`,
          inline: true,
        },
        {
          name: "📊 Moderation Actions",
          value: `**${stats.modActions}**`,
          inline: true,
        },
        {
          name: "👥 Members Protected",
          value: `**${guild.memberCount.toLocaleString()}**`,
          inline: true,
        },
        {
          name: "📅 Days Protected",
          value: `**${stats.daysProtected}**`,
          inline: true,
        }
      )
      .setDescription(
        `${guild.name} is protected by **Nexus** - the free security bot that exceeds Wick.\n\n` +
          `📈 Stats for: **${
            period === "all" ? "All Time" : `Last ${period} Days`
          }**`
      )
      .setFooter({
        text: "Powered by Nexus • 100% Free • Exceeds Wick",
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTimestamp();

    // Add achievement badge if impressive
    if (stats.threatsBlocked > 50) {
      embed.addFields({
        name: "🏆 Achievement Unlocked",
        value: "**High Security Server** - Blocked 50+ threats!",
        inline: false,
      });
    }

    // Add call-to-action
    const ctaEmbed = new EmbedBuilder()
      .setColor(0x667eea)
      .setDescription(
        "**Want Nexus for your server?**\n" +
          `🔗 [Add Nexus Free](https://azzraya.github.io/Nexus/invite.html?source=discord)\n` +
          `⚔️ [See Nexus vs Wick](https://azzraya.github.io/Nexus/comparison.html)\n` +
          `💬 [Join Support](https://discord.gg/UHNcUKheZP)`
      );

    await interaction.editReply({
      content:
        "✅ **Shareable stats generated!** Copy this message and share on Twitter, Reddit, or other servers to show off your security! 🚀",
      embeds: [embed, ctaEmbed],
    });

    // Log share for analytics
    await new Promise((resolve) => {
      db.db.run(
        "INSERT INTO share_stats (guild_id, type, period, timestamp) VALUES (?, ?, ?, ?)",
        [guild.id, "stats", period, Date.now()],
        () => resolve() // Ignore errors
      );
    }).catch(() => {});
  },

  /**
   * Share Nexus vs Wick comparison
   */
  async shareComparison(interaction) {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setTitle("⚔️ Nexus vs Wick - Feature Comparison")
      .setColor(0x667eea)
      .setDescription(
        "Why servers are switching from Wick to Nexus:\n\n" +
          "**Everything Wick does, Nexus does better. And it's 100% FREE.**"
      )
      .addFields(
        {
          name: "💰 Price",
          value: "**Wick:** $3-10/month\n**Nexus:** FREE ✅",
          inline: true,
        },
        {
          name: "🤖 AI Features",
          value: "**Wick:** None\n**Nexus:** AI predictions, smart analysis ✅",
          inline: true,
        },
        {
          name: "🔄 Auto-Recovery",
          value: "**Wick:** Manual\n**Nexus:** Instant auto-recovery ✅",
          inline: true,
        },
        {
          name: "📊 Threat Intelligence",
          value: "**Wick:** None\n**Nexus:** Cross-server network ✅",
          inline: true,
        },
        {
          name: "⚡ Performance",
          value: "**Wick:** Standard\n**Nexus:** Optimized + cached ✅",
          inline: true,
        },
        {
          name: "🔓 Open Source",
          value: "**Wick:** Closed\n**Nexus:** Open source ✅",
          inline: true,
        }
      )
      .addFields({
        name: "🏆 The Verdict",
        value:
          "**Nexus wins** on features, price, and innovation. Try both and compare yourself!",
        inline: false,
      })
      .setFooter({
        text: "Full comparison at azzraya.github.io/Nexus/comparison.html",
      })
      .setTimestamp();

    const ctaEmbed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setDescription(
        "**Ready to switch?**\n" +
          `🔗 [Add Nexus Free](https://azzraya.github.io/Nexus/invite.html?source=share)\n` +
          `📊 [See Full Comparison](https://azzraya.github.io/Nexus/comparison.html)\n` +
          `⚔️ [View Live Demo](https://azzraya.github.io/Nexus/live-comparison.html)`
      );

    await interaction.editReply({
      content:
        "✅ **Comparison generated!** Share this to help others discover Nexus! 🚀",
      embeds: [embed, ctaEmbed],
    });
  },

  /**
   * Share achievement
   */
  async shareAchievement(interaction) {
    await interaction.deferReply();

    const type = interaction.options.getString("type");
    const guild = interaction.guild;
    const stats = await this.getServerStats(guild.id, 0); // All time

    let title, description, value;

    switch (type) {
      case "raids":
        title = "🛡️ Raid Defense Champion";
        description = `**${guild.name}** has blocked **${stats.raidsBlocked} raids** with Nexus!`;
        value = stats.raidsBlocked;
        break;
      case "threats":
        title = "⚔️ Threat Elimination Expert";
        description = `**${guild.name}** has stopped **${stats.threatsBlocked} threats** using Nexus!`;
        value = stats.threatsBlocked;
        break;
      case "days":
        title = "📅 Long-Term Security";
        description = `**${guild.name}** has been protected by Nexus for **${stats.daysProtected} days**!`;
        value = stats.daysProtected;
        break;
      case "perfect":
        title = "💯 Perfect Security Score";
        description = `**${guild.name}** maintains a **${stats.healthScore}/100** security score with Nexus!`;
        value = stats.healthScore;
        break;
    }

    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${title}`)
      .setDescription(description)
      .setThumbnail(
        guild.iconURL() || interaction.client.user.displayAvatarURL()
      )
      .setColor(0xffd700)
      .addFields(
        {
          name: "📊 Achievement",
          value: `**${value}** ${
            type === "days" ? "days" : type === "perfect" ? "score" : "blocked"
          }`,
          inline: true,
        },
        {
          name: "🛡️ Protected By",
          value: "**Nexus Bot**\n(Free Security Bot)",
          inline: true,
        }
      )
      .setFooter({
        text: "Want Nexus for your server? 100% Free • Exceeds Wick",
      })
      .setTimestamp();

    const ctaEmbed = new EmbedBuilder()
      .setColor(0x667eea)
      .setDescription(
        "**Protect your server like we do:**\n" +
          `🔗 [Add Nexus Free](https://azzraya.github.io/Nexus/invite.html?source=achievement)\n` +
          `📚 [Learn More](https://azzraya.github.io/Nexus/features.html)`
      );

    await interaction.editReply({
      content:
        "✅ **Achievement unlocked!** Share this to celebrate your security success! 🎉",
      embeds: [embed, ctaEmbed],
    });
  },

  /**
   * Get server stats from database
   */
  async getServerStats(guildId, startTime) {
    try {
      // Get threats blocked
      const threatsResult = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT COUNT(*) as count FROM security_logs WHERE guild_id = ? AND timestamp > ? AND threat_score >= 50",
          [guildId, startTime],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      // Get raids blocked
      const raidsResult = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT COUNT(*) as count FROM anti_raid_logs WHERE guild_id = ? AND timestamp > ? AND action_taken = 1",
          [guildId, startTime],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      // Get moderation actions
      const modActionsResult = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT COUNT(*) as count FROM moderation_logs WHERE guild_id = ? AND timestamp > ?",
          [guildId, startTime],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      // Get health score
      const serverHealth = require("../utils/serverHealth");
      const health = await serverHealth.calculateHealth(guildId);

      // Calculate days protected
      const joinedResult = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT MIN(timestamp) as first_seen FROM bot_activity_log WHERE guild_id = ? AND event_type = 'guild_join'",
          [guildId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      const firstSeen = joinedResult?.first_seen || Date.now();
      const daysProtected = Math.floor((Date.now() - firstSeen) / 86400000);

      return {
        threatsBlocked: threatsResult?.count || 0,
        raidsBlocked: raidsResult?.count || 0,
        modActions: modActionsResult?.count || 0,
        healthScore: health?.overall || 0,
        daysProtected: Math.max(daysProtected, 1),
      };
    } catch (error) {
      logger.error("Error getting server stats:", error);
      return {
        threatsBlocked: 0,
        raidsBlocked: 0,
        modActions: 0,
        healthScore: 0,
        daysProtected: 0,
      };
    }
  },
};
