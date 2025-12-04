const { ActivityType } = require("discord.js");
const ShardManager = require("../utils/shardManager");
const { registerCommands } = require("../utils/registerCommands");

module.exports = {
  name: "clientReady",
  once: true,
  async execute(client) {
    const shardInfo = ShardManager.getShardInfo(client);

    // Register slash commands
    await registerCommands(client);

    // Post commands to Discord Bot List (only from shard 0 or non-sharded)
    if (process.env.DISCORDBOTLIST_TOKEN) {
      const shardInfo = ShardManager.getShardInfo(client);
      const shouldPostCommands =
        !shardInfo.isSharded || shardInfo.shardId === 0;

      if (shouldPostCommands) {
        try {
          const DiscordBotList = require("../utils/discordbotlist");
          let dbl = client.discordBotList;

          if (!dbl) {
            dbl = new DiscordBotList(client, process.env.DISCORDBOTLIST_TOKEN);
            // Initialize it (this sets up the dbl instance)
            dbl.initialize();
            client.discordBotList = dbl;
          }

          // Collect all commands
          const commands = [];
          for (const command of client.commands.values()) {
            if (command.data) {
              commands.push(command.data.toJSON());
            }
          }

          if (commands.length > 0) {
            await dbl.postCommands(commands);
            console.log(
              `✅ Posted ${commands.length} commands to Discord Bot List`
            );
          }
        } catch (error) {
          console.error(
            "⚠️ Failed to post commands to Discord Bot List:",
            error.message
          );
        }
      }
    }

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

    // List all guilds
    console.log(`\n📋 Guilds (${client.guilds.cache.size}):`);
    const guilds = Array.from(client.guilds.cache.values()).sort(
      (a, b) => (b.memberCount || 0) - (a.memberCount || 0)
    );
    guilds.forEach((guild, index) => {
      const memberCount = guild.memberCount || 0;
      const owner = guild.members.cache.get(guild.ownerId);
      const ownerTag = owner?.user?.tag || "Unknown";
      console.log(
        `  ${index + 1}. ${guild.name} (${
          guild.id
        }) - ${memberCount} members - Owner: ${ownerTag}`
      );
    });
    console.log(""); // Empty line for spacing

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

    // Start automatic snapshot scheduler (EXCEEDS WICK - point-in-time recovery)
    if (
      client.snapshotScheduler &&
      (!shardInfo.isSharded || shardInfo.shardId === 0)
    ) {
      client.snapshotScheduler.start();
      console.log(`📸 Snapshot scheduler started (hourly backups enabled)`);
    }

    // Start automatic vote checking for all guilds (EXCEEDS WICK - auto vote rewards)
    if (client.voteRewards) {
      for (const guild of client.guilds.cache.values()) {
        client.voteRewards.startAutoChecking(guild);
      }
      console.log(
        `🎁 Vote rewards auto-checking started for ${client.guilds.cache.size} guilds`
      );
    }

    // Start Dashboard Server (EXCEEDS WICK - free dashboard vs Wick's premium)
    if (
      client.dashboardServer &&
      (!shardInfo.isSharded || shardInfo.shardId === 0)
    ) {
      client.dashboardServer.start(3000);
      console.log(`🌐 Dashboard server started on port 3000`);
      console.log(
        `🔗 Access at: ${process.env.DASHBOARD_URL || "http://localhost:3000"}`
      );
    }

    // Start Scheduled Actions System (EXCEEDS WICK - automation)
    if (
      client.scheduledActions &&
      (!shardInfo.isSharded || shardInfo.shardId === 0)
    ) {
      await client.scheduledActions.start();
      console.log(`⏰ Scheduled Actions system started`);
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
    const db = client.db;
    for (const guild of client.guilds.cache.values()) {
      try {
        const config = await db.getServerConfig(guild.id);
        // Default to enabled if not set
        if (config?.auto_recovery_enabled !== 0) {
          // Check if we have a recent snapshot (within last 24 hours)
          const recentSnapshots = await db.getRecoverySnapshots(guild.id, 1);
          const hasRecentSnapshot =
            recentSnapshots.length > 0 &&
            Date.now() - recentSnapshots[0].created_at < 24 * 60 * 60 * 1000;

          if (!hasRecentSnapshot) {
            await AutoRecovery.autoSnapshot(guild, "Periodic auto-snapshot");
            logger.info(`📸 Created recovery snapshot for ${guild.name}`);
          }
        }
      } catch (error) {
        // Silently continue - not critical
        logger.debug(
          `Failed to create snapshot for ${guild.name}:`,
          error.message
        );
      }
    }

    // Check bot role position in all servers (warn if not high enough)
    for (const guild of client.guilds.cache.values()) {
      try {
        const botMember = await guild.members
          .fetch(client.user.id)
          .catch(() => null);
        if (!botMember) continue;

        const botRole = botMember.roles.highest;
        if (!botRole) continue;

        // Get all roles (excluding @everyone)
        const allRoles = guild.roles.cache
          .filter((r) => r.id !== guild.id)
          .sort((a, b) => b.position - a.position);

        // Check if bot role is in top 3 positions (should be highest for best protection)
        const botRoleIndex = allRoles.findIndex((r) => r.id === botRole.id);
        const totalRoles = allRoles.size;

        if (botRoleIndex > 2) {
          logger.warn(
            `⚠️ [${guild.name}] Bot role "${botRole.name}" is at position ${
              botRole.position
            } (${botRoleIndex + 1}/${totalRoles}). ` +
              `For best anti-nuke protection, position the bot's role ABOVE all other roles. ` +
              `Use /security rolecheck for details.`
          );
        } else if (botRoleIndex === 0) {
          logger.info(
            `✅ [${guild.name}] Bot role is at highest position - optimal for anti-nuke protection`
          );
        }
      } catch (error) {
        // Silently continue - not critical
      }
    }

    // Initialize bot list stats posting (for non-sharded mode only)
    // DO NOT initialize if sharding is enabled - shard.js handles it
    if (!process.env.USING_SHARDING && !shardInfo.isSharded) {
      const logger = require("../utils/logger");

      // Initialize Void Bots stats posting
      if (process.env.VOIDBOTS_TOKEN && !client.voidBots) {
        try {
          const VoidBots = require("../utils/voidbots");
          const voidBots = new VoidBots(client, process.env.VOIDBOTS_TOKEN);
          voidBots.initialize();
          client.voidBots = voidBots;
        } catch (error) {
          logger.error("[Void Bots] Failed to initialize:", error);
        }
      }

      // Initialize Discord Bots (discord.bots.gg) stats posting
      if (process.env.DISCORDBOTS_TOKEN && !client.discordBots) {
        try {
          const DiscordBots = require("../utils/discordbots");
          const discordBots = new DiscordBots(
            client,
            process.env.DISCORDBOTS_TOKEN
          );
          discordBots.initialize();
          client.discordBots = discordBots;
        } catch (error) {
          logger.error("[Discord Bots] Failed to initialize:", error);
        }
      }

      // Initialize Bots on Discord stats posting
      if (process.env.BOTSONDICORD_TOKEN && !client.botsOnDiscord) {
        try {
          const BotsOnDiscord = require("../utils/botsondicord");
          const botsOnDiscord = new BotsOnDiscord(
            client,
            process.env.BOTSONDICORD_TOKEN
          );
          botsOnDiscord.initialize();
          client.botsOnDiscord = botsOnDiscord;
        } catch (error) {
          logger.error("[Bots on Discord] Failed to initialize:", error);
        }
      }
    }
  },
};
