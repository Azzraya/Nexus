const logger = require("./logger");

class RedisCache {
  constructor() {
    this.client = null;
    this.enabled = false;
    this.fallbackCache = new Map(); // In-memory fallback if Redis unavailable
  }

  async connect() {
    try {
      // Only try to connect if REDIS_URL is provided
      if (!process.env.REDIS_URL) {
        logger.info(
          "[Redis] No REDIS_URL found, using in-memory cache fallback"
        );
        this.enabled = false;
        return;
      }

      const redis = require("redis");

      this.client = redis.createClient({
        url: process.env.REDIS_URL,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error("[Redis] Too many reconnection attempts, giving up");
              return new Error("Too many retries");
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });

      this.client.on("error", (err) => {
        logger.error("[Redis] Client error:", err.message);
        this.enabled = false;
      });

      this.client.on("connect", () => {
        logger.success("[Redis] Connected successfully");
        this.enabled = true;
      });

      this.client.on("reconnecting", () => {
        logger.warn("[Redis] Reconnecting...");
      });

      await this.client.connect();

      logger.success("[Redis] Cache system initialized");
    } catch (error) {
      logger.warn(
        "[Redis] Failed to connect, using in-memory fallback:",
        error.message
      );
      this.enabled = false;
    }
  }

  async get(key) {
    try {
      if (this.enabled && this.client) {
        const value = await this.client.get(key);
        return value ? JSON.parse(value) : null;
      } else {
        // Fallback to in-memory cache
        return this.fallbackCache.get(key) || null;
      }
    } catch (error) {
      logger.debug("[Redis] Get error, using fallback:", error.message);
      return this.fallbackCache.get(key) || null;
    }
  }

  async set(key, value, ttl = 3600) {
    try {
      const stringValue = JSON.stringify(value);

      if (this.enabled && this.client) {
        await this.client.setEx(key, ttl, stringValue);
      }

      // Always set in fallback cache too
      this.fallbackCache.set(key, value);

      // Clean up fallback cache after TTL
      setTimeout(() => {
        this.fallbackCache.delete(key);
      }, ttl * 1000);
    } catch (error) {
      logger.debug("[Redis] Set error, using fallback only:", error.message);
      this.fallbackCache.set(key, value);
    }
  }

  async del(key) {
    try {
      if (this.enabled && this.client) {
        await this.client.del(key);
      }
      this.fallbackCache.delete(key);
    } catch (error) {
      logger.debug("[Redis] Delete error:", error.message);
      this.fallbackCache.delete(key);
    }
  }

  async exists(key) {
    try {
      if (this.enabled && this.client) {
        return (await this.client.exists(key)) === 1;
      } else {
        return this.fallbackCache.has(key);
      }
    } catch (error) {
      return this.fallbackCache.has(key);
    }
  }

  async flush() {
    try {
      if (this.enabled && this.client) {
        await this.client.flushAll();
      }
      this.fallbackCache.clear();
      logger.info("[Redis] Cache flushed");
    } catch (error) {
      logger.error("[Redis] Flush error:", error);
      this.fallbackCache.clear();
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.disconnect();
        logger.info("[Redis] Disconnected");
      }
    } catch (error) {
      logger.error("[Redis] Disconnect error:", error);
    }
  }

  // Helper methods for common cache patterns
  async getCached(key, fetchFunction, ttl = 3600) {
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await fetchFunction();
    if (fresh !== null) {
      await this.set(key, fresh, ttl);
    }
    return fresh;
  }

  isEnabled() {
    return this.enabled;
  }
}

module.exports = new RedisCache();
