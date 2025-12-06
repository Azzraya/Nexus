const logger = require("./logger");

class ClusterRollingRestart {
  constructor() {
    this.isRestarting = false;
    this.restartDelay = 15000; // 15 seconds between cluster restarts (longer than shards)
  }

  /**
   * Perform a rolling restart of all clusters
   * @param {ClusterManager} manager - Discord Hybrid Sharding ClusterManager
   * @param {Object} options - Restart options
   * @returns {Promise<void>}
   */
  async restart(manager, options = {}) {
    if (this.isRestarting) {
      logger.warn("ClusterRestart", "Rolling restart already in progress");
      return;
    }

    this.isRestarting = true;
    const delay = options.delay || this.restartDelay;
    const clusterOrder = options.clusterOrder || "sequential"; // sequential or reverse

    try {
      logger.info(
        "ClusterRestart",
        `🔄 Starting rolling restart of ${manager.clusters.size} clusters...`
      );

      const clusters = Array.from(manager.clusters.values());
      if (clusterOrder === "reverse") {
        clusters.reverse();
      }

      for (const cluster of clusters) {
        logger.info(
          "ClusterRestart",
          `Restarting cluster ${cluster.id}/${manager.clusters.size - 1}...`
        );

        try {
          // Kill cluster
          cluster.kill();

          // Wait before respawning
          await this.sleep(5000);

          // Respawn cluster
          await manager.spawn({ timeout: -1 });

          logger.success(
            "ClusterRestart",
            `✅ Cluster ${cluster.id} restarted successfully`
          );

          // Wait before restarting next cluster (except for last cluster)
          if (cluster.id < manager.clusters.size - 1) {
            logger.info(
              "ClusterRestart",
              `Waiting ${delay / 1000}s before next cluster...`
            );
            await this.sleep(delay);
          }
        } catch (error) {
          logger.error(
            "ClusterRestart",
            `Failed to restart cluster ${cluster.id}:`,
            error.message
          );
          // Continue with next cluster even if one fails
        }
      }

      logger.success(
        "ClusterRestart",
        `🎉 Rolling restart complete! All ${manager.clusters.size} clusters restarted.`
      );
    } catch (error) {
      logger.error("ClusterRestart", "Rolling restart failed:", error);
    } finally {
      this.isRestarting = false;
    }
  }

  /**
   * Restart a specific cluster
   * @param {ClusterManager} manager - ClusterManager instance
   * @param {number} clusterId - Cluster ID to restart
   * @returns {Promise<void>}
   */
  async restartCluster(manager, clusterId) {
    const cluster = manager.clusters.get(clusterId);
    if (!cluster) {
      throw new Error(`Cluster ${clusterId} not found`);
    }

    logger.info("ClusterRestart", `Restarting cluster ${clusterId}...`);

    cluster.kill();
    await this.sleep(5000);
    await manager.spawn({ timeout: -1 });

    logger.success("ClusterRestart", `✅ Cluster ${clusterId} restarted`);
  }

  /**
   * Restart clusters in batches (for large bot with many clusters)
   * @param {ClusterManager} manager - ClusterManager instance
   * @param {Object} options - Batch restart options
   * @returns {Promise<void>}
   */
  async batchRestart(manager, options = {}) {
    if (this.isRestarting) {
      logger.warn("ClusterRestart", "Rolling restart already in progress");
      return;
    }

    this.isRestarting = true;
    const batchSize = options.batchSize || 2; // Restart 2 clusters at a time
    const delay = options.delay || this.restartDelay;

    try {
      logger.info(
        "ClusterRestart",
        `🔄 Starting batch restart (${batchSize} clusters at a time)...`
      );

      const clusters = Array.from(manager.clusters.values());
      const batches = [];

      // Split clusters into batches
      for (let i = 0; i < clusters.length; i += batchSize) {
        batches.push(clusters.slice(i, i + batchSize));
      }

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        logger.info(
          "ClusterRestart",
          `Restarting batch ${batchIndex + 1}/${batches.length} (clusters: ${batch.map((c) => c.id).join(", ")})...`
        );

        // Kill all clusters in batch
        batch.forEach((cluster) => cluster.kill());
        await this.sleep(5000);

        // Respawn all clusters in batch
        await Promise.all(
          batch.map(() =>
            manager.spawn({ timeout: -1 }).catch((err) => {
              logger.error(
                "ClusterRestart",
                `Failed to respawn cluster:`,
                err.message
              );
            })
          )
        );

        logger.success(
          "ClusterRestart",
          `✅ Batch ${batchIndex + 1} completed`
        );

        // Wait before next batch (except for last batch)
        if (batchIndex < batches.length - 1) {
          logger.info(
            "ClusterRestart",
            `Waiting ${delay / 1000}s before next batch...`
          );
          await this.sleep(delay);
        }
      }

      logger.success(
        "ClusterRestart",
        `🎉 Batch restart complete! All ${manager.clusters.size} clusters restarted.`
      );
    } catch (error) {
      logger.error("ClusterRestart", "Batch restart failed:", error);
    } finally {
      this.isRestarting = false;
    }
  }

  /**
   * Check if rolling restart is in progress
   * @returns {boolean}
   */
  isInProgress() {
    return this.isRestarting;
  }

  /**
   * Sleep helper
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new ClusterRollingRestart();
