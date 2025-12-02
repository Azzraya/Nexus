const { ShardingManager } = require("discord.js");
const path = require("path");
require("dotenv").config();

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN not found in .env file!");
  process.exit(1);
}

const manager = new ShardingManager(path.join(__dirname, "index.js"), {
  token: process.env.DISCORD_TOKEN,
  totalShards: "auto", // Auto-calculate shard count
  respawn: true, // Auto-respawn shards if they crash
  execArgv: process.execArgv,
  env: {
    ...process.env,
    USING_SHARDING: "true", // Pass to child processes
  },
});

// Initialize Top.gg stats posting (if token is provided)
if (process.env.TOPGG_TOKEN) {
  try {
    const { AutoPoster } = require("topgg-autoposter");
    const ap = AutoPoster(process.env.TOPGG_TOKEN, manager);

    ap.on("posted", (stats) => {
      console.log(
        `📊 [Top.gg] Posted stats: ${stats.serverCount} servers, ${stats.shardCount} shards`
      );
    });

    ap.on("error", (error) => {
      console.error("❌ [Top.gg] Error posting stats:", error.message);
    });

    console.log("✅ [Top.gg] Stats posting initialized");
  } catch (error) {
    console.error("❌ [Top.gg] Failed to initialize:", error.message);
  }
} else {
  console.log("ℹ️  [Top.gg] No TOPGG_TOKEN found, skipping stats posting");
}

// Initialize Discord Bot List stats posting (if token is provided)
// Note: The package doesn't directly support ShardingManager, so we'll use manual posting
if (process.env.DISCORDBOTLIST_TOKEN) {
  let dblInterval = null;
  let botId = null;

  // Wait for manager to be ready, then start posting stats
  manager.once("shardCreate", async (shard) => {
    shard.once("ready", async () => {
      if (!botId) {
        try {
          // Get bot ID from the first ready shard
          const clientValues = await manager.fetchClientValues("user.id");
          botId = clientValues[0];
        } catch (error) {
          console.error(
            "❌ [Discord Bot List] Failed to get bot ID:",
            error.message
          );
          return;
        }
      }

      if (!dblInterval) {
        const postStats = async () => {
          try {
            const axios = require("axios");
            const guilds = await manager.fetchClientValues("guilds.cache.size");
            const totalGuilds = guilds.reduce((acc, count) => acc + count, 0);

            const users = await manager.broadcastEval((c) =>
              c.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)
            );
            const totalUsers = users.reduce((acc, count) => acc + count, 0);

            // Get voice connections count (number of voice channels the bot is connected to)
            const voiceConnections = await manager.broadcastEval((c) => {
              // Count active voice connections
              let count = 0;
              if (c.voice && c.voice.adapters) {
                count = c.voice.adapters.size;
              }
              return count;
            });
            const totalVoiceConnections = voiceConnections.reduce(
              (acc, count) => acc + count,
              0
            );

            // Post aggregated stats (no shard_id for aggregated posting)
            const payload = {
              guilds: totalGuilds,
              users: totalUsers,
            };

            // Add voice connections if available
            if (totalVoiceConnections > 0) {
              payload.voice_connections = totalVoiceConnections;
            }

            await axios.post(
              `https://discordbotlist.com/api/v1/bots/${botId}/stats`,
              payload,
              {
                headers: {
                  Authorization: process.env.DISCORDBOTLIST_TOKEN,
                  "Content-Type": "application/json",
                },
              }
            );

            console.log(
              `📊 [Discord Bot List] Posted stats: ${totalGuilds} guilds, ${totalUsers} users${
                totalVoiceConnections > 0
                  ? `, ${totalVoiceConnections} voice connections`
                  : ""
              }, ${manager.totalShards} shards`
            );
          } catch (error) {
            console.error(
              "❌ [Discord Bot List] Error posting stats:",
              error.message
            );
            if (error.response) {
              console.error(
                `❌ [Discord Bot List] API Error: ${
                  error.response.status
                } - ${JSON.stringify(error.response.data)}`
              );
            }
          }
        };

        // Post immediately, then set interval
        postStats();
        dblInterval = setInterval(postStats, 3600000); // Every hour

        console.log("✅ [Discord Bot List] Stats posting initialized");
      }
    });
  });
} else {
  console.log(
    "ℹ️  [Discord Bot List] No DISCORDBOTLIST_TOKEN found, skipping stats posting"
  );
}

// Initialize Top.gg webhook server (runs once, not per shard)
// The webhook server will be started in index.js when shard 0 is ready

manager.on("shardCreate", (shard) => {
  console.log(`✅ Launched shard ${shard.id}`);

  shard.on("ready", () => {
    console.log(`🟢 Shard ${shard.id} is ready!`);
  });

  shard.on("disconnect", () => {
    console.log(`🔴 Shard ${shard.id} disconnected`);
  });

  shard.on("reconnecting", () => {
    console.log(`🟡 Shard ${shard.id} reconnecting...`);
  });

  shard.on("death", () => {
    console.log(`💀 Shard ${shard.id} died, respawning...`);
  });

  shard.on("error", (error) => {
    console.error(`❌ Shard ${shard.id} error:`, error);
  });
});

manager.spawn().catch(console.error);

// Graceful shutdown with parallel shard termination (EXCEEDS WICK - faster shutdown)
async function gracefulShutdown(signal) {
  console.log(`Received ${signal}, shutting down shards gracefully...`);

  // Kill all shards in parallel for faster shutdown
  const killPromises = Array.from(manager.shards.values()).map((shard) => {
    return new Promise((resolve) => {
      try {
        shard.kill();
        resolve();
      } catch (error) {
        console.error(`Error killing shard ${shard.id}:`, error);
        resolve(); // Continue even if one fails
      }
    });
  });

  await Promise.all(killPromises);
  console.log("All shards terminated.");
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
