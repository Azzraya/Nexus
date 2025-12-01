const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

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
    }
  },
};
