/**
 * Centralized Cache Manager
 * Provides intelligent caching with automatic expiration and memory management
 */

const logger = require('./logger');

class CacheManager {
  constructor() {
    this.caches = new Map();
    this.maxCacheSize = 1000; // Maximum items per cache
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes default
    
    // Cleanup interval every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Create or get a named cache
   */
  getCache(name) {
    if (!this.caches.has(name)) {
      this.caches.set(name, new Map());
    }
    return this.caches.get(name);
  }

  /**
   * Set cache value
   */
  set(cacheName, key, value, ttl = null) {
    const cache = this.getCache(cacheName);
    
    // Check size limit
    if (cache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
      logger.debug('Cache', `Max size reached for ${cacheName}, removed oldest entry`);
    }

    cache.set(key, {
      value,
      expires: Date.now() + (ttl || this.defaultTTL),
      hits: 0
    });
  }

  /**
   * Get cache value
   */
  get(cacheName, key) {
    const cache = this.getCache(cacheName);
    const entry = cache.get(key);

    if (!entry) {
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expires) {
      cache.delete(key);
      return null;
    }

    // Increment hit counter
    entry.hits++;
    return entry.value;
  }

  /**
   * Get or set (lazy loading pattern)
   */
  async getOrSet(cacheName, key, fetchFn, ttl = null) {
    const cached = this.get(cacheName, key);
    if (cached !== null) {
      return cached;
    }

    // Fetch and cache
    const value = await fetchFn();
    this.set(cacheName, key, value, ttl);
    return value;
  }

  /**
   * Delete cache entry
   */
  delete(cacheName, key) {
    const cache = this.getCache(cacheName);
    return cache.delete(key);
  }

  /**
   * Clear entire cache or specific pattern
   */
  clear(cacheName, pattern = null) {
    const cache = this.getCache(cacheName);

    if (!pattern) {
      cache.clear();
      logger.info('Cache', `Cleared all entries in ${cacheName}`);
      return;
    }

    // Clear matching keys
    for (const key of cache.keys()) {
      if (key.includes(pattern)) {
        cache.delete(key);
      }
    }
    logger.info('Cache', `Cleared ${cacheName} entries matching: ${pattern}`);
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    let totalCleaned = 0;
    const now = Date.now();

    for (const [cacheName, cache] of this.caches.entries()) {
      let cleaned = 0;
      for (const [key, entry] of cache.entries()) {
        if (now > entry.expires) {
          cache.delete(key);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        totalCleaned += cleaned;
        logger.debug('Cache', `Cleaned ${cleaned} expired entries from ${cacheName}`);
      }
    }

    if (totalCleaned > 0) {
      logger.debug('Cache', `Total cleaned: ${totalCleaned} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const stats = {};
    
    for (const [name, cache] of this.caches.entries()) {
      let totalHits = 0;
      let activeEntries = 0;
      const now = Date.now();

      for (const [, entry] of cache.entries()) {
        if (now <= entry.expires) {
          activeEntries++;
          totalHits += entry.hits;
        }
      }

      stats[name] = {
        size: cache.size,
        activeEntries,
        totalHits,
        avgHits: activeEntries > 0 ? (totalHits / activeEntries).toFixed(2) : 0
      };
    }

    return stats;
  }

  /**
   * Warm up cache with preloaded data
   */
  warmUp(cacheName, dataMap, ttl = null) {
    for (const [key, value] of dataMap.entries()) {
      this.set(cacheName, key, value, ttl);
    }
    logger.info('Cache', `Warmed up ${cacheName} with ${dataMap.size} entries`);
  }
}

// Export singleton
module.exports = new CacheManager();

