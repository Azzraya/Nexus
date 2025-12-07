// Custom Command Builder
// Let users create custom commands without coding

const db = require("./database");

class CustomCommands {
  constructor() {
    // Defer table creation to ensure database is ready
    setImmediate(() => {
      this.createTable();
    });
  }

  createTable() {
    if (!db.db) {
      // Database not ready yet, retry
      setTimeout(() => this.createTable(), 100);
      return;
    }
    db.db.run(`
      CREATE TABLE IF NOT EXISTS custom_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        command_name TEXT NOT NULL,
        description TEXT,
        response_type TEXT DEFAULT 'text',
        response_content TEXT,
        embed_title TEXT,
        embed_description TEXT,
        embed_color TEXT,
        embed_fields TEXT,
        requires_role TEXT,
        allowed_channels TEXT,
        cooldown INTEGER DEFAULT 0,
        uses INTEGER DEFAULT 0,
        created_by TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        UNIQUE(guild_id, command_name)
      )
    `);
  }

  /**
   * Create a custom command
   */
  async createCommand(guildId, commandData) {
    return new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO custom_commands 
        (guild_id, command_name, description, response_type, response_content, 
         embed_title, embed_description, embed_color, embed_fields, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          guildId,
          commandData.name.toLowerCase(),
          commandData.description,
          commandData.type || "text",
          commandData.content,
          commandData.embedTitle || null,
          commandData.embedDescription || null,
          commandData.embedColor || null,
          commandData.embedFields
            ? JSON.stringify(commandData.embedFields)
            : null,
          commandData.createdBy,
        ],
        function (err) {
          if (err) {
            if (err.message.includes("UNIQUE")) {
              reject(new Error("Command already exists"));
            } else {
              reject(err);
            }
          } else {
            resolve({ id: this.lastID, name: commandData.name });
          }
        }
      );
    });
  }

  /**
   * Get all custom commands for a guild
   */
  async getCommands(guildId) {
    return new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM custom_commands WHERE guild_id = ? ORDER BY created_at DESC",
        [guildId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get a specific custom command
   */
  async getCommand(guildId, commandName) {
    return new Promise((resolve, reject) => {
      db.db.get(
        "SELECT * FROM custom_commands WHERE guild_id = ? AND command_name = ?",
        [guildId, commandName.toLowerCase()],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  /**
   * Delete a custom command
   */
  async deleteCommand(guildId, commandName) {
    const normalizedName = commandName.toLowerCase().trim();
    const logger = require("./logger");
    
    return new Promise(async (resolve, reject) => {
      // First verify the command exists and get exact name from DB
      let existingCommand = null;
      try {
        existingCommand = await this.getCommand(guildId, normalizedName);
        if (!existingCommand) {
          logger.debug(
            "Custom Commands",
            `Command not found for deletion: ${normalizedName} in guild ${guildId}`
          );
          resolve({ deleted: false, reason: "not_found" });
          return;
        }
        logger.info(
          "Custom Commands",
          `Found command to delete: ${existingCommand.command_name} (ID: ${existingCommand.id}) in guild ${guildId}`
        );
      } catch (checkError) {
        logger.error("Custom Commands", "Error checking if command exists", {
          message: checkError?.message || String(checkError),
        });
        reject(checkError);
        return;
      }

      // Clear cache FIRST to prevent race conditions
      try {
        const redisCache = require("./redisCache");
        // Clear with exact command name from DB (in case of case mismatch)
        const exactCommandName = existingCommand.command_name.toLowerCase();
        const cacheKey = `custom_cmd_${guildId}_${exactCommandName}`;
        await redisCache.del(cacheKey);
        logger.info(
          "Custom Commands",
          `Cleared cache BEFORE deletion: ${cacheKey}`
        );
      } catch (cacheError) {
        logger.warn(
          "Custom Commands",
          `Failed to clear cache before deletion (will retry after): ${cacheError?.message || String(cacheError)}`
        );
      }

      // Now delete from database
      db.db.run(
        "DELETE FROM custom_commands WHERE guild_id = ? AND command_name = ?",
        [guildId, normalizedName],
        async function (err) {
          if (err) {
            logger.error("Custom Commands", "Error deleting command from database", {
              message: err?.message || String(err),
              guildId,
              commandName: normalizedName,
              errorCode: err.code,
            });
            reject(err);
            return;
          }
          
          const deleted = this.changes > 0;
          
          if (!deleted) {
            logger.warn(
              "Custom Commands",
              `Delete query executed but no rows affected for ${normalizedName} in guild ${guildId}. Changes: ${this.changes}`
            );
            resolve({ deleted: false, reason: "no_changes" });
            return;
          }
          
          logger.info(
            "Custom Commands",
            `✅ Successfully deleted command ${normalizedName} (ID: ${existingCommand?.id}) from guild ${guildId}. Database changes: ${this.changes}`
          );
          
          // Clear cache AGAIN after deletion to be absolutely sure
          try {
            const redisCache = require("./redisCache");
            const exactCommandName = existingCommand?.command_name?.toLowerCase() || normalizedName;
            const cacheKey = `custom_cmd_${guildId}_${exactCommandName}`;
            await redisCache.del(cacheKey);
            logger.info(
              "Custom Commands",
              `Cleared cache AFTER deletion: ${cacheKey}`
            );
            
            // Also clear any variations (case differences)
            await redisCache.del(`custom_cmd_${guildId}_${normalizedName}`).catch(() => {});
          } catch (cacheError) {
            logger.warn(
              "Custom Commands",
              `Cache clear after deletion failed: ${cacheError?.message || String(cacheError)}`
            );
          }
          
          resolve({ deleted: true });
        }
      );
    });
  }

  /**
   * Execute a custom command
   */
  async executeCommand(interaction) {
    const commandName = interaction.commandName;
    const guildId = interaction.guild.id;

    try {
      const command = await this.getCommand(guildId, commandName);

      if (!command) {
        return await interaction.reply({
          content: "❌ Custom command not found.",
          ephemeral: true,
        });
      }

      // Increment uses
      await this.incrementUses(command.id);

      // Handle different response types
      if (command.response_type === "text") {
        await interaction.reply({
          content: command.response_content,
        });
      } else if (command.response_type === "embed") {
        const embed = {
          title: command.embed_title,
          description: command.embed_description,
          color: parseInt(command.embed_color || "6779626", 10),
        };

        if (command.embed_fields) {
          try {
            embed.fields = JSON.parse(command.embed_fields);
          } catch (e) {
            logger.error("Custom Commands", "Failed to parse embed fields", {
              message: e?.message || String(e),
              stack: e?.stack,
              name: e?.name,
            });
          }
        }

        await interaction.reply({ embeds: [embed] });
      }
    } catch (error) {
      logger.error("Custom Commands", "Execute error", {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
      });
      await interaction.reply({
        content: "❌ Failed to execute custom command.",
        ephemeral: true,
      });
    }
  }

  async incrementUses(commandId) {
    return new Promise((resolve, reject) => {
      db.db.run(
        "UPDATE custom_commands SET uses = uses + 1 WHERE id = ?",
        [commandId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Update an existing custom command
   */
  async updateCommand(guildId, commandName, updates) {
    const fields = [];
    const values = [];

    if (updates.description !== undefined) {
      fields.push("description = ?");
      values.push(updates.description);
    }
    if (updates.content !== undefined) {
      fields.push("response_content = ?");
      values.push(updates.content);
    }
    if (updates.embedTitle !== undefined) {
      fields.push("embed_title = ?");
      values.push(updates.embedTitle);
    }
    if (updates.embedDescription !== undefined) {
      fields.push("embed_description = ?");
      values.push(updates.embedDescription);
    }

    values.push(guildId, commandName.toLowerCase());

    return new Promise((resolve, reject) => {
      db.db.run(
        `UPDATE custom_commands SET ${fields.join(
          ", "
        )} WHERE guild_id = ? AND command_name = ?`,
        values,
        function (err) {
          if (err) reject(err);
          else resolve({ updated: this.changes > 0 });
        }
      );
    });
  }
}

module.exports = new CustomCommands();
