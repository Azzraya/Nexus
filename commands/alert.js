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
    .setName("alert")
    .setDescription("Configure security alerts")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Setup security alerts")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel for alerts")
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("threshold")
            .setDescription("Threat score threshold (0-100)")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(100)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("disable").setDescription("Disable security alerts")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "setup") {
      const channel = interaction.options.getChannel("channel");
      const threshold = interaction.options.getInteger("threshold") || 60;

      await db.setServerConfig(interaction.guild.id, {
        alert_channel: channel.id,
        alert_threshold: threshold,
      });

      await interaction.reply({
        embeds: [
          {
            title: "✅ Security Alerts Configured",
            description: `Alerts will be sent to ${channel} when threat score exceeds ${threshold}%`,
            color: 0x00ff00,
          },
        ],
      });
    } else if (subcommand === "disable") {
      await db.setServerConfig(interaction.guild.id, {
        alert_channel: null,
      });

      await interaction.reply({
        content: "✅ Security alerts disabled",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
