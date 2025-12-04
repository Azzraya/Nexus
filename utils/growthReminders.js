/**
 * Growth Reminders System
 * Auto-DM server owners with shareable stats to encourage viral growth
 */

const db = require("./database");
const logger = require("./logger");

class GrowthReminders {
  constructor(client) {
    this.client = client;
    this.checkInterval = null;
  }

  /**
   * Start growth reminders system
   */
  start() {
    // Check every 6 hours
    this.checkInterval = setInterval(() => {
      this.checkForReminders().catch((err) => {
        logger.error("Growth reminders check failed:", err);
      });
    }, 6 * 60 * 60 * 1000);

    // Run once on start
    this.checkForReminders().catch((err) => {
      logger.error("Initial growth reminders check failed:", err);
    });

    logger.info("[Growth] Growth reminders system started");
  }

  /**
   * Check for servers that need reminders
   */
  async checkForReminders() {
    try {
      const now = Date.now();

      // Find servers that joined 7 days ago and haven't been reminded
      const serversToRemind = await new Promise((resolve, reject) => {
        db.db.all(
          `SELECT guild_id, owner_id, timestamp 
           FROM bot_activity_log 
           WHERE event_type = 'guild_join' 
           AND timestamp BETWEEN ? AND ?
           AND guild_id NOT IN (
             SELECT guild_id FROM growth_reminders WHERE reminder_type = '7_day'
           )`,
          [
            now - 7.2 * 24 * 60 * 60 * 1000, // 7.2 days ago
            now - 6.8 * 24 * 60 * 60 * 1000, // 6.8 days ago
          ],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      logger.info(
        `[Growth] Found ${serversToRemind.length} servers to send 7-day reminders`
      );

      for (const server of serversToRemind) {
        await this.send7DayReminder(server.guild_id, server.owner_id);
        await this.sleep(1000); // Rate limit protection
      }

      // 30-day reminders
      const serversFor30Day = await new Promise((resolve, reject) => {
        db.db.all(
          `SELECT guild_id, owner_id, timestamp 
           FROM bot_activity_log 
           WHERE event_type = 'guild_join' 
           AND timestamp BETWEEN ? AND ?
           AND guild_id NOT IN (
             SELECT guild_id FROM growth_reminders WHERE reminder_type = '30_day'
           )`,
          [now - 30.2 * 24 * 60 * 60 * 1000, now - 29.8 * 24 * 60 * 60 * 1000],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      for (const server of serversFor30Day) {
        await this.send30DayReminder(server.guild_id, server.owner_id);
        await this.sleep(1000);
      }
    } catch (error) {
      logger.error("[Growth] Error checking reminders:", error);
    }
  }

  /**
   * Send 7-day reminder to server owner
   */
  async send7DayReminder(guildId, ownerId) {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return;

      const owner = await this.client.users.fetch(ownerId).catch(() => null);
      if (!owner) return;

      // Get server stats
      const stats = await this.getServerStats(guildId, 7);

      const { EmbedBuilder } = require("discord.js");

      const embed = new EmbedBuilder()
        .setTitle(`🎉 ${guild.name} - 7 Days with Nexus!`)
        .setDescription(
          `Hey ${owner.username}! Your server has been protected by Nexus for a week. Here's what we've done:`
        )
        .setThumbnail(guild.iconURL() || this.client.user.displayAvatarURL())
        .setColor(0x667eea)
        .addFields(
          {
            name: "🛡️ Threats Blocked",
            value: `**${stats.threatsBlocked}**`,
            inline: true,
          },
          {
            name: "⚔️ Raids Stopped",
            value: `**${stats.raidsBlocked}**`,
            inline: true,
          },
          {
            name: "📊 Health Score",
            value: `**${stats.healthScore}/100**`,
            inline: true,
          }
        )
        .addFields({
          name: "💡 Want to Help Nexus Grow?",
          value:
            "Share your stats with other server owners! Use `/share stats` in your server to generate a shareable message.\n\n" +
            "**Or:**\n" +
            "• Leave a review on [Top.gg](https://top.gg/bot/1444739230679957646)\n" +
            "• Share Nexus with other servers you're in\n" +
            "• Use `/refer link` to get your referral link and earn rewards!",
          inline: false,
        })
        .setFooter({
          text: "Thank you for using Nexus! 💜",
          iconURL: this.client.user.displayAvatarURL(),
        })
        .setTimestamp();

      await owner.send({ embeds: [embed] }).catch((err) => {
        logger.warn(`[Growth] Could not DM ${owner.tag}: ${err.message}`);
      });

      // Mark as sent
      await this.markReminderSent(guildId, "7_day");

      logger.info(`[Growth] Sent 7-day reminder to ${guild.name} owner`);
    } catch (error) {
      logger.error(
        `[Growth] Error sending 7-day reminder for ${guildId}:`,
        error
      );
    }
  }

  /**
   * Send 30-day reminder
   */
  async send30DayReminder(guildId, ownerId) {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return;

      const owner = await this.client.users.fetch(ownerId).catch(() => null);
      if (!owner) return;

      const stats = await this.getServerStats(guildId, 30);

      const { EmbedBuilder } = require("discord.js");

      const embed = new EmbedBuilder()
        .setTitle(`🏆 ${guild.name} - 30 Days with Nexus!`)
        .setDescription(
          `Amazing! Your server has been protected by Nexus for a whole month. Check out your stats:`
        )
        .setThumbnail(guild.iconURL() || this.client.user.displayAvatarURL())
        .setColor(0xffd700)
        .addFields(
          {
            name: "🛡️ Total Threats Blocked",
            value: `**${stats.threatsBlocked}**`,
            inline: true,
          },
          {
            name: "⚔️ Total Raids Stopped",
            value: `**${stats.raidsBlocked}**`,
            inline: true,
          },
          {
            name: "📊 Current Health",
            value: `**${stats.healthScore}/100**`,
            inline: true,
          },
          {
            name: "📈 Mod Actions",
            value: `**${stats.modActions}**`,
            inline: true,
          },
          {
            name: "👥 Members Protected",
            value: `**${guild.memberCount}**`,
            inline: true,
          },
          {
            name: "✅ Uptime",
            value: "**30 days**",
            inline: true,
          }
        )
        .addFields({
          name: "🎁 Share Your Success!",
          value:
            "Your server's security journey is impressive! Share it:\n\n" +
            "• Use `/share achievement` to show off\n" +
            "• Leave a [Top.gg review](https://top.gg/bot/1444739230679957646) (helps us grow!)\n" +
            "• Tell other server owners about Nexus\n\n" +
            "**Thank you for being an early adopter!** 💜",
          inline: false,
        })
        .setFooter({
          text: "You're awesome! Keep up the great security!",
          iconURL: this.client.user.displayAvatarURL(),
        })
        .setTimestamp();

      await owner.send({ embeds: [embed] }).catch((err) => {
        logger.warn(`[Growth] Could not DM ${owner.tag}: ${err.message}`);
      });

      await this.markReminderSent(guildId, "30_day");

      logger.info(`[Growth] Sent 30-day reminder to ${guild.name} owner`);
    } catch (error) {
      logger.error(
        `[Growth] Error sending 30-day reminder for ${guildId}:`,
        error
      );
    }
  }

  /**
   * Mark reminder as sent
   */
  async markReminderSent(guildId, type) {
    await new Promise((resolve, reject) => {
      db.db.run(
        `CREATE TABLE IF NOT EXISTS growth_reminders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          reminder_type TEXT NOT NULL,
          sent_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
          UNIQUE(guild_id, reminder_type)
        )`,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise((resolve, reject) => {
      db.db.run(
        "INSERT OR REPLACE INTO growth_reminders (guild_id, reminder_type, sent_at) VALUES (?, ?, ?)",
        [guildId, type, Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Get server stats
   */
  async getServerStats(guildId, days) {
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;

    try {
      const threatsResult = await db.query(
        "SELECT COUNT(*) as count FROM security_logs WHERE guild_id = ? AND timestamp > ? AND threat_score >= 50",
        [guildId, startTime]
      );

      const raidsResult = await db.query(
        "SELECT COUNT(*) as count FROM anti_raid_logs WHERE guild_id = ? AND timestamp > ? AND action_taken = 1",
        [guildId, startTime]
      );

      const modActionsResult = await db.query(
        "SELECT COUNT(*) as count FROM moderation_logs WHERE guild_id = ? AND timestamp > ?",
        [guildId, startTime]
      );

      const serverHealth = require("./serverHealth");
      const health = await serverHealth.calculateHealth(guildId);

      return {
        threatsBlocked: threatsResult?.[0]?.count || 0,
        raidsBlocked: raidsResult?.[0]?.count || 0,
        modActions: modActionsResult?.[0]?.count || 0,
        healthScore: health?.overall || 0,
      };
    } catch (error) {
      return {
        threatsBlocked: 0,
        raidsBlocked: 0,
        modActions: 0,
        healthScore: 0,
      };
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Stop growth reminders
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      logger.info("[Growth] Growth reminders system stopped");
    }
  }
}

module.exports = GrowthReminders;
