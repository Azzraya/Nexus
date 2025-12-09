/**
 * Advanced Rate Limiter
 * Redis-backed distributed rate limiting
 * EXCEEDS WICK - Multi-layer, adaptive rate limiting
 */

const logger = require("./logger");

class AdvancedRateLimiter {
  constructor() {
    this.redis = null;
    this.fallbackStore = new Map(); // In-memory fallback
    this.useRedis = false;

    // Rate limit configurations
    this.limits = {
      // API endpoints
      api_default: { points: 60, duration: 60 }, // 60 requests per minute
      api_strict: { points: 10, duration: 60 }, // 10 requests per minute
      api_admin: { points: 120, duration: 60 }, // 120 requests per minute

      // Commands (per user per guild)
      command_default: { points: 5, duration: 10 }, // 5 commands per 10 seconds
      command_heavy: { points: 2, duration: 30 }, // 2 heavy commands per 30 seconds

      // Dashboard login attempts
      login: { points: 5, duration: 300 }, // 5 attempts per 5 minutes

      // Webhook calls
      webhook: { points: 10, duration: 60 }, // 10 webhooks per minute
    };
  }

  async init() {
    try {
      // Try to use Redis if available
      const redisCache = require("./redisCache");
      if (redisCache.enabled) {
        this.redis = redisCache;
        this.useRedis = true;
        logger.success(
          "RateLimiter",
          "Using Redis-backed distributed rate limiting"
        );
      } else {
        logger.info("RateLimiter", "Using in-memory rate limiting");
      }
    } catch (error) {
      logger.warn(
        "RateLimiter",
        `Redis unavailable, using in-memory: ${error.message}`
      );
    }
  }

  /**
   * Check if action is rate limited
   * @param {string} key - Unique identifier (userId, IP, etc.)
   * @param {string} type - Rate limit type
   * @returns {Promise<{allowed: boolean, remaining: number, reset: number}>}
   */
  async checkLimit(key, type = "api_default") {
    const limit = this.limits[type] || this.limits.api_default;
    const limitKey = `ratelimit:${type}:${key}`;

    if (this.useRedis) {
      return this.checkRedisLimit(limitKey, limit);
    } else {
      return this.checkMemoryLimit(limitKey, limit);
    }
  }

  async checkRedisLimit(key, limit) {
    try {
      const now = Date.now();
      const windowStart = now - limit.duration * 1000;

      // Use Redis sorted set for sliding window
      const client = this.redis.client;

      // Add current request
      await client.zAdd(key, {
        score: now,
        value: `${now}`,
      });

      // Remove old requests outside window
      await client.zRemRangeByScore(key, 0, windowStart);

      // Count requests in window
      const count = await client.zCard(key);

      // Set expiry on key
      await client.expire(key, limit.duration);

      const allowed = count <= limit.points;
      const remaining = Math.max(0, limit.points - count);
      const reset = Math.ceil((now + limit.duration * 1000) / 1000);

      return { allowed, remaining, reset, count };
    } catch (error) {
      logger.error(
        "RateLimiter",
        `Redis check failed, allowing: ${error.message}`
      );
      // Fail open - allow request if Redis fails
      return { allowed: true, remaining: 999, reset: 0, count: 0 };
    }
  }

  checkMemoryLimit(key, limit) {
    const now = Date.now();
    const windowStart = now - limit.duration * 1000;

    // Get or create bucket
    if (!this.fallbackStore.has(key)) {
      this.fallbackStore.set(key, []);
    }

    const bucket = this.fallbackStore.get(key);

    // Add current request
    bucket.push(now);

    // Remove old requests
    const filtered = bucket.filter((timestamp) => timestamp > windowStart);
    this.fallbackStore.set(key, filtered);

    const count = filtered.length;
    const allowed = count <= limit.points;
    const remaining = Math.max(0, limit.points - count);
    const reset = Math.ceil((now + limit.duration * 1000) / 1000);

    // Cleanup old keys periodically
    if (Math.random() < 0.01) {
      // 1% chance
      this.cleanupMemoryStore();
    }

    return { allowed, remaining, reset, count };
  }

  cleanupMemoryStore() {
    const now = Date.now();
    const maxAge = 600000; // 10 minutes

    for (const [key, bucket] of this.fallbackStore.entries()) {
      if (bucket.length === 0 || bucket[bucket.length - 1] < now - maxAge) {
        this.fallbackStore.delete(key);
      }
    }
  }

  /**
   * Express middleware for API rate limiting
   */
  apiMiddleware(type = "api_default") {
    return async (req, res, next) => {
      try {
        // Get identifier (prefer user ID, fallback to IP)
        const identifier =
          req.user?.id || req.ip || req.connection?.remoteAddress || "unknown";

        const result = await this.checkLimit(identifier, type);

        // Set rate limit headers
        res.setHeader("X-RateLimit-Limit", this.limits[type].points);
        res.setHeader("X-RateLimit-Remaining", result.remaining);
        res.setHeader("X-RateLimit-Reset", result.reset);

        if (!result.allowed) {
          const retryAfter = result.reset - Math.floor(Date.now() / 1000);
          res.setHeader("Retry-After", retryAfter);

          logger.warn(
            "RateLimiter",
            `Rate limit exceeded for ${identifier} on ${req.path}`
          );

          // Record metric
          const metrics = require("./metricsCollector");
          metrics.recordRateLimitHit();

          return res.status(429).json({
            error: "Too many requests",
            message: "Rate limit exceeded. Please try again later.",
            retryAfter,
          });
        }

        next();
      } catch (error) {
        logger.error("RateLimiter", `Middleware error: ${error.message}`);
        // Fail open
        next();
      }
    };
  }

  /**
   * Command rate limiting
   */
  async checkCommandLimit(userId, guildId, commandName, isHeavy = false) {
    const key = `${userId}:${guildId}:${commandName}`;
    const type = isHeavy ? "command_heavy" : "command_default";
    return this.checkLimit(key, type);
  }

  /**
   * Adaptive rate limiting based on server size
   */
  async checkAdaptiveLimit(userId, guildId, memberCount) {
    // Larger servers get more lenient rate limits
    let multiplier = 1;
    if (memberCount > 10000) multiplier = 2;
    else if (memberCount > 5000) multiplier = 1.5;
    else if (memberCount > 1000) multiplier = 1.25;

    const limit = {
      points: Math.floor(this.limits.command_default.points * multiplier),
      duration: this.limits.command_default.duration,
    };

    const key = `${userId}:${guildId}`;
    const limitKey = `ratelimit:adaptive:${key}`;

    if (this.useRedis) {
      return this.checkRedisLimit(limitKey, limit);
    } else {
      return this.checkMemoryLimit(limitKey, limit);
    }
  }

  /**
   * Whitelist a user/guild from rate limits
   */
  async addWhitelist(identifier, type, duration = 86400) {
    const key = `ratelimit:whitelist:${type}:${identifier}`;

    if (this.useRedis) {
      await this.redis.set(key, true, duration);
    } else {
      // Memory whitelist (expires after duration)
      this.fallbackStore.set(key, {
        whitelisted: true,
        expires: Date.now() + duration * 1000,
      });
    }

    logger.info(
      "RateLimiter",
      `Whitelisted ${identifier} for ${type} (${duration}s)`
    );
  }

  async isWhitelisted(identifier, type) {
    const key = `ratelimit:whitelist:${type}:${identifier}`;

    if (this.useRedis) {
      const result = await this.redis.get(key);
      return !!result;
    } else {
      const entry = this.fallbackStore.get(key);
      if (entry && entry.expires > Date.now()) {
        return true;
      }
      return false;
    }
  }

  /**
   * Get rate limit stats
   */
  async getStats() {
    if (this.useRedis) {
      return {
        type: "redis",
        backend: "distributed",
        limits: Object.keys(this.limits).length,
      };
    } else {
      return {
        type: "memory",
        backend: "in-memory",
        limits: Object.keys(this.limits).length,
        active_keys: this.fallbackStore.size,
      };
    }
  }
}

// Singleton instance
const advancedRateLimiter = new AdvancedRateLimiter();

module.exports = advancedRateLimiter;
