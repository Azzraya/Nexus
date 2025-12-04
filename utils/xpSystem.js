const db = require("./database");
const logger = require("./logger");
const { EmbedBuilder } = require("discord.js");

class XPSystem {
  constructor(client) {
    this.client = client;
    this.cooldowns = new Map(); // user_guild -> last_xp_time
  }

  // Calculate level from XP
  calculateLevel(xp) {
    // Formula: level = floor(0.1 * sqrt(xp))
    // This creates a smooth progression curve
    return Math.floor(0.1 * Math.sqrt(xp));
  }

  // Calculate XP needed for next level
  xpForLevel(level) {
    // Inverse of calculateLevel formula
    return Math.pow((level + 1) * 10, 2);
  }

  // Award XP for message
  async awardMessageXP(message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const guildId = message.guild.id;
    const userId = message.author.id;
    const key = `${userId}_${guildId}`;

    // Get config
    const config = await db.getXPConfig(guildId);
    if (!config.enabled) return;

    // Check cooldown
    const lastGain = this.cooldowns.get(key);
    if (lastGain && Date.now() - lastGain < config.xp_cooldown) {
      return; // Still on cooldown
    }

    // Check ignored channels/roles
    if (config.ignored_channels) {
      const ignored = config.ignored_channels.split(",");
      if (ignored.includes(message.channel.id)) return;
    }

    if (config.ignored_roles) {
      const member = message.member;
      const ignored = config.ignored_roles.split(",");
      if (member.roles.cache.some(role => ignored.includes(role.id))) return;
    }

    // Calculate XP with multipliers
    let xpGain = config.xp_per_message || 15;
    xpGain += Math.floor(Math.random() * 10); // Random bonus 0-9

    // Apply role multipliers
    if (config.multiplier_roles) {
      try {
        const multipliers = JSON.parse(config.multiplier_roles);
        const member = message.member;
        for (const [roleId, multiplier] of Object.entries(multipliers)) {
          if (member.roles.cache.has(roleId)) {
            xpGain = Math.floor(xpGain * multiplier);
          }
        }
      } catch (e) {
        // Invalid JSON, skip multipliers
      }
    }

    // Get current XP
    const userData = await db.getUserXP(guildId, userId);
    const oldXP = userData ? userData.xp : 0;
    const oldLevel = userData ? userData.level : 0;

    // Add XP
    await db.addUserXP(guildId, userId, xpGain, 'message');
    this.cooldowns.set(key, Date.now());

    // Check for level up
    const newXP = oldXP + xpGain;
    const newLevel = this.calculateLevel(newXP);

    if (newLevel > oldLevel) {
      await this.handleLevelUp(message, newLevel, config);
    }
  }

  // Handle level up
  async handleLevelUp(message, newLevel, config) {
    const guildId = message.guild.id;
    const userId = message.author.id;

    // Update level in database
    await db.updateUserLevel(guildId, userId, newLevel);

    // Check for level rewards
    const rewards = await db.getLevelRewards(guildId);
    const levelReward = rewards.find(r => r.level === newLevel);

    if (levelReward) {
      try {
        const role = message.guild.roles.cache.get(levelReward.role_id);
        if (role) {
          await message.member.roles.add(role);
        }
      } catch (error) {
        logger.error(`[XP] Failed to add level reward role:`, error);
      }
    }

    // Send level up message
    const levelUpMessage = (config.level_up_message || 'GG {user}, you just advanced to level {level}!')
      .replace('{user}', `<@${userId}>`)
      .replace('{level}', newLevel)
      .replace('{role}', levelReward ? `<@&${levelReward.role_id}>` : 'None');

    const embed = new EmbedBuilder()
      .setTitle('🎉 Level Up!')
      .setDescription(levelUpMessage)
      .setColor(0x00ff88)
      .addFields(
        { name: 'New Level', value: `${newLevel}`, inline: true },
        { name: 'Next Level', value: `${this.xpForLevel(newLevel)} XP`, inline: true }
      )
      .setThumbnail(message.author.displayAvatarURL())
      .setTimestamp();

    // Send to configured channel or current channel
    const channel = config.level_up_channel
      ? message.guild.channels.cache.get(config.level_up_channel)
      : message.channel;

    if (channel) {
      try {
        await channel.send({ embeds: [embed] });
      } catch (error) {
        logger.error(`[XP] Failed to send level up message:`, error);
      }
    }

    // Check for achievements
    this.checkLevelAchievements(guildId, userId, newLevel);
  }

  // Award XP for voice activity
  async awardVoiceXP(member, minutes) {
    const guildId = member.guild.id;
    const userId = member.id;

    const config = await db.getXPConfig(guildId);
    if (!config.enabled) return;

    const xpGain = (config.xp_per_minute_voice || 10) * minutes;

    // Get current data
    const userData = await db.getUserXP(guildId, userId);
    const oldXP = userData ? userData.xp : 0;
    const oldLevel = userData ? userData.level : 0;

    // Update voice minutes and XP
    await new Promise((resolve, reject) => {
      db.db.run(
        `UPDATE user_xp SET xp = xp + ?, voice_minutes = voice_minutes + ? WHERE guild_id = ? AND user_id = ?`,
        [xpGain, minutes, guildId, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Check for level up
    const newXP = oldXP + xpGain;
    const newLevel = this.calculateLevel(newXP);

    if (newLevel > oldLevel) {
      // Create a fake message object for level up
      const fakeMessage = {
        guild: member.guild,
        author: member.user,
        member: member,
        channel: null
      };
      await this.handleLevelUp(fakeMessage, newLevel, config);
    }
  }

  // Check for level-based achievements
  async checkLevelAchievements(guildId, userId, level) {
    const milestones = [10, 25, 50, 75, 100];
    if (milestones.includes(level)) {
      const achievementId = `level_${level}`;
      await db.unlockAchievement(guildId, userId, achievementId);
    }
  }
}

module.exports = XPSystem;

