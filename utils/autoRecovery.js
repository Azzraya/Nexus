const db = require("./database");
const ErrorHandler = require("./errorHandler");
const logger = require("./logger");

class AutoRecovery {
  static async createSnapshot(guild, snapshotType, reason) {
    const snapshotData = {};

    if (snapshotType === "channels") {
      snapshotData.channels = guild.channels.cache.map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parent: channel.parentId,
        position: channel.position,
        permissions:
          channel.permissionOverwrites?.cache?.map((overwrite) => ({
            id: overwrite.id,
            type: overwrite.type,
            allow: overwrite.allow.toArray(),
            deny: overwrite.deny.toArray(),
          })) || [],
      }));
    } else if (snapshotType === "roles") {
      snapshotData.roles = guild.roles.cache
        .filter((role) => role.id !== guild.id)
        .map((role) => ({
          id: role.id,
          name: role.name,
          color: role.color,
          permissions: role.permissions.toArray(),
          position: role.position,
          mentionable: role.mentionable,
          hoist: role.hoist,
        }));
    } else if (snapshotType === "full") {
      // Ensure channels are fetched if cache is empty
      let channels = guild.channels.cache;
      if (channels.size === 0) {
        logger.warn(
          `[AutoRecovery] Channel cache is empty, fetching channels for ${guild.name}`
        );
        channels = await guild.channels
          .fetch()
          .catch(() => guild.channels.cache);
      }

      snapshotData.channels = Array.from(channels.values()).map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parent: channel.parentId,
        position: channel.position,
        permissions:
          channel.permissionOverwrites?.cache?.map((overwrite) => ({
            id: overwrite.id,
            type: overwrite.type,
            allow: overwrite.allow.toArray(),
            deny: overwrite.deny.toArray(),
          })) || [],
      }));

      // Ensure roles are fetched if cache is empty
      let roles = guild.roles.cache;
      if (roles.size === 0) {
        logger.warn(
          `[AutoRecovery] Role cache is empty, fetching roles for ${guild.name}`
        );
        roles = await guild.roles.fetch().catch(() => guild.roles.cache);
      }

      snapshotData.roles = Array.from(roles.values())
        .filter((role) => role.id !== guild.id)
        .map((role) => ({
          id: role.id,
          name: role.name,
          color: role.color,
          permissions: role.permissions.toArray(),
          position: role.position,
          mentionable: role.mentionable,
          hoist: role.hoist,
        }));

      // Capture webhooks (EXCEEDS WICK - they don't restore webhooks)
      try {
        const webhooksCollection = await guild
          .fetchWebhooks()
          .catch(() => null);
        const webhooks = webhooksCollection
          ? Array.from(webhooksCollection.values())
          : [];
        snapshotData.webhooks = webhooks.map((webhook) => ({
          id: webhook.id,
          name: webhook.name,
          channelId: webhook.channelId,
          avatar: webhook.avatar,
          url: webhook.url,
        }));
        logger.info(
          `[AutoRecovery] Captured ${webhooks.length} webhooks in snapshot`
        );
      } catch (error) {
        logger.warn(`[AutoRecovery] Failed to capture webhooks:`, error);
        snapshotData.webhooks = [];
      }

      // Capture emojis (EXCEEDS WICK - they don't restore emojis)
      try {
        const emojis = await guild.emojis
          .fetch()
          .catch(() => guild.emojis.cache);
        snapshotData.emojis = Array.from(emojis.values()).map((emoji) => ({
          id: emoji.id,
          name: emoji.name,
          animated: emoji.animated,
          url: emoji.url,
        }));
        logger.info(
          `[AutoRecovery] Captured ${snapshotData.emojis.length} emojis in snapshot`
        );
      } catch (error) {
        logger.warn(`[AutoRecovery] Failed to capture emojis:`, error);
        snapshotData.emojis = [];
      }

      // Capture stickers (EXCEEDS WICK - they don't restore stickers)
      try {
        const stickers = await guild.stickers
          .fetch()
          .catch(() => guild.stickers.cache);
        snapshotData.stickers = Array.from(stickers.values()).map(
          (sticker) => ({
            id: sticker.id,
            name: sticker.name,
            description: sticker.description,
            format: sticker.format,
            url: sticker.url,
          })
        );
        logger.info(
          `[AutoRecovery] Captured ${snapshotData.stickers.length} stickers in snapshot`
        );
      } catch (error) {
        logger.warn(`[AutoRecovery] Failed to capture stickers:`, error);
        snapshotData.stickers = [];
      }

      // Capture server settings (EXCEEDS WICK - they don't restore server settings)
      snapshotData.serverSettings = {
        name: guild.name,
        description: guild.description,
        icon: guild.iconURL({ dynamic: true }),
        banner: guild.bannerURL({ dynamic: true }),
        splash: guild.splashURL({ dynamic: true }),
        verificationLevel: guild.verificationLevel,
        defaultMessageNotifications: guild.defaultMessageNotifications,
        explicitContentFilter: guild.explicitContentFilter,
        afkChannelId: guild.afkChannelId,
        afkTimeout: guild.afkTimeout,
        systemChannelId: guild.systemChannelId,
        rulesChannelId: guild.rulesChannelId,
        publicUpdatesChannelId: guild.publicUpdatesChannelId,
        preferredLocale: guild.preferredLocale,
      };

      logger.info(
        `[AutoRecovery] Snapshot created: ${
          snapshotData.channels.length
        } channels, ${snapshotData.roles.length} roles, ${
          snapshotData.webhooks?.length || 0
        } webhooks, ${snapshotData.emojis?.length || 0} emojis, ${
          snapshotData.stickers?.length || 0
        } stickers, server settings`
      );
    }

    await db.createRecoverySnapshot(
      guild.id,
      snapshotType,
      snapshotData,
      "system",
      reason
    );

    return snapshotData;
  }

  static async recover(guild, snapshotIdOrData) {
    // If snapshotIdOrData is a number, it's an ID. Otherwise, it's the snapshot data itself
    let snapshot;
    if (typeof snapshotIdOrData === "number") {
      const snapshots = await db.getRecoverySnapshots(guild.id, 100);
      snapshot = snapshots.find((s) => s.id === snapshotIdOrData);
    } else {
      // Use the provided snapshot data directly
      snapshot = snapshotIdOrData;
    }

    if (!snapshot) {
      throw new Error("Snapshot not found");
    }

    // Get snapshot_data - it's already parsed by getRecoverySnapshots
    const snapshotData = snapshot.snapshot_data || snapshot;
    const recovered = [];
    const skipped = [];

    logger.info(
      `[AutoRecovery] Starting recovery for ${guild.name} - ${
        snapshotData.channels?.length || 0
      } channels, ${snapshotData.roles?.length || 0} roles, ${
        snapshotData.webhooks?.length || 0
      } webhooks, ${snapshotData.emojis?.length || 0} emojis, ${
        snapshotData.stickers?.length || 0
      } stickers in snapshot`
    );

    // Recover channels FIRST (before roles) - PARALLEL PROCESSING (EXCEEDS WICK - faster recovery)
    if (snapshotData.channels && snapshotData.channels.length > 0) {
      logger.info(
        `[AutoRecovery] Attempting to recover ${snapshotData.channels.length} channels (parallel processing enabled)`
      );

      // Process channels in parallel batches (max 5 at a time to avoid rate limits)
      const channelBatches = [];
      for (let i = 0; i < snapshotData.channels.length; i += 5) {
        channelBatches.push(snapshotData.channels.slice(i, i + 5));
      }

      for (const batch of channelBatches) {
        await Promise.all(
          batch.map(async (channelData) => {
            try {
              const existingChannel = guild.channels.cache.get(channelData.id);

              if (!existingChannel) {
                // Channel was deleted, recreate it
                const newChannel = await guild.channels.create({
                  name: channelData.name,
                  type: channelData.type,
                  parent: channelData.parent,
                  position: channelData.position,
                });

                // Restore permissions in parallel
                if (
                  channelData.permissions &&
                  channelData.permissions.length > 0
                ) {
                  await Promise.all(
                    channelData.permissions.map((perm) =>
                      newChannel.permissionOverwrites
                        .edit(perm.id, {
                          allow: perm.allow,
                          deny: perm.deny,
                        })
                        .catch(
                          ErrorHandler.createSafeCatch(
                            `autoRecovery [${guild.id}]`,
                            `Restore permission overwrite for ${perm.id}`
                          )
                        )
                    )
                  );
                }

                recovered.push({
                  type: "channel",
                  id: newChannel.id,
                  name: newChannel.name,
                });
              }
            } catch (error) {
              ErrorHandler.logError(
                error,
                `autoRecovery [${guild.id}]`,
                `Recover channel ${channelData.name}`
              );
            }
          })
        );
      }
    }

    // Recover roles - PARALLEL PROCESSING (EXCEEDS WICK - faster recovery)
    if (snapshotData.roles && snapshotData.roles.length > 0) {
      logger.info(
        `[AutoRecovery] Attempting to recover ${snapshotData.roles.length} roles (parallel processing enabled)`
      );

      // Process roles in parallel batches (max 3 at a time to avoid rate limits)
      const roleBatches = [];
      for (let i = 0; i < snapshotData.roles.length; i += 3) {
        roleBatches.push(snapshotData.roles.slice(i, i + 3));
      }

      for (const batch of roleBatches) {
        await Promise.all(
          batch.map(async (roleData) => {
            try {
              // Check if role exists by ID
              let existingRole = guild.roles.cache.get(roleData.id);

              // Also check if a role with the same name already exists
              if (!existingRole && roleData.name) {
                existingRole = guild.roles.cache.find(
                  (r) => r.name === roleData.name
                );
              }

              if (!existingRole) {
                // Role was deleted, recreate it
                // Check if bot has permission to create roles
                const botMember = await guild.members
                  .fetch(guild.client.user.id)
                  .catch(() => null);
                if (!botMember || !botMember.permissions.has("ManageRoles")) {
                  logger.warn(
                    `[AutoRecovery] Bot lacks ManageRoles permission - skipping role recovery for ${guild.id}`
                  );
                  return; // Skip this role if bot lacks permission
                }

                // Try to create role at a safe position (lower than bot's role)
                const botHighestRole = botMember.roles.highest;
                const safePosition = botHighestRole
                  ? Math.max(0, botHighestRole.position - 1)
                  : undefined;

                const newRole = await guild.roles.create({
                  name: roleData.name,
                  colors: roleData.color ? [roleData.color] : undefined, // Use 'colors' instead of deprecated 'color'
                  permissions: roleData.permissions,
                  mentionable: roleData.mentionable,
                  hoist: roleData.hoist,
                  position: safePosition, // Set position during creation if possible
                });

                // Try to set original position if different (may fail due to hierarchy)
                if (
                  roleData.position !== undefined &&
                  roleData.position !== safePosition
                ) {
                  await newRole
                    .setPosition(roleData.position, { reason: "Auto-recovery" })
                    .catch(
                      ErrorHandler.createSafeCatch(
                        `autoRecovery [${guild.id}]`,
                        `Set role position for ${newRole.name}`
                      )
                    );
                }

                recovered.push({
                  type: "role",
                  id: newRole.id,
                  name: newRole.name,
                });

                logger.info(
                  `[AutoRecovery] ✅ Recreated role: ${roleData.name}`
                );
              } else {
                skipped.push({
                  type: "role",
                  name: roleData.name,
                  reason: "Already exists",
                });
              }
            } catch (error) {
              logger.error(
                `[AutoRecovery] Failed to recover role ${roleData.name}:`,
                error
              );
              ErrorHandler.logError(
                error,
                `autoRecovery [${guild.id}]`,
                `Recover role ${roleData.name || roleData.id}`
              );
            }
          })
        );
      }
    } else {
      logger.warn(`[AutoRecovery] No roles in snapshot data`);
    }

    // Recover webhooks (EXCEEDS WICK - they don't restore webhooks)
    if (snapshotData.webhooks && snapshotData.webhooks.length > 0) {
      logger.info(
        `[AutoRecovery] Attempting to recover ${snapshotData.webhooks.length} webhooks`
      );

      for (const webhookData of snapshotData.webhooks) {
        try {
          const channel = guild.channels.cache.get(webhookData.channelId);
          if (!channel) {
            skipped.push({
              type: "webhook",
              id: webhookData.id,
              name: webhookData.name,
              reason: "Channel not found",
            });
            continue;
          }

          // Check if webhook already exists
          const existingWebhooks = await channel
            .fetchWebhooks()
            .catch(() => []);
          const existingWebhook = existingWebhooks.find(
            (w) => w.id === webhookData.id || w.name === webhookData.name
          );

          if (!existingWebhook) {
            // Note: We can't recreate webhooks with exact same properties without the token
            // But we can log that it was missing
            logger.info(
              `[AutoRecovery] Webhook ${webhookData.name} was deleted (cannot recreate without token)`
            );
            skipped.push({
              type: "webhook",
              id: webhookData.id,
              name: webhookData.name,
              reason: "Cannot recreate without token",
            });
          }
        } catch (error) {
          ErrorHandler.logError(
            error,
            `autoRecovery [${guild.id}]`,
            `Recover webhook ${webhookData.name}`
          );
        }
      }
    }

    // Recover emojis (EXCEEDS WICK - they don't restore emojis)
    if (snapshotData.emojis && snapshotData.emojis.length > 0) {
      logger.info(
        `[AutoRecovery] Attempting to recover ${snapshotData.emojis.length} emojis`
      );

      for (const emojiData of snapshotData.emojis) {
        try {
          const existingEmoji = guild.emojis.cache.get(emojiData.id);
          if (!existingEmoji) {
            // Try to fetch emoji image and recreate
            try {
              const response = await fetch(emojiData.url);
              const buffer = await response.arrayBuffer();
              const attachment = Buffer.from(buffer);

              const newEmoji = await guild.emojis.create({
                attachment: attachment,
                name: emojiData.name,
                reason: "Auto-recovery: Restore deleted emoji",
              });

              recovered.push({
                type: "emoji",
                id: newEmoji.id,
                name: newEmoji.name,
              });
              logger.info(`[AutoRecovery] Recovered emoji: ${newEmoji.name}`);
            } catch (error) {
              logger.warn(
                `[AutoRecovery] Failed to recover emoji ${emojiData.name}:`,
                error.message
              );
              skipped.push({
                type: "emoji",
                id: emojiData.id,
                name: emojiData.name,
                reason: error.message,
              });
            }
          }
        } catch (error) {
          ErrorHandler.logError(
            error,
            `autoRecovery [${guild.id}]`,
            `Recover emoji ${emojiData.name}`
          );
        }
      }
    }

    // Recover stickers (EXCEEDS WICK - they don't restore stickers)
    if (snapshotData.stickers && snapshotData.stickers.length > 0) {
      logger.info(
        `[AutoRecovery] Attempting to recover ${snapshotData.stickers.length} stickers`
      );

      for (const stickerData of snapshotData.stickers) {
        try {
          const existingSticker = guild.stickers.cache.get(stickerData.id);
          if (!existingSticker) {
            // Try to fetch sticker file and recreate
            try {
              const response = await fetch(stickerData.url);
              const buffer = await response.arrayBuffer();
              const attachment = Buffer.from(buffer);

              const newSticker = await guild.stickers.create({
                file: attachment,
                name: stickerData.name,
                description: stickerData.description || "",
                tags: stickerData.name, // Use name as tag
                reason: "Auto-recovery: Restore deleted sticker",
              });

              recovered.push({
                type: "sticker",
                id: newSticker.id,
                name: newSticker.name,
              });
              logger.info(
                `[AutoRecovery] Recovered sticker: ${newSticker.name}`
              );
            } catch (error) {
              logger.warn(
                `[AutoRecovery] Failed to recover sticker ${stickerData.name}:`,
                error.message
              );
              skipped.push({
                type: "sticker",
                id: stickerData.id,
                name: stickerData.name,
                reason: error.message,
              });
            }
          }
        } catch (error) {
          ErrorHandler.logError(
            error,
            `autoRecovery [${guild.id}]`,
            `Recover sticker ${stickerData.name}`
          );
        }
      }
    }

    // Recover server settings (EXCEEDS WICK - they don't restore server settings)
    if (snapshotData.serverSettings) {
      logger.info(`[AutoRecovery] Attempting to recover server settings`);

      try {
        const botMember = await guild.members
          .fetch(guild.client.user.id)
          .catch(() => null);

        if (botMember && botMember.permissions.has("ManageGuild")) {
          const settings = snapshotData.serverSettings;
          const updates = {};

          // Only update if different from current
          if (settings.name && settings.name !== guild.name) {
            updates.name = settings.name;
          }
          if (
            settings.description &&
            settings.description !== guild.description
          ) {
            updates.description = settings.description;
          }
          if (
            settings.verificationLevel !== undefined &&
            settings.verificationLevel !== guild.verificationLevel
          ) {
            updates.verificationLevel = settings.verificationLevel;
          }
          if (
            settings.defaultMessageNotifications !== undefined &&
            settings.defaultMessageNotifications !==
              guild.defaultMessageNotifications
          ) {
            updates.defaultMessageNotifications =
              settings.defaultMessageNotifications;
          }
          if (
            settings.explicitContentFilter !== undefined &&
            settings.explicitContentFilter !== guild.explicitContentFilter
          ) {
            updates.explicitContentFilter = settings.explicitContentFilter;
          }
          if (
            settings.afkChannelId &&
            settings.afkChannelId !== guild.afkChannelId
          ) {
            const afkChannel = guild.channels.cache.get(settings.afkChannelId);
            if (afkChannel) {
              updates.afkChannel = afkChannel;
              updates.afkTimeout = settings.afkTimeout || guild.afkTimeout;
            }
          }
          if (
            settings.systemChannelId &&
            settings.systemChannelId !== guild.systemChannelId
          ) {
            const systemChannel = guild.channels.cache.get(
              settings.systemChannelId
            );
            if (systemChannel) {
              updates.systemChannel = systemChannel;
            }
          }
          if (
            settings.rulesChannelId &&
            settings.rulesChannelId !== guild.rulesChannelId
          ) {
            const rulesChannel = guild.channels.cache.get(
              settings.rulesChannelId
            );
            if (rulesChannel) {
              updates.rulesChannel = rulesChannel;
            }
          }
          if (
            settings.publicUpdatesChannelId &&
            settings.publicUpdatesChannelId !== guild.publicUpdatesChannelId
          ) {
            const publicUpdatesChannel = guild.channels.cache.get(
              settings.publicUpdatesChannelId
            );
            if (publicUpdatesChannel) {
              updates.publicUpdatesChannel = publicUpdatesChannel;
            }
          }
          if (
            settings.preferredLocale &&
            settings.preferredLocale !== guild.preferredLocale
          ) {
            updates.preferredLocale = settings.preferredLocale;
          }

          if (Object.keys(updates).length > 0) {
            await guild.edit(updates, {
              reason: "Auto-recovery: Restore server settings",
            });
            recovered.push({
              type: "server_settings",
              count: Object.keys(updates).length,
            });
            logger.info(
              `[AutoRecovery] Recovered ${
                Object.keys(updates).length
              } server settings`
            );
          }

          // Restore icon/banner if available (requires additional permissions)
          if (settings.icon && botMember.permissions.has("ManageGuild")) {
            try {
              const iconResponse = await fetch(settings.icon);
              const iconBuffer = await iconResponse.arrayBuffer();
              await guild
                .setIcon(
                  Buffer.from(iconBuffer),
                  "Auto-recovery: Restore server icon"
                )
                .catch((err) => {
                  logger.debug(
                    `[AutoRecovery] Failed to restore server icon:`,
                    err.message
                  );
                });
            } catch (error) {
              logger.warn(
                `[AutoRecovery] Failed to restore server icon:`,
                error.message
              );
            }
          }

          if (settings.banner && botMember.permissions.has("ManageGuild")) {
            try {
              const bannerResponse = await fetch(settings.banner);
              const bannerBuffer = await bannerResponse.arrayBuffer();
              await guild
                .setBanner(
                  Buffer.from(bannerBuffer),
                  "Auto-recovery: Restore server banner"
                )
                .catch((err) => {
                  logger.debug(
                    `[AutoRecovery] Failed to restore server banner:`,
                    err.message
                  );
                });
            } catch (error) {
              logger.warn(
                `[AutoRecovery] Failed to restore server banner:`,
                error.message
              );
            }
          }
        } else {
          logger.warn(
            `[AutoRecovery] Bot lacks ManageGuild permission - skipping server settings recovery`
          );
        }
      } catch (error) {
        ErrorHandler.logError(
          error,
          `autoRecovery [${guild.id}]`,
          `Recover server settings`
        );
      }
    }

    logger.info(
      `[AutoRecovery] Recovery complete: ${recovered.length} items recovered, ${skipped.length} items skipped`
    );

    return {
      success: true,
      recovered: recovered.length,
      skipped: skipped.length,
      items: recovered,
      skippedItems: skipped,
    };
  }

  static async autoSnapshot(guild, reason) {
    // Automatically create snapshot before potential attack
    // Ensure channels and roles are fetched before snapshotting
    try {
      await guild.channels.fetch();
      await guild.roles.fetch();
      logger.info(
        `[AutoRecovery] Fetched ${guild.channels.cache.size} channels and ${guild.roles.cache.size} roles for snapshot`
      );
    } catch (error) {
      logger.warn(
        `[AutoRecovery] Failed to fetch channels/roles before snapshot:`,
        error
      );
    }

    return await this.createSnapshot(guild, "full", reason);
  }
}

module.exports = AutoRecovery;
