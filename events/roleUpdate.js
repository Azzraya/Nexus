const db = require("../utils/database");
const { EmbedBuilder } = require("discord.js");
const ErrorHandler = require("../utils/errorHandler");

module.exports = {
  name: "roleUpdate",
  async execute(oldRole, newRole, client) {
    const changes = [];

    // Check for name change
    if (oldRole.name !== newRole.name) {
      changes.push({
        name: "Name Changed",
        value: `**Old:** ${oldRole.name}\n**New:** ${newRole.name}`,
        inline: false,
      });
    }

    // Check for color change
    if (oldRole.color !== newRole.color) {
      changes.push({
        name: "Color Changed",
        value: `**Old:** #${oldRole.color.toString(16).padStart(6, "0")}\n**New:** #${newRole.color.toString(16).padStart(6, "0")}`,
        inline: true,
      });
    }

    // Check for permission changes
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      const oldPerms = oldRole.permissions;
      const newPerms = newRole.permissions;
      const addedPerms = newPerms.toArray().filter((p) => !oldPerms.has(p));
      const removedPerms = oldPerms.toArray().filter((p) => !newPerms.has(p));

      if (addedPerms.length > 0 || removedPerms.length > 0) {
        changes.push({
          name: "Permissions Changed",
          value: `**Added:** ${addedPerms.length > 0 ? addedPerms.join(", ") : "None"}\n**Removed:** ${removedPerms.length > 0 ? removedPerms.join(", ") : "None"}`,
          inline: false,
        });
      }
    }

    // Check for mentionable change
    if (oldRole.mentionable !== newRole.mentionable) {
      changes.push({
        name: "Mentionable",
        value: oldRole.mentionable ? "Disabled" : "Enabled",
        inline: true,
      });
    }

    // Check for hoist change
    if (oldRole.hoist !== newRole.hoist) {
      changes.push({
        name: "Hoist",
        value: newRole.hoist ? "Enabled" : "Disabled",
        inline: true,
      });
    }

    // Only log if there are actual changes
    if (changes.length === 0) return;

    // Console logging
    console.log(
      `🔧 [${newRole.guild.name} (${newRole.guild.id})] Role updated: ${newRole.name} - ${changes.map((c) => c.name).join(", ")}`
    );

    // Enhanced logging
    const EnhancedLogging = require("../utils/enhancedLogging");
    await EnhancedLogging.log(newRole.guild.id, "role_update", "role", {
      userId: null,
      moderatorId: null,
      action: "role_updated",
      details: `Role updated: ${newRole.name}`,
      metadata: {
        roleId: newRole.id,
        oldRoleName: oldRole.name,
        newRoleName: newRole.name,
        changes: changes.map((c) => c.name),
      },
      severity: "info",
    });

    // Check for mod log channel
    const config = await db.getServerConfig(newRole.guild.id);
    if (config && config.mod_log_channel) {
      const logChannel = newRole.guild.channels.cache.get(
        config.mod_log_channel
      );
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle("🔧 Role Updated")
          .setDescription(`**${newRole.name}** role was updated`)
          .addFields(
            {
              name: "Role",
              value: `${newRole} (${newRole.id})`,
              inline: true,
            },
            ...changes
          )
          .setColor(newRole.color || 0xffa500)
          .setTimestamp();

        logChannel.send({ embeds: [embed] }).catch(
          ErrorHandler.createSafeCatch(
            `roleUpdate [${newRole.guild.id}]`,
            `Send mod log for role update`
          )
        );
      }
    }
  },
};

