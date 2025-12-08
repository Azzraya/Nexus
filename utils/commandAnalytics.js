const db = require("./database");
const logger = require("./logger");

/**
 * Command Usage Analytics & Heatmaps
 * Track command usage patterns for optimization
 */
class CommandAnalytics {
  constructor(client) {
    this.client = client;
    this.realtimeUsage = new Map(); // command -> count (current session)
  }

  /**
   * Track command usage
   */
  async trackCommand(
    guildId,
    userId,
    commandName,
    success = true,
    executionTime = 0
  ) {
    // Update realtime counter
    const key = `${guildId}_${commandName}`;
    this.realtimeUsage.set(key, (this.realtimeUsage.get(key) || 0) + 1);

    // Store in database
    try {
      await db.db.run(
        `INSERT INTO command_analytics 
         (guild_id, user_id, command_name, success, execution_time, timestamp) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          guildId,
          userId,
          commandName,
          success ? 1 : 0,
          executionTime,
          Date.now(),
        ]
      );
    } catch (error) {
      logger.error("CommandAnalytics", "Failed to track command", error);
    }
  }

  /**
   * Generate usage heatmap
   */
  async generateHeatmap(guildId, days = 30) {
    const since = Date.now() - days * 86400000;

    const usage = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT 
          command_name,
          strftime('%Y-%m-%d', datetime(timestamp/1000, 'unixepoch')) as date,
          strftime('%H', datetime(timestamp/1000, 'unixepoch')) as hour,
          COUNT(*) as count
         FROM command_analytics 
         WHERE guild_id = ? AND timestamp > ?
         GROUP BY command_name, date, hour`,
        [guildId, since],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Transform to heatmap format
    const heatmap = {};
    usage.forEach((row) => {
      const key = `${row.date}_${row.hour}`;
      if (!heatmap[key]) {
        heatmap[key] = {
          date: row.date,
          hour: parseInt(row.hour),
          commands: {},
        };
      }
      heatmap[key].commands[row.command_name] = row.count;
    });

    return {
      data: Object.values(heatmap),
      peakUsage: this.findPeakUsage(Object.values(heatmap)),
      mostUsedCommand: this.findMostUsedCommand(usage),
    };
  }

  /**
   * Find peak usage time
   */
  findPeakUsage(heatmapData) {
    if (heatmapData.length === 0) return null;

    const peak = heatmapData.reduce(
      (max, cell) => {
        const total = Object.values(cell.commands).reduce((a, b) => a + b, 0);
        return total > max.count
          ? { date: cell.date, hour: cell.hour, count: total }
          : max;
      },
      { date: null, hour: 0, count: 0 }
    );

    return peak;
  }

  /**
   * Find most used command
   */
  findMostUsedCommand(usage) {
    const commandCounts = {};
    usage.forEach((row) => {
      commandCounts[row.command_name] =
        (commandCounts[row.command_name] || 0) + row.count;
    });

    const mostUsed = Object.entries(commandCounts).reduce(
      (max, [cmd, count]) => {
        return count > max.count ? { command: cmd, count } : max;
      },
      { command: "none", count: 0 }
    );

    return mostUsed;
  }

  /**
   * Get command performance stats
   */
  async getPerformanceStats(commandName = null, days = 7) {
    const since = Date.now() - days * 86400000;

    return new Promise((resolve, reject) => {
      const query = commandName
        ? `SELECT 
          command_name,
          COUNT(*) as total_executions,
          AVG(execution_time) as avg_time,
          MAX(execution_time) as max_time,
          MIN(execution_time) as min_time,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures
         FROM command_analytics 
         WHERE command_name = ? AND timestamp > ?
         GROUP BY command_name`
        : `SELECT 
          command_name,
          COUNT(*) as total_executions,
          AVG(execution_time) as avg_time,
          MAX(execution_time) as max_time,
          MIN(execution_time) as min_time,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures
         FROM command_analytics 
         WHERE timestamp > ?
         GROUP BY command_name
         ORDER BY total_executions DESC`;

      const params = commandName ? [commandName, since] : [since];

      db.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Get slow commands (need optimization)
   */
  async getSlowCommands(threshold = 1000) {
    const stats = await this.getPerformanceStats(null, 7);
    return stats.filter((s) => s.avg_time > threshold);
  }

  /**
   * Get usage trends
   */
  async getTrends(guildId, days = 30) {
    const since = Date.now() - days * 86400000;

    const daily = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT 
          strftime('%Y-%m-%d', datetime(timestamp/1000, 'unixepoch')) as date,
          COUNT(*) as count
         FROM command_analytics 
         WHERE guild_id = ? AND timestamp > ?
         GROUP BY date
         ORDER BY date ASC`,
        [guildId, since],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Calculate trend direction
    if (daily.length < 2) {
      return { trend: "insufficient_data", daily };
    }

    const recent = daily.slice(-7).reduce((sum, d) => sum + d.count, 0) / 7;
    const previous =
      daily.slice(-14, -7).reduce((sum, d) => sum + d.count, 0) / 7;

    const changePercent = ((recent - previous) / previous) * 100;

    return {
      trend:
        changePercent > 10
          ? "increasing"
          : changePercent < -10
            ? "decreasing"
            : "stable",
      changePercent: Math.round(changePercent),
      daily,
      averageDaily: Math.round(
        daily.reduce((sum, d) => sum + d.count, 0) / daily.length
      ),
    };
  }
}

module.exports = CommandAnalytics;
