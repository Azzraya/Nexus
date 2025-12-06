const logger = require("./logger");
const errorRecovery = require("./errorRecovery");
const memoryMonitor = require("./memoryMonitor");
const rateLimitHandler = require("./rateLimitHandler");
const performanceCache = require("./performanceCache");
const queryProfiler = require("./queryProfiler");
const cache = require("./cache");

/**
 * Comprehensive System Monitoring
 * Tracks performance, errors, health across all servers
 */
class SystemMonitor {
  constructor() {
    this.client = null;
    this.serverHealth = new Map(); // Per-server health tracking
    this.metrics = {
      commands: {
        total: 0,
        succeeded: 0,
        failed: 0,
        avgResponseTime: 0,
        totalResponseTime: 0,
      },
      events: {
        total: 0,
        failed: 0,
      },
      api: {
        requests: 0,
        errors: 0,
        avgLatency: 0,
        totalLatency: 0,
      },
    };
    this.startTime = Date.now();
  }

  setClient(client) {
    this.client = client;
  }

  /**
   * Track command execution
   */
  trackCommand(commandName, success, responseTime, error = null) {
    this.metrics.commands.total++;
    this.metrics.commands.totalResponseTime += responseTime;
    this.metrics.commands.avgResponseTime =
      this.metrics.commands.totalResponseTime / this.metrics.commands.total;

    if (success) {
      this.metrics.commands.succeeded++;
    } else {
      this.metrics.commands.failed++;
      logger.warn(
        "SystemMonitor",
        `Command failed: ${commandName} - ${error?.message}`
      );
    }
  }

  /**
   * Track event execution
   */
  trackEvent(eventName, success, error = null) {
    this.metrics.events.total++;

    if (!success) {
      this.metrics.events.failed++;
      logger.warn(
        "SystemMonitor",
        `Event failed: ${eventName} - ${error?.message}`
      );
    }
  }

  /**
   * Track API request
   */
  trackAPIRequest(success, latency, error = null) {
    this.metrics.api.requests++;
    this.metrics.api.totalLatency += latency;
    this.metrics.api.avgLatency =
      this.metrics.api.totalLatency / this.metrics.api.requests;

    if (!success) {
      this.metrics.api.errors++;
    }
  }

  /**
   * Update server health status
   */
  updateServerHealth(guildId, status) {
    this.serverHealth.set(guildId, {
      guildId,
      status, // "healthy", "degraded", "critical"
      lastCheck: Date.now(),
    });
  }

  /**
   * Get server health summary
   */
  getServerHealthSummary() {
    const summary = {
      healthy: 0,
      degraded: 0,
      critical: 0,
      total: this.serverHealth.size,
    };

    for (const health of this.serverHealth.values()) {
      summary[health.status]++;
    }

    return summary;
  }

  /**
   * Get comprehensive system statistics
   */
  getSystemStats() {
    const uptime = Date.now() - this.startTime;
    const uptimeHours = (uptime / 3600000).toFixed(2);

    return {
      uptime: {
        ms: uptime,
        hours: uptimeHours,
        formatted: this.formatUptime(uptime),
      },
      commands: {
        ...this.metrics.commands,
        successRate: this.calculateSuccessRate(
          this.metrics.commands.succeeded,
          this.metrics.commands.total
        ),
        avgResponseTime:
          this.metrics.commands.avgResponseTime.toFixed(2) + "ms",
      },
      events: {
        ...this.metrics.events,
        successRate: this.calculateSuccessRate(
          this.metrics.events.total - this.metrics.events.failed,
          this.metrics.events.total
        ),
      },
      api: {
        ...this.metrics.api,
        errorRate: this.calculateErrorRate(
          this.metrics.api.errors,
          this.metrics.api.requests
        ),
        avgLatency: this.metrics.api.avgLatency.toFixed(2) + "ms",
      },
      memory: memoryMonitor.getStats(),
      cache: {
        performance: performanceCache.getStats(),
        simple: cache.getStats(),
      },
      errors: errorRecovery.getStats(),
      rateLimits: rateLimitHandler.getStats(),
      queries: queryProfiler.getStats(),
      serverHealth: this.getServerHealthSummary(),
    };
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const stats = this.getSystemStats();
    let status = "healthy";
    const issues = [];

    // Check command success rate
    const cmdSuccessRate = parseFloat(stats.commands.successRate);
    if (cmdSuccessRate < 95) {
      status = "degraded";
      issues.push(`Low command success rate: ${cmdSuccessRate}%`);
    }
    if (cmdSuccessRate < 80) {
      status = "critical";
    }

    // Check error count
    if (stats.errors.totalErrors > 100) {
      status = status === "healthy" ? "degraded" : status;
      issues.push(`High error count: ${stats.errors.totalErrors}`);
    }

    // Check memory
    if (stats.memory && stats.memory.current) {
      const memUsage = parseFloat(stats.memory.current.usagePercent);
      if (memUsage > 80) {
        status = "degraded";
        issues.push(`High memory usage: ${memUsage}%`);
      }
      if (memUsage > 90) {
        status = "critical";
      }
    }

    // Check rate limits
    const rateLimitRate = parseFloat(
      stats.rateLimits.rateLimitHitRate?.replace("%", "") || "0"
    );
    if (rateLimitRate > 5) {
      status = status === "healthy" ? "degraded" : status;
      issues.push(`High rate limit hit rate: ${rateLimitRate}%`);
    }

    return {
      status,
      issues,
      timestamp: Date.now(),
    };
  }

  /**
   * Calculate success rate
   */
  calculateSuccessRate(succeeded, total) {
    if (total === 0) return "100.00%";
    return ((succeeded / total) * 100).toFixed(2) + "%";
  }

  /**
   * Calculate error rate
   */
  calculateErrorRate(errors, total) {
    if (total === 0) return "0.00%";
    return ((errors / total) * 100).toFixed(2) + "%";
  }

  /**
   * Format uptime
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Generate health report
   */
  generateHealthReport() {
    const health = this.getHealthStatus();
    const stats = this.getSystemStats();

    const report = {
      status: health.status,
      timestamp: new Date().toISOString(),
      uptime: stats.uptime.formatted,
      metrics: {
        commands: `${stats.commands.total} total, ${stats.commands.successRate} success`,
        memory: stats.memory?.current?.usagePercent || "N/A",
        errors: `${stats.errors.totalErrors} total, ${stats.errors.criticalErrors} critical`,
        cache: `${stats.cache.performance.hitRate} hit rate`,
      },
      issues: health.issues,
    };

    return report;
  }

  /**
   * Reset metrics (for testing)
   */
  reset() {
    this.metrics = {
      commands: {
        total: 0,
        succeeded: 0,
        failed: 0,
        avgResponseTime: 0,
        totalResponseTime: 0,
      },
      events: {
        total: 0,
        failed: 0,
      },
      api: {
        requests: 0,
        errors: 0,
        avgLatency: 0,
        totalLatency: 0,
      },
    };
    this.startTime = Date.now();
    logger.info("SystemMonitor", "Metrics reset");
  }
}

module.exports = new SystemMonitor();
