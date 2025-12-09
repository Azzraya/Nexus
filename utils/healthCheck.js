/**
 * Health Check System
 * For UptimeRobot and monitoring services
 * EXCEEDS WICK - Comprehensive health monitoring
 */

const logger = require("./logger");
const fs = require("fs").promises;
const path = require("path");

class HealthCheck {
  constructor(client) {
    this.client = client;
    this.checks = [];
    this.lastCheck = null;
    this.checkInterval = null;
  }

  init() {
    // Run health checks every 30 seconds
    this.checkInterval = setInterval(() => {
      this.runHealthChecks();
    }, 30000);

    logger.success("HealthCheck", "Health check system initialized");
  }

  async runHealthChecks() {
    const checks = {
      timestamp: new Date().toISOString(),
      status: "healthy",
      checks: {},
    };

    try {
      // 1. Bot connectivity
      checks.checks.bot_connected = {
        status: this.client?.isReady() ? "pass" : "fail",
        details: {
          ready: this.client?.isReady() || false,
          uptime: this.client?.uptime
            ? Math.floor(this.client.uptime / 1000)
            : 0,
        },
      };

      // 2. Discord WebSocket
      const ping = this.client?.ws?.ping || -1;
      checks.checks.websocket = {
        status: ping > 0 && ping < 500 ? "pass" : "warn",
        details: {
          ping: `${ping}ms`,
          healthy: ping > 0 && ping < 500,
        },
      };

      // 3. Database connectivity
      try {
        const db = require("./database");
        const start = Date.now();
        await new Promise((resolve, reject) => {
          db.db.get("SELECT 1", (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        const duration = Date.now() - start;

        checks.checks.database = {
          status: duration < 100 ? "pass" : "warn",
          details: {
            connected: true,
            query_time: `${duration}ms`,
          },
        };
      } catch (error) {
        checks.checks.database = {
          status: "fail",
          details: {
            connected: false,
            error: error.message,
          },
        };
        checks.status = "degraded";
      }

      // 4. Redis cache (optional)
      try {
        const redisCache = require("./redisCache");
        if (redisCache.enabled) {
          const start = Date.now();
          await redisCache.set("health_check", Date.now(), 10);
          const duration = Date.now() - start;

          checks.checks.redis = {
            status: duration < 50 ? "pass" : "warn",
            details: {
              connected: true,
              latency: `${duration}ms`,
            },
          };
        } else {
          checks.checks.redis = {
            status: "skip",
            details: {
              enabled: false,
              fallback: "in-memory cache active",
            },
          };
        }
      } catch (error) {
        checks.checks.redis = {
          status: "warn",
          details: {
            connected: false,
            error: error.message,
            fallback: "using in-memory cache",
          },
        };
      }

      // 5. Memory usage
      const mem = process.memoryUsage();
      const heapUsedMB = mem.heapUsed / 1024 / 1024;
      const heapTotalMB = mem.heapTotal / 1024 / 1024;
      const usagePercent = (heapUsedMB / heapTotalMB) * 100;

      checks.checks.memory = {
        status: usagePercent < 85 ? "pass" : "warn",
        details: {
          used_mb: heapUsedMB.toFixed(2),
          total_mb: heapTotalMB.toFixed(2),
          usage_percent: `${usagePercent.toFixed(1)}%`,
        },
      };

      // 6. Disk space (database)
      try {
        const dbPath = path.join(__dirname, "..", "data", "nexus.db");
        const stats = await fs.stat(dbPath);
        const sizeMB = stats.size / 1024 / 1024;

        checks.checks.disk = {
          status: sizeMB < 1000 ? "pass" : "warn",
          details: {
            database_size_mb: sizeMB.toFixed(2),
          },
        };
      } catch (error) {
        checks.checks.disk = {
          status: "warn",
          details: {
            error: error.message,
          },
        };
      }

      // 7. Guild count (sanity check)
      const guildCount = this.client?.guilds?.cache?.size || 0;
      checks.checks.guilds = {
        status: guildCount > 0 ? "pass" : "warn",
        details: {
          count: guildCount,
        },
      };

      // Determine overall status
      const hasFailures = Object.values(checks.checks).some(
        (c) => c.status === "fail"
      );
      const hasWarnings = Object.values(checks.checks).some(
        (c) => c.status === "warn"
      );

      if (hasFailures) {
        checks.status = "unhealthy";
      } else if (hasWarnings) {
        checks.status = "degraded";
      }

      this.lastCheck = checks;
      this.checks.push(checks);

      // Keep only last 100 checks
      if (this.checks.length > 100) {
        this.checks.shift();
      }

      // Log if unhealthy
      if (checks.status !== "healthy") {
        logger.warn(
          "HealthCheck",
          `System health: ${checks.status.toUpperCase()}`
        );
      }
    } catch (error) {
      logger.error("HealthCheck", `Health check failed: ${error.message}`);
      checks.status = "error";
      checks.error = error.message;
    }

    return checks;
  }

  /**
   * Get simple health status (for UptimeRobot)
   */
  getSimpleHealth() {
    if (!this.lastCheck) {
      return { status: "unknown", message: "No health checks run yet" };
    }

    return {
      status: this.lastCheck.status,
      timestamp: this.lastCheck.timestamp,
      uptime: this.client?.uptime ? Math.floor(this.client.uptime / 1000) : 0,
    };
  }

  /**
   * Get detailed health report
   */
  getDetailedHealth() {
    return this.lastCheck || { status: "unknown" };
  }

  /**
   * Get health history
   */
  getHistory(limit = 20) {
    return this.checks.slice(-limit);
  }

  /**
   * Express endpoint for health checks
   */
  expressEndpoint() {
    return async (req, res) => {
      const health = await this.runHealthChecks();

      const statusCode =
        health.status === "healthy"
          ? 200
          : health.status === "degraded"
            ? 200
            : 503;

      res.status(statusCode).json(health);
    };
  }

  /**
   * Simple ping endpoint (for basic monitoring)
   */
  pingEndpoint() {
    return (req, res) => {
      res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: this.client?.uptime ? Math.floor(this.client.uptime / 1000) : 0,
      });
    };
  }

  shutdown() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}

module.exports = HealthCheck;
