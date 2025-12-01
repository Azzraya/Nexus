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
    .setName("ban")
    .setDescription("Ban or unban a user from the server")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Ban a member from your server")
        .addUserOption((option) =>
          option.setName("user").setDescription("User to ban").setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for ban")
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("delete_days")
            .setDescription("Days of messages to delete (0-7)")
            .setMinValue(0)
            .setMaxValue(7)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Unban a user from your server")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to unban")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for unban")
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const user = interaction.options.getUser("user");
      const reason =
        interaction.options.getString("reason") || "No reason provided";
      const deleteDays = interaction.options.getInteger("delete_days") || 0;

      if (user.id === interaction.user.id) {
        return interaction.reply({
          content: "❌ You cannot ban yourself!",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (user.id === interaction.client.user.id) {
        return interaction.reply({
          content: "❌ I cannot ban myself!",
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
      
      // Check if moderator is server owner (owners can ban anyone)
      const isOwner = interaction.member.id === interaction.guild.ownerId;
      
      // Check if member is manageable (bot can ban them)
      if (member) {
        const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
        if (!member.manageable) {
          return interaction.reply({
            content: "❌ I cannot ban this user (they have a higher role than me or are the server owner)!",
            flags: MessageFlags.Ephemeral,
          });
        }
        
        // Check role hierarchy (unless moderator is owner)
        if (!isOwner && member.roles.highest.position >= interaction.member.roles.highest.position) {
          return interaction.reply({
            content: "❌ You cannot ban someone with equal or higher roles!",
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      const result = await Moderation.ban(
        interaction.guild,
        user,
        interaction.user,
        reason,
        deleteDays
      );

      if (result.success) {
        const embed = Moderation.createModEmbed(
          "ban",
          user,
          interaction.user,
          reason
        );
        await interaction.reply({ embeds: [embed] });

        // Send to mod log
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
    } else if (subcommand === "remove") {
      const user = interaction.options.getUser("user");
      const reason =
        interaction.options.getString("reason") || "No reason provided";

      try {
        await interaction.guild.bans.remove(user.id, reason);
        const embed = Moderation.createModEmbed(
          "unban",
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
      } catch (error) {
        await interaction.reply({
          content: `❌ Failed to unban user: ${error.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
