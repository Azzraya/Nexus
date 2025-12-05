const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Leveling = require("../utils/leveling");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level")
    .setDescription("Check your or someone's level")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to check").setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user") || interaction.user;
    const levelData = await Leveling.getLevel(interaction.guild.id, user.id);

    const embed = new EmbedBuilder()
      .setTitle(`📊 Level - ${user.tag}`)
      .addFields(
        { name: "Level", value: `${levelData.level}`, inline: true },
        { name: "XP", value: `${levelData.xp.toLocaleString()}`, inline: true },
        {
          name: "Total XP",
          value: `${levelData.total_xp.toLocaleString()}`,
          inline: true,
        }
      )
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .setColor(0x0099ff)
      .setTimestamp();

    // Calculate progress to next level
    const currentLevelXP = Leveling.calculateXPForLevel(levelData.level);
    const nextLevelXP = Leveling.calculateXPForLevel(levelData.level + 1);
    const progress =
      ((levelData.total_xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) *
      100;

    embed.addFields({
      name: "Progress to Next Level",
      value: `${Math.round(progress)}%`,
      inline: false,
    });

    await interaction.reply({ embeds: [embed] });
  },
};
