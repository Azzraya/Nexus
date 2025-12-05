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
    .setName("clearwarnings")
    .setDescription("Clear warnings for a user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to clear warnings for")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser("user");

    // Prevent self-moderation
    if (user.id === interaction.user.id) {
      return interaction.reply({
        content: "❌ You cannot clear your own warnings!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Prevent moderating the server owner
    if (user.id === interaction.guild.ownerId) {
      return interaction.reply({
        content: "❌ You cannot moderate the server owner!",
        flags: MessageFlags.Ephemeral,
      });
    }

    await db.clearWarnings(interaction.guild.id, user.id);

    await interaction.reply({
      embeds: [
        {
          title: "✅ Warnings Cleared",
          description: `Cleared all warnings for ${user.tag}`,
          color: 0x00ff00,
        },
      ],
    });
  },
};
