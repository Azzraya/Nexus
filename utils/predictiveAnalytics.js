const db = require("./database");
const logger = require("./logger");

/**
 * Predictive Analytics System
 * ML-based predictions for security threats and server health
 */
class PredictiveAnalytics {
  constructor(client) {
    this.client = client;
    this.models = new Map(); // guildId -> trained model data
  }

  /**
   * Predict raid likelihood in next N hours
   */
  async predictRaidLikelihood(guildId, hoursAhead = 48) {
    try {
      // Get historical raid data
      const historicalRaids = await this.getHistoricalRaids(guildId);
      const currentMetrics = await this.getCurrentMetrics(guildId);

      // Calculate risk factors
      const riskFactors = this.calculateRiskFactors(
        historicalRaids,
        currentMetrics
      );

      // Generate prediction
      const likelihood = this.calculateLikelihood(riskFactors);

      return {
        likelihood, // 0-100%
        confidence: this.calculateConfidence(historicalRaids.length),
        timeframe: `${hoursAhead} hours`,
        riskFactors,
        recommendations: this.generateRecommendations(likelihood),
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error("PredictiveAnalytics", "Raid prediction error", error);
      return { likelihood: 0, confidence: 0, error: error.message };
    }
  }

  /**
   * Get historical raid attempts
   */
  async getHistoricalRaids(guildId) {
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT * FROM anti_raid_logs 
         WHERE guild_id = ? 
         ORDER BY timestamp DESC 
         LIMIT 100`,
        [guildId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get current server metrics
   */
  async getCurrentMetrics(guildId) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return {};

    // Get recent join patterns
    const recentJoins = await new Promise((resolve, reject) => {
      db.db.get(
        `SELECT COUNT(*) as count FROM member_growth 
         WHERE guild_id = ? AND event_type = 'join' AND timestamp > ?`,
        [guildId, Date.now() - 3600000], // Last hour
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.count || 0);
        }
      );
    });

    return {
      memberCount: guild.memberCount,
      recentJoins,
      createdAt: guild.createdTimestamp,
      serverAge: Date.now() - guild.createdTimestamp,
      verificationLevel: guild.verificationLevel,
    };
  }

  /**
   * Calculate risk factors
   */
  calculateRiskFactors(historicalRaids, currentMetrics) {
    const factors = [];
    let totalRisk = 0;

    // Factor 1: Recent raid history
    const raidsLastWeek = historicalRaids.filter(
      (r) => r.timestamp > Date.now() - 604800000
    ).length;

    if (raidsLastWeek >= 3) {
      factors.push({
        factor: "Multiple recent raids",
        weight: 35,
        description: `${raidsLastWeek} raids in the past week`,
      });
      totalRisk += 35;
    } else if (raidsLastWeek >= 1) {
      factors.push({
        factor: "Recent raid activity",
        weight: 20,
        description: `${raidsLastWeek} raid(s) in the past week`,
      });
      totalRisk += 20;
    }

    // Factor 2: Rapid member growth
    if (currentMetrics.recentJoins >= 20) {
      factors.push({
        factor: "Rapid member growth",
        weight: 25,
        description: `${currentMetrics.recentJoins} joins in the last hour`,
      });
      totalRisk += 25;
    }

    // Factor 3: New server (more vulnerable)
    if (currentMetrics.serverAge < 2592000000) {
      // < 30 days
      factors.push({
        factor: "New server",
        weight: 15,
        description: "Servers under 30 days old are more vulnerable",
      });
      totalRisk += 15;
    }

    // Factor 4: Low verification level
    if (currentMetrics.verificationLevel < 2) {
      factors.push({
        factor: "Low verification level",
        weight: 10,
        description: "Consider increasing Discord verification requirements",
      });
      totalRisk += 10;
    }

    // Factor 5: Day of week patterns
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 5 || dayOfWeek === 6) {
      // Friday/Saturday
      factors.push({
        factor: "Weekend peak",
        weight: 5,
        description: "Raids are more common on weekends",
      });
      totalRisk += 5;
    }

    return {
      factors,
      totalRisk: Math.min(totalRisk, 100),
    };
  }

  /**
   * Calculate raid likelihood
   */
  calculateLikelihood(riskFactors) {
    // Use weighted risk factors to calculate probability
    return Math.min(riskFactors.totalRisk, 100);
  }

  /**
   * Calculate prediction confidence
   */
  calculateConfidence(dataPoints) {
    // More historical data = higher confidence
    if (dataPoints >= 50) return 95;
    if (dataPoints >= 20) return 80;
    if (dataPoints >= 10) return 60;
    if (dataPoints >= 5) return 40;
    return 20;
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(likelihood) {
    const recommendations = [];

    if (likelihood >= 70) {
      recommendations.push({
        priority: "critical",
        action: "Enable lockdown mode",
        description: "High raid risk - consider temporary invite disable",
      });
      recommendations.push({
        priority: "critical",
        action: "Alert moderators",
        description: "Ensure mod team is aware and ready",
      });
    }

    if (likelihood >= 50) {
      recommendations.push({
        priority: "high",
        action: "Increase verification requirements",
        description: "Temporarily raise barriers for new joins",
      });
      recommendations.push({
        priority: "high",
        action: "Review recent joins",
        description: "Check for suspicious accounts",
      });
    }

    if (likelihood >= 30) {
      recommendations.push({
        priority: "medium",
        action: "Enable stricter auto-mod",
        description: "Prepare defenses for potential activity",
      });
    }

    if (likelihood < 30) {
      recommendations.push({
        priority: "low",
        action: "Maintain current security",
        description: "No immediate threats detected",
      });
    }

    return recommendations;
  }

  /**
   * Predict member churn
   */
  async predictChurn(guildId) {
    const stats = await db.getServerConfig(guildId);
    const growthStats = await this.getGrowthStats(guildId, "month");

    const churnProbability = growthStats.churnRate;

    return {
      probability: Math.min(churnProbability, 100),
      expectedLosses: Math.round((churnProbability / 100) * growthStats.joins),
      factors: [
        growthStats.churnRate > 50
          ? "High churn rate detected"
          : "Churn rate acceptable",
        growthStats.netGrowth < 0
          ? "Negative growth trend"
          : "Positive growth trend",
      ],
    };
  }

  async getGrowthStats(guildId, timeframe) {
    // This would call GrowthAnalytics, but to avoid circular dependency,
    // we'll implement a lightweight version here
    const timeframes = {
      day: 86400000,
      week: 604800000,
      month: 2592000000,
    };

    const since = Date.now() - (timeframes[timeframe] || timeframes.week);

    return new Promise((resolve, reject) => {
      db.db.get(
        `SELECT 
          COUNT(CASE WHEN event_type = 'join' THEN 1 END) as joins,
          COUNT(CASE WHEN event_type = 'leave' THEN 1 END) as leaves
         FROM member_growth 
         WHERE guild_id = ? AND timestamp > ?`,
        [guildId, since],
        (err, row) => {
          if (err) reject(err);
          else {
            const stats = row || { joins: 0, leaves: 0 };
            stats.netGrowth = stats.joins - stats.leaves;
            stats.churnRate =
              stats.joins > 0 ? (stats.leaves / stats.joins) * 100 : 0;
            resolve(stats);
          }
        }
      );
    });
  }
}

module.exports = PredictiveAnalytics;
