const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const logger = require("./logger");
const cache = require("./cache");
const redisCache = require("./redisCache");

class Database {
  constructor() {
    const dbPath = path.join(__dirname, "..", "data", "nexus.db");
    const dataDir = path.dirname(dbPath);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error("Database connection error:", err);
      } else {
        logger.success("Database", "Connected");

        // Optimize database performance (EXCEEDS WICK - better performance)
        this.db.serialize(() => {
          // Enable WAL mode for better concurrency (EXCEEDS WICK)
          this.db.run("PRAGMA journal_mode = WAL;", (err) => {
            if (err) logger.warn("Failed to enable WAL mode:", err);
          });

          // Optimize for performance (EXCEEDS WICK)
          this.db.run("PRAGMA synchronous = NORMAL;"); // Faster writes
          this.db.run("PRAGMA cache_size = -64000;"); // 64MB cache
          this.db.run("PRAGMA temp_store = MEMORY;"); // Use memory for temp tables
          this.db.run("PRAGMA mmap_size = 268435456;"); // 256MB memory-mapped I/O

          // Initialize tables - serialize ensures they're created in order
          this.initTables();
          // Run migrations after tables are created
          this.runMigrations();
        });
      }
    });
  }

  initTables() {
    // Server configurations
    this.db.run(`
            CREATE TABLE IF NOT EXISTS server_config (
                guild_id TEXT PRIMARY KEY,
                prefix TEXT DEFAULT '!',
                mod_log_channel TEXT,
                welcome_channel TEXT,
                leave_channel TEXT,
                welcome_message TEXT,
                leave_message TEXT,
                auto_mod_enabled INTEGER DEFAULT 1,
                anti_raid_enabled INTEGER DEFAULT 1,
                anti_nuke_enabled INTEGER DEFAULT 1,
                heat_system_enabled INTEGER DEFAULT 1,
                ticket_category TEXT,
                reaction_roles_enabled INTEGER DEFAULT 0,
                verification_enabled INTEGER DEFAULT 0,
                verification_role TEXT,
                verification_mode TEXT DEFAULT 'instant',
                verification_target TEXT DEFAULT 'everyone',
                verification_server_type TEXT DEFAULT 'standard',
                verification_channel TEXT,
                verification_message TEXT,
                webhook_url TEXT,
                alert_channel TEXT,
                alert_threshold INTEGER DEFAULT 60
            )
        `);

    // Moderation logs
    this.db.run(`
            CREATE TABLE IF NOT EXISTS moderation_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                user_id TEXT,
                moderator_id TEXT,
                action TEXT,
                reason TEXT,
                timestamp INTEGER,
                duration INTEGER
            )
        `);

    // Warnings
    this.db.run(`
            CREATE TABLE IF NOT EXISTS warnings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                user_id TEXT,
                moderator_id TEXT,
                reason TEXT,
                timestamp INTEGER
            )
        `);

    // Auto-moderation rules
    this.db.run(`
            CREATE TABLE IF NOT EXISTS automod_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                rule_type TEXT,
                trigger TEXT,
                action TEXT,
                enabled INTEGER DEFAULT 1
            )
        `);

    // Heat scores (persistent)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS heat_scores (
                guild_id TEXT,
                user_id TEXT,
                score INTEGER DEFAULT 0,
                last_updated INTEGER,
                PRIMARY KEY (guild_id, user_id)
            )
        `);

    // Heat data (history and detailed tracking)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS heat_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                user_id TEXT,
                score INTEGER DEFAULT 0,
                history TEXT,
                last_updated INTEGER,
                UNIQUE(guild_id, user_id)
            )
        `);

    // Cases (moderation cases)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS cases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                user_id TEXT,
                moderator_id TEXT,
                case_type TEXT,
                reason TEXT,
                timestamp INTEGER,
                duration INTEGER,
                active INTEGER DEFAULT 1
            )
        `);

    // Analytics
    this.db.run(`
            CREATE TABLE IF NOT EXISTS analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                event_type TEXT,
                data TEXT,
                timestamp INTEGER
            )
        `);

    // Tickets
    this.db.run(`
            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                channel_id TEXT,
                user_id TEXT,
                status TEXT DEFAULT 'open',
                created_at INTEGER
            )
        `);

    // Reaction roles
    this.db.run(`
            CREATE TABLE IF NOT EXISTS reaction_roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                message_id TEXT,
                emoji TEXT,
                role_id TEXT
            )
        `);

    // Anti-raid logs
    this.db.run(`
            CREATE TABLE IF NOT EXISTS anti_raid_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                user_id TEXT,
                action_taken TEXT,
                timestamp INTEGER
            )
        `);

    // User stats
    this.db.run(`
            CREATE TABLE IF NOT EXISTS user_stats (
                guild_id TEXT,
                user_id TEXT,
                messages_sent INTEGER DEFAULT 0,
                commands_used INTEGER DEFAULT 0,
                last_active INTEGER,
                PRIMARY KEY (guild_id, user_id)
            )
        `);

    // Anti-raid state (for advanced detection)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS anti_raid_state (
                guild_id TEXT PRIMARY KEY,
                data TEXT
            )
        `);

    // Leveling system
    this.db.run(`
            CREATE TABLE IF NOT EXISTS levels (
                guild_id TEXT,
                user_id TEXT,
                xp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 0,
                total_xp INTEGER DEFAULT 0,
                PRIMARY KEY (guild_id, user_id)
            )
        `);

    // Custom commands
    this.db.run(`
            CREATE TABLE IF NOT EXISTS custom_commands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                command_name TEXT,
                response TEXT,
                use_embed INTEGER DEFAULT 0,
                created_by TEXT,
                created_at INTEGER
            )
        `);

    // Giveaways
    this.db.run(`
            CREATE TABLE IF NOT EXISTS giveaways (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                channel_id TEXT,
                message_id TEXT,
                prize TEXT,
                winners INTEGER DEFAULT 1,
                ends_at INTEGER,
                requirements TEXT,
                entries TEXT
            )
        `);

    // Auto-roles
    this.db.run(`
            CREATE TABLE IF NOT EXISTS auto_roles (
                guild_id TEXT,
                role_id TEXT,
                type TEXT,
                PRIMARY KEY (guild_id, role_id)
            )
        `);

    // Backups
    this.db.run(`
            CREATE TABLE IF NOT EXISTS backups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                backup_id TEXT,
                file_path TEXT,
                created_at INTEGER
            )
        `);

    // Slowmode tracking
    this.db.run(`
            CREATE TABLE IF NOT EXISTS slowmode_channels (
                guild_id TEXT,
                channel_id TEXT,
                rate_limit INTEGER,
                PRIMARY KEY (guild_id, channel_id)
            )
        `);

    // Role management
    this.db.run(`
            CREATE TABLE IF NOT EXISTS role_management (
                guild_id TEXT,
                role_id TEXT,
                max_uses INTEGER,
                current_uses INTEGER DEFAULT 0,
                cooldown INTEGER,
                PRIMARY KEY (guild_id, role_id)
            )
        `);

    // Security whitelist
    this.db.run(`
            CREATE TABLE IF NOT EXISTS security_whitelist (
                guild_id TEXT,
                user_id TEXT,
                PRIMARY KEY (guild_id, user_id)
            )
        `);

    // Advanced Automod (EXCEEDS WICK)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS automod_config (
                guild_id TEXT PRIMARY KEY,
                spam_enabled INTEGER DEFAULT 1,
                spam_max_messages INTEGER DEFAULT 5,
                spam_time_window INTEGER DEFAULT 5000,
                spam_action TEXT DEFAULT 'timeout',
                link_scanning_enabled INTEGER DEFAULT 1,
                link_action TEXT DEFAULT 'delete',
                link_whitelist TEXT,
                link_blacklist TEXT,
                block_invites INTEGER DEFAULT 0,
                invite_whitelist TEXT,
                caps_enabled INTEGER DEFAULT 1,
                caps_threshold INTEGER DEFAULT 70,
                caps_action TEXT DEFAULT 'warn',
                emoji_spam_enabled INTEGER DEFAULT 1,
                emoji_max_count INTEGER DEFAULT 10,
                emoji_action TEXT DEFAULT 'delete',
                mention_spam_enabled INTEGER DEFAULT 1,
                mention_max_count INTEGER DEFAULT 5,
                mention_action TEXT DEFAULT 'timeout',
                ignored_channels TEXT,
                ignored_roles TEXT,
                automod_log_channel TEXT
            )
        `);

    this.db.run(`
            CREATE TABLE IF NOT EXISTS automod_violations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                user_id TEXT,
                violation_type TEXT,
                message_content TEXT,
                action_taken TEXT,
                timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )
        `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_automod_guild_user 
                 ON automod_violations(guild_id, user_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_automod_timestamp 
                 ON automod_violations(timestamp)`);

    // Member Screening System (EXCEEDS WICK - proactive security)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS member_screening_config (
                guild_id TEXT PRIMARY KEY,
                enabled INTEGER DEFAULT 0,
                min_account_age_days INTEGER DEFAULT 7,
                require_avatar INTEGER DEFAULT 0,
                check_username_patterns INTEGER DEFAULT 1,
                check_threat_intel INTEGER DEFAULT 1,
                check_discriminator INTEGER DEFAULT 1,
                auto_ban_threshold INTEGER DEFAULT 80,
                auto_kick_threshold INTEGER DEFAULT 60,
                quarantine_threshold INTEGER DEFAULT 40,
                alert_threshold INTEGER DEFAULT 20,
                quarantine_role TEXT,
                screening_log_channel TEXT,
                bypass_roles TEXT
            )
        `);

    this.db.run(`
            CREATE TABLE IF NOT EXISTS member_screening_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                user_id TEXT,
                action TEXT,
                reason TEXT,
                risk_score INTEGER,
                timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )
        `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_screening_guild_time 
                 ON member_screening_logs(guild_id, timestamp)`);

    // Scheduled Actions System (EXCEEDS WICK)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS scheduled_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                action_type TEXT,
                action_data TEXT,
                schedule_type TEXT,
                cron_expression TEXT,
                execute_at INTEGER,
                created_by TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                status TEXT DEFAULT 'active',
                last_execution INTEGER
            )
        `);

    this.db.run(`
            CREATE TABLE IF NOT EXISTS scheduled_action_executions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action_id INTEGER,
                executed_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                success INTEGER,
                error_message TEXT,
                FOREIGN KEY (action_id) REFERENCES scheduled_actions(id)
            )
        `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_scheduled_actions_guild 
                 ON scheduled_actions(guild_id, status)`);

    // Voice Monitoring System (EXCEEDS WICK)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS voice_monitoring_config (
                guild_id TEXT PRIMARY KEY,
                enabled INTEGER DEFAULT 1,
                raid_detection_enabled INTEGER DEFAULT 1,
                raid_threshold INTEGER DEFAULT 10,
                auto_create_enabled INTEGER DEFAULT 0,
                auto_delete_enabled INTEGER DEFAULT 0,
                log_channel TEXT,
                alert_channel TEXT
            )
        `);

    this.db.run(`
            CREATE TABLE IF NOT EXISTS voice_activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                user_id TEXT,
                channel_id TEXT,
                action TEXT,
                session_duration INTEGER,
                timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )
        `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_voice_activity_guild_time 
                 ON voice_activity_logs(guild_id, timestamp)`);

    // Webhook Events System (EXCEEDS WICK - real-time integrations)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS webhook_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                webhook_url TEXT,
                event_type TEXT,
                created_by TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                status TEXT DEFAULT 'active'
            )
        `);

    this.db.run(`
            CREATE TABLE IF NOT EXISTS webhook_deliveries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subscription_id INTEGER,
                success INTEGER,
                status_code INTEGER,
                error_message TEXT,
                delivered_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                FOREIGN KEY (subscription_id) REFERENCES webhook_subscriptions(id)
            )
        `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_webhook_guild 
                 ON webhook_subscriptions(guild_id, status)`);

    // Multi-Server Networks (EXCEEDS WICK - cross-server management)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS server_networks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                network_name TEXT,
                owner_id TEXT,
                config TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )
        `);

    this.db.run(`
            CREATE TABLE IF NOT EXISTS network_guilds (
                network_id INTEGER,
                guild_id TEXT,
                added_by TEXT,
                added_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                PRIMARY KEY (network_id, guild_id),
                FOREIGN KEY (network_id) REFERENCES server_networks(id)
            )
        `);

    this.db.run(`
            CREATE TABLE IF NOT EXISTS network_whitelist (
                network_id INTEGER,
                user_id TEXT,
                added_by TEXT,
                reason TEXT,
                added_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                PRIMARY KEY (network_id, user_id)
            )
        `);

    this.db.run(`
            CREATE TABLE IF NOT EXISTS network_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                network_id INTEGER,
                guild_id TEXT,
                action_type TEXT,
                action_data TEXT,
                timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )
        `);

    // Security logs
    this.db.run(`
            CREATE TABLE IF NOT EXISTS security_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                event_type TEXT,
                user_id TEXT,
                details TEXT,
                threat_score INTEGER,
                threat_type TEXT,
                action_taken INTEGER DEFAULT 0,
                timestamp INTEGER
            )
        `);

    // Attack patterns (for learning)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS attack_patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                pattern_data TEXT,
                timestamp INTEGER
            )
        `);

    // Join Gate configuration
    this.db.run(`
            CREATE TABLE IF NOT EXISTS join_gate_config (
                guild_id TEXT PRIMARY KEY,
                enabled INTEGER DEFAULT 0,
                target_unauthorized_bots INTEGER DEFAULT 1,
                target_new_accounts INTEGER DEFAULT 1,
                min_account_age_days INTEGER DEFAULT 7,
                target_no_avatar INTEGER DEFAULT 0,
                target_unverified_bots INTEGER DEFAULT 1,
                target_invite_usernames INTEGER DEFAULT 1,
                target_suspicious INTEGER DEFAULT 1,
                suspicious_threshold INTEGER DEFAULT 60,
                action TEXT DEFAULT 'kick',
                strict_words TEXT DEFAULT '[]',
                wildcard_words TEXT DEFAULT '[]',
                authorized_roles TEXT DEFAULT '[]'
            )
        `);

    // Rescue keys
    this.db.run(`
            CREATE TABLE IF NOT EXISTS rescue_keys (
                guild_id TEXT PRIMARY KEY,
                owner_id TEXT,
                rescue_key TEXT UNIQUE,
                created_at INTEGER,
                used_at INTEGER
            )
        `);

    // Rescue key usage logs
    this.db.run(`
            CREATE TABLE IF NOT EXISTS rescue_key_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                old_owner_id TEXT,
                new_owner_id TEXT,
                used_at INTEGER
            )
        `);

    // Notes
    this.db.run(`
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                user_id TEXT,
                note TEXT,
                created_by TEXT,
                created_at INTEGER
            )
        `);

    // Quarantine
    this.db.run(`
            CREATE TABLE IF NOT EXISTS quarantine (
                guild_id TEXT,
                user_id TEXT,
                original_roles TEXT,
                reason TEXT,
                quarantined_by TEXT,
                quarantined_at INTEGER,
                PRIMARY KEY (guild_id, user_id)
            )
        `);

    // Locked channels
    this.db.run(`
            CREATE TABLE IF NOT EXISTS locked_channels (
                guild_id TEXT,
                channel_id TEXT,
                PRIMARY KEY (guild_id, channel_id)
            )
        `);

    // Locked roles
    this.db.run(`
            CREATE TABLE IF NOT EXISTS locked_roles (
                guild_id TEXT,
                role_id TEXT,
                PRIMARY KEY (guild_id, role_id)
            )
        `);

    // Custom workflows
    this.db.run(`
            CREATE TABLE IF NOT EXISTS workflows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                name TEXT,
                description TEXT,
                trigger_type TEXT,
                trigger_config TEXT,
                actions TEXT,
                enabled INTEGER DEFAULT 1,
                created_by TEXT,
                created_at INTEGER,
                last_triggered INTEGER,
                trigger_count INTEGER DEFAULT 0
            )
        `);

    // Enhanced logging
    this.db.run(`
            CREATE TABLE IF NOT EXISTS enhanced_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                log_type TEXT,
                category TEXT,
                user_id TEXT,
                moderator_id TEXT,
                action TEXT,
                details TEXT,
                metadata TEXT,
                severity TEXT,
                timestamp INTEGER,
                indexed_data TEXT
            )
        `);

    // AI learning data
    this.db.run(`
            CREATE TABLE IF NOT EXISTS ai_learning (
                guild_id TEXT,
                user_id TEXT,
                pattern_type TEXT,
                pattern_data TEXT,
                confidence REAL,
                last_seen INTEGER,
                occurrences INTEGER DEFAULT 1,
                PRIMARY KEY (guild_id, user_id, pattern_type)
            )
        `);

    // Anti-nuke whitelist (EXCEEDS WICK - prevents false positives)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS anti_nuke_whitelist (
                guild_id TEXT,
                user_id TEXT,
                reason TEXT,
                added_by TEXT,
                added_at INTEGER,
                PRIMARY KEY (guild_id, user_id)
            )
        `);

    // API audit logs - track all API usage
    this.db.run(`
            CREATE TABLE IF NOT EXISTS api_audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                api_key_id INTEGER,
                guild_id TEXT,
                endpoint TEXT,
                method TEXT,
                ip_address TEXT,
                user_agent TEXT,
                request_data TEXT,
                response_status INTEGER,
                data_accessed TEXT,
                permissions_used TEXT,
                timestamp INTEGER,
                created_by_user_id TEXT
            )
        `);

    // API keys table removed - now using Discord user-bound api_keys at line 706

    // Scheduled actions - OLD TABLE REMOVED (now using enhanced version at line 390)

    // Polls
    this.db.run(`
            CREATE TABLE IF NOT EXISTS polls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                channel_id TEXT,
                message_id TEXT,
                creator_id TEXT,
                question TEXT,
                options TEXT,
                votes TEXT,
                ends_at INTEGER,
                allow_multiple INTEGER DEFAULT 0,
                anonymous INTEGER DEFAULT 0,
                created_at INTEGER,
                ended INTEGER DEFAULT 0
            )
        `);

    // Suggestions
    this.db.run(`
            CREATE TABLE IF NOT EXISTS suggestions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                channel_id TEXT,
                message_id TEXT,
                user_id TEXT,
                suggestion TEXT,
                upvotes INTEGER DEFAULT 0,
                downvotes INTEGER DEFAULT 0,
                voters TEXT,
                status TEXT DEFAULT 'pending',
                reviewed_by TEXT,
                reviewed_at INTEGER,
                created_at INTEGER
            )
        `);

    // Role templates
    this.db.run(`
            CREATE TABLE IF NOT EXISTS role_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                template_name TEXT,
                role_ids TEXT,
                created_by TEXT,
                created_at INTEGER
            )
        `);

    // Achievements
    this.db.run(`
            CREATE TABLE IF NOT EXISTS achievements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                user_id TEXT,
                achievement_type TEXT,
                achievement_data TEXT,
                unlocked_at INTEGER,
                UNIQUE(guild_id, user_id, achievement_type)
            )
        `);

    // Scheduled messages
    this.db.run(`
            CREATE TABLE IF NOT EXISTS scheduled_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                channel_id TEXT,
                message_content TEXT,
                embed_data TEXT,
                scheduled_for INTEGER,
                created_by TEXT,
                created_at INTEGER,
                sent INTEGER DEFAULT 0
            )
        `);

    // Auto-responders
    this.db.run(`
            CREATE TABLE IF NOT EXISTS auto_responders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                trigger TEXT,
                response TEXT,
                response_type TEXT DEFAULT 'text',
                case_sensitive INTEGER DEFAULT 0,
                enabled INTEGER DEFAULT 1,
                created_by TEXT,
                created_at INTEGER
            )
        `);

    // Smart recommendations
    this.db.run(`
            CREATE TABLE IF NOT EXISTS recommendations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                recommendation_type TEXT,
                title TEXT,
                description TEXT,
                priority TEXT,
                action_data TEXT,
                created_at INTEGER,
                acknowledged INTEGER DEFAULT 0,
                acknowledged_by TEXT,
                acknowledged_at INTEGER
            )
        `);

    // Real-time notifications
    this.db.run(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                notification_type TEXT,
                channel_id TEXT,
                webhook_url TEXT,
                enabled INTEGER DEFAULT 1,
                filters TEXT,
                created_at INTEGER
            )
        `);

    // Behavioral analysis
    this.db.run(`
            CREATE TABLE IF NOT EXISTS behavioral_data (
                guild_id TEXT,
                user_id TEXT,
                behavior_type TEXT,
                data TEXT,
                timestamp INTEGER,
                confidence REAL,
                PRIMARY KEY (guild_id, user_id, behavior_type, timestamp)
            )
        `);

    // Threat intelligence network
    this.db.run(`
            CREATE TABLE IF NOT EXISTS threat_intelligence (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                threat_type TEXT,
                threat_data TEXT,
                severity TEXT,
                source_guild_id TEXT,
                reported_at INTEGER,
                verified INTEGER DEFAULT 0,
                verification_count INTEGER DEFAULT 1
            )
        `);

    // Threat sensitivity settings
    this.db.run(`
            CREATE TABLE IF NOT EXISTS threat_sensitivity (
                guild_id TEXT PRIMARY KEY,
                risk_threshold INTEGER DEFAULT 30,
                severity_critical INTEGER DEFAULT 40,
                severity_high INTEGER DEFAULT 30,
                severity_medium INTEGER DEFAULT 20,
                severity_low INTEGER DEFAULT 10,
                recent_multiplier INTEGER DEFAULT 5,
                recent_days INTEGER DEFAULT 7
            )
        `);

    // Botlist voting links
    this.db.run(`
            CREATE TABLE IF NOT EXISTS botlist_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                url TEXT NOT NULL,
                added_by TEXT,
                added_at INTEGER
            )
        `);

    // API keys table for public API (bound to Discord users)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                api_key TEXT NOT NULL UNIQUE,
                discord_user_id TEXT NOT NULL,
                discord_username TEXT,
                email TEXT,
                purpose TEXT,
                created_at INTEGER,
                created_by_admin TEXT,
                last_used INTEGER,
                rate_limit INTEGER DEFAULT 100,
                requests_today INTEGER DEFAULT 0,
                total_requests INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                notes TEXT
            )
        `);

    // API request logs for rate limiting
    this.db.run(`
            CREATE TABLE IF NOT EXISTS api_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                api_key TEXT,
                endpoint TEXT,
                timestamp INTEGER,
                ip_address TEXT,
                discord_user_id TEXT
            )
        `);

    // Analytics events for website tracking
    this.db.run(`
            CREATE TABLE IF NOT EXISTS analytics_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                event_type TEXT,
                page TEXT,
                data TEXT,
                timestamp INTEGER,
                user_agent TEXT,
                ip_address TEXT
            )
        `);

    // Create index for faster analytics queries
    this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_analytics_timestamp 
            ON analytics_events(timestamp)
        `);

    this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_analytics_session 
            ON analytics_events(session_id)
        `);

    // IP logging table
    this.db.run(`
            CREATE TABLE IF NOT EXISTS ip_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip_address TEXT NOT NULL,
                discord_user_id TEXT,
                discord_username TEXT,
                page_url TEXT,
                user_agent TEXT,
                referrer TEXT,
                timestamp INTEGER NOT NULL,
                session_id TEXT,
                location TEXT
            )
        `);

    // Create indexes for IP logs
    this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_ip_logs_timestamp 
            ON ip_logs(timestamp)
        `);

    this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_ip_logs_ip 
            ON ip_logs(ip_address)
        `);

    this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_ip_logs_user 
            ON ip_logs(discord_user_id)
        `);

    // Invite source tracking table
    this.db.run(`
            CREATE TABLE IF NOT EXISTS invite_sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL UNIQUE,
                description TEXT,
                total_clicks INTEGER DEFAULT 0,
                total_joins INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `);

    // Track which servers joined from which source
    this.db.run(`
            CREATE TABLE IF NOT EXISTS guild_invite_tracking (
                guild_id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                invited_at INTEGER NOT NULL,
                guild_name TEXT,
                member_count INTEGER
            )
        `);

    // Create indexes for invite tracking
    this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_guild_tracking_source 
            ON guild_invite_tracking(source)
        `);

    // Pending invite sources - tracks clicks before bot joins
    this.db.run(`
            CREATE TABLE IF NOT EXISTS pending_invite_sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                source TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                ip_address TEXT,
                user_agent TEXT
            )
        `);

    this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_pending_sources_user 
            ON pending_invite_sources(user_id, timestamp DESC)
        `);

    // Guild leaves tracking table
    this.db.run(`
            CREATE TABLE IF NOT EXISTS guild_leaves (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                guild_name TEXT,
                source TEXT,
                left_at INTEGER NOT NULL,
                days_active INTEGER DEFAULT 0,
                member_count INTEGER
            )
        `);

    this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_guild_leaves_source 
            ON guild_leaves(source)
        `);

    // Add default bot list links if table is empty
    this.db.get(
      "SELECT COUNT(*) as count FROM botlist_links",
      [],
      (err, row) => {
        if (!err && row.count === 0) {
          const defaultLinks = [
            {
              name: "Top.gg",
              url: "https://top.gg/bot/1444739230679957646/vote",
            },
            {
              name: "Discord Bot List",
              url: "https://discordbotlist.com/bots/nexus-8245/upvote",
            },
            {
              name: "Void Bots",
              url: "https://voidbots.net/bot/1444739230679957646/vote",
            },
          ];

          defaultLinks.forEach((link) => {
            this.db.run(
              "INSERT OR IGNORE INTO botlist_links (name, url, added_by, added_at) VALUES (?, ?, ?, ?)",
              [link.name, link.url, "system", Date.now()]
            );
          });
        }
      }
    );

    // Voting rewards
    this.db.run(`
            CREATE TABLE IF NOT EXISTS vote_rewards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                botlist TEXT NOT NULL,
                voted_at INTEGER NOT NULL,
                reward_claimed INTEGER DEFAULT 0,
                reward_expires INTEGER
            )
        `);

    // Vote streaks
    this.db.run(`
            CREATE TABLE IF NOT EXISTS vote_streaks (
                user_id TEXT PRIMARY KEY,
                current_streak INTEGER DEFAULT 0,
                longest_streak INTEGER DEFAULT 0,
                total_votes INTEGER DEFAULT 0,
                last_vote_at INTEGER,
                streak_started INTEGER
            )
        `);

    // Referrals table for referral system
    this.db.run(`
            CREATE TABLE IF NOT EXISTS referrals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                status TEXT DEFAULT 'active'
            )
        `);

    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_referrals_user ON referrals(user_id)`
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_referrals_guild ON referrals(guild_id)`
    );

    // Add vote rewards config columns to server_config (use run instead of exec for error handling)
    this.db.run(
      `ALTER TABLE server_config ADD COLUMN vote_rewards_enabled INTEGER DEFAULT 0`,
      (err) => {
        // Silently ignore duplicate column errors
        if (err && !err.message.includes("duplicate column")) {
          logger.debug(
            "Database",
            `vote_rewards_enabled column: ${err.message}`
          );
        }
      }
    );
    this.db.run(
      `ALTER TABLE server_config ADD COLUMN vote_reward_role TEXT`,
      (err) => {
        // Silently ignore duplicate column errors
        if (err && !err.message.includes("duplicate column")) {
          logger.debug("Database", `vote_reward_role column: ${err.message}`);
        }
      }
    );
    this.db.run(
      `ALTER TABLE server_config ADD COLUMN vote_webhook_url TEXT`,
      (err) => {
        // Silently ignore duplicate column errors
        if (err && !err.message.includes("duplicate column")) {
          logger.debug("Database", `vote_webhook_url column: ${err.message}`);
        }
      }
    );

    // Auto-recovery snapshots
    this.db.run(`
            CREATE TABLE IF NOT EXISTS recovery_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                snapshot_type TEXT,
                snapshot_data TEXT,
                created_at INTEGER,
                triggered_by TEXT,
                reason TEXT
            )
        `);

    // Moderation queue
    this.db.run(`
            CREATE TABLE IF NOT EXISTS moderation_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                user_id TEXT,
                action_type TEXT,
                reason TEXT,
                priority INTEGER DEFAULT 0,
                context TEXT,
                suggested_action TEXT,
                created_at INTEGER,
                processed INTEGER DEFAULT 0,
                processed_by TEXT,
                processed_at INTEGER
            )
        `);

    // Scheduled reports
    this.db.run(`
            CREATE TABLE IF NOT EXISTS scheduled_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                frequency TEXT,
                channel_id TEXT,
                next_run INTEGER,
                enabled INTEGER DEFAULT 1,
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )
        `);

    // Reports
    this.db.run(`
            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                report_type TEXT,
                period_start INTEGER,
                period_end INTEGER,
                report_data TEXT,
                generated_at INTEGER,
                generated_by TEXT
            )
        `);

    // Verification tokens (for web verification)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS verification_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                user_id TEXT,
                token TEXT UNIQUE,
                verification_id TEXT,
                created_at INTEGER,
                expires_at INTEGER,
                used INTEGER DEFAULT 0
            )
        `);

    // Bot activity log (server joins/leaves)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS bot_activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT,
                guild_id TEXT,
                guild_name TEXT,
                member_count INTEGER,
                owner_id TEXT,
                timestamp INTEGER
            )
        `);

    // Command usage log
    this.db.run(`
            CREATE TABLE IF NOT EXISTS command_usage_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                guild_name TEXT,
                user_id TEXT,
                user_tag TEXT,
                command_name TEXT,
                timestamp INTEGER
            )
        `);

    // Performance metrics
    this.db.run(`
            CREATE TABLE IF NOT EXISTS performance_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                metric_type TEXT,
                metric_value REAL,
                timestamp INTEGER
            )
        `);

    // Create indexes for better performance (after all tables are created)
    // Since we're in serialize mode from constructor, these will run after all CREATE TABLE statements
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_mod_logs_guild_user ON moderation_logs(guild_id, user_id)`,
      (err) => {
        if (err)
          logger.error("Error creating index idx_mod_logs_guild_user:", err);
      }
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_mod_logs_guild_timestamp ON moderation_logs(guild_id, timestamp)`,
      (err) => {
        if (err)
          logger.error(
            "Error creating index idx_mod_logs_guild_timestamp:",
            err
          );
      }
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_security_logs_guild_timestamp ON security_logs(guild_id, timestamp)`,
      (err) => {
        if (err)
          logger.error(
            "Error creating index idx_security_logs_guild_timestamp:",
            err
          );
      }
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings(guild_id, user_id)`,
      (err) => {
        if (err)
          logger.error("Error creating index idx_warnings_guild_user:", err);
      }
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_cases_guild_user ON cases(guild_id, user_id)`,
      (err) => {
        if (err)
          logger.error("Error creating index idx_cases_guild_user:", err);
      }
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_user_stats_guild_user ON user_stats(guild_id, user_id)`,
      (err) => {
        if (err)
          logger.error("Error creating index idx_user_stats_guild_user:", err);
      }
    );

    // Additional performance indexes (EXCEEDS WICK - comprehensive indexing)
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_recovery_snapshots_guild_created ON recovery_snapshots(guild_id, created_at DESC)`,
      (err) => {
        if (err) logger.error("Error creating recovery snapshot index:", err);
      }
    );

    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_heat_scores_guild_user ON heat_scores(guild_id, user_id)`,
      (err) => {
        if (err) logger.error("Error creating heat scores index:", err);
      }
    );

    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_threat_intelligence_user ON threat_intelligence(user_id, reported_at DESC)`,
      (err) => {
        if (err) logger.error("Error creating threat intelligence index:", err);
      }
    );

    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_security_whitelist_guild_user ON security_whitelist(guild_id, user_id)`,
      (err) => {
        if (err) logger.error("Error creating whitelist index:", err);
      }
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_heat_data_guild_user ON heat_data(guild_id, user_id)`,
      (err) => {
        if (err)
          logger.error("Error creating index idx_heat_data_guild_user:", err);
      }
    );

    // Additional performance indexes (EXCEEDS WICK - comprehensive indexing)
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_recovery_snapshots_guild_created ON recovery_snapshots(guild_id, created_at DESC)`,
      (err) => {
        if (err) logger.error("Error creating recovery snapshot index:", err);
      }
    );

    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_heat_scores_guild_user ON heat_scores(guild_id, user_id)`,
      (err) => {
        if (err) logger.error("Error creating heat scores index:", err);
      }
    );

    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_threat_intelligence_user ON threat_intelligence(user_id, reported_at DESC)`,
      (err) => {
        if (err) logger.error("Error creating threat intelligence index:", err);
      }
    );

    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_security_whitelist_guild_user ON security_whitelist(guild_id, user_id)`,
      (err) => {
        if (err) logger.error("Error creating whitelist index:", err);
      }
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_automod_rules_guild ON automod_rules(guild_id)`,
      (err) => {
        if (err)
          logger.error("Error creating index idx_automod_rules_guild:", err);
      }
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_workflows_guild ON workflows(guild_id)`,
      (err) => {
        if (err) logger.error("Error creating index idx_workflows_guild:", err);
      }
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_suggestions_guild_status ON suggestions(guild_id, status)`,
      (err) => {
        if (err)
          logger.error(
            "Error creating index idx_suggestions_guild_status:",
            err
          );
      }
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_polls_guild_active ON polls(guild_id, active)`,
      (err) => {
        if (err)
          logger.error("Error creating index idx_polls_guild_active:", err);
      }
    );

    // Indexes for XP system (performance optimization)
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_user_xp_guild_user ON user_xp(guild_id, user_id)`,
      (err) => {
        if (err)
          logger.error("Error creating index idx_user_xp_guild_user:", err);
      }
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_user_xp_guild_xp ON user_xp(guild_id, xp DESC)`,
      (err) => {
        if (err)
          logger.error("Error creating index idx_user_xp_guild_xp:", err);
      }
    );

    // Indexes for achievements
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_user_achievements_guild_user ON user_achievements(guild_id, user_id)`,
      (err) => {
        if (err)
          logger.error(
            "Error creating index idx_user_achievements_guild_user:",
            err
          );
      }
    );

    // Indexes for server events
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_server_events_guild_time ON server_events(guild_id, start_time)`,
      (err) => {
        if (err)
          logger.error(
            "Error creating index idx_server_events_guild_time:",
            err
          );
      }
    );

    // Indexes for event RSVPs
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_event_rsvp_event ON event_rsvp(event_id)`,
      (err) => {
        if (err)
          logger.error("Error creating index idx_event_rsvp_event:", err);
      }
    );
  }

  runMigrations() {
    // Migration: Add new columns to suggestions table for /suggest command
    this.db.run(`ALTER TABLE suggestions ADD COLUMN title TEXT`, (err) => {
      if (err && !err.message.includes("duplicate column")) {
        logger.error("Migration error (suggestions title):", err);
      }
    });
    this.db.run(
      `ALTER TABLE suggestions ADD COLUMN description TEXT`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          logger.error("Migration error (suggestions description):", err);
        }
      }
    );
    this.db.run(`ALTER TABLE suggestions ADD COLUMN use_case TEXT`, (err) => {
      if (err && !err.message.includes("duplicate column")) {
        logger.error("Migration error (suggestions use_case):", err);
      }
    });
    this.db.run(
      `ALTER TABLE suggestions ADD COLUMN votes INTEGER DEFAULT 0`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          logger.error("Migration error (suggestions votes):", err);
        }
      }
    );
    this.db.run(
      `ALTER TABLE suggestions ADD COLUMN created_at INTEGER`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          logger.error("Migration error (suggestions created_at):", err);
        }
      }
    );

    // Migration: Fix scheduled_actions table - check if old schema exists
    this.db.all(`PRAGMA table_info(scheduled_actions)`, [], (err, columns) => {
      if (err) return;

      const hasStatusColumn =
        columns && columns.some((col) => col.name === "status");
      const hasScheduleType =
        columns && columns.some((col) => col.name === "schedule_type");

      // If table exists but doesn't have new columns, drop and recreate
      if (
        columns &&
        columns.length > 0 &&
        (!hasStatusColumn || !hasScheduleType)
      ) {
        logger.info("[Migration] Updating scheduled_actions table schema...");

        this.db.run(`DROP TABLE IF EXISTS scheduled_actions`, (err) => {
          if (err) {
            logger.error("Migration error (drop scheduled_actions):", err);
          } else {
            // Recreate with new schema
            this.db.run(
              `
              CREATE TABLE IF NOT EXISTS scheduled_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                action_type TEXT,
                action_data TEXT,
                schedule_type TEXT,
                cron_expression TEXT,
                execute_at INTEGER,
                created_by TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                status TEXT DEFAULT 'active',
                last_execution INTEGER
              )
            `,
              (err) => {
                if (err) {
                  logger.error(
                    "Migration error (recreate scheduled_actions):",
                    err
                  );
                } else {
                  logger.success(
                    "[Migration] Scheduled actions table updated successfully"
                  );
                }
              }
            );
          }
        });
      }
    });

    // Migration: Add threat_type and action_taken columns to security_logs if they don't exist
    this.db.run(
      `ALTER TABLE security_logs ADD COLUMN threat_type TEXT`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          logger.error("Error adding threat_type column:", err);
        }
      }
    );
    this.db.run(
      `ALTER TABLE security_logs ADD COLUMN action_taken INTEGER DEFAULT 0`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          logger.error("Error adding action_taken column:", err);
        }
      }
    );

    // Migration: Add verification columns
    this.db.run(
      `ALTER TABLE server_config ADD COLUMN verification_mode TEXT DEFAULT 'instant'`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          logger.error("Error adding verification_mode column:", err);
        }
      }
    );
    this.db.run(
      `ALTER TABLE server_config ADD COLUMN verification_target TEXT DEFAULT 'everyone'`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          logger.error("Error adding verification_target column:", err);
        }
      }
    );
    this.db.run(
      `ALTER TABLE server_config ADD COLUMN verification_server_type TEXT DEFAULT 'standard'`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          logger.error("Error adding verification_server_type column:", err);
        }
      }
    );

    // Migration: Add use_embed column to custom_commands if it doesn't exist
    this.db.run(
      `ALTER TABLE custom_commands ADD COLUMN use_embed INTEGER DEFAULT 0`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          logger.error(
            "Error adding use_embed column to custom_commands:",
            err
          );
        }
      }
    );
    this.db.run(
      `ALTER TABLE server_config ADD COLUMN verification_channel TEXT`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          logger.error("Error adding verification_channel column:", err);
        }
      }
    );
    this.db.run(
      `ALTER TABLE server_config ADD COLUMN verification_message TEXT`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          logger.error("Error adding verification_message column:", err);
        }
      }
    );

    // Migration: Add suggestions_channel_id column
    this.db.run(
      `ALTER TABLE server_config ADD COLUMN suggestions_channel_id TEXT`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Error adding suggestions_channel_id column:", err);
        }
      }
    );

    // Migration: Add join_lock_enabled column
    this.db.run(
      `ALTER TABLE server_config ADD COLUMN join_lock_enabled INTEGER DEFAULT 0`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Error adding join_lock_enabled column:", err);
        }
      }
    );

    // Migration: Add guild_name column to backups table
    this.db.run(
      `ALTER TABLE backups ADD COLUMN guild_name TEXT`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Error adding guild_name to backups:", err);
        }
      }
    );

    // Migration: Add auto_recovery_enabled column
    this.db.run(
      `ALTER TABLE server_config ADD COLUMN auto_recovery_enabled INTEGER DEFAULT 1`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Error adding auto_recovery_enabled column:", err);
        }
      }
    );

    // Migration: Add join_gate_enabled column
    this.db.run(
      `ALTER TABLE server_config ADD COLUMN join_gate_enabled INTEGER DEFAULT 0`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Error adding join_gate_enabled column:", err);
        }
      }
    );

    // Migration: Add enabled column to automod_config
    this.db.run(
      `ALTER TABLE automod_config ADD COLUMN enabled INTEGER DEFAULT 1`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Error adding automod_config enabled column:", err);
        }
      }
    );

    // Migration: Add seasonal_theme column to server_config
    this.db.run(
      `ALTER TABLE server_config ADD COLUMN seasonal_theme TEXT`,
      (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Error adding seasonal_theme column:", err);
        }
      }
    );

    // Migration: Fix polls table schema (drop old, recreate with new schema)
    this.db.run(`DROP TABLE IF EXISTS polls`, (err) => {
      if (err) {
        console.error("Error dropping old polls table:", err);
      } else {
        // Recreate with correct schema
        this.db.run(`
          CREATE TABLE IF NOT EXISTS polls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT UNIQUE NOT NULL,
            channel_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            question TEXT NOT NULL,
            options TEXT NOT NULL,
            creator_id TEXT NOT NULL,
            duration INTEGER NOT NULL,
            anonymous INTEGER DEFAULT 0,
            multiple_choice INTEGER DEFAULT 0,
            end_time INTEGER NOT NULL,
            active INTEGER DEFAULT 1,
            created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
          )
        `);
      }
    });

    // XP & Leveling System Tables
    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_xp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 0,
        messages_sent INTEGER DEFAULT 0,
        voice_minutes INTEGER DEFAULT 0,
        last_xp_gain INTEGER DEFAULT 0,
        UNIQUE(guild_id, user_id)
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS level_rewards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        level INTEGER NOT NULL,
        role_id TEXT NOT NULL,
        UNIQUE(guild_id, level)
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS xp_config (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 1,
        xp_per_message INTEGER DEFAULT 15,
        xp_per_minute_voice INTEGER DEFAULT 10,
        xp_cooldown INTEGER DEFAULT 60000,
        level_up_channel TEXT,
        level_up_message TEXT DEFAULT 'GG {user}, you just advanced to level {level}!',
        stack_rewards INTEGER DEFAULT 0,
        ignored_channels TEXT,
        ignored_roles TEXT,
        multiplier_roles TEXT
      )
    `);

    // Achievements & Badges System
    this.db.run(`
      CREATE TABLE IF NOT EXISTS achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        achievement_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        icon TEXT NOT NULL,
        requirement_type TEXT NOT NULL,
        requirement_value INTEGER NOT NULL,
        reward_xp INTEGER DEFAULT 0,
        reward_role TEXT,
        rarity TEXT DEFAULT 'common',
        seasonal INTEGER DEFAULT 0
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        achievement_id TEXT NOT NULL,
        unlocked_at INTEGER NOT NULL,
        UNIQUE(guild_id, user_id, achievement_id)
      )
    `);

    // Seasonal Events
    this.db.run(`
      CREATE TABLE IF NOT EXISTS seasonal_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        start_date INTEGER NOT NULL,
        end_date INTEGER NOT NULL,
        theme_color TEXT DEFAULT '#667eea',
        active INTEGER DEFAULT 0
      )
    `);

    // Server Events Calendar
    this.db.run(`
      CREATE TABLE IF NOT EXISTS server_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        event_name TEXT NOT NULL,
        description TEXT,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        host_id TEXT NOT NULL,
        channel_id TEXT,
        max_participants INTEGER,
        created_at INTEGER NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS event_rsvp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT DEFAULT 'going',
        rsvp_time INTEGER NOT NULL,
        UNIQUE(event_id, user_id),
        FOREIGN KEY(event_id) REFERENCES server_events(id)
      )
    `);

    // Platform Integrations
    this.db.run(`
      CREATE TABLE IF NOT EXISTS integrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        config TEXT,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        UNIQUE(guild_id, platform, channel_id)
      )
    `);

    // Enhanced Polls
    this.db.run(`
      CREATE TABLE IF NOT EXISTS polls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE NOT NULL,
        channel_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        question TEXT NOT NULL,
        options TEXT NOT NULL,
        creator_id TEXT NOT NULL,
        duration INTEGER NOT NULL,
        anonymous INTEGER DEFAULT 0,
        multiple_choice INTEGER DEFAULT 0,
        end_time INTEGER NOT NULL,
        active INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);
  }

  // Server config methods
  async getServerConfig(guildId) {
    // Check Redis cache first, then memory cache
    const cacheKey = `config_${guildId}`;

    // Try Redis first
    const redisCached = await redisCache.get(cacheKey);
    if (redisCached) return redisCached;

    // Try memory cache
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM server_config WHERE guild_id = ?",
        [guildId],
        (err, row) => {
          if (err) reject(err);
          else {
            const config = row || null;
            if (config) {
              // Cache in both Redis and memory
              redisCache.set(cacheKey, config, 300).catch(() => {}); // 5 min
              cache.set(cacheKey, config, 300000);
            }
            resolve(config);
          }
        }
      );
    });
  }

  async setServerConfig(guildId, data) {
    // Clear both Redis and memory cache when config changes
    const cacheKey = `config_${guildId}`;
    await redisCache.del(cacheKey).catch(() => {});
    cache.delete(cacheKey);

    // WHITELIST allowed config keys (prevent SQL injection)
    const ALLOWED_CONFIG_KEYS = [
      "anti_raid_enabled",
      "anti_nuke_enabled",
      "heat_system_enabled",
      "auto_mod_enabled",
      "join_gate_enabled",
      "verification_enabled",
      "mod_log_channel",
      "alert_channel",
      "welcome_channel",
      "log_channel",
      "mod_role",
      "admin_role",
      "mute_role",
      "verification_role",
      "ticket_category",
      "max_joins",
      "join_time_window",
      "raid_action",
      "account_age_requirement",
      "verification_timeout",
      "heat_threshold",
      "auto_mod_spam",
      "auto_mod_links",
      "auto_mod_invites",
      "auto_mod_caps",
      "auto_mod_mentions",
      "snapshot_interval",
    ];

    // Filter data to only allowed keys
    const filteredData = {};
    for (const [key, value] of Object.entries(data)) {
      if (ALLOWED_CONFIG_KEYS.includes(key)) {
        filteredData[key] = value;
      }
    }

    if (Object.keys(filteredData).length === 0) {
      return Promise.reject(new Error("No valid configuration keys provided"));
    }

    const keys = Object.keys(filteredData);
    const values = Object.values(filteredData);
    const placeholders = keys.map(() => "?").join(", ");
    const updateClause = keys.map((k) => `${k} = ?`).join(", ");

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO server_config (guild_id, ${keys.join(", ")}) 
                 VALUES (?, ${placeholders})
                 ON CONFLICT(guild_id) DO UPDATE SET ${updateClause}`,
        [guildId, ...values, ...values],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Moderation logs
  async addModLog(
    guildId,
    userId,
    moderatorId,
    action,
    reason,
    duration = null
  ) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO moderation_logs (guild_id, user_id, moderator_id, action, reason, timestamp, duration) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [guildId, userId, moderatorId, action, reason, Date.now(), duration],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getModLogs(guildId, userId = null, limit = 10) {
    return new Promise((resolve, reject) => {
      let query = "SELECT * FROM moderation_logs WHERE guild_id = ?";
      const params = [guildId];

      if (userId) {
        query += " AND user_id = ?";
        params.push(userId);
      }

      query += " ORDER BY timestamp DESC LIMIT ?";
      params.push(limit);

      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // Warnings
  async addWarning(guildId, userId, moderatorId, reason) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO warnings (guild_id, user_id, moderator_id, reason, timestamp) VALUES (?, ?, ?, ?, ?)",
        [guildId, userId, moderatorId, reason, Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getWarnings(guildId, userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY timestamp DESC",
        [guildId, userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async clearWarnings(guildId, userId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "DELETE FROM warnings WHERE guild_id = ? AND user_id = ?",
        [guildId, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Heat scores
  async getHeatScore(guildId, userId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT score FROM heat_scores WHERE guild_id = ? AND user_id = ?",
        [guildId, userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.score : 0);
        }
      );
    });
  }

  async setHeatScore(guildId, userId, score) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO heat_scores (guild_id, user_id, score, last_updated) 
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(guild_id, user_id) DO UPDATE SET score = ?, last_updated = ?`,
        [guildId, userId, score, Date.now(), score, Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Analytics
  async logAnalytics(guildId, eventType, data) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO analytics (guild_id, event_type, data, timestamp) VALUES (?, ?, ?, ?)",
        [guildId, eventType, JSON.stringify(data), Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Tickets
  async createTicket(guildId, channelId, userId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO tickets (guild_id, channel_id, user_id, created_at) VALUES (?, ?, ?, ?)",
        [guildId, channelId, userId, Date.now()],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getTicket(channelId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM tickets WHERE channel_id = ?",
        [channelId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  async closeTicket(channelId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE tickets SET status = ? WHERE channel_id = ?",
        ["closed", channelId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Reaction roles
  async addReactionRole(guildId, messageId, emoji, roleId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO reaction_roles (guild_id, message_id, emoji, role_id) VALUES (?, ?, ?, ?)",
        [guildId, messageId, emoji, roleId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getReactionRoles(messageId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM reaction_roles WHERE message_id = ?",
        [messageId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // User stats
  async updateUserStats(guildId, userId, field, increment = 1) {
    // Whitelist allowed fields to prevent SQL injection
    const allowedFields = ["messages_sent", "commands_used"];
    if (!allowedFields.includes(field)) {
      return Promise.reject(
        new Error(
          `Invalid field: ${field}. Allowed fields: ${allowedFields.join(", ")}`
        )
      );
    }

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO user_stats (guild_id, user_id, ${field}, last_active) 
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(guild_id, user_id) DO UPDATE SET ${field} = ${field} + ?, last_active = ?`,
        [guildId, userId, increment, Date.now(), increment, Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getUserStats(guildId, userId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM user_stats WHERE guild_id = ? AND user_id = ?",
        [guildId, userId],
        (err, row) => {
          if (err) reject(err);
          else
            resolve(
              row || { messages_sent: 0, commands_used: 0, last_active: null }
            );
        }
      );
    });
  }

  // Workflows
  async createWorkflow(
    guildId,
    name,
    description,
    triggerType,
    triggerConfig,
    actions,
    createdBy
  ) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO workflows (guild_id, name, description, trigger_type, trigger_config, actions, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          guildId,
          name,
          description,
          triggerType,
          JSON.stringify(triggerConfig),
          JSON.stringify(actions),
          createdBy,
          Date.now(),
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getWorkflows(guildId, enabledOnly = false) {
    return new Promise((resolve, reject) => {
      const query = enabledOnly
        ? "SELECT * FROM workflows WHERE guild_id = ? AND enabled = 1"
        : "SELECT * FROM workflows WHERE guild_id = ?";
      this.db.all(query, [guildId], (err, rows) => {
        if (err) reject(err);
        else {
          const workflows = (rows || []).map((row) => ({
            ...row,
            trigger_config: JSON.parse(row.trigger_config || "{}"),
            actions: JSON.parse(row.actions || "[]"),
          }));
          resolve(workflows);
        }
      });
    });
  }

  async updateWorkflow(workflowId, updates) {
    // WHITELIST allowed workflow fields (prevent SQL injection)
    const ALLOWED_WORKFLOW_FIELDS = [
      "name",
      "description",
      "enabled",
      "trigger_type",
      "trigger_config",
      "actions",
      "cooldown",
      "priority",
      "updated_at",
    ];

    // Filter updates to only allowed fields
    const filteredUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (ALLOWED_WORKFLOW_FIELDS.includes(key)) {
        filteredUpdates[key] = value;
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return Promise.reject(new Error("No valid workflow fields to update"));
    }

    const keys = Object.keys(filteredUpdates);
    const values = Object.values(filteredUpdates);
    const setClause = keys.map((k) => `${k} = ?`).join(", ");

    const processedValues = values.map((v) => {
      if (typeof v === "object" && v !== null && !Array.isArray(v))
        return JSON.stringify(v);
      return v;
    });

    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE workflows SET ${setClause} WHERE id = ?`,
        [...processedValues, workflowId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async deleteWorkflow(workflowId) {
    return new Promise((resolve, reject) => {
      this.db.run("DELETE FROM workflows WHERE id = ?", [workflowId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Enhanced logging
  async addEnhancedLog(
    guildId,
    logType,
    category,
    userId,
    moderatorId,
    action,
    details,
    metadata,
    severity = "info"
  ) {
    const indexedData = JSON.stringify({
      user_id: userId,
      moderator_id: moderatorId,
      action: action,
      category: category,
      severity: severity,
    });

    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO enhanced_logs (guild_id, log_type, category, user_id, moderator_id, action, details, metadata, severity, timestamp, indexed_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          guildId,
          logType,
          category,
          userId,
          moderatorId,
          action,
          details,
          JSON.stringify(metadata || {}),
          severity,
          Date.now(),
          indexedData,
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async searchLogs(guildId, filters = {}) {
    let query = "SELECT * FROM enhanced_logs WHERE guild_id = ?";
    const params = [guildId];

    if (filters.category) {
      query += " AND category = ?";
      params.push(filters.category);
    }
    if (filters.severity) {
      query += " AND severity = ?";
      params.push(filters.severity);
    }
    if (filters.userId) {
      query += " AND user_id = ?";
      params.push(filters.userId);
    }
    if (filters.action) {
      query += " AND action = ?";
      params.push(filters.action);
    }
    if (filters.startTime) {
      query += " AND timestamp >= ?";
      params.push(filters.startTime);
    }
    if (filters.endTime) {
      query += " AND timestamp <= ?";
      params.push(filters.endTime);
    }
    if (filters.searchText) {
      query += " AND (details LIKE ? OR action LIKE ?)";
      const searchTerm = `%${filters.searchText}%`;
      params.push(searchTerm, searchTerm);
    }

    query += " ORDER BY timestamp DESC LIMIT ?";
    params.push(filters.limit || 100);

    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else {
          const logs = (rows || []).map((row) => ({
            ...row,
            metadata: JSON.parse(row.metadata || "{}"),
          }));
          resolve(logs);
        }
      });
    });
  }

  // AI Learning
  async recordPattern(guildId, userId, patternType, patternData, confidence) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO ai_learning (guild_id, user_id, pattern_type, pattern_data, confidence, last_seen, occurrences)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(guild_id, user_id, pattern_type) DO UPDATE SET
         pattern_data = ?,
         confidence = ?,
         last_seen = ?,
         occurrences = occurrences + 1`,
        [
          guildId,
          userId,
          patternType,
          JSON.stringify(patternData),
          confidence,
          Date.now(),
          JSON.stringify(patternData),
          confidence,
          Date.now(),
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getPatterns(guildId, userId = null, patternType = null) {
    let query = "SELECT * FROM ai_learning WHERE guild_id = ?";
    const params = [guildId];

    if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }
    if (patternType) {
      query += " AND pattern_type = ?";
      params.push(patternType);
    }

    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else {
          const patterns = (rows || []).map((row) => ({
            ...row,
            pattern_data: JSON.parse(row.pattern_data || "{}"),
          }));
          resolve(patterns);
        }
      });
    });
  }

  // API Keys
  async createAPIKey(
    guildId,
    keyHash,
    name,
    permissions,
    createdBy,
    expiresAt = null
  ) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO api_keys (guild_id, key_hash, name, permissions, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          guildId,
          keyHash,
          name,
          JSON.stringify(permissions),
          createdBy,
          Date.now(),
          expiresAt,
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getAPIKey(keyHash) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM api_keys WHERE key_hash = ? AND enabled = 1",
        [keyHash],
        (err, row) => {
          if (err) reject(err);
          else {
            if (row) {
              if (row.expires_at && Date.now() > row.expires_at) {
                resolve(null);
              } else {
                row.permissions = JSON.parse(row.permissions || "[]");
                resolve(row);
              }
            } else {
              resolve(null);
            }
          }
        }
      );
    });
  }

  async updateAPIKey(keyId, updates) {
    // WHITELIST allowed API key fields (prevent SQL injection)
    const ALLOWED_API_KEY_FIELDS = [
      "name",
      "rate_limit",
      "enabled",
      "last_used",
      "requests_today",
      "total_requests",
      "discord_user_id",
    ];

    // Filter updates to only allowed fields
    const filteredUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (ALLOWED_API_KEY_FIELDS.includes(key)) {
        filteredUpdates[key] = value;
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return Promise.reject(new Error("No valid API key fields to update"));
    }

    const keys = Object.keys(filteredUpdates);
    const values = Object.values(filteredUpdates);
    const setClause = keys.map((k) => `${k} = ?`).join(", ");

    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE api_keys SET ${setClause} WHERE id = ?`,
        [...values, keyId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async updateAPIKeyUsage(keyHash) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE api_keys SET last_used = ? WHERE key_hash = ?",
        [Date.now(), keyHash],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async logAPIRequest(
    apiKeyId,
    guildId,
    endpoint,
    method,
    ipAddress,
    userAgent,
    requestData,
    responseStatus,
    dataAccessed,
    permissionsUsed,
    createdByUserId
  ) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO api_audit_logs (api_key_id, guild_id, endpoint, method, ip_address, user_agent, request_data, response_status, data_accessed, permissions_used, timestamp, created_by_user_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          apiKeyId,
          guildId,
          endpoint,
          method,
          ipAddress,
          userAgent,
          JSON.stringify(requestData || {}),
          responseStatus,
          JSON.stringify(dataAccessed || []),
          JSON.stringify(permissionsUsed || []),
          Date.now(),
          createdByUserId,
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getAPIAuditLogs(guildId, limit = 100, offset = 0) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT al.*, ak.name as api_key_name, ak.permissions as api_key_permissions 
         FROM api_audit_logs al 
         LEFT JOIN api_keys ak ON al.api_key_id = ak.id 
         WHERE al.guild_id = ? 
         ORDER BY al.timestamp DESC 
         LIMIT ? OFFSET ?`,
        [guildId, limit, offset],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async getAPIKeys(guildId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM api_keys WHERE guild_id = ?",
        [guildId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const keys = (rows || []).map((row) => ({
              ...row,
              permissions: JSON.parse(row.permissions || "[]"),
            }));
            resolve(keys);
          }
        }
      );
    });
  }

  // Recommendations
  async createRecommendation(
    guildId,
    type,
    title,
    description,
    priority,
    actionData
  ) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO recommendations (guild_id, recommendation_type, title, description, priority, action_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          guildId,
          type,
          title,
          description,
          priority,
          JSON.stringify(actionData),
          Date.now(),
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getRecommendations(guildId, unacknowledgedOnly = true) {
    return new Promise((resolve, reject) => {
      const query = unacknowledgedOnly
        ? "SELECT * FROM recommendations WHERE guild_id = ? AND acknowledged = 0 ORDER BY priority DESC, created_at DESC"
        : "SELECT * FROM recommendations WHERE guild_id = ? ORDER BY priority DESC, created_at DESC";
      this.db.all(query, [guildId], (err, rows) => {
        if (err) reject(err);
        else {
          const recs = (rows || []).map((row) => ({
            ...row,
            action_data: JSON.parse(row.action_data || "{}"),
          }));
          resolve(recs);
        }
      });
    });
  }

  async acknowledgeRecommendation(recommendationId, userId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE recommendations SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ? WHERE id = ?",
        [userId, Date.now(), recommendationId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Notifications
  async createNotification(guildId, type, channelId, webhookUrl, filters) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO notifications (guild_id, notification_type, channel_id, webhook_url, filters, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
          guildId,
          type,
          channelId,
          webhookUrl,
          JSON.stringify(filters || {}),
          Date.now(),
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getNotifications(guildId, type = null) {
    return new Promise((resolve, reject) => {
      const query = type
        ? "SELECT * FROM notifications WHERE guild_id = ? AND notification_type = ? AND enabled = 1"
        : "SELECT * FROM notifications WHERE guild_id = ? AND enabled = 1";
      const params = type ? [guildId, type] : [guildId];
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else {
          const notifs = (rows || []).map((row) => ({
            ...row,
            filters: JSON.parse(row.filters || "{}"),
          }));
          resolve(notifs);
        }
      });
    });
  }

  // Behavioral data
  async recordBehavior(guildId, userId, behaviorType, data, timestamp) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO behavioral_data (guild_id, user_id, behavior_type, data, timestamp, confidence) VALUES (?, ?, ?, ?, ?, ?)",
        [guildId, userId, behaviorType, JSON.stringify(data), timestamp, 0.5],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getBehaviors(guildId, userId = null, behaviorType = null) {
    let query = "SELECT * FROM behavioral_data WHERE guild_id = ?";
    const params = [guildId];

    if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }
    if (behaviorType) {
      query += " AND behavior_type = ?";
      params.push(behaviorType);
    }

    query += " ORDER BY timestamp DESC LIMIT 100";

    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else {
          const behaviors = (rows || []).map((row) => ({
            ...row,
            data: JSON.parse(row.data || "{}"),
          }));
          resolve(behaviors);
        }
      });
    });
  }

  // Threat intelligence
  async reportThreat(userId, threatType, threatData, severity, sourceGuildId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO threat_intelligence (user_id, threat_type, threat_data, severity, source_guild_id, reported_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
          userId,
          threatType,
          JSON.stringify(threatData),
          severity,
          sourceGuildId,
          Date.now(),
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getThreatIntelligence(userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM threat_intelligence WHERE user_id = ? ORDER BY reported_at DESC",
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const threats = (rows || []).map((row) => ({
              ...row,
              threat_data: JSON.parse(row.threat_data || "{}"),
            }));
            resolve(threats);
          }
        }
      );
    });
  }

  async verifyThreat(threatId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE threat_intelligence SET verified = 1, verification_count = verification_count + 1 WHERE id = ?",
        [threatId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Recovery snapshots
  async createRecoverySnapshot(
    guildId,
    snapshotType,
    snapshotData,
    triggeredBy,
    reason
  ) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO recovery_snapshots (guild_id, snapshot_type, snapshot_data, created_at, triggered_by, reason) VALUES (?, ?, ?, ?, ?, ?)",
        [
          guildId,
          snapshotType,
          JSON.stringify(snapshotData),
          Date.now(),
          triggeredBy,
          reason,
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getRecoverySnapshots(guildId, limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM recovery_snapshots WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?",
        [guildId, limit],
        (err, rows) => {
          if (err) reject(err);
          else {
            const snapshots = (rows || []).map((row) => ({
              ...row,
              snapshot_data: JSON.parse(row.snapshot_data || "{}"),
            }));
            resolve(snapshots);
          }
        }
      );
    });
  }

  // Moderation queue
  async addToModQueue(
    guildId,
    userId,
    actionType,
    reason,
    priority,
    context,
    suggestedAction
  ) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO moderation_queue (guild_id, user_id, action_type, reason, priority, context, suggested_action, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          guildId,
          userId,
          actionType,
          reason,
          priority,
          JSON.stringify(context || {}),
          suggestedAction,
          Date.now(),
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getModQueue(guildId, unprocessedOnly = true) {
    return new Promise((resolve, reject) => {
      const query = unprocessedOnly
        ? "SELECT * FROM moderation_queue WHERE guild_id = ? AND processed = 0 ORDER BY priority DESC, created_at ASC"
        : "SELECT * FROM moderation_queue WHERE guild_id = ? ORDER BY priority DESC, created_at DESC LIMIT 50";
      this.db.all(query, [guildId], (err, rows) => {
        if (err) reject(err);
        else {
          const queue = (rows || []).map((row) => ({
            ...row,
            context: JSON.parse(row.context || "{}"),
          }));
          resolve(queue);
        }
      });
    });
  }

  async processModQueueItem(queueId, processedBy) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE moderation_queue SET processed = 1, processed_by = ?, processed_at = ? WHERE id = ?",
        [processedBy, Date.now(), queueId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Reports
  async createReport(
    guildId,
    reportType,
    periodStart,
    periodEnd,
    reportData,
    generatedBy
  ) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO reports (guild_id, report_type, period_start, period_end, report_data, generated_at, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          guildId,
          reportType,
          periodStart,
          periodEnd,
          JSON.stringify(reportData),
          Date.now(),
          generatedBy,
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getReports(guildId, reportType = null, limit = 10) {
    return new Promise((resolve, reject) => {
      const query = reportType
        ? "SELECT * FROM reports WHERE guild_id = ? AND report_type = ? ORDER BY generated_at DESC LIMIT ?"
        : "SELECT * FROM reports WHERE guild_id = ? ORDER BY generated_at DESC LIMIT ?";
      const params = reportType
        ? [guildId, reportType, limit]
        : [guildId, limit];
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else {
          const reports = (rows || []).map((row) => ({
            ...row,
            report_data: JSON.parse(row.report_data || "{}"),
          }));
          resolve(reports);
        }
      });
    });
  }

  // Recommendations
  async createRecommendation(
    guildId,
    type,
    title,
    description,
    priority,
    actionData
  ) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO recommendations (guild_id, recommendation_type, title, description, priority, action_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          guildId,
          type,
          title,
          description,
          priority,
          JSON.stringify(actionData),
          Date.now(),
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getRecommendations(guildId, unacknowledgedOnly = true) {
    return new Promise((resolve, reject) => {
      const query = unacknowledgedOnly
        ? "SELECT * FROM recommendations WHERE guild_id = ? AND acknowledged = 0 ORDER BY priority DESC, created_at DESC"
        : "SELECT * FROM recommendations WHERE guild_id = ? ORDER BY priority DESC, created_at DESC";
      this.db.all(query, [guildId], (err, rows) => {
        if (err) reject(err);
        else {
          const recs = (rows || []).map((row) => ({
            ...row,
            action_data: JSON.parse(row.action_data || "{}"),
          }));
          resolve(recs);
        }
      });
    });
  }

  async acknowledgeRecommendation(recommendationId, userId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE recommendations SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ? WHERE id = ?",
        [userId, Date.now(), recommendationId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Notifications
  async createNotification(guildId, type, channelId, webhookUrl, filters) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO notifications (guild_id, notification_type, channel_id, webhook_url, filters, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
          guildId,
          type,
          channelId,
          webhookUrl,
          JSON.stringify(filters || {}),
          Date.now(),
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getNotifications(guildId, type = null) {
    return new Promise((resolve, reject) => {
      const query = type
        ? "SELECT * FROM notifications WHERE guild_id = ? AND notification_type = ? AND enabled = 1"
        : "SELECT * FROM notifications WHERE guild_id = ? AND enabled = 1";
      const params = type ? [guildId, type] : [guildId];
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else {
          const notifs = (rows || []).map((row) => ({
            ...row,
            filters: JSON.parse(row.filters || "{}"),
          }));
          resolve(notifs);
        }
      });
    });
  }

  // Behavioral data
  async recordBehavior(guildId, userId, behaviorType, data, timestamp) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO behavioral_data (guild_id, user_id, behavior_type, data, timestamp, confidence) VALUES (?, ?, ?, ?, ?, ?)",
        [guildId, userId, behaviorType, JSON.stringify(data), timestamp, 0.5],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getBehaviors(guildId, userId = null, behaviorType = null) {
    let query = "SELECT * FROM behavioral_data WHERE guild_id = ?";
    const params = [guildId];

    if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }
    if (behaviorType) {
      query += " AND behavior_type = ?";
      params.push(behaviorType);
    }

    query += " ORDER BY timestamp DESC LIMIT 100";

    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else {
          const behaviors = (rows || []).map((row) => ({
            ...row,
            data: JSON.parse(row.data || "{}"),
          }));
          resolve(behaviors);
        }
      });
    });
  }

  // Threat intelligence
  async reportThreat(userId, threatType, threatData, severity, sourceGuildId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO threat_intelligence (user_id, threat_type, threat_data, severity, source_guild_id, reported_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
          userId,
          threatType,
          JSON.stringify(threatData),
          severity,
          sourceGuildId,
          Date.now(),
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getThreatIntelligence(userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM threat_intelligence WHERE user_id = ? ORDER BY reported_at DESC",
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const threats = (rows || []).map((row) => ({
              ...row,
              threat_data: JSON.parse(row.threat_data || "{}"),
            }));
            resolve(threats);
          }
        }
      );
    });
  }

  async verifyThreat(threatId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE threat_intelligence SET verified = 1, verification_count = verification_count + 1 WHERE id = ?",
        [threatId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Recovery snapshots
  async createRecoverySnapshot(
    guildId,
    snapshotType,
    snapshotData,
    triggeredBy,
    reason
  ) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO recovery_snapshots (guild_id, snapshot_type, snapshot_data, created_at, triggered_by, reason) VALUES (?, ?, ?, ?, ?, ?)",
        [
          guildId,
          snapshotType,
          JSON.stringify(snapshotData),
          Date.now(),
          triggeredBy,
          reason,
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getRecoverySnapshots(guildId, limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM recovery_snapshots WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?",
        [guildId, limit],
        (err, rows) => {
          if (err) reject(err);
          else {
            const snapshots = (rows || []).map((row) => ({
              ...row,
              snapshot_data: JSON.parse(row.snapshot_data || "{}"),
            }));
            resolve(snapshots);
          }
        }
      );
    });
  }

  // Moderation queue
  async addToModQueue(
    guildId,
    userId,
    actionType,
    reason,
    priority,
    context,
    suggestedAction
  ) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO moderation_queue (guild_id, user_id, action_type, reason, priority, context, suggested_action, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          guildId,
          userId,
          actionType,
          reason,
          priority,
          JSON.stringify(context || {}),
          suggestedAction,
          Date.now(),
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getModQueue(guildId, unprocessedOnly = true) {
    return new Promise((resolve, reject) => {
      const query = unprocessedOnly
        ? "SELECT * FROM moderation_queue WHERE guild_id = ? AND processed = 0 ORDER BY priority DESC, created_at ASC"
        : "SELECT * FROM moderation_queue WHERE guild_id = ? ORDER BY priority DESC, created_at DESC LIMIT 50";
      this.db.all(query, [guildId], (err, rows) => {
        if (err) reject(err);
        else {
          const queue = (rows || []).map((row) => ({
            ...row,
            context: JSON.parse(row.context || "{}"),
          }));
          resolve(queue);
        }
      });
    });
  }

  async processModQueueItem(queueId, processedBy) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE moderation_queue SET processed = 1, processed_by = ?, processed_at = ? WHERE id = ?",
        [processedBy, Date.now(), queueId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Reports
  async createReport(
    guildId,
    reportType,
    periodStart,
    periodEnd,
    reportData,
    generatedBy
  ) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO reports (guild_id, report_type, period_start, period_end, report_data, generated_at, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          guildId,
          reportType,
          periodStart,
          periodEnd,
          JSON.stringify(reportData),
          Date.now(),
          generatedBy,
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getReports(guildId, reportType = null, limit = 10) {
    return new Promise((resolve, reject) => {
      const query = reportType
        ? "SELECT * FROM reports WHERE guild_id = ? AND report_type = ? ORDER BY generated_at DESC LIMIT ?"
        : "SELECT * FROM reports WHERE guild_id = ? ORDER BY generated_at DESC LIMIT ?";
      const params = reportType
        ? [guildId, reportType, limit]
        : [guildId, limit];
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else {
          const reports = (rows || []).map((row) => ({
            ...row,
            report_data: JSON.parse(row.report_data || "{}"),
          }));
          resolve(reports);
        }
      });
    });
  }

  // Threat sensitivity settings
  async getThreatSensitivity(guildId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM threat_sensitivity WHERE guild_id = ?",
        [guildId],
        (err, row) => {
          if (err) reject(err);
          else {
            if (row) {
              resolve(row);
            } else {
              // Return defaults
              resolve({
                guild_id: guildId,
                risk_threshold: 30,
                severity_critical: 40,
                severity_high: 30,
                severity_medium: 20,
                severity_low: 10,
                recent_multiplier: 5,
                recent_days: 7,
              });
            }
          }
        }
      );
    });
  }

  // Whitelist functions (EXCEEDS WICK - prevents false positives)
  async getWhitelistedUsers(guildId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM security_whitelist WHERE guild_id = ?",
        [guildId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async addToWhitelist(guildId, userId, reason = null, addedBy = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT OR IGNORE INTO security_whitelist (guild_id, user_id) VALUES (?, ?)",
        [guildId, userId],
        (err) => {
          if (err) reject(err);
          else resolve(true);
        }
      );
    });
  }

  async removeFromWhitelist(guildId, userId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "DELETE FROM security_whitelist WHERE guild_id = ? AND user_id = ?",
        [guildId, userId],
        (err) => {
          if (err) reject(err);
          else resolve(true);
        }
      );
    });
  }

  async setThreatSensitivity(guildId, settings) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO threat_sensitivity (
          guild_id, risk_threshold, severity_critical, severity_high,
          severity_medium, severity_low, recent_multiplier, recent_days
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          risk_threshold = excluded.risk_threshold,
          severity_critical = excluded.severity_critical,
          severity_high = excluded.severity_high,
          severity_medium = excluded.severity_medium,
          severity_low = excluded.severity_low,
          recent_multiplier = excluded.recent_multiplier,
          recent_days = excluded.recent_days`,
        [
          guildId,
          settings.risk_threshold || 30,
          settings.severity_critical || 40,
          settings.severity_high || 30,
          settings.severity_medium || 20,
          settings.severity_low || 10,
          settings.recent_multiplier || 5,
          settings.recent_days || 7,
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // API Analytics Methods
  async getRecentSecurityEvents(limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT guild_id, action_type, timestamp, details 
         FROM security_logs 
         ORDER BY timestamp DESC 
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async getGlobalSecurityStats() {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT 
          COUNT(*) as totalEvents,
          SUM(CASE WHEN action_type = 'ban' THEN 1 ELSE 0 END) as totalBans,
          SUM(CASE WHEN action_type = 'kick' THEN 1 ELSE 0 END) as totalKicks,
          SUM(CASE WHEN action_type = 'raid_detected' THEN 1 ELSE 0 END) as raidsDetected,
          SUM(CASE WHEN action_type = 'nuke_prevented' THEN 1 ELSE 0 END) as nukesPrevented
         FROM security_logs`,
        [],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || {});
        }
      );
    });
  }

  async getProtectedServersCount() {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT COUNT(*) as count 
         FROM server_config 
         WHERE anti_nuke_enabled = 1 OR anti_raid_enabled = 1`,
        [],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.count || 0);
        }
      );
    });
  }

  async getAverageSecurityScore() {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT AVG(
          (CASE WHEN anti_nuke_enabled = 1 THEN 25 ELSE 0 END) +
          (CASE WHEN anti_raid_enabled = 1 THEN 25 ELSE 0 END) +
          (CASE WHEN auto_mod_enabled = 1 THEN 25 ELSE 0 END) +
          (CASE WHEN mod_log_channel IS NOT NULL THEN 25 ELSE 0 END)
        ) as avgScore
         FROM server_config`,
        [],
        (err, row) => {
          if (err) reject(err);
          else resolve(Math.round(row?.avgScore || 0));
        }
      );
    });
  }

  async getActiveThreatsCount() {
    return new Promise((resolve, reject) => {
      const oneDayAgo = Date.now() - 86400000;
      this.db.get(
        `SELECT COUNT(*) as count 
         FROM security_logs 
         WHERE timestamp > ? 
         AND (action_type = 'raid_detected' OR action_type = 'nuke_attempt')`,
        [oneDayAgo],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.count || 0);
        }
      );
    });
  }

  async getServersWithFeatureCount(featureColumn) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT COUNT(*) as count 
         FROM server_config 
         WHERE ${featureColumn} = 1`,
        [],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.count || 0);
        }
      );
    });
  }

  // API Key Management
  async createAPIKey(
    discordUserId,
    discordUsername,
    email,
    purpose,
    createdByAdmin = "Manual",
    notes = ""
  ) {
    const crypto = require("crypto");
    const key = "nx_" + crypto.randomBytes(32).toString("hex");

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO api_keys (api_key, discord_user_id, discord_username, email, purpose, created_at, created_by_admin, notes) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          key,
          discordUserId,
          discordUsername,
          email,
          purpose,
          Date.now(),
          createdByAdmin,
          notes,
        ],
        (err) => {
          if (err) reject(err);
          else resolve(key);
        }
      );
    });
  }

  async validateAPIKey(key, discordUserId = null) {
    return new Promise((resolve, reject) => {
      let query = `SELECT * FROM api_keys WHERE api_key = ? AND is_active = 1`;
      let params = [key];

      // If Discord user ID provided, verify it matches
      if (discordUserId) {
        query += ` AND discord_user_id = ?`;
        params.push(discordUserId);
      }

      this.db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async checkRateLimit(key, limit = 100) {
    return new Promise((resolve, reject) => {
      // Reset daily counter if it's a new day
      const today = new Date().setHours(0, 0, 0, 0);

      this.db.get(
        `SELECT * FROM api_keys WHERE api_key = ?`,
        [key],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (!row) {
            resolve({ allowed: false, reason: "Invalid API key" });
            return;
          }

          // Check if we need to reset the daily counter
          const lastUsed = row.last_used || 0;
          const lastUsedDay = new Date(lastUsed).setHours(0, 0, 0, 0);

          if (lastUsedDay < today) {
            // New day, reset counter
            this.db.run(
              `UPDATE api_keys SET requests_today = 1, last_used = ?, total_requests = total_requests + 1 WHERE api_key = ?`,
              [Date.now(), key],
              (err) => {
                if (err) reject(err);
                else resolve({ allowed: true, remaining: row.rate_limit - 1 });
              }
            );
          } else if (row.requests_today >= row.rate_limit) {
            // Rate limit exceeded
            resolve({
              allowed: false,
              reason: "Rate limit exceeded",
              limit: row.rate_limit,
            });
          } else {
            // Increment counter
            this.db.run(
              `UPDATE api_keys SET requests_today = requests_today + 1, last_used = ?, total_requests = total_requests + 1 WHERE api_key = ?`,
              [Date.now(), key],
              (err) => {
                if (err) reject(err);
                else
                  resolve({
                    allowed: true,
                    remaining: row.rate_limit - row.requests_today - 1,
                  });
              }
            );
          }
        }
      );
    });
  }

  async logAPIRequest(key, endpoint, ipAddress, discordUserId = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO api_requests (api_key, endpoint, timestamp, ip_address, discord_user_id) 
         VALUES (?, ?, ?, ?, ?)`,
        [key, endpoint, Date.now(), ipAddress, discordUserId],
        (err) => {
          if (err) reject(err);
          else resolve(true);
        }
      );
    });
  }

  // Get API usage for a specific user
  async getAPIUsage(discordUserId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM api_keys WHERE discord_user_id = ?`,
        [discordUserId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // List all API keys (admin only)
  async listAPIKeys() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT id, discord_user_id, discord_username, email, purpose, created_at, last_used, 
                rate_limit, requests_today, total_requests, is_active 
         FROM api_keys 
         ORDER BY created_at DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // IP Logging Functions
  async logIP(
    ipAddress,
    pageUrl,
    userAgent,
    referrer,
    sessionId,
    discordUserId = null,
    discordUsername = null
  ) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO ip_logs (ip_address, discord_user_id, discord_username, page_url, user_agent, referrer, timestamp, session_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ipAddress,
          discordUserId,
          discordUsername,
          pageUrl,
          userAgent,
          referrer,
          Date.now(),
          sessionId,
        ],
        (err) => {
          if (err) reject(err);
          else resolve(true);
        }
      );
    });
  }

  async getIPLogs(limit = 100) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM ip_logs ORDER BY timestamp DESC LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async getIPLogsByUser(discordUserId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM ip_logs WHERE discord_user_id = ? ORDER BY timestamp DESC`,
        [discordUserId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async getUniqueVisitors(since = null) {
    return new Promise((resolve, reject) => {
      let query = "SELECT COUNT(DISTINCT ip_address) as count FROM ip_logs";
      const params = [];

      if (since) {
        query += " WHERE timestamp > ?";
        params.push(since);
      }

      this.db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      });
    });
  }

  // ==================== INVITE SOURCE TRACKING ====================

  // Create invite source
  createInviteSource(source, description = null) {
    return new Promise((resolve, reject) => {
      const now = Date.now();
      this.db.run(
        "INSERT INTO invite_sources (source, description, created_at, updated_at) VALUES (?, ?, ?, ?)",
        [source, description, now, now],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, source, description });
        }
      );
    });
  }

  // Get all invite sources with retention stats
  getAllInviteSources() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT 
          s.*,
          COALESCE(AVG(l.days_active), 0) as avg_retention_days,
          COUNT(l.guild_id) as total_leaves
        FROM invite_sources s
        LEFT JOIN guild_leaves l ON s.source = l.source
        GROUP BY s.id
        ORDER BY s.total_joins DESC, s.created_at DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Delete invite source
  deleteInviteSource(source) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "DELETE FROM invite_sources WHERE source = ?",
        [source],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Track guild join with source
  trackGuildJoin(guildId, source, guildName, memberCount) {
    return new Promise((resolve, reject) => {
      const now = Date.now();

      // Insert guild tracking
      this.db.run(
        "INSERT OR REPLACE INTO guild_invite_tracking (guild_id, source, invited_at, guild_name, member_count) VALUES (?, ?, ?, ?, ?)",
        [guildId, source, now, guildName, memberCount],
        (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Increment total_joins for this source
          this.db.run(
            "UPDATE invite_sources SET total_joins = total_joins + 1, updated_at = ? WHERE source = ?",
            [now, source],
            (err2) => {
              if (err2) reject(err2);
              else resolve();
            }
          );
        }
      );
    });
  }

  // Get invite source stats
  getInviteSourceStats() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT 
          source,
          COUNT(*) as total_joins,
          MIN(invited_at) as first_join,
          MAX(invited_at) as last_join
        FROM guild_invite_tracking
        GROUP BY source
        ORDER BY total_joins DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Track pending invite source (before bot joins)
  trackPendingInviteSource(userId, source, ipAddress = null, userAgent = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO pending_invite_sources (user_id, source, timestamp, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)",
        [userId, source, Date.now(), ipAddress, userAgent],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Track invite link click (no user ID yet)
  trackInviteClick(
    source,
    ipAddress = null,
    userAgent = null,
    referrer = null
  ) {
    return new Promise((resolve, reject) => {
      const now = Date.now();

      // Store anonymously first, will be associated with user later
      this.db.run(
        "INSERT INTO pending_invite_sources (user_id, source, timestamp, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)",
        ["anonymous", source, now, ipAddress, userAgent],
        (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Also increment click count for this source
          this.db.run(
            "UPDATE invite_sources SET total_clicks = total_clicks + 1, updated_at = ? WHERE source = ?",
            [now, source],
            (err2) => {
              // Don't fail if source doesn't exist yet
              if (err2)
                console.log(
                  `[Invite Tracking] Note: Source '${source}' not found in invite_sources table`
                );
              resolve();
            }
          );
        }
      );
    });
  }

  // Advanced Automod Methods
  getAutomodConfig(guildId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM automod_config WHERE guild_id = ?",
        [guildId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  updateAutomodConfig(guildId, config) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];

      Object.keys(config).forEach((key) => {
        if (config[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(
            typeof config[key] === "object"
              ? JSON.stringify(config[key])
              : config[key]
          );
        }
      });

      values.push(guildId);

      const query = `INSERT INTO automod_config (guild_id, ${Object.keys(
        config
      ).join(", ")}) 
                     VALUES (?, ${Object.keys(config)
                       .map(() => "?")
                       .join(", ")})
                     ON CONFLICT(guild_id) DO UPDATE SET ${fields.join(", ")}`;

      this.db.run(
        query,
        [
          guildId,
          ...Object.values(config).map((v) =>
            typeof v === "object" ? JSON.stringify(v) : v
          ),
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  logAutomodViolation(
    guildId,
    userId,
    violationType,
    messageContent,
    actionTaken
  ) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO automod_violations (guild_id, user_id, violation_type, message_content, action_taken, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          guildId,
          userId,
          violationType,
          messageContent.substring(0, 1000),
          actionTaken,
          Date.now(),
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  getAutomodViolations(guildId, userId = null, limit = 50) {
    return new Promise((resolve, reject) => {
      const query = userId
        ? "SELECT * FROM automod_violations WHERE guild_id = ? AND user_id = ? ORDER BY timestamp DESC LIMIT ?"
        : "SELECT * FROM automod_violations WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?";

      const params = userId ? [guildId, userId, limit] : [guildId, limit];

      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // Member Screening Methods
  getMemberScreeningConfig(guildId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM member_screening_config WHERE guild_id = ?",
        [guildId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  updateMemberScreeningConfig(guildId, config) {
    return new Promise((resolve, reject) => {
      const fields = Object.keys(config)
        .map((k) => `${k} = ?`)
        .join(", ");
      const values = Object.values(config).map((v) =>
        typeof v === "object" ? JSON.stringify(v) : v
      );

      const insertFields = Object.keys(config).join(", ");
      const insertPlaceholders = Object.keys(config)
        .map(() => "?")
        .join(", ");

      const query = `INSERT INTO member_screening_config (guild_id, ${insertFields}) 
                     VALUES (?, ${insertPlaceholders})
                     ON CONFLICT(guild_id) DO UPDATE SET ${fields}`;

      this.db.run(query, [guildId, ...values], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  logMemberScreening(guildId, userId, action, reason, riskScore) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO member_screening_logs (guild_id, user_id, action, reason, risk_score, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [guildId, userId, action, reason, riskScore, Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  getMemberScreeningLogs(guildId, since = 0, limit = 100) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM member_screening_logs WHERE guild_id = ? AND timestamp > ? ORDER BY timestamp DESC LIMIT ?",
        [guildId, since, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Scheduled Actions Methods
  createScheduledAction(
    guildId,
    actionType,
    actionData,
    scheduleType,
    cronExpression,
    executeAt,
    createdBy
  ) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO scheduled_actions (guild_id, action_type, action_data, schedule_type, cron_expression, execute_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          guildId,
          actionType,
          JSON.stringify(actionData),
          scheduleType,
          cronExpression,
          executeAt,
          createdBy,
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  getAllScheduledActions() {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM scheduled_actions WHERE status = 'active'",
        [],
        (err, rows) => {
          if (err) {
            // Table might not exist yet or schema not updated - return empty array
            resolve([]);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  getGuildScheduledActions(guildId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM scheduled_actions WHERE guild_id = ? ORDER BY created_at DESC",
        [guildId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  getDueScheduledActions(now) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM scheduled_actions WHERE schedule_type = 'once' AND execute_at <= ? AND status = 'active'",
        [now],
        (err, rows) => {
          if (err) {
            // Table might not exist yet - return empty array
            resolve([]);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  updateScheduledActionStatus(actionId, status) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE scheduled_actions SET status = ? WHERE id = ?",
        [status, actionId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  deleteScheduledAction(actionId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "DELETE FROM scheduled_actions WHERE id = ?",
        [actionId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  logScheduledActionExecution(actionId, success, errorMessage = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO scheduled_action_executions (action_id, success, error_message)
         VALUES (?, ?, ?)`,
        [actionId, success ? 1 : 0, errorMessage],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Voice Monitoring Methods
  getVoiceMonitoringConfig(guildId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM voice_monitoring_config WHERE guild_id = ?",
        [guildId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  updateVoiceMonitoringConfig(guildId, config) {
    return new Promise((resolve, reject) => {
      const fields = Object.keys(config)
        .map((k) => `${k} = ?`)
        .join(", ");
      const values = Object.values(config);

      const insertFields = Object.keys(config).join(", ");
      const insertPlaceholders = Object.keys(config)
        .map(() => "?")
        .join(", ");

      const query = `INSERT INTO voice_monitoring_config (guild_id, ${insertFields}) 
                     VALUES (?, ${insertPlaceholders})
                     ON CONFLICT(guild_id) DO UPDATE SET ${fields}`;

      this.db.run(query, [guildId, ...values], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  logVoiceActivity(guildId, userId, channelId, action, sessionDuration = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO voice_activity_logs (guild_id, user_id, channel_id, action, session_duration, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [guildId, userId, channelId, action, sessionDuration, Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  updateVoiceSession(guildId, userId, channelId, duration) {
    return new Promise((resolve, reject) => {
      // Update the most recent join log with session duration
      this.db.run(
        `UPDATE voice_activity_logs SET session_duration = ? 
         WHERE guild_id = ? AND user_id = ? AND channel_id = ? AND action = 'join' 
         AND session_duration IS NULL
         ORDER BY timestamp DESC LIMIT 1`,
        [duration, guildId, userId, channelId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  getVoiceActivityLogs(guildId, since = 0, limit = 100) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM voice_activity_logs WHERE guild_id = ? AND timestamp > ? ORDER BY timestamp DESC LIMIT ?",
        [guildId, since, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Webhook Events Methods
  getWebhookSubscriptions(eventType = null) {
    return new Promise((resolve, reject) => {
      const query = eventType
        ? "SELECT * FROM webhook_subscriptions WHERE event_type = ? AND status = 'active'"
        : "SELECT * FROM webhook_subscriptions WHERE status = 'active'";

      const params = eventType ? [eventType] : [];

      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  getGuildWebhookSubscriptions(guildId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM webhook_subscriptions WHERE guild_id = ?",
        [guildId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  createWebhookSubscription(guildId, webhookUrl, eventType, createdBy) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO webhook_subscriptions (guild_id, webhook_url, event_type, created_by)
         VALUES (?, ?, ?, ?)`,
        [guildId, webhookUrl, eventType, createdBy],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  deleteWebhookSubscription(subscriptionId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "DELETE FROM webhook_subscriptions WHERE id = ?",
        [subscriptionId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  logWebhookDelivery(subscriptionId, success, statusCode, errorMessage = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO webhook_deliveries (subscription_id, success, status_code, error_message)
         VALUES (?, ?, ?, ?)`,
        [subscriptionId, success ? 1 : 0, statusCode, errorMessage],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  getWebhookDeliveryStats(subscriptionId, days = 7) {
    return new Promise((resolve, reject) => {
      const since = Date.now() - days * 24 * 60 * 60 * 1000;
      this.db.all(
        `SELECT success, COUNT(*) as count FROM webhook_deliveries 
         WHERE subscription_id = ? AND delivered_at > ?
         GROUP BY success`,
        [subscriptionId, since],
        (err, rows) => {
          if (err) reject(err);
          else {
            const stats = { success: 0, failed: 0, total: 0 };
            rows.forEach((row) => {
              if (row.success) stats.success = row.count;
              else stats.failed = row.count;
              stats.total += row.count;
            });
            resolve(stats);
          }
        }
      );
    });
  }

  // Multi-Server Network Methods
  createServerNetwork(networkName, ownerId) {
    return new Promise((resolve, reject) => {
      const defaultConfig = JSON.stringify({
        syncBans: true,
        syncWhitelist: true,
        syncBlacklist: true,
        sharedAnnouncements: false,
      });

      this.db.run(
        `INSERT INTO server_networks (network_name, owner_id, config) VALUES (?, ?, ?)`,
        [networkName, ownerId, defaultConfig],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  addGuildToNetwork(networkId, guildId, addedBy) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO network_guilds (network_id, guild_id, added_by) VALUES (?, ?, ?)`,
        [networkId, guildId, addedBy],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  removeGuildFromNetwork(networkId, guildId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM network_guilds WHERE network_id = ? AND guild_id = ?`,
        [networkId, guildId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  getServerNetwork(networkId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM server_networks WHERE id = ?",
        [networkId],
        async (err, network) => {
          if (err) {
            reject(err);
            return;
          }
          if (!network) {
            resolve(null);
            return;
          }

          // Get guilds in network
          this.db.all(
            "SELECT * FROM network_guilds WHERE network_id = ?",
            [networkId],
            (err, guilds) => {
              if (err) reject(err);
              else {
                network.guilds = guilds || [];
                network.config = JSON.parse(network.config);
                resolve(network);
              }
            }
          );
        }
      );
    });
  }

  getUserNetworks(userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM server_networks WHERE owner_id = ?",
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  addToNetworkWhitelist(networkId, userId, addedBy, reason) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO network_whitelist (network_id, user_id, added_by, reason) VALUES (?, ?, ?, ?)`,
        [networkId, userId, addedBy, reason],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  logNetworkAction(networkId, guildId, actionType, actionData) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO network_actions (network_id, guild_id, action_type, action_data) VALUES (?, ?, ?, ?)`,
        [networkId, guildId, actionType, JSON.stringify(actionData)],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // ==================== XP & LEVELING SYSTEM ====================

  // Get user XP data
  async getUserXP(guildId, userId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM user_xp WHERE guild_id = ? AND user_id = ?`,
        [guildId, userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  // Add XP to user
  async addUserXP(guildId, userId, xpAmount, source = "message") {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO user_xp (guild_id, user_id, xp, level, messages_sent, last_xp_gain)
         VALUES (?, ?, ?, 0, ?, ?)
         ON CONFLICT(guild_id, user_id) DO UPDATE SET
         xp = xp + ?,
         messages_sent = messages_sent + ?,
         last_xp_gain = ?`,
        [
          guildId,
          userId,
          xpAmount,
          source === "message" ? 1 : 0,
          Date.now(),
          xpAmount,
          source === "message" ? 1 : 0,
          Date.now(),
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Update user level
  async updateUserLevel(guildId, userId, newLevel) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE user_xp SET level = ? WHERE guild_id = ? AND user_id = ?`,
        [newLevel, guildId, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Get XP leaderboard
  async getXPLeaderboard(guildId, limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM user_xp WHERE guild_id = ? ORDER BY xp DESC LIMIT ?`,
        [guildId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Get XP config
  async getXPConfig(guildId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM xp_config WHERE guild_id = ?`,
        [guildId],
        (err, row) => {
          if (err) reject(err);
          else
            resolve(
              row || {
                guild_id: guildId,
                enabled: 1,
                xp_per_message: 15,
                xp_cooldown: 60000,
              }
            );
        }
      );
    });
  }

  // Update XP config
  async updateXPConfig(guildId, config) {
    const keys = Object.keys(config);
    const values = keys.map((k) => config[k]);

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO xp_config (guild_id, ${keys.join(", ")})
         VALUES (?, ${keys.map(() => "?").join(", ")})
         ON CONFLICT(guild_id) DO UPDATE SET ${keys
           .map((k) => `${k} = excluded.${k}`)
           .join(", ")}`,
        [guildId, ...values],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Level rewards
  async addLevelReward(guildId, level, roleId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO level_rewards (guild_id, level, role_id) VALUES (?, ?, ?)`,
        [guildId, level, roleId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getLevelRewards(guildId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM level_rewards WHERE guild_id = ? ORDER BY level ASC`,
        [guildId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async removeLevelReward(guildId, level) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM level_rewards WHERE guild_id = ? AND level = ?`,
        [guildId, level],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // ==================== ACHIEVEMENTS & BADGES ====================

  async unlockAchievement(guildId, userId, achievementId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR IGNORE INTO user_achievements (guild_id, user_id, achievement_id, unlocked_at)
         VALUES (?, ?, ?, ?)`,
        [guildId, userId, achievementId, Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getUserAchievements(guildId, userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT a.*, ua.unlocked_at 
         FROM user_achievements ua
         JOIN achievements a ON ua.achievement_id = a.achievement_id
         WHERE ua.guild_id = ? AND ua.user_id = ?
         ORDER BY ua.unlocked_at DESC`,
        [guildId, userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async getAllAchievements() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM achievements ORDER BY rarity, name`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // ==================== SERVER EVENTS ====================

  async createServerEvent(guildId, eventData) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO server_events (guild_id, event_name, description, start_time, end_time, host_id, channel_id, max_participants, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          guildId,
          eventData.name,
          eventData.description,
          eventData.startTime,
          eventData.endTime,
          eventData.hostId,
          eventData.channelId,
          eventData.maxParticipants,
          Date.now(),
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getServerEvents(guildId, upcoming = true) {
    return new Promise((resolve, reject) => {
      const query = upcoming
        ? `SELECT * FROM server_events WHERE guild_id = ? AND start_time > ? ORDER BY start_time ASC`
        : `SELECT * FROM server_events WHERE guild_id = ? ORDER BY start_time DESC`;
      const params = upcoming ? [guildId, Date.now()] : [guildId];

      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async rsvpToEvent(eventId, userId, status = "going") {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO event_rsvp (event_id, user_id, status, rsvp_time) VALUES (?, ?, ?, ?)`,
        [eventId, userId, status, Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getEventRSVPs(eventId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM event_rsvp WHERE event_id = ?`,
        [eventId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // ==================== PLATFORM INTEGRATIONS ====================

  async addIntegration(guildId, platform, channelId, config) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO integrations (guild_id, platform, channel_id, config, enabled, created_at)
         VALUES (?, ?, ?, ?, 1, ?)`,
        [guildId, platform, channelId, JSON.stringify(config), Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getIntegrations(guildId, platform = null) {
    return new Promise((resolve, reject) => {
      const query = platform
        ? `SELECT * FROM integrations WHERE guild_id = ? AND platform = ? AND enabled = 1`
        : `SELECT * FROM integrations WHERE guild_id = ? AND enabled = 1`;
      const params = platform ? [guildId, platform] : [guildId];

      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else {
          // Parse config JSON
          const integrations = (rows || []).map((row) => ({
            ...row,
            config: row.config ? JSON.parse(row.config) : {},
          }));
          resolve(integrations);
        }
      });
    });
  }

  async removeIntegration(guildId, platform, channelId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM integrations WHERE guild_id = ? AND platform = ? AND channel_id = ?`,
        [guildId, platform, channelId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }
}

module.exports = new Database();
