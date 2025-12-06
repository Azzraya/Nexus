const logger = require("../utils/logger");

module.exports = {
  name: "emojiUpdate",
  async execute(oldEmoji, newEmoji, client) {
    try {
      const guild = newEmoji.guild;

      // Log changes
      const changes = [];
      if (oldEmoji.name !== newEmoji.name) {
        changes.push(`Name: ${oldEmoji.name} → ${newEmoji.name}`);
      }

      if (changes.length > 0) {
        logger.info(
          "EmojiUpdate",
          `Emoji updated in ${guild.name}: ${changes.join(", ")}`
        );

        // Log to database
        const db = require("../utils/database");
        db.db.run(
          `INSERT INTO logs (guild_id, event_type, emoji_id, timestamp, details)
           VALUES (?, ?, ?, ?, ?)`,
          [
            guild.id,
            "EMOJI_UPDATE",
            newEmoji.id,
            Date.now(),
            JSON.stringify({
              old_name: oldEmoji.name,
              new_name: newEmoji.name,
              emoji_id: newEmoji.id,
            }),
          ]
        );

        // Check audit logs for who made the change
        try {
          const auditLogs = await guild.fetchAuditLogs({
            type: 61, // EMOJI_UPDATE
            limit: 1,
          });

          const updateLog = auditLogs.entries.first();
          if (
            updateLog &&
            updateLog.target.id === newEmoji.id &&
            Date.now() - updateLog.createdTimestamp < 5000
          ) {
            const executor = updateLog.executor;
            logger.debug(
              "EmojiUpdate",
              `Emoji updated by: ${executor.tag} (${executor.id})`
            );
          }
        } catch (auditError) {
          logger.debug(
            "EmojiUpdate",
            `Could not fetch audit logs: ${auditError.message}`
          );
        }
      }
    } catch (error) {
      logger.error("EmojiUpdate", "Error handling emoji update", {
        message: error?.message || String(error),
        stack: error?.stack,
      });
    }
  },
};
