// Server Health Scoring System
// Calculates a 0-100 health score for each server based on multiple factors

const db = require("./database");
const logger = require("./logger");

class ServerHealth {
  constructor() {
    this.weights = {
      security: 0.35, // 35% - Security features enabled
      configuration: 0.25, // 25% - Configuration completeness
      activity: 0.2, // 20% - Recent moderation activity
      threats: 0.15, // 15% - Threat handling
      uptime: 0.05, // 5% - Bot uptime in server
    };
  }

  /**
   * Calculate overall health score for a server
   * @param {string} guildId - Guild ID
   * @returns {Promise<Object>} Health score and breakdown
   */
  async calculateHealth(guildId) {
    try {
      const scores = {
        security: await this.calculateSecurityScore(guildId),
        configuration: await this.calculateConfigScore(guildId),
        activity: await this.calculateActivityScore(guildId),
        threats: await this.calculateThreatScore(guildId),
        uptime: await this.calculateUptimeScore(guildId),
      };

      // Calculate weighted total
      const total = Object.keys(scores).reduce((sum, key) => {
        return sum + scores[key] * this.weights[key];
      }, 0);

      const health = Math.round(total);

      return {
        overall: health,
        grade: this.getGrade(health),
        status: this.getStatus(health),
        color: this.getColor(health),
        breakdown: scores,
        recommendations: await this.getRecommendations(guildId, scores),
      };
    } catch (error) {
      logger.error("Server Health", "Error calculating health", error);
      return {
        overall: 0,
        grade: "F",
        status: "Unknown",
        color: "#999",
        breakdown: {},
        recommendations: [],
      };
    }
  }

  /**
   * Security Score (0-100)
   * Based on enabled security features
   */
  async calculateSecurityScore(guildId) {
    const config = await db.getServerConfig(guildId);
    if (!config) return 0;

    let score = 0;
    const features = {
      anti_raid_enabled: 15,
      anti_nuke_enabled: 15,
      join_gate_enabled: 10,
      verification_enabled: 10,
      heat_system_enabled: 10,
      auto_mod_enabled: 10,
      link_filtering: 10,
      invite_filtering: 10,
      spam_protection: 10,
    };

    for (const [feature, points] of Object.entries(features)) {
      if (config[feature]) {
        score += points;
      }
    }

    return Math.min(score, 100);
  }

  /**
   * Configuration Score (0-100)
   * Based on setup completeness
   */
  async calculateConfigScore(guildId) {
    const config = await db.getServerConfig(guildId);
    if (!config) return 0;

    let score = 0;
    const checks = [
      { key: "mod_role", points: 20 },
      { key: "admin_role", points: 15 },
      { key: "log_channel", points: 15 },
      { key: "mod_log_channel", points: 10 },
      { key: "alert_channel", points: 10 },
      { key: "verification_role", points: 10 },
      { key: "mute_role", points: 10 },
      { key: "welcome_channel", points: 5 },
      { key: "ticket_category", points: 5 },
    ];

    for (const check of checks) {
      if (config[check.key]) {
        score += check.points;
      }
    }

    return Math.min(score, 100);
  }

  /**
   * Activity Score (0-100)
   * Based on recent moderation actions
   */
  async calculateActivityScore(guildId) {
    try {
      const last7Days = Date.now() - 7 * 24 * 60 * 60 * 1000;

      // Count recent moderation actions
      const modActions = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT COUNT(*) as count FROM moderation_logs WHERE guild_id = ? AND timestamp > ?",
          [guildId, last7Days],
          (err, row) => {
            if (err) reject(err);
            else resolve(row?.count || 0);
          }
        );
      });

      // Score based on activity level
      if (modActions === 0) return 50; // Neutral - might be good (no issues) or bad (not configured)
      if (modActions < 5) return 70; // Some activity
      if (modActions < 20) return 85; // Active moderation
      return 100; // Very active
    } catch (error) {
      return 50; // Neutral on error
    }
  }

  /**
   * Threat Score (0-100)
   * Based on detected and handled threats
   */
  async calculateThreatScore(guildId) {
    try {
      const last7Days = Date.now() - 7 * 24 * 60 * 60 * 1000;

      // Count security threats
      const threats = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT COUNT(*) as count FROM security_logs WHERE guild_id = ? AND timestamp > ?",
          [guildId, last7Days],
          (err, row) => {
            if (err) reject(err);
            else resolve(row?.count || 0);
          }
        );
      });

      // Count raid attempts
      const raids = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT COUNT(*) as count FROM anti_raid_logs WHERE guild_id = ? AND timestamp > ?",
          [guildId, last7Days],
          (err, row) => {
            if (err) reject(err);
            else resolve(row?.count || 0);
          }
        );
      });

      const totalThreats = threats + raids;

      // Score based on threat handling
      if (totalThreats === 0) return 100; // No threats (good!)
      if (totalThreats < 3) return 90; // Few threats, handled well
      if (totalThreats < 10) return 75; // Some threats
      if (totalThreats < 25) return 60; // Many threats
      return 40; // High threat environment
    } catch (error) {
      return 100; // Assume good on error
    }
  }

  /**
   * Uptime Score (0-100)
   * Based on how long bot has been in server
   */
  async calculateUptimeScore(guildId) {
    try {
      // Get first log entry for this guild
      const firstLog = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT MIN(timestamp) as first_seen FROM moderation_logs WHERE guild_id = ?",
          [guildId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row?.first_seen);
          }
        );
      });

      if (!firstLog) return 50; // No data, neutral

      const daysSinceJoin = (Date.now() - firstLog) / (24 * 60 * 60 * 1000);

      // Score based on tenure
      if (daysSinceJoin < 1) return 20; // Just joined
      if (daysSinceJoin < 7) return 50; // Less than a week
      if (daysSinceJoin < 30) return 75; // Less than a month
      return 100; // Established
    } catch (error) {
      return 50;
    }
  }

  /**
   * Get letter grade from score
   */
  getGrade(score) {
    if (score >= 90) return "A+";
    if (score >= 85) return "A";
    if (score >= 80) return "B+";
    if (score >= 75) return "B";
    if (score >= 70) return "C+";
    if (score >= 65) return "C";
    if (score >= 60) return "D";
    return "F";
  }

  /**
   * Get status text from score
   */
  getStatus(score) {
    if (score >= 90) return "Excellent";
    if (score >= 80) return "Good";
    if (score >= 70) return "Fair";
    if (score >= 60) return "Needs Improvement";
    return "Critical";
  }

  /**
   * Get color from score
   */
  getColor(score) {
    if (score >= 90) return "#48bb78"; // Green
    if (score >= 80) return "#68d391"; // Light green
    if (score >= 70) return "#ed8936"; // Orange
    if (score >= 60) return "#f56565"; // Red
    return "#c53030"; // Dark red
  }

  /**
   * Get personalized recommendations
   */
  async getRecommendations(guildId, scores) {
    const recommendations = [];
    const config = await db.getServerConfig(guildId);

    // Security recommendations
    if (scores.security < 70) {
      if (!config?.anti_raid_enabled) {
        recommendations.push({
          priority: "high",
          category: "Security",
          message: "Enable Anti-Raid protection to prevent mass join attacks",
          action: "/config anti-raid enable",
        });
      }
      if (!config?.anti_nuke_enabled) {
        recommendations.push({
          priority: "high",
          category: "Security",
          message:
            "Enable Anti-Nuke to protect against malicious admin actions",
          action: "/config anti-nuke enable",
        });
      }
      if (!config?.verification_enabled) {
        recommendations.push({
          priority: "medium",
          category: "Security",
          message:
            "Enable verification to filter out bots and suspicious users",
          action: "/verification setup",
        });
      }
    }

    // Configuration recommendations
    if (scores.configuration < 70) {
      if (!config?.log_channel) {
        recommendations.push({
          priority: "high",
          category: "Configuration",
          message: "Set up a log channel to track all server events",
          action: "/config log-channel #channel",
        });
      }
      if (!config?.mod_role) {
        recommendations.push({
          priority: "high",
          category: "Configuration",
          message: "Assign a moderator role for proper permissions",
          action: "/config mod-role @role",
        });
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    recommendations.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    return recommendations.slice(0, 5); // Top 5 recommendations
  }

  /**
   * Get health for all servers (for dashboard)
   */
  async getAllServersHealth(client) {
    const guilds = client.guilds.cache;
    const healthData = [];

    for (const [guildId, guild] of guilds) {
      const health = await this.calculateHealth(guildId);
      healthData.push({
        guildId,
        guildName: guild.name,
        memberCount: guild.memberCount,
        ...health,
      });
    }

    // Sort by health score (worst first, so they get attention)
    healthData.sort((a, b) => a.overall - b.overall);

    return healthData;
  }
}

module.exports = new ServerHealth();
