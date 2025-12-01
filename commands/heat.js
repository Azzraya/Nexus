const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("heat")
    .setDescription("Check user heat score")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to check").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser("user") || interaction.user;
    const key = `${interaction.guild.id}-${target.id}`;
    const heatData = interaction.client.heatSystem.get(key);

    if (!heatData || heatData.score === 0) {
      await interaction.reply({
        embeds: [
          {
            title: "🔥 Heat Score",
            description: `${target.tag} has no heat`,
            color: 0x00ff00,
          },
        ],
      });
      return;
    }

    // Ensure history exists (backward compatibility)
    const history = heatData.history || [];
    const score = heatData.score || 0;

    const embed = new EmbedBuilder()
      .setTitle(`🔥 Heat Score: ${target.tag}`)
      .addFields(
        { name: "Current Score", value: `${score}`, inline: true },
        {
          name: "Recent Actions",
          value: `${history.length}`,
          inline: true,
        }
      )
      .setColor(
        score > 150
          ? 0xff0000
          : score > 100
          ? 0xffaa00
          : 0xffff00
      )
      .setTimestamp();

    if (history.length > 0) {
      const recent = history.slice(-5).reverse();
      embed.addFields({
        name: "Recent History",
        value:
          recent.map((h) => `+${h.amount || 0} - ${h.reason || "Unknown"}`).join("\n") || "None",
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
