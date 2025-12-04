const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const webhookHub = require("../utils/webhookHub");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("webhook")
    .setDescription("Manage external webhook integrations")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a new webhook integration")
        .addStringOption((option) =>
          option.setName("url").setDescription("Webhook URL").setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("events")
            .setDescription("Events to trigger (comma-separated)")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option.setName("name").setDescription("Webhook name/label")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List all webhook integrations")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a webhook integration")
        .addIntegerOption((option) =>
          option.setName("id").setDescription("Webhook ID").setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("toggle")
        .setDescription("Enable/disable a webhook")
        .addIntegerOption((option) =>
          option.setName("id").setDescription("Webhook ID").setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("events")
        .setDescription("List all available webhook events")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      await interaction.deferReply({ ephemeral: true });

      const url = interaction.options.getString("url");
      const eventsRaw = interaction.options.getString("events");
      const name = interaction.options.getString("name") || "Unnamed webhook";

      // Validate URL
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return await interaction.editReply({
          content:
            "❌ Invalid webhook URL. Must start with http:// or https://",
        });
      }

      // Parse and validate events
      const events = eventsRaw.split(",").map((e) => e.trim());
      const availableEvents = webhookHub.getAvailableEvents();
      const invalidEvents = events.filter((e) => !availableEvents.includes(e));

      if (invalidEvents.length > 0) {
        return await interaction.editReply({
          content: `❌ Invalid events: ${invalidEvents.join(
            ", "
          )}\n\nUse \`/webhook events\` to see available events.`,
        });
      }

      try {
        const result = await webhookHub.registerWebhook(
          interaction.guild.id,
          url,
          events,
          name
        );

        const embed = new EmbedBuilder()
          .setTitle("✅ Webhook Integration Added")
          .setColor("#48bb78")
          .addFields(
            {
              name: "📝 Name",
              value: name,
              inline: true,
            },
            {
              name: "🆔 ID",
              value: `${result.id}`,
              inline: true,
            },
            {
              name: "🔔 Events",
              value: events.join(", "),
              inline: false,
            }
          )
          .setDescription(
            "Webhook will receive JSON data when these events occur."
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        await interaction.editReply({
          content: `❌ Failed to add webhook: ${error.message}`,
        });
      }
    } else if (subcommand === "list") {
      await interaction.deferReply({ ephemeral: true });

      const webhooks = await webhookHub.getWebhooks(interaction.guild.id);

      if (webhooks.length === 0) {
        return await interaction.editReply({
          content:
            "📋 No webhooks configured. Use `/webhook add` to create one!",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🔗 Webhook Integrations")
        .setDescription(`${webhooks.length} active integration(s)`)
        .setColor("#667eea")
        .setTimestamp();

      webhooks.forEach((hook) => {
        const events = JSON.parse(hook.events);
        embed.addFields({
          name: `${hook.enabled ? "✅" : "❌"} ${hook.name}`,
          value: [
            `**ID:** ${hook.id}`,
            `**Events:** ${events.length}`,
            `**Triggers:** ${hook.trigger_count}`,
            `**Last:** ${
              hook.last_triggered
                ? `<t:${Math.floor(hook.last_triggered / 1000)}:R>`
                : "Never"
            }`,
          ].join("\n"),
          inline: true,
        });
      });

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === "delete") {
      await interaction.deferReply({ ephemeral: true });

      const id = interaction.options.getInteger("id");
      const result = await webhookHub.deleteWebhook(id);

      if (result.deleted) {
        await interaction.editReply({
          content: `✅ Webhook integration #${id} deleted.`,
        });
      } else {
        await interaction.editReply({
          content: `❌ Webhook #${id} not found.`,
        });
      }
    } else if (subcommand === "toggle") {
      await interaction.deferReply({ ephemeral: true });

      const id = interaction.options.getInteger("id");
      const result = await webhookHub.toggleWebhook(id);

      if (result.updated) {
        await interaction.editReply({
          content: `✅ Webhook #${id} toggled.`,
        });
      } else {
        await interaction.editReply({
          content: `❌ Webhook #${id} not found.`,
        });
      }
    } else if (subcommand === "events") {
      const events = webhookHub.getAvailableEvents();

      const embed = new EmbedBuilder()
        .setTitle("🔔 Available Webhook Events")
        .setDescription("These events can trigger your webhooks:")
        .setColor("#667eea")
        .addFields(
          {
            name: "👥 Member Events",
            value: "• member.join\n• member.leave\n• member.ban\n• member.kick",
            inline: true,
          },
          {
            name: "🛡️ Security Events",
            value: "• raid.detected\n• nuke.detected\n• threat.high",
            inline: true,
          },
          {
            name: "⚙️ System Events",
            value:
              "• server.health.critical\n• command.executed\n• config.changed",
            inline: true,
          }
        )
        .setFooter({
          text: "Separate multiple events with commas when adding webhook",
        })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
