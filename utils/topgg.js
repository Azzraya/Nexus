const { AutoPoster } = require("topgg-autoposter");
const logger = require("./logger");

class TopGG {
  constructor(client, token) {
    this.client = client;
    this.token = token;
    this.poster = null;
    this.isSharded = client.shard !== null;
  }

  /**
   * Initialize Top.gg stats posting
   * Works with both regular clients and ShardingManager
   */
  initialize() {
    if (!this.token) {
      logger.warn("[Top.gg] No token provided, skipping Top.gg integration");
      return;
    }

    try {
      // AutoPoster works with both regular clients and ShardingManager
      this.poster = AutoPoster(this.token, this.client);

      this.poster.on("posted", (stats) => {
        logger.info(
          `[Top.gg] Posted stats: ${stats.serverCount} servers, ${stats.shardCount} shards`
        );
      });

      this.poster.on("error", (error) => {
        logger.error("[Top.gg] Error posting stats:", error);
      });

      logger.info("[Top.gg] Stats posting initialized");
    } catch (error) {
      logger.error("[Top.gg] Failed to initialize:", error);
    }
  }

  /**
   * Get bot info from Top.gg API
   */
  async getBotInfo(botId) {
    if (!this.token) {
      throw new Error("Top.gg token not configured");
    }

    try {
      const Topgg = require("@top-gg/sdk");
      const api = new Topgg.Api(this.token);
      return await api.getBot(botId);
    } catch (error) {
      logger.error("[Top.gg] Error fetching bot info:", error);
      throw error;
    }
  }

  /**
   * Check if a user has voted for the bot
   */
  async hasVoted(userId, botId) {
    if (!this.token) {
      return false;
    }

    try {
      const Topgg = require("@top-gg/sdk");
      const api = new Topgg.Api(this.token);
      return await api.hasVoted(userId, botId);
    } catch (error) {
      logger.error("[Top.gg] Error checking vote status:", error);
      return false;
    }
  }
}

module.exports = TopGG;
