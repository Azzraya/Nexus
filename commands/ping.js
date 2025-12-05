const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check how Nexus is doing!"),

  async execute(interaction) {
    const interactionTime = interaction.createdTimestamp;
    await interaction.deferReply();

    // Calculate roundtrip from interaction creation to now
    const roundtrip = Date.now() - interactionTime;
    const wsPing = interaction.client.ws.ping;

    const embed = new EmbedBuilder()
      .setTitle("🏓 Nexus Status")
      .addFields(
        {
          name: "WebSocket Ping",
          value: `${wsPing}ms`,
          inline: true,
        },
        {
          name: "Roundtrip Latency",
          value: `${roundtrip}ms`,
          inline: true,
        },
        {
          name: "Uptime",
          value: this.formatUptime(interaction.client.uptime),
          inline: false,
        },
        {
          name: "Servers",
          value: `${interaction.client.guilds.cache.size}`,
          inline: true,
        },
        {
          name: "Users",
          value: `${interaction.client.users.cache.size}`,
          inline: true,
        }
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  },
};
