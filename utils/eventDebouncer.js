const logger = require("./logger");

/**
 * Event Debouncing System
 * Prevents spam from rapid-fire events like channelUpdate
 */
class EventDebouncer {
  constructor() {
    this.pending = new Map(); // eventKey -> timeout
    this.callbacks = new Map(); // eventKey -> callback
    this.defaultDelay = 1000; // 1 second default
  }

  /**
   * Debounce an event
   * @param {string} key - Unique key for this event (e.g., "channelUpdate_123456")
   * @param {function} callback - Function to execute
   * @param {number} delay - Debounce delay in ms
   */
  debounce(key, callback, delay = this.defaultDelay) {
    // Clear existing timeout
    if (this.pending.has(key)) {
      clearTimeout(this.pending.get(key));
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      callback();
      this.pending.delete(key);
      this.callbacks.delete(key);
    }, delay);

    this.pending.set(key, timeout);
    this.callbacks.set(key, callback);
  }

  /**
   * Flush a specific debounced event immediately
   */
  flush(key) {
    if (this.pending.has(key)) {
      clearTimeout(this.pending.get(key));
      const callback = this.callbacks.get(key);
      if (callback) {
        callback();
      }
      this.pending.delete(key);
      this.callbacks.delete(key);
    }
  }

  /**
   * Flush all pending events
   */
  flushAll() {
    for (const [key, timeout] of this.pending.entries()) {
      clearTimeout(timeout);
      const callback = this.callbacks.get(key);
      if (callback) {
        callback();
      }
    }
    this.pending.clear();
    this.callbacks.clear();
  }

  /**
   * Cancel a debounced event
   */
  cancel(key) {
    if (this.pending.has(key)) {
      clearTimeout(this.pending.get(key));
      this.pending.delete(key);
      this.callbacks.delete(key);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      pendingEvents: this.pending.size,
      queuedCallbacks: this.callbacks.size,
    };
  }

  /**
   * Rate limiter for events (max N per time window)
   */
  createRateLimiter(maxCalls, windowMs) {
    const calls = new Map(); // key -> [timestamps]

    return (key, callback) => {
      const now = Date.now();

      if (!calls.has(key)) {
        calls.set(key, []);
      }

      const timestamps = calls.get(key);

      // Remove old timestamps outside window
      const validTimestamps = timestamps.filter((t) => now - t < windowMs);

      if (validTimestamps.length >= maxCalls) {
        // Rate limit exceeded
        logger.debug("EventDebouncer", `Rate limit exceeded for ${key}`);
        return false;
      }

      // Add this call
      validTimestamps.push(now);
      calls.set(key, validTimestamps);

      // Execute callback
      callback();
      return true;
    };
  }
}

module.exports = new EventDebouncer();
