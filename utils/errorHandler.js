/**
 * Utility functions for consistent error handling
 */
const logger = require("./logger");

class ErrorHandler {
  /**
   * Logs an error but doesn't throw - useful for non-critical operations
   * @param {Error|string} error - The error to log
   * @param {string} context - Context about where the error occurred
   * @param {string} operation - The operation that failed
   */
  static logError(error, context = "Unknown", operation = "Operation") {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error(`${context}: ${operation} failed`, {
      error: errorMessage,
      stack: errorStack,
      context,
      operation,
    });

    // Also log to console in development
    if (process.env.NODE_ENV !== "production") {
      console.error(`[${context}] ${operation} failed:`, error);
    }
  }

  /**
   * Wraps a promise to log errors without throwing
   * Useful for non-critical operations where failure shouldn't break the flow
   * @param {Promise} promise - The promise to wrap
   * @param {string} context - Context about where the error occurred
   * @param {string} operation - The operation name
   * @returns {Promise} - Resolves to undefined if error occurs
   */
  static async safeExecute(
    promise,
    context = "Unknown",
    operation = "Operation"
  ) {
    try {
      return await promise;
    } catch (error) {
      this.logError(error, context, operation);
      return undefined;
    }
  }

  /**
   * Creates a safe catch handler for promise chains
   * @param {string} context - Context about where the error occurred
   * @param {string} operation - The operation name
   * @returns {Function} - A function that can be used in .catch()
   */
  static createSafeCatch(context = "Unknown", operation = "Operation") {
    return (error) => {
      this.logError(error, context, operation);
    };
  }
}

module.exports = ErrorHandler;
