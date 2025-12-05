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
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Manage advanced verification system for your server")
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
            .setName("mode")
            .setDescription("Verification mode")
            .setRequired(false)
            .addChoices(
              { name: "Instant (Button Click)", value: "instant" },
              { name: "Captcha (Math/Text)", value: "captcha" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("target")
            .setDescription("Who should verify")
            .setRequired(false)
            .addChoices(
              { name: "Everyone", value: "everyone" },
              { name: "Suspicious Accounts Only", value: "suspicious" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("server_type")
            .setDescription("Server type for scaling")
            .setRequired(false)
            .addChoices(
              { name: "Standard", value: "standard" },
              { name: "Big Server", value: "big_server" },
              { name: "NFT/Crypto", value: "nft_crypto" }
            )
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel for verification messages")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Custom verification message")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("disable").setDescription("Disable verification")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("config")
        .setDescription("View current verification configuration")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "setup") {
      const role = interaction.options.getRole("role");
      const mode = interaction.options.getString("mode") || "instant";
      const target = interaction.options.getString("target") || "everyone";
      const serverType =
        interaction.options.getString("server_type") || "standard";
      const channel = interaction.options.getChannel("channel");
      const message = interaction.options.getString("message");

      await db.setServerConfig(interaction.guild.id, {
        verification_enabled: 1,
        verification_role: role.id,
        verification_mode: mode,
        verification_target: target,
        verification_server_type: serverType,
        verification_channel: channel?.id || null,
        verification_message: message || null,
      });

      const modeDescriptions = {
        instant: "Button click verification (fastest)",
        captcha: "Math/Text captcha verification (balanced)",
      };

      const targetDescriptions = {
        everyone: "All new members must verify",
        suspicious: "Only suspicious accounts must verify",
      };

      const embed = new EmbedBuilder()
        .setTitle("✅ Verification System Configured")
        .setDescription(
          `**Verification system has been set up successfully!**\n\n` +
            `**Role:** ${role}\n` +
            `**Mode:** ${modeDescriptions[mode]}\n` +
            `**Target:** ${targetDescriptions[target]}\n` +
            `**Server Type:** ${serverType}\n` +
            (channel ? `**Channel:** ${channel}\n` : "") +
            (message ? `**Message:** ${message}\n` : "")
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "disable") {
      await db.setServerConfig(interaction.guild.id, {
        verification_enabled: 0,
      });

      await interaction.reply({
        content: "✅ Verification system disabled",
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "config") {
      const config = await db.getServerConfig(interaction.guild.id);

      if (!config || !config.verification_enabled) {
        await interaction.reply({
          content:
            "❌ Verification system is not enabled. Use `/verify setup` to configure it.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const modeDescriptions = {
        instant: "Button click verification",
        captcha: "Math/Text captcha verification",
      };

      const targetDescriptions = {
        everyone: "All new members",
        suspicious: "Suspicious accounts only",
      };

      const role = config.verification_role
        ? interaction.guild.roles.cache.get(config.verification_role)
        : null;
      const channel = config.verification_channel
        ? interaction.guild.channels.cache.get(config.verification_channel)
        : null;

      const embed = new EmbedBuilder()
        .setTitle("⚙️ Verification Configuration")
        .setDescription(
          `**Status:** ✅ Enabled\n\n` +
            `**Role:** ${role || "Not set"}\n` +
            `**Mode:** ${
              modeDescriptions[config.verification_mode] || "Instant"
            }\n` +
            `**Target:** ${
              targetDescriptions[config.verification_target] || "Everyone"
            }\n` +
            `**Server Type:** ${
              config.verification_server_type || "Standard"
            }\n` +
            (channel ? `**Channel:** ${channel}\n` : "**Channel:** Not set\n") +
            (config.verification_message
              ? `**Message:** ${config.verification_message}\n`
              : "")
        )
        .setColor(0x0099ff)
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
