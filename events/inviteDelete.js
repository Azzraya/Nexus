const logger = require("../utils/logger");

module.exports = {
  name: "inviteDelete",
  async execute(invite, client) {
    try {
      const guild = invite.guild;

      logger.info(
        "InviteDelete",
        `Invite deleted in ${guild.name}: ${invite.code}`
      );

      // Log to database
      const db = require("../utils/database");
      db.db.run(
        `INSERT INTO logs (guild_id, event_type, timestamp, details)
         VALUES (?, ?, ?, ?)`,
        [
          guild.id,
          "INVITE_DELETE",
          Date.now(),
          JSON.stringify({
            invite_code: invite.code,
            channel_id: invite.channel?.id,
            channel_name: invite.channel?.name,
          }),
        ]
      );

      // Clean up invite tracking
      db.db.run(
        `DELETE FROM invite_tracking WHERE guild_id = ? AND invite_code = ?`,
        [guild.id, invite.code]
      );
    } catch (error) {
      logger.error("InviteDelete", "Error handling invite deletion", {
        message: error?.message || String(error),
        stack: error?.stack,
      });
    }
  },
};
