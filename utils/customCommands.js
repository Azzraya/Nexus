// Custom Command Builder
// Let users create custom commands without coding

const db = require("./database");

class CustomCommands {
  constructor() {
    this.createTable();
  }

  createTable() {
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
    return new Promise((resolve, reject) => {
      db.db.run(
        "DELETE FROM custom_commands WHERE guild_id = ? AND command_name = ?",
        [guildId, commandName.toLowerCase()],
        function (err) {
          if (err) reject(err);
          else resolve({ deleted: this.changes > 0 });
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
            console.error("Failed to parse embed fields:", e);
          }
        }

        await interaction.reply({ embeds: [embed] });
      }
    } catch (error) {
      console.error("[Custom Commands] Execute error:", error);
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
