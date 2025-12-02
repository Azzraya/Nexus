const axios = require("axios");
const logger = require("./logger");

class DiscordBots {
  constructor(client, token) {
    this.client = client;
    this.token = token;
    this.baseURL = "https://discord.bots.gg/api/v1";
  }

  /**
   * Post bot statistics to Discord Bots
   */
  async postStats() {
    if (!this.token || !this.client.user) {
      return false;
    }

    try {
      const guildCount = this.client.guilds.cache.size;
      const shardCount = this.client.shard ? this.client.shard.count : 0;

      await axios.post(
        `${this.baseURL}/bots/${this.client.user.id}/stats`,
        {
          guildCount,
          shardCount,
        },
        {
          headers: {
            Authorization: this.token,
            "Content-Type": "application/json",
          },
        }
      );

      logger.info(
        `[Discord Bots] Posted stats: ${guildCount} guilds${
          shardCount > 0 ? `, ${shardCount} shards` : ""
        }`
      );
      return true;
    } catch (error) {
      logger.error("[Discord Bots] Error posting stats:", error.message);
      return false;
    }
  }

  /**
   * Initialize automatic stats posting
   */
  initialize() {
    if (!this.token) {
      logger.warn("[Discord Bots] No token provided, skipping integration");
      return;
    }

    // Post immediately
    this.postStats();

    // Post every 30 minutes
    setInterval(() => {
      this.postStats();
    }, 30 * 60 * 1000);

    logger.info("[Discord Bots] Stats posting initialized");
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
          params: {
            userId: userId,
          },
        }
      );

      // Check if user is in the recent votes list
      if (response.data && response.data.votes) {
        const userVote = response.data.votes.find((v) => v.user === userId);
        if (userVote) {
          // Check if vote is within last 12 hours
          const voteTime = new Date(userVote.time).getTime();
          const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
          return voteTime > twelveHoursAgo;
        }
      }

      return false;
    } catch (error) {
      logger.error("[Discord Bots] Error checking vote status:", error.message);
      return false;
    }
  }

  /**
   * Get bot information
   */
  async getBotInfo() {
    if (!this.token || !this.client.user) {
      throw new Error("Discord Bots token not configured");
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
      logger.error("[Discord Bots] Error fetching bot info:", error.message);
      throw error;
    }
  }
}

module.exports = DiscordBots;

