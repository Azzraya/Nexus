const db = require("../utils/database");
const { EmbedBuilder } = require("discord.js");
const ErrorHandler = require("../utils/errorHandler");

module.exports = {
  name: "guildMemberUpdate",
  async execute(oldMember, newMember, client) {
    // Check for role changes
    if (!oldMember.roles.cache.equals(newMember.roles.cache)) {
      const oldRoles = oldMember.roles.cache;
      const newRoles = newMember.roles.cache;

      const addedRoles = newRoles.filter((role) => !oldRoles.has(role.id));
      const removedRoles = oldRoles.filter((role) => !newRoles.has(role.id));

      // Skip if only @everyone role changed
      if (addedRoles.size === 0 && removedRoles.size === 0) return;

      // Console logging
      console.log(
        `🔧 [${newMember.guild.name} (${newMember.guild.id})] Roles updated for ${newMember.user.tag} (${newMember.id}): Added: ${Array.from(addedRoles.values()).map((r) => r.name).join(", ") || "None"}, Removed: ${Array.from(removedRoles.values()).map((r) => r.name).join(", ") || "None"}`
      );

      // Enhanced logging
      const EnhancedLogging = require("../utils/enhancedLogging");
      await EnhancedLogging.log(
        newMember.guild.id,
        "role_update",
        "member",
        {
          userId: newMember.id,
          action: "role_change",
          details: `Roles updated for ${newMember.user.tag}`,
          metadata: {
            addedRoles: Array.from(addedRoles.values()).map((r) => ({
              id: r.id,
              name: r.name,
            })),
            removedRoles: Array.from(removedRoles.values()).map((r) => ({
              id: r.id,
              name: r.name,
            })),
          },
          severity: "info",
        }
      );

      // Check for mod log channel
      const config = await db.getServerConfig(newMember.guild.id);
      if (config && config.mod_log_channel) {
        const logChannel = newMember.guild.channels.cache.get(
          config.mod_log_channel
        );
        if (logChannel) {
          const embed = new EmbedBuilder()
            .setTitle("🔧 Member Roles Updated")
            .setDescription(`**${newMember.user.tag}** roles were changed`)
            .addFields(
              {
                name: "User",
                value: `${newMember.user} (${newMember.user.id})`,
                inline: true,
              },
              {
                name: "Added Roles",
                value:
                  addedRoles.size > 0
                    ? addedRoles.map((r) => r.name).join(", ")
                    : "None",
                inline: false,
              },
              {
                name: "Removed Roles",
                value:
                  removedRoles.size > 0
                    ? removedRoles.map((r) => r.name).join(", ")
                    : "None",
                inline: false,
              }
            )
            .setColor(0xffa500)
            .setThumbnail(newMember.user.displayAvatarURL())
            .setTimestamp();

          logChannel.send({ embeds: [embed] }).catch(
            ErrorHandler.createSafeCatch(
              `guildMemberUpdate [${newMember.guild.id}]`,
              `Send mod log for role update`
            )
          );
        }
      }
    }

    // Check for nickname changes
    if (oldMember.nickname !== newMember.nickname) {
      // Logging
      const logger = require("../utils/logger");
      logger.info(`Nickname changed for ${newMember.user.tag}`, {
        guildId: newMember.guild.id,
        guildName: newMember.guild.name,
        userId: newMember.id,
        oldNickname: oldMember.nickname || "None",
        newNickname: newMember.nickname || "None",
      });

      const EnhancedLogging = require("../utils/enhancedLogging");
      await EnhancedLogging.log(
        newMember.guild.id,
        "nickname_update",
        "member",
        {
          userId: newMember.id,
          action: "nickname_change",
          details: `Nickname changed for ${newMember.user.tag}`,
          metadata: {
            oldNickname: oldMember.nickname || "None",
            newNickname: newMember.nickname || "None",
          },
          severity: "info",
        }
      );

      const config = await db.getServerConfig(newMember.guild.id);
      if (config && config.mod_log_channel) {
        const logChannel = newMember.guild.channels.cache.get(
          config.mod_log_channel
        );
        if (logChannel) {
          const embed = new EmbedBuilder()
            .setTitle("📝 Nickname Changed")
            .setDescription(`**${newMember.user.tag}** changed their nickname`)
            .addFields(
              {
                name: "User",
                value: `${newMember.user} (${newMember.user.id})`,
                inline: true,
              },
              {
                name: "Old Nickname",
                value: oldMember.nickname || "None",
                inline: true,
              },
              {
                name: "New Nickname",
                value: newMember.nickname || "None",
                inline: true,
              }
            )
            .setColor(0xffa500)
            .setThumbnail(newMember.user.displayAvatarURL())
            .setTimestamp();

          logChannel.send({ embeds: [embed] }).catch(
            ErrorHandler.createSafeCatch(
              `guildMemberUpdate [${newMember.guild.id}]`,
              `Send mod log for nickname change`
            )
          );
        }
      }
    }
  },
};

