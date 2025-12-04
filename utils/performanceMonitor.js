const logger = require("./logger");

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.raidResponseTimes = [];
    this.banResponseTimes = [];
  }

  // Start tracking an operation
  start(operationId, operation, metadata = {}) {
    this.metrics.set(operationId, {
      operation,
      startTime: process.hrtime.bigint(),
      metadata,
    });
  }

  // End tracking and log performance
  end(operationId) {
    const metric = this.metrics.get(operationId);
    if (!metric) return null;

    const endTime = process.hrtime.bigint();
    const durationNs = endTime - metric.startTime;
    const durationMs = Number(durationNs) / 1_000_000;

    this.metrics.delete(operationId);

    const result = {
      operation: metric.operation,
      duration: durationMs,
      metadata: metric.metadata,
      timestamp: Date.now(),
    };

    // Track raid-specific metrics
    if (metric.operation.includes("raid")) {
      this.raidResponseTimes.push(durationMs);
      if (this.raidResponseTimes.length > 100) {
        this.raidResponseTimes.shift(); // Keep last 100
      }
    }

    // Track ban response times
    if (metric.operation.includes("ban") || metric.operation.includes("kick")) {
      this.banResponseTimes.push(durationMs);
      if (this.banResponseTimes.length > 100) {
        this.banResponseTimes.shift();
      }
    }

    // Log slow operations (>100ms for security, >500ms for others)
    const threshold =
      metric.operation.includes("security") || metric.operation.includes("raid")
        ? 100
        : 500;
    if (durationMs > threshold) {
      logger.warn(
        `⚠️ Slow Operation: ${metric.operation} took ${durationMs.toFixed(2)}ms`
      );
    }

    return result;
  }

  // Get average response times
  getAverages() {
    const avg = (arr) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    return {
      avgRaidResponse: avg(this.raidResponseTimes),
      avgBanResponse: avg(this.banResponseTimes),
      p95RaidResponse: this.percentile(this.raidResponseTimes, 95),
      p95BanResponse: this.percentile(this.banResponseTimes, 95),
      totalRaidDetections: this.raidResponseTimes.length,
      totalBans: this.banResponseTimes.length,
    };
  }

  percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  // Benchmark a specific function
  async benchmark(name, fn, iterations = 1) {
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await fn();
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1_000_000;
      times.push(duration);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const p95 = this.percentile(times, 95);

    logger.info(`📊 Benchmark: ${name}`);
    logger.info(`   Avg: ${avg.toFixed(2)}ms`);
    logger.info(`   Min: ${min.toFixed(2)}ms`);
    logger.info(`   Max: ${max.toFixed(2)}ms`);
    logger.info(`   P95: ${p95.toFixed(2)}ms`);

    return { avg, min, max, p95, times };
  }

  // Compare with Wick's performance (estimated)
  compareWithWick() {
    const wickEstimate = {
      avgRaidResponse: 50, // Wick is estimated ~50ms
      avgBanResponse: 80, // Wick ban ~80ms
    };

    const nexus = this.getAverages();

    return {
      nexus,
      wick: wickEstimate,
      comparison: {
        raidFaster:
          nexus.avgRaidResponse < wickEstimate.avgRaidResponse
            ? "✅ FASTER"
            : "❌ SLOWER",
        raidDiff: Math.abs(
          nexus.avgRaidResponse - wickEstimate.avgRaidResponse
        ).toFixed(2),
        banFaster:
          nexus.avgBanResponse < wickEstimate.avgBanResponse
            ? "✅ FASTER"
            : "❌ SLOWER",
        banDiff: Math.abs(
          nexus.avgBanResponse - wickEstimate.avgBanResponse
        ).toFixed(2),
      },
    };
  }

  // Get real-time stats for API
  getStats() {
    return {
      activeOperations: this.metrics.size,
      ...this.getAverages(),
    };
  }
}

// Singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = performanceMonitor;
