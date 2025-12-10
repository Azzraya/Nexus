// AI Threat Prediction System
// Analyze patterns across all servers to predict raids before they happen

const logger = require("./logger");
const db = require("./database");

class ThreatPredictor {
  constructor() {
    this.patterns = {
      // Known raid patterns
      massJoin: { weight: 0.35, threshold: 10 }, // 10+ joins in 60s
      newAccounts: { weight: 0.25, threshold: 0.7 }, // 70%+ new accounts
      noAvatars: { weight: 0.15, threshold: 0.5 }, // 50%+ no avatars
      similarNames: { weight: 0.15, threshold: 0.6 }, // 60%+ similar names
      rapidMessages: { weight: 0.1, threshold: 5 }, // 5+ msgs/sec
    };

    // Defer table creation to ensure database is ready
    setImmediate(() => {
      this.createTable();
    });
  }

  createTable() {
    if (!db.db) {
      // Database not ready yet, retry
      setTimeout(() => this.createTable(), 100);
      return;
    }
    db.db.run(`
      CREATE TABLE IF NOT EXISTS threat_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        prediction_score INTEGER,
        patterns_detected TEXT,
        recommended_actions TEXT,
        timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        was_accurate INTEGER
      )
    `);
  }

  /**
   * Analyze current server state and predict raid probability
   */
  async predictThreat(guild) {
    try {
      const now = Date.now();
      const last60s = now - 60000;

      // Fetch recent members
      // Fetch only recent members (last hour) instead of ALL
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      await guild.members.fetch({ limit: 50 }); // Recent joins typically under 50
      const recentJoins = guild.members.cache.filter(
        (m) => m.joinedTimestamp > last60s
      );

      if (recentJoins.size === 0) {
        return {
          score: 0,
          level: "Safe",
          patterns: [],
          recommendations: [],
        };
      }

      const patterns = {};
      let totalScore = 0;

      // Pattern 1: Mass join detection
      if (recentJoins.size >= this.patterns.massJoin.threshold) {
        patterns.massJoin = {
          detected: true,
          value: recentJoins.size,
          contribution: this.patterns.massJoin.weight * 100,
        };
        totalScore += this.patterns.massJoin.weight * 100;
      }

      // Pattern 2: New account percentage
      const newAccounts = recentJoins.filter((m) => {
        const accountAge = now - m.user.createdTimestamp;
        const daysOld = accountAge / (24 * 60 * 60 * 1000);
        return daysOld < 30;
      });

      const newAccountRatio = newAccounts.size / recentJoins.size;
      if (newAccountRatio >= this.patterns.newAccounts.threshold) {
        patterns.newAccounts = {
          detected: true,
          value: Math.round(newAccountRatio * 100) + "%",
          contribution: this.patterns.newAccounts.weight * 100,
        };
        totalScore += this.patterns.newAccounts.weight * 100;
      }

      // Pattern 3: No avatar percentage
      const noAvatars = recentJoins.filter((m) => m.user.avatar === null);
      const noAvatarRatio = noAvatars.size / recentJoins.size;

      if (noAvatarRatio >= this.patterns.noAvatars.threshold) {
        patterns.noAvatars = {
          detected: true,
          value: Math.round(noAvatarRatio * 100) + "%",
          contribution: this.patterns.noAvatars.weight * 100,
        };
        totalScore += this.patterns.noAvatars.weight * 100;
      }

      // Pattern 4: Similar username patterns
      const usernames = recentJoins.map((m) => m.user.username.toLowerCase());
      const similarCount = this.detectSimilarNames(usernames);
      const similarRatio = similarCount / recentJoins.size;

      if (similarRatio >= this.patterns.similarNames.threshold) {
        patterns.similarNames = {
          detected: true,
          value: Math.round(similarRatio * 100) + "%",
          contribution: this.patterns.similarNames.weight * 100,
        };
        totalScore += this.patterns.similarNames.weight * 100;
      }

      // Generate recommendations based on detected patterns
      const recommendations = this.generateRecommendations(
        patterns,
        totalScore
      );

      // Determine threat level
      const level = this.getThreatLevel(totalScore);

      // Save prediction
      await this.savePrediction(
        guild.id,
        totalScore,
        patterns,
        recommendations
      );

      return {
        score: Math.round(totalScore),
        level,
        patterns: Object.keys(patterns),
        patternDetails: patterns,
        recommendations,
        recentJoins: recentJoins.size,
      };
    } catch (error) {
      logger.error("Threat Predictor", "Error analyzing threat", error);
      return {
        score: 0,
        level: "Unknown",
        patterns: [],
        recommendations: [],
        error: error.message,
      };
    }
  }

  /**
   * Detect similar username patterns
   */
  detectSimilarNames(usernames) {
    let similarCount = 0;

    for (let i = 0; i < usernames.length; i++) {
      for (let j = i + 1; j < usernames.length; j++) {
        const similarity = this.calculateSimilarity(usernames[i], usernames[j]);
        if (similarity > 0.7) {
          // 70% similar
          similarCount++;
        }
      }
    }

    return similarCount;
  }

  /**
   * Calculate string similarity (simple Levenshtein-based)
   */
  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  getThreatLevel(score) {
    if (score >= 70) return "Critical";
    if (score >= 50) return "High";
    if (score >= 30) return "Medium";
    if (score >= 10) return "Low";
    return "Safe";
  }

  generateRecommendations(patterns, score) {
    const recommendations = [];

    if (score >= 70) {
      recommendations.push("🚨 IMMEDIATE: Enable lockdown mode");
      recommendations.push("⚠️ Notify all moderators");
      recommendations.push("🛡️ Enable anti-raid if not active");
    } else if (score >= 50) {
      recommendations.push("⚠️ Monitor closely for next 5 minutes");
      recommendations.push("📊 Check anti-raid settings");
    } else if (score >= 30) {
      recommendations.push("👀 Keep an eye on new joins");
    }

    if (patterns.massJoin) {
      recommendations.push("Consider raising verification level temporarily");
    }

    if (patterns.newAccounts) {
      recommendations.push("Enable account age verification");
    }

    return recommendations;
  }

  async savePrediction(guildId, score, patterns, recommendations) {
    try {
      await new Promise((resolve, reject) => {
        db.db.run(
          `INSERT INTO threat_predictions (guild_id, prediction_score, patterns_detected, recommended_actions) 
           VALUES (?, ?, ?, ?)`,
          [
            guildId,
            score,
            JSON.stringify(Object.keys(patterns)),
            JSON.stringify(recommendations),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    } catch (error) {
      logger.error("Threat Predictor", "Save prediction error", error);
    }
  }

  /**
   * Get prediction history
   */
  async getPredictionHistory(guildId, limit = 10) {
    return new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM threat_predictions WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?",
        [guildId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }
}

module.exports = new ThreatPredictor();
