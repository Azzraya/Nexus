const db = require("../utils/database");
const logger = require("../utils/logger");
const growthTracker = require("../utils/growthTracker");
const { version } = require("../package.json");

module.exports = {
  name: "guildDelete",
  async execute(guild, client) {
    console.log(`❌ Left server: ${guild.name} (${guild.id})`);

    // Get invite source info if we tracked this guild
    let inviteSource = "unknown";
    let joinedAt = null;
    let daysActive = 0;

    // Track with growth tracker (calculate days active first)
    await growthTracker
      .trackServerRemove(guild.id, "left", daysActive)
      .catch((err) => {
        logger.error("Growth tracker error:", err);
      });

    try {
      const trackingInfo = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT source, invited_at FROM guild_invite_tracking WHERE guild_id = ?",
          [guild.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (trackingInfo) {
        inviteSource = trackingInfo.source;
        joinedAt = trackingInfo.invited_at;
        daysActive = Math.floor(
          (Date.now() - joinedAt) / (1000 * 60 * 60 * 24)
        );
      }
    } catch (error) {
      logger.error("Guild Delete", "Failed to get tracking info", error);
    }

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

      // Track in guild leaves table
      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO guild_leaves (guild_id, guild_name, source, left_at, days_active, member_count) VALUES (?, ?, ?, ?, ?, ?)",
          [
            guild.id,
            guild.name,
            inviteSource,
            Date.now(),
            daysActive,
            guild.memberCount || 0,
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      logger.info("Guild Delete", `   Source: ${inviteSource}`);
      logger.info("Guild Delete", `   Active for: ${daysActive} days`);
      logger.info("Guild Delete", `   Members: ${guild.memberCount || 0}`);
    } catch (error) {
      logger.error("Guild Delete", "Failed to log guild leave", error);
    }

    // Send webhook notification to admin
    if (
      process.env.ADMIN_WEBHOOK_URL &&
      process.env.ADMIN_WEBHOOK_URL !==
        "https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN"
    ) {
      try {
        const webhook = {
          username: "Nexus Growth Tracker",
          avatar_url:
            "https://cdn.discordapp.com/avatars/1444739230679957646/32f2d77d44c2f3989fecd858be53f396.webp",
          embeds: [
            {
              title: "❌ Server Left",
              description: `The bot was removed from a server`,
              color: 0xef4444,
              thumbnail: {
                url:
                  guild.iconURL() ||
                  "https://cdn.discordapp.com/avatars/1444739230679957646/32f2d77d44c2f3989fecd858be53f396.webp",
              },
              fields: [
                {
                  name: "📋 Server Info",
                  value: `**${guild.name}**\nID: \`${guild.id}\`\nMembers: **${
                    guild.memberCount || 0
                  }**`,
                  inline: true,
                },
                {
                  name: "📊 Source & Activity",
                  value: `Source: **${inviteSource}**\nActive: **${daysActive} days**`,
                  inline: true,
                },
                {
                  name: "📈 Current Stats",
                  value: `Total Servers: **${client.guilds.cache.size}**\n${
                    daysActive < 1
                      ? "⚠️ Left within 24h"
                      : daysActive < 7
                        ? "⚠️ Left within a week"
                        : "✅ Stayed over a week"
                  }`,
                  inline: true,
                },
              ],
              footer: {
                text: `Retention tracking | v${version}`,
              },
              timestamp: new Date().toISOString(),
            },
          ],
        };

        // Send to webhook
        const https = require("https");
        const url = new URL(process.env.ADMIN_WEBHOOK_URL);
        const postData = JSON.stringify(webhook);

        const options = {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
          },
        };

        const req = https.request(options);
        req.write(postData);
        req.end();

        logger.info("Guild Delete", "📬 Admin leave notification sent");
      } catch (webhookError) {
        logger.error(
          "Guild Delete",
          "Failed to send leave webhook",
          webhookError
        );
      }
    }
  },
};
