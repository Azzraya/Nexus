// Track bot statistics for competitive positioning
const db = require("./database");

class StatsTracker {
  static async recordEvent(guildId, eventType, data = {}) {
    // Track events for statistics
    await db.logAnalytics(guildId, eventType, JSON.stringify(data));
  }

  static async getGlobalStats() {
    // Get global statistics across all servers
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT 
          COUNT(DISTINCT guild_id) as total_servers,
          COUNT(*) as total_events,
          SUM(CASE WHEN event_type = 'raid_detected' THEN 1 ELSE 0 END) as raids_stopped,
          SUM(CASE WHEN event_type = 'nuke_attempt' THEN 1 ELSE 0 END) as nukes_stopped,
          SUM(CASE WHEN event_type = 'threat_detected' THEN 1 ELSE 0 END) as threats_detected
        FROM analytics`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else {
            const stats = rows[0] || {
              total_servers: 0,
              total_events: 0,
              raids_stopped: 0,
              nukes_stopped: 0,
              threats_detected: 0,
            };
            resolve(stats);
          }
        }
      );
    });
  }

  static async getServerStats(guildId) {
    // Get statistics for a specific server
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT 
          COUNT(*) as total_events,
          SUM(CASE WHEN event_type = 'raid_detected' THEN 1 ELSE 0 END) as raids_stopped,
          SUM(CASE WHEN event_type = 'nuke_attempt' THEN 1 ELSE 0 END) as nukes_stopped,
          SUM(CASE WHEN event_type = 'threat_detected' THEN 1 ELSE 0 END) as threats_detected,
          SUM(CASE WHEN event_type = 'member_join' THEN 1 ELSE 0 END) as members_joined
        FROM analytics
        WHERE guild_id = ?`,
        [guildId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const stats = rows[0] || {
              total_events: 0,
              raids_stopped: 0,
              nukes_stopped: 0,
              threats_detected: 0,
              members_joined: 0,
            };
            resolve(stats);
          }
        }
      );
    });
  }

  static formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + "M";
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + "K";
    }
    return num.toString();
  }
}

module.exports = StatsTracker;
