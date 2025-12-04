const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const Moderation = require("../utils/moderation");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete multiple messages")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of messages to delete (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Only delete messages from this user")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const amount = interaction.options.getInteger("amount");
    const user = interaction.options.getUser("user");

    if (
      !interaction.channel
        .permissionsFor(interaction.client.user)
        .has(PermissionFlagsBits.ManageMessages)
    ) {
      return interaction.reply({
        content: '❌ I need "Manage Messages" permission!',
        flags: MessageFlags.Ephemeral,
      });
    }

    let filter = null;
    if (user) {
      filter = (msg) => msg.author.id === user.id;
    }

    const result = await Moderation.purge(interaction.channel, amount, filter);

    if (result.success) {
      await interaction.reply({
        content: `✅ Deleted ${result.deleted} message(s)${
          user ? ` from ${user.tag}` : ""
        }`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: `❌ ${result.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
