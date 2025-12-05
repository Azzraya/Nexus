const { ClusterManager } = require("discord-hybrid-sharding");
const path = require("path");
require("dotenv").config();

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN not found in .env file!");
  process.exit(1);
}

// Cluster configuration
const totalClusters = parseInt(process.env.CLUSTERS) || "auto"; // Auto-calculate or use env var
const shardsPerCluster = parseInt(process.env.SHARDS_PER_CLUSTER) || 3; // 3 shards per cluster (optimal for most cases)

const manager = new ClusterManager(path.join(__dirname, "shard.js"), {
  totalShards: "auto", // Let Discord decide shard count
  totalClusters: totalClusters, // Auto-calculate cluster count or use env var
  shardsPerClusters: shardsPerCluster,
  mode: "process", // or "worker" (process is more stable)
  token: process.env.DISCORD_TOKEN,
  execArgv: process.execArgv,
});

// Cluster events
manager.on("clusterCreate", (cluster) => {
  console.log(`✅ Launched Cluster ${cluster.id}`);

  cluster.on("clientReady", () => {
    console.log(`🟢 Cluster ${cluster.id} is ready!`);
  });

  cluster.on("disconnect", () => {
    console.log(`🔴 Cluster ${cluster.id} disconnected`);
  });

  cluster.on("reconnecting", () => {
    console.log(`🟡 Cluster ${cluster.id} reconnecting...`);
  });

  cluster.on("death", (cluster) => {
    console.log(`💀 Cluster ${cluster.id} died, respawning...`);
  });

  cluster.on("error", (error) => {
    console.error(`❌ Cluster ${cluster.id} error:`, error);
  });

  cluster.on("message", (message) => {
    // Handle inter-cluster communication
    if (message._type === "stats") {
      console.log(
        `📊 Cluster ${cluster.id} - ${message.guilds} guilds, ${message.users} users`
      );
    }
  });
});

// Spawn all clusters
manager.spawn({ timeout: -1 }).catch(console.error);

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`Received ${signal}, shutting down clusters gracefully...`);

  try {
    // Kill all clusters in parallel
    const clusters = Array.from(manager.clusters.values());
    await Promise.all(
      clusters.map((cluster) => {
        return new Promise((resolve) => {
          try {
            cluster.kill();
            resolve();
          } catch (error) {
            console.error(`Error killing cluster ${cluster.id}:`, error);
            resolve();
          }
        });
      })
    );

    console.log("All clusters terminated.");
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Cluster manager stats
manager.on("debug", (info) => {
  if (process.env.DEBUG === "true") {
    console.log(`[DEBUG] ${info}`);
  }
});

// Get total stats across all clusters
async function getTotalStats() {
  try {
    const results = await manager.broadcastEval((c) => {
      return {
        guilds: c.guilds.cache.size,
        users: c.users.cache.size,
        channels: c.channels.cache.size,
      };
    });

    const total = results.reduce(
      (acc, val) => {
        acc.guilds += val.guilds;
        acc.users += val.users;
        acc.channels += val.channels;
        return acc;
      },
      { guilds: 0, users: 0, channels: 0 }
    );

    return total;
  } catch (error) {
    console.error("Error getting total stats:", error);
    return null;
  }
}

// Log total stats every 30 minutes
setInterval(
  async () => {
    const stats = await getTotalStats();
    if (stats) {
      console.log(
        `\n📊 [Total Stats] ${stats.guilds} guilds, ${stats.users} users, ${stats.channels} channels across ${manager.totalClusters} clusters\n`
      );
    }
  },
  30 * 60 * 1000
);

console.log(`\n🚀 Cluster Manager Started`);
console.log(
  `📊 Clusters: ${totalClusters === "auto" ? "Auto" : totalClusters}`
);
console.log(`⚙️  Shards per cluster: ${shardsPerCluster}`);
console.log(`🔄 Mode: process`);
console.log(`\n`);
