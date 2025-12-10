const logger = require("./logger");
const db = require("./database");

/**
 * Server Owner Limiter
 * Prevents abuse where one person adds bot to 5+ servers to inflate server count
 * Whitelist exists for legitimate users who own multiple diverse servers
 */

class ServerOwnerLimiter {
  constructor(client) {
    this.client = client;
    this.maxServersPerOwner = 5;
    // Whitelisted owner IDs who can have 5+ servers
    this.whitelist = new Set([
      // Add whitelisted owner IDs here
      // Example: "123456789012345678",
    ]);
  }

  /**
   * Check if owner has too many servers, leave extras if needed
   * @param {Guild} guild - The guild that was just joined
   */
  async checkOwnerLimit(guild) {
    try {
      const ownerId = guild.ownerId;

      // Skip check if owner is whitelisted
      if (this.whitelist.has(ownerId)) {
        logger.info(
          `[Owner Limiter] ${guild.name} owner is whitelisted, skipping check`
        );
        return { allowed: true, reason: "whitelisted" };
      }

      // Get all servers this owner has the bot in
      const ownerServers = this.client.guilds.cache.filter(
        (g) => g.ownerId === ownerId
      );

      logger.info(
        `[Owner Limiter] Owner ${ownerId} has bot in ${ownerServers.size} servers`
      );

      // If under limit, allow
      if (ownerServers.size < this.maxServersPerOwner) {
        return { allowed: true, reason: "under_limit" };
      }

      // Over limit! Leave all but the first/oldest server
      const sortedServers = ownerServers.sort(
        (a, b) => a.joinedTimestamp - b.joinedTimestamp
      );
      const keepServer = sortedServers.first();
      const leaveServers = sortedServers.filter((g) => g.id !== keepServer.id);

      logger.warn(
        `[Owner Limiter] Owner ${ownerId} has ${ownerServers.size} servers (limit: ${this.maxServersPerOwner})`
      );
      logger.warn(
        `[Owner Limiter] Keeping: ${keepServer.name} (${keepServer.id})`
      );
      logger.warn(
        `[Owner Limiter] Leaving ${leaveServers.size} other servers`
      );

      // Send notification to owner before leaving
      try {
        const owner = await this.client.users.fetch(ownerId);
        await owner.send(
          `**Server Owner Limit Reached**\n\n` +
            `You've added Nexus to ${ownerServers.size} servers, but our limit is ${this.maxServersPerOwner} servers per owner.\n\n` +
            `**Why this limit exists:**\n` +
            `- Prevents artificial server count inflation\n` +
            `- Ensures fair bot usage\n` +
            `- Detects bot farms and abuse\n\n` +
            `**What happened:**\n` +
            `✅ Kept: **${keepServer.name}**\n` +
            `❌ Left: ${leaveServers.size} other servers\n\n` +
            `**Have multiple legitimate servers?**\n` +
            `If you genuinely own ${this.maxServersPerOwner}+ different types of servers (gaming, community, business, etc.), ` +
            `join our support server to request a whitelist:\n` +
            `https://discord.gg/warmA4BsPP\n\n` +
            `Please provide:\n` +
            `• Server names and purposes\n` +
            `• Proof of ownership\n` +
            `• Why each server needs Nexus`
        );
      } catch (error) {
        logger.error(
          `[Owner Limiter] Failed to DM owner ${ownerId}:`,
          error.message
        );
      }

      // Leave the extra servers
      for (const server of leaveServers.values()) {
        try {
          logger.info(
            `[Owner Limiter] Leaving ${server.name} (${server.id})`
          );
          await server.leave();
        } catch (error) {
          logger.error(
            `[Owner Limiter] Failed to leave ${server.name}:`,
            error.message
          );
        }
      }

      // Log to database for review
      await this.logOwnerLimit(ownerId, ownerServers.size, keepServer, [
        ...leaveServers.values(),
      ]);

      return {
        allowed: false,
        reason: "over_limit",
        kept: keepServer.name,
        left: leaveServers.size,
      };
    } catch (error) {
      logger.error("[Owner Limiter] Error checking owner limit:", error);
      return { allowed: true, reason: "error" };
    }
  }

  /**
   * Add owner to whitelist
   * @param {string} ownerId - Discord user ID of the owner
   */
  addToWhitelist(ownerId) {
    this.whitelist.add(ownerId);
    logger.info(`[Owner Limiter] Added ${ownerId} to whitelist`);
    return true;
  }

  /**
   * Remove owner from whitelist
   * @param {string} ownerId - Discord user ID of the owner
   */
  removeFromWhitelist(ownerId) {
    const removed = this.whitelist.delete(ownerId);
    if (removed) {
      logger.info(`[Owner Limiter] Removed ${ownerId} from whitelist`);
    }
    return removed;
  }

  /**
   * Check if owner is whitelisted
   * @param {string} ownerId - Discord user ID of the owner
   */
  isWhitelisted(ownerId) {
    return this.whitelist.has(ownerId);
  }

  /**
   * Get all whitelisted owners
   */
  getWhitelist() {
    return Array.from(this.whitelist);
  }

  /**
   * Log owner limit event to database
   */
  async logOwnerLimit(ownerId, totalServers, keptServer, leftServers) {
    try {
      const logData = {
        owner_id: ownerId,
        total_servers: totalServers,
        kept_server_id: keptServer.id,
        kept_server_name: keptServer.name,
        left_servers: leftServers.map((s) => ({
          id: s.id,
          name: s.name,
        })),
        timestamp: Date.now(),
      };

      // Store in a simple text log file for review
      const fs = require("fs");
      const logFile = "./data/owner-limit-logs.json";

      let logs = [];
      if (fs.existsSync(logFile)) {
        logs = JSON.parse(fs.readFileSync(logFile, "utf8"));
      }

      logs.push(logData);
      fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));

      logger.info(
        `[Owner Limiter] Logged event for owner ${ownerId} to ${logFile}`
      );
    } catch (error) {
      logger.error("[Owner Limiter] Failed to log event:", error);
    }
  }

  /**
   * Get owner limit logs
   */
  async getOwnerLimitLogs(limit = 50) {
    try {
      const fs = require("fs");
      const logFile = "./data/owner-limit-logs.json";

      if (!fs.existsSync(logFile)) {
        return [];
      }

      const logs = JSON.parse(fs.readFileSync(logFile, "utf8"));
      return logs.slice(-limit); // Return last N logs
    } catch (error) {
      logger.error("[Owner Limiter] Failed to read logs:", error);
      return [];
    }
  }

  /**
   * Audit current servers for owner violations
   * Run this to check existing servers
   */
  async auditCurrentServers() {
    try {
      logger.info("[Owner Limiter] Starting audit of current servers...");

      const ownerCount = new Map();

      // Count servers per owner
      for (const guild of this.client.guilds.cache.values()) {
        const ownerId = guild.ownerId;
        if (!ownerCount.has(ownerId)) {
          ownerCount.set(ownerId, []);
        }
        ownerCount.get(ownerId).push(guild);
      }

      // Find owners over limit
      const violations = [];
      for (const [ownerId, guilds] of ownerCount.entries()) {
        if (
          guilds.length >= this.maxServersPerOwner &&
          !this.whitelist.has(ownerId)
        ) {
          violations.push({
            ownerId,
            serverCount: guilds.length,
            servers: guilds.map((g) => ({ id: g.id, name: g.name })),
          });
        }
      }

      logger.info(
        `[Owner Limiter] Audit complete. Found ${violations.length} violations`
      );

      return violations;
    } catch (error) {
      logger.error("[Owner Limiter] Audit failed:", error);
      return [];
    }
  }
}

module.exports = ServerOwnerLimiter;
