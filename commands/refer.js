/**
 * Referral System Command
 * Track and reward users for inviting the bot to new servers
 */

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../utils/database");
const logger = require("../utils/logger");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("refer")
    .setDescription("📊 View your referral stats and rewards")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("stats")
        .setDescription("View your referral statistics and rewards")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("link")
        .setDescription("Get your unique referral invite link")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leaderboard")
        .setDescription("View top referrers")
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of users to show")
            .setMinValue(5)
            .setMaxValue(25)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("rewards")
        .setDescription("View all available referral rewards")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === "stats") {
        await this.showStats(interaction);
      } else if (subcommand === "link") {
        await this.showLink(interaction);
      } else if (subcommand === "leaderboard") {
        await this.showLeaderboard(interaction);
      } else if (subcommand === "rewards") {
        await this.showRewards(interaction);
      }
    } catch (error) {
      logger.error("Refer Command Error:", error);

      // Check if interaction has already been replied to
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          ErrorMessages.genericError(),
          ephemeral: true,
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          ErrorMessages.genericError(),
        });
      }
      // If already replied, don't try to reply again
    }
  },

  /**
   * Show user's referral stats
   */
  async showStats(interaction) {
    const userId = interaction.user.id;
    const stats = await this.getReferralStats(userId);

    const embed = new EmbedBuilder()
      .setTitle("📊 Your Referral Stats")
      .setColor(0x667eea)
      .addFields(
        {
          name: "Total Referrals",
          value: `${stats.totalReferrals} servers`,
          inline: true,
        },
        {
          name: "Active Referrals",
          value: `${stats.activeReferrals} servers`,
          inline: true,
        },
        {
          name: "Referral Rank",
          value: `#${stats.rank}`,
          inline: true,
        },
        {
          name: "\u200b",
          value: "\u200b",
          inline: false,
        },
        {
          name: "🏆 Rewards Unlocked",
          value: stats.rewardsEarned.length
            ? stats.rewardsEarned.join("\n")
            : "None yet - invite more servers!",
          inline: false,
        },
        {
          name: "📈 Next Milestone",
          value: stats.nextMilestone
            ? `${stats.nextMilestone.serversNeeded} more servers for: ${stats.nextMilestone.reward}`
            : "All milestones completed! 🎉",
          inline: false,
        }
      )
      .setFooter({
        text: `Use /refer link to get your invite URL | ${stats.totalReferrals} servers referred`,
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  /**
   * Show user's referral link
   */
  async showLink(interaction) {
    const userId = interaction.user.id;

    // Generate unique referral link
    const inviteUrl = `https://azzraya.github.io/Nexus/refer.html?ref=${userId}`;

    const embed = new EmbedBuilder()
      .setTitle("🔗 Your Referral Link")
      .setColor(0x667eea)
      .setDescription(
        `Share this link to invite Nexus to servers and earn rewards!\n\n**Your Link:**\n${inviteUrl}`
      )
      .addFields(
        {
          name: "📊 How it Works",
          value:
            "• Share your unique link\n• When someone adds Nexus using it, you get credit\n• Earn badges, titles, and special perks\n• Compete on the leaderboard!",
        },
        {
          name: "🎁 Rewards",
          value:
            "**5 Referrals:** 🥉 Bronze Referrer Badge\n**10 Referrals:** 🥈 Silver Referrer Badge\n**25 Referrals:** 🥇 Gold Referrer Badge\n**50 Referrals:** 💎 Diamond Referrer Badge\n**100 Referrals:** 👑 Elite Referrer Badge + Special Role",
        }
      )
      .setFooter({
        text: "Your referrals are tracked automatically • Use /refer stats to check progress",
      });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  /**
   * Show referral leaderboard
   */
  async showLeaderboard(interaction) {
    const limit = interaction.options.getInteger("limit") || 10;

    const topReferrers = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT user_id, COUNT(*) as referrals, MAX(created_at) as last_referral
         FROM referrals
         WHERE status = 'active'
         GROUP BY user_id
         ORDER BY referrals DESC
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    if (!topReferrers || topReferrers.length === 0) {
      return interaction.reply({
        content: "📊 No referrals yet. Be the first!",
        ephemeral: true,
      });
    }

    // Build leaderboard text
    let leaderboardText = "";
    for (let i = 0; i < topReferrers.length; i++) {
      const user = topReferrers[i];
      const medal =
        i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      const userData = await interaction.client.users
        .fetch(user.user_id)
        .catch(() => null);
      const username = userData ? userData.tag : "Unknown User";

      leaderboardText += `${medal} **${username}** - ${user.referrals} referrals\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle("🏆 Referral Leaderboard")
      .setColor(0xffd700)
      .setDescription(leaderboardText)
      .setFooter({
        text: `Showing top ${topReferrers.length} referrers • Use /refer link to start earning`,
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  /**
   * Show all available rewards
   */
  async showRewards(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("🎁 Referral Rewards")
      .setColor(0x667eea)
      .setDescription("Invite Nexus to servers and unlock exclusive rewards!")
      .addFields(
        {
          name: "🥉 5 Referrals - Bronze Referrer",
          value:
            "• Bronze Referrer badge on profile\n• Listed on referral leaderboard\n• Thank you message",
        },
        {
          name: "🥈 10 Referrals - Silver Referrer",
          value:
            "• Silver Referrer badge\n• Priority support\n• Early access to new features",
        },
        {
          name: "🥇 25 Referrals - Gold Referrer",
          value:
            "• Gold Referrer badge\n• Custom profile banner\n• Contributor role in support server\n• Feature voting rights",
        },
        {
          name: "💎 50 Referrals - Diamond Referrer",
          value:
            "• Diamond Referrer badge\n• Listed as official partner\n• Direct contact with developers\n• Beta access to all features",
        },
        {
          name: "👑 100+ Referrals - Elite Referrer",
          value:
            "• Elite Referrer badge\n• Permanent spot on website\n• Custom bot status message\n• Influence on development roadmap\n• Eternal gratitude 💜",
        }
      )
      .setFooter({
        text: "Use /refer link to get started • Rewards are permanent!",
      });

    await interaction.reply({ embeds: [embed] });
  },

  /**
   * Get referral statistics for a user
   */
  async getReferralStats(userId) {
    // Initialize referral table if not exists
    await new Promise((resolve, reject) => {
      db.db.run(
        `
        CREATE TABLE IF NOT EXISTS referrals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          status TEXT DEFAULT 'active'
        )
      `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise((resolve) => {
      db.db.run(
        `CREATE INDEX IF NOT EXISTS idx_referrals_user ON referrals(user_id)`,
        () => resolve()
      );
    });

    await new Promise((resolve) => {
      db.db.run(
        `CREATE INDEX IF NOT EXISTS idx_referrals_guild ON referrals(guild_id)`,
        () => resolve()
      );
    });

    // Get stats
    const totalResult = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT COUNT(*) as count FROM referrals WHERE user_id = ?",
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    const activeResult = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT COUNT(*) as count FROM referrals WHERE user_id = ? AND status = 'active'",
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    const totalReferrals = totalResult?.count || 0;
    const activeReferrals = activeResult?.count || 0;

    // Get rank
    const rankResult = await new Promise((resolve, reject) => {
      db.db.all(
        `
        SELECT user_id, COUNT(*) as count
        FROM referrals
        WHERE status = 'active'
        GROUP BY user_id
        ORDER BY count DESC
      `,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    let rank = 0;
    for (let i = 0; i < rankResult.length; i++) {
      if (rankResult[i].user_id === userId) {
        rank = i + 1;
        break;
      }
    }

    if (rank === 0) rank = rankResult.length + 1;

    // Calculate rewards earned
    const rewardsEarned = [];
    if (totalReferrals >= 5) rewardsEarned.push("🥉 Bronze Referrer");
    if (totalReferrals >= 10) rewardsEarned.push("🥈 Silver Referrer");
    if (totalReferrals >= 25) rewardsEarned.push("🥇 Gold Referrer");
    if (totalReferrals >= 50) rewardsEarned.push("💎 Diamond Referrer");
    if (totalReferrals >= 100) rewardsEarned.push("👑 Elite Referrer");

    // Calculate next milestone
    const milestones = [
      { threshold: 5, reward: "🥉 Bronze Referrer Badge" },
      { threshold: 10, reward: "🥈 Silver Referrer Badge" },
      { threshold: 25, reward: "🥇 Gold Referrer Badge" },
      { threshold: 50, reward: "💎 Diamond Referrer Badge" },
      { threshold: 100, reward: "👑 Elite Referrer Badge" },
    ];

    let nextMilestone = null;
    for (const milestone of milestones) {
      if (totalReferrals < milestone.threshold) {
        nextMilestone = {
          serversNeeded: milestone.threshold - totalReferrals,
          reward: milestone.reward,
        };
        break;
      }
    }

    return {
      totalReferrals,
      activeReferrals,
      rank,
      rewardsEarned,
      nextMilestone,
    };
  },

  /**
   * Track a referral (called when bot joins a new server)
   */
  async trackReferral(guildId, referrerId) {
    if (!referrerId) return;

    try {
      await new Promise((resolve, reject) => {
        db.db.run(
          `
          CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            status TEXT DEFAULT 'active'
          )
        `,
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Check if already tracked
      const existing = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT id FROM referrals WHERE guild_id = ?",
          [guildId],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (existing && existing.length > 0) {
        return; // Already tracked
      }

      // Add referral
      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO referrals (user_id, guild_id, status) VALUES (?, ?, 'active')",
          [referrerId, guildId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      logger.info(
        `[Referral] New referral tracked: Guild ${guildId} referred by ${referrerId}`
      );
    } catch (error) {
      logger.error("[Referral] Error tracking referral:", error);
    }
  },

  /**
   * Mark referral as inactive when bot leaves
   */
  async markReferralInactive(guildId) {
    try {
      await new Promise((resolve, reject) => {
        db.db.run(
          "UPDATE referrals SET status = 'inactive' WHERE guild_id = ?",
          [guildId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    } catch (error) {
      logger.error("[Referral] Error marking referral inactive:", error);
    }
  },
};
