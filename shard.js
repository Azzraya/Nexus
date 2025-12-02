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

// Initialize VoidBots stats posting (if token is provided)
// Note: For sharded mode, we'll use manual posting since the package doesn't directly support ShardingManager
if (process.env.VOIDBOTS_TOKEN) {
  let voidbotsInterval = null;
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
          console.error("❌ [VoidBots] Failed to get bot ID:", error.message);
          return;
        }
      }

      if (!voidbotsInterval) {
        let lastPostTime = 0;
        const MIN_POST_INTERVAL = 180000; // 3 minutes minimum per API (180000ms)

        const postStats = async () => {
          // Rate limiting: ensure at least 3 minutes between posts
          const now = Date.now();
          const timeSinceLastPost = now - lastPostTime;
          
          if (timeSinceLastPost < MIN_POST_INTERVAL) {
            const waitTime = MIN_POST_INTERVAL - timeSinceLastPost;
            console.log(
              `⏳ [VoidBots] Rate limited, waiting ${Math.ceil(waitTime / 1000)}s before posting...`
            );
            setTimeout(postStats, waitTime);
            return;
          }

          try {
            const axios = require("axios");
            const guilds = await manager.fetchClientValues("guilds.cache.size");
            const totalGuilds = guilds.reduce((acc, count) => acc + count, 0);
            const shardCount = manager.totalShards;

            await axios.post(
              `https://api.voidbots.net/bot/stats/${botId}`,
              {
                server_count: totalGuilds,
                shard_count: shardCount,
              },
              {
                headers: {
                  Authorization: process.env.VOIDBOTS_TOKEN,
                  "Content-Type": "application/json",
                },
              }
            );

            lastPostTime = Date.now();
            console.log(
              `📊 [VoidBots] Posted stats: ${totalGuilds} servers, ${shardCount} shards`
            );
          } catch (error) {
            console.error("❌ [VoidBots] Error posting stats:", error.message);
            if (error.response) {
              console.error(
                `❌ [VoidBots] API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
              );
              
              // If rate limited (429), wait longer before retrying
              if (error.response.status === 429) {
                const retryAfter = error.response.headers["retry-after"] 
                  ? parseInt(error.response.headers["retry-after"]) * 1000 
                  : MIN_POST_INTERVAL;
                console.log(
                  `⏳ [VoidBots] Rate limited, waiting ${retryAfter / 1000}s before retry...`
                );
                lastPostTime = Date.now();
                setTimeout(postStats, retryAfter);
                return;
              }
            }
          }
        };

        // Post after initial delay (don't post immediately to avoid rate limits)
        // Wait 3 minutes before first post, then post every 15 minutes
        // Note: API requires 3 minute minimum between posts
        setTimeout(() => {
          postStats();
          voidbotsInterval = setInterval(postStats, 15 * 60 * 1000); // 15 minutes (post less frequently than minimum)
        }, 180000); // Initial 3 minute delay

        console.log("✅ [VoidBots] Stats posting initialized");
      }
    });
  });
} else {
  console.log("ℹ️  [VoidBots] No VOIDBOTS_TOKEN found, skipping stats posting");
}

// Initialize Discord Bots (discord.bots.gg) stats posting
if (process.env.DISCORDBOTS_TOKEN) {
  let dbInterval = null;
  let botId = null;

  manager.once("shardCreate", async (shard) => {
    shard.once("ready", async () => {
      if (!botId) {
        try {
          const clientValues = await manager.fetchClientValues("user.id");
          botId = clientValues[0];
        } catch (error) {
          console.error("[Discord Bots] Failed to get bot ID:", error.message);
          return;
        }
      }

      if (!dbInterval) {
        const postStats = async () => {
          try {
            const axios = require("axios");
            const guilds = await manager.fetchClientValues("guilds.cache.size");
            const totalGuilds = guilds.reduce((acc, count) => acc + count, 0);

            await axios.post(
              `https://discord.bots.gg/api/v1/bots/${botId}/stats`,
              {
                guildCount: totalGuilds,
                shardCount: manager.totalShards,
              },
              {
                headers: {
                  Authorization: process.env.DISCORDBOTS_TOKEN,
                  "Content-Type": "application/json",
                },
              }
            );

            console.log(
              `📊 [Discord Bots] Posted stats: ${totalGuilds} guilds, ${manager.totalShards} shards`
            );
          } catch (error) {
            console.error("[Discord Bots] Error posting stats:", error.message);
          }
        };

        postStats();
        dbInterval = setInterval(postStats, 1800000); // Every 30 minutes
        console.log("✅ [Discord Bots] Stats posting initialized");
      }
    });
  });
} else {
  console.log(
    "ℹ️  [Discord Bots] No DISCORDBOTS_TOKEN found, skipping stats posting"
  );
}

// Initialize Bots on Discord stats posting
if (process.env.BOTSONDICORD_TOKEN) {
  let bodInterval = null;
  let botId = null;

  manager.once("shardCreate", async (shard) => {
    shard.once("ready", async () => {
      if (!botId) {
        try {
          const clientValues = await manager.fetchClientValues("user.id");
          botId = clientValues[0];
        } catch (error) {
          console.error(
            "[Bots on Discord] Failed to get bot ID:",
            error.message
          );
          return;
        }
      }

      if (!bodInterval) {
        const postStats = async () => {
          try {
            const axios = require("axios");
            const guilds = await manager.fetchClientValues("guilds.cache.size");
            const totalGuilds = guilds.reduce((acc, count) => acc + count, 0);

            await axios.post(
              `https://bots.ondiscord.xyz/bot-api/bots/${botId}/guilds`,
              {
                guildCount: totalGuilds,
              },
              {
                headers: {
                  Authorization: process.env.BOTSONDICORD_TOKEN,
                  "Content-Type": "application/json",
                },
              }
            );

            console.log(
              `📊 [Bots on Discord] Posted stats: ${totalGuilds} guilds`
            );
          } catch (error) {
            console.error(
              "[Bots on Discord] Error posting stats:",
              error.message
            );
          }
        };

        postStats();
        bodInterval = setInterval(postStats, 1800000); // Every 30 minutes
        console.log("✅ [Bots on Discord] Stats posting initialized");
      }
    });
  });
} else {
  console.log(
    "ℹ️  [Bots on Discord] No BOTSONDICORD_TOKEN found, skipping stats posting"
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
