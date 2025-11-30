const express = require("express");
const crypto = require("crypto");
const db = require("../../utils/database");
const EnhancedLogging = require("../../utils/enhancedLogging");
const AILearning = require("../../utils/aiLearning");

const app = express();

// Security middleware
app.use((req, res, next) => {
  // Remove server header
  res.removeHeader("X-Powered-By");
  
  // Security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  
  next();
});

// Rate limiting (simple in-memory store)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute

function rateLimit(req, res, next) {
  const key = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  const limit = rateLimitStore.get(key);
  
  if (now > limit.resetTime) {
    limit.count = 1;
    limit.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }
  
  if (limit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ 
      error: "Rate limit exceeded. Please try again later.",
      retryAfter: Math.ceil((limit.resetTime - now) / 1000)
    });
  }
  
  limit.count++;
  next();
}

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, limit] of rateLimitStore.entries()) {
    if (now > limit.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 300000);

app.use(express.json({ limit: "1mb" })); // Limit request size
app.use(rateLimit); // Apply rate limiting to all routes

// Middleware for API key authentication
async function authenticateAPIKey(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or invalid authorization header" });
  }

  const key = authHeader.substring(7);
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");

  const apiKey = await db.getAPIKey(keyHash);

  if (!apiKey) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  // Update last used
  await db.updateAPIKeyUsage(keyHash);

  req.apiKey = apiKey;
  next();
}

// Health check (no auth required, but rate limited)
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// All API routes require authentication
app.use("/api", (req, res, next) => {
  // All /api routes require authentication
  if (!req.headers.authorization) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
});

// Get server stats
app.get(
  "/api/v1/guilds/:guildId/stats",
  authenticateAPIKey,
  async (req, res) => {
    try {
      const { guildId } = req.params;

      if (
        req.apiKey.guild_id !== guildId &&
        !req.apiKey.permissions.includes("admin")
      ) {
        return res.status(403).json({ error: "Access denied" });
      }

      const config = await db.getServerConfig(guildId);
      const stats = await db.getUserStats(guildId);

      res.json({
        guild_id: guildId,
        config: {
          anti_raid_enabled: config?.anti_raid_enabled || false,
          anti_nuke_enabled: config?.anti_nuke_enabled || false,
          heat_system_enabled: config?.heat_system_enabled || false,
        },
        stats: {
          total_members: stats?.length || 0,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get logs
app.get(
  "/api/v1/guilds/:guildId/logs",
  authenticateAPIKey,
  async (req, res) => {
    try {
      const { guildId } = req.params;
      const {
        category,
        severity,
        userId,
        limit = 100,
        startTime,
        endTime,
      } = req.query;

      if (
        req.apiKey.guild_id !== guildId &&
        !req.apiKey.permissions.includes("admin")
      ) {
        return res.status(403).json({ error: "Access denied" });
      }

      const filters = {};
      if (category) filters.category = category;
      if (severity) filters.severity = severity;
      if (userId) filters.userId = userId;
      if (limit) filters.limit = parseInt(limit);
      if (startTime) filters.startTime = parseInt(startTime);
      if (endTime) filters.endTime = parseInt(endTime);

      const logs = await EnhancedLogging.search(guildId, filters);

      res.json({ logs, count: logs.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get AI predictions
app.get(
  "/api/v1/guilds/:guildId/users/:userId/prediction",
  authenticateAPIKey,
  async (req, res) => {
    try {
      const { guildId, userId } = req.params;

      if (
        req.apiKey.guild_id !== guildId &&
        !req.apiKey.permissions.includes("admin")
      ) {
        return res.status(403).json({ error: "Access denied" });
      }

      const prediction = await AILearning.getPrediction(guildId, userId);

      res.json(prediction);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get workflows
app.get(
  "/api/v1/guilds/:guildId/workflows",
  authenticateAPIKey,
  async (req, res) => {
    try {
      const { guildId } = req.params;

      if (
        req.apiKey.guild_id !== guildId &&
        !req.apiKey.permissions.includes("admin")
      ) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (
        !req.apiKey.permissions.includes("read") &&
        !req.apiKey.permissions.includes("admin")
      ) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      const workflows = await db.getWorkflows(guildId);

      res.json({ workflows, count: workflows.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Create log entry
app.post(
  "/api/v1/guilds/:guildId/logs",
  authenticateAPIKey,
  async (req, res) => {
    try {
      const { guildId } = req.params;
      const {
        logType,
        category,
        userId,
        action,
        details,
        severity = "info",
      } = req.body;

      if (
        req.apiKey.guild_id !== guildId &&
        !req.apiKey.permissions.includes("admin")
      ) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (
        !req.apiKey.permissions.includes("write") &&
        !req.apiKey.permissions.includes("admin")
      ) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      const logId = await EnhancedLogging.log(guildId, logType, category, {
        userId,
        moderatorId: req.apiKey.created_by,
        action,
        details,
        severity,
      });

      res.json({ success: true, log_id: logId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Export logs
app.get(
  "/api/v1/guilds/:guildId/logs/export",
  authenticateAPIKey,
  async (req, res) => {
    try {
      const { guildId } = req.params;
      const { format = "json", days = 7 } = req.query;

      if (
        req.apiKey.guild_id !== guildId &&
        !req.apiKey.permissions.includes("admin")
      ) {
        return res.status(403).json({ error: "Access denied" });
      }

      const filters = {
        startTime: Date.now() - parseInt(days) * 86400000,
        limit: 10000,
      };

      const exported = await EnhancedLogging.export(guildId, format, filters);

      res.setHeader(
        "Content-Type",
        format === "json" ? "application/json" : "text/csv"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=logs_${guildId}_${Date.now()}.${format}`
      );
      res.send(exported);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Only start server if API_ENABLED is true in environment
// By default, API is DISABLED for security
if (process.env.API_ENABLED === "true") {
  const PORT = process.env.API_PORT || 3000;
  const HOST = process.env.API_HOST || "127.0.0.1"; // Default to localhost only (not public)
  
  app.listen(PORT, HOST, () => {
    console.log(`🔒 API Server running on http://${HOST}:${PORT}`);
    if (HOST === "0.0.0.0") {
      console.log(`⚠️  WARNING: API is accessible from ALL interfaces (public-facing)`);
    } else {
      console.log(`✅ API is only accessible from localhost (secure)`);
    }
  });
} else {
  console.log("🔒 API Server is DISABLED by default (set API_ENABLED=true in .env to enable)");
}

module.exports = app;
