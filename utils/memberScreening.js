const db = require('./database');
const logger = require('./logger');

class MemberScreening {
  constructor(client) {
    this.client = client;
  }

  /**
   * Screen a new member based on configured criteria
   * Returns { passed: boolean, reason: string, action: string }
   */
  async screenMember(member, guild) {
    const config = await db.getMemberScreeningConfig(guild.id);
    if (!config || !config.enabled) {
      return { passed: true, reason: null, action: null };
    }

    const now = Date.now();
    const accountAge = now - member.user.createdTimestamp;
    const accountAgeDays = accountAge / (1000 * 60 * 60 * 24);

    const flags = [];
    let riskScore = 0;

    // Check account age
    if (config.min_account_age_days && accountAgeDays < config.min_account_age_days) {
      flags.push(`Account too new (${Math.floor(accountAgeDays)} days old)`);
      riskScore += 30;
    }

    // Check if has avatar
    if (config.require_avatar && !member.user.avatar) {
      flags.push('No avatar');
      riskScore += 20;
    }

    // Check username patterns (suspicious characters, length)
    if (config.check_username_patterns) {
      const username = member.user.username;
      
      // Too many numbers
      const numberCount = (username.match(/[0-9]/g) || []).length;
      if (numberCount / username.length > 0.7) {
        flags.push('Suspicious username (mostly numbers)');
        riskScore += 15;
      }

      // Excessive special characters
      const specialChars = (username.match(/[^a-zA-Z0-9\s]/g) || []).length;
      if (specialChars / username.length > 0.5) {
        flags.push('Suspicious username (special characters)');
        riskScore += 15;
      }

      // Very short username
      if (username.length < 3) {
        flags.push('Very short username');
        riskScore += 10;
      }
    }

    // Check against threat intelligence
    if (config.check_threat_intel) {
      const ThreatIntelligence = require('./threatIntelligence');
      const threatCheck = await ThreatIntelligence.checkThreat(member.user.id, guild.id);
      
      if (threatCheck.hasThreat) {
        flags.push(`Known threat (risk: ${threatCheck.riskScore}%)`);
        riskScore += threatCheck.riskScore;
      }
    }

    // Check if account has default discriminator pattern (bots often have)
    if (config.check_discriminator) {
      const discriminator = parseInt(member.user.discriminator);
      if (discriminator === 0 || discriminator === 1) {
        flags.push('Default discriminator pattern');
        riskScore += 10;
      }
    }

    // Determine action based on risk score and config
    if (riskScore >= config.auto_ban_threshold) {
      return {
        passed: false,
        reason: flags.join(', '),
        action: 'ban',
        riskScore,
        flags
      };
    } else if (riskScore >= config.auto_kick_threshold) {
      return {
        passed: false,
        reason: flags.join(', '),
        action: 'kick',
        riskScore,
        flags
      };
    } else if (riskScore >= config.quarantine_threshold && config.quarantine_role) {
      return {
        passed: false,
        reason: flags.join(', '),
        action: 'quarantine',
        riskScore,
        flags
      };
    } else if (riskScore >= config.alert_threshold) {
      return {
        passed: true,
        reason: flags.join(', '),
        action: 'alert',
        riskScore,
        flags
      };
    }

    return { passed: true, reason: null, action: null, riskScore, flags };
  }

  /**
   * Execute screening action
   */
  async executeScreeningAction(member, screenResult, config) {
    try {
      const guild = member.guild;

      // Log screening
      await db.logMemberScreening(
        guild.id,
        member.user.id,
        screenResult.action,
        screenResult.reason,
        screenResult.riskScore
      );

      // Take action
      switch (screenResult.action) {
        case 'ban':
          await member.ban({ 
            reason: `Member Screening: ${screenResult.reason} (Risk: ${screenResult.riskScore}%)`,
            deleteMessageDays: 1 
          });
          logger.info(`[MemberScreening] Banned ${member.user.tag} in ${guild.name}: ${screenResult.reason}`);
          break;

        case 'kick':
          await member.kick(`Member Screening: ${screenResult.reason} (Risk: ${screenResult.riskScore}%)`);
          logger.info(`[MemberScreening] Kicked ${member.user.tag} in ${guild.name}: ${screenResult.reason}`);
          break;

        case 'quarantine':
          const role = guild.roles.cache.get(config.quarantine_role);
          if (role) {
            await member.roles.add(role);
            logger.info(`[MemberScreening] Quarantined ${member.user.tag} in ${guild.name}: ${screenResult.reason}`);
          }
          break;

        case 'alert':
          // Send alert to log channel
          await this.sendAlert(member, screenResult, config);
          logger.info(`[MemberScreening] Alert for ${member.user.tag} in ${guild.name}: ${screenResult.reason}`);
          break;
      }

      // Send notification to screening log channel
      if (config.screening_log_channel && screenResult.action !== 'alert') {
        await this.logScreening(member, screenResult, config);
      }

    } catch (error) {
      logger.error('[MemberScreening] Failed to execute action:', error);
    }
  }

  async sendAlert(member, screenResult, config) {
    if (!config.screening_log_channel) return;

    const channel = member.guild.channels.cache.get(config.screening_log_channel);
    if (!channel) return;

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Member Screening Alert')
      .setDescription(`Suspicious member joined: ${member.user}`)
      .setColor(0xffa500)
      .addFields(
        { name: 'User', value: `${member.user.tag}\n${member.user.id}`, inline: true },
        { name: 'Risk Score', value: `${screenResult.riskScore}%`, inline: true },
        { name: 'Flags', value: screenResult.flags.join('\n') || 'None', inline: false },
        { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  async logScreening(member, screenResult, config) {
    const channel = member.guild.channels.cache.get(config.screening_log_channel);
    if (!channel) return;

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setTitle('🚨 Member Screening Action')
      .setDescription(`Action taken: **${screenResult.action.toUpperCase()}**`)
      .setColor(screenResult.action === 'ban' ? 0xff0000 : screenResult.action === 'kick' ? 0xff6600 : 0xffaa00)
      .addFields(
        { name: 'User', value: `${member.user.tag}\n${member.user.id}`, inline: true },
        { name: 'Risk Score', value: `${screenResult.riskScore}%`, inline: true },
        { name: 'Reason', value: screenResult.reason, inline: false },
        { name: 'Account Age', value: `${Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24))} days`, inline: true }
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  /**
   * Get screening statistics for a server
   */
  async getScreeningStats(guildId, days = 30) {
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);
    const logs = await db.getMemberScreeningLogs(guildId, since);

    const stats = {
      total: logs.length,
      banned: logs.filter(l => l.action === 'ban').length,
      kicked: logs.filter(l => l.action === 'kick').length,
      quarantined: logs.filter(l => l.action === 'quarantine').length,
      alerted: logs.filter(l => l.action === 'alert').length,
      avgRiskScore: logs.length > 0 
        ? Math.round(logs.reduce((sum, l) => sum + l.risk_score, 0) / logs.length)
        : 0,
      topFlags: {}
    };

    // Count flag occurrences
    logs.forEach(log => {
      if (log.reason) {
        const flags = log.reason.split(', ');
        flags.forEach(flag => {
          stats.topFlags[flag] = (stats.topFlags[flag] || 0) + 1;
        });
      }
    });

    return stats;
  }
}

module.exports = MemberScreening;

