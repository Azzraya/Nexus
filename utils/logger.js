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
   * Core logging function
   */
  log(level, category, message, data = null) {
    const levelConfig = this.levels[level] || this.levels.INFO;
    const timestamp = chalk.gray(`[${this.getTimestamp()}]`);
    const prefix = levelConfig.prefix;
    const coloredCategory = levelConfig.color(`[${category}]`);
    const coloredMessage = levelConfig.color(message);

    let logMessage = `${timestamp} ${prefix} ${coloredCategory} ${coloredMessage}`;

    // Add data if provided
    if (data) {
      logMessage += "\n" + chalk.gray(JSON.stringify(data, null, 2));
    }

    console.log(logMessage);

    // For errors, also log to error stream
    if (level === "ERROR") {
      console.error(logMessage);
    }
  }

  // Convenience methods
  error(category, message, error = null) {
    this.log("ERROR", category, message, error?.stack || error);
  }

  warn(category, message, data = null) {
    this.log("WARN", category, message, data);
  }

  info(category, message, data = null) {
    this.log("INFO", category, message, data);
  }

  success(category, message, data = null) {
    this.log("SUCCESS", category, message, data);
  }

  debug(category, message, data = null) {
    if (process.env.NODE_ENV === "development") {
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
