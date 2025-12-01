const db = require("./database");
const AILearning = require("./aiLearning");

class BehavioralAnalysis {
  static async trackBehavior(guildId, userId, behaviorType, data) {
    // Store behavior data
    await db.recordBehavior(guildId, userId, behaviorType, data, Date.now());

    // Analyze for patterns
    const patterns = await this.analyzePatterns(guildId, userId, behaviorType);

    // Detect anomalies
    const anomalies = await this.detectAnomalies(
      guildId,
      userId,
      behaviorType,
      data
    );

    return { patterns, anomalies };
  }

  static async analyzePatterns(guildId, userId, behaviorType) {
    const behaviors = await db.getBehaviors(guildId, userId, behaviorType);

    if (behaviors.length < 5) {
      return { confidence: 0, pattern: "insufficient_data" };
    }

    // Analyze message patterns
    if (behaviorType === "message") {
      return this.analyzeMessagePatterns(behaviors);
    }

    // Analyze activity patterns
    if (behaviorType === "activity") {
      return this.analyzeActivityPatterns(behaviors);
    }

    // Analyze moderation patterns
    if (behaviorType === "moderation") {
      return this.analyzeModerationPatterns(behaviors);
    }

    return { confidence: 0, pattern: "unknown" };
  }

  static analyzeMessagePatterns(behaviors) {
    const messages = behaviors
      .map((b) => {
        try {
          // Handle if data is already an object or a JSON string
          let data = b.data;
          if (typeof data === "string") {
            // Try to parse JSON
            try {
              data = JSON.parse(data);
            } catch (e) {
              // If parsing fails, return empty string
              return "";
            }
          }
          // If data is an object, extract content
          if (typeof data === "object" && data !== null) {
            return data.content || "";
          }
          return "";
        } catch (error) {
          return "";
        }
      })
      .filter((m) => m);

    if (messages.length === 0) {
      return { confidence: 0, pattern: "insufficient_data" };
    }

    // Check for gradual change
    const recentMessages = messages.slice(-10);
    const olderMessages = messages.slice(0, -10);

    if (olderMessages.length === 0) {
      return { confidence: 0.5, pattern: "new_user" };
    }

    // Analyze sentiment shift (simplified)
    const recentHasLinks = recentMessages.filter((m) =>
      /https?:\/\//.test(m)
    ).length;
    const olderHasLinks = olderMessages.filter((m) =>
      /https?:\/\//.test(m)
    ).length;

    if (recentHasLinks > olderHasLinks * 2) {
      return {
        confidence: 0.8,
        pattern: "behavior_change",
        description: "User started sending significantly more links",
        risk: "medium",
      };
    }

    return { confidence: 0.5, pattern: "normal" };
  }

  static analyzeActivityPatterns(behaviors) {
    const timestamps = behaviors.map((b) => b.timestamp).sort((a, b) => a - b);

    if (timestamps.length < 5) {
      return { confidence: 0, pattern: "insufficient_data" };
    }

    // Check for sudden activity spike
    const recentActivity = timestamps.filter(
      (t) => t > Date.now() - 3600000
    ).length;
    const avgActivity =
      timestamps.length /
      ((timestamps[timestamps.length - 1] - timestamps[0]) / 3600000);

    if (recentActivity > avgActivity * 3) {
      return {
        confidence: 0.85,
        pattern: "activity_spike",
        description: "Unusual activity spike detected",
        risk: "high",
      };
    }

    return { confidence: 0.5, pattern: "normal" };
  }

  static analyzeModerationPatterns(behaviors) {
    const actions = behaviors.map((b) => {
      try {
        let data = b.data;
        if (typeof data === "string") {
          data = JSON.parse(data);
        }
        return typeof data === "object" && data !== null
          ? data.action || ""
          : "";
      } catch {
        return "";
      }
    });

    const actionCounts = {};
    actions.forEach((action) => {
      actionCounts[action] = (actionCounts[action] || 0) + 1;
    });

    // Check for repeated violations
    const mostCommon = Object.entries(actionCounts).sort(
      (a, b) => b[1] - a[1]
    )[0];

    if (mostCommon && mostCommon[1] >= 3) {
      return {
        confidence: 0.9,
        pattern: "repeat_offender",
        description: `User has ${mostCommon[1]} ${mostCommon[0]} violations`,
        risk: "high",
      };
    }

    return { confidence: 0.5, pattern: "normal" };
  }

  static async detectAnomalies(guildId, userId, behaviorType, currentData) {
    const historicalData = await db.getBehaviors(guildId, userId, behaviorType);

    if (historicalData.length < 10) {
      return []; // Not enough data
    }

    const anomalies = [];

    // Check for sudden behavior change
    if (behaviorType === "message") {
      const recentAvg = this.calculateAverage(historicalData.slice(-5));
      const current = this.extractValue(currentData, "length") || 0;

      if (current > recentAvg * 2) {
        anomalies.push({
          type: "sudden_increase",
          severity: "medium",
          description: "Message length increased significantly",
        });
      }
    }

    // Check for time-based anomalies
    const currentHour = new Date().getHours();
    const historicalHours = historicalData.map((b) =>
      new Date(b.timestamp).getHours()
    );
    const avgHour =
      historicalHours.reduce((a, b) => a + b, 0) / historicalHours.length;

    if (Math.abs(currentHour - avgHour) > 6) {
      anomalies.push({
        type: "time_anomaly",
        severity: "low",
        description: "User active at unusual time",
      });
    }

    return anomalies;
  }

  static calculateAverage(data) {
    if (data.length === 0) return 0;
    const values = data.map(
      (d) => this.extractValue(d.data || {}, "length") || 0
    );
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  static extractValue(data, key) {
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return null;
      }
    }
    return data[key] || null;
  }

  static async getBehaviorSummary(guildId, userId) {
    const behaviors = await db.getBehaviors(guildId, userId);

    const summary = {
      totalBehaviors: behaviors.length,
      behaviorTypes: {},
      riskScore: 0,
      anomalies: [],
    };

    behaviors.forEach((b) => {
      summary.behaviorTypes[b.behavior_type] =
        (summary.behaviorTypes[b.behavior_type] || 0) + 1;
    });

    // Calculate risk score
    const patterns = await this.analyzePatterns(guildId, userId, "message");
    if (
      patterns.pattern === "behavior_change" ||
      patterns.pattern === "repeat_offender"
    ) {
      summary.riskScore += 30;
    }

    const anomalies = await this.detectAnomalies(
      guildId,
      userId,
      "message",
      {}
    );
    summary.anomalies = anomalies;
    summary.riskScore += anomalies.length * 10;

    summary.riskScore = Math.min(100, summary.riskScore);

    return summary;
  }
}

module.exports = BehavioralAnalysis;
