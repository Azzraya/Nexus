const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Get information about a user")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to check").setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user") || interaction.user;
    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);

    if (!member) {
      return interaction.reply({
        ErrorMessages.userNotFound(),
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
  },
};
