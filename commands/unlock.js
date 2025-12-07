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

    await interaction.deferReply();

    // Check if channels are actually locked (even if Set was cleared)
    // This handles cases where bot restarted but channels are still locked
    const botMember = await interaction.guild.members
      .fetch(interaction.client.user.id)
      .catch(() => null);

    if (!botMember) {
      return interaction.editReply({
        content: "❌ Could not fetch bot member!",
      });
    }

    // Check if any channels have SendMessages: false for @everyone
    const lockedChannels = interaction.guild.channels.cache.filter((c) => {
      if (!c.isTextBased()) return false;
      const everyonePerms = c.permissionsFor(interaction.guild.roles.everyone);
      return (
        everyonePerms &&
        !everyonePerms.has("SendMessages") &&
        c.permissionsFor(botMember)?.has("ManageChannels")
      );
    });

    const isInLockdownSet =
      interaction.client.advancedAntiNuke.lockedGuilds.has(
        interaction.guild.id
      );

    // If not in Set AND no locked channels found, server isn't locked
    if (!isInLockdownSet && lockedChannels.size === 0) {
      return interaction.editReply({
        content: "✅ Server is not in lockdown mode!",
      });
    }

    // Always unlock if there are locked channels OR if in lockdown Set

    try {
      // If server is in lockdown Set, use the proper unlock method
      // Otherwise, unlock manually
      if (isInLockdownSet) {
        await interaction.client.advancedAntiNuke.unlockServer(
          interaction.guild
        );
      } else {
        // Manual unlock for channels that are locked but Set was cleared
        const everyone = interaction.guild.roles.everyone;
        let unlockedCount = 0;

        for (const channel of lockedChannels.values()) {
          try {
            await channel.permissionOverwrites.edit(everyone, {
              SendMessages: null, // Remove overwrite (resets to default)
              AddReactions: null,
              CreatePublicThreads: null,
              CreatePrivateThreads: null,
            });
            unlockedCount++;
          } catch (error) {
            // Continue with other channels
          }
        }

        // Also restore @everyone role permissions if needed
        if (botMember.permissions.has("ManageRoles")) {
          try {
            const everyoneRole = interaction.guild.roles.everyone;
            const restoredPerms = everyoneRole.permissions.add([
              "CreateInstantInvite",
              "CreatePrivateThreads",
              "CreatePublicThreads",
              "ManageChannels",
            ]);
            await everyoneRole.setPermissions(
              restoredPerms,
              "Anti-Nuke: Restore permissions after manual unlock"
            );
          } catch (error) {
            // Continue
          }
        }

        const logger = require("../utils/logger");
        logger.info(
          `[Unlock] Manually unlocked ${unlockedCount} channels in ${interaction.guild.id} (Set was cleared)`
        );
      }

      // Double-check if channels are still locked
      const stillLockedChannels = interaction.guild.channels.cache.filter(
        (c) => {
          if (!c.isTextBased()) return false;
          const everyonePerms = c.permissionsFor(
            interaction.guild.roles.everyone
          );
          return (
            everyonePerms &&
            !everyonePerms.has("SendMessages") &&
            c.permissionsFor(botMember)?.has("ManageChannels")
          );
        }
      );

      const embed = new EmbedBuilder()
        .setTitle(
          stillLockedChannels.size > 0
            ? "⚠️ Partially Unlocked"
            : "✅ Server Unlocked"
        )
        .setDescription(
          stillLockedChannels.size > 0
            ? `Unlocked most channels. ${stillLockedChannels.size} channel(s) may still be locked (missing permissions).\n\nUse \`/lock remove channels\` as a fallback.`
            : `All channels and permissions have been restored.\n\nThe server is now back to normal operation.`
        )
        .setColor(stillLockedChannels.size > 0 ? 0xff9900 : 0x00ff00)
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
