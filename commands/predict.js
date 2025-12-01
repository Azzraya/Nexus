const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const IntelligentDetection = require("../utils/intelligentDetection");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("predict")
    .setDescription("Predict potential security threats")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply();

    // Get recent joins
    const recentJoins = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM anti_raid_state WHERE guild_id = ?",
        [interaction.guild.id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    const members = [];
    for (const join of recentJoins.slice(0, 10)) {
      try {
        const member = await interaction.guild.members
          .fetch(join.user_id)
          .catch(() => null);
        if (member) members.push(member);
      } catch (error) {
        const ErrorHandler = require("../utils/errorHandler");
        ErrorHandler.logError(
          error,
          `predict [${interaction.guild.id}]`,
          `Fetch member ${userId}`
        );
      }
    }

    const predictions = await IntelligentDetection.predictAttack(
      interaction.guild,
      members
    );

    const embed = new EmbedBuilder()
      .setTitle("🔮 Threat Prediction")
      .addFields(
        {
          name: "Raid Likelihood",
          value: `${predictions.raidLikelihood}%`,
          inline: true,
        },
        {
          name: "Nuke Likelihood",
          value: `${predictions.nukeLikelihood}%`,
          inline: true,
        },
        {
          name: "Spam Likelihood",
          value: `${predictions.spamLikelihood}%`,
          inline: true,
        },
        {
          name: "Confidence",
          value: `${predictions.confidence}%`,
          inline: true,
        }
      )
      .setColor(
        predictions.raidLikelihood > 50
          ? 0xff0000
          : predictions.raidLikelihood > 30
          ? 0xff8800
          : 0x00ff00
      )
      .setTimestamp();

    if (predictions.raidLikelihood > 50) {
      embed.addFields({
        name: "⚠️ Recommendation",
        value:
          "Consider enabling lockdown mode or increasing anti-raid sensitivity",
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
