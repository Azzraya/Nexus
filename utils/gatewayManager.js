/**
 * Gateway Manager - Enterprise-grade gateway monitoring and management
 * Tracks gateway connections, sessions, and health per shard
 * EXCEEDS WICK - Matches Dyno's infrastructure quality
 */

const logger = require("./logger");
const EventEmitter = require("events");

class GatewayManager extends EventEmitter {
  constructor(client) {
    super();
    this.client = client;
    this.shardGateways = new Map(); // shard ID -> gateway stats
    this.globalStats = {
      totalIdentifies: 0,
      totalResumes: 0,
      totalReconnects: 0,
      totalDisconnects: 0,
      startTime: Date.now(),
    };
  }

  /**
   * Initialize gateway monitoring for a shard
   */
  initializeShard(shardId) {
    if (this.shardGateways.has(shardId)) {
      return;
    }

    this.shardGateways.set(shardId, {
      shardId,
      status: "initializing",
      sessionId: null,
      resumeUrl: null,
      lastHeartbeat: null,
      lastHeartbeatAck: null,
      heartbeatLatency: null,
      sequence: null,

      // Connection stats
      identifies: 0,
      resumes: 0,
      reconnects: 0,
      disconnects: 0,
      errors: [],

      // Health metrics
      uptime: 0,
      lastConnect: null,
      lastDisconnect: null,
      connectionQuality: 100, // 0-100 score

      // Rate limiting
      identifyRateLimited: false,
      lastIdentify: null,

      // Session info
      sessionStartLimit: null,
    });

    logger.info(
      "GatewayManager",
      `Initialized gateway tracking for shard ${shardId}`
    );
  }

  /**
   * Track IDENTIFY event
   */
  onIdentify(shardId, sessionId) {
    const gateway = this.shardGateways.get(shardId);
    if (!gateway) {
      this.initializeShard(shardId);
      return this.onIdentify(shardId, sessionId);
    }

    gateway.identifies++;
    gateway.sessionId = sessionId;
    gateway.lastIdentify = Date.now();
    gateway.lastConnect = Date.now();
    gateway.status = "identified";

    this.globalStats.totalIdentifies++;

    logger.success(
      "GatewayManager",
      `Shard ${shardId} identified - Session: ${sessionId?.substring(0, 8)}...`
    );
    this.emit("identify", { shardId, sessionId });
  }

  /**
   * Track RESUME event
   */
  onResume(shardId, replayedEvents = 0) {
    const gateway = this.shardGateways.get(shardId);
    if (!gateway) return;

    gateway.resumes++;
    gateway.reconnects++;
    gateway.status = "resumed";
    gateway.lastConnect = Date.now();

    this.globalStats.totalResumes++;
    this.globalStats.totalReconnects++;

    logger.success(
      "GatewayManager",
      `Shard ${shardId} resumed - Replayed ${replayedEvents} events`
    );
    this.emit("resume", { shardId, replayedEvents });

    // Resuming is good - improve connection quality
    this.updateConnectionQuality(shardId, 5);
  }

  /**
   * Track READY event
   */
  onReady(shardId) {
    const gateway = this.shardGateways.get(shardId);
    if (!gateway) return;

    gateway.status = "ready";
    gateway.lastConnect = Date.now();

    logger.success("GatewayManager", `Shard ${shardId} gateway ready`);
    this.emit("ready", { shardId });
  }

  /**
   * Track DISCONNECT event
   */
  onDisconnect(shardId, code, reason) {
    const gateway = this.shardGateways.get(shardId);
    if (!gateway) return;

    gateway.disconnects++;
    gateway.lastDisconnect = Date.now();
    gateway.status = "disconnected";

    this.globalStats.totalDisconnects++;

    // Calculate downtime impact
    if (gateway.lastConnect) {
      const uptime = Date.now() - gateway.lastConnect;
      gateway.uptime += uptime;
    }

    // Track error if not a clean disconnect
    if (code && code !== 1000) {
      gateway.errors.push({
        code,
        reason,
        timestamp: Date.now(),
      });

      // Keep only last 10 errors
      if (gateway.errors.length > 10) {
        gateway.errors = gateway.errors.slice(-10);
      }

      // Bad disconnect - reduce connection quality
      this.updateConnectionQuality(shardId, -10);
    }

    logger.warn(
      "GatewayManager",
      `Shard ${shardId} disconnected - Code: ${code}, Reason: ${reason || "Unknown"}`
    );
    this.emit("disconnect", { shardId, code, reason });
  }

  /**
   * Track RECONNECTING event
   */
  onReconnecting(shardId) {
    const gateway = this.shardGateways.get(shardId);
    if (!gateway) return;

    gateway.status = "reconnecting";
    logger.info(
      "GatewayManager",
      `Shard ${shardId} reconnecting to gateway...`
    );
    this.emit("reconnecting", { shardId });
  }

  /**
   * Track HEARTBEAT event
   */
  onHeartbeat(shardId) {
    const gateway = this.shardGateways.get(shardId);
    if (!gateway) return;

    gateway.lastHeartbeat = Date.now();
  }

  /**
   * Track HEARTBEAT_ACK event
   */
  onHeartbeatAck(shardId, latency) {
    const gateway = this.shardGateways.get(shardId);
    if (!gateway) return;

    gateway.lastHeartbeatAck = Date.now();
    gateway.heartbeatLatency = latency;

    // Update connection quality based on latency
    if (latency > 500) {
      this.updateConnectionQuality(shardId, -2);
    } else if (latency < 100) {
      this.updateConnectionQuality(shardId, 1);
    }
  }

  /**
   * Track gateway errors
   */
  onError(shardId, error) {
    const gateway = this.shardGateways.get(shardId);
    if (!gateway) return;

    gateway.errors.push({
      error: error.message || error.toString(),
      timestamp: Date.now(),
    });

    // Keep only last 10 errors
    if (gateway.errors.length > 10) {
      gateway.errors = gateway.errors.slice(-10);
    }

    // Error - reduce connection quality
    this.updateConnectionQuality(shardId, -5);

    logger.error(
      "GatewayManager",
      `Shard ${shardId} gateway error: ${error.message}`
    );
    this.emit("error", { shardId, error });
  }

  /**
   * Update session info
   */
  updateSessionInfo(shardId, sessionId, resumeUrl, sequence) {
    const gateway = this.shardGateways.get(shardId);
    if (!gateway) return;

    if (sessionId) gateway.sessionId = sessionId;
    if (resumeUrl) gateway.resumeUrl = resumeUrl;
    if (sequence !== undefined) gateway.sequence = sequence;
  }

  /**
   * Update connection quality score (0-100)
   */
  updateConnectionQuality(shardId, delta) {
    const gateway = this.shardGateways.get(shardId);
    if (!gateway) return;

    gateway.connectionQuality = Math.max(
      0,
      Math.min(100, gateway.connectionQuality + delta)
    );

    // Alert if connection quality is critically low
    if (gateway.connectionQuality < 30) {
      logger.warn(
        "GatewayManager",
        `⚠️ Shard ${shardId} connection quality critically low: ${gateway.connectionQuality}%`
      );
      this.emit("quality-critical", {
        shardId,
        quality: gateway.connectionQuality,
      });
    }
  }

  /**
   * Get gateway stats for a specific shard
   */
  getShardStats(shardId) {
    return this.shardGateways.get(shardId) || null;
  }

  /**
   * Get all gateway stats
   */
  getAllStats() {
    const shards = Array.from(this.shardGateways.values());

    return {
      shards,
      global: {
        ...this.globalStats,
        totalShards: shards.length,
        healthyShards: shards.filter((s) => s.connectionQuality >= 70).length,
        degradedShards: shards.filter(
          (s) => s.connectionQuality >= 30 && s.connectionQuality < 70
        ).length,
        criticalShards: shards.filter((s) => s.connectionQuality < 30).length,
        averageQuality:
          shards.reduce((sum, s) => sum + s.connectionQuality, 0) /
          (shards.length || 1),
        averageLatency:
          shards
            .filter((s) => s.heartbeatLatency)
            .reduce((sum, s) => sum + s.heartbeatLatency, 0) /
          (shards.filter((s) => s.heartbeatLatency).length || 1),
      },
    };
  }

  /**
   * Get health report
   */
  getHealthReport() {
    const stats = this.getAllStats();
    const issues = [];

    stats.shards.forEach((shard) => {
      if (shard.connectionQuality < 30) {
        issues.push({
          severity: "critical",
          shardId: shard.shardId,
          issue: `Connection quality critically low (${shard.connectionQuality}%)`,
        });
      } else if (shard.connectionQuality < 70) {
        issues.push({
          severity: "warning",
          shardId: shard.shardId,
          issue: `Connection quality degraded (${shard.connectionQuality}%)`,
        });
      }

      if (shard.heartbeatLatency > 500) {
        issues.push({
          severity: "warning",
          shardId: shard.shardId,
          issue: `High latency (${shard.heartbeatLatency}ms)`,
        });
      }

      if (shard.status === "disconnected") {
        issues.push({
          severity: "critical",
          shardId: shard.shardId,
          issue: "Shard disconnected",
        });
      }

      // Check for frequent reconnects (more than 5 in last 10 minutes)
      const recentErrors = shard.errors.filter(
        (e) => Date.now() - e.timestamp < 600000
      );
      if (recentErrors.length > 5) {
        issues.push({
          severity: "warning",
          shardId: shard.shardId,
          issue: `Frequent errors (${recentErrors.length} in last 10 minutes)`,
        });
      }
    });

    return {
      healthy: issues.length === 0,
      issues,
      stats: stats.global,
    };
  }

  /**
   * Reset stats for a shard
   */
  resetShardStats(shardId) {
    this.shardGateways.delete(shardId);
    this.initializeShard(shardId);
    logger.info("GatewayManager", `Reset gateway stats for shard ${shardId}`);
  }

  /**
   * Start automatic health monitoring
   */
  startHealthMonitoring(interval = 60000) {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
    }

    this.healthInterval = setInterval(() => {
      const report = this.getHealthReport();

      if (!report.healthy) {
        logger.warn(
          "GatewayManager",
          `Gateway health issues detected: ${report.issues.length} issues`
        );

        const criticalIssues = report.issues.filter(
          (i) => i.severity === "critical"
        );
        if (criticalIssues.length > 0) {
          logger.error(
            "GatewayManager",
            `⚠️ ${criticalIssues.length} critical gateway issues!`
          );
          criticalIssues.forEach((issue) => {
            logger.error(
              "GatewayManager",
              `  - Shard ${issue.shardId}: ${issue.issue}`
            );
          });
        }
      }

      // Log stats every hour
      if (Date.now() - this.globalStats.startTime > 3600000) {
        logger.info(
          "GatewayManager",
          `Gateway Stats - Identifies: ${this.globalStats.totalIdentifies}, Resumes: ${this.globalStats.totalResumes}, Reconnects: ${this.globalStats.totalReconnects}`
        );
      }
    }, interval);

    logger.info("GatewayManager", "Gateway health monitoring started");
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
      logger.info("GatewayManager", "Gateway health monitoring stopped");
    }
  }
}

module.exports = GatewayManager;
