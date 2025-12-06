const logger = require("../utils/logger");

module.exports = {
  name: "guildBanRemove",
  async execute(ban, client) {
    try {
      const guild = ban.guild;
      const user = ban.user;

      logger.info(
        "GuildBanRemove",
        `User unbanned: ${user.tag} (${user.id}) from ${guild.name}`
      );

      // Log to database
      const db = require("../utils/database");
      db.db.run(
        `INSERT INTO logs (guild_id, event_type, user_id, executor_id, timestamp, details)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          guild.id,
          "UNBAN",
          user.id,
          null, // Will be filled by audit log if available
          Date.now(),
          JSON.stringify({
            user_tag: user.tag,
            user_id: user.id,
          }),
        ]
      );

      // Check audit logs for who removed the ban
      try {
        const auditLogs = await guild.fetchAuditLogs({
          type: 23, // MEMBER_BAN_REMOVE
          limit: 1,
        });

        const banRemoveLog = auditLogs.entries.first();
        if (
          banRemoveLog &&
          banRemoveLog.target.id === user.id &&
          Date.now() - banRemoveLog.createdTimestamp < 5000
        ) {
          const executor = banRemoveLog.executor;
          logger.info(
            "GuildBanRemove",
            `Ban removed by: ${executor.tag} (${executor.id})`
          );

          // Update log with executor info
          db.db.run(
            `UPDATE logs SET executor_id = ? WHERE guild_id = ? AND event_type = ? AND user_id = ? AND executor_id IS NULL ORDER BY timestamp DESC LIMIT 1`,
            [executor.id, guild.id, "UNBAN", user.id]
          );

          // Potential anti-nuke check - mass unbanning
          const recentUnbans = await new Promise((resolve) => {
            db.db.all(
              `SELECT COUNT(*) as count FROM logs 
               WHERE guild_id = ? AND event_type = ? AND executor_id = ? AND timestamp > ?`,
              [guild.id, "UNBAN", executor.id, Date.now() - 60000],
              (err, rows) => {
                if (err || !rows) resolve(0);
                else resolve(rows[0].count);
              }
            );
          });

          // If someone unbanned more than 5 people in 1 minute, log as suspicious
          if (recentUnbans > 5) {
            logger.warn(
              "AntiNuke",
              `Suspicious mass unban activity detected: ${executor.tag} unbanned ${recentUnbans} users in 1 minute`
            );

            // Trigger anti-nuke if enabled
            const advancedAntiNuke = require("../utils/advancedAntiNuke");
            if (advancedAntiNuke.isEnabled(guild.id)) {
              advancedAntiNuke.handleMassAction(
                guild,
                executor,
                "mass_unban",
                recentUnbans
              );
            }
          }
        }
      } catch (auditError) {
        logger.debug(
          "GuildBanRemove",
          `Could not fetch audit logs: ${auditError.message}`
        );
      }
    } catch (error) {
      logger.error("GuildBanRemove", "Error handling ban remove", {
        message: error?.message || String(error),
        stack: error?.stack,
      });
    }
  },
};
