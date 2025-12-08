const db = require("./database");
const logger = require("./logger");

/**
 * Automated Threat Report Generation
 * Generate weekly security reports with AI summaries
 */
class ThreatReporting {
  constructor(client) {
    this.client = client;
  }

  /**
   * Generate weekly security report
   */
  async generateWeeklyReport(guildId) {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const [threats, modActions, raidAttempts, growth] = await Promise.all([
      this.getThreats(guildId, weekAgo),
      this.getModActions(guildId, weekAgo),
      this.getRaidAttempts(guildId, weekAgo),
      this.getGrowthStats(guildId, weekAgo),
    ]);

    const report = {
      guildId,
      period: {
        start: weekAgo,
        end: Date.now(),
        days: 7,
      },
      summary: {
        totalThreats: threats.length,
        threatsBlocked: threats.filter((t) => t.action_taken).length,
        modActions: modActions.length,
        raidsBlocked: raidAttempts.length,
        memberGrowth: growth.joins - growth.leaves,
      },
      breakdown: {
        threatsByType: this.groupBy(threats, "threat_type"),
        threatsBySeverity: this.groupBy(threats, "severity"),
        modActionsByType: this.groupBy(modActions, "action"),
        hourlyThreatPattern: this.analyzeHourlyPattern(threats),
      },
      insights: this.generateInsights(
        threats,
        modActions,
        raidAttempts,
        growth
      ),
      recommendations: this.generateRecommendations(
        threats,
        modActions,
        growth
      ),
      generatedAt: Date.now(),
    };

    // Store report
    await this.storeReport(guildId, report);

    return report;
  }

  /**
   * Get threats from database
   */
  async getThreats(guildId, since) {
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT * FROM security_logs WHERE guild_id = ? AND timestamp > ?`,
        [guildId, since],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get moderation actions
   */
  async getModActions(guildId, since) {
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT * FROM moderation_logs WHERE guild_id = ? AND timestamp > ?`,
        [guildId, since],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get raid attempts
   */
  async getRaidAttempts(guildId, since) {
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT * FROM anti_raid_logs WHERE guild_id = ? AND timestamp > ?`,
        [guildId, since],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get growth statistics
   */
  async getGrowthStats(guildId, since) {
    return new Promise((resolve, reject) => {
      db.db.get(
        `SELECT 
          COUNT(CASE WHEN event_type = 'join' THEN 1 END) as joins,
          COUNT(CASE WHEN event_type = 'leave' THEN 1 END) as leaves
         FROM member_growth WHERE guild_id = ? AND timestamp > ?`,
        [guildId, since],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || { joins: 0, leaves: 0 });
        }
      );
    });
  }

  /**
   * Group data by field
   */
  groupBy(array, field) {
    const grouped = {};
    array.forEach((item) => {
      const key = item[field] || "unknown";
      grouped[key] = (grouped[key] || 0) + 1;
    });
    return grouped;
  }

  /**
   * Analyze hourly threat patterns
   */
  analyzeHourlyPattern(threats) {
    const hourly = {};

    threats.forEach((threat) => {
      const hour = new Date(threat.timestamp).getHours();
      hourly[hour] = (hourly[hour] || 0) + 1;
    });

    // Find peak hour
    const peakHour = Object.entries(hourly).reduce(
      (max, [hour, count]) => {
        return count > max.count ? { hour: parseInt(hour), count } : max;
      },
      { hour: 0, count: 0 }
    );

    return { hourly, peakHour };
  }

  /**
   * Generate AI insights
   */
  generateInsights(threats, modActions, raids, growth) {
    const insights = [];

    // Threat analysis
    if (threats.length === 0) {
      insights.push("✅ Perfect security week - zero threats detected!");
    } else {
      const criticalThreats = threats.filter(
        (t) => t.severity === "critical"
      ).length;
      if (criticalThreats > 0) {
        insights.push(
          `⚠️ ${criticalThreats} critical threat(s) detected this week`
        );
      }
    }

    // Raid analysis
    if (raids.length > 0) {
      insights.push(`🛡️ Successfully blocked ${raids.length} raid attempt(s)`);
    }

    // Growth analysis
    if (growth.joins - growth.leaves > 50) {
      insights.push(
        `📈 Strong growth: +${growth.joins - growth.leaves} members this week`
      );
    } else if (growth.joins - growth.leaves < -20) {
      insights.push(
        `📉 Member loss detected: ${growth.joins - growth.leaves} net members`
      );
    }

    // Moderation activity
    const bans = modActions.filter((a) => a.action === "ban").length;
    if (bans > 10) {
      insights.push(`⚖️ High moderation activity: ${bans} bans this week`);
    }

    return insights;
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(threats, modActions, growth) {
    const recommendations = [];

    // If lots of threats, recommend tightening security
    if (threats.length > 20) {
      recommendations.push({
        priority: "high",
        action: "Increase security level",
        reason: `${threats.length} threats detected this week`,
      });
    }

    // If negative growth, recommend engagement features
    if (growth.joins - growth.leaves < 0) {
      recommendations.push({
        priority: "medium",
        action: "Review server engagement",
        reason: "Negative member growth detected",
      });
    }

    // If no threats, consider relaxing some rules
    if (threats.length === 0 && modActions.length < 5) {
      recommendations.push({
        priority: "low",
        action: "Server is well-protected",
        reason: "No security issues detected",
      });
    }

    return recommendations;
  }

  /**
   * Store report in database
   */
  async storeReport(guildId, report) {
    await new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO threat_reports (guild_id, report_data, created_at) VALUES (?, ?, ?)`,
        [guildId, JSON.stringify(report), Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Get past reports
   */
  async getReports(guildId, limit = 10) {
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT * FROM threat_reports WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?`,
        [guildId, limit],
        (err, rows) => {
          if (err) reject(err);
          else
            resolve(
              (rows || []).map((r) => ({
                ...r,
                report_data: JSON.parse(r.report_data),
              }))
            );
        }
      );
    });
  }

  /**
   * Format report for Discord embed
   */
  formatForDiscord(report) {
    return {
      title: "📊 Weekly Security Report",
      description:
        `**Period:** ${new Date(report.period.start).toLocaleDateString()} - ${new Date(report.period.end).toLocaleDateString()}\n\n` +
        `**Summary:**\n` +
        `• Total Threats: ${report.summary.totalThreats}\n` +
        `• Threats Blocked: ${report.summary.threatsBlocked}\n` +
        `• Raids Blocked: ${report.summary.raidsBlocked}\n` +
        `• Member Growth: ${report.summary.memberGrowth > 0 ? "+" : ""}${report.summary.memberGrowth}\n\n` +
        `**Insights:**\n` +
        report.insights.map((i) => `${i}`).join("\n"),
      color: 0x9333ea,
      fields: [
        {
          name: "💡 Recommendations",
          value:
            report.recommendations
              .slice(0, 3)
              .map((r) => `${r.priority === "high" ? "🔴" : "🟡"} ${r.action}`)
              .join("\n") || "Keep up the great work!",
        },
      ],
      timestamp: new Date(),
    };
  }
}

module.exports = ThreatReporting;
