const logger = require("./logger");

class ShardHealthMonitor {
  constructor() {
    this.shardHealth = new Map();
    this.healthCheckInterval = null;
    this.unhealthyThreshold = 3; // Number of failed checks before restart
    this.checkIntervalMs = 30000; // Check every 30 seconds

    this.thresholds = {
      maxPing: 500, // ms
      maxMemory: 512, // MB
      minGuilds: 0, // Minimum guilds per shard (0 = no minimum)
    };
  }

  /**
   * Start monitoring shard health
   * @param {ShardingManager} manager - Discord.js ShardingManager
   */
  start(manager) {
    if (this.healthCheckInterval) {
      logger.warn("ShardHealth", "Health monitor already running");
      return;
    }

    this.manager = manager;
    logger.info("ShardHealth", "🏥 Starting shard health monitoring");

    // Initialize health tracking for all shards
    manager.shards.forEach((shard) => {
      this.shardHealth.set(shard.id, {
        failedChecks: 0,
        lastCheck: Date.now(),
        status: "healthy",
        metrics: {},
      });
    });

    // Start periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.checkAllShards();
    }, this.checkIntervalMs);

    logger.success(
      "ShardHealth",
      `Health checks running every ${this.checkIntervalMs / 1000}s`
    );
  }

  /**
   * Stop health monitoring
   */
  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info("ShardHealth", "Health monitoring stopped");
    }
  }

  /**
   * Check health of all shards
   */
  async checkAllShards() {
    if (!this.manager) return;

    for (const [shardId, shard] of this.manager.shards) {
      await this.checkShard(shardId, shard);
    }
  }

  /**
   * Check health of a specific shard
   * @param {number} shardId - Shard ID
   * @param {Shard} shard - Discord.js Shard object
   */
  async checkShard(shardId, shard) {
    const health = this.shardHealth.get(shardId) || {
      failedChecks: 0,
      lastCheck: 0,
      status: "unknown",
      metrics: {},
    };

    try {
      // Get shard metrics
      const metrics = await shard
        .eval(() => {
          return {
            ping: this.ws.ping,
            guilds: this.guilds.cache.size,
            users: this.users.cache.size,
            status: this.ws.status,
            memory: process.memoryUsage().heapUsed / 1024 / 1024, // MB
            uptime: process.uptime(),
          };
        })
        .catch(() => null);

      if (!metrics) {
        // Shard didn't respond
        health.failedChecks++;
        health.status = "unresponsive";
        logger.warn(
          "ShardHealth",
          `Shard ${shardId} unresponsive (${health.failedChecks}/${this.unhealthyThreshold})`
        );
      } else {
        // Check if metrics are within healthy thresholds
        const issues = [];

        if (metrics.ping > this.thresholds.maxPing) {
          issues.push(`high ping: ${metrics.ping}ms`);
        }

        if (metrics.memory > this.thresholds.maxMemory) {
          issues.push(`high memory: ${metrics.memory.toFixed(0)}MB`);
        }

        if (metrics.status !== 0) {
          // 0 = READY
          issues.push(`not ready: status ${metrics.status}`);
        }

        if (issues.length > 0) {
          health.failedChecks++;
          health.status = "degraded";
          logger.warn(
            "ShardHealth",
            `Shard ${shardId} degraded: ${issues.join(", ")} (${health.failedChecks}/${this.unhealthyThreshold})`
          );
        } else {
          // Shard is healthy
          health.failedChecks = 0;
          health.status = "healthy";
        }

        health.metrics = metrics;
      }

      health.lastCheck = Date.now();
      this.shardHealth.set(shardId, health);

      // Check if shard needs restart
      if (health.failedChecks >= this.unhealthyThreshold) {
        await this.restartUnhealthyShard(shardId, shard, health);
      }
    } catch (error) {
      logger.error(
        "ShardHealth",
        `Error checking shard ${shardId}:`,
        error.message
      );
    }
  }

  /**
   * Restart an unhealthy shard
   * @param {number} shardId - Shard ID
   * @param {Shard} shard - Discord.js Shard object
   * @param {Object} health - Health data
   */
  async restartUnhealthyShard(shardId, shard, health) {
    logger.error(
      "ShardHealth",
      `🚨 Shard ${shardId} is unhealthy (status: ${health.status}, failed checks: ${health.failedChecks})`
    );

    try {
      // Alert owner
      try {
        if (process.env.OWNER_ID && process.env.DISCORD_TOKEN) {
          // Can't easily get client here, so we'll log it
          // The errorRecovery system will handle DM alerts
          logger.error(
            "ShardHealth",
            `Restarting unhealthy shard ${shardId} - metrics: ${JSON.stringify(health.metrics)}`
          );
        }
      } catch (alertErr) {
        logger.error("ShardHealth", "Failed to alert owner", alertErr);
      }

      // Respawn the shard
      logger.info("ShardHealth", `Respawning shard ${shardId}...`);
      await shard.respawn({
        delay: 5000, // Wait 5 seconds before respawning
        timeout: 30000, // 30 second timeout
      });

      // Reset health tracking
      this.shardHealth.set(shardId, {
        failedChecks: 0,
        lastCheck: Date.now(),
        status: "restarting",
        metrics: {},
      });

      logger.success("ShardHealth", `Shard ${shardId} respawned successfully`);
    } catch (error) {
      logger.error(
        "ShardHealth",
        `Failed to respawn shard ${shardId}:`,
        error.message
      );

      // Mark as failed
      health.status = "failed";
      health.failedChecks = 0; // Reset to prevent spam restarts
      this.shardHealth.set(shardId, health);
    }
  }

  /**
   * Get health status of all shards
   * @returns {Object} - Health summary
   */
  getHealthSummary() {
    const summary = {
      totalShards: this.shardHealth.size,
      healthy: 0,
      degraded: 0,
      unresponsive: 0,
      failed: 0,
      shards: [],
    };

    for (const [shardId, health] of this.shardHealth) {
      summary.shards.push({
        id: shardId,
        status: health.status,
        failedChecks: health.failedChecks,
        lastCheck: health.lastCheck,
        metrics: health.metrics,
      });

      // Count by status
      if (health.status === "healthy") summary.healthy++;
      else if (health.status === "degraded") summary.degraded++;
      else if (health.status === "unresponsive") summary.unresponsive++;
      else if (health.status === "failed") summary.failed++;
    }

    return summary;
  }

  /**
   * Get health status for a specific shard
   * @param {number} shardId - Shard ID
   * @returns {Object|null} - Health data
   */
  getShardHealth(shardId) {
    return this.shardHealth.get(shardId) || null;
  }
}

module.exports = new ShardHealthMonitor();
