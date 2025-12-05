const AutoRecovery = require("./autoRecovery");
const logger = require("./logger");
const db = require("./database");

class SnapshotScheduler {
  constructor(client) {
    this.client = client;
    this.snapshotInterval = 60 * 60 * 1000; // 1 hour (EXCEEDS WICK - automatic snapshots)
    this.maxSnapshotsPerGuild = 24; // Keep 24 hours of snapshots (1 per hour)
    this.isRunning = false;
  }

  /**
   * Start automatic snapshot scheduling
   */
  start() {
    if (this.isRunning) {
      logger.warn("[Snapshot Scheduler] Already running");
      return;
    }

    this.isRunning = true;
    logger.info(
      "[Snapshot Scheduler] Starting automatic point-in-time snapshots (every hour)"
    );

    // Take initial snapshots after 5 minutes (give bot time to cache data)
    setTimeout(
      () => {
        this.takeAllSnapshots();
      },
      5 * 60 * 1000
    );

    // Schedule regular snapshots
    this.intervalId = setInterval(() => {
      this.takeAllSnapshots();
    }, this.snapshotInterval);

    // Cleanup old snapshots daily
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupOldSnapshots();
      },
      24 * 60 * 60 * 1000
    );
  }

  /**
   * Stop automatic snapshot scheduling
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    logger.info("[Snapshot Scheduler] Stopped");
  }

  /**
   * Take snapshots for all guilds
   */
  async takeAllSnapshots() {
    if (!this.client.guilds) {
      logger.warn("[Snapshot Scheduler] Client guilds not available");
      return;
    }

    logger.info(
      `[Snapshot Scheduler] Taking point-in-time snapshots for ${this.client.guilds.cache.size} guilds`
    );

    let successCount = 0;
    let failCount = 0;

    // Process guilds in parallel batches (5 at a time)
    const guilds = Array.from(this.client.guilds.cache.values());
    const guildBatches = [];

    for (let i = 0; i < guilds.length; i += 5) {
      guildBatches.push(guilds.slice(i, i + 5));
    }

    for (const batch of guildBatches) {
      await Promise.allSettled(
        batch.map(async (guild) => {
          try {
            // Check if guild has auto-recovery enabled
            const config = await db.getServerConfig(guild.id);
            if (config && config.auto_recovery_enabled !== 0) {
              await AutoRecovery.createSnapshot(
                guild,
                "full",
                "Scheduled point-in-time snapshot"
              );
              successCount++;
            }
          } catch (error) {
            logger.error(
              `[Snapshot Scheduler] Failed to snapshot ${guild.name}:`,
              error.message
            );
            failCount++;
          }
        })
      );
    }

    logger.info(
      `[Snapshot Scheduler] Completed snapshots: ${successCount} success, ${failCount} failed`
    );
  }

  /**
   * Clean up old snapshots (keep only recent ones)
   */
  async cleanupOldSnapshots() {
    logger.info("[Snapshot Scheduler] Cleaning up old snapshots");

    try {
      // Get all guilds
      const guilds = Array.from(this.client.guilds.cache.values());

      for (const guild of guilds) {
        // Get all snapshots for this guild
        const snapshots = await new Promise((resolve, reject) => {
          db.db.all(
            "SELECT id, created_at FROM recovery_snapshots WHERE guild_id = ? AND reason = ? ORDER BY created_at DESC",
            [guild.id, "Scheduled point-in-time snapshot"],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        });

        // Keep only the most recent snapshots
        if (snapshots.length > this.maxSnapshotsPerGuild) {
          const toDelete = snapshots.slice(this.maxSnapshotsPerGuild);
          const deleteIds = toDelete.map((s) => s.id);

          await new Promise((resolve, reject) => {
            const placeholders = deleteIds.map(() => "?").join(",");
            db.db.run(
              `DELETE FROM recovery_snapshots WHERE id IN (${placeholders})`,
              deleteIds,
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });

          logger.info(
            `[Snapshot Scheduler] Cleaned up ${toDelete.length} old snapshots for ${guild.name}`
          );
        }
      }

      logger.info("[Snapshot Scheduler] Cleanup completed");
    } catch (error) {
      logger.error("[Snapshot Scheduler] Error during cleanup:", error);
    }
  }

  /**
   * Get available snapshots for a guild
   */
  async getAvailableSnapshots(guildId, limit = 24) {
    const snapshots = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT id, created_at, reason FROM recovery_snapshots WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?",
        [guildId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    return snapshots;
  }

  /**
   * Restore to a specific snapshot (point-in-time restore)
   */
  async restoreToSnapshot(guild, snapshotId) {
    logger.info(
      `[Snapshot Scheduler] Restoring ${guild.name} to snapshot ${snapshotId}`
    );

    try {
      const result = await AutoRecovery.restoreFromSnapshot(guild, snapshotId);
      logger.info(
        `[Snapshot Scheduler] Successfully restored ${guild.name} to snapshot ${snapshotId}`
      );
      return result;
    } catch (error) {
      logger.error(
        `[Snapshot Scheduler] Failed to restore ${guild.name}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get snapshot statistics
   */
  async getStats() {
    const stats = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT COUNT(*) as total, COUNT(DISTINCT guild_id) as guilds FROM recovery_snapshots",
        [],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    const recentSnapshots = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT COUNT(*) as count FROM recovery_snapshots WHERE created_at > ?",
        [Date.now() - 24 * 60 * 60 * 1000],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    return {
      totalSnapshots: stats.total || 0,
      guildsWithSnapshots: stats.guilds || 0,
      recentSnapshots: recentSnapshots.count || 0,
    };
  }
}

module.exports = SnapshotScheduler;
