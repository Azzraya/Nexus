const db = require("./database");
const logger = require("./logger");

class HeatSystem {
  constructor(client) {
    this.client = client;
    this.heatData = new Map(); // Track user heat scores
    this.messageHistory = new Map(); // Track message history for repetition detection
    this.timeoutMultipliers = new Map(); // Track timeout multipliers per user
    this.heatPanicMode = new Map(); // Track guilds in heat panic mode
    this.pingRaids = new Map(); // Track ping raids per guild
    this.raiderDetection = new Map(); // Track detected raiders
  }

  // Calculate heat for a message
  calculateHeat(message, config = {}) {
    let heat = 0;
    const content = message.content || "";
    const lowerContent = content.toLowerCase();

    // Base heat for normal message
    heat += 1;

    // Message repetition (check last 5 messages)
    const key = `${message.guild.id}-${message.author.id}`;
    const history = this.messageHistory.get(key) || [];
    const recentMessages = history.slice(-5);

    if (recentMessages.length > 0) {
      const similarity = this.calculateSimilarity(content, recentMessages);
      if (similarity > 0.8) {
        heat += 20; // High similarity = spam
      } else if (similarity > 0.5) {
        heat += 10; // Medium similarity
      }
    }

    // Store message in history
    history.push(content);
    if (history.length > 10) history.shift(); // Keep last 10
    this.messageHistory.set(key, history);

    // Emojis - each emoji adds heat
    const emojiRegex =
      /<a?:[\w]+:\d+>|[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const emojiCount = (content.match(emojiRegex) || []).length;
    heat += emojiCount * 2; // Each emoji adds 2 heat

    // Characters - excessive characters
    if (content.length > 1000) {
      heat += Math.floor((content.length - 1000) / 100) * 2; // 2 heat per 100 chars over 1000
    }

    // New lines - wall of text detection
    const newLineCount = (content.match(/\n/g) || []).length;
    if (newLineCount > 10) {
      heat += newLineCount * 1.5; // 1.5 heat per newline over 10
    }

    // Mentions - very valuable in heat system
    const mentionCount =
      message.mentions.users.size + message.mentions.roles.size;
    if (message.mentions.everyone || message.mentions.here) {
      heat += 50; // @everyone/@here is serious
    } else {
      heat += mentionCount * 5; // Each mention adds 5 heat
    }

    // Attachments - prevent spam embeds/images
    if (message.attachments.size > 0) {
      heat += message.attachments.size * 3;
    }

    // Links detection
    const linkRegex = /(https?:\/\/[^\s]+)/gi;
    const links = content.match(linkRegex) || [];

    // Check for malicious/NSFW/advertisement links
    for (const link of links) {
      const lowerLink = link.toLowerCase();

      // NSFW websites
      if (this.isNSFWLink(lowerLink)) {
        heat += 30; // NSFW links
      }

      // Malicious websites (IP grabbers, keyloggers, etc.)
      if (this.isMaliciousLink(lowerLink)) {
        heat += 40; // Malicious links
      }

      // Advertisement (Discord invites)
      if (/(discord\.gg|discord\.com\/invite|discord\.io)/i.test(link)) {
        heat += 25; // Discord invites
      }

      // Regular links
      heat += 2;
    }

    // Word blacklist (if configured)
    if (config.blacklistedWords && config.blacklistedWords.length > 0) {
      for (const word of config.blacklistedWords) {
        if (lowerContent.includes(word.toLowerCase())) {
          heat += 10;
        }
      }
    }

    // Link blacklist (if configured)
    if (config.blacklistedLinks && config.blacklistedLinks.length > 0) {
      for (const link of links) {
        for (const blacklisted of config.blacklistedLinks) {
          if (link.includes(blacklisted.toLowerCase())) {
            heat += 50; // Instant high heat for blacklisted links
          }
        }
      }
    }

    // Suspicion factors (hidden factors)
    // Account age (new accounts are more suspicious)
    if (message.member) {
      const accountAge = Date.now() - message.author.createdTimestamp;
      const daysOld = accountAge / (1000 * 60 * 60 * 24);
      if (daysOld < 7) {
        heat += 5; // New account bonus heat
      }
    }

    // Inactivity factor (works well in quiet channels)
    // This would need channel activity tracking - simplified for now
    if (message.channel) {
      const channelKey = `${message.guild.id}-${message.channel.id}`;
      // Could track last message time here
    }

    return Math.floor(heat);
  }

  // Calculate similarity between messages (0-1)
  calculateSimilarity(message1, recentMessages) {
    let maxSimilarity = 0;
    for (const msg of recentMessages) {
      const similarity = this.stringSimilarity(message1, msg);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }
    }
    return maxSimilarity;
  }

  // Simple string similarity (Jaccard similarity)
  stringSimilarity(str1, str2) {
    const words1 = new Set(str1.toLowerCase().split(/\s+/));
    const words2 = new Set(str2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  }

  // Check if link is NSFW
  isNSFWLink(link) {
    const nsfwDomains = [
      "porn",
      "xxx",
      "nsfw",
      "adult",
      "sex",
      "hentai",
      "pornhub",
      "xvideos",
      "redtube",
      "youporn",
      "xhamster",
      "tube8",
      "spankwire",
    ];
    return nsfwDomains.some((domain) => link.includes(domain));
  }

  // Check if link is malicious
  isMaliciousLink(link) {
    const maliciousDomains = [
      "grabify",
      "iplogger",
      "ip-grabber",
      "keylogger",
      "rat",
      "trojan",
      "malware",
      "virus",
      "phishing",
      "scam",
      "stealer",
    ];
    return maliciousDomains.some((domain) => link.includes(domain));
  }

  // Add heat to user
  async addHeat(guildId, userId, amount, reason = "Message") {
    const key = `${guildId}-${userId}`;
    const current = this.heatData.get(key) || {
      score: 0,
      history: [],
      lastUpdated: Date.now(),
    };

    current.score += amount;
    current.history.push({
      amount,
      reason,
      timestamp: Date.now(),
    });

    // Keep only last 50 history entries
    if (current.history.length > 50) {
      current.history.shift();
    }

    current.lastUpdated = Date.now();
    this.heatData.set(key, current);

    // Decay heat over time (heat diminishes)
    this.decayHeat(key);

    // Save to database
    await db.setHeatScore(guildId, userId, current.score);

    return current.score;
  }

  // Decay heat over time
  decayHeat(key) {
    const data = this.heatData.get(key);
    if (!data) return;

    const timeSinceUpdate = Date.now() - data.lastUpdated;
    const decayRate = 0.1; // 10% decay per minute
    const minutesPassed = timeSinceUpdate / 60000;

    if (minutesPassed > 1) {
      const decayAmount =
        data.score * (decayRate * Math.min(minutesPassed, 10)); // Max 10 minutes decay
      data.score = Math.max(0, data.score - decayAmount);
    }
  }

  // Get heat score
  getHeat(guildId, userId) {
    const key = `${guildId}-${userId}`;
    const data = this.heatData.get(key);
    return data ? data.score : 0;
  }

  // Check if user should be punished
  async checkPunishment(guildId, userId, heatScore, config = {}) {
    const threshold = config.heatThreshold || 100;
    const cap = config.heatCap || 150;

    if (heatScore < threshold) return null;

    // Check if in heat panic mode
    if (this.heatPanicMode.has(guildId)) {
      // In panic mode, any raider gets timeouted
      if (this.isRaider(guildId, userId)) {
        const constants = require("./constants");
        const MAX_TIMEOUT_DURATION = constants.MUTE.MAX_DURATION; // 28 days (Discord limit)
        let panicDuration = config.panicTimeoutDuration || 600000; // 10 minutes default

        // Cap at Discord's maximum
        if (panicDuration > MAX_TIMEOUT_DURATION) {
          panicDuration = MAX_TIMEOUT_DURATION;
        }

        return {
          action: "timeout",
          duration: panicDuration,
          reason: "Heat Panic Mode: Raider detected",
        };
      }
    }

    // Normal heat system
    const constants = require("./constants");
    const MAX_TIMEOUT_DURATION = constants.MUTE.MAX_DURATION; // 28 days (Discord limit)

    if (heatScore >= cap) {
      // Cap reached - use cap timeout duration
      const capDuration = config.capTimeoutDuration || 1209600000; // 14 days default
      const multiplier = this.getTimeoutMultiplier(guildId, userId);
      let finalDuration = capDuration * multiplier;

      // Cap at Discord's maximum (28 days)
      if (finalDuration > MAX_TIMEOUT_DURATION) {
        finalDuration = MAX_TIMEOUT_DURATION;
      }

      return {
        action: "timeout",
        duration: finalDuration,
        reason: "Heat system: Cap reached",
        purgeMessages: true,
      };
    } else {
      // Below cap - use first violation timeout
      const firstDuration = config.firstTimeoutDuration || 86400000; // 1 day default
      const multiplier = this.getTimeoutMultiplier(guildId, userId);
      let finalDuration = firstDuration * multiplier;

      // Cap at Discord's maximum (28 days)
      if (finalDuration > MAX_TIMEOUT_DURATION) {
        finalDuration = MAX_TIMEOUT_DURATION;
      }

      return {
        action: "timeout",
        duration: finalDuration,
        reason: "Heat system: Threshold exceeded",
      };
    }
  }

  // Get timeout multiplier (escalating punishments)
  getTimeoutMultiplier(guildId, userId) {
    const key = `${guildId}-${userId}`;
    const multiplier = this.timeoutMultipliers.get(key) || 1;
    return multiplier;
  }

  // Increase timeout multiplier (after timeout ends and user violates again)
  increaseTimeoutMultiplier(guildId, userId) {
    const key = `${guildId}-${userId}`;
    const current = this.timeoutMultipliers.get(key) || 1;
    // Cap multiplier at 28 to prevent durations exceeding Discord's 28-day limit
    // (28 * 1 day = 28 days max)
    const maxMultiplier = 28;
    const newMultiplier = Math.min(current * 2, maxMultiplier);
    this.timeoutMultipliers.set(key, newMultiplier);
    return newMultiplier;
  }

  // Reset timeout multiplier (after user behaves)
  resetTimeoutMultiplier(guildId, userId) {
    const key = `${guildId}-${userId}`;
    this.timeoutMultipliers.delete(key);
  }

  // Mark user as raider
  markRaider(guildId, userId) {
    const key = `${guildId}-${userId}`;
    this.raiderDetection.set(key, {
      guildId,
      userId,
      detectedAt: Date.now(),
    });
  }

  // Check if user is raider
  isRaider(guildId, userId) {
    const key = `${guildId}-${userId}`;
    return this.raiderDetection.has(key);
  }

  // Trigger heat panic mode
  triggerHeatPanicMode(guildId, raiderCount, config = {}) {
    const requiredRaiders = config.panicModeRaiders || 3;
    const panicDuration = config.panicModeDuration || 600000; // 10 minutes default

    if (raiderCount >= requiredRaiders) {
      this.heatPanicMode.set(guildId, {
        triggeredAt: Date.now(),
        duration: panicDuration,
        raiderCount,
      });

      logger.warn(
        `[HeatSystem] Heat Panic Mode triggered in ${guildId} - ${raiderCount} raiders detected`
      );

      // Auto-disable after duration
      setTimeout(() => {
        this.heatPanicMode.delete(guildId);
        logger.info(`[HeatSystem] Heat Panic Mode ended in ${guildId}`);
      }, panicDuration);

      return true;
    }

    return false;
  }

  // Check ping raid
  async checkPingRaid(guildId, userId, mentionCount, config = {}) {
    const threshold = config.pingRaidThreshold || 50;
    const timeWindow = config.pingRaidTimeWindow || 30000; // 30 seconds

    const key = `${guildId}`;
    if (!this.pingRaids.has(key)) {
      this.pingRaids.set(key, {
        mentions: [],
        startTime: Date.now(),
      });
    }

    const raidData = this.pingRaids.get(key);
    raidData.mentions.push({
      userId,
      count: mentionCount,
      timestamp: Date.now(),
    });

    // Clean old mentions
    raidData.mentions = raidData.mentions.filter(
      (m) => Date.now() - m.timestamp < timeWindow
    );

    // Count total mentions
    const totalMentions = raidData.mentions.reduce(
      (sum, m) => sum + m.count,
      0
    );

    if (totalMentions >= threshold) {
      // Ping raid detected - trigger lockdown
      logger.warn(
        `[HeatSystem] Ping raid detected in ${guildId} - ${totalMentions} mentions in ${timeWindow}ms`
      );

      // Trigger lockdown via anti-nuke system
      if (this.client.advancedAntiNuke) {
        await this.client.advancedAntiNuke.lockdownServer(
          this.client.guilds.cache.get(guildId),
          "ping_raid",
          { mentions: totalMentions }
        );
      }

      // Clear ping raid tracking
      this.pingRaids.delete(key);

      return true;
    }

    return false;
  }

  // Clean old data
  cleanup() {
    const now = Date.now();

    // Clean old message history (older than 1 hour)
    for (const [key, history] of this.messageHistory.entries()) {
      // History is already limited to 10 messages, so just clean empty ones
      if (history.length === 0) {
        this.messageHistory.delete(key);
      }
    }

    // Clean old heat data (older than 1 hour with no activity)
    for (const [key, data] of this.heatData.entries()) {
      if (now - data.lastUpdated > 3600000 && data.score === 0) {
        this.heatData.delete(key);
      }
    }

    // Clean old timeout multipliers (older than 24 hours)
    // These persist until reset, so we don't auto-clean them

    // Clean old raider detection (older than 24 hours)
    for (const [key, data] of this.raiderDetection.entries()) {
      if (now - data.detectedAt > 86400000) {
        this.raiderDetection.delete(key);
      }
    }

    // Clean old ping raid data (older than 1 minute)
    for (const [key, data] of this.pingRaids.entries()) {
      if (now - data.startTime > 60000) {
        this.pingRaids.delete(key);
      }
    }
  }
}

module.exports = HeatSystem;
