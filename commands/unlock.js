const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

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
    if (!interaction.client.advancedAntiNuke.lockedGuilds.has(interaction.guild.id)) {
      return interaction.reply({
        content: "✅ Server is not in lockdown mode!",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    try {
      // Unlock all channels
      const channels = interaction.guild.channels.cache.filter(
        (c) => c.isTextBased() && c.permissionsFor(interaction.guild.roles.everyone)
      );

      let unlockedCount = 0;
      for (const channel of channels.values()) {
        try {
          await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
            SendMessages: null, // Reset to default
            AddReactions: null,
            CreatePublicThreads: null,
            CreatePrivateThreads: null,
          });
          unlockedCount++;
        } catch (error) {
          // Continue with other channels
        }
      }

      // Remove from locked guilds
      interaction.client.advancedAntiNuke.lockedGuilds.delete(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle("✅ Server Unlocked")
        .setDescription(
          `**${unlockedCount}** channels have been unlocked.\n\n` +
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

