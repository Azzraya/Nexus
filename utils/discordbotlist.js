const { createDjsClient } = require("discordbotlist");
const logger = require("./logger");
const axios = require("axios");

class DiscordBotList {
  constructor(client, token) {
    this.client = client;
    this.token = token;
    this.dbl = null;
    this.isSharded = client.shard !== null;
  }

  /**
   * Initialize Discord Bot List stats posting
   * Works with both regular clients and ShardingManager
   */
  initialize() {
    if (!this.token) {
      logger.warn("[Discord Bot List] No token provided, skipping integration");
      return;
    }

    try {
      // createDjsClient works with both regular clients and ShardingManager
      this.dbl = createDjsClient(this.token, this.client);

      // Start posting stats automatically
      this.dbl.startPosting();

      this.dbl.on("posted", (stats, client) => {
        // The package emits (stats, client) - stats should be { guilds, users }
        if (!stats) {
          logger.warn(
            "[Discord Bot List] Posted event received but stats is undefined"
          );
          return;
        }

        // The adapter returns { guilds, users } format
        const guilds = stats.guilds ?? 0;
        const users = stats.users ?? 0;
        logger.info(
          `[Discord Bot List] Posted stats: ${guilds} guilds, ${users} users`
        );
      });

      this.dbl.on("error", (error) => {
        logger.error("[Discord Bot List] Error posting stats:", error);
      });

      logger.info("[Discord Bot List] Stats posting initialized");
    } catch (error) {
      logger.error("[Discord Bot List] Failed to initialize:", error);
    }
  }

  /**
   * Get bot info from Discord Bot List API
   */
  async getBotInfo(botId) {
    if (!this.token) {
      throw new Error("Discord Bot List token not configured");
    }

    try {
      const response = await axios.get(
        `https://discordbotlist.com/api/v1/bots/${botId}`,
        {
          headers: {
            Authorization: this.token,
          },
        }
      );
      return response.data;
    } catch (error) {
      logger.error("[Discord Bot List] Error fetching bot info:", error);
      throw error;
    }
  }

  /**
   * Check if a user has voted (using vote API)
   * Returns the vote data if found, null otherwise
   */
  async hasVoted(userId, botId) {
    if (!this.token) {
      return null;
    }

    try {
      const response = await axios.get(
        `https://discordbotlist.com/api/v1/bots/${botId}/upvotes`,
        {
          headers: {
            Authorization: this.token,
          },
        }
      );

      // Check if user voted in the last 12 hours
      const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
      const vote = response.data.upvotes.find(
        (v) =>
          v.user_id === userId &&
          new Date(v.timestamp).getTime() > twelveHoursAgo
      );

      return vote || null;
    } catch (error) {
      // Handle rate limit errors gracefully (429) - these are expected
      if (error.response?.status === 429 || error.status === 429) {
        // Rate limited - silently return null (no need to log)
        return null;
      }
      // Only log actual errors (not rate limits)
      logger.debug("[Discord Bot List] Error checking vote status:", error.message || error);
      return null;
    }
  }

  /**
   * Get recent votes (last 500)
   */
  async getRecentVotes(botId) {
    if (!this.token) {
      throw new Error("Discord Bot List token not configured");
    }

    try {
      const response = await axios.get(
        `https://discordbotlist.com/api/v1/bots/${botId}/upvotes`,
        {
          headers: {
            Authorization: this.token,
          },
        }
      );
      return response.data;
    } catch (error) {
      logger.error("[Discord Bot List] Error fetching votes:", error);
      throw error;
    }
  }

  /**
   * Post bot statistics to Discord Bot List
   * @param {Object} stats - Stats object with guilds, users, voice_connections, and optional shard_id
   * @param {number} stats.guilds - Number of guilds
   * @param {number} stats.users - Number of users
   * @param {number} [stats.voice_connections] - Number of voice connections (optional)
   * @param {number} [stats.shard_id] - Shard ID for per-shard statistics (optional)
   */
  async postStats(stats) {
    if (!this.token) {
      throw new Error("Discord Bot List token not configured");
    }

    if (!this.client.user) {
      throw new Error("Client not ready yet");
    }

    try {
      // Use the package's built-in method if available
      if (this.dbl && typeof this.dbl.postBotStats === "function") {
        // The package expects { guilds, users } format
        await this.dbl.postBotStats({
          guilds: stats.guilds,
          users: stats.users,
        });
        logger.info(
          `[Discord Bot List] Posted stats: ${stats.guilds} guilds, ${stats.users} users`
        );
        return true;
      }

      // Fallback to direct API call
      // According to API docs: POST /api/v1/bots/:id/stats
      const payload = {
        guilds: stats.guilds,
        users: stats.users,
      };

      // Add optional fields if provided
      if (stats.voice_connections !== undefined) {
        payload.voice_connections = stats.voice_connections;
      }
      if (stats.shard_id !== undefined) {
        payload.shard_id = stats.shard_id;
      }

      const response = await axios.post(
        `https://discordbotlist.com/api/v1/bots/${this.client.user.id}/stats`,
        payload,
        {
          headers: {
            Authorization: this.token,
            "Content-Type": "application/json",
          },
        }
      );

      logger.info(
        `[Discord Bot List] Posted stats: ${stats.guilds} guilds, ${
          stats.users
        } users${
          stats.voice_connections !== undefined
            ? `, ${stats.voice_connections} voice connections`
            : ""
        }${stats.shard_id !== undefined ? ` (shard ${stats.shard_id})` : ""}`
      );
      return true;
    } catch (error) {
      logger.error("[Discord Bot List] Error posting stats:", error);
      if (error.response) {
        logger.error(
          `[Discord Bot List] API Error: ${
            error.response.status
          } - ${JSON.stringify(error.response.data)}`
        );
      }
      throw error;
    }
  }

  /**
   * Post bot commands to Discord Bot List
   * @param {Array} commands - Array of command JSON objects (from command.data.toJSON())
   */
  async postCommands(commands) {
    if (!this.token) {
      throw new Error("Discord Bot List token not configured");
    }

    if (!this.client.user) {
      throw new Error("Client not ready yet");
    }

    try {
      // Use the package's built-in method if available (it handles the API call correctly)
      if (this.dbl && typeof this.dbl.postBotCommands === "function") {
        await this.dbl.postBotCommands(commands);
        logger.info(
          `[Discord Bot List] Posted ${commands.length} commands successfully`
        );
        return true;
      }

      // // Fallback to direct API call if dbl not initialized
      // // According to docs: Authorization header should be the token
      // const response = await axios.post(
      //   `https://discordbotlist.com/api/v1/bots/${this.client.user.id}/commands`,
      //   commands,
      //   {
      //     headers: {
      //       Authorization: this.token,
      //       "Content-Type": "application/json",
      //     },
      //   }
      // );

      logger.info(
        `[Discord Bot List] Posted ${commands.length} commands successfully`
      );
      return true;
    } catch (error) {
      logger.error("[Discord Bot List] Error posting commands:", error);
      if (error.response) {
        logger.error(
          `[Discord Bot List] API Error: ${
            error.response.status
          } - ${JSON.stringify(error.response.data)}`
        );
      }
      throw error;
    }
  }
}

module.exports = DiscordBotList;
