const db = require("./database");
const logger = require("./logger");

class Security {
  // Advanced threat detection
  static async detectThreat(guild, user, action) {
    const threatScore = await this.calculateThreatScore(guild, user, action);

    const result = {
      level:
        threatScore >= 80
          ? "critical"
          : threatScore >= 60
          ? "high"
          : threatScore >= 40
          ? "medium"
          : threatScore >= 20
          ? "low"
          : "safe",
      score: threatScore,
      action:
        threatScore >= 80
          ? "ban"
          : threatScore >= 60
          ? "kick"
          : threatScore >= 40
          ? "mute"
          : threatScore >= 20
          ? "warn"
          : null,
    };

    // Note: Notifications will be sent from the calling code with client
    // This keeps Security utility independent of Discord client

    return result;
  }

  static async calculateThreatScore(guild, user, action) {
    let score = 0;

    // Account age check
    const accountAge = Date.now() - user.createdTimestamp;
    const daysOld = accountAge / (1000 * 60 * 60 * 24);
    if (daysOld < 1) score += 30;
    else if (daysOld < 7) score += 20;
    else if (daysOld < 30) score += 10;

    // Check for suspicious username patterns
    const username = user.username.toLowerCase();
    if (/\d{4,}/.test(username)) score += 15; // Many numbers
    if (/^[a-z]\d{3,}$/.test(username)) score += 10; // Bot-like pattern
    if (username.length < 3) score += 20; // Very short

    // Check for no avatar (common in bot accounts)
    if (!user.avatar) score += 15;

    // Check for default discriminator
    if (parseInt(user.discriminator) < 1000) score += 10;

    // Check action history
    const modLogs = await db.getModLogs(guild.id, user.id, 100);
    const recentActions = modLogs.filter(
      (log) => Date.now() - log.timestamp < 3600000
    ); // Last hour
    score += recentActions.length * 5;

    // Check warnings
    const warnings = await db.getWarnings(guild.id, user.id);
    score += warnings.length * 10;

    // Check heat score
    const heatScore = await db.getHeatScore(guild.id, user.id);
    score += Math.min(heatScore / 10, 30); // Cap at 30

    return Math.min(score, 100); // Cap at 100
  }

  // IP-based detection (simplified - would need actual IP tracking)
  static async detectSuspiciousPatterns(guild, members) {
    const patterns = {
      similarUsernames: 0,
      similarAvatars: 0,
      similarCreationDates: 0,
      noAvatars: 0,
    };

    const usernames = members.map((m) => m.user.username.toLowerCase());
    const creationDates = members.map((m) => m.user.createdTimestamp);

    // Check for similar usernames
    for (let i = 0; i < usernames.length; i++) {
      for (let j = i + 1; j < usernames.length; j++) {
        const similarity = this.stringSimilarity(usernames[i], usernames[j]);
        if (similarity > 0.7) patterns.similarUsernames++;
      }
    }

    // Check for similar creation dates (within 1 hour)
    for (let i = 0; i < creationDates.length; i++) {
      for (let j = i + 1; j < creationDates.length; j++) {
        if (Math.abs(creationDates[i] - creationDates[j]) < 3600000) {
          patterns.similarCreationDates++;
        }
      }
    }

    // Check for no avatars
    patterns.noAvatars = members.filter((m) => !m.user.avatar).length;

    return patterns;
  }

  static stringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1.0;
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
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

  // Advanced nuke detection
  static async detectNukeAttempt(guild, user, actions) {
    const timeWindow = 5000; // 5 seconds
    const actionThreshold = 5;

    const recentActions = actions.filter(
      (a) => Date.now() - a.timestamp < timeWindow
    );

    if (recentActions.length >= actionThreshold) {
      // Calculate severity
      const destructiveActions = recentActions.filter((a) =>
        ["channelDelete", "roleDelete", "ban", "kick"].includes(a.action)
      );

      if (destructiveActions.length >= 3) {
        return {
          isNuke: true,
          severity: "critical",
          actions: recentActions,
          recommendation: "ban",
        };
      }
    }

    return { isNuke: false };
  }

  // Security audit
  static async auditSecurity(guild) {
    const audit = {
      vulnerabilities: [],
      recommendations: [],
      score: 100,
    };

    const config = await db.getServerConfig(guild.id);

    // Check anti-raid
    if (!config || !config.anti_raid_enabled) {
      audit.vulnerabilities.push("Anti-raid protection is disabled");
      audit.score -= 20;
    }

    // Check anti-nuke
    if (!config || !config.anti_nuke_enabled) {
      audit.vulnerabilities.push("Anti-nuke protection is disabled");
      audit.score -= 20;
    }

    // Check mod log channel
    if (!config || !config.mod_log_channel) {
      audit.vulnerabilities.push("No moderation log channel configured");
      audit.score -= 10;
    }

    // Check verification level
    if (guild.verificationLevel < 2) {
      audit.vulnerabilities.push("Low verification level");
      audit.score -= 10;
    }

    // Check 2FA requirement
    if (!guild.members.me.permissions.has("ADMINISTRATOR")) {
      audit.recommendations.push("Enable 2FA requirement for moderators");
    }

    return audit;
  }
}

module.exports = Security;
