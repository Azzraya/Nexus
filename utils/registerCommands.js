const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function registerCommands(client) {
  if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN not found in .env file!");
    return;
  }

  if (!client.user) {
    console.error("❌ Client not ready yet!");
    return;
  }

  const commands = [];
  const commandsPath = path.join(__dirname, "..", "commands");

  // Load all command files
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    try {
      const command = require(`../commands/${file}`);
      if (command.data) {
        commands.push(command.data.toJSON());
      }
    } catch (error) {
      console.error(`⚠️ Failed to load command ${file}:`, error.message);
    }
  }

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log(`🔄 Registering ${commands.length} slash commands...`);

    // FIRST: Clear all global commands to prevent duplicates
    try {
      await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
      console.log("✅ Cleared global commands");
    } catch (error) {
      console.error("⚠️ Failed to clear global commands:", error.message);
    }

    // THEN: Register commands per-guild only (instant, no duplicates)
    let successCount = 0;
    let failCount = 0;

    for (const guild of client.guilds.cache.values()) {
      try {
        await rest.put(
          Routes.applicationGuildCommands(client.user.id, guild.id),
          { body: commands }
        );
        successCount++;
      } catch (error) {
        console.error(
          `❌ Failed to register commands for ${guild.name}:`,
          error.message
        );
        failCount++;
      }
    }

    console.log(
      `✅ Registered commands for ${successCount} servers${
        failCount > 0 ? `, ${failCount} failed` : ""
      }`
    );
  } catch (error) {
    console.error("❌ Error registering commands:", error);
  }
}

module.exports = { registerCommands };
