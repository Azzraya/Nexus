// Rate limiter for Discord API calls
class RateLimiter {
  constructor() {
    this.queues = new Map(); // Per-endpoint queues
    this.retryAfter = new Map(); // Track retry-after times
  }

  async execute(endpoint, fn) {
    // Check if we're rate limited for this endpoint
    const retryAfter = this.retryAfter.get(endpoint);
    if (retryAfter && Date.now() < retryAfter) {
      const waitTime = retryAfter - Date.now();
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    try {
      const result = await fn();
      // Clear retry-after on success
      this.retryAfter.delete(endpoint);
      return result;
    } catch (error) {
      // Handle rate limit errors
      if (error.status === 429 || error.code === 429) {
        const retryAfter = error.retryAfter ? error.retryAfter * 1000 : 5000; // Default 5 seconds
        this.retryAfter.set(endpoint, Date.now() + retryAfter);

        // Wait and retry once
        await new Promise((resolve) => setTimeout(resolve, retryAfter));
        return await fn();
      }
      throw error;
    }
  }
}

module.exports = new RateLimiter();
