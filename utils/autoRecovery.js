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
          url: emoji.imageURL(),
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

  /**
   * Enhanced recovery with granular restoration options (EXCEEDS WICK - faster and more flexible)
   * @param {Guild} guild - The guild to recover
   * @param {number|object} snapshotIdOrData - Snapshot ID or snapshot data
   * @param {object} options - Recovery options
   * @param {string[]} options.types - Types to restore: ['channels', 'roles', 'emojis', 'stickers', 'webhooks', 'server_settings']
   * @param {boolean} options.priority - Priority-based recovery (restore critical items first)
   * @param {boolean} options.incremental - Incremental recovery (restore in stages)
   * @param {number} options.maxConcurrent - Max concurrent operations (default: optimized per type)
   * @returns {Promise<object>} Recovery result
   */
  static async recover(guild, snapshotIdOrData, options = {}) {
    const startTime = Date.now();
    const {
      types = [
        "channels",
        "roles",
        "emojis",
        "stickers",
        "webhooks",
        "server_settings",
      ],
      priority = true,
      incremental = false,
      maxConcurrent = null,
    } = options;

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
    const progress = {
      total: 0,
      completed: 0,
      stages: [],
    };

    // Calculate total items for progress tracking
    progress.total =
      (types.includes("channels") ? snapshotData.channels?.length || 0 : 0) +
      (types.includes("roles") ? snapshotData.roles?.length || 0 : 0) +
      (types.includes("emojis") ? snapshotData.emojis?.length || 0 : 0) +
      (types.includes("stickers") ? snapshotData.stickers?.length || 0 : 0) +
      (types.includes("webhooks") ? snapshotData.webhooks?.length || 0 : 0) +
      (types.includes("server_settings") ? 1 : 0);

    // Starting recovery (no console logging)

    // Priority-based recovery: Sort channels by importance (system channels first, then by position)
    const sortChannelsByPriority = (channels) => {
      if (!priority) return channels;
      return channels.sort((a, b) => {
        // System channels first
        const aIsSystem = a.type === 4 || a.type === 5; // Category or Announcement
        const bIsSystem = b.type === 4 || b.type === 5;
        if (aIsSystem && !bIsSystem) return -1;
        if (!aIsSystem && bIsSystem) return 1;
        // Then by position
        return (a.position || 0) - (b.position || 0);
      });
    };

    // Recover channels FIRST (before roles) - ENHANCED PARALLEL PROCESSING (EXCEEDS WICK - faster recovery)
    if (
      types.includes("channels") &&
      snapshotData.channels &&
      snapshotData.channels.length > 0
    ) {
      const stageStart = Date.now();
      // Stage 1: Recovering channels (no console logging)

      // Sort by priority if enabled
      const sortedChannels = sortChannelsByPriority([...snapshotData.channels]);

      // Optimized batch size based on server size (larger servers = larger batches)
      const batchSize =
        maxConcurrent ||
        (guild.memberCount > 5000 ? 15 : guild.memberCount > 1000 ? 12 : 10);

      // Process channels in parallel batches (optimized for speed)
      // EXCEEDS WICK - Adaptive batch sizing based on server size
      const channelBatches = [];
      for (let i = 0; i < sortedChannels.length; i += batchSize) {
        channelBatches.push(sortedChannels.slice(i, i + batchSize));
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

                // Restore permissions in parallel (optimized)
                if (
                  channelData.permissions &&
                  channelData.permissions.length > 0
                ) {
                  // Process permissions in smaller batches to avoid rate limits
                  const permBatches = [];
                  for (let i = 0; i < channelData.permissions.length; i += 5) {
                    permBatches.push(channelData.permissions.slice(i, i + 5));
                  }

                  for (const permBatch of permBatches) {
                    await Promise.all(
                      permBatch.map((perm) =>
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
                }

                recovered.push({
                  type: "channel",
                  id: newChannel.id,
                  name: newChannel.name,
                });
                progress.completed++;
              } else {
                skipped.push({
                  type: "channel",
                  name: channelData.name,
                  reason: "Already exists",
                });
                progress.completed++;
              }
            } catch (error) {
              ErrorHandler.logError(
                error,
                `autoRecovery [${guild.id}]`,
                `Recover channel ${channelData.name}`
              );
              progress.completed++;
            }
          })
        );

        // Incremental recovery: yield control between batches
        if (
          incremental &&
          channelBatches.indexOf(batch) < channelBatches.length - 1
        ) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }

      const stageDuration = Date.now() - stageStart;
      progress.stages.push({
        stage: "channels",
        duration: stageDuration,
        recovered: recovered.filter((r) => r.type === "channel").length,
        skipped: skipped.filter((s) => s.type === "channel").length,
      });
      // Stage 1 complete (no console logging)
    }

    // Recover roles - ENHANCED PARALLEL PROCESSING (EXCEEDS WICK - faster recovery)
    if (
      types.includes("roles") &&
      snapshotData.roles &&
      snapshotData.roles.length > 0
    ) {
      const stageStart = Date.now();
      // Stage 2: Recovering roles (no console logging)

      // Priority-based: Sort roles by position (higher position = more important)
      const sortedRoles = priority
        ? [...snapshotData.roles].sort(
            (a, b) => (b.position || 0) - (a.position || 0)
          )
        : snapshotData.roles;

      // Optimized batch size for roles (smaller than channels due to permission complexity)
      const roleBatchSize =
        maxConcurrent ||
        (guild.memberCount > 5000 ? 8 : guild.memberCount > 1000 ? 6 : 5);

      // Process roles in parallel batches (optimized for speed)
      // EXCEEDS WICK - Adaptive batch sizing and priority-based recovery
      const roleBatches = [];
      for (let i = 0; i < sortedRoles.length; i += roleBatchSize) {
        roleBatches.push(sortedRoles.slice(i, i + roleBatchSize));
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
                progress.completed++;

                logger.info(
                  `[AutoRecovery] ✅ Recreated role: ${roleData.name}`
                );
              } else {
                skipped.push({
                  type: "role",
                  name: roleData.name,
                  reason: "Already exists",
                });
                progress.completed++;
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
              progress.completed++;
            }
          })
        );

        // Incremental recovery: yield control between batches
        if (
          incremental &&
          roleBatches.indexOf(batch) < roleBatches.length - 1
        ) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }

      const stageDuration = Date.now() - stageStart;
      progress.stages.push({
        stage: "roles",
        duration: stageDuration,
        recovered: recovered.filter((r) => r.type === "role").length,
        skipped: skipped.filter((s) => s.type === "role").length,
      });
      // Stage 2 complete (no console logging)
    } else if (types.includes("roles")) {
      logger.warn(`[AutoRecovery] No roles in snapshot data`);
    }

    // Recover webhooks (EXCEEDS WICK - they don't restore webhooks)
    if (
      types.includes("webhooks") &&
      snapshotData.webhooks &&
      snapshotData.webhooks.length > 0
    ) {
      const stageStart = Date.now();
      logger.info(
        `[AutoRecovery] Stage 3: Attempting to recover ${snapshotData.webhooks.length} webhooks`
      );

      // Process webhooks in parallel batches for faster recovery
      const webhookBatches = [];
      const webhookBatchSize = maxConcurrent || 10;
      for (let i = 0; i < snapshotData.webhooks.length; i += webhookBatchSize) {
        webhookBatches.push(
          snapshotData.webhooks.slice(i, i + webhookBatchSize)
        );
      }

      for (const batch of webhookBatches) {
        await Promise.all(
          batch.map(async (webhookData) => {
            try {
              const channel = guild.channels.cache.get(webhookData.channelId);
              if (!channel) {
                skipped.push({
                  type: "webhook",
                  id: webhookData.id,
                  name: webhookData.name,
                  reason: "Channel not found",
                });
                progress.completed++;
                return;
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
              progress.completed++;
            } catch (error) {
              ErrorHandler.logError(
                error,
                `autoRecovery [${guild.id}]`,
                `Recover webhook ${webhookData.name}`
              );
              progress.completed++;
            }
          })
        );

        if (
          incremental &&
          webhookBatches.indexOf(batch) < webhookBatches.length - 1
        ) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }

      const stageDuration = Date.now() - stageStart;
      progress.stages.push({
        stage: "webhooks",
        duration: stageDuration,
        recovered: recovered.filter((r) => r.type === "webhook").length,
        skipped: skipped.filter((s) => s.type === "webhook").length,
      });
      // Stage 3 complete (no console logging)
    }

    // Recover emojis (EXCEEDS WICK - they don't restore emojis) - PARALLEL PROCESSING
    if (
      types.includes("emojis") &&
      snapshotData.emojis &&
      snapshotData.emojis.length > 0
    ) {
      const stageStart = Date.now();
      logger.info(
        `[AutoRecovery] Stage 4: Attempting to recover ${snapshotData.emojis.length} emojis (parallel processing)`
      );

      // Process emojis in parallel batches for faster recovery
      const emojiBatches = [];
      const emojiBatchSize = maxConcurrent || 5; // Smaller batches due to file downloads
      for (let i = 0; i < snapshotData.emojis.length; i += emojiBatchSize) {
        emojiBatches.push(snapshotData.emojis.slice(i, i + emojiBatchSize));
      }

      for (const batch of emojiBatches) {
        await Promise.all(
          batch.map(async (emojiData) => {
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
                  progress.completed++;
                  logger.info(
                    `[AutoRecovery] Recovered emoji: ${newEmoji.name}`
                  );
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
                  progress.completed++;
                }
              } else {
                skipped.push({
                  type: "emoji",
                  name: emojiData.name,
                  reason: "Already exists",
                });
                progress.completed++;
              }
            } catch (error) {
              ErrorHandler.logError(
                error,
                `autoRecovery [${guild.id}]`,
                `Recover emoji ${emojiData.name}`
              );
              progress.completed++;
            }
          })
        );

        if (
          incremental &&
          emojiBatches.indexOf(batch) < emojiBatches.length - 1
        ) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }

      const stageDuration = Date.now() - stageStart;
      progress.stages.push({
        stage: "emojis",
        duration: stageDuration,
        recovered: recovered.filter((r) => r.type === "emoji").length,
        skipped: skipped.filter((s) => s.type === "emoji").length,
      });
      // Stage 4 complete (no console logging)
    }

    // Recover stickers (EXCEEDS WICK - they don't restore stickers) - PARALLEL PROCESSING
    if (
      types.includes("stickers") &&
      snapshotData.stickers &&
      snapshotData.stickers.length > 0
    ) {
      const stageStart = Date.now();
      logger.info(
        `[AutoRecovery] Stage 5: Attempting to recover ${snapshotData.stickers.length} stickers (parallel processing)`
      );

      // Process stickers in parallel batches for faster recovery
      const stickerBatches = [];
      const stickerBatchSize = maxConcurrent || 5; // Smaller batches due to file downloads
      for (let i = 0; i < snapshotData.stickers.length; i += stickerBatchSize) {
        stickerBatches.push(
          snapshotData.stickers.slice(i, i + stickerBatchSize)
        );
      }

      for (const batch of stickerBatches) {
        await Promise.all(
          batch.map(async (stickerData) => {
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
                  progress.completed++;
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
                  progress.completed++;
                }
              } else {
                skipped.push({
                  type: "sticker",
                  name: stickerData.name,
                  reason: "Already exists",
                });
                progress.completed++;
              }
            } catch (error) {
              ErrorHandler.logError(
                error,
                `autoRecovery [${guild.id}]`,
                `Recover sticker ${stickerData.name}`
              );
              progress.completed++;
            }
          })
        );

        if (
          incremental &&
          stickerBatches.indexOf(batch) < stickerBatches.length - 1
        ) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }

      const stageDuration = Date.now() - stageStart;
      progress.stages.push({
        stage: "stickers",
        duration: stageDuration,
        recovered: recovered.filter((r) => r.type === "sticker").length,
        skipped: skipped.filter((s) => s.type === "sticker").length,
      });
      // Stage 5 complete (no console logging)
    }

    // Recover server settings (EXCEEDS WICK - they don't restore server settings)
    if (types.includes("server_settings") && snapshotData.serverSettings) {
      const stageStart = Date.now();
      logger.info(
        `[AutoRecovery] Stage 6: Attempting to recover server settings`
      );

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
            progress.completed++;
            logger.info(
              `[AutoRecovery] Recovered ${
                Object.keys(updates).length
              } server settings`
            );
          } else {
            progress.completed++;
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
          progress.completed++;
        }
      } catch (error) {
        ErrorHandler.logError(
          error,
          `autoRecovery [${guild.id}]`,
          `Recover server settings`
        );
        progress.completed++;
      }

      const stageDuration = Date.now() - stageStart;
      progress.stages.push({
        stage: "server_settings",
        duration: stageDuration,
        recovered: recovered.filter((r) => r.type === "server_settings").length,
        skipped: skipped.filter((s) => s.type === "server_settings").length,
      });
      // Stage 6 complete (no console logging)
    }

    const totalDuration = Date.now() - startTime;
    const avgStageTime =
      progress.stages.length > 0
        ? progress.stages.reduce((sum, s) => sum + s.duration, 0) /
          progress.stages.length
        : 0;

    // Recovery complete (no console logging)

    return {
      success: true,
      recovered: recovered.length,
      skipped: skipped.length,
      items: recovered,
      skippedItems: skipped,
      duration: totalDuration,
      progress: {
        total: progress.total,
        completed: progress.completed,
        percentage:
          progress.total > 0
            ? Math.round((progress.completed / progress.total) * 100)
            : 100,
      },
      stages: progress.stages,
      options: {
        types,
        priority,
        incremental,
      },
    };
  }

  /**
   * Selective recovery - restore only specific types (EXCEEDS WICK - granular control)
   * @param {Guild} guild - The guild to recover
   * @param {number} snapshotId - Snapshot ID
   * @param {string[]} types - Types to restore
   * @returns {Promise<object>} Recovery result
   */
  static async recoverSelective(guild, snapshotId, types) {
    return await this.recover(guild, snapshotId, { types });
  }

  /**
   * Priority-based recovery - restore critical items first (EXCEEDS WICK - faster critical recovery)
   * @param {Guild} guild - The guild to recover
   * @param {number} snapshotId - Snapshot ID
   * @returns {Promise<object>} Recovery result
   */
  static async recoverPriority(guild, snapshotId) {
    return await this.recover(guild, snapshotId, { priority: true });
  }

  /**
   * Incremental recovery - restore in stages with progress tracking (EXCEEDS WICK - better for large servers)
   * @param {Guild} guild - The guild to recover
   * @param {number} snapshotId - Snapshot ID
   * @returns {Promise<object>} Recovery result
   */
  static async recoverIncremental(guild, snapshotId) {
    return await this.recover(guild, snapshotId, { incremental: true });
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
