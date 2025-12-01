const db = require("./database");

class AILearning {
  static async analyzeBehavior(guildId, userId, behaviorData) {
    const patterns = await db.getPatterns(guildId, userId);

    // Analyze message patterns
    if (behaviorData.messages) {
      const messagePattern = this.analyzeMessagePattern(behaviorData.messages);
      if (messagePattern.confidence > 0.5) {
        await db.recordPattern(
          guildId,
          userId,
          "message_pattern",
          messagePattern,
          messagePattern.confidence
        );
      }
    }

    // Analyze activity patterns
    if (behaviorData.activity) {
      const activityPattern = this.analyzeActivityPattern(
        behaviorData.activity
      );
      if (activityPattern.confidence > 0.5) {
        await db.recordPattern(
          guildId,
          userId,
          "activity_pattern",
          activityPattern,
          activityPattern.confidence
        );
      }
    }

    // Analyze threat patterns
    if (behaviorData.threats) {
      const threatPattern = this.analyzeThreatPattern(behaviorData.threats);
      if (threatPattern.confidence > 0.5) {
        await db.recordPattern(
          guildId,
          userId,
          "threat_pattern",
          threatPattern,
          threatPattern.confidence
        );
      }
    }

    return patterns;
  }

  static analyzeMessagePattern(messages) {
    if (!messages || messages.length === 0) {
      return { confidence: 0, pattern: "insufficient_data" };
    }

    const avgLength =
      messages.reduce((sum, m) => sum + (m.length || 0), 0) / messages.length;
    const hasLinks = messages.some((m) => /https?:\/\//.test(m));
    const hasMentions = messages.some((m) => /<@!?\d+>/.test(m));
    const hasEmojis = messages.some(
      (m) => /<:\w+:\d+>/.test(m) || /[\u{1F300}-\u{1F9FF}]/u.test(m)
    );

    const similarity = this.calculateSimilarity(messages);

    let confidence = 0.5;
    let pattern = "normal";

    if (similarity > 0.8 && messages.length > 5) {
      confidence = 0.9;
      pattern = "spam";
    } else if (hasLinks && messages.length > 3) {
      confidence = 0.7;
      pattern = "link_spam";
    } else if (hasMentions && messages.length > 5) {
      confidence = 0.75;
      pattern = "mention_spam";
    }

    return {
      confidence,
      pattern,
      avgLength,
      hasLinks,
      hasMentions,
      hasEmojis,
      similarity,
      messageCount: messages.length,
    };
  }

  static analyzeActivityPattern(activity) {
    if (!activity || activity.length === 0) {
      return { confidence: 0, pattern: "insufficient_data" };
    }

    const intervals = [];
    for (let i = 1; i < activity.length; i++) {
      intervals.push(activity[i] - activity[i - 1]);
    }

    const avgInterval =
      intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
    const variance =
      intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) /
      intervals.length;

    let confidence = 0.5;
    let pattern = "normal";

    if (avgInterval < 1000 && activity.length > 10) {
      confidence = 0.9;
      pattern = "rapid_fire";
    } else if (variance < 10000 && activity.length > 5) {
      confidence = 0.75;
      pattern = "automated";
    }

    return {
      confidence,
      pattern,
      avgInterval,
      variance,
      activityCount: activity.length,
    };
  }

  static analyzeThreatPattern(threats) {
    if (!threats || threats.length === 0) {
      return { confidence: 0, pattern: "insufficient_data" };
    }

    const avgThreatScore =
      threats.reduce((sum, t) => sum + (t.score || 0), 0) / threats.length;
    const highThreatCount = threats.filter((t) => (t.score || 0) >= 80).length;

    let confidence = 0.5;
    let pattern = "normal";

    if (avgThreatScore >= 80) {
      confidence = 0.95;
      pattern = "high_threat";
    } else if (highThreatCount >= 3) {
      confidence = 0.85;
      pattern = "repeated_threats";
    } else if (avgThreatScore >= 60) {
      confidence = 0.7;
      pattern = "moderate_threat";
    }

    return {
      confidence,
      pattern,
      avgThreatScore,
      highThreatCount,
      threatCount: threats.length,
    };
  }

  static calculateSimilarity(messages) {
    if (messages.length < 2) return 0;

    let similarCount = 0;
    for (let i = 0; i < messages.length - 1; i++) {
      for (let j = i + 1; j < messages.length; j++) {
        const similarity = this.levenshteinSimilarity(messages[i], messages[j]);
        if (similarity > 0.7) {
          similarCount++;
        }
      }
    }

    return similarCount / ((messages.length * (messages.length - 1)) / 2);
  }

  static levenshteinSimilarity(str1, str2) {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1;

    const distance = this.levenshteinDistance(str1, str2);
    return 1 - distance / maxLen;
  }

  static levenshteinDistance(str1, str2) {
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

  static async getPrediction(guildId, userId) {
    const patterns = await db.getPatterns(guildId, userId);

    if (patterns.length === 0) {
      return { confidence: 0, prediction: "insufficient_data" };
    }

    const threatPatterns = patterns.filter(
      (p) => p.pattern_type === "threat_pattern"
    );
    const messagePatterns = patterns.filter(
      (p) => p.pattern_type === "message_pattern"
    );
    const activityPatterns = patterns.filter(
      (p) => p.pattern_type === "activity_pattern"
    );

    let riskScore = 0;
    let factors = [];

    threatPatterns.forEach((p) => {
      const data = p.pattern_data;
      if (data.pattern === "high_threat") {
        riskScore += 40;
        factors.push("High threat history");
      } else if (data.pattern === "repeated_threats") {
        riskScore += 30;
        factors.push("Repeated threats");
      }
    });

    messagePatterns.forEach((p) => {
      const data = p.pattern_data;
      if (data.pattern === "spam") {
        riskScore += 20;
        factors.push("Spam patterns detected");
      } else if (data.pattern === "link_spam") {
        riskScore += 15;
        factors.push("Link spam detected");
      }
    });

    activityPatterns.forEach((p) => {
      const data = p.pattern_data;
      if (data.pattern === "rapid_fire") {
        riskScore += 15;
        factors.push("Rapid-fire activity");
      } else if (data.pattern === "automated") {
        riskScore += 10;
        factors.push("Automated behavior");
      }
    });

    riskScore = Math.min(100, riskScore);

    return {
      riskScore,
      confidence: riskScore > 50 ? 0.8 : 0.5,
      prediction:
        riskScore >= 70
          ? "high_risk"
          : riskScore >= 40
          ? "moderate_risk"
          : "low_risk",
      factors,
    };
  }
}

module.exports = AILearning;
