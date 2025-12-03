// Predictive Member Retention System
// Analyze patterns and predict member churn

const db = require("./database");

class RetentionPredictor {
  constructor() {
    this.createTable();
  }

  createTable() {
    db.db.run(`
      CREATE TABLE IF NOT EXISTS member_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at INTEGER,
        left_at INTEGER,
        days_stayed INTEGER,
        messages_sent INTEGER DEFAULT 0,
        commands_used INTEGER DEFAULT 0,
        warnings_received INTEGER DEFAULT 0,
        roles_assigned INTEGER DEFAULT 0,
        UNIQUE(guild_id, user_id)
      )
    `);
  }

  /**
   * Analyze server retention metrics
   */
  async analyzeRetention(guildId) {
    try {
      // Get all member data
      const members = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM member_tracking WHERE guild_id = ?",
          [guildId],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (members.length === 0) {
        return {
          totalMembers: 0,
          avgRetentionDays: 0,
          retentionRate24h: 0,
          retentionRate7d: 0,
          retentionRate30d: 0,
          churnRisk: 0,
          insights: [],
        };
      }

      // Calculate metrics
      const now = Date.now();
      const leftMembers = members.filter((m) => m.left_at);

      // Average days stayed
      const avgRetentionDays =
        leftMembers.length > 0
          ? leftMembers.reduce((sum, m) => sum + (m.days_stayed || 0), 0) /
            leftMembers.length
          : 0;

      // Retention rates
      const day1 = now - 24 * 60 * 60 * 1000;
      const day7 = now - 7 * 24 * 60 * 60 * 1000;
      const day30 = now - 30 * 24 * 60 * 60 * 1000;

      const joined24h = members.filter((m) => m.joined_at > day1);
      const stayed24h = joined24h.filter((m) => !m.left_at || m.left_at > day1);
      const retentionRate24h =
        joined24h.length > 0
          ? (stayed24h.length / joined24h.length) * 100
          : 100;

      const joined7d = members.filter((m) => m.joined_at > day7);
      const stayed7d = joined7d.filter((m) => !m.left_at || m.left_at > day7);
      const retentionRate7d =
        joined7d.length > 0 ? (stayed7d.length / joined7d.length) * 100 : 100;

      const joined30d = members.filter((m) => m.joined_at > day30);
      const stayed30d = joined30d.filter((m) => !m.left_at);
      const retentionRate30d =
        joined30d.length > 0
          ? (stayed30d.length / joined30d.length) * 100
          : 100;

      // Generate insights
      const insights = [];

      if (retentionRate24h < 70) {
        insights.push({
          type: "warning",
          message: `${Math.round(
            100 - retentionRate24h
          )}% of new members leave within 24 hours`,
          recommendation:
            "Consider improving your welcome message and onboarding",
        });
      }

      if (retentionRate7d < 80) {
        insights.push({
          type: "warning",
          message: `${Math.round(
            100 - retentionRate7d
          )}% of members leave within the first week`,
          recommendation: "Enhance early engagement with events or roles",
        });
      }

      if (avgRetentionDays < 30) {
        insights.push({
          type: "critical",
          message: "Average member stays less than 30 days",
          recommendation: "Focus on community building and engagement",
        });
      }

      // Positive insights
      if (retentionRate30d > 90) {
        insights.push({
          type: "success",
          message: "Excellent long-term retention!",
          recommendation: "Keep doing what you're doing",
        });
      }

      // Churn risk calculation
      const churnRisk = Math.round(
        100 - (retentionRate24h + retentionRate7d + retentionRate30d) / 3
      );

      return {
        totalMembers: members.length,
        avgRetentionDays: Math.round(avgRetentionDays),
        retentionRate24h: Math.round(retentionRate24h),
        retentionRate7d: Math.round(retentionRate7d),
        retentionRate30d: Math.round(retentionRate30d),
        churnRisk,
        insights,
      };
    } catch (error) {
      console.error("[Retention Predictor] Error:", error);
      return {
        totalMembers: 0,
        avgRetentionDays: 0,
        retentionRate24h: 0,
        retentionRate7d: 0,
        retentionRate30d: 0,
        churnRisk: 0,
        insights: [
          { type: "error", message: "Failed to calculate retention metrics" },
        ],
      };
    }
  }

  /**
   * Predict if a member is likely to leave
   */
  async predictChurn(guildId, userId) {
    try {
      const member = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM member_tracking WHERE guild_id = ? AND user_id = ?",
          [guildId, userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!member) {
        return { risk: 0, factors: ["No data available"] };
      }

      let risk = 0;
      const factors = [];

      // Low activity
      if (member.messages_sent < 5) {
        risk += 30;
        factors.push("Very low message activity");
      }

      // No commands used
      if (member.commands_used === 0) {
        risk += 20;
        factors.push("Has not used any commands");
      }

      // Warnings
      if (member.warnings_received > 0) {
        risk += 25;
        factors.push(`Has ${member.warnings_received} warning(s)`);
      }

      // No roles
      if (member.roles_assigned === 0) {
        risk += 15;
        factors.push("No roles assigned");
      }

      // New member (< 7 days)
      const daysInServer =
        (Date.now() - member.joined_at) / (24 * 60 * 60 * 1000);
      if (daysInServer < 7) {
        risk += 10;
        factors.push("Recently joined (< 7 days)");
      }

      return {
        risk: Math.min(risk, 100),
        factors,
      };
    } catch (error) {
      console.error("[Retention Predictor] Predict churn error:", error);
      return { risk: 0, factors: ["Error calculating risk"] };
    }
  }
}

module.exports = new RetentionPredictor();
