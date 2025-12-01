const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Manage verification system")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Setup verification system")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to give after verification")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Verification message")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("disable").setDescription("Disable verification")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "setup") {
      const role = interaction.options.getRole("role");
      const message =
        interaction.options.getString("message") ||
        "Click the button below to verify!";

      await db.setServerConfig(interaction.guild.id, {
        verification_enabled: 1,
        verification_role: role.id,
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Verification Required")
        .setDescription(message)
        .setColor(0x0099ff)
        .setTimestamp();

      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("verify_button")
          .setLabel("Verify")
          .setStyle(ButtonStyle.Success)
          .setEmoji("✅")
      );

      await interaction.reply({ embeds: [embed], components: [button] });
    } else if (subcommand === "disable") {
      await db.setServerConfig(interaction.guild.id, {
        verification_enabled: 0,
      });

      await interaction.reply({
        content: "✅ Verification system disabled",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
