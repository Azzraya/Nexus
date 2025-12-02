const axios = require("axios");
const logger = require("./logger");

class BotsOnDiscord {
  constructor(client, token) {
    this.client = client;
    this.token = token;
    this.baseURL = "https://bots.ondiscord.xyz/bot-api";
  }

  /**
   * Post bot statistics to Bots on Discord
   */
  async postStats() {
    if (!this.token || !this.client.user) {
      return false;
    }

    try {
      const guildCount = this.client.guilds.cache.size;

      await axios.post(
        `${this.baseURL}/bots/${this.client.user.id}/guilds`,
        {
          guildCount,
        },
        {
          headers: {
            Authorization: this.token,
            "Content-Type": "application/json",
          },
        }
      );

      logger.info(`[Bots on Discord] Posted stats: ${guildCount} guilds`);
      return true;
    } catch (error) {
      logger.error(
        "[Bots on Discord] Error posting stats:",
        error.message
      );
      return false;
    }
  }

  /**
   * Initialize automatic stats posting
   */
  initialize() {
    if (!this.token) {
      logger.warn(
        "[Bots on Discord] No token provided, skipping integration"
      );
      return;
    }

    // Post immediately
    this.postStats();

    // Post every 30 minutes
    setInterval(() => {
      this.postStats();
    }, 30 * 60 * 1000);

    logger.info("[Bots on Discord] Stats posting initialized");
  }

  /**
   * Check if a user has voted
   */
  async hasVoted(userId) {
    if (!this.token || !this.client.user) {
      return false;
    }

    try {
      const response = await axios.get(
        `${this.baseURL}/bots/${this.client.user.id}/votes`,
        {
          headers: {
            Authorization: this.token,
          },
        }
      );

      // Check if user voted recently (within 12 hours)
      if (response.data && response.data.hasVoted) {
        return response.data.hasVoted.includes(userId);
      }

      return false;
    } catch (error) {
      logger.error(
        "[Bots on Discord] Error checking vote status:",
        error.message
      );
      return false;
    }
  }

  /**
   * Get bot information
   */
  async getBotInfo() {
    if (!this.token || !this.client.user) {
      throw new Error("Bots on Discord token not configured");
    }

    try {
      const response = await axios.get(
        `${this.baseURL}/bots/${this.client.user.id}`,
        {
          headers: {
            Authorization: this.token,
          },
        }
      );

      return response.data;
    } catch (error) {
      logger.error(
        "[Bots on Discord] Error fetching bot info:",
        error.message
      );
      throw error;
    }
  }
}

module.exports = BotsOnDiscord;

