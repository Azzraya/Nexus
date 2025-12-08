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

  // ========== ADVANCED CACHING FEATURES ==========

  /**
   * Bulk get multiple keys at once
   */
  async mget(keys) {
    if (!this.enabled || !this.client) {
      return keys.map((k) => this.fallbackCache.get(k) || null);
    }

    try {
      return await this.client.mGet(keys);
    } catch (error) {
      logger.debug("[Redis] MGET error, using fallback:", error.message);
      return keys.map((k) => this.fallbackCache.get(k) || null);
    }
  }

  /**
   * Bulk set multiple key-value pairs
   */
  async mset(keyValuePairs, ttl = 3600) {
    if (!this.enabled || !this.client) {
      Object.entries(keyValuePairs).forEach(([k, v]) => {
        this.fallbackCache.set(k, v);
      });
      return true;
    }

    try {
      const multi = this.client.multi();
      Object.entries(keyValuePairs).forEach(([key, value]) => {
        multi.set(key, JSON.stringify(value), { EX: ttl });
      });
      await multi.exec();
      return true;
    } catch (error) {
      logger.debug("[Redis] MSET error:", error.message);
      return false;
    }
  }

  /**
   * Increment a numeric value
   */
  async incr(key, amount = 1) {
    if (!this.enabled || !this.client) {
      const current = parseInt(this.fallbackCache.get(key)) || 0;
      const newValue = current + amount;
      this.fallbackCache.set(key, newValue);
      return newValue;
    }

    try {
      return await this.client.incrBy(key, amount);
    } catch (error) {
      logger.debug("[Redis] INCR error:", error.message);
      return null;
    }
  }

  /**
   * Get keys matching a pattern
   */
  async keys(pattern) {
    if (!this.enabled || !this.client) {
      const keys = [];
      for (const key of this.fallbackCache.keys()) {
        if (key.includes(pattern.replace("*", ""))) {
          keys.push(key);
        }
      }
      return keys;
    }

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.debug("[Redis] KEYS error:", error.message);
      return [];
    }
  }

  /**
   * Delete keys matching a pattern
   */
  async deletePattern(pattern) {
    const keys = await this.keys(pattern);
    if (keys.length === 0) return 0;

    if (!this.enabled || !this.client) {
      keys.forEach((k) => this.fallbackCache.delete(k));
      return keys.length;
    }

    try {
      await this.client.del(keys);
      return keys.length;
    } catch (error) {
      logger.debug("[Redis] DELETE PATTERN error:", error.message);
      return 0;
    }
  }

  /**
   * Cache with automatic refresh
   */
  async cacheWithRefresh(
    key,
    fetchFunction,
    ttl = 3600,
    refreshInterval = 1800
  ) {
    const value = await this.getCached(key, fetchFunction, ttl);

    // Set up background refresh (refresh at 50% of TTL)
    setTimeout(async () => {
      try {
        const fresh = await fetchFunction();
        await this.set(key, fresh, ttl);
      } catch (error) {
        logger.debug("[Redis] Background refresh failed:", error.message);
      }
    }, refreshInterval * 1000);

    return value;
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    const stats = {
      enabled: this.enabled,
      fallbackSize: this.fallbackCache.size,
    };

    if (this.enabled && this.client) {
      try {
        const info = await this.client.info();
        stats.redisInfo = {
          connected: true,
          keysTotal: await this.client.dbSize(),
        };
      } catch (error) {
        stats.redisInfo = { connected: false, error: error.message };
      }
    }

    return stats;
  }
}

module.exports = new RedisCache();
