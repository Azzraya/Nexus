const db = require("../utils/database");
const { EmbedBuilder } = require("discord.js");
const EnhancedLogging = require("../utils/enhancedLogging");
const logger = require("../utils/logger");

module.exports = {
  name: "channelPinsUpdate",
  async execute(channel, client) {
    // Ignore DMs
    if (!channel.guild) return;

    try {
      // Initialize pins cache if it doesn't exist or is not a Map
      if (!client.channelPins || !(client.channelPins instanceof Map)) {
        client.channelPins = new Map();
      }

      // Fetch pinned messages to see what changed (using new API - fetchPins instead of deprecated fetchPinned)
      const pinnedMessages = await channel.messages.fetchPins().catch(() => null);
      if (!pinnedMessages) {
        // If fetch fails, exit early
        return;
      }
      
      // Ensure channelPins is still a Map after async operation
      if (!client.channelPins || !(client.channelPins instanceof Map)) {
        client.channelPins = new Map();
      }
      
      const previousPins = client.channelPins.get(channel.id) || new Set();
      const currentPins = new Set(pinnedMessages.map((m) => m.id));

      // Find newly pinned messages
      const newlyPinned = [];
      for (const messageId of currentPins) {
        if (!previousPins.has(messageId)) {
          newlyPinned.push(messageId);
        }
      }

      // Find unpinned messages
      const newlyUnpinned = [];
      for (const messageId of previousPins) {
        if (!currentPins.has(messageId)) {
          newlyUnpinned.push(messageId);
        }
      }

      // Update cache - ensure channelPins is still a Map before setting
      try {
        if (client.channelPins instanceof Map) {
          client.channelPins.set(channel.id, currentPins);
        } else {
          // Fallback: reinitialize if somehow it's not a Map
          client.channelPins = new Map();
          client.channelPins.set(channel.id, currentPins);
        }
      } catch (cacheError) {
        // If cache update fails, log but don't crash
        logger.debug(
          "ChannelPinsUpdate",
          `Failed to update pin cache for channel ${channel.id}:`,
          cacheError.message
        );
      }

      // Log pin events
      for (const messageId of newlyPinned) {
        try {
          const message = pinnedMessages.get(messageId);
          if (message) {
            await EnhancedLogging.log(
              channel.guild.id,
              "message_pin",
              "moderation",
              {
                userId: message.author.id,
                moderatorId: null, // Will try to get from audit log
                action: "message_pinned",
                details: `Message pinned in #${channel.name}`,
                metadata: {
                  messageId: message.id,
                  channelId: channel.id,
                  channelName: channel.name,
                  content: message.content?.substring(0, 500) || "",
                  authorId: message.author.id,
                  authorTag: message.author.tag,
                  pinnedAt: new Date().toISOString(),
                },
                severity: "info",
              }
            );

            // Try to get who pinned from audit log
            try {
              const auditLogs = await channel.guild.fetchAuditLogs({
                limit: 1,
                type: 74, // MESSAGE_PIN
              });
              const entry = auditLogs.entries.first();
              if (
                entry &&
                entry.target?.id === messageId &&
                entry.createdTimestamp > Date.now() - 5000
              ) {
                // Update log with moderator info
                await db.db.run(
                  "UPDATE enhanced_logs SET moderator_id = ? WHERE guild_id = ? AND message_id = ? AND action = 'message_pinned' ORDER BY timestamp DESC LIMIT 1",
                  [entry.executor.id, channel.guild.id, messageId]
                );
              }
            } catch (error) {
              // Ignore audit log errors
            }
          }
        } catch (error) {
          logger.debug(
            `Error logging pin for message ${messageId}:`,
            error.message
          );
        }
      }

      // Log unpin events
      for (const messageId of newlyUnpinned) {
        await EnhancedLogging.log(
          channel.guild.id,
          "message_unpin",
          "moderation",
          {
            userId: null,
            moderatorId: null,
            action: "message_unpinned",
            details: `Message unpinned in #${channel.name}`,
            metadata: {
              messageId: messageId,
              channelId: channel.id,
              channelName: channel.name,
              unpinnedAt: new Date().toISOString(),
            },
            severity: "info",
          }
        );

        // Try to get who unpinned from audit log
        try {
          const auditLogs = await channel.guild.fetchAuditLogs({
            limit: 1,
            type: 75, // MESSAGE_UNPIN
          });
          const entry = auditLogs.entries.first();
          if (
            entry &&
            entry.target?.id === messageId &&
            entry.createdTimestamp > Date.now() - 5000
          ) {
            await db.db.run(
              "UPDATE enhanced_logs SET moderator_id = ? WHERE guild_id = ? AND message_id = ? AND action = 'message_unpinned' ORDER BY timestamp DESC LIMIT 1",
              [entry.executor.id, channel.guild.id, messageId]
            );
          }
        } catch (error) {
          // Ignore audit log errors
        }
      }
    } catch (error) {
      logger.error("ChannelPinsUpdate", "Error handling pins update", {
        message: error?.message || String(error),
        channelId: channel.id,
      });
    }
  },
};
