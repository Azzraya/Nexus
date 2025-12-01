const AdvancedAntiNuke = require("../utils/advancedAntiNuke");
const logger = require("../utils/logger");

module.exports = {
  name: "emojiCreate",
  async execute(emoji, client) {
    try {
      // Monitor emoji creation for anti-nuke
      if (emoji.guild && client.advancedAntiNuke) {
        await client.advancedAntiNuke.monitorAction(
          emoji.guild,
          "emojiCreate",
          "unknown", // Emoji creation doesn't provide user info
          {
            emojiId: emoji.id,
            emojiName: emoji.name,
            animated: emoji.animated,
          }
        );
      }

      logger.info(
        `Emoji created: ${emoji.name} (${emoji.id}) in ${
          emoji.guild?.name || "DM"
        }`,
        {
          emojiId: emoji.id,
          emojiName: emoji.name,
          animated: emoji.animated,
          guildId: emoji.guild?.id,
        }
      );
    } catch (error) {
      logger.error("Error in emojiCreate event:", error);
    }
  },
};
