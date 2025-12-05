/**
 * Constants used throughout the bot
 * Centralized to avoid magic numbers and improve maintainability
 */

module.exports = {
  // Discord limits
  DISCORD: {
    EMBED_FIELD_VALUE_MAX: 1024,
    EMBED_FIELD_VALUE_SAFE: 990, // Safe limit accounting for codeBlock wrapping
    EMBED_DESCRIPTION_MAX: 4096,
    MESSAGE_MAX_LENGTH: 2000,
    EMBED_TITLE_MAX: 256,
    EMBED_FIELD_NAME_MAX: 256,
  },

  // Time constants (in milliseconds)
  TIME: {
    SECOND: 1000,
    MINUTE: 60000,
    HOUR: 3600000,
    DAY: 86400000,
    WEEK: 604800000,
  },

  // Anti-raid defaults
  ANTI_RAID: {
    DEFAULT_MAX_JOINS: 5,
    DEFAULT_TIME_WINDOW: 10000, // 10 seconds
    DEFAULT_ACTION: "ban",
  },

  // Heat system thresholds
  HEAT_THRESHOLDS: {
    WARN: 50,
    MUTE: 100,
    KICK: 150,
    BAN: 200,
  },

  // Timeout/mute limits
  MUTE: {
    MIN_DURATION: 1000, // 1 second
    MAX_DURATION: 2419200000, // 28 days in milliseconds
  },

  // Rate limiting
  RATE_LIMITS: {
    COMMAND_COOLDOWN: 3000, // 3 seconds default
    MESSAGE_RATE: 5, // messages per window
    MESSAGE_WINDOW: 5000, // 5 seconds
  },

  // Cache TTL (time to live)
  CACHE: {
    CONFIG_TTL: 300000, // 5 minutes
    USER_DATA_TTL: 600000, // 10 minutes
  },

  // Purge/Delete limits
  PURGE: {
    MIN_MESSAGES: 1,
    MAX_MESSAGES: 100,
  },

  // Join Gate defaults
  JOIN_GATE: {
    DEFAULT_ACCOUNT_AGE_DAYS: 7,
    DEFAULT_TIMEOUT_DURATION: 7 * 24 * 60 * 60 * 1000, // 7 days
  },

  // Database limits
  DATABASE: {
    QUERY_LIMIT_DEFAULT: 100,
    QUERY_LIMIT_MAX: 1000,
    QUERY_TIMEOUT: 5000,
  },

  // Pagination
  PAGINATION: {
    DEFAULT_ITEMS_PER_PAGE: 10,
    MAX_ITEMS_PER_PAGE: 25,
  },

  // Heat decay
  HEAT_DECAY: {
    ONE_HOUR: 3600000,
  },
};
