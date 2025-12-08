const db = require("./database");
const logger = require("./logger");

/**
 * Cross-Server User Profile System
 * Track user reputation and contributions across all servers
 */
class UserProfiles {
  constructor(client) {
    this.client = client;
    this.profiles = new Map(); // userId -> profile data
  }

  /**
   * Get or create user profile
   */
  async getProfile(userId) {
    // Check cache
    if (this.profiles.has(userId)) {
      return this.profiles.get(userId);
    }

    // Check database
    const profile = await new Promise((resolve, reject) => {
      db.db.get(
        `SELECT * FROM user_profiles WHERE user_id = ?`,
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (profile) {
      this.profiles.set(userId, profile);
      return profile;
    }

    // Create new profile
    const newProfile = {
      user_id: userId,
      reputation: 100,
      total_servers: 0,
      threats_detected: 0,
      contributions: 0,
      badges: [],
      created_at: Date.now(),
    };

    await new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO user_profiles (user_id, reputation, created_at) VALUES (?, ?, ?)`,
        [userId, 100, Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    this.profiles.set(userId, newProfile);
    return newProfile;
  }

  /**
   * Update reputation
   */
  async updateReputation(userId, change, reason) {
    const profile = await this.getProfile(userId);
    const newReputation = Math.max(
      0,
      Math.min(1000, profile.reputation + change)
    );

    await new Promise((resolve, reject) => {
      db.db.run(
        `UPDATE user_profiles SET reputation = ? WHERE user_id = ?`,
        [newReputation, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Update cache
    profile.reputation = newReputation;
    this.profiles.set(userId, profile);

    // Log reputation change
    await db.db.run(
      `INSERT INTO reputation_log (user_id, change_amount, reason, timestamp) VALUES (?, ?, ?, ?)`,
      [userId, change, reason, Date.now()]
    );

    logger.info(
      "UserProfiles",
      `${userId} reputation: ${change > 0 ? "+" : ""}${change} (${reason})`
    );

    return newReputation;
  }

  /**
   * Award badge
   */
  async awardBadge(userId, badgeId, badgeName) {
    const profile = await this.getProfile(userId);
    const badges = JSON.parse(profile.badges || "[]");

    if (!badges.includes(badgeId)) {
      badges.push(badgeId);

      await new Promise((resolve, reject) => {
        db.db.run(
          `UPDATE user_profiles SET badges = ? WHERE user_id = ?`,
          [JSON.stringify(badges), userId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Notify user
      try {
        const user = await this.client.users.fetch(userId);
        await user.send({
          embeds: [
            {
              title: "🏅 New Badge Earned!",
              description: `You've earned: **${badgeName}**`,
              color: 0xffd700,
              timestamp: new Date(),
            },
          ],
        });
      } catch (error) {
        // DMs disabled or other error
      }

      logger.success("UserProfiles", `Awarded ${badgeName} to ${userId}`);
    }
  }

  /**
   * Get user tier based on reputation
   */
  getTier(reputation) {
    if (reputation >= 900)
      return { name: "Legendary", emoji: "🌟", color: "#FFD700" };
    if (reputation >= 700)
      return { name: "Elite", emoji: "💎", color: "#00F5FF" };
    if (reputation >= 500)
      return { name: "Veteran", emoji: "⭐", color: "#C0C0C0" };
    if (reputation >= 300)
      return { name: "Trusted", emoji: "✅", color: "#4CAF50" };
    if (reputation >= 100)
      return { name: "Member", emoji: "👤", color: "#2196F3" };
    return { name: "New", emoji: "🆕", color: "#FF9800" };
  }

  /**
   * Get global reputation leaderboard
   */
  async getGlobalLeaderboard(limit = 100) {
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT user_id, reputation, badges, threats_detected, contributions 
         FROM user_profiles 
         ORDER BY reputation DESC 
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Increment contribution counter
   */
  async incrementContributions(userId, type = "general") {
    await db.db.run(
      `UPDATE user_profiles SET contributions = contributions + 1 WHERE user_id = ?`,
      [userId]
    );

    await db.db.run(
      `INSERT INTO contribution_log (user_id, contribution_type, timestamp) VALUES (?, ?, ?)`,
      [userId, type, Date.now()]
    );
  }
}

module.exports = UserProfiles;
