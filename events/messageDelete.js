const db = require("../utils/database");
const { EmbedBuilder } = require("discord.js");
const ErrorHandler = require("../utils/errorHandler");
const logger = require("../utils/logger");

module.exports = {
  name: "messageDelete",
  async execute(message, client) {
    // Ignore bots, DMs, and system messages
    if (message.author?.bot) return;
    if (!message.guild) return;
    if (message.system) return;
    if (!message.author) return; // Skip partial messages without author data

    // Enhanced logging
    const EnhancedLogging = require("../utils/enhancedLogging");
    await EnhancedLogging.log(
      message.guild.id,
      "message_delete",
      "moderation",
      {
        userId: message.author.id,
        moderatorId: null,
        action: "message_deleted",
        details: `Message deleted in ${message.channel}`,
        metadata: {
          messageId: message.id,
          channelId: message.channel.id,
          channelName: message.channel.name,
          content: message.content?.substring(0, 1000) || "",
          authorId: message.author.id,
          authorTag: message.author.tag,
          attachments: message.attachments.size > 0,
          embeds: message.embeds.length > 0,
        },
        severity: "warning",
      }
    );

    // Try to get who deleted it from audit logs
    let deletedBy = null;
    try {
      const auditLogs = await message.guild.fetchAuditLogs({
        limit: 1,
        type: 72, // MESSAGE_DELETE
      });
      const entry = auditLogs.entries.first();
      if (entry && entry.target.id === message.author.id) {
        deletedBy = entry.executor;
      }
    } catch (error) {
      // Ignore audit log errors
    }

    // Check for mod log channel
    const config = await db.getServerConfig(message.guild.id);
    if (config && config.mod_log_channel) {
      const logChannel = message.guild.channels.cache.get(
        config.mod_log_channel
      );
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle("🗑️ Message Deleted")
          .setDescription(`Message deleted in ${message.channel}`)
          .addFields(
            {
              name: "Author",
              value: `${message.author} (${message.author.id})`,
              inline: true,
            },
            {
              name: "Channel",
              value: `${message.channel} (${message.channel.id})`,
              inline: true,
            },
            {
              name: "Message ID",
              value: message.id,
              inline: true,
            }
          )
          .setColor(0xff0000)
          .setTimestamp()
          .setFooter({
            text: `User ID: ${message.author.id}`,
          });

        if (message.content) {
          embed.addFields({
            name: "Content",
            value: message.content.substring(0, 1024) || "*No content*",
            inline: false,
          });
        }

        if (deletedBy && deletedBy.id !== message.author.id) {
          embed.addFields({
            name: "Deleted By",
            value: `${deletedBy} (${deletedBy.id})`,
            inline: true,
          });
        }

        if (message.attachments.size > 0) {
          embed.addFields({
            name: "Attachments",
            value: `${message.attachments.size} attachment(s) were deleted`,
            inline: false,
          });
        }

        logChannel
          .send({ embeds: [embed] })
          .catch(
            ErrorHandler.createSafeCatch(
              `messageDelete [${message.guild.id}]`,
              `Send mod log for message delete`
            )
          );
      }
    }
  },
};
