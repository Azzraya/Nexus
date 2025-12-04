const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("notify")
    .setDescription("Configure real-time notifications ")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Set up notifications")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Notification type")
            .setRequired(true)
            .addChoices(
              { name: "Raid Detected", value: "raid_detected" },
              { name: "Nuke Attempt", value: "nuke_attempt" },
              { name: "High Threat", value: "high_threat" },
              { name: "Mass Ban", value: "mass_ban" },
              { name: "Channel Deleted", value: "channel_deleted" },
              { name: "Role Deleted", value: "role_deleted" },
              { name: "Suspicious Activity", value: "suspicious_activity" }
            )
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to send notifications")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("webhook")
            .setDescription("Webhook URL (alternative to channel)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all notification configurations")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a notification")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("Notification ID")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("digest")
        .setDescription("Configure notification digest mode")
        .addBooleanOption((option) =>
          option
            .setName("enabled")
            .setDescription("Enable digest mode (batch notifications)")
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("interval")
            .setDescription("Digest interval in minutes (default: 5)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(60)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("quiet")
        .setDescription("Set quiet hours (no notifications during these hours)")
        .addIntegerOption((option) =>
          option
            .setName("start")
            .setDescription("Start hour (0-23)")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(23)
        )
        .addIntegerOption((option) =>
          option
            .setName("end")
            .setDescription("End hour (0-23)")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(23)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "setup") {
      const type = interaction.options.getString("type");
      const channel = interaction.options.getChannel("channel");
      const webhook = interaction.options.getString("webhook");

      if (!channel && !webhook) {
        return interaction.reply({
          content: "❌ You must provide either a channel or webhook URL",
          flags: MessageFlags.Ephemeral,
        });
      }

      await db.createNotification(
        interaction.guild.id,
        type,
        channel?.id || null,
        webhook || null,
        {}
      );

      await interaction.reply({
        content: `✅ Notification configured for ${type.replace(/_/g, " ")}`,
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "list") {
      const notifications = await db.getNotifications(interaction.guild.id);

      if (notifications.length === 0) {
        return interaction.reply({
          content:
            "❌ No notifications configured. Use `/notify setup` to create one.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🔔 Notification Configurations")
        .setDescription(
          notifications
            .map(
              (n) =>
                `**${n.id}.** ${n.notification_type.replace(/_/g, " ")}\n   ${
                  n.channel_id
                    ? `Channel: <#${n.channel_id}>`
                    : `Webhook: ${n.webhook_url?.substring(0, 30)}...`
                }`
            )
            .join("\n\n")
        )
        .setColor(0x0099ff);

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "remove") {
      const id = interaction.options.getInteger("id");

      await new Promise((resolve, reject) => {
        db.db.run(
          "UPDATE notifications SET enabled = 0 WHERE id = ?",
          [id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await interaction.reply({
        content: `✅ Notification #${id} removed`,
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "digest") {
      const enabled = interaction.options.getBoolean("enabled");
      const interval = interaction.options.getInteger("interval") || 5;

      await db.setServerConfig(interaction.guild.id, {
        notification_digest_mode: enabled ? 1 : 0,
        notification_digest_interval: interval * 60000, // Convert to milliseconds
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Digest Mode Configured")
        .setDescription(
          enabled
            ? `Notifications will be batched and sent every ${interval} minute(s)`
            : "Notifications will be sent immediately"
        )
        .addFields({
          name: "💡 How It Works",
          value:
            "When enabled, non-critical notifications are grouped together and sent in batches. Critical alerts are always sent immediately.",
        })
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "quiet") {
      const start = interaction.options.getInteger("start");
      const end = interaction.options.getInteger("end");

      if (start !== null && end !== null) {
        await db.setServerConfig(interaction.guild.id, {
          notification_quiet_hours_start: start,
          notification_quiet_hours_end: end,
        });

        const embed = new EmbedBuilder()
          .setTitle("✅ Quiet Hours Set")
          .setDescription(
            `Notifications will be queued (not sent) between ${start}:00 and ${end}:00`
          )
          .setColor(0x00ff00)
          .setTimestamp();

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
      } else {
        // Show current quiet hours
        const config = await db.getServerConfig(interaction.guild.id);
        const embed = new EmbedBuilder()
          .setTitle("🔕 Quiet Hours")
          .setDescription(
            config?.notification_quiet_hours_start !== null
              ? `Quiet hours: ${config.notification_quiet_hours_start}:00 - ${config.notification_quiet_hours_end}:00`
              : "Quiet hours not configured. Set start and end hours to enable."
          )
          .setColor(0x0099ff)
          .setTimestamp();

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
