// Member Intelligence System
// Analyze member behavior and calculate risk scores

const db = require("./database");

class MemberIntelligence {
  constructor() {
    this.riskFactors = {
      newAccount: 15, // Account < 30 days old
      veryNewAccount: 25, // Account < 7 days old
      noAvatar: 10, // Default avatar
      suspiciousName: 15, // Contains discord.gg, @everyone, etc
      recentJoin: 10, // Joined server < 24h ago
      multipleWarnings: 20, // Has warnings
      previousBan: 30, // Previously banned/kicked
      rapidMessages: 15, // Sent many messages quickly
      mentionSpam: 20, // Many mentions in short time
      linkSpam: 15, // Posted many links
      lowActivity: -10, // Active member (reduces risk)
      verified: -15, // Passed verification
      hasRole: -10, // Has assigned roles
    };
  }

  /**
   * Calculate risk score for a member (0-100)
   * Higher = more risky
   */
  async calculateRiskScore(member) {
    try {
      let score = 0;
      const reasons = [];

      // Account age check
      const accountAge = Date.now() - member.user.createdTimestamp;
      const daysOld = accountAge / (24 * 60 * 60 * 1000);

      if (daysOld < 7) {
        score += this.riskFactors.veryNewAccount;
        reasons.push("⚠️ Very new account (< 7 days)");
      } else if (daysOld < 30) {
        score += this.riskFactors.newAccount;
        reasons.push("⚠️ New account (< 30 days)");
      }

      // Avatar check
      if (member.user.avatar === null) {
        score += this.riskFactors.noAvatar;
        reasons.push("⚠️ No custom avatar");
      }

      // Username check
      const suspiciousPatterns = [
        /discord\.gg/i,
        /@everyone/i,
        /@here/i,
        /nitro/i,
        /free/i,
        /gift/i,
      ];

      if (
        suspiciousPatterns.some((pattern) => pattern.test(member.user.username))
      ) {
        score += this.riskFactors.suspiciousName;
        reasons.push("⚠️ Suspicious username");
      }

      // Join time check
      const joinAge = Date.now() - member.joinedTimestamp;
      const hoursInServer = joinAge / (60 * 60 * 1000);

      if (hoursInServer < 24) {
        score += this.riskFactors.recentJoin;
        reasons.push("⚠️ Recently joined server");
      }

      // Check warnings
      const warnings = await this.getWarnings(member.guild.id, member.id);
      if (warnings > 0) {
        score += this.riskFactors.multipleWarnings * warnings;
        reasons.push(`⚠️ Has ${warnings} warning(s)`);
      }

      // Check previous moderation
      const previousActions = await this.getPreviousModActions(
        member.guild.id,
        member.id
      );
      if (previousActions.bans > 0 || previousActions.kicks > 0) {
        score += this.riskFactors.previousBan;
        reasons.push("⚠️ Previously banned/kicked");
      }

      // Activity analysis (if we have data)
      const activity = await this.getActivityMetrics(
        member.guild.id,
        member.id
      );

      if (activity.messageRate > 10) {
        // More than 10 messages per minute
        score += this.riskFactors.rapidMessages;
        reasons.push("⚠️ Rapid message sending");
      }

      if (activity.mentionRate > 5) {
        // More than 5 mentions per minute
        score += this.riskFactors.mentionSpam;
        reasons.push("⚠️ Excessive mentions");
      }

      // Positive factors
      if (member.roles.cache.size > 1) {
        // Has roles (not just @everyone)
        score += this.riskFactors.hasRole;
        reasons.push("✅ Has assigned roles");
      }

      if (activity.totalMessages > 50) {
        // Active member
        score += this.riskFactors.lowActivity;
        reasons.push("✅ Active member");
      }

      // Ensure score is between 0-100
      score = Math.max(0, Math.min(100, score));

      return {
        score,
        level: this.getRiskLevel(score),
        color: this.getRiskColor(score),
        reasons,
        accountAge: Math.floor(daysOld),
        serverAge: Math.floor(hoursInServer / 24),
        warnings: warnings,
        activity: activity.totalMessages,
      };
    } catch (error) {
      logger.error("Member Intelligence", "Error calculating risk", {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
      });
      return {
        score: 0,
        level: "Unknown",
        color: "#999",
        reasons: ["Error calculating risk"],
        accountAge: 0,
        serverAge: 0,
        warnings: 0,
        activity: 0,
      };
    }
  }

  getRiskLevel(score) {
    if (score >= 70) return "Critical";
    if (score >= 50) return "High";
    if (score >= 30) return "Medium";
    if (score >= 10) return "Low";
    return "Minimal";
  }

  getRiskColor(score) {
    if (score >= 70) return "#c53030"; // Dark red
    if (score >= 50) return "#f56565"; // Red
    if (score >= 30) return "#ed8936"; // Orange
    if (score >= 10) return "#ecc94b"; // Yellow
    return "#48bb78"; // Green
  }

  async getWarnings(guildId, userId) {
    try {
      return await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT COUNT(*) as count FROM warnings WHERE guild_id = ? AND user_id = ?",
          [guildId, userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row?.count || 0);
          }
        );
      });
    } catch (error) {
      return 0;
    }
  }

  async getPreviousModActions(guildId, userId) {
    try {
      const bans = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT COUNT(*) as count FROM moderation_logs WHERE guild_id = ? AND user_id = ? AND action = 'ban'",
          [guildId, userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row?.count || 0);
          }
        );
      });

      const kicks = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT COUNT(*) as count FROM moderation_logs WHERE guild_id = ? AND user_id = ? AND action = 'kick'",
          [guildId, userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row?.count || 0);
          }
        );
      });

      return { bans, kicks };
    } catch (error) {
      return { bans: 0, kicks: 0 };
    }
  }

  async getActivityMetrics(guildId, userId) {
    try {
      const userStats = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM user_stats WHERE guild_id = ? AND user_id = ?",
          [guildId, userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!userStats) {
        return { totalMessages: 0, messageRate: 0, mentionRate: 0 };
      }

      return {
        totalMessages: userStats.messages_sent || 0,
        messageRate: 0, // Would need time-based tracking
        mentionRate: 0, // Would need mention tracking
      };
    } catch (error) {
      return { totalMessages: 0, messageRate: 0, mentionRate: 0 };
    }
  }

  /**
   * Get top risky members in a server
   */
  async getTopRiskyMembers(guild, limit = 10) {
    try {
      await guild.members.fetch();
      const riskScores = [];

      for (const [id, member] of guild.members.cache) {
        if (member.user.bot) continue; // Skip bots

        const risk = await this.calculateRiskScore(member);
        riskScores.push({
          member,
          ...risk,
        });
      }

      // Sort by risk score (highest first)
      riskScores.sort((a, b) => b.score - a.score);

      return riskScores.slice(0, limit);
    } catch (error) {
      logger.error("Member Intelligence", "Error getting risky members", {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
      });
      return [];
    }
  }
}

module.exports = new MemberIntelligence();
