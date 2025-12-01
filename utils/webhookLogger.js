const { WebhookClient } = require("discord.js");
const db = require("./database");

class WebhookLogger {
  static async log(guild, type, data) {
    const config = await db.getServerConfig(guild.id);
    if (!config || !config.webhook_url) return;

    try {
      const webhook = new WebhookClient({ url: config.webhook_url });

      const embed = {
        title: this.getTitle(type),
        description: this.getDescription(type, data),
        color: this.getColor(type),
        timestamp: new Date().toISOString(),
        fields: this.getFields(type, data),
      };

      await webhook.send({ embeds: [embed] });
    } catch (error) {
      console.error("Webhook logging failed:", error.message);
    }
  }

  static getTitle(type) {
    const titles = {
      ban: "🔨 User Banned",
      kick: "👢 User Kicked",
      mute: "🔇 User Muted",
      warn: "⚠️ User Warned",
      raid: "🚨 Raid Detected",
      nuke: "💣 Nuke Attempt",
      message_delete: "🗑️ Message Deleted",
      channel_create: "📝 Channel Created",
      channel_delete: "🗑️ Channel Deleted",
      role_create: "➕ Role Created",
      role_delete: "➖ Role Deleted",
    };
    return titles[type] || "📋 Event Logged";
  }

  static getDescription(type, data) {
    if (type === "raid") {
      return `**Threat Score:** ${data.threatScore}%\n**Suspicious Joins:** ${data.count}\n**Action:** ${data.action}`;
    }
    if (type === "nuke") {
      return `**User:** ${data.user}\n**Actions:** ${data.actions.join(
        ", "
      )}\n**Time:** ${data.time}s`;
    }
    return data.description || "No description";
  }

  static getColor(type) {
    const colors = {
      ban: 0xff0000,
      kick: 0xff8800,
      mute: 0xffaa00,
      warn: 0xffff00,
      raid: 0xff0000,
      nuke: 0xff0000,
      message_delete: 0x0099ff,
      channel_create: 0x00ff00,
      channel_delete: 0xff0000,
      role_create: 0x00ff00,
      role_delete: 0xff0000,
    };
    return colors[type] || 0x0099ff;
  }

  static getFields(type, data) {
    const fields = [];
    if (data.user) {
      fields.push({
        name: "User",
        value: `${data.user} (${data.userId})`,
        inline: true,
      });
    }
    if (data.moderator) {
      fields.push({ name: "Moderator", value: data.moderator, inline: true });
    }
    if (data.reason) {
      fields.push({ name: "Reason", value: data.reason, inline: false });
    }
    if (data.duration) {
      fields.push({ name: "Duration", value: data.duration, inline: true });
    }
    return fields;
  }
}

module.exports = WebhookLogger;
