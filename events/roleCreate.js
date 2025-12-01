const db = require("../utils/database");
const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "roleCreate",
  async execute(role, client) {
    // Console logging
    console.log(
      `➕ [${role.guild.name} (${role.guild.id})] Role created: ${role.name} (${role.id})`
    );

    // Enhanced logging
    const EnhancedLogging = require("../utils/enhancedLogging");
    await EnhancedLogging.log(role.guild.id, "role_create", "role", {
      userId: null,
      moderatorId: null,
      action: "role_created",
      details: `Role created: ${role.name}`,
      metadata: {
        roleId: role.id,
        roleName: role.name,
        color: role.color,
        permissions: role.permissions.bitfield.toString(),
        position: role.position,
        mentionable: role.mentionable,
        hoist: role.hoist,
      },
      severity: "info",
    });

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

        logChannel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  },
};

