const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Leveling = require("../utils/leveling");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the level leaderboard")
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription("Number of users to show (1-20)")
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(false)
    ),

  async execute(interaction) {
    const limit = interaction.options.getInteger("limit") || 10;
    const leaderboard = await Leveling.getLeaderboard(
      interaction.guild.id,
      limit
    );

    if (leaderboard.length === 0) {
      return interaction.reply({
        embeds: [
          {
            title: "🏆 Leaderboard",
            description: "No users on the leaderboard yet!",
            color: 0x0099ff,
          },
        ],
      });
    }

    const topList = await Promise.all(
      leaderboard.map(async (entry, index) => {
        try {
          const user = await interaction.client.users.fetch(entry.user_id);
          return `${index + 1}. ${user.tag} - Level ${
            entry.level
          } (${entry.total_xp.toLocaleString()} XP)`;
        } catch {
          return `${index + 1}. Unknown User - Level ${
            entry.level
          } (${entry.total_xp.toLocaleString()} XP)`;
        }
      })
    );

    const embed = new EmbedBuilder()
      .setTitle("🏆 Level Leaderboard")
      .setDescription(topList.join("\n"))
      .setColor(0xffd700)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
