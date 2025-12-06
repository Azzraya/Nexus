const logger = require("../utils/logger");

module.exports = {
  name: "inviteCreate",
  async execute(invite, client) {
    try {
      const guild = invite.guild;
      const inviter = invite.inviter;

      logger.info(
        "InviteCreate",
        `Invite created in ${guild.name}: ${invite.code} by ${inviter?.tag || "Unknown"}`
      );

      // Log to database
      const db = require("../utils/database");
      db.db.run(
        `INSERT INTO logs (guild_id, event_type, user_id, timestamp, details)
         VALUES (?, ?, ?, ?, ?)`,
        [
          guild.id,
          "INVITE_CREATE",
          inviter?.id || null,
          Date.now(),
          JSON.stringify({
            invite_code: invite.code,
            channel_id: invite.channel?.id,
            channel_name: invite.channel?.name,
            max_uses: invite.maxUses,
            max_age: invite.maxAge,
            temporary: invite.temporary,
            inviter_tag: inviter?.tag,
            inviter_id: inviter?.id,
          }),
        ]
      );

      // Track invite for growth analytics
      if (inviter) {
        db.db.run(
          `INSERT OR REPLACE INTO invite_tracking (guild_id, invite_code, inviter_id, uses, created_at)
           VALUES (?, ?, ?, 0, ?)`,
          [guild.id, invite.code, inviter.id, Date.now()]
        );
      }

      // Check for mass invite creation (potential raid preparation)
      if (inviter) {
        const recentInvites = await new Promise((resolve) => {
          db.db.all(
            `SELECT COUNT(*) as count FROM logs 
             WHERE guild_id = ? AND event_type = ? AND user_id = ? AND timestamp > ?`,
            [guild.id, "INVITE_CREATE", inviter.id, Date.now() - 300000],
            (err, rows) => {
              if (err || !rows) resolve(0);
              else resolve(rows[0].count);
            }
          );
        });

        if (recentInvites > 20) {
          logger.warn(
            "AntiRaid",
            `Suspicious mass invite creation: ${inviter.tag} created ${recentInvites} invites in 5 minutes`
          );
        }
      }
    } catch (error) {
      logger.error("InviteCreate", "Error handling invite creation", {
        message: error?.message || String(error),
        stack: error?.stack,
      });
    }
  },
};
