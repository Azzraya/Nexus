const logger = require("./logger");

/**
 * Memory Monitor & Leak Detection
 * Tracks memory usage and prevents memory leaks
 */
class MemoryMonitor {
  constructor() {
    this.memoryHistory = [];
    this.maxHistorySize = 100; // Keep last 100 snapshots
    this.thresholds = {
      warning: 0.95, // 95% of max heap (raised from 80%)
      critical: 0.98, // 98% of max heap (raised from 90%)
    };
    this.monitoring = false;
    this.alertCooldown = new Map(); // Prevent alert spam
    this.alertCooldownDuration = 300000; // 5 minutes
  }

  /**
   * Start monitoring memory usage
   */
  start(intervalMs = 60000) {
    if (this.monitoring) {
      logger.warn("MemoryMonitor", "Already monitoring");
      return;
    }

    this.monitoring = true;
    this.monitorInterval = setInterval(() => {
      this.checkMemory();
    }, intervalMs);

    logger.success(
      "MemoryMonitor",
      `Started memory monitoring (${intervalMs / 1000}s interval)`
    );
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitoring = false;
      logger.info("MemoryMonitor", "Stopped memory monitoring");
    }
  }

  /**
   * Check current memory usage
   */
  checkMemory() {
    const usage = process.memoryUsage();
    const snapshot = {
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      heapUsedMB: (usage.heapUsed / 1024 / 1024).toFixed(2),
      heapTotalMB: (usage.heapTotal / 1024 / 1024).toFixed(2),
      rssMB: (usage.rss / 1024 / 1024).toFixed(2),
      usagePercent: (usage.heapUsed / usage.heapTotal) * 100,
    };

    // Store snapshot
    this.memoryHistory.push(snapshot);
    if (this.memoryHistory.length > this.maxHistorySize) {
      this.memoryHistory.shift();
    }

    // Check for issues
    this.detectIssues(snapshot);

    return snapshot;
  }

  /**
   * Detect memory issues
   */
  detectIssues(snapshot) {
    const usagePercent = snapshot.usagePercent / 100;

    // Check for critical usage
    if (usagePercent >= this.thresholds.critical) {
      this.alert("critical", snapshot);
      logger.error(
        "MemoryMonitor",
        `🚨 CRITICAL: Memory usage at ${snapshot.usagePercent.toFixed(2)}%! ` +
          `(${snapshot.heapUsedMB}MB / ${snapshot.heapTotalMB}MB)`
      );

      // Force garbage collection if available
      if (global.gc) {
        logger.info("MemoryMonitor", "Forcing garbage collection...");
        global.gc();
      }
    } else if (usagePercent >= this.thresholds.warning) {
      this.alert("warning", snapshot);
      logger.warn(
        "MemoryMonitor",
        `⚠️ WARNING: Memory usage at ${snapshot.usagePercent.toFixed(2)}%! ` +
          `(${snapshot.heapUsedMB}MB / ${snapshot.heapTotalMB}MB)`
      );
    }

    // Detect memory leaks (increasing trend)
    if (this.memoryHistory.length >= 10) {
      const leak = this.detectMemoryLeak();
      if (leak) {
        logger.warn(
          "MemoryMonitor",
          `⚠️ Possible memory leak detected! ` +
            `Average increase: ${leak.averageIncreaseMB.toFixed(2)}MB/min`
        );
      }
    }
  }

  /**
   * Detect potential memory leaks
   */
  detectMemoryLeak() {
    if (this.memoryHistory.length < 10) return null;

    // Get last 10 snapshots
    const recent = this.memoryHistory.slice(-10);

    // Calculate trend
    let increases = 0;
    let totalIncrease = 0;

    for (let i = 1; i < recent.length; i++) {
      const diff = recent[i].heapUsed - recent[i - 1].heapUsed;
      if (diff > 0) {
        increases++;
        totalIncrease += diff;
      }
    }

    // If 80%+ of samples show increase, likely a leak
    if (increases >= 8) {
      const averageIncrease = totalIncrease / increases;
      const averageIncreaseMB = averageIncrease / 1024 / 1024;

      // Only flag if increase is significant (>5MB average)
      if (averageIncreaseMB > 5) {
        return {
          detected: true,
          averageIncreaseMB,
          samples: increases,
        };
      }
    }

    return null;
  }

  /**
   * Send alert (with cooldown to prevent spam)
   */
  alert(level, snapshot) {
    const now = Date.now();
    const lastAlert = this.alertCooldown.get(level) || 0;

    if (now - lastAlert < this.alertCooldownDuration) {
      return; // Skip alert (cooldown active)
    }

    this.alertCooldown.set(level, now);

    // Alert through error recovery system
    const errorRecovery = require("./errorRecovery");
    errorRecovery
      .alertOwner(
        new Error(`Memory ${level}: ${snapshot.usagePercent.toFixed(2)}% used`),
        {
          type: "memory",
          level,
          heapUsedMB: snapshot.heapUsedMB,
          heapTotalMB: snapshot.heapTotalMB,
          rssMB: snapshot.rssMB,
        }
      )
      .catch(() => {});
  }

  /**
   * Get memory statistics
   */
  getStats() {
    if (this.memoryHistory.length === 0) {
      return null;
    }

    const current = this.memoryHistory[this.memoryHistory.length - 1];
    const oldest = this.memoryHistory[0];

    return {
      current: {
        heapUsedMB: current.heapUsedMB,
        heapTotalMB: current.heapTotalMB,
        rssMB: current.rssMB,
        usagePercent: current.usagePercent.toFixed(2) + "%",
      },
      trend: {
        changeFromOldest:
          (
            ((current.heapUsed - oldest.heapUsed) / oldest.heapUsed) *
            100
          ).toFixed(2) + "%",
        timePeriodMinutes: (
          (current.timestamp - oldest.timestamp) /
          60000
        ).toFixed(1),
      },
      leak: this.detectMemoryLeak(),
      monitoring: this.monitoring,
    };
  }

  /**
   * Force garbage collection (if --expose-gc flag is set)
   */
  forceGC() {
    if (global.gc) {
      logger.info("MemoryMonitor", "Forcing garbage collection...");
      const before = process.memoryUsage().heapUsed;
      global.gc();
      const after = process.memoryUsage().heapUsed;
      const freed = (before - after) / 1024 / 1024;
      logger.success(
        "MemoryMonitor",
        `Garbage collection freed ${freed.toFixed(2)}MB`
      );
      return { freed: freed.toFixed(2) };
    } else {
      logger.warn(
        "MemoryMonitor",
        "Garbage collection not available (use --expose-gc flag)"
      );
      return { freed: 0, error: "GC not exposed" };
    }
  }
}

module.exports = new MemoryMonitor();
