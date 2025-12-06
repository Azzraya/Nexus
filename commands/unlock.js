const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock the server (remove lockdown)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.client.advancedAntiNuke) {
      return interaction.reply({
        content: "❌ Anti-nuke system not available!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Check if server is actually locked
    if (
      !interaction.client.advancedAntiNuke.lockedGuilds.has(
        interaction.guild.id
      )
    ) {
      return interaction.reply({
        content: "✅ Server is not in lockdown mode!",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    try {
      // Use the proper unlock method from advancedAntiNuke
      await interaction.client.advancedAntiNuke.unlockServer(interaction.guild);

      const embed = new EmbedBuilder()
        .setTitle("✅ Server Unlocked")
        .setDescription(
          `All channels and permissions have been restored.\n\n` +
            `The server is now back to normal operation.`
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply({
        content: "❌ Error unlocking server!",
      });
    }
  },
};
