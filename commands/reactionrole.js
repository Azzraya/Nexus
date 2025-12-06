const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reactionrole")
    .setDescription("Manage reaction roles")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a reaction role message")
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("Message title")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Message description")
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option.setName("role1").setDescription("First role").setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("emoji1")
            .setDescription("Emoji for first role")
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName("role2")
            .setDescription("Second role")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("emoji2")
            .setDescription("Emoji for second role")
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName("role3")
            .setDescription("Third role")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("emoji3")
            .setDescription("Emoji for third role")
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      const title = interaction.options.getString("title");
      const description = interaction.options.getString("description");
      const roles = [];
      const emojis = [];

      for (let i = 1; i <= 3; i++) {
        const role = interaction.options.getRole(`role${i}`);
        const emoji = interaction.options.getString(`emoji${i}`);
        if (role && emoji) {
          roles.push(role);
          emojis.push(emoji);
        }
      }

      if (roles.length === 0) {
        return interaction.reply({
          content: "❌ You need to provide at least one role!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(0x0099ff)
        .setTimestamp();

      // Check for duplicate roles
      const uniqueRoleIds = new Set(roles.map((r) => r.id));
      if (uniqueRoleIds.size !== roles.length) {
        return interaction.reply({
          content:
            "❌ You cannot use the same role multiple times! Each role must be unique.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const buttons = new ActionRowBuilder();
      roles.forEach((role, index) => {
        buttons.addComponents(
          new ButtonBuilder()
            .setCustomId(`reactionrole_${role.id}_${index}`)
            .setLabel(role.name)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(emojis[index])
        );
      });

      await interaction.reply({
        embeds: [embed],
        components: [buttons],
      });
      const message = await interaction.fetchReply();

      // Save to database
      for (let i = 0; i < roles.length; i++) {
        await db.addReactionRole(
          interaction.guild.id,
          message.id,
          emojis[i],
          roles[i].id
        );
      }

      await interaction.followUp({
        content: "✅ Reaction role message created!",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
