const axios = require("axios");
const db = require("./database");
const logger = require("./logger");

class WebhookEvents {
  constructor(client) {
    this.client = client;
    this.eventQueue = [];
    this.processing = false;

    // Process queue every 2 seconds
    setInterval(() => this.processQueue(), 2000);
  }

  /**
   * Emit an event to all subscribed webhooks
   */
  async emit(eventType, data) {
    const subscriptions = await db.getWebhookSubscriptions(eventType);

    for (const sub of subscriptions) {
      this.eventQueue.push({
        url: sub.webhook_url,
        eventType,
        data,
        guildId: sub.guild_id,
        subscriptionId: sub.id,
        attempts: 0,
      });
    }
  }

  async processQueue() {
    if (this.processing || this.eventQueue.length === 0) return;

    this.processing = true;

    try {
      const batch = this.eventQueue.splice(0, 10); // Process 10 at a time

      await Promise.allSettled(batch.map((event) => this.sendWebhook(event)));
    } catch (error) {
      logger.error("[WebhookEvents] Queue processing error:", error);
    }

    this.processing = false;
  }

  async sendWebhook(event) {
    try {
      const payload = {
        event: event.eventType,
        timestamp: Date.now(),
        guild_id: event.guildId,
        data: event.data,
      };

      const response = await axios.post(event.url, payload, {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Nexus-Bot-Webhooks/1.0",
        },
        timeout: 5000,
      });

      // Log successful delivery
      await db.logWebhookDelivery(event.subscriptionId, true, response.status);
    } catch (error) {
      event.attempts++;

      // Retry up to 3 times
      if (event.attempts < 3) {
        this.eventQueue.push(event);
      } else {
        // Log failed delivery after 3 attempts
        await db.logWebhookDelivery(
          event.subscriptionId,
          false,
          error.response?.status || 0,
          error.message
        );
        logger.warn(
          `[WebhookEvents] Failed to deliver ${event.eventType} after 3 attempts`
        );
      }
    }
  }

  /**
   * Subscribe a webhook URL to events
   */
  async subscribe(guildId, webhookUrl, events, createdBy) {
    // Validate webhook URL
    if (!webhookUrl.startsWith("https://")) {
      throw new Error("Webhook URL must use HTTPS");
    }

    // Test webhook
    try {
      await axios.post(
        webhookUrl,
        {
          event: "webhook_test",
          timestamp: Date.now(),
          message: "Nexus webhook subscription test",
        },
        { timeout: 5000 }
      );
    } catch (error) {
      throw new Error(`Webhook test failed: ${error.message}`);
    }

    // Create subscriptions for each event
    const subscriptionIds = [];
    for (const eventType of events) {
      const id = await db.createWebhookSubscription(
        guildId,
        webhookUrl,
        eventType,
        createdBy
      );
      subscriptionIds.push(id);
    }

    return subscriptionIds;
  }

  /**
   * Unsubscribe a webhook
   */
  async unsubscribe(subscriptionId) {
    await db.deleteWebhookSubscription(subscriptionId);
  }

  /**
   * Get available event types
   */
  getAvailableEvents() {
    return [
      "member_join",
      "member_leave",
      "member_ban",
      "member_kick",
      "message_delete",
      "message_bulk_delete",
      "channel_create",
      "channel_delete",
      "role_create",
      "role_delete",
      "raid_detected",
      "nuke_attempt",
      "threat_detected",
      "automod_violation",
      "screening_action",
      "voice_raid",
      "heat_threshold",
      "security_alert",
    ];
  }
}

module.exports = WebhookEvents;
