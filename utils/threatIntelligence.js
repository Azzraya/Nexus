const db = require("./database");
const logger = require("./logger");

class ThreatIntelligence {
  /**
   * Enhanced threat reporting with cross-server pattern detection (EXCEEDS WICK - better intelligence)
   */
  static async reportThreat(
    userId,
    threatType,
    threatData,
    severity,
    sourceGuildId
  ) {
    // Check if cross-server sharing is enabled for this server
    const config = await db.getServerConfig(sourceGuildId);
    const sharingEnabled = config?.threat_intelligence_sharing !== 0; // Default ON for existing, can be disabled

    // Check if threat already exists (only within same server if sharing disabled)
    const existing = sharingEnabled
      ? await db.getThreatIntelligence(userId)
      : await db.getThreatIntelligenceForGuild(userId, sourceGuildId);
    
    const similarThreat = existing.find(
      (t) =>
        t.threat_type === threatType && Date.now() - t.reported_at < 86400000 // Within 24 hours
    );

    if (similarThreat) {
      // Verify existing threat
      await db.verifyThreat(similarThreat.id);

      // Enhanced: Detect cross-server patterns when threat is verified (only if sharing enabled)
      if (sharingEnabled) {
        await this.detectCrossServerPattern(userId, threatType, sourceGuildId);
      }

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

    // Enhanced: Immediately check for cross-server patterns (only if sharing enabled)
    if (sharingEnabled) {
      await this.detectCrossServerPattern(userId, threatType, sourceGuildId);
    }

    return { id: threatId, verified: false };
  }

  /**
   * Enhanced cross-server pattern detection (EXCEEDS WICK - detects coordinated attacks)
   */
  static async detectCrossServerPattern(userId, threatType, sourceGuildId) {
    try {
      // Get all threats for this user across all servers
      const allThreats = await db.getThreatIntelligence(userId);

      if (allThreats.length < 2) return null; // Need at least 2 servers for pattern

      // Group by guild to find cross-server patterns
      const guildThreats = {};
      allThreats.forEach((threat) => {
        if (!guildThreats[threat.source_guild_id]) {
          guildThreats[threat.source_guild_id] = [];
        }
        guildThreats[threat.source_guild_id].push(threat);
      });

      const uniqueGuilds = Object.keys(guildThreats);

      // Pattern 1: Same threat type across multiple servers (coordinated attack)
      if (uniqueGuilds.length >= 2) {
        const sameTypeThreats = allThreats.filter(
          (t) => t.threat_type === threatType
        );
        if (sameTypeThreats.length >= 2) {
          const pattern = {
            userId,
            patternType: "coordinated_attack",
            threatType,
            affectedGuilds: uniqueGuilds.length,
            severity: "high",
            confidence: Math.min(
              100,
              (sameTypeThreats.length / uniqueGuilds.length) * 100
            ),
            detectedAt: Date.now(),
          };

          await this.storePattern(pattern);
          logger.info(
            `[ThreatIntelligence] Cross-server pattern detected: ${threatType} across ${uniqueGuilds.length} servers for user ${userId}`
          );

          return pattern;
        }
      }

      // Pattern 2: Rapid threats across multiple servers (bot network)
      const recentThreats = allThreats.filter(
        (t) => Date.now() - t.reported_at < 3600000 // Last hour
      );

      if (recentThreats.length >= 3 && uniqueGuilds.length >= 2) {
        const pattern = {
          userId,
          patternType: "rapid_cross_server",
          threatType: "multiple",
          affectedGuilds: uniqueGuilds.length,
          threatCount: recentThreats.length,
          severity: "critical",
          confidence: Math.min(100, (recentThreats.length / 5) * 100),
          detectedAt: Date.now(),
        };

        await this.storePattern(pattern);
        logger.warn(
          `[ThreatIntelligence] Rapid cross-server pattern detected: ${recentThreats.length} threats across ${uniqueGuilds.length} servers in last hour for user ${userId}`
        );

        return pattern;
      }

      return null;
    } catch (error) {
      logger.error(
        `[ThreatIntelligence] Error detecting cross-server pattern:`,
        error
      );
      return null;
    }
  }

  /**
   * Store detected pattern for analytics (EXCEEDS WICK - pattern tracking)
   */
  static async storePattern(pattern) {
    return new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO threat_patterns (user_id, pattern_type, threat_type, affected_guilds, severity, confidence, detected_at, pattern_data) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pattern.userId,
          pattern.patternType,
          pattern.threatType,
          pattern.affectedGuilds,
          pattern.severity,
          pattern.confidence,
          pattern.detectedAt,
          JSON.stringify(pattern),
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Enhanced threat checking with cross-server analytics (EXCEEDS WICK - better intelligence)
   */
  static async checkThreat(userId, guildId = null) {
    // If guildId provided, check if cross-server sharing is enabled
    let threats;
    if (guildId) {
      const config = await db.getServerConfig(guildId);
      const sharingEnabled = config?.threat_intelligence_sharing !== 0;
      
      if (sharingEnabled) {
        threats = await db.getThreatIntelligence(userId);
      } else {
        // Only check threats from this server
        threats = await db.getThreatIntelligenceForGuild(userId, guildId);
      }
    } else {
      // No guild context - get all (for admin/global checks)
      threats = await db.getThreatIntelligence(userId);
    }

    if (threats.length === 0) {
      return {
        hasThreat: false,
        riskScore: 0,
        threatCount: 0,
        verifiedCount: 0,
        recentCount: 0,
        crossServerCount: 0,
        patterns: [],
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

    // Enhanced: Check for cross-server patterns
    const patterns = await this.getUserPatterns(userId);
    const crossServerThreats = threats.filter(
      (t) => t.source_guild_id !== guildId
    );

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

    // Enhanced: Cross-server threats add significant risk (EXCEEDS WICK - network-wide intelligence)
    if (crossServerThreats.length > 0) {
      const crossServerMultiplier = 1.5; // 50% bonus for cross-server threats
      riskScore += Math.min(
        30,
        crossServerThreats.length * 5 * crossServerMultiplier
      );
    }

    // Enhanced: Pattern-based risk adjustment
    if (patterns.length > 0) {
      const patternRisk = patterns.reduce((sum, p) => {
        if (p.severity === "critical") return sum + 20;
        if (p.severity === "high") return sum + 15;
        if (p.severity === "medium") return sum + 10;
        return sum + 5;
      }, 0);
      riskScore += Math.min(25, patternRisk);
    }

    riskScore = Math.min(100, riskScore);

    return {
      hasThreat: riskScore >= settings.risk_threshold,
      riskScore,
      threatCount: threats.length,
      verifiedCount: verifiedThreats.length,
      recentCount: recentThreats.length,
      crossServerCount: crossServerThreats.length,
      patterns: patterns.slice(0, 3), // Most recent 3 patterns
      threats: threats.slice(0, 5), // Most recent 5
      analytics: {
        uniqueGuilds: new Set(threats.map((t) => t.source_guild_id)).size,
        threatTypes: this.groupByType(threats),
        timeline: this.getThreatTimeline(threats),
      },
    };
  }

  /**
   * Get patterns detected for a user (EXCEEDS WICK - pattern analytics)
   */
  static async getUserPatterns(userId) {
    return new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM threat_patterns WHERE user_id = ? ORDER BY detected_at DESC LIMIT 10",
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const patterns = (rows || []).map((row) => {
              try {
                return {
                  ...row,
                  patternData: JSON.parse(row.pattern_data || "{}"),
                };
              } catch {
                return row;
              }
            });
            resolve(patterns);
          }
        }
      );
    });
  }

  /**
   * Group threats by type for analytics (EXCEEDS WICK - better insights)
   */
  static groupByType(threats) {
    const grouped = {};
    threats.forEach((threat) => {
      if (!grouped[threat.threat_type]) {
        grouped[threat.threat_type] = 0;
      }
      grouped[threat.threat_type]++;
    });
    return grouped;
  }

  /**
   * Get threat timeline for analytics (EXCEEDS WICK - temporal analysis)
   */
  static getThreatTimeline(threats) {
    const now = Date.now();
    const timeline = {
      last24h: 0,
      last7d: 0,
      last30d: 0,
      allTime: threats.length,
    };

    threats.forEach((threat) => {
      const age = now - threat.reported_at;
      if (age < 86400000) timeline.last24h++;
      if (age < 604800000) timeline.last7d++;
      if (age < 2592000000) timeline.last30d++;
    });

    return timeline;
  }

  /**
   * Enhanced threat summary with cross-server analytics (EXCEEDS WICK - comprehensive insights)
   */
  static async getThreatSummary(userId) {
    const threats = await db.getThreatIntelligence(userId);
    const patterns = await this.getUserPatterns(userId);

    const summary = {
      total: threats.length,
      byType: {},
      bySeverity: {},
      verified: threats.filter((t) => t.verified).length,
      recent: threats.filter((t) => Date.now() - t.reported_at < 604800000)
        .length,
      crossServer: {
        uniqueGuilds: new Set(threats.map((t) => t.source_guild_id)).size,
        threats: threats.filter((t) => t.source_guild_id).length,
      },
      patterns: {
        total: patterns.length,
        byType: {},
        critical: patterns.filter((p) => p.severity === "critical").length,
      },
      timeline: this.getThreatTimeline(threats),
    };

    threats.forEach((threat) => {
      summary.byType[threat.threat_type] =
        (summary.byType[threat.threat_type] || 0) + 1;
      summary.bySeverity[threat.severity] =
        (summary.bySeverity[threat.severity] || 0) + 1;
    });

    patterns.forEach((pattern) => {
      summary.patterns.byType[pattern.pattern_type] =
        (summary.patterns.byType[pattern.pattern_type] || 0) + 1;
    });

    return summary;
  }

  /**
   * Get cross-server attack analytics (EXCEEDS WICK - network-wide intelligence)
   */
  static async getCrossServerAnalytics(timeWindow = 7 * 24 * 60 * 60 * 1000) {
    const since = Date.now() - timeWindow;

    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT 
          user_id,
          COUNT(DISTINCT source_guild_id) as guild_count,
          COUNT(*) as threat_count,
          MAX(reported_at) as last_seen
         FROM threat_intelligence 
         WHERE reported_at > ? AND verified = 1
         GROUP BY user_id
         HAVING guild_count >= 2
         ORDER BY threat_count DESC, guild_count DESC
         LIMIT 100`,
        [since],
        (err, rows) => {
          if (err) reject(err);
          else {
            const analytics = {
              totalUsers: rows.length,
              topThreats: rows.slice(0, 10).map((row) => ({
                userId: row.user_id,
                affectedGuilds: row.guild_count,
                threatCount: row.threat_count,
                lastSeen: row.last_seen,
              })),
              totalCrossServerThreats: rows.reduce(
                (sum, r) => sum + r.threat_count,
                0
              ),
              averageGuildsPerThreat:
                rows.length > 0
                  ? rows.reduce((sum, r) => sum + r.guild_count, 0) /
                    rows.length
                  : 0,
            };
            resolve(analytics);
          }
        }
      );
    });
  }

  /**
   * Detect coordinated attack patterns across multiple servers (EXCEEDS WICK - advanced pattern detection)
   */
  static async detectCoordinatedAttack(userIds, timeWindow = 3600000) {
    const since = Date.now() - timeWindow;

    return new Promise((resolve, reject) => {
      const placeholders = userIds.map(() => "?").join(",");
      db.db.all(
        `SELECT 
          source_guild_id,
          threat_type,
          COUNT(*) as count,
          COUNT(DISTINCT user_id) as user_count
         FROM threat_intelligence 
         WHERE user_id IN (${placeholders}) AND reported_at > ?
         GROUP BY source_guild_id, threat_type
         HAVING count >= 3 OR user_count >= 3
         ORDER BY count DESC`,
        [...userIds, since],
        (err, rows) => {
          if (err) reject(err);
          else {
            const patterns = rows.map((row) => ({
              guildId: row.source_guild_id,
              threatType: row.threat_type,
              threatCount: row.count,
              uniqueUsers: row.user_count,
              isCoordinated: row.count >= 5 || row.user_count >= 5,
            }));

            resolve({
              isCoordinated: patterns.some((p) => p.isCoordinated),
              patterns,
              totalAffectedGuilds: new Set(patterns.map((p) => p.guildId)).size,
            });
          }
        }
      );
    });
  }
}

module.exports = ThreatIntelligence;
