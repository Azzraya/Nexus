const axios = require("axios");
const db = require("./database");
const logger = require("./logger");

class AdvancedAutomod {
  constructor(client) {
    this.client = client;
    this.messageCache = new Map(); // userId-guildId -> [messages]
    this.linkCache = new Map(); // url -> {malicious, timestamp}
    this.configCache = new Map(); // guildId -> parsed config (for ignored channels/roles)
    this.inviteRegex =
      /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/gi;
    this.urlRegex = /(https?:\/\/[^\s]+)/gi;

    // Known malicious domains (expand this list)
    this.maliciousDomains = [
      "grabify.link",
      "iplogger.org",
      "iplogger.com",
      "blasze.tk",
      "lovebird.guru",
      "trulove.guru",
      "dateing.club",
      "shrekis.life",
      "headshot.monster",
      "gaming-at-my.best",
      "progaming.monster",
    ];

    // Cleanup old cache every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  cleanup() {
    const now = Date.now();
    // Clean message cache
    for (const [key, messages] of this.messageCache.entries()) {
      const filtered = messages.filter((m) => now - m.timestamp < 60000);
      if (filtered.length === 0) {
        this.messageCache.delete(key);
      } else {
        this.messageCache.set(key, filtered);
      }
    }
    // Clean link cache (24 hour TTL)
    for (const [url, data] of this.linkCache.entries()) {
      if (now - data.timestamp > 86400000) {
        this.linkCache.delete(url);
      }
    }
  }

  isIgnored(message, config) {
    // PERFORMANCE: Cache parsed JSON to avoid parsing on every message
    const cacheKey = `${message.guild.id}_ignored`;
    let cached = this.configCache.get(cacheKey);

    if (!cached) {
      cached = {
        channels: config.ignored_channels
          ? JSON.parse(config.ignored_channels)
          : [],
        roles: config.ignored_roles ? JSON.parse(config.ignored_roles) : [],
      };
      this.configCache.set(cacheKey, cached);

      // Clear cache after 5 minutes
      setTimeout(() => this.configCache.delete(cacheKey), 300000);
    }

    // Check ignored channels (fast array lookup)
    if (cached.channels.includes(message.channel.id)) return true;

    // Check ignored roles (fast)
    if (message.member && cached.roles.length > 0) {
      if (
        message.member.roles.cache.some((role) =>
          cached.roles.includes(role.id)
        )
      ) {
        return true;
      }
    }

    return false;
  }

  async checkMessage(message) {
    // PERFORMANCE: Early returns to skip processing ASAP
    if (message.author.bot) return null;
    if (!message.guild) return null;
    if (message.webhookId) return null; // Skip webhook messages

    const config = await db.getAutomodConfig(message.guild.id);
    if (!config || !config.enabled) return null; // Skip if automod disabled

    // Check ignored channels/roles (now cached)
    if (this.isIgnored(message, config)) return null;

    const violations = [];

    // Run all checks in parallel
    const checks = await Promise.all([
      config.spam_enabled ? this.checkSpam(message, config) : null,
      config.link_scanning_enabled ? this.checkLinks(message, config) : null,
      config.caps_enabled ? this.checkCaps(message, config) : null,
      config.emoji_spam_enabled ? this.checkEmojiSpam(message, config) : null,
      config.mention_spam_enabled
        ? this.checkMentionSpam(message, config)
        : null,
    ]);

    checks.forEach((result) => {
      if (result) violations.push(result);
    });

    return violations.length > 0 ? violations : null;
  }

  async checkSpam(message, config) {
    const key = `${message.author.id}-${message.guild.id}`;
    const now = Date.now();

    if (!this.messageCache.has(key)) {
      this.messageCache.set(key, []);
    }

    const userMessages = this.messageCache.get(key);

    // Add current message
    userMessages.push({
      content: message.content,
      timestamp: now,
      id: message.id,
    });

    // Remove old messages
    const filtered = userMessages.filter(
      (m) => now - m.timestamp < config.spam_time_window
    );
    this.messageCache.set(key, filtered);

    // Check for duplicate messages
    const duplicates = filtered.filter(
      (m) => m.content.toLowerCase() === message.content.toLowerCase()
    );

    if (filtered.length >= config.spam_max_messages || duplicates.length >= 3) {
      return {
        type: "spam",
        action: config.spam_action,
        reason: `Sent ${filtered.length} messages in ${
          config.spam_time_window / 1000
        }s`,
        messageCount: filtered.length,
      };
    }

    return null;
  }

  async checkLinks(message, config) {
    const urls = message.content.match(this.urlRegex);
    if (!urls || urls.length === 0) return null;

    // Check for Discord invites first
    const invites = message.content.match(this.inviteRegex);
    if (invites && config.block_invites) {
      // Extract invite codes
      const codes = invites
        .map((inv) => {
          const match = inv.match(/\/([a-zA-Z0-9]+)$/);
          return match ? match[1] : null;
        })
        .filter(Boolean);

      // Check whitelist
      if (config.invite_whitelist) {
        const whitelist = JSON.parse(config.invite_whitelist);
        const isWhitelisted = await this.checkInviteWhitelist(codes, whitelist);
        if (!isWhitelisted) {
          return {
            type: "invite",
            action: config.link_action,
            reason: "Unauthorized Discord invite",
            invites: codes,
          };
        }
      } else {
        // Block all invites if no whitelist
        return {
          type: "invite",
          action: config.link_action,
          reason: "Discord invites not allowed",
          invites: codes,
        };
      }
    }

    // Check for malicious links
    for (const url of urls) {
      try {
        const domain = new URL(url).hostname.toLowerCase();

        // Check blacklist
        if (config.link_blacklist) {
          const blacklist = JSON.parse(config.link_blacklist);
          if (blacklist.some((d) => domain.includes(d))) {
            return {
              type: "malicious_link",
              action: config.link_action,
              reason: "Blacklisted domain",
              url: url,
            };
          }
        }

        // Check known malicious domains
        if (this.maliciousDomains.some((d) => domain.includes(d))) {
          return {
            type: "malicious_link",
            action: config.link_action,
            reason: "Known IP grabber/malicious link",
            url: url,
          };
        }

        // Check whitelist (if exists, only whitelisted allowed)
        if (config.link_whitelist) {
          const whitelist = JSON.parse(config.link_whitelist);
          if (!whitelist.some((d) => domain.includes(d))) {
            return {
              type: "unapproved_link",
              action: config.link_action,
              reason: "Link not on whitelist",
              url: url,
            };
          }
        }
      } catch (error) {
        // Invalid URL, ignore
      }
    }

    return null;
  }

  async checkInviteWhitelist(codes, whitelist) {
    // Fetch invite details to check server IDs
    for (const code of codes) {
      try {
        const invite = await this.client.fetchInvite(code);
        if (!whitelist.includes(invite.guild.id)) {
          return false;
        }
      } catch (error) {
        // Invalid invite or can't fetch
        return false;
      }
    }
    return true;
  }

  checkCaps(message, config) {
    const content = message.content;
    if (content.length < 10) return null; // Too short to judge

    const letters = content.replace(/[^a-zA-Z]/g, "");
    if (letters.length === 0) return null;

    const caps = content.replace(/[^A-Z]/g, "");
    const capsPercentage = (caps.length / letters.length) * 100;

    if (capsPercentage >= config.caps_threshold) {
      return {
        type: "caps",
        action: config.caps_action,
        reason: `${Math.round(capsPercentage)}% caps (threshold: ${
          config.caps_threshold
        }%)`,
        percentage: capsPercentage,
      };
    }

    return null;
  }

  checkEmojiSpam(message, config) {
    // Count custom emojis
    const customEmojis =
      message.content.match(/<a?:[a-zA-Z0-9_]+:[0-9]+>/g) || [];

    // Count unicode emojis (rough estimate)
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const unicodeEmojis = message.content.match(emojiRegex) || [];

    const totalEmojis = customEmojis.length + unicodeEmojis.length;

    if (totalEmojis >= config.emoji_max_count) {
      return {
        type: "emoji_spam",
        action: config.emoji_action,
        reason: `${totalEmojis} emojis (max: ${config.emoji_max_count})`,
        count: totalEmojis,
      };
    }

    return null;
  }

  checkMentionSpam(message, config) {
    const mentions = message.mentions.users.size + message.mentions.roles.size;

    if (mentions >= config.mention_max_count) {
      return {
        type: "mention_spam",
        action: config.mention_action,
        reason: `${mentions} mentions (max: ${config.mention_max_count})`,
        count: mentions,
      };
    }

    return null;
  }

  async executeAction(message, violation, config) {
    try {
      const member = message.member;
      if (!member) return;

      // Log violation
      await db.logAutomodViolation(
        message.guild.id,
        message.author.id,
        violation.type,
        message.content,
        violation.action
      );

      // Delete message if needed
      if (["delete", "timeout", "kick", "ban"].includes(violation.action)) {
        await message.delete().catch(() => {});
      }

      // Take action
      switch (violation.action) {
        case "warn":
          await this.sendWarning(message, violation);
          break;

        case "timeout":
          await member.timeout(5 * 60 * 1000, `Automod: ${violation.reason}`);
          await this.sendWarning(message, violation);
          break;

        case "kick":
          await member.kick(`Automod: ${violation.reason}`);
          break;

        case "ban":
          await member.ban({ reason: `Automod: ${violation.reason}` });
          break;
      }

      // Log to mod log channel
      if (config.automod_log_channel) {
        await this.logToChannel(message, violation, config);
      }
    } catch (error) {
      logger.error("[AdvancedAutomod] Action execution failed:", error);
    }
  }

  async sendWarning(message, violation) {
    try {
      await message.channel.send({
        content: `${message.author}, your message was flagged by automod: **${violation.reason}**`,
        allowedMentions: { users: [message.author.id] },
      });
    } catch (error) {
      // Ignore if can't send
    }
  }

  async logToChannel(message, violation, config) {
    try {
      const channel = message.guild.channels.cache.get(
        config.automod_log_channel
      );
      if (!channel) return;

      const { EmbedBuilder } = require("discord.js");
      const embed = new EmbedBuilder()
        .setTitle("🤖 Automod Action")
        .setColor(0xff6b6b)
        .addFields(
          {
            name: "User",
            value: `${message.author} (${message.author.id})`,
            inline: true,
          },
          { name: "Channel", value: `${message.channel}`, inline: true },
          { name: "Violation", value: violation.type, inline: true },
          { name: "Reason", value: violation.reason, inline: false },
          {
            name: "Action",
            value: violation.action.toUpperCase(),
            inline: true,
          },
          {
            name: "Message",
            value: message.content.substring(0, 1000) || "No content",
            inline: false,
          }
        )
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    } catch (error) {
      logger.error("[AdvancedAutomod] Log to channel failed:", error);
    }
  }
}

module.exports = AdvancedAutomod;
