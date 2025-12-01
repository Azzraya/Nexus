const { registerCommands } = require("../utils/registerCommands");
const db = require("../utils/database");
const logger = require("../utils/logger");

module.exports = {
  name: "guildCreate",
  async execute(guild, client) {
    console.log(`🆕 Joined new server: ${guild.name} (${guild.id})`);

    // Log server join
    try {
      const owner = await guild.fetchOwner().catch(() => null);
      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO bot_activity_log (event_type, guild_id, guild_name, member_count, owner_id, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
          [
            "guild_join",
            guild.id,
            guild.name,
            guild.memberCount || 0,
            owner ? owner.id : null,
            Date.now(),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      console.log(`   Owner: ${owner ? owner.user.tag : "Unknown"}`);
      console.log(`   Members: ${guild.memberCount || 0}`);
    } catch (error) {
      console.error("Failed to log guild join:", error.message);
    }

    // Register commands for the new server
    try {
      const commands = [];
      const fs = require("fs");
      const path = require("path");
      const commandsPath = path.join(__dirname, "..", "commands");
      const commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith(".js"));

      for (const file of commandFiles) {
        const command = require(`../commands/${file}`);
        if (command.data) {
          commands.push(command.data.toJSON());
        }
      }

      const { REST, Routes } = require("discord.js");
      const rest = new REST({ version: "10" }).setToken(
        process.env.DISCORD_TOKEN
      );

      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: commands }
      );

      console.log(
        `✅ Registered ${commands.length} commands for ${guild.name}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to register commands for ${guild.name}:`,
        error.message
      );
    }

    // Create initial recovery snapshot for new servers
    try {
      const AutoRecovery = require("../utils/autoRecovery");
      await AutoRecovery.autoSnapshot(guild, "Initial snapshot on bot join");
      logger.info(`📸 Created initial recovery snapshot for ${guild.name} (${guild.id})`);
      console.log(`📸 Created initial recovery snapshot for ${guild.name}`);
    } catch (error) {
      logger.error(`Failed to create initial snapshot for ${guild.name}:`, error);
      console.error(`Failed to create initial snapshot for ${guild.name}:`, error.message);
    }
  },
};
