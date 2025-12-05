const logger = require("./logger");

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map(); // operation -> { count, totalTime, avgTime, maxTime }
    this.activeTimers = new Map(); // id -> startTime
  }

  // Start timing an operation
  start(operationName) {
    const id = `${operationName}_${Date.now()}_${Math.random()}`;
    this.activeTimers.set(id, {
      name: operationName,
      startTime: process.hrtime.bigint(),
    });
    return id;
  }

  // End timing and record
  end(id) {
    const timer = this.activeTimers.get(id);
    if (!timer) return null;

    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - timer.startTime) / 1_000_000; // Convert to milliseconds

    this.activeTimers.delete(id);

    // Update metrics
    const existing = this.metrics.get(timer.name) || {
      count: 0,
      totalTime: 0,
      avgTime: 0,
      maxTime: 0,
      minTime: Infinity,
    };

    existing.count++;
    existing.totalTime += duration;
    existing.avgTime = existing.totalTime / existing.count;
    existing.maxTime = Math.max(existing.maxTime, duration);
    existing.minTime = Math.min(existing.minTime, duration);
    existing.lastDuration = duration;

    this.metrics.set(timer.name, existing);

    return {
      operation: timer.name,
      duration: duration,
      average: existing.avgTime,
    };
  }

  // Get metrics for an operation
  getMetrics(operationName) {
    return this.metrics.get(operationName) || null;
  }

  // Get all metrics
  getAllMetrics() {
    const results = [];
    for (const [name, data] of this.metrics.entries()) {
      results.push({
        operation: name,
        ...data,
      });
    }
    return results.sort((a, b) => b.avgTime - a.avgTime);
  }

  // Get slowest operations
  getSlowest(limit = 10) {
    return this.getAllMetrics().slice(0, limit);
  }

  // Reset metrics
  reset() {
    this.metrics.clear();
    this.activeTimers.clear();
    logger.info("[Performance] Metrics reset");
  }

  // Log performance summary
  logSummary() {
    const metrics = this.getAllMetrics();
    if (metrics.length === 0) {
      logger.info("[Performance] No metrics recorded yet");
      return;
    }

    logger.info("[Performance] === Performance Summary ===");
    metrics.slice(0, 10).forEach((m, i) => {
      logger.info(
        `[Performance] ${i + 1}. ${m.operation}: ` +
          `avg ${m.avgTime.toFixed(2)}ms, ` +
          `max ${m.maxTime.toFixed(2)}ms, ` +
          `count ${m.count}`
      );
    });
  }
}

module.exports = new PerformanceMonitor();
