const db = require("./database");

class JoinGate {
  /**
   * Check if a member should be filtered by join gate
   * @param {GuildMember} member - The member to check
   * @param {Guild} guild - The guild
   * @returns {Object} - { filtered: boolean, reason: string, action: string }
   */
  static async checkMember(member, guild) {
    const config = await this.getConfig(guild.id);

    if (!config || !config.enabled) {
      return { filtered: false, reason: null, action: null };
    }

    // Get threat sensitivity settings to adjust thresholds
    const sensitivity = await db.getThreatSensitivity(guild.id);
    const sensitivityMultiplier = sensitivity.risk_threshold / 30; // 1.0 = default

    const checks = [];

    // 1. Check for bots added by unauthorized members
    if (config.target_unauthorized_bots && member.user.bot) {
      const inviter = await this.getInviter(member, guild);
      if (inviter && !this.isAuthorized(inviter, guild, config)) {
        checks.push({
          filtered: true,
          reason: "Bot added by unauthorized member",
          action: config.action || "kick",
        });
      }
    }

    // 2. Check account age
    if (config.target_new_accounts && config.min_account_age_days) {
      const accountAge = Date.now() - member.user.createdTimestamp;
      const daysOld = accountAge / (1000 * 60 * 60 * 24);

      if (daysOld < config.min_account_age_days) {
        checks.push({
          filtered: true,
          reason: `Account too new (${Math.floor(daysOld)} days old, minimum ${
            config.min_account_age_days
          } days)`,
          action: config.action || "kick",
        });
      }
    }

    // 3. Check for no profile picture
    if (config.target_no_avatar && !member.user.avatar) {
      checks.push({
        filtered: true,
        reason: "No profile picture",
        action: config.action || "kick",
      });
    }

    // 4. Check for unverified bots
    if (
      config.target_unverified_bots &&
      member.user.bot &&
      !member.user.verified
    ) {
      checks.push({
        filtered: true,
        reason: "Unverified Discord bot",
        action: config.action || "kick",
      });
    }

    // 5. Check for invite links in username
    if (config.target_invite_usernames) {
      const invitePattern =
        /(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/gi;
      if (
        invitePattern.test(member.user.username) ||
        invitePattern.test(member.displayName)
      ) {
        checks.push({
          filtered: true,
          reason: "Invite link in username/nickname",
          action: config.action || "ban",
        });
      }
    }

    // 6. Check for suspicious accounts (using security system)
    if (config.target_suspicious) {
      const Security = require("./security");
      const threat = await Security.detectThreat(guild, member.user, "join");

      // Adjust suspicious threshold based on sensitivity (less sensitive = higher threshold needed)
      const baseSuspiciousThreshold = config.suspicious_threshold || 60;
      const adjustedSuspiciousThreshold = Math.ceil(
        baseSuspiciousThreshold * sensitivityMultiplier
      );
      const banThreshold = Math.ceil(80 * sensitivityMultiplier);

      if (threat.score >= adjustedSuspiciousThreshold) {
        checks.push({
          filtered: true,
          reason: `Suspicious account (threat score: ${threat.score})`,
          action:
            threat.score >= banThreshold ? "ban" : config.action || "kick",
        });
      }
    }

    // 7. Check for certain nicknames (strict words)
    if (config.strict_words && config.strict_words.length > 0) {
      const nickname = member.displayName.toLowerCase();
      const username = member.user.username.toLowerCase();

      for (const word of config.strict_words) {
        if (
          nickname.includes(word.toLowerCase()) ||
          username.includes(word.toLowerCase())
        ) {
          checks.push({
            filtered: true,
            reason: `Contains restricted word: ${word}`,
            action: config.action || "ban",
          });
          break;
        }
      }
    }

    // 8. Check for wildcard patterns
    if (config.wildcard_words && config.wildcard_words.length > 0) {
      const nickname = member.displayName.toLowerCase();
      const username = member.user.username.toLowerCase();

      for (const pattern of config.wildcard_words) {
        try {
          const regex = new RegExp(
            pattern.toLowerCase().replace(/\*/g, ".*"),
            "i"
          );
          if (regex.test(nickname) || regex.test(username)) {
            checks.push({
              filtered: true,
              reason: `Matches wildcard pattern: ${pattern}`,
              action: config.action || "ban",
            });
            break;
          }
        } catch (e) {
          // Invalid regex pattern
        }
      }
    }

    // Return the first matching check (most severe)
    if (checks.length > 0) {
      return checks[0];
    }

    return { filtered: false, reason: null, action: null };
  }

  /**
   * Get join gate configuration
   */
  static async getConfig(guildId) {
    return new Promise((resolve, reject) => {
      db.db.get(
        "SELECT * FROM join_gate_config WHERE guild_id = ?",
        [guildId],
        (err, row) => {
          if (err) reject(err);
          else {
            if (row) {
              resolve({
                enabled: row.enabled === 1,
                target_unauthorized_bots: row.target_unauthorized_bots === 1,
                target_new_accounts: row.target_new_accounts === 1,
                min_account_age_days: row.min_account_age_days || 7,
                target_no_avatar: row.target_no_avatar === 1,
                target_unverified_bots: row.target_unverified_bots === 1,
                target_invite_usernames: row.target_invite_usernames === 1,
                target_suspicious: row.target_suspicious === 1,
                suspicious_threshold: row.suspicious_threshold || 60,
                action: row.action || "kick",
                strict_words: row.strict_words
                  ? JSON.parse(row.strict_words)
                  : [],
                wildcard_words: row.wildcard_words
                  ? JSON.parse(row.wildcard_words)
                  : [],
                authorized_roles: row.authorized_roles
                  ? JSON.parse(row.authorized_roles)
                  : [],
              });
            } else {
              resolve(null);
            }
          }
        }
      );
    });
  }

  /**
   * Set join gate configuration
   */
  static async setConfig(guildId, updates) {
    const current = await this.getConfig(guildId);
    const config = { ...current, ...updates };

    return new Promise((resolve, reject) => {
      db.db.run(
        `INSERT OR REPLACE INTO join_gate_config (
          guild_id, enabled, target_unauthorized_bots, target_new_accounts,
          min_account_age_days, target_no_avatar, target_unverified_bots,
          target_invite_usernames, target_suspicious, suspicious_threshold,
          action, strict_words, wildcard_words, authorized_roles
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          guildId,
          config.enabled ? 1 : 0,
          config.target_unauthorized_bots ? 1 : 0,
          config.target_new_accounts ? 1 : 0,
          config.min_account_age_days || 7,
          config.target_no_avatar ? 1 : 0,
          config.target_unverified_bots ? 1 : 0,
          config.target_invite_usernames ? 1 : 0,
          config.target_suspicious ? 1 : 0,
          config.suspicious_threshold || 60,
          config.action || "kick",
          JSON.stringify(config.strict_words || []),
          JSON.stringify(config.wildcard_words || []),
          JSON.stringify(config.authorized_roles || []),
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Get who invited the member (if available via audit logs)
   */
  static async getInviter(member, guild) {
    try {
      const auditLogs = await guild.fetchAuditLogs({
        type: 20, // MEMBER_UPDATE (bot add)
        limit: 10,
      });

      const entry = auditLogs.entries.find(
        (e) =>
          e.target.id === member.user.id &&
          e.createdTimestamp > Date.now() - 5000
      );

      return entry ? entry.executor : null;
    } catch {
      return null;
    }
  }

  /**
   * Check if a member is authorized to add bots
   */
  static isAuthorized(member, guild, config) {
    if (member.id === guild.ownerId) return true;
    if (member.permissions.has("Administrator")) return true;

    const authorizedRoles = config.authorized_roles || [];
    return member.roles.cache.some((role) => authorizedRoles.includes(role.id));
  }
}

module.exports = JoinGate;
