const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("View information about server or user")
    .addSubcommand((subcommand) =>
      subcommand.setName("server").setDescription("View info about this server")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("user")
        .setDescription("View info about a certain user")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to view info for")
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "server") {
      const guild = interaction.guild;
      const owner = await guild.fetchOwner();

      const embed = new EmbedBuilder()
        .setTitle(`📊 ${guild.name}`)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
          { name: "👑 Owner", value: `${owner.user.tag}`, inline: true },
          { name: "🆔 Server ID", value: guild.id, inline: true },
          {
            name: "📅 Created",
            value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
          { name: "👥 Members", value: `${guild.memberCount}`, inline: true },
          {
            name: "💬 Channels",
            value: `${guild.channels.cache.size}`,
            inline: true,
          },
          {
            name: "😀 Emojis",
            value: `${guild.emojis.cache.size}`,
            inline: true,
          },
          {
            name: "🔒 Verification",
            value: guild.verificationLevel.toString(),
            inline: true,
          },
          {
            name: "📈 Boost Level",
            value: guild.premiumTier.toString(),
            inline: true,
          },
          {
            name: "🚀 Boosts",
            value: `${guild.premiumSubscriptionCount || 0}`,
            inline: true,
          }
        )
        .setColor(0x0099ff)
        .setTimestamp();

      if (guild.description) {
        embed.setDescription(guild.description);
      }

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "user") {
      const user = interaction.options.getUser("user") || interaction.user;
      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      if (!member) {
        return interaction.reply({
          content: "❌ User not found in this server!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const stats = await db.getUserStats(interaction.guild.id, user.id);
      const warnings = await db.getWarnings(interaction.guild.id, user.id);
      const heatScore = await db.getHeatScore(interaction.guild.id, user.id);

      const roles =
        member.roles.cache
          .filter((role) => role.id !== interaction.guild.id)
          .map((role) => role.toString())
          .slice(0, 10)
          .join(", ") || "None";

      const embed = new EmbedBuilder()
        .setTitle(`👤 ${user.tag}`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: "🆔 User ID", value: user.id, inline: true },
          {
            name: "📅 Account Created",
            value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
          {
            name: "📥 Joined Server",
            value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
            inline: true,
          },
          {
            name: "💬 Messages Sent",
            value: `${stats.messages_sent}`,
            inline: true,
          },
          { name: "⚠️ Warnings", value: `${warnings.length}`, inline: true },
          { name: "🔥 Heat Score", value: `${heatScore}`, inline: true },
          { name: "🎭 Roles", value: roles || "None", inline: false }
        )
        .setColor(member.displayColor || 0x0099ff)
        .setTimestamp();

      if (member.premiumSince) {
        embed.addFields({
          name: "💎 Boosting Since",
          value: `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>`,
          inline: true,
        });
      }

      await interaction.reply({ embeds: [embed] });
    }
  },
};
