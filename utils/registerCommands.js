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

  // Create REST client with timeout to prevent hanging requests
  const rest = new REST({
    version: "10",
    timeout: 10000, // 10 second timeout per request
  }).setToken(process.env.DISCORD_TOKEN);

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
    let successCount = 0;
    let failCount = 0;

    // Helper function to add timeout to promises
    const withTimeout = (promise, timeoutMs, guildName) => {
      return Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
            timeoutMs
          )
        ),
      ]).catch((error) => {
        if (error.message.includes("Timeout")) {
          logger.error(
            `❌ Timeout registering commands for ${guildName} after ${timeoutMs}ms`
          );
        }
        throw error;
      });
    };

    const guilds = Array.from(client.guilds.cache.values());
    logger.info(
      "Commands",
      `Registering commands for ${guilds.length} servers...`
    );

    // Process in small batches to avoid rate limits and prevent hanging
    const batchSize = 5;
    const totalBatches = Math.ceil(guilds.length / batchSize);

    for (let i = 0; i < guilds.length; i += batchSize) {
      const batch = guilds.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;

      logger.info(
        "Commands",
        `Processing batch ${batchNum}/${totalBatches} (${batch.length} servers)...`
      );

      // Process batch in parallel with timeout protection
      const batchPromises = batch.map(async (guild) => {
        try {
          await withTimeout(
            rest.put(
              Routes.applicationGuildCommands(client.user.id, guild.id),
              { body: commands }
            ),
            8000,
            guild.name
          );
          return { success: true, guild: guild.name };
        } catch (error) {
          return { success: false, guild: guild.name, error: error.message };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);

      // Count successes and failures
      batchResults.forEach((result) => {
        if (result.status === "fulfilled") {
          if (result.value.success) {
            successCount++;
          } else {
            failCount++;
            if (!result.value.error.includes("Timeout")) {
              logger.error(
                `❌ Failed to register commands for ${result.value.guild}:`,
                result.value.error
              );
            }
          }
        } else {
          failCount++;
          logger.error(
            `❌ Batch registration error:`,
            result.reason?.message || String(result.reason)
          );
        }
      });

      // Small delay between batches to avoid rate limits
      if (i + batchSize < guilds.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
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
