const db = require("../utils/database");
const { EmbedBuilder, ChannelType } = require("discord.js");

module.exports = {
  name: "channelUpdate",
  async execute(oldChannel, newChannel, client) {
    // Skip if not a guild channel
    if (!newChannel.guild) return;

    const changes = [];

    // Check for name change
    if (oldChannel.name !== newChannel.name) {
      changes.push({
        name: "Channel Name Changed",
        value: `**Old:** ${oldChannel.name}\n**New:** ${newChannel.name}`,
        inline: false,
      });
    }

    // Check for topic change (text channels)
    if (
      oldChannel.type === ChannelType.GuildText ||
      oldChannel.type === ChannelType.GuildAnnouncement ||
      oldChannel.type === ChannelType.GuildForum
    ) {
      if (oldChannel.topic !== newChannel.topic) {
        changes.push({
          name: "Topic Changed",
          value: `**Old:** ${oldChannel.topic || "None"}\n**New:** ${
            newChannel.topic || "None"
          }`,
          inline: false,
        });
      }
    }

    // Check for NSFW change
    if (oldChannel.nsfw !== newChannel.nsfw) {
      changes.push({
        name: "NSFW Setting Changed",
        value: oldChannel.nsfw ? "Disabled" : "Enabled",
        inline: true,
      });
    }

    // Check for category change
    if (oldChannel.parentId !== newChannel.parentId) {
      changes.push({
        name: "Category Changed",
        value: `**Old:** ${oldChannel.parent?.name || "None"}\n**New:** ${
          newChannel.parent?.name || "None"
        }`,
        inline: true,
      });
    }

    // Check for rate limit change (text channels)
    if (
      oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser &&
      (oldChannel.type === ChannelType.GuildText ||
        oldChannel.type === ChannelType.GuildAnnouncement)
    ) {
      changes.push({
        name: "Slowmode Changed",
        value: `**Old:** ${oldChannel.rateLimitPerUser}s\n**New:** ${newChannel.rateLimitPerUser}s`,
        inline: true,
      });
    }

    // Check for bitrate change (voice channels)
    if (
      oldChannel.type === ChannelType.GuildVoice &&
      oldChannel.bitrate !== newChannel.bitrate
    ) {
      changes.push({
        name: "Bitrate Changed",
        value: `**Old:** ${oldChannel.bitrate}bps\n**New:** ${newChannel.bitrate}bps`,
        inline: true,
      });
    }

    // Check for user limit change (voice channels)
    if (
      oldChannel.type === ChannelType.GuildVoice &&
      oldChannel.userLimit !== newChannel.userLimit
    ) {
      changes.push({
        name: "User Limit Changed",
        value: `**Old:** ${oldChannel.userLimit || "Unlimited"}\n**New:** ${
          newChannel.userLimit || "Unlimited"
        }`,
        inline: true,
      });
    }

    // Check for permission overwrite changes (simplified - just note if they changed)
    if (
      oldChannel.permissionOverwrites.cache.size !==
      newChannel.permissionOverwrites.cache.size
    ) {
      changes.push({
        name: "Permission Overwrites Changed",
        value: `**Old:** ${oldChannel.permissionOverwrites.cache.size} overwrite(s)\n**New:** ${newChannel.permissionOverwrites.cache.size} overwrite(s)`,
        inline: false,
      });
    }

    // Only log if there are actual changes
    if (changes.length === 0) return;

    // Console logging
    console.log(
      `🔧 [${newChannel.guild.name} (${newChannel.guild.id})] Channel updated: #${newChannel.name} - ${changes.map((c) => c.name).join(", ")}`
    );

    // Enhanced logging
    const EnhancedLogging = require("../utils/enhancedLogging");
    await EnhancedLogging.log(newChannel.guild.id, "channel_update", "server", {
      userId: null,
      moderatorId: null,
      action: "channel_updated",
      details: `Channel updated: ${newChannel.name}`,
      metadata: {
        channelId: newChannel.id,
        channelName: newChannel.name,
        changes: changes.map((c) => c.name),
      },
      severity: "info",
    });

    // Check for mod log channel
    const config = await db.getServerConfig(newChannel.guild.id);
    if (config && config.mod_log_channel) {
      const logChannel = newChannel.guild.channels.cache.get(
        config.mod_log_channel
      );
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle("🔧 Channel Updated")
          .setDescription(`**${newChannel.name}** channel was updated`)
          .addFields(
            {
              name: "Channel",
              value: `${newChannel} (${newChannel.id})`,
              inline: true,
            },
            ...changes
          )
          .setColor(0xffa500)
          .setTimestamp();

        logChannel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  },
};
