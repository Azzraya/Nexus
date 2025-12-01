// Simple in-memory cache for frequently accessed data
class Cache {
  constructor() {
    this.data = new Map();
    this.ttl = new Map(); // Time-to-live
  }

  set(key, value, ttl = 60000) {
    // Default 1 minute TTL
    this.data.set(key, value);
    this.ttl.set(key, Date.now() + ttl);
  }

  get(key) {
    const expiry = this.ttl.get(key);
    if (expiry && Date.now() > expiry) {
      this.data.delete(key);
      this.ttl.delete(key);
      return null;
    }
    return this.data.get(key);
  }

  delete(key) {
    this.data.delete(key);
    this.ttl.delete(key);
  }

  clear() {
    this.data.clear();
    this.ttl.clear();
  }

  // Clean up expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, expiry] of this.ttl.entries()) {
      if (now > expiry) {
        this.data.delete(key);
        this.ttl.delete(key);
      }
    }
  }
}

// Run cleanup every 5 minutes
const cache = new Cache();
setInterval(() => cache.cleanup(), 5 * 60 * 1000);

module.exports = cache;
