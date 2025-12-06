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
      await interaction.client.advancedAntiNuke.unlockServer(
        interaction.guild
      );

      // Double-check if it was actually unlocked
      const stillLocked =
        interaction.client.advancedAntiNuke.lockedGuilds.has(
          interaction.guild.id
        );

      const embed = new EmbedBuilder()
        .setTitle(stillLocked ? "⚠️ Unlock In Progress" : "✅ Server Unlocked")
        .setDescription(
          stillLocked
            ? `Unlock process started. If channels are still locked, they may not have ManageChannels permission.\n\nUse \`/lock remove channels\` as a fallback.`
            : `All channels and permissions have been restored.\n\nThe server is now back to normal operation.`
        )
        .setColor(stillLocked ? 0xff9900 : 0x00ff00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const logger = require("../utils/logger");
      logger.error("Unlock command error:", error);
      await interaction.editReply({
        content: `❌ Error unlocking server: ${error.message}`,
      });
    }
  },
};
