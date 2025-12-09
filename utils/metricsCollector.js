/**
 * Prometheus Metrics Collector
 * Collects and exposes metrics for monitoring
 * EXCEEDS WICK - Enterprise-grade observability
 */

const logger = require("./logger");

class MetricsCollector {
  constructor() {
    this.metrics = {
      // Bot metrics
      commands_executed: new Map(), // command -> count
      commands_failed: new Map(), // command -> count
      threats_blocked: 0,
      raids_detected: 0,
      users_banned: 0,
      users_kicked: 0,
      users_muted: 0,
      messages_deleted: 0,

      // Performance metrics
      command_latency: new Map(), // command -> [latencies]
      database_query_time: [],
      cache_hits: 0,
      cache_misses: 0,

      // System metrics
      guild_count: 0,
      user_count: 0,
      shard_count: 0,
      memory_usage: 0,
      cpu_usage: 0,

      // Security metrics
      rate_limit_hits: 0,
      failed_auth_attempts: 0,
      suspicious_activities: 0,

      // API metrics
      api_requests: new Map(), // endpoint -> count
      api_errors: new Map(), // endpoint -> count
      api_latency: new Map(), // endpoint -> [latencies]
    };

    this.startTime = Date.now();
    this.resetInterval = null;
  }

  init() {
    // Reset hourly metrics every hour
    this.resetInterval = setInterval(
      () => {
        this.resetHourlyMetrics();
      },
      60 * 60 * 1000
    ); // 1 hour

    logger.success("Metrics", "Metrics collector initialized");
  }

  // Command metrics
  recordCommandExecution(commandName, latency) {
    const count = this.metrics.commands_executed.get(commandName) || 0;
    this.metrics.commands_executed.set(commandName, count + 1);

    if (!this.metrics.command_latency.has(commandName)) {
      this.metrics.command_latency.set(commandName, []);
    }
    const latencies = this.metrics.command_latency.get(commandName);
    latencies.push(latency);

    // Keep only last 100 latencies
    if (latencies.length > 100) {
      latencies.shift();
    }
  }

  recordCommandFailure(commandName) {
    const count = this.metrics.commands_failed.get(commandName) || 0;
    this.metrics.commands_failed.set(commandName, count + 1);
  }

  // Security metrics
  recordThreatBlocked(type) {
    this.metrics.threats_blocked++;
    if (type === "raid") this.metrics.raids_detected++;
  }

  recordModAction(action) {
    switch (action) {
      case "ban":
        this.metrics.users_banned++;
        break;
      case "kick":
        this.metrics.users_kicked++;
        break;
      case "mute":
        this.metrics.users_muted++;
        break;
      case "delete":
        this.metrics.messages_deleted++;
        break;
    }
  }

  recordSuspiciousActivity() {
    this.metrics.suspicious_activities++;
  }

  recordRateLimitHit() {
    this.metrics.rate_limit_hits++;
  }

  recordFailedAuth() {
    this.metrics.failed_auth_attempts++;
  }

  // Performance metrics
  recordDatabaseQuery(duration) {
    this.metrics.database_query_time.push(duration);
    if (this.metrics.database_query_time.length > 1000) {
      this.metrics.database_query_time.shift();
    }
  }

  recordCacheHit() {
    this.metrics.cache_hits++;
  }

  recordCacheMiss() {
    this.metrics.cache_misses++;
  }

  // API metrics
  recordAPIRequest(endpoint, latency) {
    const count = this.metrics.api_requests.get(endpoint) || 0;
    this.metrics.api_requests.set(endpoint, count + 1);

    if (!this.metrics.api_latency.has(endpoint)) {
      this.metrics.api_latency.set(endpoint, []);
    }
    const latencies = this.metrics.api_latency.get(endpoint);
    latencies.push(latency);

    if (latencies.length > 100) {
      latencies.shift();
    }
  }

  recordAPIError(endpoint) {
    const count = this.metrics.api_errors.get(endpoint) || 0;
    this.metrics.api_errors.set(endpoint, count + 1);
  }

  // System metrics
  updateSystemMetrics(guilds, users, shards) {
    this.metrics.guild_count = guilds;
    this.metrics.user_count = users;
    this.metrics.shard_count = shards;

    const mem = process.memoryUsage();
    this.metrics.memory_usage = mem.heapUsed;
  }

  // Get metrics for Prometheus
  getPrometheusMetrics() {
    const lines = [];
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    // Help and type declarations
    lines.push("# HELP nexus_uptime_seconds Bot uptime in seconds");
    lines.push("# TYPE nexus_uptime_seconds counter");
    lines.push(`nexus_uptime_seconds ${uptime}`);
    lines.push("");

    // Guild count
    lines.push("# HELP nexus_guilds Total number of guilds");
    lines.push("# TYPE nexus_guilds gauge");
    lines.push(`nexus_guilds ${this.metrics.guild_count}`);
    lines.push("");

    // User count
    lines.push("# HELP nexus_users Total number of users");
    lines.push("# TYPE nexus_users gauge");
    lines.push(`nexus_users ${this.metrics.user_count}`);
    lines.push("");

    // Memory usage
    lines.push("# HELP nexus_memory_bytes Memory usage in bytes");
    lines.push("# TYPE nexus_memory_bytes gauge");
    lines.push(`nexus_memory_bytes ${this.metrics.memory_usage}`);
    lines.push("");

    // Commands executed
    lines.push("# HELP nexus_commands_total Total commands executed");
    lines.push("# TYPE nexus_commands_total counter");
    for (const [cmd, count] of this.metrics.commands_executed) {
      lines.push(`nexus_commands_total{command="${cmd}"} ${count}`);
    }
    lines.push("");

    // Command failures
    lines.push("# HELP nexus_command_failures_total Command failures");
    lines.push("# TYPE nexus_command_failures_total counter");
    for (const [cmd, count] of this.metrics.commands_failed) {
      lines.push(`nexus_command_failures_total{command="${cmd}"} ${count}`);
    }
    lines.push("");

    // Command latency
    lines.push(
      "# HELP nexus_command_latency_ms Average command latency in milliseconds"
    );
    lines.push("# TYPE nexus_command_latency_ms gauge");
    for (const [cmd, latencies] of this.metrics.command_latency) {
      if (latencies.length > 0) {
        const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        lines.push(
          `nexus_command_latency_ms{command="${cmd}"} ${avg.toFixed(2)}`
        );
      }
    }
    lines.push("");

    // Threats blocked
    lines.push("# HELP nexus_threats_blocked_total Total threats blocked");
    lines.push("# TYPE nexus_threats_blocked_total counter");
    lines.push(`nexus_threats_blocked_total ${this.metrics.threats_blocked}`);
    lines.push("");

    // Raids detected
    lines.push("# HELP nexus_raids_detected_total Total raids detected");
    lines.push("# TYPE nexus_raids_detected_total counter");
    lines.push(`nexus_raids_detected_total ${this.metrics.raids_detected}`);
    lines.push("");

    // Moderation actions
    lines.push("# HELP nexus_mod_actions_total Moderation actions taken");
    lines.push("# TYPE nexus_mod_actions_total counter");
    lines.push(
      `nexus_mod_actions_total{action="ban"} ${this.metrics.users_banned}`
    );
    lines.push(
      `nexus_mod_actions_total{action="kick"} ${this.metrics.users_kicked}`
    );
    lines.push(
      `nexus_mod_actions_total{action="mute"} ${this.metrics.users_muted}`
    );
    lines.push(
      `nexus_mod_actions_total{action="delete"} ${this.metrics.messages_deleted}`
    );
    lines.push("");

    // Cache metrics
    const cacheTotal = this.metrics.cache_hits + this.metrics.cache_misses;
    const cacheHitRate =
      cacheTotal > 0 ? (this.metrics.cache_hits / cacheTotal) * 100 : 0;
    lines.push("# HELP nexus_cache_hit_rate_percent Cache hit rate percentage");
    lines.push("# TYPE nexus_cache_hit_rate_percent gauge");
    lines.push(`nexus_cache_hit_rate_percent ${cacheHitRate.toFixed(2)}`);
    lines.push("");

    // Database query time
    if (this.metrics.database_query_time.length > 0) {
      const avgDbTime =
        this.metrics.database_query_time.reduce((a, b) => a + b, 0) /
        this.metrics.database_query_time.length;
      lines.push(
        "# HELP nexus_db_query_ms Average database query time in milliseconds"
      );
      lines.push("# TYPE nexus_db_query_ms gauge");
      lines.push(`nexus_db_query_ms ${avgDbTime.toFixed(2)}`);
      lines.push("");
    }

    // Security metrics
    lines.push("# HELP nexus_security_events_total Security events");
    lines.push("# TYPE nexus_security_events_total counter");
    lines.push(
      `nexus_security_events_total{type="rate_limit"} ${this.metrics.rate_limit_hits}`
    );
    lines.push(
      `nexus_security_events_total{type="failed_auth"} ${this.metrics.failed_auth_attempts}`
    );
    lines.push(
      `nexus_security_events_total{type="suspicious"} ${this.metrics.suspicious_activities}`
    );
    lines.push("");

    // API metrics
    lines.push("# HELP nexus_api_requests_total API requests");
    lines.push("# TYPE nexus_api_requests_total counter");
    for (const [endpoint, count] of this.metrics.api_requests) {
      lines.push(`nexus_api_requests_total{endpoint="${endpoint}"} ${count}`);
    }
    lines.push("");

    return lines.join("\n");
  }

  // Get human-readable stats
  getStats() {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    const totalCommands = Array.from(
      this.metrics.commands_executed.values()
    ).reduce((a, b) => a + b, 0);
    const totalFailures = Array.from(
      this.metrics.commands_failed.values()
    ).reduce((a, b) => a + b, 0);

    const cacheTotal = this.metrics.cache_hits + this.metrics.cache_misses;
    const cacheHitRate =
      cacheTotal > 0
        ? ((this.metrics.cache_hits / cacheTotal) * 100).toFixed(2)
        : 0;

    return {
      uptime,
      bot: {
        guilds: this.metrics.guild_count,
        users: this.metrics.user_count,
        shards: this.metrics.shard_count,
      },
      commands: {
        total: totalCommands,
        failed: totalFailures,
        success_rate:
          totalCommands > 0
            ? ((1 - totalFailures / totalCommands) * 100).toFixed(2)
            : 100,
      },
      security: {
        threats_blocked: this.metrics.threats_blocked,
        raids_detected: this.metrics.raids_detected,
        bans: this.metrics.users_banned,
        kicks: this.metrics.users_kicked,
        mutes: this.metrics.users_muted,
      },
      performance: {
        cache_hit_rate: `${cacheHitRate}%`,
        memory_mb: (this.metrics.memory_usage / 1024 / 1024).toFixed(2),
      },
    };
  }

  resetHourlyMetrics() {
    // Reset metrics that should be hourly
    this.metrics.commands_executed.clear();
    this.metrics.commands_failed.clear();
    this.metrics.command_latency.clear();
    this.metrics.api_requests.clear();
    this.metrics.api_errors.clear();
    this.metrics.api_latency.clear();
    this.metrics.database_query_time = [];

    logger.info("Metrics", "Hourly metrics reset");
  }

  shutdown() {
    if (this.resetInterval) {
      clearInterval(this.resetInterval);
    }
  }
}

// Singleton instance
const metricsCollector = new MetricsCollector();

module.exports = metricsCollector;
