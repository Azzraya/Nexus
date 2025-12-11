const Notifications = require("../utils/notifications");
const ModerationQueue = require("../utils/moderationQueue");
const logger = require("../utils/logger");

module.exports = {
  name: "guildBanAdd",
  async execute(ban, client) {
    // Advanced anti-nuke monitoring
    if (client.advancedAntiNuke) {
      try {
        const auditLogs = await ban.guild.fetchAuditLogs({
          limit: 1,
          type: 20, // MEMBER_BAN_ADD
        });
        const entry = auditLogs.entries.first();
        if (entry && entry.executor) {
          // Check if executor is admin
          const executorMember = await ban.guild.members.fetch(entry.executor.id).catch(() => null);
          const isAdmin = executorMember?.permissions.has("Administrator");
          
          logger.info(
            `[guildBanAdd] Ban by ${entry.executor.tag} (${entry.executor.id}) ${isAdmin ? '[ADMIN]' : ''} - monitoring for anti-nuke`
          );
          
          await client.advancedAntiNuke.monitorAction(
            ban.guild,
            "banAdd",
            entry.executor.id,
            { bannedUserId: ban.user.id }
          );
        } else {
          logger.warn(
            `[guildBanAdd] Could not find audit log entry for ban of ${ban.user.tag} (${ban.user.id})`
          );
        }
      } catch (error) {
        logger.error(`[guildBanAdd] Error monitoring ban: ${error.message}`);
        console.error(`[guildBanAdd] Error monitoring ban:`, error);
      }
    }

    // Check for mass bans
    const recentBans = await new Promise((resolve, reject) => {
      client.db.db.all(
        "SELECT COUNT(*) as count FROM moderation_logs WHERE guild_id = ? AND action = 'ban' AND timestamp > ?",
        [ban.guild.id, Date.now() - 60000], // Last minute
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows?.[0]?.count || 0);
        }
      );
    });

    if (recentBans >= 5) {
      await Notifications.send(
        ban.guild.id,
        "mass_ban",
        {
          userId: ban.user.id,
          count: recentBans + 1,
          details: `${recentBans + 1} users banned in the last minute`,
        },
        client
      );
    }

    // Add to moderation queue for review
    try {
      await ModerationQueue.add(
        ban.guild,
        ban.user,
        "ban",
        ban.reason || "No reason provided",
        { autoDetected: true }
      );
    } catch (error) {
      console.error("Failed to add to moderation queue:", error);
    }
  },
};
