const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vibe")
    .setDescription("🎵 Check the bot's current vibe"),
  category: "fun",

  async execute(interaction) {
    const uptime = interaction.client.uptime;
    const hours = Math.floor(uptime / 3600000);
    const servers = interaction.client.guilds.cache.size;

    let vibe, emoji, color, description;

    if (hours < 1) {
      vibe = "Fresh Boot Energy";
      emoji = "🚀";
      color = 0x00ff00;
      description =
        "Just woke up and ready to protect servers! Everything is optimized, cached, and lightning fast. Let's go!";
    } else if (hours < 24) {
      vibe = "Peak Performance Mode";
      emoji = "💪";
      color = 0x00d1b2;
      description =
        "Running smooth like butter. All systems green. Raids? Bring 'em on. I'm in the zone.";
    } else if (hours < 168) {
      vibe = "Steady & Reliable";
      emoji = "😎";
      color = 0x3498db;
      description =
        "Been up for a few days. Database is warm, cache is loaded, everything is humming along nicely.";
    } else {
      vibe = "Veteran Status";
      emoji = "🛡️";
      color = 0x9b59b6;
      description =
        "I've seen things. Raids, nukes, spam attacks. Still standing. Still protecting. This is what I was built for.";
    }

    // Add server count influence
    if (servers < 10) {
      description +=
        "\n\n*Small server count means focused protection. Quality over quantity!*";
    } else if (servers < 50) {
      description +=
        "\n\n*Growing steadily! Each new server makes me stronger.*";
    } else if (servers < 100) {
      description +=
        "\n\n*Approaching 100 servers! The scaling is real and I'm handling it.*";
    } else {
      description += "\n\n*100+ servers! We're really doing this! 🚀*";
    }

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} Current Vibe: ${vibe}`)
      .setDescription(description)
      .addFields(
        {
          name: "⏰ Uptime",
          value: `${hours}h ${Math.floor((uptime % 3600000) / 60000)}m`,
          inline: true,
        },
        {
          name: "🏠 Servers",
          value: `${servers} protected`,
          inline: true,
        },
        {
          name: "💚 Status",
          value: "All Systems Operational",
          inline: true,
        }
      )
      .setColor(color)
      .setFooter({
        text: "Vibes are immaculate. Protection is active. Coffee is brewing. ☕",
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
