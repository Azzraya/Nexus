const db = require("./database");
const AutoRecovery = require("./autoRecovery");
const logger = require("./logger");

class AutoBackup {
  constructor(client) {
    this.client = client;
    this.backupIntervals = new Map(); // Track backup intervals per guild
    this.start();
  }

  start() {
    // Run backup check every hour
    setInterval(() => {
      this.checkAndBackup();
    }, 3600000); // 1 hour

    // Also run on startup
    setTimeout(() => {
      this.checkAndBackup();
    }, 60000); // Wait 1 minute after startup
  }

  async checkAndBackup() {
    try {
      const guilds = Array.from(this.client.guilds.cache.values());

      // Process guilds in parallel batches (max 5 at a time) for better performance 
      const batchSize = 5;
      for (let i = 0; i < guilds.length; i += batchSize) {
        const batch = guilds.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (guild) => {
            try {
              await this.checkGuildBackup(guild);
            } catch (error) {
              logger.error(
                `[AutoBackup] Error checking backup for ${guild.id}:`,
                error
              );
            }
          })
        );
      }
    } catch (error) {
      logger.error("[AutoBackup] Error in backup check:", error);
    }
  }

  async checkGuildBackup(guild) {
    try {
      // Get server config
      const config = await db.getServerConfig(guild.id);

      // Check if auto-backup is enabled (default: true)
      if (config && config.auto_backup_enabled === 0) {
        return; // Auto-backup disabled
      }

      // Get last snapshot
      const snapshots = await db.getRecoverySnapshots(guild.id, 1);
      const lastSnapshot = snapshots[0];

      if (!lastSnapshot) {
        // No snapshot exists, create one
        logger.info(
          "AutoBackup",
          `Creating initial snapshot for ${guild.name}`
        );
        await AutoRecovery.createSnapshot(
          guild,
          "full",
          "Automatic backup - initial snapshot"
        );
        return;
      }

      // Check if last snapshot is older than 24 hours
      const lastSnapshotAge = Date.now() - lastSnapshot.created_at;
      const backupInterval = 24 * 60 * 60 * 1000; // 24 hours

      if (lastSnapshotAge >= backupInterval) {
        logger.info(
          `[AutoBackup] Creating scheduled backup for ${
            guild.name
          } (last backup: ${Math.round(lastSnapshotAge / 3600000)} hours ago)`
        );

        await AutoRecovery.createSnapshot(
          guild,
          "full",
          "Automatic scheduled backup"
        );

        // Log backup creation
        logger.info(
          `[AutoBackup] ✅ Backup created for ${guild.name} (${guild.id})`
        );
      }
    } catch (error) {
      logger.error(
        `[AutoBackup] Error creating backup for ${guild.id}:`,
        error
      );
    }
  }

  // Force backup for a specific guild
  async forceBackup(guild, reason = "Manual backup") {
    try {
      await AutoRecovery.createSnapshot(guild, "full", reason);
      logger.info("AutoBackup", `✅ Forced backup created for ${guild.name}`);
      return true;
    } catch (error) {
      logger.error(`[AutoBackup] Error forcing backup:`, error);
      return false;
    }
  }
}

module.exports = AutoBackup;
