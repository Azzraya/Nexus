const db = require("./database");
const EnhancedLogging = require("./enhancedLogging");

class Reporting {
  static async generateReport(
    guildId,
    reportType,
    periodDays = 7,
    generatedBy
  ) {
    const periodStart = Date.now() - periodDays * 86400000;
    const periodEnd = Date.now();

    const reportData = {
      period: {
        start: periodStart,
        end: periodEnd,
        days: periodDays,
      },
      summary: {},
      trends: {},
      insights: [],
    };

    if (reportType === "security" || reportType === "full") {
      reportData.security = await this.generateSecurityReport(
        guildId,
        periodStart,
        periodEnd
      );
    }

    if (reportType === "moderation" || reportType === "full") {
      reportData.moderation = await this.generateModerationReport(
        guildId,
        periodStart,
        periodEnd
      );
    }

    if (reportType === "activity" || reportType === "full") {
      reportData.activity = await this.generateActivityReport(
        guildId,
        periodStart,
        periodEnd
      );
    }

    // Generate insights
    reportData.insights = this.generateInsights(reportData);

    // Save report
    await db.createReport(
      guildId,
      reportType,
      periodStart,
      periodEnd,
      reportData,
      generatedBy
    );

    return reportData;
  }

  static async generateSecurityReport(guildId, startTime, endTime) {
    const threats = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM security_logs WHERE guild_id = ? AND timestamp >= ? AND timestamp <= ?",
        [guildId, startTime, endTime],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    const raids = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM anti_raid_logs WHERE guild_id = ? AND timestamp >= ? AND timestamp <= ?",
        [guildId, startTime, endTime],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    const avgThreatScore =
      threats.length > 0
        ? threats.reduce((sum, t) => sum + (t.threat_score || 0), 0) /
          threats.length
        : 0;

    return {
      totalThreats: threats.length,
      totalRaids: raids.length,
      avgThreatScore: Math.round(avgThreatScore),
      highThreats: threats.filter((t) => t.threat_score >= 80).length,
      threatsByType: this.groupBy(threats, "event_type"),
    };
  }

  static async generateModerationReport(guildId, startTime, endTime) {
    const actions = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM moderation_logs WHERE guild_id = ? AND timestamp >= ? AND timestamp <= ?",
        [guildId, startTime, endTime],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    const warnings = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM warnings WHERE guild_id = ? AND timestamp >= ? AND timestamp <= ?",
        [guildId, startTime, endTime],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    return {
      totalActions: actions.length,
      totalWarnings: warnings.length,
      actionsByType: this.groupBy(actions, "action"),
      topModerators: this.getTopModerators(actions),
    };
  }

  static async generateActivityReport(guildId, startTime, endTime) {
    const stats = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM user_stats WHERE guild_id = ?",
        [guildId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    const totalMessages = stats.reduce(
      (sum, s) => sum + (s.messages_sent || 0),
      0
    );
    const totalCommands = stats.reduce(
      (sum, s) => sum + (s.commands_used || 0),
      0
    );

    return {
      totalMessages,
      totalCommands,
      activeUsers: stats.filter((s) => (s.messages_sent || 0) > 0).length,
      topUsers: stats
        .sort((a, b) => (b.messages_sent || 0) - (a.messages_sent || 0))
        .slice(0, 10)
        .map((s) => ({ userId: s.user_id, messages: s.messages_sent || 0 })),
    };
  }

  static generateInsights(reportData) {
    const insights = [];

    if (reportData.security) {
      if (reportData.security.totalThreats > 10) {
        insights.push({
          type: "warning",
          message: `High number of threats detected (${reportData.security.totalThreats}). Consider reviewing security settings.`,
        });
      }

      if (reportData.security.avgThreatScore >= 70) {
        insights.push({
          type: "critical",
          message: `Average threat score is ${reportData.security.avgThreatScore}% - server is at high risk.`,
        });
      }
    }

    if (reportData.moderation) {
      if (
        reportData.moderation.totalActions === 0 &&
        reportData.activity?.activeUsers > 50
      ) {
        insights.push({
          type: "info",
          message:
            "No moderation actions taken despite high activity. Consider enabling auto-moderation.",
        });
      }
    }

    return insights;
  }

  static groupBy(array, key) {
    return array.reduce((acc, item) => {
      const group = item[key] || "unknown";
      acc[group] = (acc[group] || 0) + 1;
      return acc;
    }, {});
  }

  static getTopModerators(actions) {
    const moderatorCounts = {};
    actions.forEach((action) => {
      const mod = action.moderator_id;
      moderatorCounts[mod] = (moderatorCounts[mod] || 0) + 1;
    });

    return Object.entries(moderatorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([userId, count]) => ({ userId, count }));
  }
}

module.exports = Reporting;
