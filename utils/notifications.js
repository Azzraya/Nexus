const db = require("./database");
const axios = require("axios");
const logger = require("./logger");

class Notifications {
  static async send(guildId, type, data, client = null) {
    const notificationConfigs = await db.getNotifications(guildId, type);

    for (const config of notificationConfigs) {
      if (!config.enabled) continue;

      try {
        if (config.channel_id && client) {
          // Send to Discord channel
          await this.sendDiscordNotification(
            client,
            config.channel_id,
            type,
            data
          );
        } else if (config.webhook_url) {
          // Send to webhook
          await this.sendWebhookNotification(config.webhook_url, type, data);
        }
      } catch (error) {
        logger.error(`Failed to send notification:`, error);
      }
    }
  }

  static async sendDiscordNotification(client, channelId, type, data) {
    try {
      const channel = client.channels.cache.get(channelId);
      if (!channel) return;

      const { EmbedBuilder } = require("discord.js");
      const embed = new EmbedBuilder()
        .setTitle(this.getNotificationTitle(type))
        .setDescription(this.getNotificationDescription(type, data))
        .setColor(this.getNotificationColor(type))
        .setTimestamp()
        .addFields(this.getNotificationFields(type, data));

      await channel.send({ embeds: [embed] });
    } catch (error) {
      logger.error("Failed to send Discord notification:", error);
    }
  }

  static async sendWebhookNotification(webhookUrl, type, data) {
    const embed = {
      title: this.getNotificationTitle(type),
      description: this.getNotificationDescription(type, data),
      color: this.getNotificationColor(type),
      timestamp: new Date().toISOString(),
      fields: this.getNotificationFields(type, data),
    };

    await axios.post(webhookUrl, {
      embeds: [embed],
    });
  }

  static getNotificationTitle(type) {
    const titles = {
      raid_detected: "🚨 Raid Detected",
      nuke_attempt: "💥 Nuke Attempt Detected",
      high_threat: "⚠️ High Threat User",
      mass_ban: "🔨 Mass Ban Detected",
      channel_deleted: "🗑️ Channel Deleted",
      role_deleted: "🔴 Role Deleted",
      suspicious_activity: "👁️ Suspicious Activity",
    };
    return titles[type] || "🔔 Notification";
  }

  static getNotificationDescription(type, data) {
    const descriptions = {
      raid_detected: `A raid has been detected! ${
        data.userCount || 0
      } suspicious users joined.`,
      nuke_attempt: `A nuke attempt was detected and prevented!`,
      high_threat: `User <@${data.userId}> has a threat score of ${data.threatScore}%`,
      mass_ban: `${data.count || 0} users were banned in a short period.`,
      channel_deleted: `Channel ${data.channelName} was deleted.`,
      role_deleted: `Role ${data.roleName} was deleted.`,
      suspicious_activity: `Suspicious activity detected: ${data.description}`,
    };
    return descriptions[type] || "An event occurred that requires attention.";
  }

  static getNotificationColor(type) {
    const colors = {
      raid_detected: 0xff0000,
      nuke_attempt: 0xff0000,
      high_threat: 0xff8800,
      mass_ban: 0xff8800,
      channel_deleted: 0xff8800,
      role_deleted: 0xff8800,
      suspicious_activity: 0xffff00,
    };
    return colors[type] || 0x0099ff;
  }

  static getNotificationFields(type, data) {
    const fields = [];

    if (data.userId) {
      fields.push({ name: "User", value: `<@${data.userId}>`, inline: true });
    }
    if (data.moderatorId) {
      fields.push({
        name: "Moderator",
        value: `<@${data.moderatorId}>`,
        inline: true,
      });
    }
    if (data.reason) {
      fields.push({ name: "Reason", value: data.reason, inline: false });
    }
    if (data.details) {
      fields.push({ name: "Details", value: data.details, inline: false });
    }

    return fields;
  }
}

module.exports = Notifications;
