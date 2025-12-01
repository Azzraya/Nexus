const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lockdown the server (prevent new joins)")
    .addSubcommand((subcommand) =>
      subcommand.setName("enable").setDescription("Enable lockdown")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("disable").setDescription("Disable lockdown")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "enable") {
      interaction.client.antiRaid.lockdown.set(interaction.guild.id, true);
      await interaction.reply({
        embeds: [
          {
            title: "🔒 Lockdown Enabled",
            description: "New members will be automatically kicked",
            color: 0xff0000,
          },
        ],
      });
    } else {
      interaction.client.antiRaid.lockdown.set(interaction.guild.id, false);
      await interaction.reply({
        embeds: [
          {
            title: "🔓 Lockdown Disabled",
            description: "Server is now open for new members",
            color: 0x00ff00,
          },
        ],
      });
    }
  },
};
