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

    // Create recovery snapshots for all servers (if auto-recovery is enabled)
    const AutoRecovery = require("../utils/autoRecovery");
    const logger = require("../utils/logger");
    for (const guild of client.guilds.cache.values()) {
      try {
        const config = await db.getServerConfig(guild.id);
        // Default to enabled if not set
        if (config?.auto_recovery_enabled !== 0) {
          // Check if we have a recent snapshot (within last 24 hours)
          const recentSnapshots = await db.getRecoverySnapshots(guild.id, 1);
          const hasRecentSnapshot = recentSnapshots.length > 0 && 
            (Date.now() - recentSnapshots[0].created_at) < 24 * 60 * 60 * 1000;
          
          if (!hasRecentSnapshot) {
            await AutoRecovery.autoSnapshot(guild, "Periodic auto-snapshot");
            logger.info(`📸 Created recovery snapshot for ${guild.name}`);
          }
        }
      } catch (error) {
        // Silently continue - not critical
        logger.debug(`Failed to create snapshot for ${guild.name}:`, error.message);
      }
    }

    // Check bot role position in all servers (warn if not high enough)
    for (const guild of client.guilds.cache.values()) {
      try {
        const botMember = await guild.members.fetch(client.user.id).catch(() => null);
        if (!botMember) continue;

        const botRole = botMember.roles.highest;
        if (!botRole) continue;

        // Get all roles (excluding @everyone)
        const allRoles = guild.roles.cache
          .filter(r => r.id !== guild.id)
          .sort((a, b) => b.position - a.position);

        // Check if bot role is in top 3 positions (should be highest for best protection)
        const botRoleIndex = allRoles.findIndex(r => r.id === botRole.id);
        const totalRoles = allRoles.size;

        if (botRoleIndex > 2) {
          logger.warn(
            `⚠️ [${guild.name}] Bot role "${botRole.name}" is at position ${botRole.position} (${botRoleIndex + 1}/${totalRoles}). ` +
            `For best anti-nuke protection, position the bot's role ABOVE all other roles. ` +
            `Use /security rolecheck for details.`
          );
        } else if (botRoleIndex === 0) {
          logger.info(`✅ [${guild.name}] Bot role is at highest position - optimal for anti-nuke protection`);
        }
      } catch (error) {
        // Silently continue - not critical
      }
    }
  },
};
