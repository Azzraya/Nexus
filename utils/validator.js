// Input validation utilities
class Validator {
  static validateGuildId(guildId) {
    if (!guildId || typeof guildId !== "string") {
      throw new Error("Invalid guild ID");
    }
    if (!/^\d{17,19}$/.test(guildId)) {
      throw new Error("Guild ID must be a valid Discord snowflake");
    }
    return true;
  }

  static validateUserId(userId) {
    if (!userId || typeof userId !== "string") {
      throw new Error("Invalid user ID");
    }
    if (!/^\d{17,19}$/.test(userId)) {
      throw new Error("User ID must be a valid Discord snowflake");
    }
    return true;
  }

  static validateChannelId(channelId) {
    if (!channelId || typeof channelId !== "string") {
      throw new Error("Invalid channel ID");
    }
    if (!/^\d{17,19}$/.test(channelId)) {
      throw new Error("Channel ID must be a valid Discord snowflake");
    }
    return true;
  }

  static validateReason(reason, maxLength = 512) {
    if (reason && reason.length > maxLength) {
      throw new Error(`Reason must be less than ${maxLength} characters`);
    }
    return true;
  }

  static validateTime(timeString) {
    if (!timeString || typeof timeString !== "string") {
      throw new Error("Invalid time string");
    }
    // Basic validation - can be enhanced with ms library
    return true;
  }

  static sanitizeInput(input) {
    if (typeof input !== "string") return input;
    // Remove null bytes and trim
    return input.replace(/\0/g, "").trim();
  }
}

module.exports = Validator;
