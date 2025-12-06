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
    // Process in batches to avoid rate limits and improve performance
    let successCount = 0;
    let failCount = 0;
    const guilds = Array.from(client.guilds.cache.values());
    const batchSize = 5; // Process 5 guilds at a time
    
    logger.info("Commands", `Registering commands for ${guilds.length} servers (in batches of ${batchSize})...`);

    for (let i = 0; i < guilds.length; i += batchSize) {
      const batch = guilds.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (guild) => {
          try {
            await rest.put(
              Routes.applicationGuildCommands(client.user.id, guild.id),
              { body: commands }
            );
            successCount++;
            if (i === 0 || successCount % 10 === 0) {
              logger.info("Commands", `Progress: ${successCount}/${guilds.length} servers`);
            }
          } catch (error) {
            failCount++;
            logger.error(
              `❌ Failed to register commands for ${guild.name}:`,
              error.message
            );
            // If rate limited, wait before continuing
            if (error.code === 429 || error.status === 429) {
              const retryAfter = error.retryAfter || 1;
              logger.warn(`Commands", "Rate limited, waiting ${retryAfter}s...`);
              await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
            }
          }
        })
      );
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < guilds.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

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
