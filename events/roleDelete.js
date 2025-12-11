const db = require("../utils/database");
const Notifications = require("../utils/notifications");
const AutoRecovery = require("../utils/autoRecovery");
const ErrorHandler = require("../utils/errorHandler");

module.exports = {
  name: "roleDelete",
  async execute(role, client) {
    // Advanced anti-nuke monitoring + event-based tracking
    if (client.advancedAntiNuke) {
      try {
        const auditLogs = await role.guild.fetchAuditLogs({
          limit: 1,
          type: 32, // ROLE_DELETE
        });
        const entry = auditLogs.entries.first();
        if (entry && entry.executor) {
          // Track in event-based tracker (replaces audit log monitor)
          if (client.eventActionTracker) {
            client.eventActionTracker.trackAction(
              role.guild.id,
              "ROLE_DELETE",
              entry.executor.id,
              { roleId: role.id, roleName: role.name }
            );
          }

          await client.advancedAntiNuke.monitorAction(
            role.guild,
            "roleDelete",
            entry.executor.id,
            { roleId: role.id, roleName: role.name }
          );
        }
      } catch (error) {
        // Ignore audit log errors
      }
    }
    // Check if this was a mass deletion (potential nuke)
    const recentDeletions = await new Promise((resolve, reject) => {
      client.db.db.all(
        "SELECT COUNT(*) as count FROM enhanced_logs WHERE guild_id = ? AND action = 'role_deleted' AND timestamp > ?",
        [role.guild.id, Date.now() - 60000], // Last minute
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows?.[0]?.count || 0);
        }
      );
    });

    // Console logging
    console.log(
      `🗑️ [${role.guild.name} (${role.guild.id})] Role deleted: ${role.name} (${role.id})`
    );

    // Enhanced logging
    const EnhancedLogging = require("../utils/enhancedLogging");
    await EnhancedLogging.log(role.guild.id, "role_delete", "server", {
      userId: null,
      moderatorId: null,
      action: "role_deleted",
      details: `Role deleted: ${role.name}`,
      metadata: {
        roleId: role.id,
        roleName: role.name,
        color: role.color,
      },
      severity: "warning",
    });

    // Also use old method for compatibility
    await client.db.addEnhancedLog(
      role.guild.id,
      "moderation",
      "system",
      null,
      null,
      "role_deleted",
      `Role ${role.name} was deleted`,
      { roleId: role.id, roleName: role.name },
      "warning"
    );

    // Check for mod log channel
    const config = await db.getServerConfig(role.guild.id);
    if (config && config.mod_log_channel) {
      const logChannel = role.guild.channels.cache.get(config.mod_log_channel);
      if (logChannel) {
        const { EmbedBuilder } = require("discord.js");
        const embed = new EmbedBuilder()
          .setTitle("🗑️ Role Deleted")
          .setDescription(`**${role.name}** role was deleted`)
          .addFields(
            {
              name: "Role Name",
              value: role.name,
              inline: true,
            },
            {
              name: "Role ID",
              value: role.id,
              inline: true,
            },
            {
              name: "Color",
              value: `#${role.color.toString(16).padStart(6, "0")}`,
              inline: true,
            },
            {
              name: "Members Affected",
              value: `${role.members.size} member(s)`,
              inline: true,
            }
          )
          .setColor(0xff0000)
          .setTimestamp();

        logChannel
          .send({ embeds: [embed] })
          .catch(
            ErrorHandler.createSafeCatch(
              `roleDelete [${role.guild.id}]`,
              `Send mod log for role delete`
            )
          );
      }
    }

    // If multiple deletions in short time, potential nuke
    if (recentDeletions >= 3) {
      await Notifications.send(
        role.guild.id,
        "nuke_attempt",
        {
          details: `${recentDeletions + 1} roles deleted in the last minute`,
        },
        client
      );

      // Auto-create recovery snapshot
      try {
        await AutoRecovery.autoSnapshot(role.guild, "Potential nuke detected");
      } catch (error) {
        console.error("Failed to create recovery snapshot:", error);
      }
    } else {
      await Notifications.send(
        role.guild.id,
        "role_deleted",
        {
          roleName: role.name,
          details: "A role was deleted",
        },
        client
      );
    }
  },
};
