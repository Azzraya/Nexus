const db = require("./database");

class UsageAnalyzer {
  /**
   * Check if currently in British Summer Time
   * @returns {boolean}
   */
  static isBST() {
    const now = new Date();
    const year = now.getFullYear();
    
    // BST starts last Sunday of March at 1:00 UTC
    const marchSunday = new Date(year, 2, 31); // March 31
    while (marchSunday.getDay() !== 0) marchSunday.setDate(marchSunday.getDate() - 1);
    const bstStart = new Date(Date.UTC(year, 2, marchSunday.getDate(), 1, 0, 0));
    
    // BST ends last Sunday of October at 1:00 UTC
    const octoberSunday = new Date(year, 9, 31); // October 31
    while (octoberSunday.getDay() !== 0) octoberSunday.setDate(octoberSunday.getDate() - 1);
    const bstEnd = new Date(Date.UTC(year, 9, octoberSunday.getDate(), 1, 0, 0));
    
    return now >= bstStart && now < bstEnd;
  }

  /**
   * Get current timezone info
   * @returns {Object} Timezone name and offset
   */
  static getTimezone() {
    const isBST = this.isBST();
    return {
      name: isBST ? 'BST' : 'GMT',
      offset: isBST ? 1 : 0,
      label: isBST ? 'BST (UTC+1)' : 'GMT (UTC+0)'
    };
  }

  /**
   * Analyze command usage patterns for the last N days
   * @param {number} days - Number of days to analyze (default: 7)
   * @returns {Promise<Object>} Analysis results
   */
  static async analyzeUsagePatterns(days = 7) {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const timezone = this.getTimezone();

    // Get hourly breakdown
    const hourlyData = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT 
          strftime('%H', datetime(timestamp/1000, 'unixepoch')) as hour,
          COUNT(*) as commands,
          COUNT(DISTINCT guild_id) as servers,
          COUNT(DISTINCT user_id) as users
        FROM command_usage_log
        WHERE timestamp > ?
        GROUP BY hour
        ORDER BY hour`,
        [since],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Get daily breakdown
    const dailyData = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT 
          CASE CAST(strftime('%w', datetime(timestamp/1000, 'unixepoch')) AS INTEGER)
            WHEN 0 THEN 'Sunday'
            WHEN 1 THEN 'Monday'
            WHEN 2 THEN 'Tuesday'
            WHEN 3 THEN 'Wednesday'
            WHEN 4 THEN 'Thursday'
            WHEN 5 THEN 'Friday'
            WHEN 6 THEN 'Saturday'
          END as day,
          strftime('%w', datetime(timestamp/1000, 'unixepoch')) as day_num,
          COUNT(*) as commands
        FROM command_usage_log
        WHERE timestamp > ?
        GROUP BY day_num
        ORDER BY day_num`,
        [since],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Get total stats
    const totalStats = await new Promise((resolve, reject) => {
      db.db.get(
        `SELECT 
          COUNT(*) as total_commands,
          COUNT(DISTINCT guild_id) as total_servers,
          COUNT(DISTINCT user_id) as total_users,
          COUNT(DISTINCT command_name) as unique_commands
        FROM command_usage_log
        WHERE timestamp > ?`,
        [since],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    // Find peak and quiet hours
    const sortedByActivity = [...hourlyData].sort(
      (a, b) => b.commands - a.commands
    );
    const peakHours = sortedByActivity.slice(0, 5);
    const quietHours = sortedByActivity.slice(-5).reverse();

    // Calculate recommended maintenance window
    const quietestHour = quietHours[0]?.hour || "04";
    const maintenanceWindow = {
      start: `${quietestHour}:00`,
      end: `${(parseInt(quietestHour) + 2) % 24}:00`,
      reason: `Lowest activity period (${quietHours[0]?.commands || 0} commands/hour avg)`,
    };

    // Analyze trends
    const busiestDay = dailyData.reduce(
      (max, day) => (day.commands > max.commands ? day : max),
      dailyData[0] || { day: "Unknown", commands: 0 }
    );

    return {
      period: `Last ${days} days`,
      totalStats,
      hourlyData,
      dailyData,
      peakHours,
      quietHours,
      maintenanceWindow,
      busiestDay,
      avgCommandsPerDay: Math.floor(totalStats.total_commands / days),
    };
  }

  /**
   * Get current activity level
   * @returns {Promise<Object>} Current activity metrics
   */
  static async getCurrentActivity() {
    const last5Min = Date.now() - 5 * 60 * 1000;
    const lastHour = Date.now() - 60 * 60 * 1000;

    const [recent, hourly] = await Promise.all([
      new Promise((resolve, reject) => {
        db.db.get(
          `SELECT COUNT(*) as commands FROM command_usage_log WHERE timestamp > ?`,
          [last5Min],
          (err, row) => {
            if (err) reject(err);
            else resolve(row?.commands || 0);
          }
        );
      }),
      new Promise((resolve, reject) => {
        db.db.get(
          `SELECT COUNT(*) as commands FROM command_usage_log WHERE timestamp > ?`,
          [lastHour],
          (err, row) => {
            if (err) reject(err);
            else resolve(row?.commands || 0);
          }
        );
      }),
    ]);

    return {
      last5Minutes: recent,
      lastHour: hourly,
      activityLevel: hourly > 50 ? "high" : hourly > 20 ? "medium" : "low",
      safeToUpdate: recent < 5, // Safe if < 5 commands in last 5 min
    };
  }

  /**
   * Check if it's safe to perform maintenance
   * @returns {Promise<Object>} Safety check results
   */
  static async isMaintenanceWindowSafe() {
    const activity = await this.getCurrentActivity();
    const patterns = await this.analyzeUsagePatterns(7);

    const currentHour = new Date().getHours();
    const isQuietHour = patterns.quietHours.some(
      (h) => parseInt(h.hour) === currentHour
    );

    return {
      safe: activity.safeToUpdate && activity.activityLevel === "low",
      currentActivity: activity,
      isQuietHour,
      recommendation: activity.safeToUpdate
        ? "✅ Safe to deploy updates"
        : `⚠️ Wait ${activity.last5Minutes} commands in last 5min`,
    };
  }
}

module.exports = UsageAnalyzer;
