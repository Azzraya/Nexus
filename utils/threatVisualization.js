const db = require("./database");
const logger = require("./logger");

/**
 * Threat Intelligence Visualization System
 * Generate heatmaps, timelines, and network graphs of threats
 */
class ThreatVisualization {
  constructor(client) {
    this.client = client;
  }

  /**
   * Generate threat heatmap data (for Chart.js)
   */
  async generateHeatmap(guildId, days = 30) {
    const since = Date.now() - days * 86400000;

    const threats = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT 
          strftime('%Y-%m-%d', datetime(timestamp/1000, 'unixepoch')) as date,
          strftime('%H', datetime(timestamp/1000, 'unixepoch')) as hour,
          COUNT(*) as count,
          threat_type
         FROM security_logs 
         WHERE guild_id = ? AND timestamp > ? AND severity IN ('high', 'critical')
         GROUP BY date, hour, threat_type`,
        [guildId, since],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Transform to heatmap format
    const heatmap = {};
    threats.forEach((threat) => {
      const key = `${threat.date}_${threat.hour}`;
      if (!heatmap[key]) {
        heatmap[key] = {
          date: threat.date,
          hour: parseInt(threat.hour),
          threats: {},
        };
      }
      heatmap[key].threats[threat.threat_type] =
        (heatmap[key].threats[threat.threat_type] || 0) + threat.count;
    });

    // Convert to array and calculate intensity
    const heatmapData = Object.values(heatmap).map((cell) => ({
      ...cell,
      totalThreats: Object.values(cell.threats).reduce((a, b) => a + b, 0),
      intensity: this.calculateIntensity(cell.threats),
    }));

    return {
      data: heatmapData,
      summary: {
        totalHotspots: heatmapData.filter((c) => c.intensity >= 70).length,
        peakHour: this.findPeakHour(heatmapData),
        mostCommonThreat: this.findMostCommonThreat(threats),
      },
    };
  }

  /**
   * Calculate threat intensity (0-100)
   */
  calculateIntensity(threats) {
    const total = Object.values(threats).reduce((a, b) => a + b, 0);

    // Weight by threat severity
    const weights = {
      raid: 10,
      nuke: 15,
      spam: 3,
      mass_mention: 8,
      suspicious_join: 5,
    };

    const weightedTotal = Object.entries(threats).reduce(
      (sum, [type, count]) => {
        return sum + count * (weights[type] || 1);
      },
      0
    );

    return Math.min(100, weightedTotal);
  }

  /**
   * Find peak threat hour
   */
  findPeakHour(heatmapData) {
    if (heatmapData.length === 0) return null;

    const hourCounts = {};
    heatmapData.forEach((cell) => {
      hourCounts[cell.hour] = (hourCounts[cell.hour] || 0) + cell.totalThreats;
    });

    const peakHour = Object.entries(hourCounts).reduce(
      (max, [hour, count]) => {
        return count > max.count ? { hour: parseInt(hour), count } : max;
      },
      { hour: 0, count: 0 }
    );

    return peakHour;
  }

  /**
   * Find most common threat type
   */
  findMostCommonThreat(threats) {
    const typeCounts = {};
    threats.forEach((t) => {
      typeCounts[t.threat_type] = (typeCounts[t.threat_type] || 0) + t.count;
    });

    const mostCommon = Object.entries(typeCounts).reduce(
      (max, [type, count]) => {
        return count > max.count ? { type, count } : max;
      },
      { type: "none", count: 0 }
    );

    return mostCommon;
  }

  /**
   * Generate attack timeline
   */
  async generateTimeline(guildId, hours = 24) {
    const since = Date.now() - hours * 3600000;

    const events = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT timestamp, action_type, threat_type, severity, details 
         FROM security_logs 
         WHERE guild_id = ? AND timestamp > ?
         ORDER BY timestamp ASC`,
        [guildId, since],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Group by time intervals (1-hour buckets)
    const timeline = {};
    events.forEach((event) => {
      const hourKey = Math.floor(event.timestamp / 3600000);
      if (!timeline[hourKey]) {
        timeline[hourKey] = {
          timestamp: hourKey * 3600000,
          events: [],
          summary: { total: 0, high: 0, critical: 0 },
        };
      }
      timeline[hourKey].events.push(event);
      timeline[hourKey].summary.total++;
      if (event.severity === "high") timeline[hourKey].summary.high++;
      if (event.severity === "critical") timeline[hourKey].summary.critical++;
    });

    return {
      timeline: Object.values(timeline),
      totalEvents: events.length,
      criticalEvents: events.filter((e) => e.severity === "critical").length,
    };
  }

  /**
   * Generate threat network graph (coordinated attacks)
   */
  async generateNetworkGraph(guildId) {
    const recentThreats = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT user_id, action_type, timestamp, details 
         FROM security_logs 
         WHERE guild_id = ? AND timestamp > ?`,
        [guildId, Date.now() - 86400000], // Last 24 hours
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Build network graph
    const nodes = new Map(); // userId -> node data
    const edges = []; // Connections between users

    recentThreats.forEach((threat) => {
      if (!nodes.has(threat.user_id)) {
        nodes.set(threat.user_id, {
          id: threat.user_id,
          threatCount: 0,
          actions: [],
        });
      }
      const node = nodes.get(threat.user_id);
      node.threatCount++;
      node.actions.push(threat.action_type);
    });

    // Find coordinated activities (users acting within same time window)
    const timeWindow = 300000; // 5 minutes
    for (let i = 0; i < recentThreats.length; i++) {
      for (let j = i + 1; j < recentThreats.length; j++) {
        const threat1 = recentThreats[i];
        const threat2 = recentThreats[j];

        if (
          Math.abs(threat1.timestamp - threat2.timestamp) < timeWindow &&
          threat1.user_id !== threat2.user_id
        ) {
          edges.push({
            source: threat1.user_id,
            target: threat2.user_id,
            weight: 1,
            timeGap: Math.abs(threat1.timestamp - threat2.timestamp),
          });
        }
      }
    }

    return {
      nodes: Array.from(nodes.values()),
      edges,
      summary: {
        totalActors: nodes.size,
        coordinatedPairs: edges.length,
        suspectedBotnet: edges.length >= 5,
      },
    };
  }

  /**
   * Generate geographic threat map
   */
  async generateGeoMap(guildId) {
    // This would integrate with IP geolocation
    // For now, return structure for future implementation
    return {
      regions: [{ country: "Unknown", threatCount: 0, percentage: 0 }],
      topRegions: [],
      totalThreats: 0,
    };
  }

  /**
   * Generate threat summary dashboard data
   */
  async generateDashboardData(guildId) {
    const [heatmap, timeline, network] = await Promise.all([
      this.generateHeatmap(guildId, 7),
      this.generateTimeline(guildId, 24),
      this.generateNetworkGraph(guildId),
    ]);

    return {
      heatmap,
      timeline,
      network,
      generatedAt: Date.now(),
    };
  }
}

module.exports = ThreatVisualization;
