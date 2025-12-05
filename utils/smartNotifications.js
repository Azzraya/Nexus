const db = require("./database");
const logger = require("./logger");

class SmartNotifications {
  constructor() {
    this.notificationQueue = new Map(); // guildId -> array of pending notifications
    this.digestTimers = new Map(); // guildId -> timer
  }

  /**
   * Add notification to queue (for batching)
   */
  async queueNotification(guildId, type, data, priority = "normal") {
    if (!this.notificationQueue.has(guildId)) {
      this.notificationQueue.set(guildId, []);
    }

    const queue = this.notificationQueue.get(guildId);
    queue.push({ type, data, priority, timestamp: Date.now() });

    // Check if we should send immediately (critical) or batch
    const config = await this.getNotificationConfig(guildId);

    if (priority === "critical" || !config.digestMode) {
      await this.flushQueue(guildId);
    } else {
      // Schedule batch send
      this.scheduleDigest(guildId, config.digestInterval || 300000); // 5 min default
    }
  }

  /**
   * Get notification configuration for a guild
   */
  async getNotificationConfig(guildId) {
    try {
      const config = await db.getServerConfig(guildId);
      return {
        digestMode: config?.notification_digest_mode || false,
        digestInterval: config?.notification_digest_interval || 300000, // 5 minutes
        quietHoursStart: config?.notification_quiet_hours_start || null,
        quietHoursEnd: config?.notification_quiet_hours_end || null,
        priorityLevels: config?.notification_priority_levels || [
          "critical",
          "important",
          "normal",
          "info",
        ],
      };
    } catch (error) {
      logger.error("Error getting notification config:", error);
      return {
        digestMode: false,
        digestInterval: 300000,
        quietHoursStart: null,
        quietHoursEnd: null,
        priorityLevels: ["critical", "important", "normal", "info"],
      };
    }
  }

  /**
   * Check if we're in quiet hours
   */
  isQuietHours(config) {
    if (!config.quietHoursStart || !config.quietHoursEnd) return false;

    const now = new Date();
    const currentHour = now.getHours();
    const start = parseInt(config.quietHoursStart);
    const end = parseInt(config.quietHoursEnd);

    if (start <= end) {
      return currentHour >= start && currentHour < end;
    } else {
      // Overnight quiet hours
      return currentHour >= start || currentHour < end;
    }
  }

  /**
   * Schedule digest send
   */
  scheduleDigest(guildId, interval) {
    // Clear existing timer
    if (this.digestTimers.has(guildId)) {
      clearTimeout(this.digestTimers.get(guildId));
    }

    const timer = setTimeout(() => {
      this.flushQueue(guildId);
      this.digestTimers.delete(guildId);
    }, interval);

    this.digestTimers.set(guildId, timer);
  }

  /**
   * Flush notification queue (send batched notifications)
   */
  async flushQueue(guildId) {
    const queue = this.notificationQueue.get(guildId);
    if (!queue || queue.length === 0) return;

    const config = await this.getNotificationConfig(guildId);

    // Check quiet hours
    if (this.isQuietHours(config)) {
      // Store for later, but don't send now
      logger.info(
        `Notifications queued during quiet hours for guild ${guildId}`
      );
      return;
    }

    // Group by priority
    const grouped = {
      critical: [],
      important: [],
      normal: [],
      info: [],
    };

    queue.forEach((notif) => {
      if (grouped[notif.priority]) {
        grouped[notif.priority].push(notif);
      } else {
        grouped.normal.push(notif);
      }
    });

    // Send grouped notification
    const Notifications = require("./notifications");

    // Send critical immediately
    for (const notif of grouped.critical) {
      await Notifications.send(guildId, notif.type, notif.data);
    }

    // Batch others if digest mode
    if (
      config.digestMode &&
      (grouped.important.length > 0 ||
        grouped.normal.length > 0 ||
        grouped.info.length > 0)
    ) {
      await this.sendDigest(guildId, {
        important: grouped.important,
        normal: grouped.normal,
        info: grouped.info,
      });
    } else {
      // Send individually
      for (const notif of [
        ...grouped.important,
        ...grouped.normal,
        ...grouped.info,
      ]) {
        await Notifications.send(guildId, notif.type, notif.data);
      }
    }

    // Clear queue
    this.notificationQueue.set(guildId, []);
  }

  /**
   * Send digest notification
   */
  async sendDigest(guildId, grouped) {
    const { EmbedBuilder } = require("discord.js");

    const total =
      grouped.important.length + grouped.normal.length + grouped.info.length;
    if (total === 0) return;

    const embed = new EmbedBuilder()
      .setTitle(" digest - Server Activity Summary")
      .setDescription(`**${total}** events occurred in the last period`)
      .setColor(0x0099ff)
      .setTimestamp();

    if (grouped.important.length > 0) {
      embed.addFields({
        name: `🔴 Important (${grouped.important.length})`,
        value:
          grouped.important
            .slice(0, 5)
            .map((n) => `• ${n.type.replace(/_/g, " ")}`)
            .join("\n") +
          (grouped.important.length > 5
            ? `\n+${grouped.important.length - 5} more`
            : ""),
        inline: false,
      });
    }

    if (grouped.normal.length > 0) {
      embed.addFields({
        name: `🟡 Normal (${grouped.normal.length})`,
        value:
          grouped.normal
            .slice(0, 5)
            .map((n) => `• ${n.type.replace(/_/g, " ")}`)
            .join("\n") +
          (grouped.normal.length > 5
            ? `\n+${grouped.normal.length - 5} more`
            : ""),
        inline: false,
      });
    }

    if (grouped.info.length > 0) {
      embed.addFields({
        name: `🔵 Info (${grouped.info.length})`,
        value:
          grouped.info
            .slice(0, 5)
            .map((n) => `• ${n.type.replace(/_/g, " ")}`)
            .join("\n") +
          (grouped.info.length > 5 ? `\n+${grouped.info.length - 5} more` : ""),
        inline: false,
      });
    }

    // Send to notification channel
    const Notifications = require("./notifications");
    await Notifications.send(guildId, "digest", {
      embed: embed.toJSON(),
      count: total,
    });
  }

  /**
   * Get notification statistics
   */
  async getStats(guildId, timeRange = 86400000) {
    // This would query notification logs
    // For now, return queue stats
    const queue = this.notificationQueue.get(guildId) || [];

    return {
      queued: queue.length,
      byPriority: {
        critical: queue.filter((n) => n.priority === "critical").length,
        important: queue.filter((n) => n.priority === "important").length,
        normal: queue.filter((n) => n.priority === "normal").length,
        info: queue.filter((n) => n.priority === "info").length,
      },
    };
  }
}

module.exports = new SmartNotifications();
