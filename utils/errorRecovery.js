const logger = require("./logger");
const { WebhookClient, EmbedBuilder } = require("discord.js");

/**
 * Advanced Error Recovery System
 * Handles errors gracefully and prevents bot crashes
 */
class ErrorRecovery {
  constructor() {
    this.errorCount = new Map(); // Track errors per hour
    this.criticalErrors = [];
    this.recoveryAttempts = new Map();
    this.maxRecoveryAttempts = 3;
    this.errorThreshold = 50; // Max errors per hour before alerting
    this.client = null;
    this.webhookClient = null;

    // Initialize error webhook if URL provided
    if (process.env.ERROR_WEBHOOK_URL) {
      try {
        this.webhookClient = new WebhookClient({
          url: process.env.ERROR_WEBHOOK_URL,
        });
      } catch (error) {
        logger.warn(
          "ErrorRecovery",
          "Failed to initialize error webhook:",
          error.message
        );
      }
    }

    // Clean up old error counts every hour
    setInterval(() => this.cleanupErrorCounts(), 3600000);
  }

  setClient(client) {
    this.client = client;
  }

  /**
   * Handle an error with graceful recovery
   */
  async handleError(error, context = {}) {
    const errorKey = `${error.name || "Error"}_${Date.now()}`;
    const timestamp = Date.now();

    // Track error frequency
    const hour = Math.floor(timestamp / 3600000);
    const hourKey = `${hour}`;
    const count = this.errorCount.get(hourKey) || 0;
    this.errorCount.set(hourKey, count + 1);

    // Log error with context
    logger.error("ErrorRecovery", `Error occurred: ${error.message}`, {
      error: error.stack,
      context,
      errorCount: count + 1,
    });

    // Check if error is critical
    const isCritical = this.isCriticalError(error);

    if (isCritical) {
      this.criticalErrors.push({
        error: error.message,
        stack: error.stack,
        context,
        timestamp,
      });

      // Keep only last 100 critical errors
      if (this.criticalErrors.length > 100) {
        this.criticalErrors.shift();
      }

      // Alert owner
      await this.alertOwner(error, context);
    }

    // Check if we're getting too many errors
    if (count + 1 >= this.errorThreshold) {
      logger.error(
        "ErrorRecovery",
        `⚠️ HIGH ERROR RATE: ${count + 1} errors in the last hour!`
      );
      await this.alertOwner(
        new Error(`High error rate: ${count + 1} errors/hour`),
        { errorRate: count + 1 }
      );
    }

    // Attempt recovery if applicable
    if (context.recoverable !== false) {
      await this.attemptRecovery(error, context);
    }

    return {
      handled: true,
      critical: isCritical,
      errorCount: count + 1,
    };
  }

  /**
   * Determine if an error is critical
   */
  isCriticalError(error) {
    const criticalPatterns = [
      /ECONNREFUSED/i, // Database connection
      /ENOTFOUND/i, // DNS/Network issues
      /Maximum call stack/i, // Stack overflow
      /Out of memory/i, // Memory issues
      /SQLITE_CANTOPEN/i, // Database file issues
      /Discord API/i, // Discord API critical errors
      /Rate limit/i, // Rate limit issues
    ];

    return criticalPatterns.some((pattern) =>
      pattern.test(error.message || error.toString())
    );
  }

  /**
   * Attempt to recover from an error
   */
  async attemptRecovery(error, context) {
    const errorType = error.name || "Error";
    const attempts = this.recoveryAttempts.get(errorType) || 0;

    if (attempts >= this.maxRecoveryAttempts) {
      logger.error(
        "ErrorRecovery",
        `Max recovery attempts reached for ${errorType}`
      );
      return false;
    }

    this.recoveryAttempts.set(errorType, attempts + 1);

    // Attempt recovery based on error type
    if (error.message?.includes("SQLITE")) {
      logger.info("ErrorRecovery", "Attempting database reconnection...");
      // Database will auto-reconnect on next query
      return true;
    }

    if (error.message?.includes("Discord API")) {
      logger.info(
        "ErrorRecovery",
        "Waiting for Discord API rate limit to reset..."
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return true;
    }

    if (error.message?.includes("ECONNREFUSED")) {
      logger.info("ErrorRecovery", "Connection refused, retrying in 10s...");
      await new Promise((resolve) => setTimeout(resolve, 10000));
      return true;
    }

    return false;
  }

  /**
   * Alert bot owner about critical errors
   */
  async alertOwner(error, context = {}) {
    try {
      // Send to webhook if configured
      if (this.webhookClient) {
        const embed = new EmbedBuilder()
          .setTitle("🚨 Critical Error Alert")
          .setDescription(`\`\`\`${error.message}\`\`\``)
          .addFields(
            {
              name: "Error Type",
              value: error.name || "Unknown",
              inline: true,
            },
            {
              name: "Timestamp",
              value: new Date().toISOString(),
              inline: true,
            }
          )
          .setColor(0xff0000)
          .setTimestamp();

        if (context.guild) {
          embed.addFields({
            name: "Guild",
            value: `${context.guild.name} (${context.guild.id})`,
          });
        }

        if (error.stack) {
          const stackPreview = error.stack.substring(0, 1000);
          embed.addFields({
            name: "Stack Trace",
            value: `\`\`\`${stackPreview}\`\`\``,
          });
        }

        await this.webhookClient.send({ embeds: [embed] });
      }

      // DM bot owner if client is available
      if (this.client && process.env.OWNER_ID) {
        const owner = await this.client.users
          .fetch(process.env.OWNER_ID)
          .catch(() => null);
        if (owner) {
          const embed = new EmbedBuilder()
            .setTitle("🚨 Critical Error")
            .setDescription(`\`\`\`${error.message.substring(0, 500)}\`\`\``)
            .addFields({
              name: "Context",
              value: JSON.stringify(context, null, 2).substring(0, 500),
            })
            .setColor(0xff0000)
            .setTimestamp();

          await owner.send({ embeds: [embed] }).catch(() => {
            logger.warn("ErrorRecovery", "Failed to DM owner about error");
          });
        }
      }
    } catch (alertError) {
      logger.error(
        "ErrorRecovery",
        "Failed to alert owner:",
        alertError.message
      );
    }
  }

  /**
   * Get error statistics
   */
  getStats() {
    const totalErrors = Array.from(this.errorCount.values()).reduce(
      (sum, count) => sum + count,
      0
    );

    return {
      totalErrors,
      criticalErrors: this.criticalErrors.length,
      recentCritical: this.criticalErrors.slice(-10),
      recoveryAttempts: Object.fromEntries(this.recoveryAttempts),
      errorsByHour: Object.fromEntries(this.errorCount),
    };
  }

  /**
   * Clean up old error counts
   */
  cleanupErrorCounts() {
    const currentHour = Math.floor(Date.now() / 3600000);
    for (const [hour] of this.errorCount.entries()) {
      if (parseInt(hour) < currentHour - 24) {
        // Keep last 24 hours
        this.errorCount.delete(hour);
      }
    }

    // Reset recovery attempts every hour
    this.recoveryAttempts.clear();

    logger.debug("ErrorRecovery", "Cleaned up old error tracking data");
  }

  /**
   * Reset error tracking (for testing or after maintenance)
   */
  reset() {
    this.errorCount.clear();
    this.criticalErrors = [];
    this.recoveryAttempts.clear();
    logger.info("ErrorRecovery", "Error tracking reset");
  }
}

module.exports = new ErrorRecovery();
