const {
  Client,
  GatewayIntentBits,
  Collection,
  PermissionsBitField,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const db = require("./utils/database");
const logger = require("./utils/logger");
const AutoMod = require("./utils/automod");

// Load API server (only starts if API_ENABLED=true)
require("./api/server");

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

// Anti-raid system
client.antiRaid = {
  joinRate: new Map(), // Track joins per time window
  suspiciousUsers: new Map(), // Track suspicious behavior
  lockdown: new Map(), // Server lockdown status
  config: new Map(), // Per-server config
};

// Heat-based moderation system
client.heatSystem = new Map(); // Track user "heat" scores

// Database
client.db = db;

// Logger
client.logger = logger;

// Workflow Engine
const WorkflowEngine = require("./utils/workflows");
client.workflows = new WorkflowEngine(client);

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
        console.error(`Failed to ${config.action} ${susMember.id}:`, err);
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

// Heat-based moderation
client.addHeat = async (guildId, userId, amount, reason) => {
  const key = `${guildId}-${userId}`;
  const current = client.heatSystem.get(key) || { score: 0, history: [] };

  current.score += amount;
  current.history.push({ amount, reason, timestamp: Date.now() });

  // Decay heat over time (remove old entries)
  const oneHourAgo = Date.now() - 3600000;
  current.history = current.history.filter((h) => h.timestamp > oneHourAgo);
  current.score = current.history.reduce((sum, h) => sum + h.amount, 0);

  client.heatSystem.set(key, current);

  // Persist to database
  await db.setHeatScore(guildId, userId, current.score);

  // Auto-action based on heat
  const thresholds = {
    50: "warn",
    100: "mute",
    150: "kick",
    200: "ban",
  };

  for (const [threshold, action] of Object.entries(thresholds).sort(
    (a, b) => b[0] - a[0]
  )) {
    if (current.score >= threshold) {
      return { action, score: current.score };
    }
  }

  return { action: null, score: current.score };
};

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
      console.error("Anti-nuke action failed:", err);
    }
  }

  client.antiRaid.suspiciousUsers.set(key, data);
  return false;
};

// Login with shard support
// Note: If using shard.js, don't login here - shard.js handles it
if (!process.env.SHARDING_DISABLED) {
  if (client.shard) {
    // Sharded mode - shard.js handles login
    console.log("Running in sharded mode - use 'node shard.js' to start");
  } else {
    // Single shard mode
    if (!process.env.DISCORD_TOKEN) {
      console.error("❌ DISCORD_TOKEN not found in .env file!");
      process.exit(1);
    }
    client.login(process.env.DISCORD_TOKEN).catch((error) => {
      console.error("❌ Failed to login:", error.message);
      if (error.message.includes("Invalid token")) {
        console.error("⚠️ Check your DISCORD_TOKEN in .env file");
      }
      process.exit(1);
    });
  }
}

// Error handling
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
  // Log to file if logger is available
  if (logger) {
    logger.error("Unhandled promise rejection:", error);
  }
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  if (logger) {
    logger.error("Uncaught exception:", error);
  }
  // Don't exit - let the process manager handle it
});

module.exports = client;
