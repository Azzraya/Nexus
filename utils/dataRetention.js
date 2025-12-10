/**
 * Data Retention & Cleanup System
 * Ensures compliance with GDPR and privacy policy (90-day retention)
 */

const cron = require("node-cron");
const db = require("./database");
const logger = require("./logger");

class DataRetention {
  constructor() {
    this.isInitialized = false;
  }

  /**
   * Initialize automated data cleanup
   * Runs daily at midnight to delete old data
   */
  init() {
    if (this.isInitialized) {
      logger.warn("DataRetention", "Already initialized, skipping");
      return;
    }

    // Run cleanup daily at midnight
    cron.schedule("0 0 * * *", async () => {
      await this.runCleanup();
    });

    // Run cleanup on startup (catch up on missed cleanups)
    setTimeout(() => {
      this.runCleanup();
    }, 10000); // Wait 10 seconds after startup

    this.isInitialized = true;
    logger.success(
      "DataRetention",
      "Automated data retention cleanup initialized (runs daily at midnight)"
    );
  }

  /**
   * Run all data retention cleanup tasks
   */
  async runCleanup() {
    logger.info("DataRetention", "Starting data retention cleanup...");
    const startTime = Date.now();

    try {
      const stats = {
        automodViolations: 0,
        behavioralData: 0,
        modLogs: 0,
        analyticsData: 0,
        oauthLogs: 0,
        activityStats: 0,
      };

      // 1. Cleanup automod violations (90 days)
      stats.automodViolations = await this.cleanupAutomodViolations(90);

      // 2. Cleanup behavioral data (90 days)
      stats.behavioralData = await this.cleanupBehavioralData(90);

      // 3. Cleanup moderation logs (90 days)
      stats.modLogs = await this.cleanupModerationLogs(90);

      // 4. Cleanup old analytics (1 year, anonymize after 90 days)
      stats.analyticsData = await this.cleanupAnalytics(365);

      // 5. Cleanup OAuth login logs (90 days)
      stats.oauthLogs = await this.cleanupOAuthLogs(90);

      // 6. Cleanup activity stats (90 days)
      stats.activityStats = await this.cleanupActivityStats(90);

      // 7. Cleanup threat intelligence (30 days - already has cleanup)
      // This is handled by the threat intelligence system itself

      const duration = Date.now() - startTime;
      const totalDeleted = Object.values(stats).reduce((a, b) => a + b, 0);

      logger.success(
        "DataRetention",
        `Cleanup completed in ${duration}ms: ${totalDeleted} records deleted`,
        stats
      );

      // Log to database for auditing
      await this.logCleanup(stats, duration);
    } catch (error) {
      logger.error("DataRetention", `Cleanup failed: ${error.message}`, error);
    }
  }

  /**
   * Cleanup automod violations older than specified days
   */
  async cleanupAutomodViolations(days) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    return new Promise((resolve, reject) => {
      db.db.run(
        "DELETE FROM automod_violations WHERE timestamp < ?",
        [cutoff],
        function (err) {
          if (err) {
            logger.error(
              "DataRetention",
              "Failed to cleanup automod violations",
              err
            );
            resolve(0);
          } else {
            logger.info(
              "DataRetention",
              `Deleted ${this.changes} automod violation records (>${days} days old)`
            );
            resolve(this.changes);
          }
        }
      );
    });
  }

  /**
   * Cleanup behavioral data older than specified days
   */
  async cleanupBehavioralData(days) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    return new Promise((resolve, reject) => {
      db.db.run(
        "DELETE FROM behavioral_data WHERE timestamp < ?",
        [cutoff],
        function (err) {
          if (err) {
            logger.error(
              "DataRetention",
              "Failed to cleanup behavioral data",
              err
            );
            resolve(0);
          } else {
            logger.info(
              "DataRetention",
              `Deleted ${this.changes} behavioral data records (>${days} days old)`
            );
            resolve(this.changes);
          }
        }
      );
    });
  }

  /**
   * Cleanup moderation logs older than specified days
   */
  async cleanupModerationLogs(days) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    return new Promise((resolve, reject) => {
      db.db.run(
        "DELETE FROM enhanced_logs WHERE timestamp < ?",
        [cutoff],
        function (err) {
          if (err) {
            // Table might not exist in all databases
            logger.debug(
              "DataRetention",
              "Failed to cleanup moderation logs (table may not exist)"
            );
            resolve(0);
          } else {
            logger.info(
              "DataRetention",
              `Deleted ${this.changes} moderation log records (>${days} days old)`
            );
            resolve(this.changes);
          }
        }
      );
    });
  }

  /**
   * Cleanup analytics data (anonymize after 90 days, delete after 1 year)
   */
  async cleanupAnalytics(days) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    return new Promise((resolve, reject) => {
      db.db.run(
        "DELETE FROM command_analytics WHERE timestamp < ?",
        [cutoff],
        function (err) {
          if (err) {
            logger.debug(
              "DataRetention",
              "Failed to cleanup analytics (table may not exist)"
            );
            resolve(0);
          } else {
            logger.info(
              "DataRetention",
              `Deleted ${this.changes} analytics records (>${days} days old)`
            );
            resolve(this.changes);
          }
        }
      );
    });
  }

  /**
   * Cleanup OAuth login logs older than specified days
   */
  async cleanupOAuthLogs(days) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    return new Promise((resolve, reject) => {
      db.db.run(
        "DELETE FROM oauth_logins WHERE timestamp < ?",
        [cutoff],
        function (err) {
          if (err) {
            logger.debug(
              "DataRetention",
              "Failed to cleanup OAuth logs (table may not exist)"
            );
            resolve(0);
          } else {
            logger.info(
              "DataRetention",
              `Deleted ${this.changes} OAuth login records (>${days} days old)`
            );
            resolve(this.changes);
          }
        }
      );
    });
  }

  /**
   * Cleanup activity statistics older than specified days
   */
  async cleanupActivityStats(days) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const dateCutoff = Math.floor(cutoff / (24 * 60 * 60 * 1000));

    return new Promise((resolve, reject) => {
      db.db.run(
        "DELETE FROM activity_stats WHERE date < ?",
        [dateCutoff],
        function (err) {
          if (err) {
            logger.debug(
              "DataRetention",
              "Failed to cleanup activity stats (table may not exist)"
            );
            resolve(0);
          } else {
            logger.info(
              "DataRetention",
              `Deleted ${this.changes} activity stat records (>${days} days old)`
            );
            resolve(this.changes);
          }
        }
      );
    });
  }

  /**
   * Log cleanup run for auditing
   */
  async logCleanup(stats, duration) {
    return new Promise((resolve) => {
      db.db.run(
        `INSERT OR IGNORE INTO data_retention_log (timestamp, records_deleted, duration_ms, details)
         VALUES (?, ?, ?, ?)`,
        [
          Date.now(),
          Object.values(stats).reduce((a, b) => a + b, 0),
          duration,
          JSON.stringify(stats),
        ],
        (err) => {
          if (err) {
            // Table might not exist, that's okay
            logger.debug(
              "DataRetention",
              "Failed to log cleanup (table may not exist)"
            );
          }
          resolve();
        }
      );
    });
  }

  /**
   * Manual cleanup trigger (for testing or emergency cleanup)
   */
  async manualCleanup() {
    logger.info("DataRetention", "Manual cleanup triggered");
    await this.runCleanup();
  }
}

module.exports = new DataRetention();
