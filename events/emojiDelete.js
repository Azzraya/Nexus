const AdvancedAntiNuke = require("../utils/advancedAntiNuke");
const logger = require("../utils/logger");

module.exports = {
  name: "emojiDelete",
  async execute(emoji, client) {
    try {
      // Monitor emoji deletion for anti-nuke
      if (emoji.guild && client.advancedAntiNuke) {
        await client.advancedAntiNuke.monitorAction(
          emoji.guild,
          "emojiDelete",
          "unknown", // Emoji deletion doesn't provide user info
          {
            emojiId: emoji.id,
            emojiName: emoji.name,
            animated: emoji.animated,
          }
        );
      }

      logger.info(`Emoji deleted: ${emoji.name} (${emoji.id}) in ${emoji.guild?.name || "DM"}`, {
        emojiId: emoji.id,
        emojiName: emoji.name,
        animated: emoji.animated,
        guildId: emoji.guild?.id,
      });
    } catch (error) {
      logger.error("Error in emojiDelete event:", error);
    }
  },
};

