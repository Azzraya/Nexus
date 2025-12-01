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
