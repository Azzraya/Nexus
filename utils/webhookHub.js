// Webhook Integration Hub
// Send events to external services for custom integrations

const axios = require("axios");
const db = require("./database");
const logger = require("./logger");

class WebhookHub {
  constructor() {
    this.createTable();
  }

  createTable() {
    db.db.run(`
      CREATE TABLE IF NOT EXISTS webhook_integrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        webhook_url TEXT NOT NULL,
        events TEXT NOT NULL,
        name TEXT,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        last_triggered INTEGER,
        trigger_count INTEGER DEFAULT 0
      )
    `);
  }

  /**
   * Register a new webhook integration
   */
  async registerWebhook(guildId, webhookUrl, events, name) {
    return new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO webhook_integrations (guild_id, webhook_url, events, name) VALUES (?, ?, ?, ?)`,
        [guildId, webhookUrl, JSON.stringify(events), name],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }

  /**
   * Send event to all registered webhooks
   */
  async triggerEvent(guildId, eventType, eventData) {
    try {
      const webhooks = await this.getWebhooks(guildId);

      for (const webhook of webhooks) {
        if (!webhook.enabled) continue;

        const events = JSON.parse(webhook.events);
        if (!events.includes(eventType)) continue;

        // Send webhook
        try {
          await axios.post(
            webhook.webhook_url,
            {
              event: eventType,
              guildId,
              timestamp: Date.now(),
              data: eventData,
            },
            {
              headers: {
                "Content-Type": "application/json",
              },
              timeout: 5000,
            }
          );

          // Update trigger count
          await this.updateTriggerCount(webhook.id);

          logger.info(
            "Webhook Hub",
            `Triggered: ${webhook.name} for ${eventType}`
          );
        } catch (error) {
          logger.error(
            "Webhook Hub",
            `Failed to send to ${webhook.name}`,
            error
          );
        }
      }
    } catch (error) {
      logger.error("Webhook Hub", "Error triggering event", error);
    }
  }

  /**
   * Get all webhooks for a guild
   */
  async getWebhooks(guildId) {
    return new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM webhook_integrations WHERE guild_id = ?",
        [guildId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(id) {
    return new Promise((resolve, reject) => {
      db.db.run(
        "DELETE FROM webhook_integrations WHERE id = ?",
        [id],
        function (err) {
          if (err) reject(err);
          else resolve({ deleted: this.changes > 0 });
        }
      );
    });
  }

  /**
   * Toggle webhook enabled status
   */
  async toggleWebhook(id) {
    return new Promise((resolve, reject) => {
      db.db.run(
        "UPDATE webhook_integrations SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = ?",
        [id],
        function (err) {
          if (err) reject(err);
          else resolve({ updated: this.changes > 0 });
        }
      );
    });
  }

  async updateTriggerCount(id) {
    return new Promise((resolve, reject) => {
      db.db.run(
        "UPDATE webhook_integrations SET trigger_count = trigger_count + 1, last_triggered = ? WHERE id = ?",
        [Date.now(), id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Available event types
   */
  getAvailableEvents() {
    return [
      "member.join",
      "member.leave",
      "member.ban",
      "member.kick",
      "raid.detected",
      "nuke.detected",
      "threat.high",
      "server.health.critical",
      "command.executed",
      "config.changed",
    ];
  }
}

module.exports = new WebhookHub();
