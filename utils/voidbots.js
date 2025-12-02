const VoidBotsClient = require("voidbots");
const logger = require("./logger");

class VoidBots {
  constructor(client, token) {
    this.client = client;
    this.token = token;
    this.voidbots = null;
    this.isSharded = client.shard !== null;
  }

  /**
   * Initialize VoidBots stats posting
   * Works with both regular clients and ShardingManager
   */
  initialize() {
    if (!this.token) {
      logger.warn("[VoidBots] No token provided, skipping VoidBots integration");
      return;
    }

    try {
      // VoidBotsClient works with both regular clients and ShardingManager
      // autoPost: true enables automatic stats posting
      // statsInterval: 900000 (15 minutes) - Package requires minimum 15 minutes
      // Note: API allows posting every 3 minutes, but package enforces 15 minute minimum
      // webhookEnabled: false since we're not using webhooks
      this.voidbots = new VoidBotsClient(this.token, {
        autoPost: true,
        statsInterval: 900000, // 15 minutes (900000ms) - package minimum requirement
        webhookEnabled: false,
      }, this.client);

      this.voidbots.on("posted", () => {
        logger.info("[VoidBots] Server count posted successfully");
      });

      this.voidbots.on("error", (error) => {
        logger.error("[VoidBots] Error:", error);
      });

      // Note: 'voted' event is only available when webhookEnabled is true
      // Since we're not using webhooks, we'll check votes via API instead

      logger.info("[VoidBots] Stats posting initialized");
    } catch (error) {
      logger.error("[VoidBots] Failed to initialize:", error);
    }
  }

  /**
   * Post bot statistics manually
   * @param {number} serverCount - Number of servers
   * @param {number} shardCount - Number of shards (optional)
   */
  async postStats(serverCount, shardCount = 0) {
    if (!this.token) {
      throw new Error("VoidBots token not configured");
    }

    try {
      // Use the package's method if available
      if (this.voidbots && typeof this.voidbots.postStats === "function") {
        await this.voidbots.postStats(serverCount, shardCount);
        logger.info(
          `[VoidBots] Posted stats: ${serverCount} servers, ${shardCount} shards`
        );
        return true;
      }

      // Fallback to direct API call if package not initialized
      const axios = require("axios");
      const botId = this.client.user?.id || this.client.userId;
      
      if (!botId) {
        throw new Error("Bot ID not available");
      }

      await axios.post(
        `https://api.voidbots.net/bot/stats/${botId}`,
        {
          server_count: serverCount,
          shard_count: shardCount,
        },
        {
          headers: {
            Authorization: this.token,
            "Content-Type": "application/json",
          },
        }
      );

      logger.info(
        `[VoidBots] Posted stats: ${serverCount} servers, ${shardCount} shards`
      );
      return true;
    } catch (error) {
      logger.error("[VoidBots] Error posting stats:", error);
      throw error;
    }
  }

  /**
   * Check if a user has voted for the bot
   * @param {string} userId - User ID to check
   * @returns {Promise<boolean>} - True if user has voted, false otherwise
   */
  async hasVoted(userId) {
    if (!this.token) {
      return false;
    }

    try {
      // Use direct API call instead of package method (package has a bug with GET requests)
      const axios = require("axios");
      const botId = this.client.user?.id || this.client.userId;
      
      if (!botId) {
        return false;
      }

      const response = await axios.get(
        `https://api.voidbots.net/bot/voted/${botId}/${userId}`,
        {
          headers: {
            Authorization: this.token,
          },
        }
      );

      // Parse the response
      const data = typeof response.data === "string" 
        ? JSON.parse(response.data) 
        : response.data;
      
      return data.voted === true || data.voted === "true";
    } catch (error) {
      logger.error("[VoidBots] Error checking vote status:", error);
      return false;
    }
  }

  /**
   * Get bot info from VoidBots API
   * @param {string} botId - Bot ID to get info for (optional, defaults to client's bot ID)
   * @returns {Promise<Object|null>} - Bot info object or null on error
   */
  async getBotInfo(botId = null) {
    if (!this.token) {
      throw new Error("VoidBots token not configured");
    }

    try {
      const targetBotId = botId || this.client.user?.id || this.client.userId;
      
      if (!targetBotId) {
        throw new Error("Bot ID not available");
      }

      // Use the package's method if available
      if (this.voidbots && typeof this.voidbots.getBot === "function") {
        const botInfo = await this.voidbots.getBot(targetBotId);
        return botInfo;
      }

      // Fallback to direct API call
      const axios = require("axios");
      const response = await axios.get(
        `https://api.voidbots.net/bot/info/${targetBotId}`,
        {
          headers: {
            Authorization: this.token,
          },
        }
      );

      return response.data;
    } catch (error) {
      logger.error("[VoidBots] Error fetching bot info:", error);
      if (error.response) {
        logger.error(
          `[VoidBots] API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        );
      }
      return null;
    }
  }
}

module.exports = VoidBots;

