const { Client, GatewayIntentBits, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const db = require("./utils/database");
const logger = require("./utils/logger");

// API removed - not needed for local use

// Initialize client with all necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
  ],
});

// Collections for commands and events
client.commands = new Collection();
client.events = new Collection();
client.cooldowns = new Collection();

// Initialize cache system (EXCEEDS WICK - better caching)
const cache = require("./utils/cache");
client.cache = cache;

// Anti-raid system
client.antiRaid = {
  joinRate: new Map(), // Track joins per time window
  suspiciousUsers: new Map(), // Track suspicious behavior
  lockdown: new Map(), // Server lockdown status
  config: new Map(), // Per-server config
};

// Advanced Heat-based moderation system
const HeatSystem = require("./utils/heatSystem");
client.heatSystem = new HeatSystem(client);

// Advanced Verification System
const VerificationSystem = require("./utils/verificationSystem");
client.verificationSystem = new VerificationSystem(client);

// Database
client.db = db;

// Logger
client.logger = logger;

// Workflow Engine
const WorkflowEngine = require("./utils/workflows");
client.workflows = new WorkflowEngine(client);

// Advanced Anti-Nuke System
const AdvancedAntiNuke = require("./utils/advancedAntiNuke");
client.advancedAntiNuke = new AdvancedAntiNuke(client);
const AutoBackup = require("./utils/autoBackup");
client.autoBackup = new AutoBackup(client);

// Webhook Server removed - web verification no longer supported

// Performance monitor is a singleton, automatically used in events/interactionCreate.js
// No need to instantiate it here

// Smart Status - Auto-updating bot status
const SmartStatus = require("./utils/smartStatus");
const smartStatus = new SmartStatus(client);

client.once("ready", () => {
  // Start smart status after bot is ready
  setTimeout(() => {
    smartStatus.start(2); // Rotate every 2 minutes
  }, 5000); // Wait 5 seconds after ready
});

// Snapshot Scheduler (EXCEEDS WICK - automatic point-in-time snapshots)
const SnapshotScheduler = require("./utils/snapshotScheduler");
client.snapshotScheduler = new SnapshotScheduler(client);

// Vote Rewards System (EXCEEDS WICK - automatic vote detection & rewards)
const VoteRewards = require("./utils/voteRewards");
client.voteRewards = new VoteRewards(client);

// Dashboard Server (EXCEEDS WICK - free dashboard vs Wick's paid)
const DashboardServer = require("./dashboard/server");
client.dashboardServer = new DashboardServer(client);

// Advanced Automod System (EXCEEDS WICK - comprehensive message scanning)
const AdvancedAutomod = require("./utils/advancedAutomod");
client.advancedAutomod = new AdvancedAutomod(client);

// Member Screening System (EXCEEDS WICK - proactive security)
const MemberScreening = require("./utils/memberScreening");
client.memberScreening = new MemberScreening(client);

// Scheduled Actions System (EXCEEDS WICK - automation)
const ScheduledActions = require("./utils/scheduledActions");
client.scheduledActions = new ScheduledActions(client);

// Voice Monitoring System (EXCEEDS WICK - voice channel protection)
const VoiceMonitoring = require("./utils/voiceMonitoring");
client.voiceMonitoring = new VoiceMonitoring(client);

// Webhook Events System (EXCEEDS WICK - real-time integrations)
const WebhookEvents = require("./utils/webhookEvents");
client.webhookEvents = new WebhookEvents(client);

// Multi-Server Management (EXCEEDS WICK - cross-server coordination)
const MultiServerManagement = require("./utils/multiServer");
client.multiServer = new MultiServerManagement(client);

// Optimized cleanup - run all cleanups in parallel (EXCEEDS WICK - better performance)
setInterval(async () => {
  const cleanupTasks = [];

  if (client.advancedAntiNuke) {
    cleanupTasks.push(
      Promise.resolve(client.advancedAntiNuke.cleanup()).catch((err) =>
        logger.error("AdvancedAntiNuke cleanup error:", err)
      )
    );
  }
  if (client.heatSystem && typeof client.heatSystem.cleanup === "function") {
    cleanupTasks.push(
      Promise.resolve(client.heatSystem.cleanup()).catch((err) =>
        logger.error("HeatSystem cleanup error:", err)
      )
    );
  }
  if (
    client.verificationSystem &&
    typeof client.verificationSystem.cleanup === "function"
  ) {
    cleanupTasks.push(
      Promise.resolve(client.verificationSystem.cleanup()).catch((err) =>
        logger.error("VerificationSystem cleanup error:", err)
      )
    );
  }

  // Run all cleanups in parallel for better performance
  await Promise.all(cleanupTasks);
}, 5 * 60 * 1000);

// Load commands
const commandsPath = path.join(__dirname, "commands");
if (!fs.existsSync(commandsPath))
  fs.mkdirSync(commandsPath, { recursive: true });

const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

// Load events
const eventsPath = path.join(__dirname, "events");
if (!fs.existsSync(eventsPath)) fs.mkdirSync(eventsPath, { recursive: true });

const eventFiles = fs
  .readdirSync(eventsPath)
  .filter((file) => file.endsWith(".js"));
for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

// Anti-raid detection
client.checkAntiRaid = async (guild, member) => {
  const config = client.antiRaid.config.get(guild.id) || {
    enabled: true,
    maxJoins: 5, // Max joins in time window
    timeWindow: 10000, // 10 seconds
    action: "ban", // ban, kick, or quarantine
    quarantineRole: null,
  };

  if (!config.enabled) return false;

  const now = Date.now();
  const joinData = client.antiRaid.joinRate.get(guild.id) || {
    joins: [],
    lastReset: now,
  };

  // Reset if time window passed
  if (now - joinData.lastReset > config.timeWindow) {
    joinData.joins = [];
    joinData.lastReset = now;
  }

  joinData.joins.push({ member, timestamp: now });
  client.antiRaid.joinRate.set(guild.id, joinData);

  // Check if threshold exceeded
  if (joinData.joins.length >= config.maxJoins) {
    // Trigger anti-raid
    const suspicious = joinData.joins.map((j) => j.member);

    for (const susMember of suspicious) {
      try {
        if (config.action === "ban") {
          await susMember.ban({
            reason: "Anti-raid protection",
            deleteMessageDays: 1,
          });
        } else if (config.action === "kick") {
          await susMember.kick("Anti-raid protection");
        } else if (config.action === "quarantine" && config.quarantineRole) {
          await susMember.roles.add(config.quarantineRole);
        }
      } catch (err) {
        logger.error(`Failed to ${config.action} ${susMember.id}:`, err);
      }
    }

    // Lockdown server
    client.antiRaid.lockdown.set(guild.id, true);

    // Notify admins
    const logChannel = guild.channels.cache.find(
      (ch) => ch.name.includes("log") || ch.name.includes("mod")
    );
    if (logChannel) {
      logChannel.send({
        embeds: [
          {
            title: "🚨 Anti-Raid Protection Triggered",
            description: `Detected ${suspicious.length} suspicious joins. Action taken: ${config.action}`,
            color: 0xff0000,
            timestamp: new Date().toISOString(),
          },
        ],
      });
    }

    // Reset join tracking
    joinData.joins = [];
    joinData.lastReset = now;
    return true;
  }

  return false;
};

// Removed duplicate cleanup - now handled in the main cleanup interval above

// Anti-nuke protection
client.checkAntiNuke = async (guild, user, action) => {
  const config = client.antiRaid.config.get(guild.id) || {};
  if (!config.antiNuke) return false;

  const key = `${guild.id}-${user.id}`;
  const data = client.antiRaid.suspiciousUsers.get(key) || {
    actions: [],
    firstAction: Date.now(),
  };

  data.actions.push({ action, timestamp: Date.now() });

  // Check if too many actions in short time
  const recentActions = data.actions.filter(
    (a) => Date.now() - a.timestamp < 5000
  );
  if (recentActions.length >= 5) {
    // Likely nuke attempt
    try {
      const member = await guild.members.fetch(user.id);
      await member.ban({
        reason: "Anti-nuke protection - suspicious activity detected",
        deleteMessageDays: 7,
      });

      // Restore what was deleted if possible
      const logChannel = guild.channels.cache.find((ch) =>
        ch.name.includes("log")
      );
      if (logChannel) {
        logChannel.send({
          embeds: [
            {
              title: "🛡️ Anti-Nuke Protection",
              description: `${user.tag} was banned for suspicious activity (${recentActions.length} actions in 5 seconds)`,
              color: 0xff0000,
            },
          ],
        });
      }

      return true;
    } catch (err) {
      logger.error("Anti-nuke action failed:", err);
    }
  }

  client.antiRaid.suspiciousUsers.set(key, data);
  return false;
};

// Initialize Top.gg stats posting (for non-sharded mode)
// Note: For sharded mode, Top.gg is initialized in shard.js
if (!process.env.USING_SHARDING && process.env.TOPGG_TOKEN) {
  try {
    const { AutoPoster } = require("topgg-autoposter");
    // Post every 60 minutes (3600000ms) to avoid rate limits
    // Top.gg allows updates every 30min, but 60min is safer
    const ap = AutoPoster(process.env.TOPGG_TOKEN, client, {
      interval: 3600000, // 1 hour in milliseconds
    });

    ap.on("posted", (stats) => {
      logger.info(`[Top.gg] Posted stats: ${stats.serverCount} servers`);
    });

    ap.on("error", (error) => {
      const errorMsg = error.message || error.toString();

      // Suppress common non-critical errors
      if (errorMsg.includes("429")) {
        logger.warn("[Top.gg] Rate limited (429) - will retry in 1 hour");
      } else if (
        errorMsg.includes("504") ||
        errorMsg.includes("Gateway Timeout")
      ) {
        logger.warn(
          "[Top.gg] Gateway timeout (504) - Top.gg API slow, will retry in 1 hour"
        );
      } else if (
        errorMsg.includes("503") ||
        errorMsg.includes("Service Unavailable")
      ) {
        logger.warn(
          "[Top.gg] Service unavailable (503) - will retry in 1 hour"
        );
      } else {
        // Only log actual errors (connection issues, auth problems, etc.)
        logger.error("[Top.gg] Error posting stats:", error);
      }
    });

    logger.info("[Top.gg] Stats posting initialized (60min interval)");
  } catch (error) {
    logger.error("[Top.gg] Failed to initialize:", error);
  }
}

// Bot list stats posting initialization moved to events/ready.js
// This keeps all ready event handling in one place

// Top.gg webhook server removed - not using webhooks

// Login with shard support
// If we're being spawned by ShardingManager (shard.js), it handles login automatically via the token passed to it
// Only login if we're running index.js directly (not via shard.js)
if (!process.env.USING_SHARDING) {
  // Single shard mode - login directly
  if (!process.env.DISCORD_TOKEN) {
    logger.error("❌ DISCORD_TOKEN not found in .env file!");
    process.exit(1);
  }
  client.login(process.env.DISCORD_TOKEN).catch((error) => {
    logger.error("❌ Failed to login:", error.message);
    if (error.message.includes("Invalid token")) {
      logger.error("⚠️ Check your DISCORD_TOKEN in .env file");
    }
    process.exit(1);
  });
}
// If USING_SHARDING is set, ShardingManager handles login automatically (no need to call client.login)

// Error handling
process.on("unhandledRejection", (error) => {
  logger.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:", error);
  // Don't exit - let the process manager handle it
});

module.exports = client;
