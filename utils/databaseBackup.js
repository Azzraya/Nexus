const fs = require("fs");
const path = require("path");
const logger = require("./logger");

class DatabaseBackup {
  constructor() {
    this.backupDir = path.join(__dirname, "../backups/database");
    this.dbPath = path.join(__dirname, "../data/nexus.db");
    this.maxBackups = 7; // Keep last 7 days

    // Create backup directory if it doesn't exist
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      logger.info("DatabaseBackup", "Created database backup directory");
    }
  }

  /**
   * Create a backup of the database
   */
  async createBackup() {
    try {
      // Check if database file exists
      if (!fs.existsSync(this.dbPath)) {
        logger.warn(
          "DatabaseBackup",
          "Database file not found, skipping backup"
        );
        return false;
      }

      // Generate backup filename with timestamp
      const timestamp = Date.now();
      const dateStr = new Date(timestamp).toISOString().split("T")[0];
      const backupFilename = `database_${dateStr}_${timestamp}.db`;
      const backupPath = path.join(this.backupDir, backupFilename);

      // Copy database file to backup
      fs.copyFileSync(this.dbPath, backupPath);

      // Get file size
      const stats = fs.statSync(backupPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      logger.info(
        "DatabaseBackup",
        `Created database backup: ${backupFilename} (${fileSizeMB} MB)`
      );

      // Clean up old backups
      await this.cleanOldBackups();

      return true;
    } catch (error) {
      logger.error("DatabaseBackup", "Failed to create backup", {
        message: error?.message || String(error),
        stack: error?.stack,
      });
      return false;
    }
  }

  /**
   * Clean up old backups, keeping only the last N backups
   */
  async cleanOldBackups() {
    try {
      // Get all backup files
      const files = fs
        .readdirSync(this.backupDir)
        .filter((file) => file.startsWith("database_") && file.endsWith(".db"))
        .map((file) => ({
          name: file,
          path: path.join(this.backupDir, file),
          time: fs.statSync(path.join(this.backupDir, file)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time); // Sort by time, newest first

      // Delete old backups
      if (files.length > this.maxBackups) {
        const toDelete = files.slice(this.maxBackups);
        for (const file of toDelete) {
          fs.unlinkSync(file.path);
          logger.info("DatabaseBackup", `Deleted old backup: ${file.name}`);
        }
      }
    } catch (error) {
      logger.error("DatabaseBackup", "Failed to clean old backups", {
        message: error?.message || String(error),
      });
    }
  }

  /**
   * List all available backups
   */
  listBackups() {
    try {
      const files = fs
        .readdirSync(this.backupDir)
        .filter((file) => file.startsWith("database_") && file.endsWith(".db"))
        .map((file) => {
          const filePath = path.join(this.backupDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            path: filePath,
            size: stats.size,
            created: stats.mtime,
          };
        })
        .sort((a, b) => b.created - a.created);

      return files;
    } catch (error) {
      logger.error("DatabaseBackup", "Failed to list backups", {
        message: error?.message || String(error),
      });
      return [];
    }
  }

  /**
   * Restore database from a backup
   */
  async restoreBackup(backupFilename) {
    try {
      const backupPath = path.join(this.backupDir, backupFilename);

      if (!fs.existsSync(backupPath)) {
        logger.error(
          "DatabaseBackup",
          `Backup file not found: ${backupFilename}`
        );
        return false;
      }

      // Create a backup of current database before restoring
      const currentBackup = `database_before_restore_${Date.now()}.db`;
      fs.copyFileSync(this.dbPath, path.join(this.backupDir, currentBackup));
      logger.info("DatabaseBackup", `Created safety backup: ${currentBackup}`);

      // Restore backup
      fs.copyFileSync(backupPath, this.dbPath);
      logger.info(
        "DatabaseBackup",
        `Restored database from backup: ${backupFilename}`
      );

      return true;
    } catch (error) {
      logger.error("DatabaseBackup", "Failed to restore backup", {
        message: error?.message || String(error),
        stack: error?.stack,
      });
      return false;
    }
  }

  /**
   * Start automatic backup schedule (daily at 3 AM)
   */
  startSchedule() {
    // Create initial backup on startup
    this.createBackup();

    // Schedule daily backups at 3 AM
    const scheduleNextBackup = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(3, 0, 0, 0); // 3 AM

      // If 3 AM already passed today, schedule for tomorrow
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }

      const timeUntilBackup = next - now;

      setTimeout(() => {
        this.createBackup();
        scheduleNextBackup(); // Schedule next backup
      }, timeUntilBackup);

      logger.info(
        "DatabaseBackup",
        `Next automatic backup scheduled for ${next.toLocaleString()}`
      );
    };

    scheduleNextBackup();
  }
}

module.exports = new DatabaseBackup();
