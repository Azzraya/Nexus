const db = require("./database");
const fs = require("fs");
const path = require("path");
const logger = require("./logger");

class DataPrivacy {
  /**
   * Export all data for a server
   * @param {string} guildId - Server ID
   * @returns {Promise<Object>} Exported data
   */
  static async exportServerData(guildId) {
    try {
      const data = {
        exportDate: new Date().toISOString(),
        guildId: guildId,
        serverConfig: null,
        moderationLogs: [],
        warnings: [],
        automodRules: [],
        heatScores: [],
        analytics: [],
        tickets: [],
        reactionRoles: [],
        antiRaidLogs: [],
        userStats: [],
        levels: [],
        customCommands: [],
        giveaways: [],
        autoRoles: [],
        backups: [],
        slowmodeChannels: [],
        roleManagement: [],
        securityWhitelist: [],
        securityLogs: [],
        attackPatterns: [],
        joinGateConfig: null,
        notes: [],
        quarantine: [],
        lockedChannels: [],
        lockedRoles: [],
        workflows: [],
        enhancedLogs: [],
        aiLearning: [],
        apiKeys: [],
        scheduledActions: [],
        recommendations: [],
        notifications: [],
        behavioralData: [],
        threatSensitivity: null,
        recoverySnapshots: [],
      };

      // Server config
      data.serverConfig = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM server_config WHERE guild_id = ?",
          [guildId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });

      // All tables that need fetching
      const tables = [
        { key: "moderationLogs", table: "moderation_logs" },
        { key: "warnings", table: "warnings" },
        { key: "automodRules", table: "automod_rules" },
        { key: "heatScores", table: "heat_scores" },
        { key: "analytics", table: "analytics" },
        { key: "tickets", table: "tickets" },
        { key: "reactionRoles", table: "reaction_roles" },
        { key: "antiRaidLogs", table: "anti_raid_logs" },
        { key: "userStats", table: "user_stats" },
        { key: "levels", table: "levels" },
        { key: "customCommands", table: "custom_commands" },
        { key: "giveaways", table: "giveaways" },
        { key: "autoRoles", table: "auto_roles" },
        { key: "backups", table: "backups" },
        { key: "slowmodeChannels", table: "slowmode_channels" },
        { key: "roleManagement", table: "role_management" },
        { key: "securityWhitelist", table: "security_whitelist" },
        { key: "securityLogs", table: "security_logs" },
        { key: "attackPatterns", table: "attack_patterns" },
        { key: "notes", table: "notes" },
        { key: "quarantine", table: "quarantine" },
        { key: "lockedChannels", table: "locked_channels" },
        { key: "lockedRoles", table: "locked_roles" },
        { key: "workflows", table: "workflows" },
        { key: "enhancedLogs", table: "enhanced_logs" },
        { key: "aiLearning", table: "ai_learning" },
        { key: "apiKeys", table: "api_keys" },
        { key: "scheduledActions", table: "scheduled_actions" },
        { key: "recommendations", table: "recommendations" },
        { key: "notifications", table: "notifications" },
        { key: "behavioralData", table: "behavioral_data" },
        { key: "recoverySnapshots", table: "recovery_snapshots" },
      ];

      // Fetch all data
      for (const { key, table } of tables) {
        try {
          const rows = await new Promise((resolve, reject) => {
            db.db.all(
              `SELECT * FROM ${table} WHERE guild_id = ?`,
              [guildId],
              (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
              }
            );
          });
          data[key] = rows;
        } catch (error) {
          logger.error(`Error fetching ${table} for export:`, error);
          data[key] = [];
        }
      }

      // Single row tables
      try {
        data.joinGateConfig = await new Promise((resolve, reject) => {
          db.db.get(
            "SELECT * FROM join_gate_config WHERE guild_id = ?",
            [guildId],
            (err, row) => {
              if (err) reject(err);
              else resolve(row || null);
            }
          );
        });

        data.threatSensitivity = await new Promise((resolve, reject) => {
          db.db.get(
            "SELECT * FROM threat_sensitivity WHERE guild_id = ?",
            [guildId],
            (err, row) => {
              if (err) reject(err);
              else resolve(row || null);
            }
          );
        });
      } catch (error) {
        logger.error("Error fetching single-row configs:", error);
      }

      return data;
    } catch (error) {
      logger.error("Error exporting server data:", error);
      throw error;
    }
  }

  /**
   * Export all data for a specific user across all servers
   * @param {string} userId - User ID
   * @param {string} guildId - Optional: specific server ID
   * @returns {Promise<Object>} Exported user data
   */
  static async exportUserData(userId, guildId = null) {
    try {
      const data = {
        exportDate: new Date().toISOString(),
        userId: userId,
        guildId: guildId || "all_servers",
        moderationLogs: [],
        warnings: [],
        heatScores: [],
        userStats: [],
        levels: [],
        tickets: [],
        notes: [],
        quarantine: [],
        enhancedLogs: [],
        aiLearning: [],
        scheduledActions: [],
        behavioralData: [],
        threatIntelligence: [],
      };

      const whereClause = guildId
        ? "WHERE user_id = ? AND guild_id = ?"
        : "WHERE user_id = ?";
      const params = guildId ? [userId, guildId] : [userId];

      // Tables with user data
      const userTables = [
        { key: "moderationLogs", table: "moderation_logs" },
        { key: "warnings", table: "warnings" },
        { key: "heatScores", table: "heat_scores" },
        { key: "userStats", table: "user_stats" },
        { key: "levels", table: "levels" },
        { key: "tickets", table: "tickets" },
        { key: "notes", table: "notes" },
        { key: "quarantine", table: "quarantine" },
        { key: "enhancedLogs", table: "enhanced_logs" },
        { key: "aiLearning", table: "ai_learning" },
        { key: "scheduledActions", table: "scheduled_actions" },
        { key: "behavioralData", table: "behavioral_data" },
      ];

      for (const { key, table } of userTables) {
        try {
          const rows = await new Promise((resolve, reject) => {
            db.db.all(
              `SELECT * FROM ${table} ${whereClause}`,
              params,
              (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
              }
            );
          });
          data[key] = rows;
        } catch (error) {
          logger.error(`Error fetching ${table} for user export:`, error);
          data[key] = [];
        }
      }

      // Threat intelligence (no guild filter for this)
      try {
        const threats = await new Promise((resolve, reject) => {
          db.db.all(
            "SELECT * FROM threat_intelligence WHERE user_id = ?",
            [userId],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        });
        data.threatIntelligence = threats;
      } catch (error) {
        logger.error("Error fetching threat intelligence:", error);
        data.threatIntelligence = [];
      }

      return data;
    } catch (error) {
      logger.error("Error exporting user data:", error);
      throw error;
    }
  }

  /**
   * Delete all data for a server
   * @param {string} guildId - Server ID
   * @returns {Promise<Object>} Deletion summary
   */
  static async deleteServerData(guildId) {
    try {
      const summary = {
        guildId: guildId,
        deletedAt: new Date().toISOString(),
        tablesDeleted: [],
        errors: [],
      };

      const tables = [
        "server_config",
        "moderation_logs",
        "warnings",
        "automod_rules",
        "heat_scores",
        "analytics",
        "tickets",
        "reaction_roles",
        "anti_raid_logs",
        "user_stats",
        "levels",
        "custom_commands",
        "giveaways",
        "auto_roles",
        "backups",
        "slowmode_channels",
        "role_management",
        "security_whitelist",
        "security_logs",
        "attack_patterns",
        "join_gate_config",
        "rescue_keys",
        "rescue_key_logs",
        "notes",
        "quarantine",
        "locked_channels",
        "locked_roles",
        "workflows",
        "enhanced_logs",
        "ai_learning",
        "api_keys",
        "scheduled_actions",
        "recommendations",
        "notifications",
        "behavioral_data",
        "threat_sensitivity",
        "recovery_snapshots",
      ];

      for (const table of tables) {
        try {
          await new Promise((resolve, reject) => {
            db.db.run(
              `DELETE FROM ${table} WHERE guild_id = ?`,
              [guildId],
              function (err) {
                if (err) reject(err);
                else {
                  summary.tablesDeleted.push({
                    table,
                    rowsDeleted: this.changes,
                  });
                  resolve();
                }
              }
            );
          });
        } catch (error) {
          logger.error(`Error deleting from ${table}:`, error);
          summary.errors.push({ table, error: error.message });
        }
      }

      return summary;
    } catch (error) {
      logger.error("Error deleting server data:", error);
      throw error;
    }
  }

  /**
   * Delete all data for a user
   * @param {string} userId - User ID
   * @param {string} guildId - Optional: specific server ID
   * @returns {Promise<Object>} Deletion summary
   */
  static async deleteUserData(userId, guildId = null) {
    try {
      const summary = {
        userId: userId,
        guildId: guildId || "all_servers",
        deletedAt: new Date().toISOString(),
        tablesDeleted: [],
        errors: [],
      };

      const userTables = [
        { table: "moderation_logs", where: "user_id = ?" },
        { table: "warnings", where: "user_id = ?" },
        { table: "heat_scores", where: "user_id = ?" },
        { table: "user_stats", where: "user_id = ?" },
        { table: "levels", where: "user_id = ?" },
        { table: "tickets", where: "user_id = ?" },
        { table: "notes", where: "user_id = ?" },
        { table: "quarantine", where: "user_id = ?" },
        { table: "enhanced_logs", where: "user_id = ?" },
        { table: "ai_learning", where: "user_id = ?" },
        { table: "scheduled_actions", where: "user_id = ?" },
        { table: "behavioral_data", where: "user_id = ?" },
      ];

      for (const { table, where } of userTables) {
        try {
          const whereClause = guildId ? `${where} AND guild_id = ?` : where;
          const params = guildId ? [userId, guildId] : [userId];

          await new Promise((resolve, reject) => {
            db.db.run(
              `DELETE FROM ${table} WHERE ${whereClause}`,
              params,
              function (err) {
                if (err) reject(err);
                else {
                  summary.tablesDeleted.push({
                    table,
                    rowsDeleted: this.changes,
                  });
                  resolve();
                }
              }
            );
          });
        } catch (error) {
          logger.error(`Error deleting from ${table}:`, error);
          summary.errors.push({ table, error: error.message });
        }
      }

      // Delete threat intelligence (no guild filter)
      try {
        await new Promise((resolve, reject) => {
          db.db.run(
            "DELETE FROM threat_intelligence WHERE user_id = ?",
            [userId],
            function (err) {
              if (err) reject(err);
              else {
                summary.tablesDeleted.push({
                  table: "threat_intelligence",
                  rowsDeleted: this.changes,
                });
                resolve();
              }
            }
          );
        });
      } catch (error) {
        logger.error("Error deleting threat intelligence:", error);
        summary.errors.push({
          table: "threat_intelligence",
          error: error.message,
        });
      }

      return summary;
    } catch (error) {
      logger.error("Error deleting user data:", error);
      throw error;
    }
  }

  /**
   * Create a JSON file from exported data
   * @param {Object} data - Exported data
   * @param {string} filename - Output filename
   * @returns {Promise<string>} File path
   */
  static async createExportFile(data, filename) {
    const exportsDir = path.join(__dirname, "..", "data", "exports");
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    const filePath = path.join(exportsDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    return filePath;
  }
}

module.exports = DataPrivacy;
