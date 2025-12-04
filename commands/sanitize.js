const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sanitize")
    .setDescription(
      "Simplify a member's nickname, remove weird symbols and dehoist"
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to sanitize nickname")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  async execute(interaction) {
    const user = interaction.options.getUser("user");

    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);

    if (!member) {
      return interaction.reply({
        ErrorMessages.userNotFound(),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!member.manageable) {
      return interaction.reply({
        content: "❌ I cannot manage this member's nickname!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const currentNick = member.displayName;

    // Remove weird/cancerous symbols (keep alphanumeric, spaces, and basic punctuation)
    let sanitized = currentNick.replace(/[^\w\s\-.,!?]/g, "");

    // Dehoist: if nickname starts with special characters that cause hoisting, add a character
    if (/^[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(sanitized)) {
      sanitized = "•" + sanitized;
    }

    // Trim and limit length
    sanitized = sanitized.trim().slice(0, 32);

    // If empty after sanitization, use username
    if (!sanitized) {
      sanitized = user.username;
    }

    // If no change needed
    if (sanitized === currentNick) {
      return interaction.reply({
        content: `✅ ${user.tag}'s nickname is already clean!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await member.setNickname(
        sanitized,
        `Sanitized by ${interaction.user.tag}`
      );

      const embed = new EmbedBuilder()
        .setTitle("✅ Nickname Sanitized")
        .addFields(
          {
            name: "User",
            value: `${user.tag} (${user.id})`,
            inline: true,
          },
          {
            name: "Old Nickname",
            value: currentNick || "None",
            inline: true,
          },
          {
            name: "New Nickname",
            value: sanitized,
            inline: true,
          }
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      await interaction.reply({
        ErrorMessages.commandFailed(error.message),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
