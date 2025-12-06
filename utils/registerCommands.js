const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const logger = require("./logger");

async function registerCommands(client) {
  if (!process.env.DISCORD_TOKEN) {
    logger.error("❌ DISCORD_TOKEN not found in .env file!");
    return;
  }

  if (!client.user) {
    logger.error("❌ Client not ready yet!");
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
      logger.error(`⚠️ Failed to load command ${file}:`, {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
      });
    }
  }

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    logger.info("Commands", `Registering ${commands.length} slash commands...`);

    // FIRST: Clear all global commands to prevent duplicates
    try {
      await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
      logger.success("Commands", "Cleared global commands");
    } catch (error) {
      logger.error("⚠️ Failed to clear global commands:", {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
      });
    }

    // THEN: Register commands per-guild only (instant, no duplicates)
    // Process ALL guilds in parallel for maximum speed
    const guilds = Array.from(client.guilds.cache.values());
    let successCount = 0;
    let failCount = 0;
    
    logger.info("Commands", `Registering commands for ${guilds.length} servers in parallel...`);

    const results = await Promise.allSettled(
      guilds.map(async (guild) => {
        try {
          await rest.put(
            Routes.applicationGuildCommands(client.user.id, guild.id),
            { body: commands }
          );
          return { success: true, guild: guild.name };
        } catch (error) {
          return { success: false, guild: guild.name, error };
        }
      })
    );

    // Count successes and failures
    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value.success) {
        successCount++;
      } else {
        failCount++;
        const guildName = guilds[index]?.name || "Unknown";
        const error = result.status === "fulfilled" ? result.value.error : result.reason;
        logger.error(
          `❌ Failed to register commands for ${guildName}:`,
          error?.message || error
        );
      }
    });

    logger.success(
      "Commands",
      `Registered commands for ${successCount} servers${
        failCount > 0 ? `, ${failCount} failed` : ""
      }`
    );
  } catch (error) {
    logger.error("❌ Error registering commands:", error);
  }
}

module.exports = { registerCommands };
