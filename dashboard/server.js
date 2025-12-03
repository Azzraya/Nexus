const express = require("express");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const path = require("path");
const db = require("../utils/database");

class DashboardServer {
  constructor(client) {
    this.client = client;
    this.app = express();
    this.rateLimitStore = new Map(); // IP -> { count, resetTime }

    // Middleware
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, "public")));

    // CORS for GitHub Pages and localhost
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      const allowedOrigins = [
        "https://azzraya.github.io",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "null", // For local file:// protocol
      ];

      if (
        allowedOrigins.includes(origin) ||
        (origin && origin.startsWith("http://localhost"))
      ) {
        res.header("Access-Control-Allow-Origin", origin);
      } else {
        res.header("Access-Control-Allow-Origin", "https://azzraya.github.io");
      }

      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, ngrok-skip-browser-warning"
      );
      res.header("Access-Control-Allow-Credentials", "true");

      if (req.method === "OPTIONS") {
        return res.sendStatus(200);
      }
      next();
    });

    // Rate Limiting Middleware (BEFORE IP logging)
    this.app.use((req, res, next) => {
      // Skip rate limiting for authenticated users
      if (req.user) {
        return next();
      }

      const ip =
        req.ip ||
        req.connection.remoteAddress ||
        req.headers["x-forwarded-for"];
      const cleanIP = ip?.replace("::ffff:", "") || "unknown";

      // Rate limit: 100 requests per minute per IP
      const now = Date.now();
      const windowMs = 60 * 1000; // 1 minute
      const maxRequests = 100;

      if (!this.rateLimitStore.has(cleanIP)) {
        this.rateLimitStore.set(cleanIP, {
          count: 1,
          resetTime: now + windowMs,
        });
        return next();
      }

      const record = this.rateLimitStore.get(cleanIP);

      // Reset if window expired
      if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + windowMs;
        return next();
      }

      // Check if over limit
      if (record.count >= maxRequests) {
        console.log(`[Rate Limit] Blocked ${cleanIP} - ${record.count} requests in last minute`);
        return res.status(429).json({
          error: "Too many requests",
          message: "Rate limit exceeded. Try again in 1 minute.",
          retryAfter: Math.ceil((record.resetTime - now) / 1000),
        });
      }

      // Increment counter
      record.count++;
      next();
    });

    // IP Logging Middleware
    this.app.use(async (req, res, next) => {
      try {
        const ip =
          req.ip ||
          req.connection.remoteAddress ||
          req.headers["x-forwarded-for"];
        const cleanIP = ip?.replace("::ffff:", "") || "unknown";

        // Log the visit
        await db.logIP(
          cleanIP,
          req.path,
          req.headers["user-agent"] || "unknown",
          req.headers["referer"] || req.headers["referrer"] || "direct",
          req.sessionID || "unknown",
          req.user?.id || null,
          req.user?.username || null
        );
      } catch (error) {
        // Silent fail - IP logging shouldn't break the site
        console.log("[IP Log] Logging failed:", error.message);
      }
      next();
    });

    // Session
    this.app.use(
      session({
        secret:
          "UaX@Q!3WEUGrEdYNATe*QbEWdtzevt9&3saDtZ0T4s^w@jpjvSx8tCwBh6M6xqDF",
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
      })
    );

    // Passport
    this.app.use(passport.initialize());
    this.app.use(passport.session());

    this.setupAuth();
    this.setupRoutes();
  }

  setupAuth() {
    passport.serializeUser((user, done) => done(null, user));
    passport.deserializeUser((obj, done) => done(null, obj));

    passport.use(
      new DiscordStrategy(
        {
          clientID: process.env.CLIENT_ID || "1444739230679957646",
          clientSecret: process.env.CLIENT_SECRET,
          callbackURL: process.env.DASHBOARD_URL + "/callback",
          scope: ["identify", "guilds"],
        },
        (accessToken, refreshToken, profile, done) => {
          return done(null, profile);
        }
      )
    );
  }

  setupRoutes() {
    // Auth routes
    this.app.get("/login", passport.authenticate("discord"));

    this.app.get(
      "/callback",
      passport.authenticate("discord", { failureRedirect: "/" }),
      (req, res) => res.redirect("/dashboard")
    );

    this.app.get("/logout", (req, res) => {
      req.logout(() => res.redirect("/"));
    });

    // Dashboard route
    this.app.get("/dashboard", this.checkAuth, (req, res) => {
      res.sendFile(path.join(__dirname, "public", "dashboard.html"));
    });

    // API Routes
    this.app.get("/api/user", this.checkAuth, (req, res) => {
      res.json(req.user);
    });

    this.app.get("/api/servers", this.checkAuth, async (req, res) => {
      try {
        const userGuilds = req.user.guilds || [];
        const botGuilds = this.client.guilds.cache;

        // Get all servers where user has admin permissions
        const adminGuilds = userGuilds
          .filter((g) => (g.permissions & 0x8) === 0x8) // ADMINISTRATOR
          .map((ug) => {
            const botGuild = botGuilds.get(ug.id);

            if (botGuild) {
              // Bot is present
              return {
                id: ug.id,
                name: ug.name,
                icon: ug.icon
                  ? `https://cdn.discordapp.com/icons/${ug.id}/${ug.icon}.png`
                  : null,
                memberCount: botGuild.memberCount,
                ownerId: botGuild.ownerId,
                hasBot: true,
                canManage: true,
              };
            } else {
              // Bot is NOT present
              return {
                id: ug.id,
                name: ug.name,
                icon: ug.icon
                  ? `https://cdn.discordapp.com/icons/${ug.id}/${ug.icon}.png`
                  : null,
                memberCount: null, // Unknown
                ownerId: null,
                hasBot: false,
                canManage: false,
              };
            }
          });

        res.json(adminGuilds);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get("/api/server/:id", this.checkAuth, async (req, res) => {
      try {
        const guild = this.client.guilds.cache.get(req.params.id);
        if (!guild) return res.status(404).json({ error: "Server not found" });

        const db = require("../utils/database");
        const config = await db.getServerConfig(guild.id);

        res.json({
          id: guild.id,
          name: guild.name,
          icon: guild.iconURL(),
          memberCount: guild.memberCount,
          ownerId: guild.ownerId,
          config: config || {},
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Update server config
    this.app.post(
      "/api/server/:id/config",
      this.checkAuth,
      async (req, res) => {
        try {
          const guild = this.client.guilds.cache.get(req.params.id);
          if (!guild)
            return res.status(404).json({ error: "Server not found" });

          const updates = req.body;
          await db.setServerConfig(guild.id, updates);

          res.json({ success: true });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Get moderation logs
    this.app.get(
      "/api/server/:id/modlogs",
      this.checkAuth,
      async (req, res) => {
        try {
          const limit = parseInt(req.query.limit) || 50;
          const userId = req.query.userId || null;
          const logs = await db.getModLogs(req.params.id, userId, limit);
          res.json(logs);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Get warnings for a user
    this.app.get(
      "/api/server/:id/warnings",
      this.checkAuth,
      async (req, res) => {
        try {
          const userId = req.query.userId;
          if (!userId)
            return res.status(400).json({ error: "userId required" });

          const warnings = await db.getWarnings(req.params.id, userId);
          res.json(warnings);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Get security logs
    this.app.get(
      "/api/server/:id/security",
      this.checkAuth,
      async (req, res) => {
        try {
          const logs = await db.searchLogs(req.params.id, {
            category: "security",
            limit: parseInt(req.query.limit) || 50,
          });
          res.json(logs);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Get anti-raid statistics
    this.app.get(
      "/api/server/:id/antiraid",
      this.checkAuth,
      async (req, res) => {
        try {
          const logs = await new Promise((resolve, reject) => {
            db.db.all(
              "SELECT COUNT(*) as total FROM anti_raid_logs WHERE guild_id = ?",
              [req.params.id],
              (err, rows) => {
                if (err) reject(err);
                else resolve(rows[0]);
              }
            );
          });
          res.json({ raidsBlocked: logs.total || 0 });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Get server statistics
    this.app.get("/api/server/:id/stats", this.checkAuth, async (req, res) => {
      try {
        const guild = this.client.guilds.cache.get(req.params.id);
        if (!guild) return res.status(404).json({ error: "Server not found" });

        // Get counts from database
        const [modLogsCount, warningsCount, securityLogsCount, antiRaidCount] =
          await Promise.all([
            new Promise((resolve) => {
              db.db.get(
                "SELECT COUNT(*) as count FROM moderation_logs WHERE guild_id = ?",
                [req.params.id],
                (err, row) => resolve(row?.count || 0)
              );
            }),
            new Promise((resolve) => {
              db.db.get(
                "SELECT COUNT(*) as count FROM warnings WHERE guild_id = ?",
                [req.params.id],
                (err, row) => resolve(row?.count || 0)
              );
            }),
            new Promise((resolve) => {
              db.db.get(
                "SELECT COUNT(*) as count FROM security_logs WHERE guild_id = ?",
                [req.params.id],
                (err, row) => resolve(row?.count || 0)
              );
            }),
            new Promise((resolve) => {
              db.db.get(
                "SELECT COUNT(*) as count FROM anti_raid_logs WHERE guild_id = ?",
                [req.params.id],
                (err, row) => resolve(row?.count || 0)
              );
            }),
          ]);

        res.json({
          memberCount: guild.memberCount,
          modActions: modLogsCount,
          warnings: warningsCount,
          threatsDetected: securityLogsCount,
          raidsBlocked: antiRaidCount,
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get recovery snapshots
    this.app.get(
      "/api/server/:id/snapshots",
      this.checkAuth,
      async (req, res) => {
        try {
          const snapshots = await db.getRecoverySnapshots(req.params.id, 10);
          res.json(snapshots);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Admin authentication
    this.app.post("/api/admin/auth", async (req, res) => {
      try {
        const { password } = req.body;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminPassword) {
          return res
            .status(500)
            .json({ error: "Admin password not configured" });
        }

        if (password === adminPassword) {
          // Generate simple token (in production, use JWT)
          const token = Buffer.from(`admin:${Date.now()}`).toString("base64");
          res.json({ success: true, token });
        } else {
          res.status(401).json({ error: "Invalid password" });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Create incident (admin only)
    this.app.post("/api/admin/incidents", async (req, res) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return res.status(401).json({ error: "Unauthorized" });
        }

        const incident = {
          id: Date.now(),
          ...req.body,
        };

        // In a real app, you'd save this to a database
        // For now, we'll just return success and let the admin update incidents.json manually
        res.json({ success: true, incident });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get("/api/stats", async (req, res) => {
      try {
        // Basic bot stats
        const stats = {
          servers: this.client.guilds.cache.size,
          users: this.client.guilds.cache.reduce(
            (acc, g) => acc + g.memberCount,
            0
          ),
          uptime: Math.floor(this.client.uptime / 1000),
          ping: this.client.ws.ping,
          memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        };

        // Get vote statistics from database
        try {
          // Total votes across all users (from vote_streaks table)
          const totalVotes = await new Promise((resolve) => {
            db.db.get(
              "SELECT SUM(total_votes) as total FROM vote_streaks",
              [],
              (err, row) => {
                if (err) resolve(0);
                else resolve(row?.total || 0);
              }
            );
          });

          // Unique voters (from vote_streaks table)
          const uniqueVoters = await new Promise((resolve) => {
            db.db.get(
              "SELECT COUNT(*) as count FROM vote_streaks WHERE total_votes > 0",
              [],
              (err, row) => {
                if (err) resolve(0);
                else resolve(row?.count || 0);
              }
            );
          });

          // Recent votes (last 30 days - from vote_rewards table)
          const recentVotes = await new Promise((resolve) => {
            const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
            db.db.get(
              "SELECT COUNT(*) as total FROM vote_rewards WHERE voted_at > ?",
              [thirtyDaysAgo],
              (err, row) => {
                if (err) resolve(0);
                else resolve(row?.total || 0);
              }
            );
          });

          // Longest streak ever (from vote_streaks table)
          const longestStreak = await new Promise((resolve) => {
            db.db.get(
              "SELECT MAX(longest_streak) as max FROM vote_streaks",
              [],
              (err, row) => {
                if (err) resolve(0);
                else resolve(row?.max || 0);
              }
            );
          });

          // Vote counts per bot list
          const topggVotes = await new Promise((resolve) => {
            db.db.get(
              "SELECT COUNT(*) as count FROM vote_rewards WHERE botlist = 'topgg'",
              [],
              (err, row) => {
                if (err) resolve(0);
                else resolve(row?.count || 0);
              }
            );
          });

          const dblVotes = await new Promise((resolve) => {
            db.db.get(
              "SELECT COUNT(*) as count FROM vote_rewards WHERE botlist = 'discordbotlist'",
              [],
              (err, row) => {
                if (err) resolve(0);
                else resolve(row?.count || 0);
              }
            );
          });

          const voidVotes = await new Promise((resolve) => {
            db.db.get(
              "SELECT COUNT(*) as count FROM vote_rewards WHERE botlist = 'voidbots'",
              [],
              (err, row) => {
                if (err) resolve(0);
                else resolve(row?.count || 0);
              }
            );
          });

          stats.voting = {
            totalVotes,
            uniqueVoters,
            recentVotes,
            longestStreak,
            byPlatform: {
              topgg: topggVotes,
              discordBotList: dblVotes,
              voidBots: voidVotes,
            },
          };
        } catch (voteError) {
          console.error("Error fetching vote stats:", voteError);
          stats.voting = {
            totalVotes: 0,
            uniqueVoters: 0,
            recentVotes: 0,
            longestStreak: 0,
            byPlatform: {
              topgg: 0,
              discordBotList: 0,
              voidBots: 0,
            },
          };
        }

        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get recent global security events (public endpoint)
    this.app.get("/api/security/recent", async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 10;
        const events = await db.getRecentSecurityEvents(limit);
        res.json(events);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get global threat statistics (public endpoint)
    this.app.get("/api/security/stats", async (req, res) => {
      try {
        const stats = await db.getGlobalSecurityStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get server health analytics (public endpoint)
    this.app.get("/api/analytics/health", async (req, res) => {
      try {
        const health = {
          totalServers: this.client.guilds.cache.size,
          protectedServers: await db.getProtectedServersCount(),
          averageSecurityScore: await db.getAverageSecurityScore(),
          activeThreats: await db.getActiveThreatsCount(),
          serversWithAntiNuke: await db.getServersWithFeatureCount(
            "anti_nuke_enabled"
          ),
          serversWithAntiRaid: await db.getServersWithFeatureCount(
            "anti_raid_enabled"
          ),
          serversWithAutoMod: await db.getServersWithFeatureCount(
            "auto_mod_enabled"
          ),
        };
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Rate Limiting Middleware for Public API
    const checkAPIKey = async (req, res, next) => {
      const apiKey = req.headers["x-api-key"] || req.query.api_key;

      if (!apiKey) {
        return res.status(401).json({
          error: "API key required",
          message:
            "Please provide an API key via X-API-Key header or api_key query parameter",
        });
      }

      const keyData = await db.validateAPIKey(apiKey);
      if (!keyData) {
        return res.status(401).json({ error: "Invalid API key" });
      }

      const rateLimit = await db.checkRateLimit(apiKey);
      if (!rateLimit.allowed) {
        return res.status(429).json({
          error: "Rate limit exceeded",
          limit: rateLimit.limit,
          message:
            "You have reached your daily request limit. Please try again tomorrow.",
        });
      }

      // Log the request
      await db.logAPIRequest(apiKey, req.path, req.ip);

      // Add rate limit headers
      res.setHeader("X-RateLimit-Remaining", rateLimit.remaining);
      res.setHeader("X-RateLimit-Limit", keyData.rate_limit);

      req.apiKey = keyData;
      next();
    };

    // API Documentation endpoint (no key required)
    this.app.get("/api/v1/docs", (req, res) => {
      res.json({
        version: "1.0.0",
        name: "Nexus Public API",
        description: "Access Nexus bot data programmatically",
        authentication:
          "API Key required (X-API-Key header or api_key query parameter)",
        rateLimit: "100 requests per day per key",
        requestKey: "Contact nexusbot0@proton.me to request an API key",
        endpoints: {
          "/api/v1/server/:id": {
            method: "GET",
            description: "Get server information and configuration",
            params: { id: "Discord server ID" },
          },
          "/api/v1/user/:userId/warnings": {
            method: "GET",
            description: "Get user warnings in a specific server",
            params: { userId: "Discord user ID" },
            query: { guild_id: "Discord server ID (required)" },
          },
          "/api/v1/votes/leaderboard": {
            method: "GET",
            description: "Get voting leaderboard",
            query: {
              type: "total, streak, or longest (default: total)",
              limit: "Number of results (default: 10, max: 100)",
            },
          },
        },
      });
    });

    // Public API Endpoints (require API key)
    this.app.get("/api/v1/server/:id", checkAPIKey, async (req, res) => {
      try {
        const guild = this.client.guilds.cache.get(req.params.id);
        if (!guild) {
          return res.status(404).json({ error: "Server not found" });
        }

        const config = await db.getServerConfig(req.params.id);
        const stats = await db.getServerStats(req.params.id);

        res.json({
          id: guild.id,
          name: guild.name,
          memberCount: guild.memberCount,
          features: {
            antiNuke: config.anti_nuke_enabled,
            antiRaid: config.anti_raid_enabled,
            autoMod: config.auto_mod_enabled,
          },
          stats: stats,
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get(
      "/api/v1/user/:userId/warnings",
      checkAPIKey,
      async (req, res) => {
        try {
          const guildId = req.query.guild_id;
          if (!guildId) {
            return res
              .status(400)
              .json({ error: "guild_id query parameter required" });
          }

          const warnings = await db.getWarnings(guildId, req.params.userId);
          res.json({ warnings });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    this.app.get("/api/v1/votes/leaderboard", checkAPIKey, async (req, res) => {
      try {
        const type = req.query.type || "total";
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);

        const leaderboard = await new Promise((resolve, reject) => {
          let orderBy = "total_votes";
          if (type === "streak") orderBy = "current_streak";
          if (type === "longest") orderBy = "longest_streak";

          db.db.all(
            `SELECT user_id, total_votes, current_streak, longest_streak 
             FROM vote_rewards 
             WHERE ${orderBy} > 0 
             ORDER BY ${orderBy} DESC 
             LIMIT ?`,
            [limit],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        });

        res.json({ leaderboard });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Home route
    this.app.get("/", (req, res) => {
      if (req.isAuthenticated()) {
        return res.redirect("/dashboard");
      }
      res.sendFile(path.join(__dirname, "public", "index.html"));
    });
  }

  checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.status(401).json({ error: "Unauthorized" });
  }

  // ===== PUBLIC API v1 Routes =====

  // API Key Authentication Middleware
  async apiAuth(req, res, next) {
    try {
      // Get API key from header or query param
      const apiKey =
        req.headers["x-api-key"] ||
        req.query.api_key ||
        req.headers.authorization?.replace("Bearer ", "");

      if (!apiKey) {
        return res.status(401).json({ error: "API key required" });
      }

      // Validate API key
      const keyData = await db.validateAPIKey(apiKey);
      if (!keyData) {
        return res.status(401).json({ error: "Invalid API key" });
      }

      // Check rate limit
      const rateCheck = await db.checkRateLimit(apiKey);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          error: rateCheck.reason,
          limit: rateCheck.limit,
        });
      }

      // Log the request
      await db.logAPIRequest(
        apiKey,
        req.path,
        req.ip || req.connection.remoteAddress
      );

      // Attach rate limit headers
      res.set({
        "X-RateLimit-Limit": keyData.rate_limit,
        "X-RateLimit-Remaining": rateCheck.remaining,
      });

      // Attach key data to request
      req.apiKey = keyData;
      next();
    } catch (error) {
      console.error("API auth error:", error);
      res.status(500).json({ error: "Authentication error" });
    }
  }

  setupPublicAPI() {
    // GET /api/v1/version - Get API and bot version
    this.app.get("/api/v1/version", (req, res) => {
      const packageJson = require("../package.json");
      res.json({
        botVersion: packageJson.version,
        apiVersion: "1.0.0",
        botName: "Nexus",
        uptime: Math.floor(process.uptime()),
        endpoints: {
          server: "/api/v1/server/:id",
          warnings: "/api/v1/user/:userId/warnings",
          leaderboard: "/api/v1/votes/leaderboard",
          stats: "/api/v1/bot/stats",
        },
      });
    });

    // GET /api/v1/server/:id - Get server info and config
    this.app.get(
      "/api/v1/server/:id",
      this.apiAuth.bind(this),
      async (req, res) => {
        try {
          const serverId = req.params.id;
          const guild = this.client.guilds.cache.get(serverId);

          if (!guild) {
            return res.status(404).json({ error: "Server not found" });
          }

          const config = await db.getServerConfig(serverId);

          res.json({
            id: guild.id,
            name: guild.name,
            memberCount: guild.memberCount,
            features: {
              antiNuke: config?.anti_nuke_enabled || false,
              antiRaid: config?.anti_raid_enabled || false,
              autoMod: config?.auto_mod_enabled || false,
            },
            stats: {
              totalBans: await this.getServerStat(serverId, "bans"),
              totalKicks: await this.getServerStat(serverId, "kicks"),
              warnings: await this.getServerStat(serverId, "warnings"),
            },
          });
        } catch (error) {
          console.error("API error:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      }
    );

    // GET /api/v1/user/:userId/warnings - Get user warnings
    this.app.get(
      "/api/v1/user/:userId/warnings",
      this.apiAuth.bind(this),
      async (req, res) => {
        try {
          const { userId } = req.params;
          const { guild_id } = req.query;

          if (!guild_id) {
            return res
              .status(400)
              .json({ error: "guild_id query parameter required" });
          }

          const warnings = await new Promise((resolve, reject) => {
            db.db.all(
              `SELECT * FROM warnings WHERE user_id = ? AND guild_id = ? ORDER BY timestamp DESC`,
              [userId, guild_id],
              (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
              }
            );
          });

          res.json({ warnings });
        } catch (error) {
          console.error("API error:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      }
    );

    // GET /api/v1/votes/leaderboard - Get voting leaderboard
    this.app.get(
      "/api/v1/votes/leaderboard",
      this.apiAuth.bind(this),
      async (req, res) => {
        try {
          const type = req.query.type || "total";
          const limit = Math.min(parseInt(req.query.limit) || 10, 100);

          let orderBy;
          switch (type) {
            case "streak":
              orderBy = "current_streak DESC";
              break;
            case "longest":
              orderBy = "longest_streak DESC";
              break;
            default:
              orderBy = "total_votes DESC";
          }

          const leaderboard = await new Promise((resolve, reject) => {
            db.db.all(
              `SELECT user_id, total_votes, current_streak, longest_streak 
               FROM vote_rewards 
               WHERE total_votes > 0 
               ORDER BY ${orderBy} 
               LIMIT ?`,
              [limit],
              (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
              }
            );
          });

          res.json({ leaderboard });
        } catch (error) {
          console.error("API error:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      }
    );

    // GET /api/v1/bot/stats - Get bot global stats
    this.app.get(
      "/api/v1/bot/stats",
      this.apiAuth.bind(this),
      async (req, res) => {
        try {
          res.json({
            servers: this.client.guilds.cache.size,
            users: this.client.guilds.cache.reduce(
              (acc, guild) => acc + guild.memberCount,
              0
            ),
            uptime: Math.floor(process.uptime()),
            commands: 85,
          });
        } catch (error) {
          console.error("API error:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      }
    );

    // GET /api/v1/security-analytics - Get real security analytics
    this.app.get("/api/v1/security-analytics", async (req, res) => {
      try {
        const totalServers = this.client.guilds.cache.size;

        // Count servers with each feature enabled
        const antiNukeCount = await new Promise((resolve) => {
          db.db.get(
            "SELECT COUNT(*) as count FROM server_config WHERE anti_nuke_enabled = 1",
            [],
            (err, row) => {
              if (err) resolve(0);
              else resolve(row?.count || 0);
            }
          );
        });

        const antiRaidCount = await new Promise((resolve) => {
          db.db.get(
            "SELECT COUNT(*) as count FROM server_config WHERE anti_raid_enabled = 1",
            [],
            (err, row) => {
              if (err) resolve(0);
              else resolve(row?.count || 0);
            }
          );
        });

        const autoModCount = await new Promise((resolve) => {
          db.db.get(
            "SELECT COUNT(*) as count FROM server_config WHERE auto_mod_enabled = 1",
            [],
            (err, row) => {
              if (err) resolve(0);
              else resolve(row?.count || 0);
            }
          );
        });

        // Calculate average security score
        const avgScore = await new Promise((resolve) => {
          db.db.get(
            "SELECT AVG(security_score) as avg FROM server_config",
            [],
            (err, row) => {
              if (err) resolve(0);
              else resolve(Math.round(row?.avg || 0));
            }
          );
        });

        // Count active threats (recent security logs from last 24h)
        const last24h = Date.now() - 24 * 60 * 60 * 1000;
        const activeThreats = await new Promise((resolve) => {
          db.db.get(
            `SELECT COUNT(*) as count FROM security_logs 
             WHERE timestamp > ? AND (action_taken = 'prevented' OR action_taken = 'blocked')`,
            [last24h],
            (err, row) => {
              if (err) resolve(0);
              else resolve(row?.count || 0);
            }
          );
        });

        res.json({
          protectedServers: totalServers,
          averageSecurityScore: avgScore,
          serversWithAntiNuke: antiNukeCount,
          serversWithAntiRaid: antiRaidCount,
          serversWithAutoMod: autoModCount,
          activeThreats: activeThreats,
        });
      } catch (error) {
        console.error("Security analytics error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // GET /api/v1/recent-activity - Get recent bot activity
    this.app.get("/api/v1/recent-activity", async (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const activities = [];

        // Get recent security logs (last 24 hours)
        const last24h = Date.now() - 24 * 60 * 60 * 1000;
        const securityLogs = await new Promise((resolve) => {
          db.db.all(
            `SELECT * FROM security_logs 
             WHERE timestamp > ? 
             ORDER BY timestamp DESC 
             LIMIT ?`,
            [last24h, limit],
            (err, rows) => {
              if (err) resolve([]);
              else resolve(rows || []);
            }
          );
        });

        // Convert security logs to activity items
        securityLogs.forEach((log) => {
          let icon, text;
          if (log.threat_type === "raid") {
            icon = "🛡️";
            text = `Stopped raid attempt in ${log.guild_id}`;
          } else if (log.threat_type === "nuke") {
            icon = "💣";
            text = `Prevented nuke in ${log.guild_id}`;
          } else if (
            log.event_type === "mass_ban" ||
            log.event_type === "mass_kick"
          ) {
            icon = "⚡";
            text = `Blocked mass ${log.event_type.replace(
              "mass_",
              ""
            )} attempt`;
          } else {
            icon = "🔒";
            text = `Security action: ${log.event_type}`;
          }

          activities.push({
            icon,
            text,
            timestamp: log.timestamp,
            type: "security",
          });
        });

        // Add guild join/leave events
        this.client.guilds.cache.forEach((guild) => {
          const joinedAt = guild.joinedTimestamp;
          if (joinedAt > last24h) {
            activities.push({
              icon: "🚀",
              text: `Joined ${guild.name}`,
              timestamp: joinedAt,
              type: "guild_join",
            });
          }
        });

        // Sort by timestamp
        activities.sort((a, b) => b.timestamp - a.timestamp);

        res.json(activities.slice(0, limit));
      } catch (error) {
        console.error("Recent activity error:", error);
        res.json([]);
      }
    });

    // GET /api/v1/achievements - Get unlocked achievements
    this.app.get("/api/v1/achievements", async (req, res) => {
      try {
        const serverCount = this.client.guilds.cache.size;
        const userCount = this.client.guilds.cache.reduce(
          (acc, guild) => acc + guild.memberCount,
          0
        );

        // Get total votes
        const totalVotes = await new Promise((resolve) => {
          db.db.get(
            "SELECT SUM(total_votes) as total FROM vote_streaks",
            [],
            (err, row) => {
              if (err) resolve(0);
              else resolve(row?.total || 0);
            }
          );
        });

        // Get total invites (sum of all server joins)
        const totalInvites = await new Promise((resolve) => {
          db.db.get(
            "SELECT COUNT(*) as count FROM guild_join_log",
            [],
            (err, row) => {
              if (err) resolve(serverCount); // Fallback to current count
              else resolve(row?.count || serverCount);
            }
          );
        });

        // Define achievements
        const achievements = [
          {
            id: "servers_5",
            name: "First 5 Servers",
            icon: "🌟",
            requirement: 5,
            current: serverCount,
            unlocked: serverCount >= 5,
          },
          {
            id: "servers_10",
            name: "10 Server Milestone",
            icon: "⭐",
            requirement: 10,
            current: serverCount,
            unlocked: serverCount >= 10,
          },
          {
            id: "servers_20",
            name: "20 Servers Strong",
            icon: "💫",
            requirement: 20,
            current: serverCount,
            unlocked: serverCount >= 20,
          },
          {
            id: "servers_50",
            name: "50 Server Club",
            icon: "🌠",
            requirement: 50,
            current: serverCount,
            unlocked: serverCount >= 50,
          },
          {
            id: "servers_100",
            name: "100 Servers!",
            icon: "🏆",
            requirement: 100,
            current: serverCount,
            unlocked: serverCount >= 100,
          },
          {
            id: "users_100",
            name: "100 Users Protected",
            icon: "🛡️",
            requirement: 100,
            current: userCount,
            unlocked: userCount >= 100,
          },
          {
            id: "users_500",
            name: "500 Users Protected",
            icon: "🔰",
            requirement: 500,
            current: userCount,
            unlocked: userCount >= 500,
          },
          {
            id: "users_1000",
            name: "1K Users Protected",
            icon: "💎",
            requirement: 1000,
            current: userCount,
            unlocked: userCount >= 1000,
          },
          {
            id: "votes_10",
            name: "First 10 Votes",
            icon: "🗳️",
            requirement: 10,
            current: totalVotes,
            unlocked: totalVotes >= 10,
          },
          {
            id: "votes_50",
            name: "50 Votes",
            icon: "🎖️",
            requirement: 50,
            current: totalVotes,
            unlocked: totalVotes >= 50,
          },
          {
            id: "votes_100",
            name: "100 Votes",
            icon: "🏅",
            requirement: 100,
            current: totalVotes,
            unlocked: totalVotes >= 100,
          },
          {
            id: "invites_25",
            name: "25 Total Invites",
            icon: "📈",
            requirement: 25,
            current: totalInvites,
            unlocked: totalInvites >= 25,
          },
          {
            id: "invites_50",
            name: "50 Total Invites",
            icon: "📊",
            requirement: 50,
            current: totalInvites,
            unlocked: totalInvites >= 50,
          },
          {
            id: "invites_100",
            name: "100 Total Invites",
            icon: "💯",
            requirement: 100,
            current: totalInvites,
            unlocked: totalInvites >= 100,
          },
        ];

        res.json(achievements);
      } catch (error) {
        console.error("Achievements error:", error);
        res.json([]);
      }
    });

    // GET /api/v1/invite-stats - Get invite statistics
    this.app.get("/api/v1/invite-stats", async (req, res) => {
      try {
        const currentServers = this.client.guilds.cache.size;

        // Try to get total invites from database
        const totalInvites = await new Promise((resolve) => {
          db.db.get(
            "SELECT COUNT(*) as count FROM guild_join_log",
            [],
            (err, row) => {
              if (err) resolve(currentServers);
              else resolve(row?.count || currentServers);
            }
          );
        });

        // Calculate retention rate
        const retentionRate =
          currentServers > 0
            ? Math.round((currentServers / totalInvites) * 100)
            : 100;

        res.json({
          totalInvites,
          currentServers,
          serversLeft: totalInvites - currentServers,
          retentionRate,
        });
      } catch (error) {
        console.error("Invite stats error:", error);
        const currentServers = this.client.guilds.cache.size;
        res.json({
          totalInvites: currentServers,
          currentServers,
          serversLeft: 0,
          retentionRate: 100,
        });
      }
    });

    // GET /api/admin/ip-logs - View IP logs (admin only)
    this.app.get("/api/admin/ip-logs", async (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
        const logs = await db.getIPLogs(limit);
        res.json(logs);
      } catch (error) {
        console.error("IP logs error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // GET /api/admin/ip-stats - Get IP statistics
    this.app.get("/api/admin/ip-stats", async (req, res) => {
      try {
        const last24h = Date.now() - 24 * 60 * 60 * 1000;
        const last7d = Date.now() - 7 * 24 * 60 * 60 * 1000;

        const stats = {
          uniqueVisitors24h: await db.getUniqueVisitors(last24h),
          uniqueVisitors7d: await db.getUniqueVisitors(last7d),
          uniqueVisitorsAllTime: await db.getUniqueVisitors(),
          totalRequests: await new Promise((resolve) => {
            db.db.get(
              "SELECT COUNT(*) as count FROM ip_logs",
              [],
              (err, row) => {
                if (err) resolve(0);
                else resolve(row?.count || 0);
              }
            );
          }),
        };

        res.json(stats);
      } catch (error) {
        console.error("IP stats error:", error);
        res.json({
          uniqueVisitors24h: 0,
          uniqueVisitors7d: 0,
          uniqueVisitorsAllTime: 0,
          totalRequests: 0,
        });
      }
    });

    // ==================== INVITE SOURCE TRACKING ====================

    // GET /api/admin/invite-sources - List all invite sources
    this.app.get("/api/admin/invite-sources", async (req, res) => {
      try {
        const sources = await db.getAllInviteSources();
        res.json({ sources });
      } catch (error) {
        console.error("Error fetching invite sources:", error);
        res.status(500).json({ error: "Failed to fetch invite sources" });
      }
    });

    // POST /api/admin/invite-sources - Create new invite source
    this.app.post("/api/admin/invite-sources", async (req, res) => {
      try {
        const { source, description } = req.body;

        if (!source) {
          return res.status(400).json({ error: "Source is required" });
        }

        const result = await db.createInviteSource(source, description);
        res.json({ success: true, source: result });
      } catch (error) {
        console.error("Error creating invite source:", error);
        if (error.message?.includes("UNIQUE")) {
          res.status(400).json({ error: "Source already exists" });
        } else {
          res.status(500).json({ error: "Failed to create invite source" });
        }
      }
    });

    // DELETE /api/admin/invite-sources/:source - Delete invite source
    this.app.delete("/api/admin/invite-sources/:source", async (req, res) => {
      try {
        const { source } = req.params;
        await db.deleteInviteSource(source);
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting invite source:", error);
        res.status(500).json({ error: "Failed to delete invite source" });
      }
    });

    // GET /api/admin/invite-stats - Get invite source statistics
    this.app.get("/api/admin/invite-stats", async (req, res) => {
      try {
        const stats = await db.getInviteSourceStats();
        res.json({ stats });
      } catch (error) {
        console.error("Error fetching invite stats:", error);
        res.status(500).json({ error: "Failed to fetch invite stats" });
      }
    });

    // POST /api/track-invite-click - Track when someone clicks an invite link
    this.app.post("/api/track-invite-click", async (req, res) => {
      try {
        const { source } = req.body;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers["user-agent"];

        if (source) {
          await db.trackInviteClick(source, ipAddress, userAgent);
          console.log(`[Invite Tracking] Click tracked: ${source} from ${ipAddress}`);
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Error tracking invite click:", error);
        res.status(500).json({ error: "Failed to track click" });
      }
    });

    // POST /api/associate-invite-source - Associate a user with their invite source
    this.app.post("/api/associate-invite-source", async (req, res) => {
      try {
        const { userId, source } = req.body;

        if (userId && source) {
          await db.trackPendingInviteSource(userId, source);
          console.log(`[Invite Tracking] Associated user ${userId} with source: ${source}`);
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Error associating invite source:", error);
        res.status(500).json({ error: "Failed to associate source" });
      }
    });

    // GET /api/v1/showcase-servers - Get top servers for showcase
    this.app.get("/api/v1/showcase-servers", async (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit) || 6, 20);

        // Get servers with highest security scores and member counts
        const servers = [];

        for (const [guildId, guild] of this.client.guilds.cache) {
          const config = await db.getServerConfig(guildId);

          // Calculate security score
          let score = 0;
          if (config?.anti_nuke_enabled) score += 30;
          if (config?.anti_raid_enabled) score += 30;
          if (config?.auto_mod_enabled) score += 20;
          if (config?.auto_recovery_enabled) score += 20;

          servers.push({
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL() || null,
            memberCount: guild.memberCount,
            securityScore: score,
            features: {
              antiNuke: config?.anti_nuke_enabled || false,
              antiRaid: config?.anti_raid_enabled || false,
              autoMod: config?.auto_mod_enabled || false,
              autoRecovery: config?.auto_recovery_enabled || false,
            },
          });
        }

        // Sort by security score, then member count
        servers.sort((a, b) => {
          if (b.securityScore !== a.securityScore) {
            return b.securityScore - a.securityScore;
          }
          return b.memberCount - a.memberCount;
        });

        res.json(servers.slice(0, limit));
      } catch (error) {
        console.error("Showcase servers error:", error);
        res.json([]);
      }
    });

    console.log("[API] Public API v1 endpoints registered");
    console.log("[IP Logging] IP tracking active");
  }

  // Analytics system removed - causing errors

  // API Key Management removed - causing database conflicts

  async getServerStat(serverId, type) {
    return new Promise((resolve, reject) => {
      let query;
      switch (type) {
        case "bans":
          query = `SELECT COUNT(*) as count FROM mod_logs WHERE guild_id = ? AND action = 'ban'`;
          break;
        case "kicks":
          query = `SELECT COUNT(*) as count FROM mod_logs WHERE guild_id = ? AND action = 'kick'`;
          break;
        case "warnings":
          query = `SELECT COUNT(*) as count FROM warnings WHERE guild_id = ?`;
          break;
        default:
          resolve(0);
          return;
      }

      db.db.get(query, [serverId], (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      });
    });
  }

  start(port = 3000) {
    // Setup public API
    this.setupPublicAPI();

    // Clean up old rate limit entries every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [ip, record] of this.rateLimitStore.entries()) {
        if (now > record.resetTime + 300000) { // 5 minutes after reset
          this.rateLimitStore.delete(ip);
        }
      }
    }, 300000);

    this.app.listen(port, () => {
      console.log(`[Dashboard] Running on http://localhost:${port}`);
      console.log(
        `[Dashboard] Ngrok URL: ${
          process.env.DASHBOARD_URL || "Set DASHBOARD_URL in .env"
        }`
      );
      console.log("[Rate Limit] IP rate limiting active (100 req/min)");
    });
  }
}

module.exports = DashboardServer;
