const logger = require("./logger");

/**
 * Retention & Churn Analysis System
 * Tracks why servers leave and identifies patterns
 */
class RetentionTracker {
  constructor() {
    this.db = null;
    this.client = null;
  }

  setClient(client, db) {
    this.client = client;
    this.db = db;
  }

  /**
   * Track server leaving with comprehensive data
   */
  async trackServerLeave(guild) {
    try {
      const leaveData = await this.collectLeaveData(guild);

      // Store in database
      await this.db.run(
        `INSERT INTO server_retention (
          guild_id, guild_name, member_count, joined_at, left_at, 
          lifetime_days, commands_used, features_configured, 
          last_activity, owner_id, leave_reason_guess
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          leaveData.guildId,
          leaveData.guildName,
          leaveData.memberCount,
          leaveData.joinedAt,
          leaveData.leftAt,
          leaveData.lifetimeDays,
          leaveData.commandsUsed,
          leaveData.featuresConfigured,
          leaveData.lastActivity,
          leaveData.ownerId,
          leaveData.leaveReasonGuess,
        ]
      );

      logger.info(
        "RetentionTracker",
        `Server left: ${leaveData.guildName} (${leaveData.lifetimeDays} days lifetime, ${leaveData.commandsUsed} commands used)`
      );

      // Analyze churn pattern
      await this.analyzeChurnPattern(leaveData);
    } catch (error) {
      logger.error("RetentionTracker", "Failed to track server leave:", error);
    }
  }

  /**
   * Collect comprehensive data about the leaving server
   */
  async collectLeaveData(guild) {
    const guildId = guild.id;
    const now = Date.now();

    // Get when bot joined
    const joinRecord = await this.db
      .get("SELECT joined_at FROM server_joins WHERE guild_id = ?", [guildId])
      .catch(() => ({ joined_at: now }));

    const joinedAt = joinRecord?.joined_at || now;
    const lifetimeDays = (now - joinedAt) / (1000 * 60 * 60 * 24);

    // Get command usage
    const commandStats = await this.db
      .get(
        "SELECT COUNT(*) as total FROM command_usage_log WHERE guild_id = ?",
        [guildId]
      )
      .catch(() => ({ total: 0 }));

    // Get configured features
    const config = await this.db
      .get("SELECT * FROM server_config WHERE guild_id = ?", [guildId])
      .catch(() => null);

    const featuresConfigured = this.countConfiguredFeatures(config);

    // Get last activity
    const lastActivity = await this.db
      .get(
        "SELECT MAX(timestamp) as last FROM command_usage_log WHERE guild_id = ?",
        [guildId]
      )
      .catch(() => ({ last: null }));

    // Guess leave reason based on data
    const leaveReasonGuess = this.guessLeaveReason({
      lifetimeDays,
      commandsUsed: commandStats.total,
      featuresConfigured,
      lastActivity: lastActivity?.last,
    });

    return {
      guildId: guild.id,
      guildName: guild.name,
      memberCount: guild.memberCount || 0,
      joinedAt,
      leftAt: now,
      lifetimeDays: Math.round(lifetimeDays * 100) / 100,
      commandsUsed: commandStats.total,
      featuresConfigured,
      lastActivity: lastActivity?.last || null,
      ownerId: guild.ownerId || null,
      leaveReasonGuess,
    };
  }

  /**
   * Count how many features are configured
   */
  countConfiguredFeatures(config) {
    if (!config) return 0;

    let count = 0;
    const features = [
      "anti_raid_enabled",
      "anti_nuke_enabled",
      "automod_enabled",
      "welcome_enabled",
      "log_channel",
      "mod_role",
    ];

    for (const feature of features) {
      if (config[feature]) count++;
    }

    return count;
  }

  /**
   * Guess why server left based on patterns
   */
  guessLeaveReason(data) {
    const { lifetimeDays, commandsUsed, featuresConfigured, lastActivity } =
      data;

    // Left within first day with no usage
    if (lifetimeDays < 1 && commandsUsed === 0) {
      return "immediate_leave_no_usage";
    }

    // Left within first day with minimal usage
    if (lifetimeDays < 1 && commandsUsed < 5) {
      return "quick_trial_didnt_stick";
    }

    // Left within first week with no configuration
    if (lifetimeDays < 7 && featuresConfigured === 0) {
      return "no_configuration_week_one";
    }

    // Inactive for over 7 days then left
    if (lastActivity && Date.now() - lastActivity > 7 * 24 * 60 * 60 * 1000) {
      return "inactive_then_left";
    }

    // Used bot but left anyway
    if (commandsUsed > 50) {
      return "active_user_left";
    }

    // Left after short trial period
    if (lifetimeDays < 7) {
      return "short_trial_period";
    }

    // Long-term user left
    if (lifetimeDays > 30) {
      return "long_term_churn";
    }

    return "unknown";
  }

  /**
   * Analyze churn pattern and alert if concerning
   */
  async analyzeChurnPattern(leaveData) {
    // Check if this is a concerning pattern
    if (leaveData.commandsUsed > 100 && leaveData.lifetimeDays > 7) {
      // Active user leaving is concerning
      logger.warn(
        "RetentionTracker",
        `🚨 CONCERNING CHURN: Active server left (${leaveData.commandsUsed} commands, ${leaveData.lifetimeDays} days)`
      );

      // Alert owner
      const errorRecovery = require("./errorRecovery");
      await errorRecovery
        .alertOwner(new Error(`Active server churn: ${leaveData.guildName}`), {
          type: "retention",
          ...leaveData,
        })
        .catch(() => {});
    }

    // Track immediate leaves (testing phase churn)
    if (leaveData.lifetimeDays < 1) {
      logger.warn(
        "RetentionTracker",
        `⚡ Quick leave: ${leaveData.guildName} (${leaveData.leaveReasonGuess})`
      );
    }
  }

  /**
   * Get retention statistics
   */
  async getRetentionStats() {
    try {
      // Overall stats
      const total = await this.db.get(
        "SELECT COUNT(*) as count FROM server_retention"
      );

      // Average lifetime
      const avgLifetime = await this.db.get(
        "SELECT AVG(lifetime_days) as avg FROM server_retention"
      );

      // Churn reasons breakdown
      const reasons = await this.db.all(
        `SELECT leave_reason_guess, COUNT(*) as count 
         FROM server_retention 
         GROUP BY leave_reason_guess 
         ORDER BY count DESC`
      );

      // Recent churn (last 7 days)
      const recentChurn = await this.db.all(
        `SELECT * FROM server_retention 
         WHERE left_at > ? 
         ORDER BY left_at DESC 
         LIMIT 10`,
        [Date.now() - 7 * 24 * 60 * 60 * 1000]
      );

      // High-value churn (active users who left)
      const highValueChurn = await this.db.all(
        `SELECT * FROM server_retention 
         WHERE commands_used > 50 AND lifetime_days > 7
         ORDER BY left_at DESC 
         LIMIT 10`
      );

      return {
        totalChurned: total.count,
        avgLifetimeDays: Math.round(avgLifetime.avg * 100) / 100,
        churnReasons: reasons,
        recentChurn,
        highValueChurn,
      };
    } catch (error) {
      logger.error("RetentionTracker", "Failed to get retention stats:", error);
      return null;
    }
  }

  /**
   * Get churn rate (last 30 days)
   */
  async getChurnRate() {
    try {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

      // Servers that left in last 30 days
      const churned = await this.db.get(
        "SELECT COUNT(*) as count FROM server_retention WHERE left_at > ?",
        [thirtyDaysAgo]
      );

      // Servers that joined in last 30 days
      const joined = await this.db.get(
        "SELECT COUNT(*) as count FROM server_joins WHERE joined_at > ?",
        [thirtyDaysAgo]
      );

      const churnRate =
        joined.count > 0
          ? ((churned.count / joined.count) * 100).toFixed(2)
          : "0.00";

      return {
        churned: churned.count,
        joined: joined.count,
        churnRate: churnRate + "%",
        netGrowth: joined.count - churned.count,
      };
    } catch (error) {
      logger.error(
        "RetentionTracker",
        "Failed to calculate churn rate:",
        error
      );
      return null;
    }
  }

  /**
   * Identify top churn reasons
   */
  async getTopChurnReasons(limit = 5) {
    try {
      const reasons = await this.db.all(
        `SELECT leave_reason_guess, 
                COUNT(*) as count,
                AVG(lifetime_days) as avg_lifetime,
                AVG(commands_used) as avg_commands
         FROM server_retention 
         GROUP BY leave_reason_guess 
         ORDER BY count DESC 
         LIMIT ?`,
        [limit]
      );

      return reasons.map((r) => ({
        reason: r.leave_reason_guess,
        count: r.count,
        avgLifetime: Math.round(r.avg_lifetime * 100) / 100,
        avgCommands: Math.round(r.avg_commands),
      }));
    } catch (error) {
      logger.error(
        "RetentionTracker",
        "Failed to get top churn reasons:",
        error
      );
      return [];
    }
  }
}

module.exports = new RetentionTracker();
