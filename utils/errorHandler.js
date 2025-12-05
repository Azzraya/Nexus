/**
 * Centralized Error Handler
 * Provides consistent error handling and reporting across the application
 */

const logger = require("./logger");
const { EmbedBuilder } = require("discord.js");

class ErrorHandler {
  constructor() {
    this.errorCounts = new Map();
    this.errorWebhook = null; // Set via setWebhook() for error notifications
  }

  /**
   * Set webhook for error notifications
   */
  setWebhook(webhook) {
    this.errorWebhook = webhook;
    logger.info("ErrorHandler", "Error notification webhook configured");
  }

  /**
   * Handle command errors
   */
  async handleCommandError(interaction, error, commandName) {
    logger.error("Command", `Error in /${commandName}`, {
      error: error.message,
      stack: error.stack,
      user: interaction.user?.tag,
      guild: interaction.guild?.name,
    });

    // Track error frequency
    this.trackError(`command:${commandName}`, error);

    // User-friendly error message
    const errorEmbed = new EmbedBuilder()
      .setColor("#FF0000")
      .setTitle("❌ Command Error")
      .setDescription(
        `An error occurred while executing **/${commandName}**.\n\nThis has been logged and will be fixed soon!`
      )
      .setFooter({ text: "If this persists, contact support" })
      .setTimestamp();

    // Add technical details in development
    if (process.env.NODE_ENV === "development") {
      errorEmbed.addFields({
        name: "Error Details",
        value: `\`\`\`${error.message}\`\`\``,
      });
    }

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    } catch (replyError) {
      logger.error("ErrorHandler", "Failed to send error message", replyError);
    }

    // Notify via webhook if critical
    if (this.isRateLimited(`command:${commandName}`)) {
      this.notifyError("Critical Command Error", {
        command: commandName,
        error: error.message,
        occurrences: this.getErrorCount(`command:${commandName}`),
      });
    }
  }

  /**
   * Handle API errors
   */
  handleAPIError(res, error, endpoint) {
    logger.error("API", `Error at ${endpoint}`, {
      error: error.message,
      stack: error.stack,
    });

    this.trackError(`api:${endpoint}`, error);

    // Determine status code
    let statusCode = 500;
    let userMessage = "Internal server error";

    if (error.message.includes("not found")) {
      statusCode = 404;
      userMessage = "Resource not found";
    } else if (error.message.includes("unauthorized")) {
      statusCode = 401;
      userMessage = "Unauthorized";
    } else if (error.message.includes("forbidden")) {
      statusCode = 403;
      userMessage = "Forbidden";
    } else if (error.message.includes("validation")) {
      statusCode = 400;
      userMessage = "Invalid request";
    }

    res.status(statusCode).json({
      error: userMessage,
      message:
        process.env.NODE_ENV === "development" ? error.message : undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle database errors
   */
  handleDatabaseError(error, operation, table = "unknown") {
    logger.error("Database", `Error during ${operation} on ${table}`, {
      error: error.message,
      stack: error.stack,
    });

    this.trackError(`db:${operation}:${table}`, error);

    // Check for common issues
    if (error.message.includes("SQLITE_BUSY")) {
      logger.warn(
        "Database",
        "Database is locked, consider increasing timeout"
      );
    } else if (error.message.includes("UNIQUE constraint")) {
      logger.warn("Database", "Duplicate entry attempted");
    } else if (error.message.includes("no such table")) {
      logger.error(
        "Database",
        `Table ${table} does not exist - run migrations!`
      );
    }

    return {
      success: false,
      error: "Database operation failed",
      technical: process.env.NODE_ENV === "development" ? error.message : null,
    };
  }

  /**
   * Handle uncaught exceptions
   */
  handleUncaughtException(error) {
    logger.error("System", "UNCAUGHT EXCEPTION", {
      error: error.message,
      stack: error.stack,
    });

    this.notifyError("🚨 CRITICAL: Uncaught Exception", {
      error: error.message,
      stack: error.stack,
    });

    // Give time for logging before exit
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  }

  /**
   * Handle unhandled promise rejections
   */
  handleUnhandledRejection(reason, promise) {
    logger.error("System", "UNHANDLED PROMISE REJECTION", {
      reason: reason?.message || reason,
      stack: reason?.stack,
    });

    this.notifyError("⚠️ Unhandled Promise Rejection", {
      reason: reason?.message || String(reason),
      stack: reason?.stack,
    });
  }

  /**
   * Track error occurrences
   */
  trackError(key, error) {
    if (!this.errorCounts.has(key)) {
      this.errorCounts.set(key, {
        count: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        message: error.message,
      });
    }

    const data = this.errorCounts.get(key);
    data.count++;
    data.lastSeen = Date.now();
  }

  /**
   * Check if error is happening too frequently
   */
  isRateLimited(key) {
    const data = this.errorCounts.get(key);
    if (!data) return false;

    // If same error 10+ times in 5 minutes, it's critical
    const fiveMinutes = 5 * 60 * 1000;
    if (data.count >= 10 && Date.now() - data.firstSeen < fiveMinutes) {
      return true;
    }

    return false;
  }

  /**
   * Get error count
   */
  getErrorCount(key) {
    return this.errorCounts.get(key)?.count || 0;
  }

  /**
   * Send error notification via webhook
   */
  async notifyError(title, details) {
    if (!this.errorWebhook) return;

    try {
      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle(title)
        .setDescription(`\`\`\`\n${JSON.stringify(details, null, 2)}\n\`\`\``)
        .setTimestamp();

      await this.errorWebhook.send({ embeds: [embed] });
    } catch (error) {
      logger.error("ErrorHandler", "Failed to send error notification", error);
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    const stats = {
      totalErrors: 0,
      errorsByType: {},
      criticalErrors: [],
    };

    for (const [key, data] of this.errorCounts.entries()) {
      stats.totalErrors += data.count;

      const type = key.split(":")[0];
      if (!stats.errorsByType[type]) {
        stats.errorsByType[type] = 0;
      }
      stats.errorsByType[type] += data.count;

      // Track critical errors
      if (this.isRateLimited(key)) {
        stats.criticalErrors.push({
          key,
          count: data.count,
          message: data.message,
        });
      }
    }

    return stats;
  }

  /**
   * Clear error tracking (for testing or reset)
   */
  clearErrors() {
    this.errorCounts.clear();
    logger.info("ErrorHandler", "Error tracking cleared");
  }

  /**
   * Wrap async function with error handling
   */
  wrapAsync(fn) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        logger.error("AsyncWrapper", "Caught error in wrapped function", error);
        throw error;
      }
    };
  }

  /**
   * Create a safe error catcher for promise chains
   * Returns a function that logs errors without throwing
   * Usage: promise.catch(ErrorHandler.createSafeCatch(context, action))
   */
  createSafeCatch(context, action) {
    return (error) => {
      logger.error(context, `Failed to ${action}`, {
        error: error.message,
        stack: error.stack,
      });
      this.trackError(`safeCatch:${context}`, error);
    };
  }

  /**
   * Safely execute an async function with error handling
   * @param {Function} fn - Async function to execute
   * @param {string} context - Context for error logging
   * @param {any} fallbackValue - Value to return on error
   */
  async safeExecute(fn, context = "Unknown", fallbackValue = null) {
    try {
      return await fn();
    } catch (error) {
      logger.error(context, "SafeExecute error", {
        error: error.message,
        stack: error.stack,
      });
      this.trackError(`safeExecute:${context}`, error);
      return fallbackValue;
    }
  }
}

// Export singleton
module.exports = new ErrorHandler();
