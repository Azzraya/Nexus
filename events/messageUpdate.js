const db = require("../utils/database");
const { EmbedBuilder } = require("discord.js");
const ErrorHandler = require("../utils/errorHandler");
const logger = require("../utils/logger");

module.exports = {
  name: "messageUpdate",
  async execute(oldMessage, newMessage, client) {
    // Ignore bots, DMs, and system messages
    if (newMessage.author?.bot) return;
    if (!newMessage.guild) return;
    if (newMessage.system) return;

    // Ignore if content hasn't changed (embeds, reactions, etc.)
    if (oldMessage.content === newMessage.content) return;

    // Enhanced logging
    const EnhancedLogging = require("../utils/enhancedLogging");
    await EnhancedLogging.log(
      newMessage.guild.id,
      "message_update",
      "moderation",
      {
        userId: newMessage.author.id,
        moderatorId: null,
        action: "message_edited",
        details: `Message edited in ${newMessage.channel}`,
        metadata: {
          messageId: newMessage.id,
          channelId: newMessage.channel.id,
          channelName: newMessage.channel.name,
          oldContent: oldMessage.content?.substring(0, 1000) || "",
          newContent: newMessage.content?.substring(0, 1000) || "",
          authorId: newMessage.author.id,
          authorTag: newMessage.author.tag,
        },
        severity: "info",
      }
    );

    // Check for mod log channel
    const config = await db.getServerConfig(newMessage.guild.id);
    if (config && config.mod_log_channel) {
      const logChannel = newMessage.guild.channels.cache.get(
        config.mod_log_channel
      );
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle("✏️ Message Edited")
          .setDescription(`Message edited in ${newMessage.channel}`)
          .addFields(
            {
              name: "Author",
              value: `${newMessage.author} (${newMessage.author.id})`,
              inline: true,
            },
            {
              name: "Channel",
              value: `${newMessage.channel} (${newMessage.channel.id})`,
              inline: true,
            },
            {
              name: "Message ID",
              value: newMessage.id,
              inline: true,
            },
            {
              name: "Before",
              value: oldMessage.content?.substring(0, 1024) || "*No content*",
              inline: false,
            },
            {
              name: "After",
              value: newMessage.content?.substring(0, 1024) || "*No content*",
              inline: false,
            },
            {
              name: "Jump to Message",
              value: `[Click here](${newMessage.url})`,
              inline: false,
            }
          )
          .setColor(0xffa500)
          .setTimestamp()
          .setFooter({
            text: `User ID: ${newMessage.author.id}`,
          });

        logChannel
          .send({ embeds: [embed] })
          .catch(
            ErrorHandler.createSafeCatch(
              `messageUpdate [${newMessage.guild.id}]`,
              `Send mod log for message edit`
            )
          );
      }
    }
  },
};
