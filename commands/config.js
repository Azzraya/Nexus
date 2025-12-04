const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure bot settings")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("modlog")
        .setDescription("Set moderation log channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel for moderation logs")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("welcome")
        .setDescription("Configure welcome messages")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Welcome channel")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription(
              "Welcome message (use {user} for username, {server} for server name)"
            )
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("view").setDescription("View current configuration")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "modlog") {
      const channel = interaction.options.getChannel("channel");
      await db.setServerConfig(interaction.guild.id, {
        mod_log_channel: channel.id,
      });

      await interaction.reply({
        embeds: [
          {
            title: "✅ Configuration Updated",
            description: `Moderation logs will be sent to ${channel}`,
            color: 0x00ff00,
          },
        ],
      });
    } else if (subcommand === "welcome") {
      const channel = interaction.options.getChannel("channel");
      const message =
        interaction.options.getString("message") ||
        "Welcome {user} to {server}!";

      await db.setServerConfig(interaction.guild.id, {
        welcome_channel: channel.id,
        welcome_message: message,
      });

      await interaction.reply({
        embeds: [
          {
            title: "✅ Welcome Messages Configured",
            description: `Welcome channel: ${channel}\nMessage: ${message}`,
            color: 0x00ff00,
          },
        ],
      });
    } else if (subcommand === "view") {
      const config = await db.getServerConfig(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle("⚙️ Server Configuration")
        .addFields(
          {
            name: "Mod Log Channel",
            value: config?.mod_log_channel
              ? `<#${config.mod_log_channel}>`
              : "Not set",
            inline: true,
          },
          {
            name: "Welcome Channel",
            value: config?.welcome_channel
              ? `<#${config.welcome_channel}>`
              : "Not set",
            inline: true,
          },
          {
            name: "Auto-Mod",
            value: config?.auto_mod_enabled ? "✅ Enabled" : "❌ Disabled",
            inline: true,
          },
          {
            name: "Anti-Raid",
            value: config?.anti_raid_enabled ? "✅ Enabled" : "❌ Disabled",
            inline: true,
          },
          {
            name: "Anti-Nuke",
            value: config?.anti_nuke_enabled ? "✅ Enabled" : "❌ Disabled",
            inline: true,
          },
          {
            name: "Heat System",
            value: config?.heat_system_enabled ? "✅ Enabled" : "❌ Disabled",
            inline: true,
          }
        )
        .setColor(0x0099ff)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};
