const Notifications = require("../utils/notifications");
const ModerationQueue = require("../utils/moderationQueue");

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
          await client.advancedAntiNuke.monitorAction(
            ban.guild,
            "banAdd",
            entry.executor.id,
            { bannedUserId: ban.user.id }
          );
        }
      } catch (error) {
        // Ignore audit log errors
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
