const { registerCommands } = require("../utils/registerCommands");
const db = require("../utils/database");
const logger = require("../utils/logger");
const growthTracker = require("../utils/growthTracker");
const { version } = require("../package.json");

module.exports = {
  name: "guildCreate",
  async execute(guild, client) {
    console.log(`🆕 Joined new server: ${guild.name} (${guild.id})`);

    // Track invite source if present
    let inviteSource = "direct"; // default

    // Track with growth tracker
    await growthTracker
      .trackServerAdd(guild.id, inviteSource, guild.memberCount || 0)
      .catch((err) => {
        logger.error("Growth tracker error:", err);
      });
    try {
      // Check if we have a tracked source for this user (guild owner)
      const owner = await guild.fetchOwner().catch(() => null);
      if (owner) {
        // Query database for any pending invite tracking for this user
        const trackedSource = await new Promise((resolve) => {
          db.db.get(
            "SELECT source FROM pending_invite_sources WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1",
            [owner.id],
            (err, row) => {
              if (err || !row) resolve(null);
              else resolve(row.source);
            }
          );
        });

        if (trackedSource) {
          inviteSource = trackedSource;
          // Clean up the pending tracking
          db.db.run("DELETE FROM pending_invite_sources WHERE user_id = ?", [
            owner.id,
          ]);
        }
      }

      // Track the guild join with source
      await db.trackGuildJoin(
        guild.id,
        inviteSource,
        guild.name,
        guild.memberCount || 0
      );

      console.log(`   📊 Tracked join from source: ${inviteSource}`);

      // Referral tracking removed (command deprecated to stay under 100 command limit)

      // Send webhook notification to admin
      if (
        process.env.ADMIN_WEBHOOK_URL &&
        process.env.ADMIN_WEBHOOK_URL !==
          "https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN"
      ) {
        try {
          const owner = await guild.fetchOwner().catch(() => null);

          // Get conversion stats for this source
          const sourceStats = await db.getInviteSourceStats().catch(() => []);
          const thisSourceStats = sourceStats.find(
            (s) => s.source === inviteSource
          );

          // Check for milestones
          const totalServers = client.guilds.cache.size;
          const milestones = [20, 50, 100, 250, 500, 1000];
          const hitMilestone = milestones.includes(totalServers);

          const webhook = {
            username: "Nexus Growth Tracker",
            avatar_url:
              "https://cdn.discordapp.com/avatars/1444739230679957646/32f2d77d44c2f3989fecd858be53f396.webp",
            embeds: [
              {
                title: hitMilestone
                  ? `🎊 MILESTONE: ${totalServers} SERVERS! 🎊`
                  : "🎉 New Server Joined!",
                color: hitMilestone ? 0xffd700 : 0x10b981,
                description: hitMilestone
                  ? `**Congratulations! You just hit ${totalServers} servers!** 🚀`
                  : null,
                thumbnail: {
                  url:
                    guild.iconURL() ||
                    "https://cdn.discordapp.com/avatars/1444739230679957646/32f2d77d44c2f3989fecd858be53f396.webp",
                },
                fields: [
                  {
                    name: "📋 Server Info",
                    value: `**${guild.name}**\nID: \`${
                      guild.id
                    }\`\nMembers: **${guild.memberCount || 0}**`,
                    inline: true,
                  },
                  {
                    name: "👑 Owner",
                    value: owner
                      ? `${owner.user.tag}\n\`${owner.id}\``
                      : "Unknown",
                    inline: true,
                  },
                  {
                    name: "📊 Invite Source",
                    value: `**${inviteSource}**${
                      thisSourceStats
                        ? `\n${thisSourceStats.total_joins} total joins from this source`
                        : ""
                    }`,
                    inline: true,
                  },
                ],
                footer: {
                  text: `Total Servers: ${client.guilds.cache.size} | v${version}`,
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

          console.log(`   📬 Admin notification sent for ${guild.name}`);
        } catch (webhookError) {
          console.error(
            "Failed to send webhook notification:",
            webhookError.message
          );
        }
      }
    } catch (error) {
      console.error("Failed to track invite source:", error.message);
    }

    // Log server join
    try {
      const owner = await guild.fetchOwner().catch(() => null);
      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO bot_activity_log (event_type, guild_id, guild_name, member_count, owner_id, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
          [
            "guild_join",
            guild.id,
            guild.name,
            guild.memberCount || 0,
            owner ? owner.id : null,
            Date.now(),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      console.log(`   Owner: ${owner ? owner.user.tag : "Unknown"}`);
      console.log(`   Members: ${guild.memberCount || 0}`);
    } catch (error) {
      console.error("Failed to log guild join:", error.message);
    }

    // Automatic role hierarchy check and warning
    try {
      const botMember = await guild.members.fetch(client.user.id);
      const botRole = botMember.roles.highest;
      
      const allRoles = Array.from(guild.roles.cache.values())
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position);
      
      const botRoleIndex = allRoles.findIndex((r) => r.id === botRole.id);
      
      // If bot role is not at top, send warning
      if (botRoleIndex > 0) {
        const { EmbedBuilder } = require("discord.js");
        
        const warningEmbed = new EmbedBuilder()
          .setTitle("⚠️ CRITICAL SETUP REQUIRED")
          .setDescription(
            "**Thank you for adding Nexus!** However, there's a critical setup step needed for full protection."
          )
          .addFields(
            {
              name: "🔴 Current Status",
              value: `Bot role is at position **${botRoleIndex + 1}/${allRoles.length}**\nThis means Nexus **cannot ban/kick users** whose roles are higher.`,
              inline: false
            },
            {
              name: "✅ Required Action",
              value: 
                "**1.** Go to **Server Settings** → **Roles**\n" +
                "**2.** Find the Nexus bot role\n" +
                "**3.** Drag it to the **TOP** of the role list\n" +
                "**4.** Save changes",
              inline: false
            },
            {
              name: "🛡️ Why This Matters",
              value: 
                "If a nuke bot joins and gets a role above Nexus, **Nexus cannot stop it**. " +
                "Detection will work, but action will fail with permission errors. " +
                "Proper role positioning is **essential** for protection.",
              inline: false
            },
            {
              name: "📝 Verify Setup",
              value: "After moving the role, run `/security rolecheck` to verify!",
              inline: false
            }
          )
          .setColor(0xFF0000)
          .setFooter({ text: "This is NOT optional - it's required for Nexus to work" })
          .setTimestamp();

        // Try to send to system channel or owner
        const systemChannel = guild.systemChannel;
        if (systemChannel && systemChannel.permissionsFor(botMember).has("SendMessages")) {
          await systemChannel.send({ embeds: [warningEmbed] });
          console.log(`   ⚠️ Sent role hierarchy warning to system channel`);
        } else {
          // Try to DM owner
          const owner = await guild.fetchOwner().catch(() => null);
          if (owner) {
            await owner.send({ embeds: [warningEmbed] }).catch(() => {
              console.log(`   ⚠️ Could not send role hierarchy warning - no accessible channel`);
            });
          }
        }
      } else {
        console.log(`   ✅ Bot role is at highest position - optimal setup!`);
      }
    } catch (error) {
      console.error("Failed to check role hierarchy:", error.message);
    }

    // Register commands for the new server
    try {
      const commands = [];
      const fs = require("fs");
      const path = require("path");
      const commandsPath = path.join(__dirname, "..", "commands");
      const commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith(".js"));

      for (const file of commandFiles) {
        const command = require(`../commands/${file}`);
        if (command.data) {
          commands.push(command.data.toJSON());
        }
      }

      const { REST, Routes } = require("discord.js");
      const rest = new REST({ version: "10" }).setToken(
        process.env.DISCORD_TOKEN
      );

      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: commands }
      );

      console.log(
        `✅ Registered ${commands.length} commands for ${guild.name}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to register commands for ${guild.name}:`,
        error.message
      );
    }

    // Create initial recovery snapshot for new servers
    try {
      const AutoRecovery = require("../utils/autoRecovery");
      await AutoRecovery.autoSnapshot(guild, "Initial snapshot on bot join");
      logger.info(
        `📸 Created initial recovery snapshot for ${guild.name} (${guild.id})`
      );
      console.log(`📸 Created initial recovery snapshot for ${guild.name}`);
    } catch (error) {
      logger.error(
        `Failed to create initial snapshot for ${guild.name}:`,
        error
      );
      console.error(
        `Failed to create initial snapshot for ${guild.name}:`,
        error.message
      );
    }
  },
};
