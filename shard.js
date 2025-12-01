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

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down shards...");
  manager.shards.forEach((shard) => shard.kill());
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Shutting down shards...");
  manager.shards.forEach((shard) => shard.kill());
  process.exit(0);
});
