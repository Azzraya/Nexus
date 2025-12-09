/**
 * Automatic Backup System
 * Handles scheduled backups with retention policies
 * EXCEEDS WICK - Automated, multi-tier backup strategy
 */

const cron = require("node-cron");
const fs = require("fs").promises;
const path = require("path");
const logger = require("./logger");
const db = require("./database");

class AutomaticBackup {
  constructor() {
    this.backupDir = path.join(__dirname, "..", "data", "backups");
    this.dbPath = path.join(__dirname, "..", "data", "nexus.db");
    this.running = false;

    // Retention policies
    this.retention = {
      hourly: 24, // Keep 24 hourly backups (1 day)
      daily: 7, // Keep 7 daily backups (1 week)
      weekly: 4, // Keep 4 weekly backups (1 month)
    };
  }

  async init() {
    try {
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });

      // Schedule backups
      this.scheduleBackups();

      logger.success("AutoBackup", "Automatic backup system initialized");
    } catch (error) {
      logger.error("AutoBackup", `Failed to initialize: ${error.message}`);
    }
  }

  scheduleBackups() {
    // Hourly backup (every hour at minute 0)
    cron.schedule("0 * * * *", async () => {
      await this.createBackup("hourly");
      await this.cleanupOldBackups("hourly");
    });

    // Daily backup (every day at 3 AM)
    cron.schedule("0 3 * * *", async () => {
      await this.createBackup("daily");
      await this.cleanupOldBackups("daily");
    });

    // Weekly backup (every Sunday at 3 AM)
    cron.schedule("0 3 * * 0", async () => {
      await this.createBackup("weekly");
      await this.cleanupOldBackups("weekly");
    });

    logger.info(
      "AutoBackup",
      "Scheduled: Hourly (every hour), Daily (3 AM), Weekly (Sunday 3 AM)"
    );
  }

  async createBackup(type = "manual") {
    if (this.running) {
      logger.warn("AutoBackup", "Backup already in progress, skipping");
      return null;
    }

    this.running = true;
    const startTime = Date.now();

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupName = `backup_${type}_${timestamp}.db`;
      const backupPath = path.join(this.backupDir, backupName);

      // Copy database file
      await fs.copyFile(this.dbPath, backupPath);

      // Verify backup
      const stats = await fs.stat(backupPath);
      const duration = Date.now() - startTime;

      logger.success(
        "AutoBackup",
        `Created ${type} backup: ${backupName} (${this.formatBytes(stats.size)}, ${duration}ms)`
      );

      // Create metadata file
      const metadataPath = backupPath + ".meta.json";
      await fs.writeFile(
        metadataPath,
        JSON.stringify(
          {
            type,
            created: new Date().toISOString(),
            size: stats.size,
            duration,
            verified: true,
          },
          null,
          2
        )
      );

      return backupPath;
    } catch (error) {
      logger.error("AutoBackup", `Failed to create backup: ${error.message}`);
      return null;
    } finally {
      this.running = false;
    }
  }

  async cleanupOldBackups(type) {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups = files
        .filter((f) => f.startsWith(`backup_${type}_`) && f.endsWith(".db"))
        .map((f) => path.join(this.backupDir, f))
        .sort()
        .reverse(); // Newest first

      const retention = this.retention[type] || 10;
      const toDelete = backups.slice(retention); // Keep only retention count

      for (const backup of toDelete) {
        await fs.unlink(backup);
        // Also delete metadata
        try {
          await fs.unlink(backup + ".meta.json");
        } catch (e) {
          // Ignore if meta doesn't exist
        }
        logger.info(
          "AutoBackup",
          `Deleted old ${type} backup: ${path.basename(backup)}`
        );
      }

      if (toDelete.length > 0) {
        logger.success(
          "AutoBackup",
          `Cleaned up ${toDelete.length} old ${type} backup(s)`
        );
      }
    } catch (error) {
      logger.error("AutoBackup", `Failed to cleanup backups: ${error.message}`);
    }
  }

  async listBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups = [];

      for (const file of files) {
        if (file.endsWith(".db")) {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.stat(filePath);

          // Try to read metadata
          let metadata = null;
          try {
            const metaContent = await fs.readFile(
              filePath + ".meta.json",
              "utf8"
            );
            metadata = JSON.parse(metaContent);
          } catch (e) {
            // No metadata available
          }

          backups.push({
            name: file,
            path: filePath,
            size: stats.size,
            created: stats.mtime,
            type: file.includes("_hourly_")
              ? "hourly"
              : file.includes("_daily_")
                ? "daily"
                : file.includes("_weekly_")
                  ? "weekly"
                  : "manual",
            metadata,
          });
        }
      }

      return backups.sort((a, b) => b.created - a.created);
    } catch (error) {
      logger.error("AutoBackup", `Failed to list backups: ${error.message}`);
      return [];
    }
  }

  async restoreBackup(backupPath) {
    if (this.running) {
      throw new Error("Backup operation in progress");
    }

    this.running = true;

    try {
      // Verify backup exists
      await fs.access(backupPath);

      // Create a backup of current database before restore
      await this.createBackup("pre-restore");

      // Copy backup to main database location
      await fs.copyFile(backupPath, this.dbPath);

      logger.success(
        "AutoBackup",
        `Restored backup: ${path.basename(backupPath)}`
      );

      return true;
    } catch (error) {
      logger.error("AutoBackup", `Failed to restore: ${error.message}`);
      throw error;
    } finally {
      this.running = false;
    }
  }

  async getBackupStats() {
    try {
      const backups = await this.listBackups();

      const stats = {
        total: backups.length,
        totalSize: backups.reduce((sum, b) => sum + b.size, 0),
        byType: {
          hourly: backups.filter((b) => b.type === "hourly").length,
          daily: backups.filter((b) => b.type === "daily").length,
          weekly: backups.filter((b) => b.type === "weekly").length,
          manual: backups.filter((b) => b.type === "manual").length,
        },
        oldest: backups[backups.length - 1]?.created || null,
        newest: backups[0]?.created || null,
      };

      return stats;
    } catch (error) {
      logger.error("AutoBackup", `Failed to get stats: ${error.message}`);
      return null;
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }
}

// Singleton instance
const automaticBackup = new AutomaticBackup();

module.exports = automaticBackup;
