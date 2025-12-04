const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("modlogs")
    .setDescription("View moderation logs")
    .addUserOption((option) =>
      option.setName("user").setDescription("Filter by user").setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription("Number of logs to show (1-25)")
        .setMinValue(1)
        .setMaxValue(25)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const limit = interaction.options.getInteger("limit") || 10;

    const logs = await db.getModLogs(interaction.guild.id, user?.id, limit);

    if (logs.length === 0) {
      return interaction.reply({
        embeds: [
          {
            title: "📋 Moderation Logs",
            description: "No logs found",
            color: 0x0099ff,
          },
        ],
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📋 Moderation Logs${user ? ` for ${user.tag}` : ""}`)
      .setColor(0x0099ff)
      .setTimestamp();

    const logsList = logs.slice(0, 10).map((log) => {
      const date = new Date(log.timestamp).toLocaleString();
      return `**${log.action.toUpperCase()}** - <@!${log.user_id}> by <@!${
        log.moderator_id
      }>\nReason: ${log.reason}\n${date}`;
    });

    embed.setDescription(logsList.join("\n\n"));

    await interaction.reply({ embeds: [embed] });
  },
};
