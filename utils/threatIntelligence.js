const db = require("./database");

class ThreatIntelligence {
  static async reportThreat(
    userId,
    threatType,
    threatData,
    severity,
    sourceGuildId
  ) {
    // Check if threat already exists
    const existing = await db.getThreatIntelligence(userId);
    const similarThreat = existing.find(
      (t) =>
        t.threat_type === threatType && Date.now() - t.reported_at < 86400000 // Within 24 hours
    );

    if (similarThreat) {
      // Verify existing threat
      await db.verifyThreat(similarThreat.id);
      return { id: similarThreat.id, verified: true };
    }

    // Create new threat report
    const threatId = await db.reportThreat(
      userId,
      threatType,
      threatData,
      severity,
      sourceGuildId
    );
    return { id: threatId, verified: false };
  }

  static async checkThreat(userId, guildId = null) {
    const threats = await db.getThreatIntelligence(userId);

    if (threats.length === 0) {
      return {
        hasThreat: false,
        riskScore: 0,
        threatCount: 0,
        verifiedCount: 0,
        recentCount: 0,
        threats: [],
      };
    }

    // Get guild-specific sensitivity settings (or defaults)
    const settings = guildId
      ? await db.getThreatSensitivity(guildId)
      : {
          risk_threshold: 30,
          severity_critical: 40,
          severity_high: 30,
          severity_medium: 20,
          severity_low: 10,
          recent_multiplier: 5,
          recent_days: 7,
        };

    // Calculate risk score using configured weights
    let riskScore = 0;
    const verifiedThreats = threats.filter((t) => t.verified);

    verifiedThreats.forEach((threat) => {
      if (threat.severity === "critical")
        riskScore += settings.severity_critical;
      else if (threat.severity === "high") riskScore += settings.severity_high;
      else if (threat.severity === "medium")
        riskScore += settings.severity_medium;
      else riskScore += settings.severity_low;
    });

    // Recent threats weigh more (using configured multiplier and days)
    const recentThreats = threats.filter(
      (t) => Date.now() - t.reported_at < settings.recent_days * 86400000
    );
    riskScore += recentThreats.length * settings.recent_multiplier;

    riskScore = Math.min(100, riskScore);

    return {
      hasThreat: riskScore >= settings.risk_threshold,
      riskScore,
      threatCount: threats.length,
      verifiedCount: verifiedThreats.length,
      recentCount: recentThreats.length,
      threats: threats.slice(0, 5), // Most recent 5
    };
  }

  static async getThreatSummary(userId) {
    const threats = await db.getThreatIntelligence(userId);

    const summary = {
      total: threats.length,
      byType: {},
      bySeverity: {},
      verified: threats.filter((t) => t.verified).length,
      recent: threats.filter((t) => Date.now() - t.reported_at < 604800000)
        .length,
    };

    threats.forEach((threat) => {
      summary.byType[threat.threat_type] =
        (summary.byType[threat.threat_type] || 0) + 1;
      summary.bySeverity[threat.severity] =
        (summary.bySeverity[threat.severity] || 0) + 1;
    });

    return summary;
  }
}

module.exports = ThreatIntelligence;
