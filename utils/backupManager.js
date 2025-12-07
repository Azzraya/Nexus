// Server Configuration Backup & Restore System
// Save and restore server configs to protect against nukes

const fs = require("fs").promises;
const path = require("path");
const db = require("./database");

class BackupManager {
  constructor() {
    this.backupDir = path.join(__dirname, "../backups");
    this.ensureBackupDir();
  }

  async ensureBackupDir() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      console.error(
        "[Backup Manager] Failed to create backup directory:",
        error
      );
    }
  }

  /**
   * Validate and sanitize backup ID to prevent path traversal attacks
   * @param {string} backupId - Backup ID to validate
   * @returns {string|null} - Sanitized backup ID or null if invalid
   */
  validateBackupId(backupId) {
    if (!backupId || typeof backupId !== "string") {
      return null;
    }

    // Remove any path traversal attempts and dangerous characters
    const sanitized = backupId
      .replace(/\.\./g, "") // Remove ..
      .replace(/[\/\\]/g, "") // Remove slashes
      .replace(/[^a-zA-Z0-9_-]/g, ""); // Only allow alphanumeric, underscore, hyphen

    // Backup IDs should be in format: guildId_timestamp (e.g., 123456789_1234567890)
    // Allow alphanumeric, underscore, hyphen only
    if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
      return null;
    }

    // Maximum reasonable length (guild ID is ~19 chars, timestamp is ~13, plus underscore = 33)
    if (sanitized.length > 50) {
      return null;
    }

    return sanitized;
  }

  /**
   * Get safe file path for backup, ensuring it stays within backup directory
   * @param {string} backupId - Backup ID
   * @returns {string|null} - Safe file path or null if invalid
   */
  getBackupFilePath(backupId) {
    const validated = this.validateBackupId(backupId);
    if (!validated) {
      return null;
    }

    const filename = `${validated}.json`;
    const filepath = path.join(this.backupDir, filename);

    // Resolve to absolute path and verify it's within backup directory
    const resolved = path.resolve(filepath);
    const resolvedBackupDir = path.resolve(this.backupDir);

    // Ensure the resolved path starts with the backup directory (prevents traversal)
    if (!resolved.startsWith(resolvedBackupDir)) {
      console.error(
        `[Backup Manager] Path traversal detected! Backup ID: ${backupId}, Resolved: ${resolved}`
      );
      return null;
    }

    return filepath;
  }

  /**
   * Create a complete backup of server configuration
   * @param {Guild} guild - Discord guild object
   * @returns {Promise<Object>} Backup data and metadata
   */
  async createBackup(guild) {
    try {
      const timestamp = Date.now();
      const backupId = `${guild.id}_${timestamp}`;

      // Gather all config data
      const config = await db.getServerConfig(guild.id);

      // Get role configurations
      const roles = [];
      for (const [roleId, role] of guild.roles.cache) {
        if (roleId !== guild.id) {
          // Skip @everyone
          roles.push({
            id: roleId,
            name: role.name,
            color: role.hexColor,
            position: role.position,
            permissions: role.permissions.bitfield.toString(),
            hoist: role.hoist,
            mentionable: role.mentionable,
          });
        }
      }

      // Get channel configurations
      const channels = [];
      for (const [channelId, channel] of guild.channels.cache) {
        channels.push({
          id: channelId,
          name: channel.name,
          type: channel.type,
          position: channel.position,
          parentId: channel.parentId,
          topic: channel.topic || null,
          nsfw: channel.nsfw || false,
          rateLimitPerUser: channel.rateLimitPerUser || 0,
        });
      }

      // Create backup data
      // Sanitize guild name to prevent XSS attacks
      const securityAuditor = require("./securityAuditor");
      const sanitizedName = securityAuditor.sanitizeInput(
        guild.name || "Unknown Server"
      );

      const backupData = {
        id: backupId,
        guildId: guild.id,
        guildName: sanitizedName,
        timestamp,
        version: "1.0",
        data: {
          config,
          roles,
          channels,
          guildSettings: {
            name: sanitizedName,
            verificationLevel: guild.verificationLevel,
            defaultMessageNotifications: guild.defaultMessageNotifications,
            explicitContentFilter: guild.explicitContentFilter,
            afkTimeout: guild.afkTimeout,
            afkChannelId: guild.afkChannelId,
          },
        },
      };

      // Save to file
      const filename = `${backupId}.json`;
      const filepath = path.join(this.backupDir, filename);
      await fs.writeFile(filepath, JSON.stringify(backupData, null, 2));

      // Save metadata to database
      await this.saveBackupMetadata(backupData);

      return {
        success: true,
        backupId,
        filename,
        size: JSON.stringify(backupData).length,
        timestamp,
        message: "Backup created successfully",
      };
    } catch (error) {
      console.error("[Backup Manager] Create backup error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Restore server configuration from backup
   * @param {Guild} guild - Discord guild object
   * @param {string} backupId - Backup ID to restore
   * @param {Object} options - Restore options
   * @returns {Promise<Object>} Restore result
   */
  async restoreBackup(guild, backupId, options = {}) {
    const {
      restoreConfig = true,
      restoreRoles = false,
      restoreChannels = false,
    } = options;

    try {
      // Load backup data
      const backupData = await this.loadBackup(backupId);

      if (!backupData) {
        return {
          success: false,
          error: "Backup not found",
        };
      }

      if (backupData.guildId !== guild.id) {
        return {
          success: false,
          error: "Backup is from a different server",
        };
      }

      const restored = {
        config: false,
        roles: 0,
        channels: 0,
      };

      // Restore bot configuration
      if (restoreConfig && backupData.data.config) {
        await this.restoreConfig(guild.id, backupData.data.config);
        restored.config = true;
      }

      // Restore roles (careful with this!)
      if (restoreRoles && backupData.data.roles) {
        restored.roles = await this.restoreRoles(guild, backupData.data.roles);
      }

      // Restore channels (careful with this!)
      if (restoreChannels && backupData.data.channels) {
        restored.channels = await this.restoreChannels(
          guild,
          backupData.data.channels
        );
      }

      return {
        success: true,
        restored,
        backupId,
        timestamp: backupData.timestamp,
        message: "Backup restored successfully",
      };
    } catch (error) {
      console.error("[Backup Manager] Restore backup error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Load backup data from file
   */
  async loadBackup(backupId) {
    try {
      const filepath = this.getBackupFilePath(backupId);
      if (!filepath) {
        console.error(
          `[Backup Manager] Invalid backup ID: ${backupId} (path traversal attempt?)`
        );
        return null;
      }

      const data = await fs.readFile(filepath, "utf8");
      const backup = JSON.parse(data);

      // Sanitize guild name in loaded backup to prevent XSS from old backups
      if (backup.guildName) {
        const securityAuditor = require("./securityAuditor");
        backup.guildName = securityAuditor.sanitizeInput(backup.guildName);
      }
      if (backup.data?.guildSettings?.name) {
        const securityAuditor = require("./securityAuditor");
        backup.data.guildSettings.name = securityAuditor.sanitizeInput(
          backup.data.guildSettings.name
        );
      }

      return backup;
    } catch (error) {
      // Don't log the full path in error to avoid leaking information
      if (error.code === "ENOENT") {
        console.error(`[Backup Manager] Backup not found: ${backupId}`);
      } else {
        console.error("[Backup Manager] Load backup error:", error.message);
      }
      return null;
    }
  }

  /**
   * Restore bot configuration
   */
  async restoreConfig(guildId, config) {
    try {
      // Update all config fields
      for (const [key, value] of Object.entries(config)) {
        if (key !== "guild_id") {
          await new Promise((resolve, reject) => {
            db.db.run(
              `UPDATE server_config SET ${key} = ? WHERE guild_id = ?`,
              [value, guildId],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
        }
      }
      return true;
    } catch (error) {
      console.error("[Backup Manager] Restore config error:", error);
      return false;
    }
  }

  /**
   * Restore roles (only creates missing roles, doesn't delete existing)
   */
  async restoreRoles(guild, backupRoles) {
    let restored = 0;

    try {
      for (const roleData of backupRoles) {
        // Check if role already exists by name
        const existing = guild.roles.cache.find(
          (r) => r.name === roleData.name
        );
        if (existing) continue;

        // Create the role
        try {
          await guild.roles.create({
            name: roleData.name,
            color: roleData.color,
            permissions: BigInt(roleData.permissions),
            hoist: roleData.hoist,
            mentionable: roleData.mentionable,
            reason: "Restored from backup",
          });
          restored++;
        } catch (err) {
          console.error(
            `[Backup Manager] Failed to restore role ${roleData.name}:`,
            err
          );
        }
      }
    } catch (error) {
      console.error("[Backup Manager] Restore roles error:", error);
    }

    return restored;
  }

  /**
   * Restore channels (only creates missing channels, doesn't delete existing)
   */
  async restoreChannels(guild, backupChannels) {
    let restored = 0;

    try {
      // Sort channels by position
      backupChannels.sort((a, b) => a.position - b.position);

      for (const channelData of backupChannels) {
        // Check if channel already exists by name
        const existing = guild.channels.cache.find(
          (c) => c.name === channelData.name
        );
        if (existing) continue;

        // Create the channel
        try {
          await guild.channels.create({
            name: channelData.name,
            type: channelData.type,
            parent: channelData.parentId,
            topic: channelData.topic,
            nsfw: channelData.nsfw,
            rateLimitPerUser: channelData.rateLimitPerUser,
            reason: "Restored from backup",
          });
          restored++;
        } catch (err) {
          console.error(
            `[Backup Manager] Failed to restore channel ${channelData.name}:`,
            err
          );
        }
      }
    } catch (error) {
      console.error("[Backup Manager] Restore channels error:", error);
    }

    return restored;
  }

  /**
   * Save backup metadata to database
   */
  async saveBackupMetadata(backupData) {
    try {
      await new Promise((resolve, reject) => {
        db.db.run(
          `INSERT INTO backups (backup_id, guild_id, guild_name, timestamp, size, version) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            backupData.id,
            backupData.guildId,
            backupData.guildName,
            backupData.timestamp,
            JSON.stringify(backupData).length,
            backupData.version,
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    } catch (error) {
      // Table might not exist yet
      console.error("[Backup Manager] Save metadata error:", error);
    }
  }

  /**
   * List all backups for a guild
   */
  async listBackups(guildId) {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups = [];

      for (const file of files) {
        if (file.startsWith(guildId) && file.endsWith(".json")) {
          const filepath = path.join(this.backupDir, file);
          const data = await fs.readFile(filepath, "utf8");
          const backup = JSON.parse(data);

          // Sanitize guild name to prevent XSS from old backups
          const securityAuditor = require("./securityAuditor");
          const sanitizedName = securityAuditor.sanitizeInput(
            backup.guildName || "Unknown Server"
          );

          backups.push({
            id: backup.id,
            timestamp: backup.timestamp,
            guildName: sanitizedName,
            size: JSON.stringify(backup).length,
          });
        }
      }

      // Sort by timestamp (newest first)
      backups.sort((a, b) => b.timestamp - a.timestamp);

      return backups;
    } catch (error) {
      console.error("[Backup Manager] List backups error:", error);
      return [];
    }
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId) {
    try {
      const filepath = this.getBackupFilePath(backupId);
      if (!filepath) {
        return {
          success: false,
          error: "Invalid backup ID (path traversal attempt blocked)",
        };
      }

      await fs.unlink(filepath);
      return { success: true };
    } catch (error) {
      if (error.code === "ENOENT") {
        console.error(`[Backup Manager] Backup not found: ${backupId}`);
        return { success: false, error: "Backup not found" };
      }
      console.error("[Backup Manager] Delete backup error:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create automatic scheduled backup
   */
  async scheduleAutoBackup(guild, interval = "daily") {
    // This would integrate with node-cron
    // For now, just create a backup
    return await this.createBackup(guild);
  }
}

// Create backups table
db.db.run(`
  CREATE TABLE IF NOT EXISTS backups (
    backup_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    guild_name TEXT,
    timestamp INTEGER NOT NULL,
    size INTEGER,
    version TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = new BackupManager();
