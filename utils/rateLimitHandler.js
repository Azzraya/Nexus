const logger = require("./logger");

/**
 * Discord API Rate Limit Handler
 * Prevents rate limit errors and handles them gracefully
 */
class RateLimitHandler {
  constructor() {
    this.rateLimits = new Map(); // Track rate limits per endpoint
    this.globalRateLimit = false;
    this.globalResetTime = null;
    this.requestQueue = new Map(); // Queue requests when rate limited
    this.stats = {
      totalRequests: 0,
      rateLimitHits: 0,
      globalRateLimits: 0,
      queuedRequests: 0,
    };
  }

  /**
   * Initialize rate limit tracking for Discord client
   */
  initialize(client) {
    // Listen for rate limit events
    client.rest.on("rateLimited", (info) => {
      this.handleRateLimit(info);
    });

    // Track global rate limits
    client.on("rateLimit", (info) => {
      this.handleRateLimit(info);
    });

    logger.success(
      "RateLimitHandler",
      "Initialized Discord API rate limit tracking"
    );
  }

  /**
   * Handle rate limit event
   */
  handleRateLimit(info) {
    this.stats.rateLimitHits++;

    if (info.global) {
      this.stats.globalRateLimits++;
      this.globalRateLimit = true;
      this.globalResetTime = Date.now() + info.timeout;

      logger.warn(
        "RateLimitHandler",
        `⚠️ Global rate limit hit! Waiting ${info.timeout}ms`
      );

      // Clear global rate limit after timeout
      setTimeout(() => {
        this.globalRateLimit = false;
        this.globalResetTime = null;
        logger.info("RateLimitHandler", "Global rate limit cleared");
      }, info.timeout);
    } else {
      // Track endpoint-specific rate limits
      const endpoint = info.route || info.method || "unknown";
      this.rateLimits.set(endpoint, {
        limit: info.limit,
        remaining: 0,
        reset: Date.now() + info.timeout,
      });

      logger.warn(
        "RateLimitHandler",
        `Rate limit hit on endpoint: ${endpoint} (${info.timeout}ms)`
      );

      // Clear endpoint rate limit after timeout
      setTimeout(() => {
        this.rateLimits.delete(endpoint);
      }, info.timeout);
    }
  }

  /**
   * Check if we're currently rate limited
   */
  isRateLimited(endpoint = null) {
    // Check global rate limit
    if (this.globalRateLimit) {
      return {
        limited: true,
        global: true,
        resetIn: this.globalResetTime - Date.now(),
      };
    }

    // Check endpoint-specific rate limit
    if (endpoint && this.rateLimits.has(endpoint)) {
      const limit = this.rateLimits.get(endpoint);
      if (limit.remaining === 0 && Date.now() < limit.reset) {
        return {
          limited: true,
          global: false,
          resetIn: limit.reset - Date.now(),
        };
      }
    }

    return { limited: false };
  }

  /**
   * Execute a request with rate limit protection
   */
  async executeWithProtection(fn, options = {}) {
    const { endpoint = "unknown", retries = 3, retryDelay = 1000 } = options;

    this.stats.totalRequests++;

    // Check if rate limited
    const rateLimitCheck = this.isRateLimited(endpoint);
    if (rateLimitCheck.limited) {
      logger.warn(
        "RateLimitHandler",
        `Request blocked - rate limited for ${rateLimitCheck.resetIn}ms`
      );

      // Queue the request
      this.stats.queuedRequests++;
      await new Promise((resolve) =>
        setTimeout(resolve, rateLimitCheck.resetIn + 100)
      );
    }

    // Execute with retries
    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // If rate limited, wait and retry
        if (error.code === 429 || error.message?.includes("rate limit")) {
          const retryAfter = error.retryAfter || retryDelay * (attempt + 1);
          logger.warn(
            "RateLimitHandler",
            `Rate limit error, retrying in ${retryAfter}ms (attempt ${attempt + 1}/${retries})`
          );

          this.stats.rateLimitHits++;
          await new Promise((resolve) => setTimeout(resolve, retryAfter));
        } else {
          // Non-rate-limit error, throw immediately
          throw error;
        }
      }
    }

    // All retries failed
    throw lastError;
  }

  /**
   * Get rate limit statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentlyRateLimited: this.globalRateLimit,
      activeRateLimits: this.rateLimits.size,
      rateLimitHitRate:
        this.stats.totalRequests > 0
          ? (
              (this.stats.rateLimitHits / this.stats.totalRequests) *
              100
            ).toFixed(2) + "%"
          : "0%",
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      rateLimitHits: 0,
      globalRateLimits: 0,
      queuedRequests: 0,
    };
    logger.info("RateLimitHandler", "Statistics reset");
  }
}

module.exports = new RateLimitHandler();
