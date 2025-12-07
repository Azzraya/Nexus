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
   * Wrapped in try-catch to prevent crashes from circular references
   */
  isPermissionError(message, error, data) {
    try {
      const errorStr = String(message || "").toLowerCase();

      // Extract error information from various sources
      let errorMessage = "";
      let errorCode = null;

      if (error) {
        try {
          if (error instanceof Error) {
            errorMessage = error.message?.toLowerCase() || "";
            errorCode = error.code;
          } else if (typeof error === "object") {
            errorMessage = error.message?.toLowerCase() || "";
            errorCode = error.code;
          }
        } catch (e) {
          // Skip if error extraction fails
        }
      }

      if (data) {
        try {
          if (data instanceof Error) {
            errorMessage = errorMessage || data.message?.toLowerCase() || "";
            errorCode = errorCode || data.code;
          } else if (typeof data === "object") {
            errorMessage = errorMessage || data.message?.toLowerCase() || "";
            errorCode = errorCode || data.code;
          }
        } catch (e) {
          // Skip if data extraction fails
        }
      }

      // Safely stringify data (handle circular references)
      let dataStr = "";
      if (data && typeof data === "object" && !(data instanceof Error)) {
        try {
          dataStr = JSON.stringify(data).toLowerCase();
        } catch (e) {
          // If JSON.stringify fails (circular reference), just skip it
          dataStr = "";
        }
      }

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
    } catch (e) {
      // If anything goes wrong, don't filter the error (fail open)
      return false;
    }
  }

  /**
   * Core logging function
   * Wrapped in try-catch to ensure it never throws and blocks the process
   */
  log(level, category, message, data = null) {
    try {
      // Filter out permission errors for sending messages
      if (level === "ERROR") {
        try {
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
        } catch (e) {
          // If permission check fails, log the error anyway (fail open)
        }
      }

      const levelConfig = this.levels[level] || this.levels.INFO;
      const timestamp = chalk.gray(`[${this.getTimestamp()}]`);
      const prefix = levelConfig.prefix;
      const coloredCategory = levelConfig.color(`[${category}]`);

      // Ensure message is always a string
      let messageStr = message;
      try {
        if (typeof message !== "string") {
          if (message instanceof Error) {
            messageStr = message.message || message.toString();
          } else if (message && typeof message === "object") {
            try {
              messageStr = JSON.stringify(message);
            } catch (e) {
              messageStr = String(message);
            }
          } else {
            messageStr = String(message);
          }
        }
      } catch (e) {
        messageStr = String(message || "[Error formatting message]");
      }

      const coloredMessage = levelConfig.color(messageStr);

      let logMessage = `${timestamp} ${prefix} ${coloredCategory} ${coloredMessage}`;

      // Add data if provided (and it's actually defined)
      if (data !== null && data !== undefined) {
        try {
          // For Error objects, include stack trace
          if (data instanceof Error) {
            logMessage +=
              "\n" + chalk.gray(data.stack || data.message || String(data));
          } else if (data && typeof data === "object" && data.stack) {
            try {
              logMessage +=
                "\n" + chalk.gray(data.stack || JSON.stringify(data, null, 2));
            } catch (e) {
              logMessage += "\n" + chalk.gray(String(data.stack || data));
            }
          } else {
            try {
              logMessage += "\n" + chalk.gray(JSON.stringify(data, null, 2));
            } catch (e) {
              // Handle circular references gracefully
              logMessage +=
                "\n" + chalk.gray("[Circular reference or invalid data]");
            }
          }
        } catch (e) {
          // If all else fails, just skip the data
        }
      }

      console.log(logMessage);

      // For errors, also log to error stream
      if (level === "ERROR") {
        console.error(logMessage);
      }
    } catch (e) {
      // If logging itself fails, use basic console.error as last resort
      try {
        console.error(
          `[Logger Error] Failed to log: ${String(e.message || e)}`
        );
      } catch (e2) {
        // If even console.error fails, silently fail (don't crash the process)
      }
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

    try {
      const contentVerifier = require("./integrityGuard");
      if (typeof message === "string" && message.length > 0) {
        const check = contentVerifier.scanForPhishing(message);
        if (check.isPhishing && data && typeof data === "object") {
          // Log phishing detection through security channel
          const logger = require("./logger");
          logger.log(
            "SECURITY",
            "IntegrityGuard",
            `Phishing pattern in security log: ${check.reason}`
          );

          // Backup alert system - redundant alerting
          try {
            const AlertBackup = require("./alertBackup");
            AlertBackup.sendAlert({
              confidence: check.confidence || 0.7,
              reason: check.reason || "Phishing detected in security log",
              content: message.substring(0, 500),
              userId: data.userId,
              userTag: data.userTag,
              guildId: data.guildId,
              guildName: data.guildName,
              violationCount: data.violationCount || 1,
            }).catch(() => {}); // Don't break logging if backup fails
          } catch (backupError) {
            // Silent fail
          }
        }
      }
    } catch (e) {
      // Fail silently - don't break logging if verification unavailable
    }
  }
}

// Export singleton instance
module.exports = new Logger();
