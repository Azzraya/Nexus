const Notifications = require("../utils/notifications");
const ModerationQueue = require("../utils/moderationQueue");
const logger = require("../utils/logger");

module.exports = {
  name: "guildBanAdd",
  async execute(ban, client) {
    // Advanced anti-nuke monitoring - use cached ban data instead of audit logs
    if (client.advancedAntiNuke) {
      try {
        // Get executor from cache (set when ban command is used or from previous lookup)
        const banData = client.advancedAntiNuke.getBanExecutor(
          ban.guild.id,
          ban.user.id
        );

        if (banData && banData.executorId !== client.user.id) {
          const executorMember = await ban.guild.members
            .fetch(banData.executorId)
            .catch(() => null);
          const isAdmin = executorMember?.permissions.has("Administrator");

          logger.info(
            `[guildBanAdd] Ban by ${banData.executorTag} (${banData.executorId}) ${isAdmin ? "[ADMIN]" : ""} - monitoring for anti-nuke (from cache)`
          );

          // Track in event-based tracker
          if (client.eventActionTracker) {
            client.eventActionTracker.trackAction(
              ban.guild.id,
              "MEMBER_BAN_ADD",
              banData.executorId,
              { bannedUserId: ban.user.id }
            );
          }
          
          await client.advancedAntiNuke.monitorAction(
            ban.guild,
            "banAdd",
            banData.executorId,
            { bannedUserId: ban.user.id }
          );
        } else if (!banData) {
          // If not in cache, do one-time audit log lookup and cache it (fallback only)
          try {
            const auditLogs = await ban.guild.fetchAuditLogs({
              limit: 10,
              type: 20, // MEMBER_BAN_ADD
            });

            const now = Date.now();
            const matchingEntry = auditLogs.entries.find((entry) => {
              const isRecent = now - entry.createdTimestamp < 30000;
              const matchesTarget =
                entry.target && entry.target.id === ban.user.id;
              return isRecent && matchesTarget && entry.executor;
            });

            if (
              matchingEntry &&
              matchingEntry.executor &&
              matchingEntry.executor.id !== client.user.id
            ) {
              // Cache it for future use (no more audit log calls for this ban)
              client.advancedAntiNuke.cacheBan(
                ban.guild.id,
                ban.user.id,
                matchingEntry.executor.id,
                matchingEntry.executor.tag
              );

              const executorMember = await ban.guild.members
                .fetch(matchingEntry.executor.id)
                .catch(() => null);
              const isAdmin = executorMember?.permissions.has("Administrator");

              logger.info(
                `[guildBanAdd] Ban by ${matchingEntry.executor.tag} (${matchingEntry.executor.id}) ${isAdmin ? "[ADMIN]" : ""} - monitoring for anti-nuke (cached for future)`
              );

              // Track in event-based tracker
              if (client.eventActionTracker) {
                client.eventActionTracker.trackAction(
                  ban.guild.id,
                  "MEMBER_BAN_ADD",
                  matchingEntry.executor.id,
                  { bannedUserId: ban.user.id }
                );
              }
              
              await client.advancedAntiNuke.monitorAction(
                ban.guild,
                "banAdd",
                matchingEntry.executor.id,
                { bannedUserId: ban.user.id }
              );
            } else {
              logger.debug(
                `[guildBanAdd] Could not determine executor for ban of ${ban.user.tag} (${ban.user.id}) - may be from external source`
              );
            }
          } catch (auditError) {
            logger.debug(
              `[guildBanAdd] Could not fetch audit logs for ban tracking: ${auditError.message}`
            );
          }
        } else {
          logger.debug(
            `[guildBanAdd] Skipping ban monitoring - bot executed the ban (${ban.user.id})`
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
