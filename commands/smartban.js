const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const Security = require("../utils/security");
const db = require("../utils/database");
const Moderation = require("../utils/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("smartban")
    .setDescription("AI-powered ban with threat analysis ")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to ban").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for ban")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("analyze")
        .setDescription("Run threat analysis before banning")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const reason =
      interaction.options.getString("reason") || "No reason provided";
    const analyze = interaction.options.getBoolean("analyze") ?? true;

    // Safety checks
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
      const botMember = await interaction.guild.members.fetch(
        interaction.client.user.id
      );
      if (!member.manageable) {
        return interaction.reply({
          content:
            "❌ I cannot ban this user (they have a higher role than me or are the server owner)!",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Check role hierarchy (unless moderator is owner)
      if (
        !isOwner &&
        member.roles.highest.position >=
          interaction.member.roles.highest.position
      ) {
        return interaction.reply({
          content: "❌ You cannot ban someone with equal or higher roles!",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    await interaction.deferReply();

    let threatAnalysis = null;
    if (analyze) {
      threatAnalysis = await Security.detectThreat(
        interaction.guild,
        user,
        "ban"
      );
    }

    const result = await Moderation.ban(
      interaction.guild,
      user,
      interaction.user,
      reason,
      1
    );

    if (result.success) {
      const embed = new EmbedBuilder()
        .setTitle("✅ Smart Ban Executed")
        .setDescription(`${user.tag} has been banned`)
        .addFields(
          { name: "User", value: `${user.tag} (${user.id})`, inline: true },
          { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
          { name: "Reason", value: reason, inline: false }
        )
        .setColor(0xff0000)
        .setTimestamp();

      if (threatAnalysis) {
        embed.addFields({
          name: "🔍 Threat Analysis",
          value: [
            `**Threat Score:** ${threatAnalysis.score}%`,
            `**Level:** ${threatAnalysis.level.toUpperCase()}`,
            `**Patterns Detected:** ${threatAnalysis.patterns?.length || 0}`,
          ].join("\n"),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({
        content: `❌ ${result.message}`,
      });
    }
  },
};
