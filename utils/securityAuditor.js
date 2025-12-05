/**
 * Security Auditor
 * Validates and sanitizes inputs, prevents common security vulnerabilities
 */

const logger = require("./logger");

class SecurityAuditor {
  constructor() {
    this.suspiciousPatterns = [
      /(\$\{.*\})/g, // Template injection
      /(javascript:)/gi, // XSS
      /(<script|<iframe|onerror=|onload=)/gi, // XSS
      /(union.*select|drop.*table|insert.*into|delete.*from)/gi, // SQL injection
      /(\.\.\/|\.\.\\)/g, // Path traversal
      /(__proto__|constructor|prototype)/gi, // Prototype pollution
    ];

    this.bannedCommands = [
      "eval",
      "exec",
      "spawn",
      "fork",
      "execFile",
      "execSync",
    ];
  }

  /**
   * Sanitize user input to prevent XSS
   */
  sanitizeInput(input) {
    if (typeof input !== "string") return input;

    return input
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;")
      .trim();
  }

  /**
   * Validate Discord ID format
   */
  isValidDiscordId(id) {
    if (typeof id !== "string") return false;
    return /^\d{17,19}$/.test(id);
  }

  /**
   * Validate server ID
   */
  isValidServerId(id) {
    return this.isValidDiscordId(id);
  }

  /**
   * Validate user ID
   */
  isValidUserId(id) {
    return this.isValidDiscordId(id);
  }

  /**
   * Check for SQL injection patterns
   */
  containsSQLInjection(input) {
    if (typeof input !== "string") return false;

    const dangerous = [
      /(\bselect\b.*\bfrom\b)/i,
      /(\bunion\b.*\bselect\b)/i,
      /(\bdrop\b.*\btable\b)/i,
      /(\binsert\b.*\binto\b)/i,
      /(\bdelete\b.*\bfrom\b)/i,
      /(\bupdate\b.*\bset\b)/i,
      /(;|\-\-|\/\*|\*\/)/,
    ];

    return dangerous.some((pattern) => pattern.test(input));
  }

  /**
   * Check for XSS patterns
   */
  containsXSS(input) {
    if (typeof input !== "string") return false;

    const xssPatterns = [
      /<script/i,
      /<iframe/i,
      /javascript:/i,
      /onerror=/i,
      /onload=/i,
      /<img.*src/i,
      /eval\(/i,
    ];

    return xssPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * Check for path traversal
   */
  containsPathTraversal(input) {
    if (typeof input !== "string") return false;
    return /(\.\.(\/|\\))+/.test(input);
  }

  /**
   * Comprehensive security check
   */
  isSuspicious(input) {
    if (typeof input !== "string") return false;

    return this.suspiciousPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * Validate and sanitize command arguments
   */
  validateCommandArgs(args) {
    const validated = {};

    for (const [key, value] of Object.entries(args)) {
      if (typeof value === "string") {
        // Check for suspicious patterns
        if (this.isSuspicious(value)) {
          logger.security(
            "Command Args",
            `Suspicious input detected in ${key}`,
            { value }
          );
          throw new Error(`Invalid input in ${key}`);
        }

        validated[key] = this.sanitizeInput(value);
      } else {
        validated[key] = value;
      }
    }

    return validated;
  }

  /**
   * Validate API request body
   */
  validateAPIRequest(body, requiredFields = []) {
    // Check for required fields
    for (const field of requiredFields) {
      if (!body[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Sanitize all string fields
    const sanitized = {};
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") {
        if (this.isSuspicious(value)) {
          logger.security("API Request", `Suspicious input in ${key}`, {
            value,
          });
          throw new Error(`Invalid input in ${key}`);
        }
        sanitized[key] = this.sanitizeInput(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Check if command execution is safe
   */
  isCommandSafe(command) {
    const banned = this.bannedCommands.some((cmd) => command.includes(cmd));
    if (banned) {
      logger.security("Command Execution", "Attempted banned command", {
        command,
      });
      return false;
    }
    return true;
  }

  /**
   * Validate file path
   */
  isPathSafe(filePath) {
    if (this.containsPathTraversal(filePath)) {
      logger.security("File Access", "Path traversal attempted", { filePath });
      return false;
    }

    // Check for suspicious extensions
    const dangerous = [".exe", ".bat", ".sh", ".cmd", ".com", ".scr"];
    if (dangerous.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      logger.security("File Access", "Dangerous file extension", { filePath });
      return false;
    }

    return true;
  }

  /**
   * Rate limit check helper
   */
  checkRateLimit(identifier, limit, windowMs, store) {
    const now = Date.now();
    const record = store.get(identifier);

    if (!record) {
      store.set(identifier, { count: 1, resetTime: now + windowMs });
      return { allowed: true, remaining: limit - 1 };
    }

    // Reset if window expired
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return { allowed: true, remaining: limit - 1 };
    }

    // Check limit
    if (record.count >= limit) {
      logger.security("Rate Limit", `${identifier} exceeded rate limit`);
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      };
    }

    record.count++;
    return { allowed: true, remaining: limit - record.count };
  }

  /**
   * Validate webhook URL
   */
  isWebhookUrlSafe(url) {
    try {
      const parsed = new URL(url);

      // Only allow HTTPS
      if (parsed.protocol !== "https:") {
        logger.security("Webhook", "Non-HTTPS webhook URL rejected", { url });
        return false;
      }

      // Check for suspicious patterns
      if (this.isSuspicious(url)) {
        logger.security("Webhook", "Suspicious webhook URL", { url });
        return false;
      }

      return true;
    } catch (error) {
      logger.security("Webhook", "Invalid webhook URL", { url });
      return false;
    }
  }

  /**
   * Generate security report
   */
  generateSecurityReport(checks) {
    const report = {
      timestamp: Date.now(),
      passed: true,
      issues: [],
    };

    for (const check of checks) {
      if (!check.passed) {
        report.passed = false;
        report.issues.push({
          type: check.type,
          severity: check.severity || "medium",
          message: check.message,
          details: check.details,
        });
      }
    }

    if (!report.passed) {
      logger.security("Security Report", "Security issues detected", {
        issueCount: report.issues.length,
      });
    }

    return report;
  }

  /**
   * Hash sensitive data (for logging without exposing)
   */
  hashSensitive(data) {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(String(data)).digest("hex");
  }

  /**
   * Mask sensitive string (show first/last few chars)
   */
  maskSensitive(str, showChars = 4) {
    if (!str || str.length <= showChars * 2) return "***";
    return `${str.slice(0, showChars)}${"*".repeat(
      Math.max(0, str.length - showChars * 2)
    )}${str.slice(-showChars)}`;
  }
}

// Export singleton
module.exports = new SecurityAuditor();
