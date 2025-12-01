const AdvancedAntiNuke = require("../utils/advancedAntiNuke");
const logger = require("../utils/logger");

module.exports = {
  name: "webhookDelete",
  async execute(webhook, client) {
    try {
      // Monitor webhook deletion for anti-nuke
      if (webhook.guild && client.advancedAntiNuke) {
        await client.advancedAntiNuke.monitorAction(
          webhook.guild,
          "webhookDelete",
          "unknown", // Webhook deletion doesn't provide user info
          {
            webhookId: webhook.id,
            webhookName: webhook.name,
            channelId: webhook.channelId,
          }
        );
      }

      logger.info(
        `Webhook deleted: ${webhook.name} (${webhook.id}) in ${
          webhook.guild?.name || "DM"
        }`,
        {
          webhookId: webhook.id,
          webhookName: webhook.name,
          channelId: webhook.channelId,
          guildId: webhook.guild?.id,
        }
      );
    } catch (error) {
      logger.error("Error in webhookDelete event:", error);
    }
  },
};
