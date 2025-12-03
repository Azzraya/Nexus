const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Get support and help with Nexus Bot"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("🆘 Nexus Bot Support")
      .setDescription("Need help? We're here for you!")
      .addFields(
        {
          name: "📚 Resources",
          value: [
            "• **Website** - View features, docs, and live stats",
            "• **Support Server** - Get help from our community",
            "• **Documentation** - Learn how to use Nexus",
            "• **GitHub** - View source code and report issues",
            "• **Commands** - Use `/help` to see all commands",
          ].join("\n"),
          inline: false,
        },
        {
          name: "🔗 Quick Links",
          value: [
            "• [Official Website](https://azzraya.github.io/Nexus/)",
            "• [Support Server](https://discord.com/invite/UHNcUKheZP)",
            "• [GitHub Repository](https://github.com/Azzraya/Nexus)",
            "• [Privacy Policy](https://github.com/Azzraya/Nexus/blob/main/PRIVACY_POLICY.md)",
            "• [Terms of Service](https://github.com/Azzraya/Nexus/blob/main/TERMS_OF_SERVICE.md)",
          ].join("\n"),
          inline: false,
        },
        {
          name: "❓ Common Questions",
          value: [
            "**Q: Is Nexus free?**\nA: Yes, 100% free with all features included.",
            "**Q: Is it open source?**\nA: Yes, view our code on GitHub.",
            "**Q: How is it different from Wick?**\nA: Nexus has AI features, better UX, and is open source.",
          ].join("\n\n"),
          inline: false,
        }
      )
      .setColor(0x0099ff)
      .setFooter({
        text: "Nexus - Beyond Wick. Free. Open Source. Powerful.",
      })
      .setTimestamp();

    const websiteButton = new ButtonBuilder()
      .setLabel("Visit Website")
      .setURL("https://azzraya.github.io/Nexus/")
      .setStyle(ButtonStyle.Link);

    const supportButton = new ButtonBuilder()
      .setLabel("Support Server")
      .setURL("https://discord.com/invite/UHNcUKheZP")
      .setStyle(ButtonStyle.Link);

    const githubButton = new ButtonBuilder()
      .setLabel("GitHub")
      .setURL("https://github.com/Azzraya/Nexus")
      .setStyle(ButtonStyle.Link);

    const inviteButton = new ButtonBuilder()
      .setLabel("Invite Bot")
      .setURL(
        `https://azzraya.github.io/Nexus/invite.html?source=discord-bot`
      )
      .setStyle(ButtonStyle.Link);

    const dashboardButton = new ButtonBuilder()
      .setLabel("🎛️ Dashboard")
      .setURL("https://regular-puma-clearly.ngrok-free.app")
      .setStyle(ButtonStyle.Link);

    const row = new ActionRowBuilder().addComponents(
      websiteButton,
      dashboardButton,
      supportButton,
      githubButton,
      inviteButton
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  },
};
