const db = require("./database");
const logger = require("./logger");

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      commandExecution: [],
      databaseQueries: [],
      eventProcessing: [],
      memoryUsage: [],
    };
    this.startTime = Date.now();
  }

  trackCommand(commandName, executionTime) {
    this.metrics.commandExecution.push({
      command: commandName,
      time: executionTime,
      timestamp: Date.now(),
    });

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
    };
  }
}

module.exports = PerformanceMonitor;
