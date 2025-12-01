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
      snapshotData.channels = guild.channels.cache.map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parent: channel.parentId,
        position: channel.position,
      }));
      snapshotData.roles = guild.roles.cache
        .filter((role) => role.id !== guild.id)
        .map((role) => ({
          id: role.id,
          name: role.name,
          color: role.color,
          permissions: role.permissions.toArray(),
          position: role.position,
        }));
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

  static async recover(guild, snapshotId) {
    const snapshots = await db.getRecoverySnapshots(guild.id, 100);
    const snapshot = snapshots.find((s) => s.id === snapshotId);

    if (!snapshot) {
      throw new Error("Snapshot not found");
    }

    const { snapshot_data } = snapshot;
    const recovered = [];

    // Recover channels
    if (snapshot_data.channels) {
      for (const channelData of snapshot_data.channels) {
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
                  .catch(ErrorHandler.createSafeCatch(
                    `autoRecovery [${guild.id}]`,
                    `Restore permission overwrite for ${perm.id}`
                  ));
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
    if (snapshot_data.roles) {
      for (const roleData of snapshot_data.roles) {
        try {
          const existingRole = guild.roles.cache.get(roleData.id);

          if (!existingRole) {
            // Role was deleted, recreate it
            const newRole = await guild.roles.create({
              name: roleData.name,
              color: roleData.color,
              permissions: roleData.permissions,
              mentionable: roleData.mentionable,
              hoist: roleData.hoist,
            });

            // Set position
            if (roleData.position !== undefined) {
              await newRole
                .setPosition(roleData.position, { reason: "Auto-recovery" })
                .catch(ErrorHandler.createSafeCatch(
                  `autoRecovery [${guild.id}]`,
                  `Set role position for ${newRole.name}`
                ));
            }

            recovered.push({
              type: "role",
              id: newRole.id,
              name: newRole.name,
            });
          }
        } catch (error) {
          ErrorHandler.logError(
            error,
            `autoRecovery [${guild.id}]`,
            `Recover role ${roleData.name}`
          );
        }
      }
    }

    return {
      success: true,
      recovered: recovered.length,
      items: recovered,
    };
  }

  static async autoSnapshot(guild, reason) {
    // Automatically create snapshot before potential attack
    return await this.createSnapshot(guild, "full", reason);
  }
}

module.exports = AutoRecovery;
