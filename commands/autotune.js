const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const IntelligentDetection = require("../utils/intelligentDetection");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autotune")
    .setDescription("Auto-optimize security settings based on server activity")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply();

    const suggestions = await IntelligentDetection.autoTuneThresholds(
      interaction.guild.id
    );

    const embed = new EmbedBuilder()
      .setTitle("🎯 Auto-Tune Recommendations")
      .addFields(
        {
          name: "Suggested Max Joins",
          value: `${suggestions.suggestedMaxJoins}`,
          inline: true,
        },
        {
          name: "Suggested Time Window",
          value: `${suggestions.suggestedTimeWindow / 1000}s`,
          inline: true,
        },
        {
          name: "Reason",
          value: suggestions.reason,
          inline: false,
        }
      )
      .setColor(0x0099ff)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
