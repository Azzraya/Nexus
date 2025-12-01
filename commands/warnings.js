const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warnings for a user")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to check").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser("user") || interaction.user;
    const warnings = await db.getWarnings(interaction.guild.id, user.id);

    if (warnings.length === 0) {
      return interaction.reply({
        embeds: [
          {
            title: "⚠️ Warnings",
            description: `${user.tag} has no warnings`,
            color: 0x00ff00,
          },
        ],
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ Warnings for ${user.tag}`)
      .setDescription(`Total: ${warnings.length} warning(s)`)
      .setColor(0xffff00)
      .setTimestamp();

    const recentWarnings = warnings.slice(0, 10).map((w, i) => {
      const date = new Date(w.timestamp).toLocaleDateString();
      return `${i + 1}. ${w.reason} - ${date}`;
    });

    embed.addFields({
      name: "Recent Warnings",
      value: recentWarnings.join("\n") || "None",
    });

    await interaction.reply({ embeds: [embed] });
  },
};
