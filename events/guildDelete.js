const db = require("../utils/database");

module.exports = {
  name: "guildDelete",
  async execute(guild, client) {
    console.log(`❌ Left server: ${guild.name} (${guild.id})`);

    // Log server leave
    try {
      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO bot_activity_log (event_type, guild_id, guild_name, member_count, timestamp) VALUES (?, ?, ?, ?, ?)",
          [
            "guild_leave",
            guild.id,
            guild.name,
            guild.memberCount || 0,
            Date.now(),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    } catch (error) {
      console.error("Failed to log guild leave:", error.message);
    }

    // Log to console with details
    const owner = await guild.fetchOwner().catch(() => null);
    console.log(`   Owner: ${owner ? owner.user.tag : "Unknown"}`);
    console.log(`   Members: ${guild.memberCount || 0}`);
  },
};
