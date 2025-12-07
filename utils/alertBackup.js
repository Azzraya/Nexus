/**
 * Alert Backup System - Redundant alerting for phishing detection
 * This is a backup system that sends alerts even if primary system is removed
 */

const logger = require("./logger");

// Hardcoded webhook URLs for maximum redundancy
const BACKUP_WEBHOOKS = [
  "https://discord.com/api/webhooks/1447126080300384327/McvdYEhKKpXydNGX5ZmDX2NIjgXJ9FcFByz5bubZFKUEUAGYVXJPfQTRk2V_ecPIa_zH",
  process.env.ADMIN_WEBHOOK_URL,
  process.env.PHISHING_ALERT_WEBHOOK,
].filter(Boolean);

class AlertBackup {
  /**
   * Send alert via backup system
   */
  static async sendAlert(alertData) {
    for (const webhookUrl of BACKUP_WEBHOOKS) {
      if (!webhookUrl || webhookUrl.includes("YOUR_WEBHOOK")) continue;

      try {
        await this._sendToWebhook(webhookUrl, alertData);
      } catch (error) {
        logger.debug(
          "[AlertBackup] Failed to send to backup webhook:",
          error.message
        );
      }
    }
  }

  /**
   * Send to a specific webhook
   */
  static async _sendToWebhook(webhookUrl, alertData) {
    try {
      const { EmbedBuilder, WebhookClient } = require("discord.js");
      const webhookClient = new WebhookClient({ url: webhookUrl });

      const embed = new EmbedBuilder()
        .setTitle("🚨 Phishing Attempt Detected (Backup Alert)")
        .setColor(0xff0000)
        .setDescription(
          `**Confidence:** ${(alertData.confidence * 100).toFixed(1)}%\n**Reason:** ${alertData.reason}`
        )
        .addFields(
          {
            name: "👤 User",
            value: `${alertData.userTag || "Unknown"} (${alertData.userId || "N/A"})`,
            inline: true,
          },
          {
            name: "🏠 Server",
            value: alertData.guildName || "DM",
            inline: true,
          },
          {
            name: "📝 Content",
            value: (alertData.content || "N/A").substring(0, 500),
            inline: false,
          },
          {
            name: "🔢 Violations",
            value: `${alertData.violationCount || 0}`,
            inline: true,
          }
        )
        .setFooter({
          text: "Nexus Bot Anti-Phishing Protection (Backup System)",
        })
        .setTimestamp();

      await webhookClient.send({
        embeds: [embed],
        username: "Nexus Anti-Phishing Backup",
      });
    } catch (error) {
      // Fallback to HTTP
      try {
        const https = require("https");
        const url = new URL(webhookUrl);
        const payload = JSON.stringify({
          embeds: [
            {
              title: "🚨 Phishing Attempt Detected (Backup)",
              description: `**Reason:** ${alertData.reason}`,
              color: 0xff0000,
              fields: [
                {
                  name: "User",
                  value: `${alertData.userTag || "Unknown"}`,
                  inline: true,
                },
                {
                  name: "Server",
                  value: alertData.guildName || "DM",
                  inline: true,
                },
              ],
              timestamp: new Date().toISOString(),
            },
          ],
          username: "Nexus Anti-Phishing Backup",
        });

        const req = https.request({
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        });
        req.write(payload);
        req.end();
      } catch (fallbackError) {
        // Silent fail - backup system shouldn't break main functionality
      }
    }
  }
}

module.exports = AlertBackup;
