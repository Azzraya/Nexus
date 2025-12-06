const logger = require("./logger");

class ClusterHealthMonitor {
  constructor() {
    this.clusterHealth = new Map();
    this.healthCheckInterval = null;
    this.unhealthyThreshold = 3; // Number of failed checks before restart
    this.checkIntervalMs = 30000; // Check every 30 seconds

    this.thresholds = {
      maxResponseTime: 1000, // ms
      minGuilds: 0, // Minimum guilds per cluster (0 = no minimum)
    };
  }

  /**
   * Start monitoring cluster health
   * @param {ClusterManager} manager - Discord Hybrid Sharding ClusterManager
   */
  start(manager) {
    if (this.healthCheckInterval) {
      logger.warn("ClusterHealth", "Health monitor already running");
      return;
    }

    this.manager = manager;
    logger.info("ClusterHealth", "🏥 Starting cluster health monitoring");

    // Initialize health tracking for all clusters
    manager.clusters.forEach((cluster) => {
      this.clusterHealth.set(cluster.id, {
        failedChecks: 0,
        lastCheck: Date.now(),
        status: "healthy",
        metrics: {},
      });
    });

    // Start periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.checkAllClusters();
    }, this.checkIntervalMs);

    logger.success(
      "ClusterHealth",
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
      logger.info("ClusterHealth", "Health monitoring stopped");
    }
  }

  /**
   * Check health of all clusters
   */
  async checkAllClusters() {
    if (!this.manager) return;

    for (const [clusterId, cluster] of this.manager.clusters) {
      await this.checkCluster(clusterId, cluster);
    }
  }

  /**
   * Check health of a specific cluster
   * @param {number} clusterId - Cluster ID
   * @param {Cluster} cluster - Cluster object
   */
  async checkCluster(clusterId, cluster) {
    const health = this.clusterHealth.get(clusterId) || {
      failedChecks: 0,
      lastCheck: 0,
      status: "unknown",
      metrics: {},
    };

    try {
      // Get cluster metrics via eval
      const startTime = Date.now();
      const metrics = await cluster
        .eval(() => {
          if (this.readyAt) {
            return {
              guilds: this.guilds.cache.size,
              users: this.users.cache.size,
              uptime: Date.now() - this.readyTimestamp,
              status: this.ws.status,
            };
          }
          return null;
        })
        .catch(() => null);

      const responseTime = Date.now() - startTime;

      if (!metrics) {
        // Cluster didn't respond or not ready
        health.failedChecks++;
        health.status = "unresponsive";
        logger.warn(
          "ClusterHealth",
          `Cluster ${clusterId} unresponsive (${health.failedChecks}/${this.unhealthyThreshold})`
        );
      } else {
        // Check if metrics are within healthy thresholds
        const issues = [];

        if (responseTime > this.thresholds.maxResponseTime) {
          issues.push(`slow response: ${responseTime}ms`);
        }

        if (metrics.status !== 0) {
          // 0 = READY
          issues.push(`not ready: status ${metrics.status}`);
        }

        if (issues.length > 0) {
          health.failedChecks++;
          health.status = "degraded";
          logger.warn(
            "ClusterHealth",
            `Cluster ${clusterId} degraded: ${issues.join(", ")} (${health.failedChecks}/${this.unhealthyThreshold})`
          );
        } else {
          // Cluster is healthy
          health.failedChecks = 0;
          health.status = "healthy";
        }

        health.metrics = {
          ...metrics,
          responseTime,
        };
      }

      health.lastCheck = Date.now();
      this.clusterHealth.set(clusterId, health);

      // Check if cluster needs restart
      if (health.failedChecks >= this.unhealthyThreshold) {
        await this.restartUnhealthyCluster(clusterId, cluster, health);
      }
    } catch (error) {
      logger.error(
        "ClusterHealth",
        `Error checking cluster ${clusterId}:`,
        error.message
      );
    }
  }

  /**
   * Restart an unhealthy cluster
   * @param {number} clusterId - Cluster ID
   * @param {Cluster} cluster - Cluster object
   * @param {Object} health - Health data
   */
  async restartUnhealthyCluster(clusterId, cluster, health) {
    logger.error(
      "ClusterHealth",
      `🚨 Cluster ${clusterId} is unhealthy (status: ${health.status}, failed checks: ${health.failedChecks})`
    );

    try {
      // Alert owner
      try {
        if (process.env.OWNER_ID && process.env.DISCORD_TOKEN) {
          logger.error(
            "ClusterHealth",
            `Restarting unhealthy cluster ${clusterId} - metrics: ${JSON.stringify(health.metrics)}`
          );
        }
      } catch (alertErr) {
        logger.error("ClusterHealth", "Failed to alert owner", alertErr);
      }

      // Restart the cluster
      logger.info("ClusterHealth", `Restarting cluster ${clusterId}...`);

      // Kill and respawn cluster
      cluster.kill();
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5s
      this.manager.spawn({ timeout: -1 }).catch((err) => {
        logger.error(
          "ClusterHealth",
          `Failed to respawn cluster ${clusterId}:`,
          err
        );
      });

      // Reset health tracking
      this.clusterHealth.set(clusterId, {
        failedChecks: 0,
        lastCheck: Date.now(),
        status: "restarting",
        metrics: {},
      });

      logger.success(
        "ClusterHealth",
        `Cluster ${clusterId} restarted successfully`
      );
    } catch (error) {
      logger.error(
        "ClusterHealth",
        `Failed to restart cluster ${clusterId}:`,
        error.message
      );

      // Mark as failed
      health.status = "failed";
      health.failedChecks = 0; // Reset to prevent spam restarts
      this.clusterHealth.set(clusterId, health);
    }
  }

  /**
   * Get health status of all clusters
   * @returns {Object} - Health summary
   */
  getHealthSummary() {
    const summary = {
      totalClusters: this.clusterHealth.size,
      healthy: 0,
      degraded: 0,
      unresponsive: 0,
      failed: 0,
      clusters: [],
    };

    for (const [clusterId, health] of this.clusterHealth) {
      summary.clusters.push({
        id: clusterId,
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
   * Get health status for a specific cluster
   * @param {number} clusterId - Cluster ID
   * @returns {Object|null} - Health data
   */
  getClusterHealth(clusterId) {
    return this.clusterHealth.get(clusterId) || null;
  }
}

module.exports = new ClusterHealthMonitor();
