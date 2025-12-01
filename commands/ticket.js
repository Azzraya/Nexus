const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Ticket system commands")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Setup ticket system")
        .addChannelOption((option) =>
          option
            .setName("category")
            .setDescription("Category for ticket channels")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("close").setDescription("Close current ticket")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "setup") {
      const category = interaction.options.getChannel("category");
      await db.setServerConfig(interaction.guild.id, {
        ticket_category: category.id,
      });

      const embed = new EmbedBuilder()
        .setTitle("🎫 Ticket System")
        .setDescription("Click the button below to create a ticket!")
        .setColor(0x0099ff);

      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("create_ticket")
          .setLabel("Create Ticket")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🎫")
      );

      await interaction.reply({ embeds: [embed], components: [button] });
    } else if (subcommand === "close") {
      const ticket = await db.getTicket(interaction.channel.id);
      if (!ticket) {
        return interaction.reply({
          content: "❌ This is not a ticket channel!",
          flags: MessageFlags.Ephemeral,
        });
      }

      await db.closeTicket(interaction.channel.id);
      await interaction.reply(
        "✅ Ticket closed. Channel will be deleted in 5 seconds..."
      );

      const ErrorHandler = require("../utils/errorHandler");
      setTimeout(() => {
        ErrorHandler.safeExecute(
          interaction.channel.delete(),
          `ticket [${interaction.guild.id}]`,
          `Delete ticket channel ${interaction.channel.id}`
        );
      }, 5000);
    }
  },
};
