const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("seasonal")
    .setDescription("Manage seasonal events and themes")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("activate")
        .setDescription("Activate a seasonal theme")
        .addStringOption((option) =>
          option
            .setName("event")
            .setDescription("Seasonal event to activate")
            .setRequired(true)
            .addChoices(
              { name: "🎄 Christmas", value: "christmas" },
              { name: "🎃 Halloween", value: "halloween" },
              { name: "🎆 New Year", value: "newyear" },
              { name: "💝 Valentine's Day", value: "valentine" },
              { name: "🦃 Thanksgiving", value: "thanksgiving" },
              { name: "🎉 Easter", value: "easter" },
              { name: "❌ None (Disable)", value: "none" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("current")
        .setDescription("View current seasonal theme")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "activate") {
      await this.handleActivate(interaction);
    } else if (subcommand === "current") {
      await this.handleCurrent(interaction);
    }
  },

  async handleActivate(interaction) {
    const eventType = interaction.options.getString("event");

    if (eventType === "none") {
      // Deactivate all seasonal themes
      await new Promise((resolve, reject) => {
        db.db.run(
          `UPDATE server_config SET seasonal_theme = NULL WHERE guild_id = ?`,
          [interaction.guild.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      return interaction.reply({
        content: "✅ Seasonal themes disabled!",
        ephemeral: true,
      });
    }

    const themes = {
      christmas: {
        name: "Christmas",
        emoji: "🎄",
        color: 0xff0000,
        embedColor: 0x00ff00,
        message: "Ho ho ho! Christmas theme activated! 🎅",
      },
      halloween: {
        name: "Halloween",
        emoji: "🎃",
        color: 0xff6600,
        embedColor: 0x000000,
        message: "Spooky season activated! 👻",
      },
      newyear: {
        name: "New Year",
        emoji: "🎆",
        color: 0xffd700,
        embedColor: 0x0099ff,
        message: "Happy New Year! 🎉",
      },
      valentine: {
        name: "Valentine's Day",
        emoji: "💝",
        color: 0xff69b4,
        embedColor: 0xff1493,
        message: "Love is in the air! 💕",
      },
      thanksgiving: {
        name: "Thanksgiving",
        emoji: "🦃",
        color: 0xd2691e,
        embedColor: 0xff8c00,
        message: "Happy Thanksgiving! 🍂",
      },
      easter: {
        name: "Easter",
        emoji: "🎉",
        color: 0xffb6c1,
        embedColor: 0x98fb98,
        message: "Happy Easter! 🐰",
      },
    };

    const theme = themes[eventType];
    if (!theme) {
      return interaction.reply({
        content: "❌ Invalid seasonal event!",
        ephemeral: true,
      });
    }

    // Store theme in server config
    await db.setServerConfig(interaction.guild.id, {
      seasonal_theme: eventType,
    });

    const embed = new EmbedBuilder()
      .setTitle(`${theme.emoji} ${theme.name} Theme Activated!`)
      .setDescription(theme.message)
      .setColor(theme.embedColor)
      .addFields(
        { name: "Theme", value: theme.name, inline: true },
        { name: "Emoji", value: theme.emoji, inline: true }
      )
      .setFooter({
        text: "Seasonal theme will apply to bot embeds and messages",
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  async handleCurrent(interaction) {
    const config = await db.getServerConfig(interaction.guild.id);
    const currentTheme = config?.seasonal_theme;

    if (!currentTheme) {
      return interaction.reply({
        content:
          "No seasonal theme is currently active. Use `/seasonal activate` to set one!",
        ephemeral: true,
      });
    }

    const themes = {
      christmas: { name: "Christmas", emoji: "🎄", color: 0x00ff00 },
      halloween: { name: "Halloween", emoji: "🎃", color: 0xff6600 },
      newyear: { name: "New Year", emoji: "🎆", color: 0xffd700 },
      valentine: { name: "Valentine's Day", emoji: "💝", color: 0xff69b4 },
      thanksgiving: { name: "Thanksgiving", emoji: "🦃", color: 0xd2691e },
      easter: { name: "Easter", emoji: "🎉", color: 0xffb6c1 },
    };

    const theme = themes[currentTheme];

    const embed = new EmbedBuilder()
      .setTitle(`${theme.emoji} Current Theme: ${theme.name}`)
      .setDescription("This theme is currently active for the server.")
      .setColor(theme.color)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  // Helper function to get current theme for other commands
  async getCurrentTheme(guildId) {
    const config = await db.getServerConfig(guildId);
    return config?.seasonal_theme || null;
  },

  // Helper function to get theme color
  getThemeColor(themeName) {
    const colors = {
      christmas: 0x00ff00,
      halloween: 0xff6600,
      newyear: 0xffd700,
      valentine: 0xff69b4,
      thanksgiving: 0xd2691e,
      easter: 0xffb6c1,
    };
    return colors[themeName] || 0x667eea;
  },
};
