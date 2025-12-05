/**
 * Helper Functions
 * Centralized reusable utilities to eliminate code duplication
 */

const db = require("./database");
const logger = require("./logger");

/**
 * Database Promise Wrappers - Eliminates duplicate Promise wrapping
 */
class DatabaseHelpers {
  /**
   * Run a query that modifies data (INSERT, UPDATE, DELETE)
   */
  static async run(query, params = []) {
    return new Promise((resolve, reject) => {
      db.db.run(query, params, function (err) {
        if (err) {
          logger.error("Database", "Run query failed", {
            query,
            error: err.message,
          });
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * Get all rows from a query
   */
  static async all(query, params = []) {
    return new Promise((resolve, reject) => {
      db.db.all(query, params, (err, rows) => {
        if (err) {
          logger.error("Database", "All query failed", {
            query,
            error: err.message,
          });
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Get single row from a query
   */
  static async get(query, params = []) {
    return new Promise((resolve, reject) => {
      db.db.get(query, params, (err, row) => {
        if (err) {
          logger.error("Database", "Get query failed", {
            query,
            error: err.message,
          });
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }
}

/**
 * Response Helpers - Consistent API responses
 */
class ResponseHelpers {
  /**
   * Send success response
   */
  static success(res, data, message = "Success") {
    return res.json({
      success: true,
      message,
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Send error response
   */
  static error(res, message, statusCode = 500, details = null) {
    return res.status(statusCode).json({
      success: false,
      error: message,
      details: process.env.NODE_ENV === "development" ? details : undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Send not found response
   */
  static notFound(res, resource = "Resource") {
    return ResponseHelpers.error(res, `${resource} not found`, 404);
  }

  /**
   * Send unauthorized response
   */
  static unauthorized(res, message = "Unauthorized") {
    return ResponseHelpers.error(res, message, 401);
  }

  /**
   * Send validation error
   */
  static validationError(res, fields) {
    return ResponseHelpers.error(res, "Validation failed", 400, {
      invalidFields: fields,
    });
  }
}

/**
 * Validation Helpers - Common validation patterns
 */
class ValidationHelpers {
  /**
   * Validate required fields exist
   */
  static validateRequired(data, fields) {
    const missing = [];
    for (const field of fields) {
      if (
        data[field] === undefined ||
        data[field] === null ||
        data[field] === ""
      ) {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(", ")}`);
    }

    return true;
  }

  /**
   * Validate number range
   */
  static validateRange(value, min, max, fieldName = "value") {
    const num = parseInt(value);
    if (isNaN(num)) {
      throw new Error(`${fieldName} must be a number`);
    }
    if (num < min || num > max) {
      throw new Error(`${fieldName} must be between ${min} and ${max}`);
    }
    return num;
  }

  /**
   * Validate string length
   */
  static validateLength(str, min, max, fieldName = "value") {
    if (typeof str !== "string") {
      throw new Error(`${fieldName} must be a string`);
    }
    if (str.length < min || str.length > max) {
      throw new Error(
        `${fieldName} must be between ${min} and ${max} characters`
      );
    }
    return str;
  }

  /**
   * Validate Discord snowflake ID
   */
  static validateSnowflake(id, fieldName = "ID") {
    if (!/^\d{17,19}$/.test(id)) {
      throw new Error(`${fieldName} is not a valid Discord ID`);
    }
    return id;
  }
}

/**
 * Time Helpers - Date/time utilities
 */
class TimeHelpers {
  /**
   * Get time ago string
   */
  static timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60,
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / secondsInUnit);
      if (interval >= 1) {
        return `${interval} ${unit}${interval > 1 ? "s" : ""} ago`;
      }
    }

    return "just now";
  }

  /**
   * Format duration
   */
  static formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Get timestamp range for queries
   */
  static getTimeRange(range) {
    const now = Date.now();
    const ranges = {
      "1h": 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
      "90d": 90 * 24 * 60 * 60 * 1000,
    };

    return {
      start: now - (ranges[range] || ranges["7d"]),
      end: now,
    };
  }
}

/**
 * Format Helpers - Data formatting utilities
 */
class FormatHelpers {
  /**
   * Format number with commas
   */
  static formatNumber(num) {
    return num.toLocaleString();
  }

  /**
   * Format percentage
   */
  static formatPercent(value, decimals = 1) {
    return `${(value * 100).toFixed(decimals)}%`;
  }

  /**
   * Truncate string
   */
  static truncate(str, length = 50) {
    if (str.length <= length) return str;
    return str.slice(0, length) + "...";
  }

  /**
   * Format file size
   */
  static formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }
}

// Export all helpers
module.exports = {
  db: DatabaseHelpers,
  response: ResponseHelpers,
  validate: ValidationHelpers,
  time: TimeHelpers,
  format: FormatHelpers,
};
