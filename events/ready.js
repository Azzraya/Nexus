const { ActivityType } = require("discord.js");
const ShardManager = require("../utils/shardManager");
const { registerCommands } = require("../utils/registerCommands");

module.exports = {
  name: "ready",
  once: true,
  async execute(client) {
    const shardInfo = ShardManager.getShardInfo(client);

    // Register slash commands
    await registerCommands(client);

    if (shardInfo.isSharded) {
      console.log(
        `✅ Shard ${shardInfo.shardId}/${shardInfo.shardCount - 1} is online!`
      );
      console.log(
        `📊 Serving ${client.guilds.cache.size} servers on this shard`
      );
      console.log(`👥 Watching ${client.users.cache.size} users on this shard`);
    } else {
      console.log(`✅ ${client.user.tag} is online!`);
      console.log(`📊 Serving ${client.guilds.cache.size} servers`);
      console.log(`👥 Watching ${client.users.cache.size} users`);
    }

    // Get total stats if sharded
    if (shardInfo.isSharded) {
      try {
        const totalGuilds = await ShardManager.getGuildCount(client);
        const totalUsers = await ShardManager.getUserCount(client);
        console.log(
          `🌐 Total across all shards: ${totalGuilds} servers, ${totalUsers} users`
        );
      } catch (error) {
        console.error("Failed to fetch shard stats:", error);
      }
    }

    // Set bot status
    client.user.setActivity(
      shardInfo.isSharded
        ? `Protecting ${client.guilds.cache.size} servers | Shard ${
            shardInfo.shardId
          }/${shardInfo.shardCount - 1} | /help`
        : "Protecting servers | /help",
      {
        type: ActivityType.Watching,
      }
    );

    // Load workflows for all guilds
    if (client.workflows) {
      for (const guild of client.guilds.cache.values()) {
        await client.workflows.loadWorkflows(guild.id);
      }
      console.log(`⚙️ Workflows loaded`);
    }

    // Generate initial recommendations for all guilds
    const SmartRecommendations = require("../utils/smartRecommendations");
    for (const guild of client.guilds.cache.values()) {
      try {
        await SmartRecommendations.analyzeServer(guild.id, guild);
      } catch (error) {
        console.error(
          `Failed to generate recommendations for ${guild.name}:`,
          error
        );
      }
    }
    console.log(`🤖 Smart recommendations generated`);

    // Initialize default configs for all servers
    client.guilds.cache.forEach((guild) => {
      if (!client.antiRaid.config.has(guild.id)) {
        client.antiRaid.config.set(guild.id, {
          enabled: true,
          maxJoins: 5,
          timeWindow: 10000,
          action: "ban",
          antiNuke: true,
          quarantineRole: null,
        });
      }
    });
  },
};
