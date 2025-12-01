const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const SmartRecommendations = require("../utils/smartRecommendations");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recommend")
    .setDescription(
      "Get AI-powered security recommendations "
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("analyze")
        .setDescription("Analyze server and generate recommendations")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List all recommendations")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("acknowledge")
        .setDescription("Mark a recommendation as acknowledged")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("Recommendation ID")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "analyze") {
      await interaction.deferReply();

      const recommendations = await SmartRecommendations.analyzeServer(
        interaction.guild.id,
        interaction.guild
      );

      if (recommendations.length === 0) {
        return interaction.editReply({
          content:
            "✅ No recommendations at this time. Your server security looks good!",
        });
      }

      const highPriority = recommendations.filter((r) => r.priority === "high");
      const mediumPriority = recommendations.filter(
        (r) => r.priority === "medium"
      );
      const lowPriority = recommendations.filter((r) => r.priority === "low");

      const embed = new EmbedBuilder()
        .setTitle("🤖 Smart Recommendations")
        .setDescription("AI-powered security suggestions for your server")
        .setColor(0x0099ff)
        .setTimestamp();

      if (highPriority.length > 0) {
        embed.addFields({
          name: "🔴 High Priority",
          value: highPriority
            .map((r) => `**${r.title}**\n${r.description}`)
            .join("\n\n"),
          inline: false,
        });
      }

      if (mediumPriority.length > 0) {
        embed.addFields({
          name: "🟡 Medium Priority",
          value: mediumPriority
            .map((r) => `**${r.title}**\n${r.description}`)
            .join("\n\n"),
          inline: false,
        });
      }

      if (lowPriority.length > 0) {
        embed.addFields({
          name: "🟢 Low Priority",
          value: lowPriority
            .map((r) => `**${r.title}**\n${r.description}`)
            .join("\n\n"),
          inline: false,
        });
      }

      embed.setFooter({
        text: `Generated ${recommendations.length} recommendations`,
      });

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === "list") {
      const recommendations = await SmartRecommendations.getRecommendations(
        interaction.guild.id,
        true
      );

      if (recommendations.length === 0) {
        return interaction.reply({
          content:
            "✅ No unacknowledged recommendations. Use `/recommend analyze` to generate new ones.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Recommendations")
        .setDescription(
          recommendations
            .map(
              (r, i) =>
                `**${r.id}.** [${r.priority.toUpperCase()}] ${r.title}\n   ${
                  r.description
                }`
            )
            .join("\n\n")
        )
        .setColor(0x0099ff)
        .setFooter({
          text: `${recommendations.length} unacknowledged recommendations`,
        });

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "acknowledge") {
      const id = interaction.options.getInteger("id");
      await SmartRecommendations.acknowledgeRecommendation(
        id,
        interaction.user.id
      );

      await interaction.reply({
        content: `✅ Recommendation #${id} acknowledged`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
