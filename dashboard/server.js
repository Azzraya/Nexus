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
          // Total votes across all users
          const totalVotes = await new Promise((resolve, reject) => {
            db.db.get(
              "SELECT SUM(total_votes) as total FROM vote_rewards",
              [],
              (err, row) => {
                if (err) reject(err);
                else resolve(row?.total || 0);
              }
            );
          });

          // Unique voters
          const uniqueVoters = await new Promise((resolve, reject) => {
            db.db.get(
              "SELECT COUNT(*) as count FROM vote_rewards WHERE total_votes > 0",
              [],
              (err, row) => {
                if (err) reject(err);
                else resolve(row?.count || 0);
              }
            );
          });

          // Recent votes (last 30 days)
          const recentVotes = await new Promise((resolve, reject) => {
            db.db.get(
              "SELECT SUM(recent_votes) as total FROM vote_rewards",
              [],
              (err, row) => {
                if (err) reject(err);
                else resolve(row?.total || 0);
              }
            );
          });

          // Longest streak ever
          const longestStreak = await new Promise((resolve, reject) => {
            db.db.get(
              "SELECT MAX(longest_streak) as max FROM vote_rewards",
              [],
              (err, row) => {
                if (err) reject(err);
                else resolve(row?.max || 0);
              }
            );
          });

          stats.voting = {
            totalVotes,
            uniqueVoters,
            recentVotes,
            longestStreak,
          };
        } catch (voteError) {
          console.error("Error fetching vote stats:", voteError);
          stats.voting = {
            totalVotes: 0,
            uniqueVoters: 0,
            recentVotes: 0,
            longestStreak: 0,
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

    console.log("[API] Public API v1 endpoints registered");
  }

  // ===== Analytics System =====

  setupAnalytics() {
    // POST /api/analytics/track - Track user interactions
    this.app.post("/api/analytics/track", async (req, res) => {
      try {
        const { sessionId, events, metadata } = req.body;

        if (!events || !Array.isArray(events)) {
          return res.status(400).json({ error: "Invalid events data" });
        }

        // Store each event in the database
        for (const event of events) {
          await new Promise((resolve, reject) => {
            db.db.run(
              `INSERT INTO analytics_events (session_id, event_type, page, data, timestamp, user_agent, ip_address)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                sessionId,
                event.type,
                event.page,
                JSON.stringify(event.data),
                event.timestamp,
                metadata?.userAgent || req.headers["user-agent"],
                req.ip || req.connection.remoteAddress,
              ],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
        }

        res.json({ success: true, tracked: events.length });
      } catch (error) {
        console.error("Analytics track error:", error);
        // Don't send error to client - analytics should fail silently
        res.json({ success: true });
      }
    });

    // GET /api/analytics/dashboard - Get analytics dashboard data (admin only)
    this.app.get("/api/analytics/dashboard", async (req, res) => {
      try {
        // Get last 7 days of data
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

        const stats = {
          totalPageviews: 0,
          uniqueSessions: 0,
          totalClicks: 0,
          avgSessionDuration: 0,
          topPages: [],
          clickHeatmap: [],
          hourlyTraffic: [],
        };

        // Total pageviews
        const pageviews = await new Promise((resolve, reject) => {
          db.db.get(
            `SELECT COUNT(*) as count FROM analytics_events 
             WHERE event_type = 'pageview' AND timestamp > ?`,
            [sevenDaysAgo],
            (err, row) => {
              if (err) reject(err);
              else resolve(row?.count || 0);
            }
          );
        });
        stats.totalPageviews = pageviews;

        // Unique sessions
        const sessions = await new Promise((resolve, reject) => {
          db.db.get(
            `SELECT COUNT(DISTINCT session_id) as count FROM analytics_events 
             WHERE timestamp > ?`,
            [sevenDaysAgo],
            (err, row) => {
              if (err) reject(err);
              else resolve(row?.count || 0);
            }
          );
        });
        stats.uniqueSessions = sessions;

        // Total clicks
        const clicks = await new Promise((resolve, reject) => {
          db.db.get(
            `SELECT COUNT(*) as count FROM analytics_events 
             WHERE event_type = 'click' AND timestamp > ?`,
            [sevenDaysAgo],
            (err, row) => {
              if (err) reject(err);
              else resolve(row?.count || 0);
            }
          );
        });
        stats.totalClicks = clicks;

        // Top pages
        const topPages = await new Promise((resolve, reject) => {
          db.db.all(
            `SELECT page, COUNT(*) as views 
             FROM analytics_events 
             WHERE event_type = 'pageview' AND timestamp > ?
             GROUP BY page 
             ORDER BY views DESC 
             LIMIT 10`,
            [sevenDaysAgo],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        });
        stats.topPages = topPages;

        // Click heatmap data (most clicked elements)
        const clickData = await new Promise((resolve, reject) => {
          db.db.all(
            `SELECT data, COUNT(*) as clicks 
             FROM analytics_events 
             WHERE event_type = 'click' AND timestamp > ?
             GROUP BY data 
             ORDER BY clicks DESC 
             LIMIT 20`,
            [sevenDaysAgo],
            (err, rows) => {
              if (err) reject(err);
              else
                resolve(
                  (rows || []).map((r) => ({
                    ...JSON.parse(r.data),
                    clicks: r.clicks,
                  }))
                );
            }
          );
        });
        stats.clickHeatmap = clickData;

        res.json(stats);
      } catch (error) {
        console.error("Analytics dashboard error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // GET /api/analytics/health - Simple health check with basic stats
    this.app.get("/api/analytics/health", async (req, res) => {
      try {
        const last24h = Date.now() - 24 * 60 * 60 * 1000;

        const stats = {
          online: true,
          pageviews24h: 0,
          uniqueVisitors24h: 0,
        };

        const pageviews = await new Promise((resolve, reject) => {
          db.db.get(
            `SELECT COUNT(*) as count FROM analytics_events 
             WHERE event_type = 'pageview' AND timestamp > ?`,
            [last24h],
            (err, row) => {
              if (err) reject(err);
              else resolve(row?.count || 0);
            }
          );
        });
        stats.pageviews24h = pageviews;

        const visitors = await new Promise((resolve, reject) => {
          db.db.get(
            `SELECT COUNT(DISTINCT session_id) as count FROM analytics_events 
             WHERE timestamp > ?`,
            [last24h],
            (err, row) => {
              if (err) reject(err);
              else resolve(row?.count || 0);
            }
          );
        });
        stats.uniqueVisitors24h = visitors;

        res.json(stats);
      } catch (error) {
        console.error("Analytics health error:", error);
        res.json({ online: false });
      }
    });

    console.log("[Analytics] Analytics endpoints registered");
  }

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
    // Setup public API and analytics
    this.setupPublicAPI();
    this.setupAnalytics();

    this.app.listen(port, () => {
      console.log(`[Dashboard] Running on http://localhost:${port}`);
      console.log(
        `[Dashboard] Ngrok URL: ${
          process.env.DASHBOARD_URL || "Set DASHBOARD_URL in .env"
        }`
      );
    });
  }
}

module.exports = DashboardServer;
