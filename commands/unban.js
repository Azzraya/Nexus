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
    .setName("unban")
    .setDescription("Unban a user")
    .addStringOption((option) =>
      option
        .setName("user_id")
        .setDescription("User ID to unban")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for unban")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const userId = interaction.options.getString("user_id");
    const reason =
      interaction.options.getString("reason") || "No reason provided";

    try {
      await interaction.guild.members.unban(userId, reason);

      await db.addModLog(
        interaction.guild.id,
        userId,
        interaction.user.id,
        "unban",
        reason
      );

      await interaction.reply({
        embeds: [
          {
            title: "✅ User Unbanned",
            description: `Unbanned user <@${userId}>`,
            color: 0x00ff00,
          },
        ],
      });
    } catch (error) {
      await interaction.reply({
        content: `❌ Failed to unban: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
