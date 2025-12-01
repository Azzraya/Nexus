const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const logger = require("../utils/logger");
const axios = require("axios");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("webhook")
    .setDescription("Create and manage webhooks for external integrations")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a webhook for events")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Webhook name")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option.setName("url").setDescription("Webhook URL").setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("events")
            .setDescription("Comma-separated events to listen for")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List all webhooks")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("test")
        .setDescription("Test a webhook")
        .addIntegerOption((option) =>
          option.setName("id").setDescription("Webhook ID").setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a webhook")
        .addIntegerOption((option) =>
          option.setName("id").setDescription("Webhook ID").setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      await this.createWebhook(interaction);
    } else if (subcommand === "list") {
      await this.listWebhooks(interaction);
    } else if (subcommand === "test") {
      await this.testWebhook(interaction);
    } else if (subcommand === "delete") {
      await this.deleteWebhook(interaction);
    }
  },

  async createWebhook(interaction) {
    const name = interaction.options.getString("name");
    const url = interaction.options.getString("url");
    const eventsString = interaction.options.getString("events") || "all";

    // Validate URL
    try {
      new URL(url);
    } catch (error) {
      return interaction.reply({
        content:
          "❌ Invalid webhook URL. Please provide a valid HTTP/HTTPS URL.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const events = eventsString.split(",").map((e) => e.trim());

      // Store webhook (using notifications table or create new table)
      const webhookId = await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO notifications (guild_id, notification_type, webhook_url, channel_id, enabled) VALUES (?, ?, ?, ?, 1)",
          [interaction.guild.id, `webhook_${name}`, url, null],
          function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Webhook Created")
        .setDescription(`Webhook **${name}** has been created successfully`)
        .addFields(
          {
            name: "🔗 URL",
            value: url.substring(0, 50) + "...",
            inline: false,
          },
          {
            name: "📋 Events",
            value: events.length > 0 ? events.join(", ") : "All events",
            inline: false,
          },
          {
            name: "💡 Usage",
            value:
              "This webhook will receive events as JSON payloads. Check our documentation for payload formats.",
          }
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error creating webhook:", error);
      await interaction.editReply({
        content: "❌ An error occurred while creating the webhook.",
      });
    }
  },

  async listWebhooks(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const webhooks = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM notifications WHERE guild_id = ? AND webhook_url IS NOT NULL",
          [interaction.guild.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (webhooks.length === 0) {
        return interaction.editReply({
          content:
            "❌ No webhooks configured. Use `/webhook create` to create one.",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🔗 Webhooks")
        .setDescription(
          webhooks
            .map(
              (w) =>
                `**#${w.id}** - ${w.notification_type.replace(
                  "webhook_",
                  ""
                )}\n` +
                `URL: ${w.webhook_url?.substring(0, 40)}...\n` +
                `Status: ${w.enabled ? "✅ Active" : "❌ Disabled"}`
            )
            .join("\n\n")
        )
        .setColor(0x0099ff)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error listing webhooks:", error);
      await interaction.editReply({
        content: "❌ An error occurred while listing webhooks.",
      });
    }
  },

  async testWebhook(interaction) {
    const id = interaction.options.getInteger("id");

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const webhook = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM notifications WHERE id = ? AND guild_id = ? AND webhook_url IS NOT NULL",
          [id, interaction.guild.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!webhook) {
        return interaction.editReply({
          content: "❌ Webhook not found.",
        });
      }

      // Send test payload
      try {
        await axios.post(webhook.webhook_url, {
          event: "test",
          message: "This is a test webhook from Nexus Bot",
          timestamp: new Date().toISOString(),
          guild_id: interaction.guild.id,
          guild_name: interaction.guild.name,
        });

        await interaction.editReply({
          content: `✅ Test webhook sent to ${webhook.webhook_url.substring(
            0,
            40
          )}...`,
        });
      } catch (error) {
        await interaction.editReply({
          content: `❌ Failed to send test webhook: ${error.message}`,
        });
      }
    } catch (error) {
      logger.error("Error testing webhook:", error);
      await interaction.editReply({
        content: "❌ An error occurred while testing the webhook.",
      });
    }
  },

  async deleteWebhook(interaction) {
    const id = interaction.options.getInteger("id");

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await new Promise((resolve, reject) => {
        db.db.run(
          "UPDATE notifications SET enabled = 0 WHERE id = ? AND guild_id = ?",
          [id, interaction.guild.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await interaction.editReply({
        content: `✅ Webhook #${id} deleted`,
      });
    } catch (error) {
      logger.error("Error deleting webhook:", error);
      await interaction.editReply({
        content: "❌ An error occurred while deleting the webhook.",
      });
    }
  },
};
