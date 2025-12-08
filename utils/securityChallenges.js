const db = require("./database");
const logger = require("./logger");
const { EmbedBuilder } = require("discord.js");

/**
 * Security Challenges & Gamification System
 * Weekly challenges to improve server security
 */
class SecurityChallenges {
  constructor(client) {
    this.client = client;
    this.challenges = this.defineWeeklyChallenges();
  }

  /**
   * Define weekly challenge types
   */
  defineWeeklyChallenges() {
    return [
      {
        id: "threat_hunter",
        name: "🎯 Threat Hunter",
        description: "Detect and block 10 threats",
        goal: 10,
        metric: "threats_blocked",
        reward: { badge: "Threat Hunter 🎯", points: 100 },
      },
      {
        id: "security_expert",
        name: "🛡️ Security Expert",
        description: "Configure all security features",
        goal: 1,
        metric: "full_config",
        reward: { badge: "Security Expert 🛡️", points: 150 },
      },
      {
        id: "community_guardian",
        name: "👥 Community Guardian",
        description: "Moderate 50 users this week",
        goal: 50,
        metric: "moderation_actions",
        reward: { badge: "Community Guardian 👥", points: 75 },
      },
      {
        id: "raid_defender",
        name: "⚔️ Raid Defender",
        description: "Block 3 raid attempts",
        goal: 3,
        metric: "raids_blocked",
        reward: { badge: "Raid Defender ⚔️", points: 200 },
      },
      {
        id: "perfect_week",
        name: "💯 Perfect Week",
        description: "Zero security incidents for 7 days",
        goal: 1,
        metric: "zero_incidents",
        reward: { badge: "Perfect Week 💯", points: 250 },
      },
    ];
  }

  /**
   * Get current week's challenge
   */
  getCurrentChallenge() {
    const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const challengeIndex = weekNumber % this.challenges.length;
    return this.challenges[challengeIndex];
  }

  /**
   * Track challenge progress
   */
  async trackProgress(guildId, userId, metric, amount = 1) {
    const currentChallenge = this.getCurrentChallenge();
    if (currentChallenge.metric !== metric) return;

    try {
      // Get current progress
      const progress = await this.getProgress(
        guildId,
        userId,
        currentChallenge.id
      );
      const newProgress = progress + amount;

      // Update progress
      await db.db.run(
        `INSERT OR REPLACE INTO challenge_progress 
         (guild_id, user_id, challenge_id, progress, week_number) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          guildId,
          userId,
          currentChallenge.id,
          newProgress,
          this.getWeekNumber(),
        ]
      );

      // Check if challenge completed
      if (
        newProgress >= currentChallenge.goal &&
        progress < currentChallenge.goal
      ) {
        await this.awardChallenge(guildId, userId, currentChallenge);
      }
    } catch (error) {
      logger.error("SecurityChallenges", "Failed to track progress", error);
    }
  }

  /**
   * Get user's progress on current challenge
   */
  async getProgress(guildId, userId, challengeId) {
    return new Promise((resolve, reject) => {
      db.db.get(
        `SELECT progress FROM challenge_progress 
         WHERE guild_id = ? AND user_id = ? AND challenge_id = ? AND week_number = ?`,
        [guildId, userId, challengeId, this.getWeekNumber()],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.progress || 0);
        }
      );
    });
  }

  /**
   * Award completed challenge
   */
  async awardChallenge(guildId, userId, challenge) {
    try {
      // Record completion
      await db.db.run(
        `INSERT INTO challenge_completions 
         (guild_id, user_id, challenge_id, completed_at, points_earned) 
         VALUES (?, ?, ?, ?, ?)`,
        [guildId, userId, challenge.id, Date.now(), challenge.reward.points]
      );

      // Notify user
      const user = await this.client.users.fetch(userId);
      if (user) {
        await user.send({
          embeds: [
            {
              title: "🎉 Challenge Complete!",
              description:
                `Congratulations! You completed: **${challenge.name}**\n\n` +
                `**Reward:** ${challenge.reward.badge}\n` +
                `**Points Earned:** ${challenge.reward.points}`,
              color: 0x4caf50,
              timestamp: new Date(),
            },
          ],
        });
      }

      logger.success(
        "SecurityChallenges",
        `${user.tag} completed ${challenge.name}`
      );
    } catch (error) {
      logger.error("SecurityChallenges", "Failed to award challenge", error);
    }
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(guildId, limit = 10) {
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT user_id, SUM(points_earned) as total_points, COUNT(*) as challenges_completed
         FROM challenge_completions 
         WHERE guild_id = ?
         GROUP BY user_id 
         ORDER BY total_points DESC 
         LIMIT ?`,
        [guildId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get user's total points
   */
  async getUserPoints(guildId, userId) {
    return new Promise((resolve, reject) => {
      db.db.get(
        `SELECT SUM(points_earned) as points FROM challenge_completions 
         WHERE guild_id = ? AND user_id = ?`,
        [guildId, userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.points || 0);
        }
      );
    });
  }

  /**
   * Get week number for tracking
   */
  getWeekNumber() {
    return Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  }
}

module.exports = SecurityChallenges;
