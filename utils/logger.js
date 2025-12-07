/**
 * Centralized Logger for Nexus Bot
 * Provides consistent logging across the entire application
 * with timestamps, colors, and log levels
 */

const chalk = require("chalk");

class Logger {
  constructor() {
    this.levels = {
      ERROR: { color: chalk.red, prefix: "❌" },
      WARN: { color: chalk.yellow, prefix: "⚠️" },
      INFO: { color: chalk.blue, prefix: "ℹ️" },
      SUCCESS: { color: chalk.green, prefix: "✅" },
      DEBUG: { color: chalk.gray, prefix: "🔍" },
      API: { color: chalk.magenta, prefix: "🔌" },
      DB: { color: chalk.cyan, prefix: "💾" },
      SECURITY: { color: chalk.redBright, prefix: "🛡️" },
    };
  }

  /**
   * Format timestamp
   */
  getTimestamp() {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
  }

  /**
   * Check if error is a permission-related error that should be filtered
   */
  isPermissionError(message, error, data) {
    const errorStr = String(message || "").toLowerCase();

    // Extract error information from various sources
    let errorMessage = "";
    let errorCode = null;

    if (error) {
      if (error instanceof Error) {
        errorMessage = error.message?.toLowerCase() || "";
        errorCode = error.code;
      } else if (typeof error === "object") {
        errorMessage = error.message?.toLowerCase() || "";
        errorCode = error.code;
      }
    }

    if (data) {
      if (data instanceof Error) {
        errorMessage = errorMessage || data.message?.toLowerCase() || "";
        errorCode = errorCode || data.code;
      } else if (typeof data === "object") {
        errorMessage = errorMessage || data.message?.toLowerCase() || "";
        errorCode = errorCode || data.code;
      }
    }

    const dataStr =
      data && typeof data === "object" && !(data instanceof Error)
        ? JSON.stringify(data).toLowerCase()
        : "";

    const combinedStr = `${errorStr} ${errorMessage} ${dataStr}`;

    // Discord API permission error codes
    const permissionCodes = [50001, 50013, 50025];
    if (errorCode && permissionCodes.includes(errorCode)) {
      return true;
    }

    // Check if it's specifically about sending messages and permissions
    const sendMessagePatterns = [
      /failed to send.*permission/i,
      /cannot send.*permission/i,
      /missing.*permission.*send/i,
      /failed to send.*message/i,
      /missing.*access.*send/i,
    ];

    for (const pattern of sendMessagePatterns) {
      if (pattern.test(combinedStr)) {
        return true;
      }
    }

    // Check for generic permission errors related to sending
    if (
      combinedStr.includes("send") &&
      (combinedStr.includes("permission") ||
        combinedStr.includes("missing") ||
        combinedStr.includes("access") ||
        combinedStr.includes("cannot"))
    ) {
      return true;
    }

    return false;
  }

  /**
   * Core logging function
   */
  log(level, category, message, data = null) {
    // Filter out permission errors for sending messages
    if (level === "ERROR") {
      // Extract error object from data
      let errorObj = null;
      if (data instanceof Error) {
        errorObj = data;
      } else if (data && typeof data === "object" && data.stack) {
        errorObj = data;
      } else if (
        data &&
        typeof data === "object" &&
        (data.message || data.code)
      ) {
        errorObj = data;
      }

      if (this.isPermissionError(message, errorObj, data)) {
        return; // Silently skip permission errors
      }
    }

    const levelConfig = this.levels[level] || this.levels.INFO;
    const timestamp = chalk.gray(`[${this.getTimestamp()}]`);
    const prefix = levelConfig.prefix;
    const coloredCategory = levelConfig.color(`[${category}]`);

    // Ensure message is always a string
    let messageStr = message;
    if (typeof message !== "string") {
      if (message instanceof Error) {
        messageStr = message.message || message.toString();
      } else if (message && typeof message === "object") {
        messageStr = JSON.stringify(message);
      } else {
        messageStr = String(message);
      }
    }

    const coloredMessage = levelConfig.color(messageStr);

    let logMessage = `${timestamp} ${prefix} ${coloredCategory} ${coloredMessage}`;

    // Add data if provided (and it's actually defined)
    if (data !== null && data !== undefined) {
      // For Error objects, include stack trace
      if (data instanceof Error) {
        logMessage +=
          "\n" + chalk.gray(data.stack || data.message || String(data));
      } else if (data && typeof data === "object" && data.stack) {
        logMessage +=
          "\n" + chalk.gray(data.stack || JSON.stringify(data, null, 2));
      } else {
        logMessage += "\n" + chalk.gray(JSON.stringify(data, null, 2));
      }
    }

    console.log(logMessage);

    // For errors, also log to error stream
    if (level === "ERROR") {
      console.error(logMessage);
    }
  }

  // Convenience methods
  error(category, message, error = null) {
    // Handle old format: logger.info("[Category] Message")
    if (message === undefined && category.includes("[")) {
      const match = category.match(/\[([^\]]+)\]\s*(.*)/);
      if (match) {
        // Pass error object as-is for permission filtering (log will handle stack separately)
        return this.log("ERROR", match[1], match[2], error);
      }
    }
    // Pass error object as-is for permission filtering (log will handle stack separately)
    this.log("ERROR", category, message, error);
  }

  warn(category, message, data = null) {
    if (message === undefined && category.includes("[")) {
      const match = category.match(/\[([^\]]+)\]\s*(.*)/);
      if (match) {
        return this.log("WARN", match[1], match[2], data);
      }
    }
    this.log("WARN", category, message, data);
  }

  info(category, message, data = null) {
    // Handle old format: logger.info("[Category] Message")
    if (message === undefined && category.includes("[")) {
      const match = category.match(/\[([^\]]+)\]\s*(.*)/);
      if (match) {
        return this.log("INFO", match[1], match[2], data);
      }
    }
    this.log("INFO", category, message, data);
  }

  success(category, message, data = null) {
    if (message === undefined && category.includes("[")) {
      const match = category.match(/\[([^\]]+)\]\s*(.*)/);
      if (match) {
        return this.log("SUCCESS", match[1], match[2], data);
      }
    }
    this.log("SUCCESS", category, message, data);
  }

  debug(category, message, data = null) {
    if (process.env.NODE_ENV === "development") {
      if (message === undefined && category.includes("[")) {
        const match = category.match(/\[([^\]]+)\]\s*(.*)/);
        if (match) {
          return this.log("DEBUG", match[1], match[2], data);
        }
      }
      this.log("DEBUG", category, message, data);
    }
  }

  api(endpoint, method, status, duration = null) {
    const message = `${method} ${endpoint} - ${status}${
      duration ? ` (${duration}ms)` : ""
    }`;
    this.log("API", "API", message);
  }

  db(operation, table, duration = null) {
    const message = `${operation} ${table}${
      duration ? ` (${duration}ms)` : ""
    }`;
    this.log("DB", "Database", message);
  }

  security(type, message, data = null) {
    this.log("SECURITY", type, message, data);
  }
}

// Export singleton instance
module.exports = new Logger();
