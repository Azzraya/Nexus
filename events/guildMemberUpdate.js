const logger = require("../utils/logger");

module.exports = {
  name: "guildMemberUpdate",
  async execute(oldMember, newMember, client) {
    try {
      // Check if user's timeout was removed (timeout ended)
      if (
        oldMember.communicationDisabledUntil &&
        !newMember.communicationDisabledUntil
      ) {
        // Timeout ended - check if user should have multiplier reset
        // (We'll reset multiplier after a grace period of good behavior)
        // For now, we keep the multiplier active to catch repeat offenders

        logger.debug(
          `[HeatSystem] Timeout ended for ${newMember.user.id} in ${newMember.guild.id}`
        );

        // Note: Multiplier persists until user behaves well or is manually reset
        // This ensures repeat offenders get escalating punishments
      }
    } catch (error) {
      logger.error("Error in guildMemberUpdate event:", error);
    }
  },
};
