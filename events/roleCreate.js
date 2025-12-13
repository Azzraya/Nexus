const db = require("../utils/database");
const { EmbedBuilder } = require("discord.js");
const ErrorHandler = require("../utils/errorHandler");
const logger = require("../utils/logger");

module.exports = {
  name: "roleCreate",
  async execute(role, client) {
    // Advanced anti-nuke monitoring + event-based tracking
    if (client.advancedAntiNuke) {
      try {
        const auditLogs = await role.guild.fetchAuditLogs({
          limit: 1,
          type: 30, // ROLE_CREATE
        });
        const entry = auditLogs.entries.first();
        if (entry && entry.executor) {
          // Track in event-based tracker (replaces audit log monitor)
          if (client.eventActionTracker) {
            client.eventActionTracker.trackAction(
              role.guild.id,
              "ROLE_CREATE",
              entry.executor.id,
              { roleId: role.id, roleName: role.name }
            );
          }

          await client.advancedAntiNuke.monitorAction(
            role.guild,
            "roleCreate",
            entry.executor.id,
            { roleId: role.id, roleName: role.name }
          );
        }
      } catch (error) {
        // Ignore audit log errors
      }
    }

    // Check for mod log channel
    const config = await db.getServerConfig(role.guild.id);
    if (config && config.mod_log_channel) {
      const logChannel = role.guild.channels.cache.get(config.mod_log_channel);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle("➕ Role Created")
          .setDescription(`**${role.name}** role was created`)
          .addFields(
            {
              name: "Role",
              value: `${role} (${role.id})`,
              inline: true,
            },
            {
              name: "Color",
              value: `#${role.color.toString(16).padStart(6, "0")}`,
              inline: true,
            },
            {
              name: "Position",
              value: `${role.position}`,
              inline: true,
            },
            {
              name: "Mentionable",
              value: role.mentionable ? "Yes" : "No",
              inline: true,
            },
            {
              name: "Hoisted",
              value: role.hoist ? "Yes" : "No",
              inline: true,
            }
          )
          .setColor(role.color || 0x00ff00)
          .setTimestamp();

        logChannel
          .send({ embeds: [embed] })
          .catch(
            ErrorHandler.createSafeCatch(
              `roleCreate [${role.guild.id}]`,
              `Send mod log for role create`
            )
          );
      }
    }
  },
};
