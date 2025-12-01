const db = require("./database");

class EnhancedLogging {
  static async log(guildId, logType, category, data) {
    const {
      userId = null,
      moderatorId = null,
      action = null,
      details = "",
      metadata = {},
      severity = "info",
    } = data;

    return await db.addEnhancedLog(
      guildId,
      logType,
      category,
      userId,
      moderatorId,
      action,
      details,
      metadata,
      severity
    );
  }

  static async search(guildId, filters = {}) {
    return await db.searchLogs(guildId, filters);
  }

  static async export(guildId, format = "json", filters = {}) {
    const logs = await this.search(guildId, { ...filters, limit: 10000 });

    if (format === "json") {
      return JSON.stringify(logs, null, 2);
    } else if (format === "csv") {
      const headers = [
        "ID",
        "Timestamp",
        "Type",
        "Category",
        "User",
        "Moderator",
        "Action",
        "Severity",
        "Details",
      ];
      const rows = logs.map((log) => [
        log.id,
        new Date(log.timestamp).toISOString(),
        log.log_type,
        log.category,
        log.user_id || "N/A",
        log.moderator_id || "N/A",
        log.action || "N/A",
        log.severity,
        log.details?.substring(0, 100) || "",
      ]);

      return [headers, ...rows].map((row) => row.join(",")).join("\n");
    }

    return logs;
  }

  static async getStats(guildId, timeRange = 86400000) {
    const startTime = Date.now() - timeRange;
    const logs = await this.search(guildId, { startTime, limit: 10000 });

    const stats = {
      total: logs.length,
      byCategory: {},
      bySeverity: {},
      byAction: {},
      recent: logs.slice(0, 10),
    };

    logs.forEach((log) => {
      // By category
      stats.byCategory[log.category] =
        (stats.byCategory[log.category] || 0) + 1;

      // By severity
      stats.bySeverity[log.severity] =
        (stats.bySeverity[log.severity] || 0) + 1;

      // By action
      if (log.action) {
        stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1;
      }
    });

    return stats;
  }
}

module.exports = EnhancedLogging;
