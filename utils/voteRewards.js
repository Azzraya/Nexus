const db = require("./database");
const logger = require("./logger");

class VoteRewards {
  constructor(client) {
    this.client = client;
    this.rewardConfig = {
      // Reward tiers based on vote streak
      streakRewards: [
        { streak: 7, reward: "7-day-voter", description: "🔥 7 Day Streak!" },
        {
          streak: 14,
          reward: "14-day-voter",
          description: "⚡ 2 Week Streak!",
        },
        {
          streak: 30,
          reward: "30-day-voter",
          description: "💎 1 Month Streak!",
        },
        {
          streak: 60,
          reward: "60-day-voter",
          description: "👑 2 Month Streak!",
        },
        {
          streak: 90,
          reward: "90-day-voter",
          description: "🌟 3 Month Streak!",
        },
      ],
      // Basic rewards for every vote
      perVoteReward: {
        points: 10, // Could be used for future economy system
        tempRole: null, // Optional temporary role
        duration: 12 * 60 * 60 * 1000, // 12 hours
      },
    };
    this.lastCheckedVotes = new Map(); // Track last checked time per user
    this.checkInterval = 5 * 60 * 1000; // Check every 5 minutes
    // Hardcoded webhook URL for vote notifications
    this.voteWebhookUrl =
      "https://discord.com/api/webhooks/1445461285947838545/6usnevFUWY9YfaOtHU5V2nDRhzntLwPA4csNuolmIksymRYK0OIdHjeCj10f3ZqfSqJx";
    // Only create roles and give rewards in this guild
    this.targetGuildId = "1444737803660558396";
  }

  /**
   * Record a vote and give rewards
   */
  async recordVote(userId, guildId, botlist) {
    const now = Date.now();

    try {
      // Record the vote
      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO vote_rewards (user_id, guild_id, botlist, voted_at, reward_expires) VALUES (?, ?, ?, ?, ?)",
          [
            userId,
            guildId,
            botlist,
            now,
            now + this.rewardConfig.perVoteReward.duration,
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Update streak
      const streak = await this.updateStreak(userId);

      // Give rewards
      const rewards = await this.giveRewards(userId, guildId, streak);

      logger.info(
        `[Vote Rewards] ${userId} voted on ${botlist}, streak: ${streak.current_streak}`
      );

      return {
        success: true,
        streak: streak.current_streak,
        longestStreak: streak.longest_streak,
        totalVotes: streak.total_votes,
        rewards,
      };
    } catch (error) {
      logger.error("[Vote Rewards] Error recording vote:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update user's vote streak
   */
  async updateStreak(userId) {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const twoDaysAgo = now - 48 * 60 * 60 * 1000;

    // Get current streak
    const currentStreak = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT * FROM vote_streaks WHERE user_id = ?",
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!currentStreak) {
      // First vote ever
      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO vote_streaks (user_id, current_streak, longest_streak, total_votes, last_vote_at, streak_started) VALUES (?, ?, ?, ?, ?, ?)",
          [userId, 1, 1, 1, now, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      return { current_streak: 1, longest_streak: 1, total_votes: 1 };
    }

    // Check if streak is still valid (voted within last 48 hours)
    let newStreak = currentStreak.current_streak;
    let streakStarted = currentStreak.streak_started;

    // Check if we've already incremented the streak today
    // This prevents multiple votes on different bot lists from incrementing the streak multiple times
    const lastVoteDate = new Date(currentStreak.last_vote_at);
    const currentDate = new Date(now);
    const sameDay =
      lastVoteDate.getUTCFullYear() === currentDate.getUTCFullYear() &&
      lastVoteDate.getUTCMonth() === currentDate.getUTCMonth() &&
      lastVoteDate.getUTCDate() === currentDate.getUTCDate();

    if (currentStreak.last_vote_at < twoDaysAgo) {
      // Streak broken, reset
      newStreak = 1;
      streakStarted = now;
    } else if (currentStreak.last_vote_at >= oneDayAgo) {
      // Voted within last 24 hours
      if (!sameDay) {
        // Different day, increment streak
        newStreak = currentStreak.current_streak + 1;
      } else {
        // Same day, don't increment (already counted today)
        newStreak = currentStreak.current_streak;
      }
    } else {
      // Voted within 24-48 hours, maintain streak without incrementing
      newStreak = currentStreak.current_streak;
    }

    const newLongestStreak = Math.max(newStreak, currentStreak.longest_streak);
    const newTotalVotes = currentStreak.total_votes + 1;

    // Update streak
    await new Promise((resolve, reject) => {
      db.db.run(
        "UPDATE vote_streaks SET current_streak = ?, longest_streak = ?, total_votes = ?, last_vote_at = ?, streak_started = ? WHERE user_id = ?",
        [
          newStreak,
          newLongestStreak,
          newTotalVotes,
          now,
          streakStarted,
          userId,
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    return {
      current_streak: newStreak,
      longest_streak: newLongestStreak,
      total_votes: newTotalVotes,
    };
  }

  /**
   * Give rewards based on streak
   */
  async giveRewards(userId, guildId, streak) {
    const rewards = [];

    // Base reward
    rewards.push({
      type: "points",
      value: this.rewardConfig.perVoteReward.points,
      description: `+${this.rewardConfig.perVoteReward.points} vote points`,
    });

    // Streak milestone rewards
    for (const milestone of this.rewardConfig.streakRewards) {
      if (streak.current_streak === milestone.streak) {
        rewards.push({
          type: "milestone",
          value: milestone.reward,
          description: milestone.description,
        });

        logger.info(
          `[Vote Rewards] ${userId} reached ${milestone.streak}-day streak!`
        );
      }
    }

    // Bonus for long streaks
    if (streak.current_streak >= 7) {
      const bonusMultiplier = Math.floor(streak.current_streak / 7);
      const bonus = this.rewardConfig.perVoteReward.points * bonusMultiplier;
      rewards.push({
        type: "streak_bonus",
        value: bonus,
        description: `+${bonus} streak bonus (${bonusMultiplier}x)`,
      });
    }

    return rewards;
  }

  /**
   * Get user's vote statistics
   */
  async getVoteStats(userId) {
    const streak = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT * FROM vote_streaks WHERE user_id = ?",
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    const recentVotes = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM vote_rewards WHERE user_id = ? AND voted_at > ? ORDER BY voted_at DESC",
        [userId, Date.now() - 30 * 24 * 60 * 60 * 1000], // Last 30 days
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    if (!streak) {
      return {
        current_streak: 0,
        longest_streak: 0,
        total_votes: 0,
        recent_votes: recentVotes.length,
        points: 0,
      };
    }

    // Calculate total points
    const points = streak.total_votes * this.rewardConfig.perVoteReward.points;

    return {
      current_streak: streak.current_streak,
      longest_streak: streak.longest_streak,
      total_votes: streak.total_votes,
      recent_votes: recentVotes.length,
      points,
      last_vote_at: streak.last_vote_at,
      streak_started: streak.streak_started,
    };
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(type = "streak", limit = 10) {
    let query;
    if (type === "streak") {
      query = "SELECT * FROM vote_streaks ORDER BY current_streak DESC LIMIT ?";
    } else if (type === "total") {
      query = "SELECT * FROM vote_streaks ORDER BY total_votes DESC LIMIT ?";
    } else if (type === "longest") {
      query = "SELECT * FROM vote_streaks ORDER BY longest_streak DESC LIMIT ?";
    }

    const leaderboard = await new Promise((resolve, reject) => {
      db.db.all(query, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    return leaderboard;
  }

  /**
   * Check if user has active reward (within 12 hours of last vote)
   */
  async hasActiveReward(userId) {
    const now = Date.now();
    const twelveHoursAgo = now - 12 * 60 * 60 * 1000;

    const recentVote = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT * FROM vote_rewards WHERE user_id = ? AND voted_at > ? ORDER BY voted_at DESC LIMIT 1",
        [userId, twelveHoursAgo],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    return !!recentVote;
  }

  /**
   * Get all users with active rewards (for role management)
   */
  async getActiveRewardUsers(guildId) {
    const now = Date.now();

    const activeUsers = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT DISTINCT user_id FROM vote_rewards WHERE guild_id = ? AND reward_expires > ?",
        [guildId, now],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    return activeUsers.map((u) => u.user_id);
  }

  /**
   * Clean up expired rewards
   */
  async cleanupExpiredRewards() {
    const now = Date.now();

    try {
      await new Promise((resolve, reject) => {
        db.db.run(
          "DELETE FROM vote_rewards WHERE reward_expires < ? AND reward_claimed = 1",
          [now - 7 * 24 * 60 * 60 * 1000], // Keep for 7 days after expiry
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      logger.info("[Vote Rewards] Cleaned up expired rewards");
    } catch (error) {
      logger.error("[Vote Rewards] Error cleaning up rewards:", error);
    }
  }

  /**
   * Check for new votes and give rewards automatically
   */
  async checkForNewVotes(guild) {
    try {
      // Only process for the target guild
      if (guild.id !== this.targetGuildId) {
        return;
      }

      const config = await db.getServerConfig(guild.id);
      if (!config || !config.vote_rewards_enabled) {
        return; // Skip if rewards not enabled
      }

      // Get vote reward role ID from config
      const voteRoleId = config.vote_reward_role;
      // Use hardcoded webhook URL
      const webhookUrl = this.voteWebhookUrl;

      // Get all members (or use cache)
      const members = guild.members.cache;

      for (const [userId, member] of members) {
        // Skip bots
        if (member.user.bot) continue;

        // Check if we recently checked this user (avoid spam)
        const lastCheck = this.lastCheckedVotes.get(userId);
        if (lastCheck && Date.now() - lastCheck < this.checkInterval) {
          continue;
        }

        this.lastCheckedVotes.set(userId, Date.now());

        // Check all bot lists for votes
        const votedOn = await this.checkAllBotLists(userId);

        if (votedOn.length > 0) {
          // Check which votes are already recorded (within last 12 hours to avoid duplicates)
          const now = Date.now();
          const twelveHoursAgo = now - 12 * 60 * 60 * 1000;

          const existingVotes = await new Promise((resolve, reject) => {
            db.db.all(
              "SELECT botlist FROM vote_rewards WHERE user_id = ? AND guild_id = ? AND voted_at > ?",
              [userId, guild.id, twelveHoursAgo],
              (err, rows) => {
                if (err) reject(err);
                else resolve(rows ? rows.map((r) => r.botlist) : []);
              }
            );
          });

          // Filter out votes that have already been recorded
          const newVotes = votedOn.filter(
            (botlist) => !existingVotes.includes(botlist)
          );

          if (newVotes.length > 0) {
            // User has new votes! Give rewards
            for (const botlist of newVotes) {
              await this.recordVote(userId, guild.id, botlist);
            }

            // Add temporary reward role
            if (voteRoleId && !member.roles.cache.has(voteRoleId)) {
              try {
                await member.roles.add(
                  voteRoleId,
                  "Vote reward - expires in 12 hours"
                );
                logger.info(
                  `[Vote Rewards] Added reward role to ${member.user.tag}`
                );
              } catch (error) {
                logger.error(
                  `[Vote Rewards] Failed to add role to ${member.user.tag}:`,
                  error.message
                );
              }
            }

            // Send webhook notification only for new votes
            if (webhookUrl) {
              await this.sendVoteWebhook(
                webhookUrl,
                member.user,
                newVotes,
                guild
              );
            }

            // Give streak milestone roles
            const stats = await this.getVoteStats(member.id);
            if (stats.current_streak >= 7) {
              await this.giveStreakRoles(member, stats.current_streak);
            }
          }
        }
      }
    } catch (error) {
      logger.error("[Vote Rewards] Error checking for votes:", error);
    }
  }

  /**
   * Check all bot lists for user votes
   */
  async checkAllBotLists(userId) {
    const votedOn = [];

    // Check Top.gg
    if (process.env.TOPGG_TOKEN) {
      try {
        const Topgg = require("@top-gg/sdk");
        const api = new Topgg.Api(process.env.TOPGG_TOKEN);
        const hasVoted = await api.hasVoted(userId, this.client.user.id);
        if (hasVoted) votedOn.push("Top.gg");
      } catch (error) {
        // Silently fail
      }
    }

    // Check Discord Bot List
    if (process.env.DISCORDBOTLIST_TOKEN) {
      try {
        const DiscordBotList = require("./discordbotlist");
        const dbl = new DiscordBotList(
          this.client,
          process.env.DISCORDBOTLIST_TOKEN
        );
        const vote = await dbl.hasVoted(userId, this.client.user.id);
        if (vote) votedOn.push("Discord Bot List");
      } catch (error) {
        // Silently fail
      }
    }

    // Check Void Bots
    if (process.env.VOIDBOTS_TOKEN) {
      try {
        const VoidBots = require("./voidbots");
        const voidBots =
          this.client.voidBots ||
          new VoidBots(this.client, process.env.VOIDBOTS_TOKEN);
        const hasVoted = await voidBots.hasVoted(userId);
        if (hasVoted) votedOn.push("Void Bots");
      } catch (error) {
        // Silently fail
      }
    }

    // Check Discord Bots
    if (process.env.DISCORDBOTS_TOKEN) {
      try {
        const DiscordBots = require("./discordbots");
        const discordBots =
          this.client.discordBots ||
          new DiscordBots(this.client, process.env.DISCORDBOTS_TOKEN);
        const hasVoted = await discordBots.hasVoted(userId);
        if (hasVoted) votedOn.push("Discord Bots");
      } catch (error) {
        // Silently fail
      }
    }

    // Check Bots on Discord
    if (process.env.BOTSONDICORD_TOKEN) {
      try {
        const BotsOnDiscord = require("./botsondicord");
        const botsOnDiscord =
          this.client.botsOnDiscord ||
          new BotsOnDiscord(this.client, process.env.BOTSONDICORD_TOKEN);
        const hasVoted = await botsOnDiscord.hasVoted(userId);
        if (hasVoted) votedOn.push("Bots on Discord");
      } catch (error) {
        // Silently fail
      }
    }

    return votedOn;
  }

  /**
   * Send webhook notification for vote
   */
  async sendVoteWebhook(webhookUrl, user, botlists, guild) {
    try {
      const axios = require("axios");

      await axios.post(webhookUrl, {
        embeds: [
          {
            title: "🎉 New Vote!",
            description: `**${user.tag}** just voted for ${guild.name}!`,
            color: 0xffd700,
            fields: [
              {
                name: "Voted On",
                value: botlists.join(", "),
                inline: true,
              },
              {
                name: "User",
                value: `<@${user.id}>`,
                inline: true,
              },
            ],
            thumbnail: {
              url: user.displayAvatarURL({ dynamic: true }),
            },
            timestamp: new Date().toISOString(),
            footer: {
              text: "Thank you for voting! 💙",
            },
          },
        ],
      });

      logger.info(`[Vote Rewards] Sent webhook notification for ${user.tag}`);
    } catch (error) {
      logger.error("[Vote Rewards] Error sending webhook:", error.message);
    }
  }

  /**
   * Remove expired vote roles
   */
  async removeExpiredRoles(guild) {
    try {
      // Only process for the target guild
      if (guild.id !== this.targetGuildId) {
        return;
      }

      const config = await db.getServerConfig(guild.id);
      if (!config || !config.vote_reward_role) {
        return;
      }

      const voteRoleId = config.vote_reward_role;
      const now = Date.now();

      // Get all users with expired rewards
      const expiredUsers = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT DISTINCT user_id FROM vote_rewards WHERE guild_id = ? AND reward_expires < ?",
          [guild.id, now],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      for (const row of expiredUsers) {
        try {
          const member = await guild.members.fetch(row.user_id);
          if (member && member.roles.cache.has(voteRoleId)) {
            // Check if they still have an active vote
            const activeVote = await new Promise((resolve, reject) => {
              db.db.get(
                "SELECT * FROM vote_rewards WHERE user_id = ? AND guild_id = ? AND reward_expires > ?",
                [row.user_id, guild.id, now],
                (err, row) => {
                  if (err) reject(err);
                  else resolve(row);
                }
              );
            });

            if (!activeVote) {
              await member.roles.remove(voteRoleId, "Vote reward expired");
              logger.info(
                `[Vote Rewards] Removed expired reward role from ${member.user.tag}`
              );
            }
          }
        } catch (error) {
          // User left server or other error
        }
      }
    } catch (error) {
      logger.error("[Vote Rewards] Error removing expired roles:", error);
    }
  }

  /**
   * Create vote reward roles if they don't exist
   */
  async createRewardRoles(guild) {
    try {
      // Only create roles in the target guild
      if (guild.id !== this.targetGuildId) {
        return [];
      }
      const rolesToCreate = [
        {
          name: "Voter",
          color: 0xffd700,
          reason: "Vote reward role (12 hours)",
        },
        { name: "7-Day Voter", color: 0xff6b35, reason: "7-day vote streak" },
        { name: "14-Day Voter", color: 0xff4500, reason: "14-day vote streak" },
        { name: "30-Day Voter", color: 0x9b59b6, reason: "30-day vote streak" },
        { name: "60-Day Voter", color: 0xe74c3c, reason: "60-day vote streak" },
        { name: "90-Day Voter", color: 0xf39c12, reason: "90-day vote streak" },
      ];

      const createdRoles = [];

      for (const roleData of rolesToCreate) {
        // Check if role already exists
        const existingRole = guild.roles.cache.find(
          (r) => r.name === roleData.name
        );

        if (!existingRole) {
          try {
            const newRole = await guild.roles.create({
              name: roleData.name,
              color: roleData.color,
              reason: roleData.reason,
              mentionable: false,
            });
            createdRoles.push(newRole);
            logger.info(
              `[Vote Rewards] Created role "${roleData.name}" in ${guild.name}`
            );
          } catch (error) {
            logger.error(
              `[Vote Rewards] Failed to create role "${roleData.name}":`,
              error.message
            );
          }
        } else {
          logger.debug(
            `[Vote Rewards] Role "${roleData.name}" already exists in ${guild.name}`
          );
        }
      }

      // Auto-configure the base "Voter" role if not set
      if (createdRoles.length > 0) {
        const voterRole = guild.roles.cache.find((r) => r.name === "Voter");
        if (voterRole) {
          try {
            // First ensure the columns exist, then update
            await new Promise((resolve, reject) => {
              db.db.run(
                `UPDATE server_config 
                 SET vote_rewards_enabled = 1, 
                     vote_reward_role = ?
                 WHERE guild_id = ?`,
                [voterRole.id, guild.id],
                (err) => {
                  if (err) {
                    // If columns don't exist, try to add them and retry
                    logger.error(
                      "[Vote Rewards] Error updating config:",
                      err.message
                    );
                    reject(err);
                  } else {
                    resolve();
                  }
                }
              );
            });
            logger.info(
              `[Vote Rewards] Auto-configured Voter role in ${guild.name}`
            );
          } catch (error) {
            logger.error(
              "[Vote Rewards] Failed to auto-configure:",
              error.message
            );
          }
        }
      }

      return createdRoles;
    } catch (error) {
      logger.error(
        `[Vote Rewards] Error creating reward roles for ${guild.name}:`,
        error
      );
      return [];
    }
  }

  /**
   * Give streak milestone roles
   */
  async giveStreakRoles(member, streak) {
    try {
      const streakRoles = [
        { streak: 7, name: "7-Day Voter" },
        { streak: 14, name: "14-Day Voter" },
        { streak: 30, name: "30-Day Voter" },
        { streak: 60, name: "60-Day Voter" },
        { streak: 90, name: "90-Day Voter" },
      ];

      // Find the highest streak role the user qualifies for
      let highestQualifiedRole = null;
      for (const roleData of streakRoles) {
        if (streak >= roleData.streak) {
          highestQualifiedRole = roleData.name;
        }
      }

      if (!highestQualifiedRole) return;

      // Find the role in guild
      const role = member.guild.roles.cache.find(
        (r) => r.name === highestQualifiedRole
      );

      if (role && !member.roles.cache.has(role.id)) {
        await member.roles.add(
          role,
          `Earned ${highestQualifiedRole} milestone`
        );
        logger.info(
          `[Vote Rewards] Gave ${highestQualifiedRole} to ${member.user.tag}`
        );

        // Remove lower tier streak roles
        for (const roleData of streakRoles) {
          if (roleData.name !== highestQualifiedRole) {
            const lowerRole = member.guild.roles.cache.find(
              (r) => r.name === roleData.name
            );
            if (lowerRole && member.roles.cache.has(lowerRole.id)) {
              await member.roles.remove(
                lowerRole,
                `Upgraded to ${highestQualifiedRole}`
              );
            }
          }
        }
      }
    } catch (error) {
      logger.error("[Vote Rewards] Error giving streak roles:", error);
    }
  }

  /**
   * Start automatic vote checking
   */
  async startAutoChecking(guild) {
    // Only start auto-checking for the target guild
    if (guild.id !== this.targetGuildId) {
      return;
    }

    // Create reward roles if they don't exist
    await this.createRewardRoles(guild);

    // Run initial check immediately (don't wait 5 minutes)
    logger.info(`[Vote Rewards] Running initial vote check for ${guild.name}`);
    setTimeout(() => {
      this.checkForNewVotes(guild);
    }, 10000); // Wait 10 seconds for bot to be fully ready

    // Check for new votes every 5 minutes
    setInterval(() => {
      this.checkForNewVotes(guild);
    }, this.checkInterval);

    // Remove expired roles every hour
    setInterval(
      () => {
        this.removeExpiredRoles(guild);
      },
      60 * 60 * 1000
    );

    logger.info(
      `[Vote Rewards] Started auto-checking for ${guild.name} (checks every 5 minutes)`
    );
  }
}

module.exports = VoteRewards;
