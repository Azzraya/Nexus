const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("website")
    .setDescription("Get links to Nexus's official website and resources"),

  category: "info",

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor("#b794f6")
      .setTitle("🌐 Nexus Official Website")
      .setDescription(
        "Visit our website for comprehensive guides, documentation, and live stats!"
      )
      .addFields(
        {
          name: "🏠 Home",
          value: "[nexusbot.github.io](https://azzraya.github.io/Nexus/)",
          inline: true,
        },
        {
          name: "✨ Features",
          value:
            "[View Features](https://azzraya.github.io/Nexus/features.html)",
          inline: true,
        },
        {
          name: "📝 Commands",
          value:
            "[Command List](https://azzraya.github.io/Nexus/commands.html)",
          inline: true,
        },
        {
          name: "⚔️ vs Wick",
          value:
            "[Comparison Guide](https://azzraya.github.io/Nexus/comparison.html)",
          inline: true,
        },
        {
          name: "🛠️ Setup",
          value:
            "[Setup Guide](https://azzraya.github.io/Nexus/setup.html)",
          inline: true,
        },
        {
          name: "📚 Documentation",
          value: "[Full Docs](https://azzraya.github.io/Nexus/docs.html)",
          inline: true,
        },
        {
          name: "❓ FAQ",
          value:
            "[Frequently Asked Questions](https://azzraya.github.io/Nexus/faq.html)",
          inline: true,
        },
        {
          name: "📊 Live Stats",
          value:
            "[View Live Stats](https://azzraya.github.io/Nexus/stats.html)",
          inline: true,
        },
        {
          name: "🔗 Quick Links",
          value:
            "[Vote on Top.gg](https://top.gg/bot/1444739230679957646/vote)\n" +
            "[Support Server](https://discord.gg/your-server)\n" +
            "[Invite Nexus](https://discord.com/oauth2/authorize?client_id=1444739230679957646&permissions=268443574&scope=bot%20applications.commands)",
          inline: false,
        }
      )
      .setFooter({
        text: "Nexus - Beyond Wick. Beyond Everything.",
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
