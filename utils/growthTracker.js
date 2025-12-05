const db = require("./database");
const logger = require("./logger");

class GrowthTracker {
  constructor() {
    // Defer initialization to ensure database is ready
    setImmediate(() => {
      this.initTable();
    });
  }

  initTable() {
    if (!db.db) {
      // Database not ready yet, retry
      setTimeout(() => this.initTable(), 100);
      return;
    }
    db.db.run(`
      CREATE TABLE IF NOT EXISTS growth_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_type TEXT NOT NULL,
        value INTEGER NOT NULL,
        metadata TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    db.db.run(`
      CREATE TABLE IF NOT EXISTS daily_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        total_servers INTEGER,
        total_users INTEGER,
        servers_added INTEGER DEFAULT 0,
        servers_removed INTEGER DEFAULT 0,
        commands_run INTEGER DEFAULT 0,
        raids_detected INTEGER DEFAULT 0,
        bans_issued INTEGER DEFAULT 0,
        uptime_percentage REAL DEFAULT 100.0,
        avg_response_time REAL DEFAULT 0.0,
        metadata TEXT
      )
    `);
  }

  // Track server add
  async trackServerAdd(guildId, source = "unknown", memberCount = 0) {
    return new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO growth_metrics (metric_type, value, metadata, timestamp) 
         VALUES (?, ?, ?, ?)`,
        [
          "server_add",
          1,
          JSON.stringify({ guildId, source, memberCount }),
          Date.now(),
        ],
        (err) => {
          if (err) {
            logger.error("Growth tracking error:", err);
            reject(err);
          } else {
            logger.info(`📈 Server added (${source}): ${memberCount} members`);
            resolve();
          }
        }
      );
    });
  }

  // Track server remove
  async trackServerRemove(guildId, reason = "unknown", daysActive = 0) {
    return new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO growth_metrics (metric_type, value, metadata, timestamp) 
         VALUES (?, ?, ?, ?)`,
        [
          "server_remove",
          -1,
          JSON.stringify({ guildId, reason, daysActive }),
          Date.now(),
        ],
        (err) => {
          if (err) {
            logger.error("Growth tracking error:", err);
            reject(err);
          } else {
            logger.info(
              `📉 Server removed (${reason}): Active for ${daysActive} days`
            );
            resolve();
          }
        }
      );
    });
  }

  // Track command usage
  async trackCommand(commandName, guildId, userId) {
    return new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO growth_metrics (metric_type, value, metadata, timestamp) 
         VALUES (?, ?, ?, ?)`,
        [
          "command_used",
          1,
          JSON.stringify({ command: commandName, guildId, userId }),
          Date.now(),
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Create daily snapshot
  async createDailySnapshot(client) {
    const today = new Date().toISOString().split("T")[0];

    // Get today's metrics
    const metrics = await this.getTodayMetrics();
    const totalServers = client.guilds.cache.size;
    const totalUsers = client.guilds.cache.reduce(
      (acc, g) => acc + g.memberCount,
      0
    );

    return new Promise((resolve, reject) => {
      db.db.run(
        `INSERT OR REPLACE INTO daily_snapshots 
         (date, total_servers, total_users, servers_added, servers_removed, 
          commands_run, raids_detected, bans_issued, metadata) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          today,
          totalServers,
          totalUsers,
          metrics.serversAdded,
          metrics.serversRemoved,
          metrics.commandsRun,
          metrics.raidsDetected,
          metrics.bansIssued,
          JSON.stringify({ timestamp: Date.now() }),
        ],
        (err) => {
          if (err) {
            logger.error("Snapshot error:", err);
            reject(err);
          } else {
            logger.success(
              `Snapshot created: ${totalServers} servers, ${totalUsers} users`
            );
            resolve();
          }
        }
      );
    });
  }

  // Get today's metrics
  async getTodayMetrics() {
    const todayStart = new Date().setHours(0, 0, 0, 0);

    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT metric_type, COUNT(*) as count 
         FROM growth_metrics 
         WHERE timestamp >= ? 
         GROUP BY metric_type`,
        [todayStart],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const metrics = {
              serversAdded: 0,
              serversRemoved: 0,
              commandsRun: 0,
              raidsDetected: 0,
              bansIssued: 0,
            };

            rows.forEach((row) => {
              if (row.metric_type === "server_add")
                metrics.serversAdded = row.count;
              if (row.metric_type === "server_remove")
                metrics.serversRemoved = row.count;
              if (row.metric_type === "command_used")
                metrics.commandsRun = row.count;
              if (row.metric_type === "raid_detected")
                metrics.raidsDetected = row.count;
              if (row.metric_type === "ban_issued")
                metrics.bansIssued = row.count;
            });

            resolve(metrics);
          }
        }
      );
    });
  }

  // Get growth over time
  async getGrowthHistory(days = 30) {
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT * FROM daily_snapshots 
         ORDER BY date DESC 
         LIMIT ?`,
        [days],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Get retention rate
  async getRetentionRate() {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT 
          COUNT(CASE WHEN metric_type = 'server_add' THEN 1 END) as adds,
          COUNT(CASE WHEN metric_type = 'server_remove' THEN 1 END) as removes
         FROM growth_metrics 
         WHERE timestamp >= ?`,
        [thirtyDaysAgo],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const row = rows[0] || { adds: 0, removes: 0 };
            const retention =
              row.adds > 0 ? ((row.adds - row.removes) / row.adds) * 100 : 100;
            resolve({
              adds: row.adds,
              removes: row.removes,
              retention: Math.round(retention * 10) / 10,
            });
          }
        }
      );
    });
  }

  // Get most popular commands
  async getTopCommands(limit = 10) {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT metadata, COUNT(*) as usage_count
         FROM growth_metrics 
         WHERE metric_type = 'command_used' AND timestamp >= ?
         GROUP BY metadata
         ORDER BY usage_count DESC
         LIMIT ?`,
        [sevenDaysAgo, limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const commands = (rows || [])
              .map((row) => {
                try {
                  const data = JSON.parse(row.metadata);
                  return {
                    command: data.command,
                    usage: row.usage_count,
                  };
                } catch {
                  return null;
                }
              })
              .filter((c) => c !== null);
            resolve(commands);
          }
        }
      );
    });
  }

  // Get invite sources
  async getInviteSources(days = 30) {
    const daysAgo = Date.now() - days * 24 * 60 * 60 * 1000;

    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT metadata, COUNT(*) as count
         FROM growth_metrics 
         WHERE metric_type = 'server_add' AND timestamp >= ?
         GROUP BY metadata
         ORDER BY count DESC`,
        [daysAgo],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const sources = {};
            (rows || []).forEach((row) => {
              try {
                const data = JSON.parse(row.metadata);
                const source = data.source || "unknown";
                sources[source] = (sources[source] || 0) + 1;
              } catch {
                sources.unknown = (sources.unknown || 0) + 1;
              }
            });
            resolve(sources);
          }
        }
      );
    });
  }
}

module.exports = new GrowthTracker();
