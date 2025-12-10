const logger = require("../utils/logger");
const db = require("../utils/database");

module.exports = {
  name: "presenceUpdate",
  async execute(oldPresence, newPresence, client) {
    try {
      // Skip if no new presence
      if (!newPresence) return;

      const member = newPresence.member;
      if (!member || !member.guild) return;

      // Get server config
      const config = await db.getServerConfig(member.guild.id);

      // Feature 1: Presence-based verification
      // If server has presence verification enabled, check for status changes
      if (config?.presence_verification_enabled) {
        await handlePresenceVerification(member, oldPresence, newPresence);
      }

      // Feature 2: Status role assignments
      // Automatically assign roles based on user status (gaming, streaming, etc.)
      if (config?.status_roles_enabled) {
        await handleStatusRoles(member, oldPresence, newPresence);
      }

      // Feature 3: Activity analytics (optional, for server insights)
      // Track general server activity patterns (not per-user surveillance)
      if (config?.activity_analytics_enabled) {
        await handleActivityAnalytics(member.guild.id, newPresence);
      }
    } catch (error) {
      logger.error("[PresenceUpdate] Error:", error);
    }
  },
};

/**
 * Presence-based verification
 * Users prove they're human by changing their status to a specific text
 */
async function handlePresenceVerification(member, oldPresence, newPresence) {
  try {
    // Check if user is in verification process
    const verification = await db.getPendingVerification(
      member.guild.id,
      member.id
    );
    if (!verification || verification.type !== "presence") return;

    // Check if their custom status matches the verification code
    const customStatus =
      newPresence.activities.find((a) => a.type === 4)?.state || "";

    if (customStatus.includes(verification.code)) {
      // Verification successful!
      await db.completeVerification(member.guild.id, member.id);
      logger.info(
        `[PresenceVerification] User ${member.user.tag} verified via presence`
      );

      // Give them the verified role
      const verifiedRoleId = verification.verified_role_id;
      if (verifiedRoleId) {
        const role = member.guild.roles.cache.get(verifiedRoleId);
        if (
          role &&
          member.guild.members.me.roles.highest.position > role.position
        ) {
          await member.roles.add(role);
        }
      }
    }
  } catch (error) {
    logger.error("[PresenceVerification] Error:", error);
  }
}

/**
 * Status-based role assignments
 * Automatically assign roles based on activity (Gaming, Streaming, etc.)
 */
async function handleStatusRoles(member, oldPresence, newPresence) {
  try {
    // Get status roles from database
    const statusRoles = await db.getStatusRoles(member.guild.id);

    const oldStatus = oldPresence?.status;
    const newStatus = newPresence?.status;

    // Check for gaming activity
    const isGaming = newPresence.activities.some((a) => a.type === 0); // PLAYING
    const wasGaming = oldPresence?.activities.some((a) => a.type === 0);

    if (isGaming && !wasGaming && statusRoles.gaming_role) {
      const role = member.guild.roles.cache.get(statusRoles.gaming_role);
      if (role) await member.roles.add(role).catch(() => {});
    } else if (!isGaming && wasGaming && statusRoles.gaming_role) {
      const role = member.guild.roles.cache.get(statusRoles.gaming_role);
      if (role) await member.roles.remove(role).catch(() => {});
    }

    // Check for streaming activity
    const isStreaming = newPresence.activities.some((a) => a.type === 1); // STREAMING
    const wasStreaming = oldPresence?.activities.some((a) => a.type === 1);

    if (isStreaming && !wasStreaming && statusRoles.streaming_role) {
      const role = member.guild.roles.cache.get(statusRoles.streaming_role);
      if (role) await member.roles.add(role).catch(() => {});
    } else if (!isStreaming && wasStreaming && statusRoles.streaming_role) {
      const role = member.guild.roles.cache.get(statusRoles.streaming_role);
      if (role) await member.roles.remove(role).catch(() => {});
    }
  } catch (error) {
    logger.debug("[StatusRoles] Error:", error);
  }
}

/**
 * Activity analytics (aggregate, not per-user surveillance)
 * Track general server activity patterns for insights
 */
async function handleActivityAnalytics(guildId, newPresence) {
  try {
    // Only track aggregate stats, not individual users
    const hour = new Date().getHours();
    const status = newPresence.status;

    // Increment activity counter for this hour
    await db.incrementActivityStat(guildId, hour, status);
  } catch (error) {
    logger.debug("[ActivityAnalytics] Error:", error);
  }
}
