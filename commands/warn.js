const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const Moderation = require("../utils/moderation");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to warn").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for warning")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const reason =
      interaction.options.getString("reason") || "No reason provided";

    // Prevent self-moderation
    if (user.id === interaction.user.id) {
      return interaction.reply({
        content: "❌ You cannot warn yourself!",
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

    const result = await Moderation.warn(
      interaction.guild,
      user,
      interaction.user,
      reason
    );

    if (result.success) {
      const embed = Moderation.createModEmbed(
        "warn",
        user,
        interaction.user,
        reason
      );
      embed.setDescription(result.message);
      await interaction.reply({ embeds: [embed] });

      // Try to DM user
      try {
        await user.send({
          embeds: [
            {
              title: "⚠️ You received a warning",
              description: `**Server:** ${interaction.guild.name}\n**Reason:** ${reason}`,
              color: 0xffff00,
            },
          ],
        });
      } catch {
        // Can't DM user, that's okay
      }

      const config = await db.getServerConfig(interaction.guild.id);
      if (config && config.mod_log_channel) {
        const logChannel = interaction.guild.channels.cache.get(
          config.mod_log_channel
        );
        if (logChannel) {
          logChannel.send({ embeds: [embed] });
        }
      }
    } else {
      await interaction.reply({
        content: `❌ ${result.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
