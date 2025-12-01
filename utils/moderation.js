const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("./database");
const logger = require("./logger");

class Moderation {
  static async ban(guild, user, moderator, reason, deleteDays = 0) {
    try {
      const member = await guild.members.fetch(user.id);
      await member.ban({ reason, deleteMessageDays: deleteDays });

      await db.addModLog(guild.id, user.id, moderator.id, "ban", reason);

      return { success: true, message: `Banned ${user.tag}` };
    } catch (error) {
      logger.error(`Ban failed: ${error.message}`);
      return { success: false, message: `Failed to ban: ${error.message}` };
    }
  }

  static async kick(guild, user, moderator, reason) {
    try {
      const member = await guild.members.fetch(user.id);
      await member.kick(reason);

      await db.addModLog(guild.id, user.id, moderator.id, "kick", reason);

      return { success: true, message: `Kicked ${user.tag}` };
    } catch (error) {
      logger.error(`Kick failed: ${error.message}`);
      return { success: false, message: `Failed to kick: ${error.message}` };
    }
  }

  static async mute(guild, user, moderator, reason, duration) {
    try {
      const member = await guild.members.fetch(user.id);
      await member.timeout(duration, reason);

      await db.addModLog(
        guild.id,
        user.id,
        moderator.id,
        "mute",
        reason,
        duration
      );

      return {
        success: true,
        message: `Muted ${user.tag} for ${this.formatDuration(duration)}`,
      };
    } catch (error) {
      logger.error(`Mute failed: ${error.message}`);
      return { success: false, message: `Failed to mute: ${error.message}` };
    }
  }

  static async warn(guild, user, moderator, reason) {
    try {
      await db.addWarning(guild.id, user.id, moderator.id, reason);
      const warnings = await db.getWarnings(guild.id, user.id);

      return {
        success: true,
        message: `Warned ${user.tag}. They now have ${warnings.length} warning(s).`,
      };
    } catch (error) {
      logger.error(`Warn failed: ${error.message}`);
      return { success: false, message: `Failed to warn: ${error.message}` };
    }
  }

  static async purge(channel, amount, filter = null) {
    try {
      let deleted = 0;
      let messages = await channel.messages.fetch({
        limit: Math.min(amount, 100),
      });

      if (filter) {
        messages = messages.filter(filter);
      }

      if (messages.size > 0) {
        const bulkDelete = messages.filter(
          (m) => Date.now() - m.createdTimestamp < 1209600000
        ); // 14 days
        const oldMessages = messages.filter(
          (m) => Date.now() - m.createdTimestamp >= 1209600000
        );

        if (bulkDelete.size > 0) {
          await channel.bulkDelete(bulkDelete);
          deleted += bulkDelete.size;
        }

        for (const message of oldMessages.values()) {
          try {
            await message.delete();
            deleted++;
          } catch (err) {
            // Skip if can't delete
          }
        }
      }

      return { success: true, deleted };
    } catch (error) {
      logger.error(`Purge failed: ${error.message}`);
      return { success: false, message: `Failed to purge: ${error.message}` };
    }
  }

  static formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  static createModEmbed(action, user, moderator, reason, duration = null) {
    const embed = new EmbedBuilder()
      .setTitle(`🔨 ${action.toUpperCase()}`)
      .addFields(
        { name: "User", value: `${user.tag} (${user.id})`, inline: true },
        { name: "Moderator", value: `${moderator.tag}`, inline: true },
        { name: "Reason", value: reason || "No reason provided", inline: false }
      )
      .setColor(this.getActionColor(action))
      .setTimestamp();

    if (duration) {
      embed.addFields({
        name: "Duration",
        value: this.formatDuration(duration),
        inline: true,
      });
    }

    return embed;
  }

  static getActionColor(action) {
    const colors = {
      ban: 0xff0000,
      kick: 0xff8800,
      mute: 0xffaa00,
      warn: 0xffff00,
      purge: 0x0099ff,
    };
    return colors[action.toLowerCase()] || 0x0099ff;
  }
}

module.exports = Moderation;
