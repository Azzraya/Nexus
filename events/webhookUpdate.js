const logger = require("../utils/logger");

module.exports = {
  name: "webhookUpdate",
  async execute(channel, client) {
    try {
      const guild = channel.guild;

      logger.info(
        "WebhookUpdate",
        `Webhook updated in channel: ${channel.name} (${channel.id})`
      );

      // Fetch current webhooks to see what changed
      const webhooks = await channel.fetchWebhooks();

      // Log to database
      const db = require("../utils/database");
      db.db.run(
        `INSERT INTO logs (guild_id, event_type, channel_id, timestamp, details)
         VALUES (?, ?, ?, ?, ?)`,
        [
          guild.id,
          "WEBHOOK_UPDATE",
          channel.id,
          Date.now(),
          JSON.stringify({
            channel_name: channel.name,
            channel_id: channel.id,
            webhook_count: webhooks.size,
          }),
        ]
      );

      // Check audit logs for who made the change
      try {
        const auditLogs = await guild.fetchAuditLogs({
          type: 51, // WEBHOOK_UPDATE
          limit: 1,
        });

        const updateLog = auditLogs.entries.first();
        if (updateLog && Date.now() - updateLog.createdTimestamp < 5000) {
          const executor = updateLog.executor;
          const targetWebhook = updateLog.target;

          logger.info(
            "WebhookUpdate",
            `Webhook updated by: ${executor.tag} (${executor.id}) - Webhook: ${targetWebhook.name}`
          );

          // Check for suspicious webhook activity (rapid changes)
          const recentWebhookUpdates = await new Promise((resolve) => {
            db.db.all(
              `SELECT COUNT(*) as count FROM logs 
               WHERE guild_id = ? AND event_type = ? AND timestamp > ?`,
              [guild.id, "WEBHOOK_UPDATE", Date.now() - 60000],
              (err, rows) => {
                if (err || !rows) resolve(0);
                else resolve(rows[0].count);
              }
            );
          });

          if (recentWebhookUpdates > 10) {
            logger.warn(
              "AntiNuke",
              `Suspicious webhook update activity detected: ${recentWebhookUpdates} updates in 1 minute`
            );
          }
        }
      } catch (auditError) {
        logger.debug(
          "WebhookUpdate",
          `Could not fetch audit logs: ${auditError.message}`
        );
      }
    } catch (error) {
      logger.error("WebhookUpdate", "Error handling webhook update", {
        message: error?.message || String(error),
        stack: error?.stack,
      });
    }
  },
};
