const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const Moderation = require("../utils/moderation");
const db = require("../utils/database");
const ms = require("ms");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Timeout/mute a user")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to mute").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Duration (e.g., 1h, 30m, 1d)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for mute")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const durationStr = interaction.options.getString("duration");
    const reason =
      interaction.options.getString("reason") || "No reason provided";

    const constants = require("../utils/constants");
    const duration = ms(durationStr);
    if (
      !duration ||
      duration < constants.MUTE.MIN_DURATION ||
      duration > constants.MUTE.MAX_DURATION
    ) {
      return interaction.reply({
        content:
          "❌ Invalid duration! Use format like: 1h, 30m, 1d (max 28 days)",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Prevent self-moderation
    if (user.id === interaction.user.id) {
      return interaction.reply({
        content: "❌ You cannot mute yourself!",
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

    // Check if moderator is server owner (owners can mute anyone)
    const isOwner = interaction.member.id === interaction.guild.ownerId;

    // Check if member is manageable
    if (!member.moderatable) {
      return interaction.reply({
        content:
          "❌ I cannot mute this user (they have a higher role than me or are the server owner)!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Check role hierarchy (unless moderator is owner)
    if (
      !isOwner &&
      member.roles.highest.position >= interaction.member.roles.highest.position
    ) {
      return interaction.reply({
        content: "❌ You cannot mute someone with equal or higher roles!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const result = await Moderation.mute(
      interaction.guild,
      user,
      interaction.user,
      reason,
      duration
    );

    if (result.success) {
      const embed = Moderation.createModEmbed(
        "mute",
        user,
        interaction.user,
        reason,
        duration
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
