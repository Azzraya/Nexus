const db = require("./database");
const logger = require("./logger");

class MultiServerManagement {
  constructor(client) {
    this.client = client;
    this.networks = new Map(); // networkId -> { guilds: Set, config }
  }

  /**
   * Create a server network
   */
  async createNetwork(networkName, ownerId) {
    const networkId = await db.createServerNetwork(networkName, ownerId);
    this.networks.set(networkId, {
      guilds: new Set(),
      config: {
        syncBans: true,
        syncWhitelist: true,
        syncBlacklist: true,
        sharedAnnouncements: false,
      },
    });
    return networkId;
  }

  /**
   * Add server to network
   */
  async addServerToNetwork(networkId, guildId, addedBy) {
    // Verify user has admin permissions in the guild
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      throw new Error("Guild not found");
    }

    await db.addGuildToNetwork(networkId, guildId, addedBy);

    if (!this.networks.has(networkId)) {
      const network = await db.getServerNetwork(networkId);
      this.networks.set(networkId, {
        guilds: new Set(network.guilds.map((g) => g.guild_id)),
        config: network.config,
      });
    }

    this.networks.get(networkId).guilds.add(guildId);
    logger.info(`[MultiServer] Added guild ${guildId} to network ${networkId}`);
  }

  /**
   * Remove server from network
   */
  async removeServerFromNetwork(networkId, guildId) {
    await db.removeGuildFromNetwork(networkId, guildId);

    if (this.networks.has(networkId)) {
      this.networks.get(networkId).guilds.delete(guildId);
    }

    logger.info(
      `[MultiServer] Removed guild ${guildId} from network ${networkId}`
    );
  }

  /**
   * Sync ban across network
   */
  async syncBan(networkId, userId, reason, bannedBy, originGuildId) {
    const network = this.networks.get(networkId);
    if (!network || !network.config.syncBans) return;

    const results = { success: 0, failed: 0, errors: [] };

    for (const guildId of network.guilds) {
      if (guildId === originGuildId) continue; // Skip origin server

      try {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) {
          results.failed++;
          continue;
        }

        await guild.members.ban(userId, {
          reason: `Network ban: ${reason} (Banned by ${bannedBy} in ${originGuildId})`,
          deleteMessageDays: 1,
        });

        // Log sync
        await db.logNetworkAction(networkId, guildId, "ban_sync", {
          userId,
          originGuild: originGuildId,
          bannedBy,
        });

        results.success++;
        logger.info(
          `[MultiServer] Synced ban of ${userId} to guild ${guildId}`
        );
      } catch (error) {
        results.failed++;
        results.errors.push(`${guildId}: ${error.message}`);
        logger.error(`[MultiServer] Failed to sync ban to ${guildId}:`, error);
      }
    }

    return results;
  }

  /**
   * Sync unban across network
   */
  async syncUnban(networkId, userId, reason, unbannedBy, originGuildId) {
    const network = this.networks.get(networkId);
    if (!network || !network.config.syncBans) return;

    const results = { success: 0, failed: 0, errors: [] };

    for (const guildId of network.guilds) {
      if (guildId === originGuildId) continue;

      try {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) {
          results.failed++;
          continue;
        }

        await guild.members.unban(
          userId,
          `Network unban: ${reason} (By ${unbannedBy})`
        );

        await db.logNetworkAction(networkId, guildId, "unban_sync", {
          userId,
          originGuild: originGuildId,
          unbannedBy,
        });

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`${guildId}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Add user to network whitelist
   */
  async addToNetworkWhitelist(networkId, userId, addedBy, reason) {
    await db.addToNetworkWhitelist(networkId, userId, addedBy, reason);

    const network = this.networks.get(networkId);
    if (!network || !network.config.syncWhitelist) return;

    // Sync to all servers in network
    for (const guildId of network.guilds) {
      try {
        await db.addToWhitelist(guildId, userId, reason, addedBy);
      } catch (error) {
        logger.error(
          `[MultiServer] Failed to sync whitelist to ${guildId}:`,
          error
        );
      }
    }

    logger.info(
      `[MultiServer] Added ${userId} to network ${networkId} whitelist`
    );
  }

  /**
   * Broadcast announcement to all servers in network
   */
  async broadcastAnnouncement(
    networkId,
    channelName,
    message,
    embedData = null
  ) {
    const network = this.networks.get(networkId);
    if (!network || !network.config.sharedAnnouncements) return;

    const results = { success: 0, failed: 0, errors: [] };

    for (const guildId of network.guilds) {
      try {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) {
          results.failed++;
          continue;
        }

        // Find channel with matching name
        const channel = guild.channels.cache.find(
          (c) =>
            c.name.toLowerCase().includes(channelName.toLowerCase()) &&
            c.isTextBased()
        );

        if (!channel) {
          results.failed++;
          results.errors.push(`${guild.name}: Channel not found`);
          continue;
        }

        if (embedData) {
          const { EmbedBuilder } = require("discord.js");
          const embed = new EmbedBuilder()
            .setTitle(embedData.title || "Network Announcement")
            .setDescription(message)
            .setColor(embedData.color || 0x5865f2)
            .setFooter({ text: "Network-wide announcement" })
            .setTimestamp();

          await channel.send({ embeds: [embed] });
        } else {
          await channel.send(message);
        }

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`${guildId}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Get network statistics
   */
  async getNetworkStats(networkId) {
    const network = await db.getServerNetwork(networkId);
    if (!network) return null;

    let totalMembers = 0;
    const guilds = [];

    for (const guildData of network.guilds) {
      const guild = this.client.guilds.cache.get(guildData.guild_id);
      if (guild) {
        totalMembers += guild.memberCount || 0;
        guilds.push({
          id: guild.id,
          name: guild.name,
          memberCount: guild.memberCount || 0,
          owner: guild.ownerId,
        });
      }
    }

    return {
      networkId: network.id,
      networkName: network.name,
      totalGuilds: network.guilds.length,
      totalMembers,
      guilds,
      config: network.config,
    };
  }
}

module.exports = MultiServerManagement;
