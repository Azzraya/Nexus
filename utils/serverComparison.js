const db = require("./database");
const logger = require("./logger");

/**
 * Server Comparison & Ranking System
 * Compare your server's security to others (anonymized)
 */
class ServerComparison {
  constructor(client) {
    this.client = client;
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
  }

  /**
   * Calculate comprehensive security score for a server
   */
  async calculateSecurityScore(guildId) {
    const config = await db.getServerConfig(guildId);
    if (!config) return 0;

    let score = 0;
    const breakdown = {};

    // Anti-Raid (20 points)
    if (config.anti_raid_enabled) {
      score += 20;
      breakdown.antiRaid = 20;
    }

    // Anti-Nuke (25 points)
    if (config.anti_nuke_enabled) {
      score += 25;
      breakdown.antiNuke = 25;
    }

    // Auto-Mod (15 points)
    if (config.auto_mod_enabled) {
      score += 15;
      breakdown.autoMod = 15;
    }

    // Verification System (10 points)
    if (config.verification_enabled) {
      score += 10;
      breakdown.verification = 10;
    }

    // Logging Configuration (10 points)
    if (config.mod_log_channel) score += 5;
    if (config.alert_channel) score += 5;
    breakdown.logging =
      (config.mod_log_channel ? 5 : 0) + (config.alert_channel ? 5 : 0);

    // Heat System (10 points)
    if (config.heat_system_enabled) {
      score += 10;
      breakdown.heatSystem = 10;
    }

    // Webhook Integration (5 points)
    if (config.webhook_url) {
      score += 5;
      breakdown.webhooks = 5;
    }

    // Join Gate (5 points)
    const joinGate = await this.checkJoinGateEnabled(guildId);
    if (joinGate) {
      score += 5;
      breakdown.joinGate = 5;
    }

    return { score, breakdown };
  }

  async checkJoinGateEnabled(guildId) {
    return new Promise((resolve) => {
      db.db.get(
        `SELECT enabled FROM join_gate_config WHERE guild_id = ? AND enabled = 1`,
        [guildId],
        (err, row) => resolve(!!row)
      );
    });
  }

  /**
   * Get server's percentile ranking
   */
  async getPercentileRanking(guildId) {
    const { score } = await this.calculateSecurityScore(guildId);

    // Get SAMPLE of server scores (max 50 servers to avoid timeout)
    // In production, this would query a database of historical scores
    const allServers = this.client.guilds.cache
      .map((g) => g.id)
      .filter((id) => id !== guildId)
      .slice(0, 49); // Max 49 others + current = 50 total

    const scores = await Promise.all(
      allServers.map(async (id) => {
        try {
          const { score } = await this.calculateSecurityScore(id);
          return score;
        } catch (error) {
          logger.error(`[ServerComparison] Error calculating score for ${id}:`, error);
          return 0;
        }
      })
    );

    // Add current server's score
    scores.push(score);

    // Calculate percentile
    const betterThan = scores.filter((s) => score > s).length;
    const percentile = (betterThan / scores.length) * 100;

    return {
      yourScore: score,
      maxScore: 100,
      percentile: Math.round(percentile),
      totalServers: this.client.guilds.cache.size,
      sampleSize: scores.length,
      betterThan: betterThan,
      worseThan: scores.length - betterThan,
    };
  }

  /**
   * Generate comparison report
   */
  async generateComparisonReport(guildId) {
    const ranking = await this.getPercentileRanking(guildId);
    const { breakdown } = await this.calculateSecurityScore(guildId);
    const averages = await this.getAverageScores();

    return {
      ranking,
      breakdown,
      averages,
      recommendations: this.generateRecommendations(breakdown, averages),
      badge: this.getBadge(ranking.yourScore),
    };
  }

  /**
   * Get average scores across all servers (sampled for performance)
   */
  async getAverageScores() {
    // Sample max 50 servers to avoid timeout
    const allServers = this.client.guilds.cache
      .map((g) => g.id)
      .slice(0, 50);

    const scores = await Promise.all(
      allServers.map(async (id) => {
        try {
          const { score, breakdown } = await this.calculateSecurityScore(id);
          return { score, breakdown };
        } catch (error) {
          logger.error(`[ServerComparison] Error calculating score for ${id}:`, error);
          return { score: 0, breakdown: {} };
        }
      })
    );

    const validScores = scores.filter((s) => s.score > 0);
    if (validScores.length === 0) {
      return { overall: 50, antiRaid: 10, antiNuke: 12, autoMod: 8 };
    }

    const avg = validScores.reduce((sum, s) => sum + s.score, 0) / validScores.length;

    return {
      overall: Math.round(avg),
      antiRaid: Math.round(
        validScores.reduce((sum, s) => sum + (s.breakdown.antiRaid || 0), 0) /
          validScores.length
      ),
      antiNuke: Math.round(
        validScores.reduce((sum, s) => sum + (s.breakdown.antiNuke || 0), 0) /
          validScores.length
      ),
      autoMod: Math.round(
        validScores.reduce((sum, s) => sum + (s.breakdown.autoMod || 0), 0) /
          validScores.length
      ),
    };
  }

  /**
   * Generate recommendations for improvement
   */
  generateRecommendations(breakdown, averages) {
    const recommendations = [];

    if (!breakdown.antiRaid || breakdown.antiRaid < 20) {
      recommendations.push({
        priority: "high",
        category: "Anti-Raid",
        action: "Enable Anti-Raid Protection",
        impact: "+20 points",
        description: "Protect against coordinated join attacks",
      });
    }

    if (!breakdown.antiNuke || breakdown.antiNuke < 25) {
      recommendations.push({
        priority: "critical",
        category: "Anti-Nuke",
        action: "Enable Anti-Nuke Protection",
        impact: "+25 points",
        description: "Stop mass channel/role deletion attempts",
      });
    }

    if (!breakdown.autoMod || breakdown.autoMod < 15) {
      recommendations.push({
        priority: "high",
        category: "Auto-Mod",
        action: "Configure Auto-Moderation",
        impact: "+15 points",
        description: "Automatically filter spam and bad content",
      });
    }

    if (!breakdown.verification || breakdown.verification < 10) {
      recommendations.push({
        priority: "medium",
        category: "Verification",
        action: "Set Up Verification",
        impact: "+10 points",
        description: "Verify new members before access",
      });
    }

    if (!breakdown.heatSystem || breakdown.heatSystem < 10) {
      recommendations.push({
        priority: "medium",
        category: "Heat System",
        action: "Enable Heat Scoring",
        impact: "+10 points",
        description: "Track suspicious behavior patterns",
      });
    }

    return recommendations;
  }

  /**
   * Get badge based on score
   */
  getBadge(score) {
    if (score >= 90) return { name: "Fortress", emoji: "🏰", color: "#FFD700" };
    if (score >= 75) return { name: "Defender", emoji: "🛡️", color: "#C0C0C0" };
    if (score >= 60) return { name: "Guardian", emoji: "⚔️", color: "#CD7F32" };
    if (score >= 40) return { name: "Watchful", emoji: "👁️", color: "#4CAF50" };
    return { name: "Vulnerable", emoji: "⚠️", color: "#F44336" };
  }

  /**
   * Get global leaderboard
   */
  async getGlobalLeaderboard(limit = 100) {
    const allServers = this.client.guilds.cache.map((g) => ({
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
    }));

    const leaderboard = await Promise.all(
      allServers.map(async (server) => {
        const { score, breakdown } = await this.calculateSecurityScore(
          server.id
        );
        return {
          guildId: server.id,
          guildName: server.name,
          memberCount: server.memberCount,
          score,
          breakdown,
        };
      })
    );

    // Sort by score
    leaderboard.sort((a, b) => b.score - a.score);

    return leaderboard.slice(0, limit);
  }

  /**
   * Anonymized leaderboard (for public display)
   */
  async getAnonymizedLeaderboard(limit = 100) {
    const leaderboard = await this.getGlobalLeaderboard(limit);

    return leaderboard.map((entry, index) => ({
      rank: index + 1,
      serverSize: this.categorizeSize(entry.memberCount),
      score: entry.score,
      badge: this.getBadge(entry.score).emoji,
    }));
  }

  categorizeSize(memberCount) {
    if (memberCount >= 10000) return "Mega (10k+)";
    if (memberCount >= 1000) return "Large (1k-10k)";
    if (memberCount >= 100) return "Medium (100-1k)";
    return "Small (<100)";
  }
}

module.exports = ServerComparison;
