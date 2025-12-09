/**
 * Nexus Bot - Advanced Discord Security Bot
 * Copyright (c) 2025 Nexus Bot. All rights reserved.
 * Licensed under the MIT License.
 *
 * Beyond Wick. Beyond Everything.
 */

const {
  Client,
  GatewayIntentBits,
  Collection,
  Options,
  Sweepers,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const logger = require("./utils/logger");
const db = require("./utils/database");

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

// Cache for channel pins (for pin/unpin detection)
client.channelPins = new Map();

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

// New Advanced Systems
const HoneypotSystem = require("./utils/honeypot");
client.honeypot = new HoneypotSystem(client);

const BehavioralFingerprint = require("./utils/behavioralFingerprint");
client.behavioralFP = new BehavioralFingerprint(client);

const ReferralSystem = require("./utils/referralSystem");
client.referrals = new ReferralSystem(client);

const GrowthAnalytics = require("./utils/growthAnalytics");
client.growthAnalytics = new GrowthAnalytics(client);

const SetupWizard = require("./utils/setupWizard");
client.setupWizard = new SetupWizard(client);

const CommandAnalytics = require("./utils/commandAnalytics");
client.commandAnalytics = new CommandAnalytics(client);

// Gateway Manager (EXCEEDS WICK - Enterprise-grade gateway monitoring)
const GatewayManager = require("./utils/gatewayManager");
client.gatewayManager = new GatewayManager(client);

const SecurityChallenges = require("./utils/securityChallenges");
client.securityChallenges = new SecurityChallenges(client);

const UserProfiles = require("./utils/userProfiles");
client.userProfiles = new UserProfiles(client);

// Error Boundary System - Advanced error recovery
const ErrorBoundary = require("./utils/errorBoundary");
client.errorBoundary = new ErrorBoundary(client);

// Integration Ecosystem (Webhooks/Zapier/IFTTT)
const IntegrationSystem = require("./utils/integrations");
client.integrations = new IntegrationSystem(client);

// Real-Time Audit Log Monitor (EXCEEDS WICK - continuous audit log analysis)
const AuditLogMonitor = require("./utils/auditLogMonitor");
client.auditLogMonitor = new AuditLogMonitor(client);

// Zero-Day Attack Detection (EXCEEDS WICK - detects unknown attack patterns)
const ZeroDayDetection = require("./utils/zeroDayDetection");
client.zeroDayDetection = new ZeroDayDetection(client);

// Webhook Server removed - web verification no longer supported

// Performance monitor is a singleton, automatically used in events/interactionCreate.js
// No need to instantiate it here

// Smart Status - Auto-updating bot status
const SmartStatus = require("./utils/smartStatus");
const smartStatus = new SmartStatus(client);

client.once("clientReady", () => {
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

// XP & Leveling System (EXCEEDS WICK - gamification & engagement)
const XPSystem = require("./utils/xpSystem");
client.xpSystem = new XPSystem(client);

// Webhook Events System (EXCEEDS WICK - real-time integrations)
const WebhookEvents = require("./utils/webhookEvents");
client.webhookEvents = new WebhookEvents(client);

// Multi-Server Management (EXCEEDS WICK - cross-server coordination)
const MultiServerManagement = require("./utils/multiServer");
client.multiServer = new MultiServerManagement(client);

// Optimized cleanup - run all cleanups in parallel (EXCEEDS WICK - better performance)
setInterval(
  async () => {
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
  },
  5 * 60 * 1000
);

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

// Gateway event monitoring (EXCEEDS WICK)
// Note: Discord.js WebSocketShard events, not WebSocketManager
client.ws.on("shardReady", (shardId) => {
  logger.info("GatewayManager", `[DEBUG] shardReady event fired for shard ${shardId}`);
  client.gatewayManager.initializeShard(shardId);
  client.gatewayManager.onReady(shardId);
});

client.ws.on("shardResume", (shardId, replayedEvents) => {
  logger.info("GatewayManager", `[DEBUG] shardResume event fired for shard ${shardId}`);
  client.gatewayManager.onResume(shardId, replayedEvents);
});

client.ws.on("shardDisconnect", (event, shardId) => {
  logger.info("GatewayManager", `[DEBUG] shardDisconnect event fired for shard ${shardId}`);
  client.gatewayManager.onDisconnect(shardId, event.code, event.reason);
});

client.ws.on("shardReconnecting", (shardId) => {
  logger.info("GatewayManager", `[DEBUG] shardReconnecting event fired for shard ${shardId}`);
  client.gatewayManager.onReconnecting(shardId);
});

client.ws.on("shardError", (error, shardId) => {
  logger.info("GatewayManager", `[DEBUG] shardError event fired for shard ${shardId}`);
  client.gatewayManager.onError(shardId, error);
});

// Start gateway health monitoring and initialize existing shards
client.once("ready", () => {
  logger.info("GatewayManager", "[DEBUG] Bot ready, initializing existing shards...");
  
  // Initialize all existing shards
  let initializedCount = 0;
  client.ws.shards.forEach((shard) => {
    logger.info("GatewayManager", `[DEBUG] Manually initializing shard ${shard.id}`);
    client.gatewayManager.initializeShard(shard.id);
    client.gatewayManager.onReady(shard.id);
    // Manually trigger an identify event for stats
    client.gatewayManager.onIdentify(shard.id, shard.sessionId || `session-${shard.id}`);
    initializedCount++;
  });
  
  logger.success("GatewayManager", `Initialized ${initializedCount} shards manually`);
  client.gatewayManager.startHealthMonitoring(60000); // Check every minute
  logger.success("GatewayManager", "Gateway health monitoring active");
});

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

// Initialize Redis cache (optional - falls back to in-memory if unavailable)
const redisCache = require("./utils/redisCache");
redisCache.connect().catch((err) => {
  logger.warn(
    "[Redis] Initialization failed, using in-memory cache:",
    err.message
  );
});

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
    logger.error("❌ Failed to login:", {
      message: error?.message || String(error),
      stack: error?.stack,
      name: error?.name,
    });
    if (error.message.includes("Invalid token")) {
      logger.error("⚠️ Check your DISCORD_TOKEN in .env file");
    }
    process.exit(1);
  });
}
// If USING_SHARDING is set, ShardingManager handles login automatically (no need to call client.login)

// Advanced error recovery system
const errorRecovery = require("./utils/errorRecovery");
errorRecovery.setClient(client);

// Error handling with recovery
process.on("unhandledRejection", async (error) => {
  logger.error("Unhandled promise rejection:", {
    message: error?.message || String(error),
    stack: error?.stack,
    name: error?.name,
  });

  // Attempt recovery
  await errorRecovery.handleError(error, {
    type: "unhandledRejection",
    recoverable: true,
  });
});

process.on("uncaughtException", async (error) => {
  logger.error("Uncaught exception:", {
    message: error.message,
    stack: error.stack,
    name: error.name,
  });

  // Attempt recovery
  await errorRecovery.handleError(error, {
    type: "uncaughtException",
    recoverable: false,
  });

  // Don't exit - let the process manager handle it
});

module.exports = client;
