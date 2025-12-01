const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const Moderation = require("../utils/moderation");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user from the server")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to kick").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for kick")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const reason =
      interaction.options.getString("reason") || "No reason provided";

    // Prevent self-moderation
    if (user.id === interaction.user.id) {
      return interaction.reply({
        content: "❌ You cannot kick yourself!",
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

    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);
    if (!member) {
      return interaction.reply({
        content: "❌ User not found in this server!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Check if moderator is server owner (owners can kick anyone)
    const isOwner = interaction.member.id === interaction.guild.ownerId;

    // Check if member is manageable
    if (!member.kickable) {
      return interaction.reply({
        content:
          "❌ I cannot kick this user (they have a higher role than me or are the server owner)!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Check role hierarchy (unless moderator is owner)
    if (
      !isOwner &&
      member.roles.highest.position >= interaction.member.roles.highest.position
    ) {
      return interaction.reply({
        content: "❌ You cannot kick someone with equal or higher roles!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const result = await Moderation.kick(
      interaction.guild,
      user,
      interaction.user,
      reason
    );

    if (result.success) {
      const embed = Moderation.createModEmbed(
        "kick",
        user,
        interaction.user,
        reason
      );
      await interaction.reply({ embeds: [embed] });

      const config = await db.getServerConfig(interaction.guild.id);
      if (config && config.mod_log_channel) {
        const logChannel = interaction.guild.channels.cache.get(
          config.mod_log_channel
        );
        if (logChannel) {
          logChannel.send({ embeds: [embed] });
        }
      }
    } else {
      await interaction.reply({
        content: `❌ ${result.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
