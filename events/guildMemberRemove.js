const db = require("../utils/database");
const ErrorHandler = require("../utils/errorHandler");

module.exports = {
  name: "guildMemberRemove",
  async execute(member, client) {
    // Advanced anti-nuke monitoring (check if it was a kick)
    if (client.advancedAntiNuke) {
      try {
        const auditLogs = await member.guild.fetchAuditLogs({
          limit: 1,
          type: 20, // MEMBER_KICK
        });
        const entry = auditLogs.entries.first();
        // Check if this was a kick (not a leave) and happened recently
        if (entry && entry.executor && Date.now() - entry.createdTimestamp < 5000) {
          await client.advancedAntiNuke.monitorAction(
            member.guild,
            "memberRemove",
            entry.executor.id,
            { kickedUserId: member.id }
          );
        }
      } catch (error) {
        // Ignore audit log errors
      }
    }

    // Get server config once
    const config = await db.getServerConfig(member.guild.id);

    // Send leave message if configured
    if (config && config.leave_channel && config.leave_message) {
      const leaveChannel = member.guild.channels.cache.get(
        config.leave_channel
      );
      if (leaveChannel) {
        const message = config.leave_message
          .replace(/{user}/g, member.user.tag)
          .replace(/{server}/g, member.guild.name);

        leaveChannel
          .send({
            embeds: [
              {
                title: "👋 Member Left",
                description: message,
                color: 0xff0000,
              },
            ],
          })
          .catch(ErrorHandler.createSafeCatch(
            `guildMemberRemove [${member.guild.id}]`,
            `Send leave message for ${member.user.id}`
          ));
      }
    }

    // Log analytics
    await db.logAnalytics(member.guild.id, "member_leave", {
      user_id: member.id,
    });

    // Enhanced logging
    const EnhancedLogging = require("../utils/enhancedLogging");
    await EnhancedLogging.log(member.guild.id, "member_leave", "member", {
      userId: member.id,
      action: "leave",
      details: `Member left: ${member.user.tag} (${member.user.id})`,
      metadata: {
        username: member.user.username,
        discriminator: member.user.discriminator,
        accountAge: Date.now() - member.user.createdTimestamp,
        wasInGuild: Date.now() - (member.joinedTimestamp || Date.now()),
        roles: member.roles.cache.map((r) => ({ id: r.id, name: r.name })),
      },
      severity: "info",
    });

    // Check for mod log channel
    if (config && config.mod_log_channel) {
      const logChannel = member.guild.channels.cache.get(config.mod_log_channel);
      if (logChannel) {
        const { EmbedBuilder } = require("discord.js");
        const embed = new EmbedBuilder()
          .setTitle("👋 Member Left")
          .setDescription(`**${member.user.tag}** left the server`)
          .addFields(
            { name: "User", value: `${member.user} (${member.user.id})`, inline: true },
            {
              name: "Account Created",
              value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
              inline: true,
            },
            {
              name: "Joined Server",
              value: member.joinedTimestamp
                ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
                : "Unknown",
              inline: true,
            },
            {
              name: "Roles",
              value:
                member.roles.cache
                  .filter((r) => r.id !== member.guild.id)
                  .map((r) => r.name)
                  .join(", ") || "None",
              inline: false,
            }
          )
          .setColor(0xff0000)
          .setThumbnail(member.user.displayAvatarURL())
          .setTimestamp();

        logChannel.send({ embeds: [embed] }).catch(
          ErrorHandler.createSafeCatch(
            `guildMemberRemove [${member.guild.id}]`,
            `Send mod log for member leave`
          )
        );
      }
    }
  },
};
