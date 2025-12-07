const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Get the bot invite link"),

  async execute(interaction) {
    // Replace with your actual bot client ID
    const botId = interaction.client.user.id;
    // Permissions: Manage Roles (268435456) + Manage Channels (16) + Ban Members (4) + Kick Members (2) + Manage Messages (8192)
    // Plus basic: View Channels (1024) + Send Messages (2048) + Embed Links (16384) + Attach Files (32768) + Read Message History (65536) + Use External Emojis (262144)
    // Total: 268435456 + 16 + 4 + 2 + 8192 + 1024 + 2048 + 16384 + 32768 + 65536 + 262144 = 268443574
    const permissions = "268443574";
    const inviteUrl = `https://azzraya.github.io/Nexus/invite.html?source=discord-bot`;

    const embed = new EmbedBuilder()
      .setTitle("🔗 Invite Nexus Bot")
      .setDescription(
        "Add Nexus to your server for advanced security and moderation features!"
      )
      .addFields(
        {
          name: "✨ Features",
          value: [
            "🛡️ Advanced anti-raid & anti-nuke",
            "🤖 AI-powered security recommendations",
            "📊 Interactive dashboard",
            "🔓 Open source & 100% free",
          ].join("\n"),
          inline: false,
        },
        {
          name: "📋 Required Permissions",
          value: [
            "• Manage Roles (for auto-roles)",
            "• Manage Channels (for moderation)",
            "• Ban/Kick Members (for protection)",
            "• Manage Messages (for auto-mod)",
            "• View Channels, Send Messages (basic functionality)",
          ].join("\n"),
          inline: false,
        }
      )
      .setColor(0x0099ff)
      .setFooter({
        text: "Nexus - Beyond Wick. Free. Open Source. Powerful.",
      })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Invite Nexus")
        .setURL(inviteUrl)
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setLabel("Support Server")
        .setURL("https://discord.gg/warmA4BsPP")
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setLabel("GitHub")
        .setURL("https://github.com/Azzraya/Nexus")
        .setStyle(ButtonStyle.Link)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  },
};
