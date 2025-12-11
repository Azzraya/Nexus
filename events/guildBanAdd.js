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
          limit: 5,
          type: 20, // MEMBER_BAN_ADD
        });

        const now = Date.now();
        const matchingEntry = auditLogs.entries.find((entry) => {
          const isRecent = now - entry.createdTimestamp < 10000; // Within 10 seconds
          const matchesTarget = entry.target && entry.target.id === ban.user.id;
          return isRecent && matchesTarget && entry.executor;
        });

        if (matchingEntry && matchingEntry.executor) {
          if (matchingEntry.executor.id !== client.user.id) {
            const executorMember = await ban.guild.members
              .fetch(matchingEntry.executor.id)
              .catch(() => null);
            const isAdmin = executorMember?.permissions.has("Administrator");

            logger.info(
              `[guildBanAdd] Ban by ${matchingEntry.executor.tag} (${matchingEntry.executor.id}) ${isAdmin ? "[ADMIN]" : ""} - monitoring for anti-nuke`
            );

            await client.advancedAntiNuke.monitorAction(
              ban.guild,
              "banAdd",
              matchingEntry.executor.id,
              { bannedUserId: ban.user.id }
            );
          } else {
            logger.debug(
              `[guildBanAdd] Skipping ban monitoring - bot executed the ban (${ban.user.id})`
            );
          }
        } else {
          logger.warn(
            `[guildBanAdd] Could not find matching audit log entry for ban of ${ban.user.tag} (${ban.user.id}) in ${ban.guild.id} - entry may be delayed or missing`
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
