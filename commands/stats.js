const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const StatsTracker = require("../utils/statsTracker");
const Owner = require("../utils/owner");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View bot statistics (competitive with Wick)")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("server")
        .setDescription("View server-specific statistics")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("global").setDescription("View global bot statistics")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    // Global stats are owner-only
    if (subcommand === "global") {
      if (!Owner.isOwner(interaction.user.id)) {
        return interaction.reply({
          content: "❌ Only the bot owner can view global statistics!",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    if (subcommand === "server") {
      await interaction.deferReply();

      const stats = await StatsTracker.getServerStats(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle("📊 Server Statistics")
        .setDescription(`Statistics for ${interaction.guild.name}`)
        .addFields(
          {
            name: "🛡️ Protection",
            value: [
              `**Raids Stopped:** ${stats.raids_stopped}`,
              `**Nukes Stopped:** ${stats.nukes_stopped}`,
              `**Threats Detected:** ${stats.threats_detected}`,
            ].join("\n"),
            inline: true,
          },
          {
            name: "📈 Activity",
            value: [
              `**Total Events:** ${stats.total_events}`,
              `**Members Joined:** ${stats.members_joined}`,
            ].join("\n"),
            inline: true,
          }
        )
        .setColor(0x0099ff)
        .setTimestamp()
        .setFooter({
          text: "Nexus - Beyond Wick. Free. Open Source. Powerful.",
        });

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === "global") {
      await interaction.deferReply();

      const stats = await StatsTracker.getGlobalStats();

      const embed = new EmbedBuilder()
        .setTitle("🌍 Global Statistics")
        .setDescription("Nexus Bot Statistics Across All Servers")
        .addFields(
          {
            name: "📊 Overview",
            value: [
              `**Total Servers:** ${StatsTracker.formatNumber(
                stats.total_servers
              )}`,
              `**Total Events:** ${StatsTracker.formatNumber(
                stats.total_events
              )}`,
            ].join("\n"),
            inline: true,
          },
          {
            name: "🛡️ Protection",
            value: [
              `**Raids Stopped:** ${StatsTracker.formatNumber(
                stats.raids_stopped
              )}`,
              `**Nukes Stopped:** ${StatsTracker.formatNumber(
                stats.nukes_stopped
              )}`,
              `**Threats Detected:** ${StatsTracker.formatNumber(
                stats.threats_detected
              )}`,
            ].join("\n"),
            inline: true,
          }
        )
        .setColor(0x00ff00)
        .setTimestamp()
        .setFooter({
          text: "Nexus - Beyond Wick. Free. Open Source. Powerful.",
        });

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
