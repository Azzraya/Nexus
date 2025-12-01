const db = require("../utils/database");
const Notifications = require("../utils/notifications");
const AutoRecovery = require("../utils/autoRecovery");
const ErrorHandler = require("../utils/errorHandler");

module.exports = {
  name: "channelDelete",
  async execute(channel, client) {
    // Advanced anti-nuke monitoring
    if (client.advancedAntiNuke) {
      try {
        // Try to get the user who deleted (from audit log)
        const auditLogs = await channel.guild.fetchAuditLogs({
          limit: 1,
          type: 12, // CHANNEL_DELETE
        });
        const entry = auditLogs.entries.first();
        if (entry && entry.executor) {
          await client.advancedAntiNuke.monitorAction(
            channel.guild,
            "channelDelete",
            entry.executor.id,
            { channelId: channel.id, channelName: channel.name }
          );
        }
      } catch (error) {
        // Ignore audit log errors
      }
    }
    // Check if this was a mass deletion (potential nuke)
    const recentDeletions = await new Promise((resolve, reject) => {
      client.db.db.all(
        "SELECT COUNT(*) as count FROM enhanced_logs WHERE guild_id = ? AND action = 'channel_deleted' AND timestamp > ?",
        [channel.guild.id, Date.now() - 60000], // Last minute
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows?.[0]?.count || 0);
        }
      );
    });

    // Console logging
    console.log(
      `🗑️ [${channel.guild.name} (${channel.guild.id})] Channel deleted: #${channel.name} (${channel.id})`
    );

    // Enhanced logging
    const EnhancedLogging = require("../utils/enhancedLogging");
    await EnhancedLogging.log(channel.guild.id, "channel_delete", "server", {
      userId: null,
      moderatorId: null,
      action: "channel_deleted",
      details: `Channel deleted: ${channel.name}`,
      metadata: {
        channelId: channel.id,
        channelName: channel.name,
        channelType: channel.type,
      },
      severity: "warning",
    });

    // Also use old method for compatibility
    await client.db.addEnhancedLog(
      channel.guild.id,
      "moderation",
      "system",
      null,
      null,
      "channel_deleted",
      `Channel ${channel.name} was deleted`,
      { channelId: channel.id, channelName: channel.name },
      "warning"
    );

    // Check for mod log channel
    const config = await db.getServerConfig(channel.guild.id);
    if (config && config.mod_log_channel) {
      const logChannel = channel.guild.channels.cache.get(
        config.mod_log_channel
      );
      if (logChannel) {
        const { EmbedBuilder, ChannelType } = require("discord.js");
        const channelTypeNames = {
          [ChannelType.GuildText]: "Text Channel",
          [ChannelType.GuildVoice]: "Voice Channel",
          [ChannelType.GuildCategory]: "Category",
          [ChannelType.GuildAnnouncement]: "Announcement Channel",
          [ChannelType.GuildForum]: "Forum Channel",
          [ChannelType.GuildStageVoice]: "Stage Channel",
        };

        const embed = new EmbedBuilder()
          .setTitle("🗑️ Channel Deleted")
          .setDescription(`**${channel.name}** channel was deleted`)
          .addFields(
            {
              name: "Channel Name",
              value: channel.name,
              inline: true,
            },
            {
              name: "Channel ID",
              value: channel.id,
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
            }
          )
          .setColor(0xff0000)
          .setTimestamp();

        logChannel.send({ embeds: [embed] }).catch(
          ErrorHandler.createSafeCatch(
            `channelDelete [${channel.guild.id}]`,
            `Send mod log for channel delete`
          )
        );
      }
    }

    // If multiple deletions in short time, potential nuke
    if (recentDeletions >= 3) {
      await Notifications.send(
        channel.guild.id,
        "nuke_attempt",
        {
          details: `${recentDeletions + 1} channels deleted in the last minute`,
        },
        client
      );

      // Auto-create recovery snapshot
      try {
        await AutoRecovery.autoSnapshot(
          channel.guild,
          "Potential nuke detected"
        );
      } catch (error) {
        console.error("Failed to create recovery snapshot:", error);
      }
    } else {
      await Notifications.send(
        channel.guild.id,
        "channel_deleted",
        {
          channelName: channel.name,
          details: "A channel was deleted",
        },
        client
      );
    }
  },
};
