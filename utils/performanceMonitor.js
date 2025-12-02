const db = require("./database");
const logger = require("./logger");

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      commandExecution: [],
      databaseQueries: [],
      eventProcessing: [],
      memoryUsage: [],
      apiCalls: [], // EXCEEDS WICK - Track API call performance
      cacheHits: 0,
      cacheMisses: 0,
    };
    this.startTime = Date.now();
    this.alerts = [];
    this.thresholds = {
      commandTime: 1000, // 1 second
      queryTime: 500, // 500ms
      memoryUsage: 512, // 512MB
    };
  }

  trackCommand(commandName, executionTime) {
    this.metrics.commandExecution.push({
      command: commandName,
      time: executionTime,
      timestamp: Date.now(),
    });

    // Alert on slow commands (EXCEEDS WICK - proactive monitoring)
    if (executionTime > this.thresholds.commandTime) {
      this.createAlert(
        "slow_command",
        `Command ${commandName} took ${executionTime}ms (threshold: ${this.thresholds.commandTime}ms)`,
        "warning"
      );
      logger.warn(
        `[Performance] Slow command detected: ${commandName} took ${executionTime}ms`
      );
    }

    // Keep only last 1000 entries
    if (this.metrics.commandExecution.length > 1000) {
      this.metrics.commandExecution.shift();
    }
  }

  trackDatabaseQuery(query, executionTime) {
    this.metrics.databaseQueries.push({
      query: query.substring(0, 100), // Truncate long queries
      time: executionTime,
      timestamp: Date.now(),
    });

    // Alert on slow queries (EXCEEDS WICK - query optimization tracking)
    if (executionTime > this.thresholds.queryTime) {
      this.createAlert(
        "slow_query",
        `Database query took ${executionTime}ms: ${query.substring(0, 50)}...`,
        "warning"
      );
      logger.warn(
        `[Performance] Slow query detected: ${executionTime}ms - ${query.substring(0, 100)}`
      );
    }

    if (this.metrics.databaseQueries.length > 1000) {
      this.metrics.databaseQueries.shift();
    }
  }

  trackEvent(eventName, processingTime) {
    this.metrics.eventProcessing.push({
      event: eventName,
      time: processingTime,
      timestamp: Date.now(),
    });

    if (this.metrics.eventProcessing.length > 1000) {
      this.metrics.eventProcessing.shift();
    }
  }

  getAverageCommandTime(commandName = null) {
    const commands = commandName
      ? this.metrics.commandExecution.filter((c) => c.command === commandName)
      : this.metrics.commandExecution;

    if (commands.length === 0) return 0;
    const total = commands.reduce((sum, c) => sum + c.time, 0);
    return total / commands.length;
  }

  getAverageQueryTime() {
    if (this.metrics.databaseQueries.length === 0) return 0;
    const total = this.metrics.databaseQueries.reduce(
      (sum, q) => sum + q.time,
      0
    );
    return total / this.metrics.databaseQueries.length;
  }

  getSlowestCommands(limit = 10) {
    return this.metrics.commandExecution
      .slice()
      .sort((a, b) => b.time - a.time)
      .slice(0, limit);
  }

  getSlowestQueries(limit = 10) {
    return this.metrics.databaseQueries
      .slice()
      .sort((a, b) => b.time - a.time)
      .slice(0, limit);
  }

  getUptime() {
    return Date.now() - this.startTime;
  }

  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
    };
  }

  async saveMetrics(guildId) {
    const memory = this.getMemoryUsage();
    const avgCommandTime = this.getAverageCommandTime();
    const avgQueryTime = this.getAverageQueryTime();

    await new Promise((resolve, reject) => {
      db.db.run(
        "INSERT INTO performance_metrics (guild_id, metric_type, metric_value, timestamp) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)",
        [
          guildId,
          "memory_rss",
          memory.rss,
          Date.now(),
          guildId,
          "avg_command_time",
          avgCommandTime,
          Date.now(),
          guildId,
          "avg_query_time",
          avgQueryTime,
          Date.now(),
          guildId,
          "uptime",
          this.getUptime(),
          Date.now(),
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // EXCEEDS WICK - Track API performance
  trackAPICall(apiName, executionTime, success = true) {
    this.metrics.apiCalls.push({
      api: apiName,
      time: executionTime,
      success,
      timestamp: Date.now(),
    });

    if (this.metrics.apiCalls.length > 1000) {
      this.metrics.apiCalls.shift();
    }
  }

  // EXCEEDS WICK - Cache performance tracking
  trackCacheHit() {
    this.metrics.cacheHits++;
  }

  trackCacheMiss() {
    this.metrics.cacheMisses++;
  }

  getCacheHitRate() {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    if (total === 0) return 0;
    return ((this.metrics.cacheHits / total) * 100).toFixed(2);
  }

  // EXCEEDS WICK - Alert system
  createAlert(type, message, severity = "info") {
    this.alerts.push({
      type,
      message,
      severity,
      timestamp: Date.now(),
    });

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }
  }

  getAlerts(severity = null) {
    if (severity) {
      return this.alerts.filter((a) => a.severity === severity);
    }
    return this.alerts;
  }

  // EXCEEDS WICK - Health check
  getHealthStatus() {
    const memory = this.getMemoryUsage();
    const avgCommandTime = this.getAverageCommandTime();
    const avgQueryTime = this.getAverageQueryTime();

    const health = {
      status: "healthy",
      issues: [],
      score: 100,
    };

    // Check memory
    if (memory.heapUsed > this.thresholds.memoryUsage) {
      health.status = "degraded";
      health.issues.push(
        `High memory usage: ${memory.heapUsed}MB (threshold: ${this.thresholds.memoryUsage}MB)`
      );
      health.score -= 20;
    }

    // Check command performance
    if (avgCommandTime > this.thresholds.commandTime / 2) {
      health.status = "degraded";
      health.issues.push(
        `Slow command execution: ${avgCommandTime.toFixed(2)}ms average`
      );
      health.score -= 15;
    }

    // Check query performance
    if (avgQueryTime > this.thresholds.queryTime / 2) {
      health.status = "degraded";
      health.issues.push(
        `Slow database queries: ${avgQueryTime.toFixed(2)}ms average`
      );
      health.score -= 15;
    }

    // Check recent errors
    const recentErrors = this.getAlerts("error").filter(
      (a) => Date.now() - a.timestamp < 300000 // Last 5 minutes
    );
    if (recentErrors.length > 10) {
      health.status = "unhealthy";
      health.issues.push(`High error rate: ${recentErrors.length} errors in 5 minutes`);
      health.score -= 30;
    }

    if (health.issues.length === 0) {
      health.status = "healthy";
    }

    return health;
  }

  // EXCEEDS WICK - Performance recommendations
  getRecommendations() {
    const recommendations = [];
    const avgQueryTime = this.getAverageQueryTime();
    const avgCommandTime = this.getAverageCommandTime();
    const memory = this.getMemoryUsage();
    const cacheHitRate = parseFloat(this.getCacheHitRate());

    if (avgQueryTime > 100) {
      recommendations.push({
        type: "database",
        priority: "high",
        message: "Database queries are slow. Consider adding indexes or optimizing queries.",
      });
    }

    if (avgCommandTime > 500) {
      recommendations.push({
        type: "commands",
        priority: "medium",
        message: "Commands are responding slowly. Review command logic and API calls.",
      });
    }

    if (memory.heapUsed > 400) {
      recommendations.push({
        type: "memory",
        priority: "high",
        message: "Memory usage is high. Check for memory leaks or optimize data structures.",
      });
    }

    if (cacheHitRate < 80 && this.metrics.cacheHits + this.metrics.cacheMisses > 100) {
      recommendations.push({
        type: "cache",
        priority: "medium",
        message: `Cache hit rate is ${cacheHitRate}%. Consider caching more frequently accessed data.`,
      });
    }

    const slowCommands = this.getSlowestCommands(5);
    const verySlowCommands = slowCommands.filter((c) => c.time > 2000);
    if (verySlowCommands.length > 0) {
      recommendations.push({
        type: "commands",
        priority: "high",
        message: `${verySlowCommands.length} commands taking >2s: ${verySlowCommands.map((c) => c.command).join(", ")}`,
      });
    }

    return recommendations;
  }

  getStats() {
    return {
      uptime: this.getUptime(),
      memory: this.getMemoryUsage(),
      commands: {
        total: this.metrics.commandExecution.length,
        averageTime: this.getAverageCommandTime(),
        slowest: this.getSlowestCommands(5),
      },
      database: {
        totalQueries: this.metrics.databaseQueries.length,
        averageTime: this.getAverageQueryTime(),
        slowest: this.getSlowestQueries(5),
      },
      events: {
        total: this.metrics.eventProcessing.length,
      },
      api: {
        totalCalls: this.metrics.apiCalls.length,
        successRate:
          this.metrics.apiCalls.length > 0
            ? (
                (this.metrics.apiCalls.filter((a) => a.success).length /
                  this.metrics.apiCalls.length) *
                100
              ).toFixed(2)
            : 100,
      },
      cache: {
        hits: this.metrics.cacheHits,
        misses: this.metrics.cacheMisses,
        hitRate: this.getCacheHitRate(),
      },
      health: this.getHealthStatus(),
      recommendations: this.getRecommendations(),
    };
  }

  getMetrics() {
    return {
      memory: this.getMemoryUsage().heapUsed,
      uptime: Math.floor(this.getUptime() / 1000), // in seconds
    };
  }
}

module.exports = PerformanceMonitor;
