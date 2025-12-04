/**
 * External Notifications Command
 * Send bot events to external webhooks (Zapier, Discord, etc.)
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const db = require("../utils/database");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("notifications")
    .setDescription("⚙️ Configure external webhook notifications")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Setup a webhook for notifications")
        .addStringOption((option) =>
          option
            .setName("webhook_url")
            .setDescription("Discord webhook URL or external webhook")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("events")
            .setDescription("Events to send (comma separated)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List configured webhooks")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a webhook")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("Webhook ID")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === "setup") {
        await this.setupWebhook(interaction);
      } else if (subcommand === "list") {
        await this.listWebhooks(interaction);
      } else if (subcommand === "delete") {
        await this.deleteWebhook(interaction);
      }
    } catch (error) {
      logger.error("Notifications Command Error:", error);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ An error occurred.",
          ephemeral: true,
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          content: "❌ An error occurred.",
        });
      }
    }
  },

  async setupWebhook(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const webhookUrl = interaction.options.getString("webhook_url");
    const events = interaction.options.getString("events") || "raid_blocked,nuke_attempt,member_banned";

    // Validate webhook URL
    try {
      new URL(webhookUrl);
    } catch (error) {
      return interaction.editReply({
        content: "❌ Invalid webhook URL format",
      });
    }

    // Create table
    await new Promise((resolve, reject) => {
      db.db.run(
        `CREATE TABLE IF NOT EXISTS external_webhooks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          webhook_url TEXT NOT NULL,
          events TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
        )`,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Save webhook
    await new Promise((resolve, reject) => {
      db.db.run(
        "INSERT INTO external_webhooks (guild_id, webhook_url, events) VALUES (?, ?, ?)",
        [interaction.guild.id, webhookUrl, events],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    const embed = new EmbedBuilder()
      .setTitle("✅ Webhook Configured")
      .setDescription("External notifications are now active!")
      .addFields(
        {
          name: "📡 Webhook URL",
          value: webhookUrl.substring(0, 50) + "...",
          inline: false,
        },
        {
          name: "📋 Events",
          value: events.split(",").map(e => `• ${e}`).join("\n"),
          inline: false,
        },
        {
          name: "💡 Available Events",
          value:
            "`raid_blocked`, `nuke_attempt`, `member_banned`, `member_kicked`, " +
            "`warning_issued`, `threat_detected`, `server_lockdown`, `backup_created`",
          inline: false,
        }
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    logger.info(
      `[Notifications] Webhook configured for ${interaction.guild.name}`
    );
  },

  async listWebhooks(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const webhooks = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM external_webhooks WHERE guild_id = ?",
        [interaction.guild.id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    if (webhooks.length === 0) {
      return interaction.editReply({
        content: "📋 No webhooks configured. Use `/notifications setup` to add one!",
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("📡 Configured Webhooks")
      .setColor(0x667eea)
      .setTimestamp();

    webhooks.forEach((w) => {
      embed.addFields({
        name: `Webhook #${w.id}`,
        value:
          `**URL:** ${w.webhook_url.substring(0, 40)}...\n` +
          `**Events:** ${w.events}\n` +
          `**Status:** ${w.enabled ? "✅ Enabled" : "❌ Disabled"}`,
        inline: false,
      });
    });

    await interaction.editReply({ embeds: [embed] });
  },

  async deleteWebhook(interaction) {
    const id = interaction.options.getInteger("id");

    await new Promise((resolve, reject) => {
      db.db.run(
        "DELETE FROM external_webhooks WHERE id = ? AND guild_id = ?",
        [id, interaction.guild.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await interaction.reply({
      content: `✅ Webhook #${id} deleted`,
      ephemeral: true,
    });
  },

  /**
   * Send event to external webhooks
   */
  async sendToWebhooks(guildId, eventType, data) {
    try {
      const webhooks = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM external_webhooks WHERE guild_id = ? AND enabled = 1",
          [guildId],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      for (const webhook of webhooks) {
        const events = webhook.events.split(",");
        if (events.includes(eventType)) {
          // Send to webhook
          const https = require("https");
const ErrorMessages = require("../utils/errorMessages");
          const url = new URL(webhook.webhook_url);
          
          const payload = {
            event: eventType,
            timestamp: Date.now(),
            data: data,
          };

          const postData = JSON.stringify(payload);
          const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(postData),
            },
          };

          const req = https.request(options);
          req.write(postData);
          req.end();

          logger.debug(
            `[Notifications] Sent ${eventType} to webhook for guild ${guildId}`
          );
        }
      }
    } catch (error) {
      logger.error("[Notifications] Error sending to webhooks:", error);
    }
  },
};

