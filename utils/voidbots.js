const axios = require("axios");
const logger = require("./logger");

class VoidBots {
  constructor(client, token) {
    this.client = client;
    this.token = token;
    this.baseURL = "https://api.voidbots.net";
    this.lastPostTime = 0; // Track last post time for rate limiting
    this.minPostInterval = 3 * 60 * 1000; // 3 minutes minimum (180000ms)
    this.initialized = false; // Prevent multiple initializations
    this.postInterval = null; // Store interval reference
  }

  /**
   * Post bot statistics to Void Bots
   */
  async postStats() {
    if (!this.token || !this.client.user) {
      return false;
    }

    // Rate limit check - Void Bots requires 3 minutes between posts
    const now = Date.now();
    const timeSinceLastPost = now - this.lastPostTime;

    if (timeSinceLastPost < this.minPostInterval && this.lastPostTime > 0) {
      const waitTime = Math.ceil(
        (this.minPostInterval - timeSinceLastPost) / 1000
      );
      logger.debug(
        `[Void Bots] Rate limited, skipping post (wait ${waitTime}s)`
      );
      return false;
    }

    try {
      const serverCount = this.client.guilds.cache.size;
      const shardCount = this.client.shard ? this.client.shard.count : 1;

      await axios.post(
        `${this.baseURL}/bot/stats/${this.client.user.id}`,
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

      this.lastPostTime = Date.now(); // Update last post time on success
      logger.info(
        `[Void Bots] Posted stats: ${serverCount} servers, ${shardCount} shards`
      );
      return true;
    } catch (error) {
      // If we get 429, update last post time to prevent spam
      if (error.response?.status === 429) {
        // Check if API provides retry-after header (in seconds)
        const retryAfter =
          error.response?.headers?.["retry-after"] ||
          error.response?.headers?.["Retry-After"];
        const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : 180; // Default to 3 minutes
        const retryMinutes = Math.ceil(retrySeconds / 60);

        // Update last post time to respect the retry-after period
        this.lastPostTime = Date.now();

        // Only log at debug level to reduce noise - rate limiting is expected behavior
        logger.debug(
          `[Void Bots] Rate limited - will retry in ${retryMinutes} minute(s) (${retrySeconds}s)`
        );
      } else {
        logger.error("[Void Bots] Error posting stats:", {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
          url: `${this.baseURL}/bot/stats/${this.client.user.id}`,
        });
      }
      return false;
    }
  }

  /**
   * Initialize automatic stats posting
   */
  initialize() {
    if (this.initialized) {
      logger.warn("[Void Bots] Already initialized, skipping duplicate initialization");
      return;
    }

    if (!this.token) {
      logger.warn("[Void Bots] No token provided, skipping integration");
      return;
    }

    this.initialized = true;

    // Don't post immediately - wait 3 minutes to respect rate limit
    // This prevents double-posting on startup
    setTimeout(() => {
      this.postStats();
    }, this.minPostInterval);

    // Post every 30 minutes (well above the 3-minute minimum)
    this.postInterval = setInterval(() => {
      this.postStats();
    }, 30 * 60 * 1000);

    logger.info(
      "[Void Bots] Stats posting initialized (first post in 3 minutes)"
    );
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
        `${this.baseURL}/bot/voted/${this.client.user.id}/${userId}`,
        {
          headers: {
            Authorization: this.token,
          },
        }
      );

      return response.data.voted === true;
    } catch (error) {
      logger.error(
        "[Void Bots] Error checking vote status:",
        error.message || error
      );
      if (error.response) {
        logger.error(
          "[Void Bots] API Response:",
          error.response.status,
          error.response.data
        );
      }
      return false;
    }
  }

  /**
   * Get bot information
   */
  async getBotInfo() {
    if (!this.token || !this.client.user) {
      throw new Error("Void Bots token not configured");
    }

    try {
      const response = await axios.get(
        `${this.baseURL}/bot/info/${this.client.user.id}`,
        {
          headers: {
            Authorization: this.token,
          },
        }
      );

      return response.data;
    } catch (error) {
      logger.error(
        "[Void Bots] Error fetching bot info:",
        error.message || error
      );
      if (error.response) {
        logger.error(
          "[Void Bots] API Response:",
          error.response.status,
          error.response.data
        );
      }
      throw error;
    }
  }
}

module.exports = VoidBots;
