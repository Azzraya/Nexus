const db = require("../utils/database");
const { EmbedBuilder, ChannelType } = require("discord.js");
const ErrorHandler = require("../utils/errorHandler");
const logger = require("../utils/logger");

module.exports = {
  name: "channelCreate",
  async execute(channel, client) {
    // If server is in lockdown, DELETE the channel immediately
    if (
      client.advancedAntiNuke &&
      client.advancedAntiNuke.lockedGuilds.has(channel.guild.id)
    ) {
      try {
        await channel
          .delete("Anti-Nuke: Channel created during lockdown")
          .catch((err) => {
            logger.debug(
              `[channelCreate] Failed to delete channel during lockdown:`,
              err.message
            );
          });
        logger.warn(
          `[Anti-Nuke] Deleted channel ${channel.id} created during lockdown in ${channel.guild.id}`
        );
        return; // Don't process further
      } catch (error) {
        // Continue to monitoring
      }
    }

    // Advanced anti-nuke monitoring
    if (client.advancedAntiNuke) {
      try {
        const auditLogs = await channel.guild.fetchAuditLogs({
          limit: 1,
          type: 10, // CHANNEL_CREATE
        });
        const entry = auditLogs.entries.first();
        if (entry && entry.executor) {
          await client.advancedAntiNuke.monitorAction(
            channel.guild,
            "channelCreate",
            entry.executor.id,
            { channelId: channel.id, channelName: channel.name }
          );
        }
      } catch (error) {
        // Ignore audit log errors
      }
    }

    // Logging
    logger.info(`Channel created: #${channel.name}`, {
      guildId: channel.guild.id,
      guildName: channel.guild.name,
      channelId: channel.id,
      channelName: channel.name,
    });

    // Enhanced logging
    const EnhancedLogging = require("../utils/enhancedLogging");
    await EnhancedLogging.log(channel.guild.id, "channel_create", "server", {
      userId: null,
      moderatorId: null,
      action: "channel_created",
      details: `Channel created: ${channel.name}`,
      metadata: {
        channelId: channel.id,
        channelName: channel.name,
        channelType: ChannelType[channel.type],
        parentId: channel.parentId,
        nsfw: channel.nsfw,
      },
      severity: "info",
    });

    // Check for mod log channel
    const config = await db.getServerConfig(channel.guild.id);
    if (config && config.mod_log_channel) {
      const logChannel = channel.guild.channels.cache.get(
        config.mod_log_channel
      );
      if (logChannel) {
        const channelTypeNames = {
          [ChannelType.GuildText]: "Text Channel",
          [ChannelType.GuildVoice]: "Voice Channel",
          [ChannelType.GuildCategory]: "Category",
          [ChannelType.GuildAnnouncement]: "Announcement Channel",
          [ChannelType.GuildForum]: "Forum Channel",
          [ChannelType.GuildStageVoice]: "Stage Channel",
        };

        const embed = new EmbedBuilder()
          .setTitle("➕ Channel Created")
          .setDescription(`**${channel.name}** channel was created`)
          .addFields(
            {
              name: "Channel",
              value: `${channel} (${channel.id})`,
              inline: true,
            },
            {
              name: "Type",
              value: channelTypeNames[channel.type] || "Unknown",
              inline: true,
            },
            {
              name: "Category",
              value: channel.parent?.name || "None",
              inline: true,
            },
            {
              name: "NSFW",
              value: channel.nsfw ? "Yes" : "No",
              inline: true,
            }
          )
          .setColor(0x00ff00)
          .setTimestamp();

        logChannel
          .send({ embeds: [embed] })
          .catch(
            ErrorHandler.createSafeCatch(
              `channelCreate [${channel.guild.id}]`,
              `Send mod log for channel create`
            )
          );
      }
    }
  },
};
