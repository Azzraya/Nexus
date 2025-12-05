const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { version } = require("../package.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("View bot statistics, version, and information"),

  async execute(interaction, client) {
    try {
      const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const memoryUsage = process.memoryUsage();
    const memoryUsed = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const memoryTotal = Math.round(memoryUsage.heapTotal / 1024 / 1024);

    const totalUsers = client.guilds.cache.reduce(
      (acc, guild) => acc + guild.memberCount,
      0
    );

    const embed = new EmbedBuilder()
      .setTitle("🤖 Nexus Bot Information")
      .setDescription(
        "Advanced Discord security bot that **exceeds Wick** with AI-powered protection, 4 anti-raid algorithms, and 100% free features."
      )
      .addFields(
        {
          name: "📊 Statistics",
          value: [
            `**Servers:** ${client.guilds.cache.size.toLocaleString()}`,
            `**Users:** ${totalUsers.toLocaleString()}`,
            `**Commands:** ${client.commands ? client.commands.size : 99}`,
            `**Channels:** ${client.channels.cache.size.toLocaleString()}`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "⚡ Performance",
          value: [
            `**Uptime:** ${days}d ${hours}h ${minutes}m`,
            `**Ping:** ${client.ws.ping}ms`,
            `**Memory:** ${memoryUsed}MB / ${memoryTotal}MB`,
            `**Shards:** ${client.shard ? client.shard.count : 1}`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "🛡️ Security Features",
          value: [
            `✅ 4 Anti-Raid Algorithms`,
            `✅ AI Threat Prediction`,
            `✅ Auto-Recovery System`,
            `✅ 8 Automod Systems`,
            `✅ Member Screening`,
            `✅ Voice Monitoring`,
          ].join("\n"),
          inline: false,
        },
        {
          name: "🔧 Technical Info",
          value: [
            `**Version:** v${version}`,
            `**Node.js:** ${process.version}`,
            `**Discord.js:** v14.14.1`,
            `**API Latency:** ${Math.round(client.ws.ping)}ms`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "🌐 Links",
          value: [
            `[Website](https://azzraya.github.io/Nexus/)`,
            `[GitHub](https://github.com/Azzraya/Nexus)`,
            `[Dashboard](https://regular-puma-clearly.ngrok-free.app)`,
            `[Support](https://discord.gg/your-invite)`,
          ].join(" • "),
          inline: false,
        }
      )
      .setColor(0x667eea)
      .setThumbnail(client.user.displayAvatarURL())
      .setFooter({
        text: `Nexus v${version} | 100% Free • Open Source`,
      })
      .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      const ErrorHelper = require("../utils/errorHelper");
      ErrorHelper.logError(error, {
        commandName: "botinfo",
        userId: interaction.user?.id,
        guildId: interaction.guild?.id,
        channelId: interaction.channel?.id,
      });

      const errorInfo = ErrorHelper.getErrorMessage(error, {
        commandName: "botinfo",
      });

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            content: errorInfo.message || "❌ An error occurred while processing this command.",
            flags: require("discord.js").MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: errorInfo.message || "❌ An error occurred while processing this command.",
            flags: require("discord.js").MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        // Interaction expired or invalid - silently ignore
      }
    }
  },
};
