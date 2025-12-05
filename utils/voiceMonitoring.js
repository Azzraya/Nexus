const db = require("./database");
const logger = require("./logger");

class VoiceMonitoring {
  constructor(client) {
    this.client = client;
    this.voiceSessions = new Map(); // userId-guildId -> { channelId, joinedAt }
    this.recentJoins = new Map(); // guildId -> [{ userId, channelId, timestamp }]
  }

  /**
   * Track voice state update
   */
  async trackVoiceState(oldState, newState) {
    const member = newState.member;
    const guild = newState.guild;
    const key = `${member.id}-${guild.id}`;

    // User joined a voice channel
    if (!oldState.channelId && newState.channelId) {
      await this.handleVoiceJoin(member, newState.channel, guild);
    }
    // User left a voice channel
    else if (oldState.channelId && !newState.channelId) {
      await this.handleVoiceLeave(member, oldState.channel, guild);
    }
    // User moved channels
    else if (
      oldState.channelId &&
      newState.channelId &&
      oldState.channelId !== newState.channelId
    ) {
      await this.handleVoiceMove(
        member,
        oldState.channel,
        newState.channel,
        guild
      );
    }
  }

  async handleVoiceJoin(member, channel, guild) {
    const key = `${member.id}-${guild.id}`;
    const now = Date.now();

    // Track session
    this.voiceSessions.set(key, {
      channelId: channel.id,
      channelName: channel.name,
      joinedAt: now,
    });

    // Track recent joins for raid detection
    if (!this.recentJoins.has(guild.id)) {
      this.recentJoins.set(guild.id, []);
    }

    const joins = this.recentJoins.get(guild.id);
    joins.push({ userId: member.id, channelId: channel.id, timestamp: now });

    // Clean old joins (older than 30 seconds)
    const filtered = joins.filter((j) => now - j.timestamp < 30000);
    this.recentJoins.set(guild.id, filtered);

    // Check for voice raid (10+ joins in 30 seconds)
    const config = await db.getVoiceMonitoringConfig(guild.id);
    if (config && config.raid_detection_enabled) {
      if (filtered.length >= (config.raid_threshold || 10)) {
        await this.handleVoiceRaid(guild, filtered, config);
      }
    }

    // Log to database
    await db.logVoiceActivity(guild.id, member.id, channel.id, "join");

    // Auto-create voice channel if needed
    if (config && config.auto_create_enabled) {
      await this.checkAutoCreateChannel(channel, config);
    }

    // Send notification if configured
    if (config && config.log_channel) {
      await this.logVoiceEvent(guild, member, channel, "joined", config);
    }
  }

  async handleVoiceLeave(member, channel, guild) {
    const key = `${member.id}-${guild.id}`;
    const session = this.voiceSessions.get(key);

    if (session) {
      const duration = Date.now() - session.joinedAt;

      // Log session duration
      await db.updateVoiceSession(guild.id, member.id, channel.id, duration);

      this.voiceSessions.delete(key);
    }

    // Log to database
    await db.logVoiceActivity(guild.id, member.id, channel.id, "leave");

    // Auto-delete empty voice channel if configured
    const config = await db.getVoiceMonitoringConfig(guild.id);
    if (config && config.auto_delete_enabled) {
      await this.checkAutoDeleteChannel(channel, config);
    }

    // Send notification if configured
    if (config && config.log_channel) {
      await this.logVoiceEvent(guild, member, channel, "left", config);
    }
  }

  async handleVoiceMove(member, oldChannel, newChannel, guild) {
    await db.logVoiceActivity(guild.id, member.id, oldChannel.id, "leave");
    await db.logVoiceActivity(guild.id, member.id, newChannel.id, "join");

    const config = await db.getVoiceMonitoringConfig(guild.id);
    if (config && config.log_channel) {
      await this.logVoiceEvent(
        guild,
        member,
        newChannel,
        "moved",
        config,
        oldChannel
      );
    }
  }

  async handleVoiceRaid(guild, joins, config) {
    logger.warn(
      `[VoiceMonitoring] Voice raid detected in ${guild.name}: ${joins.length} joins in 30s`
    );

    // Disconnect all recent joiners
    for (const join of joins) {
      try {
        const member = await guild.members.fetch(join.userId);
        if (member.voice.channelId) {
          await member.voice.disconnect("Voice raid protection");
        }
      } catch (error) {
        // Ignore errors
      }
    }

    // Send alert
    if (config.alert_channel) {
      const channel = guild.channels.cache.get(config.alert_channel);
      if (channel) {
        const { EmbedBuilder } = require("discord.js");
        const embed = new EmbedBuilder()
          .setTitle("🚨 Voice Raid Detected")
          .setDescription(
            `${joins.length} users joined voice channels in 30 seconds`
          )
          .setColor(0xff0000)
          .addFields({
            name: "Action Taken",
            value: "All recent joiners have been disconnected",
            inline: false,
          })
          .setTimestamp();

        await channel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }

  async checkAutoCreateChannel(channel, config) {
    // If channel is full, create a new one
    if (channel.userLimit > 0 && channel.members.size >= channel.userLimit) {
      try {
        const newChannel = await channel.guild.channels.create({
          name: `${channel.name} 2`,
          type: channel.type,
          parent: channel.parentId,
          userLimit: channel.userLimit,
          bitrate: channel.bitrate,
          reason: "Auto-create: Original channel full",
        });

        logger.info(
          `[VoiceMonitoring] Auto-created voice channel: ${newChannel.name}`
        );
      } catch (error) {
        logger.error("[VoiceMonitoring] Failed to auto-create channel:", error);
      }
    }
  }

  async checkAutoDeleteChannel(channel, config) {
    // Only delete if channel is empty and was auto-created
    if (channel.members.size === 0 && channel.name.includes("Auto")) {
      try {
        await channel.delete("Auto-delete: Empty auto-created channel");
        logger.info(
          `[VoiceMonitoring] Auto-deleted empty channel: ${channel.name}`
        );
      } catch (error) {
        logger.error("[VoiceMonitoring] Failed to auto-delete channel:", error);
      }
    }
  }

  async logVoiceEvent(
    guild,
    member,
    channel,
    action,
    config,
    oldChannel = null
  ) {
    const logChannel = guild.channels.cache.get(config.log_channel);
    if (!logChannel) return;

    try {
      const { EmbedBuilder } = require("discord.js");
      const embed = new EmbedBuilder()
        .setTitle(
          `🎤 Voice ${action.charAt(0).toUpperCase() + action.slice(1)}`
        )
        .setColor(
          action === "joined"
            ? 0x00ff00
            : action === "left"
              ? 0xff0000
              : 0x0099ff
        )
        .addFields(
          {
            name: "User",
            value: `${member.user.tag}\n${member.id}`,
            inline: true,
          },
          { name: "Channel", value: `${channel}`, inline: true }
        )
        .setTimestamp();

      if (oldChannel) {
        embed.addFields({
          name: "From",
          value: `${oldChannel}`,
          inline: true,
        });
      }

      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      // Ignore if can't send
    }
  }

  /**
   * Get voice activity stats for a guild
   */
  async getVoiceStats(guildId, days = 7) {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const logs = await db.getVoiceActivityLogs(guildId, since);

    const stats = {
      totalSessions: logs.filter((l) => l.action === "join").length,
      uniqueUsers: new Set(logs.map((l) => l.user_id)).size,
      totalDuration: 0,
      avgDuration: 0,
      topChannels: {},
      topUsers: {},
    };

    // Calculate durations and top channels/users
    const sessions = logs.filter((l) => l.session_duration);
    stats.totalDuration = sessions.reduce(
      (sum, l) => sum + l.session_duration,
      0
    );
    stats.avgDuration =
      sessions.length > 0 ? stats.totalDuration / sessions.length : 0;

    logs.forEach((log) => {
      stats.topChannels[log.channel_id] =
        (stats.topChannels[log.channel_id] || 0) + 1;
      stats.topUsers[log.user_id] = (stats.topUsers[log.user_id] || 0) + 1;
    });

    return stats;
  }
}

module.exports = VoiceMonitoring;
