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
        permissions: channel.permissionOverwrites.cache.map((overwrite) => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow.toArray(),
          deny: overwrite.deny.toArray(),
        })),
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
        logger.warn(`[AutoRecovery] Channel cache is empty, fetching channels for ${guild.name}`);
        channels = await guild.channels.fetch().catch(() => guild.channels.cache);
      }
      
      snapshotData.channels = Array.from(channels.values()).map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parent: channel.parentId,
        position: channel.position,
        permissions: channel.permissionOverwrites.cache.map((overwrite) => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow.toArray(),
          deny: overwrite.deny.toArray(),
        })),
      }));
      
      // Ensure roles are fetched if cache is empty
      let roles = guild.roles.cache;
      if (roles.size === 0) {
        logger.warn(`[AutoRecovery] Role cache is empty, fetching roles for ${guild.name}`);
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
      
      logger.info(`[AutoRecovery] Snapshot created: ${snapshotData.channels.length} channels, ${snapshotData.roles.length} roles`);
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
      } channels, ${snapshotData.roles?.length || 0} roles in snapshot`
    );

    // Recover channels FIRST (before roles)
    if (snapshotData.channels && snapshotData.channels.length > 0) {
      logger.info(
        `[AutoRecovery] Attempting to recover ${snapshotData.channels.length} channels`
      );

      for (const channelData of snapshotData.channels) {
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

            // Restore permissions
            if (channelData.permissions) {
              for (const perm of channelData.permissions) {
                await newChannel.permissionOverwrites
                  .edit(perm.id, {
                    allow: perm.allow,
                    deny: perm.deny,
                  })
                  .catch(
                    ErrorHandler.createSafeCatch(
                      `autoRecovery [${guild.id}]`,
                      `Restore permission overwrite for ${perm.id}`
                    )
                  );
              }
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
      }
    }

    // Recover roles
    if (snapshotData.roles && snapshotData.roles.length > 0) {
      logger.info(
        `[AutoRecovery] Attempting to recover ${snapshotData.roles.length} roles`
      );

      for (const roleData of snapshotData.roles) {
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
              break; // Skip all role recovery if bot lacks permission
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

            logger.info(`[AutoRecovery] ✅ Recreated role: ${roleData.name}`);
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
      }
    } else {
      logger.warn(`[AutoRecovery] No roles in snapshot data`);
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
