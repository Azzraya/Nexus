const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const DEV_USER_ID = "1392165977793368124";
const DEV_TIMEZONE_HINT = "Dev is usually online 2PM-4AM GMT";

// Helper function to format time ago
function formatTimeAgo(timestamp) {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Get support and help with Nexus Bot"),

  async execute(interaction) {
    const client = interaction.client;

    // Initialize dev tracking if not exists
    if (!client.devTracking) {
      client.devTracking = {
        lastSeen: null,
        currentStatus: null,
      };
    }

    // Try to get dev user and check their presence
    let devStatus = null;
    let devPresence = null;
    try {
      const devUser = await client.users.fetch(DEV_USER_ID).catch(() => null);
      if (devUser) {
        // Check if dev is in any shared guilds
        const sharedGuilds = client.guilds.cache.filter((guild) =>
          guild.members.cache.has(DEV_USER_ID)
        );

        if (sharedGuilds.size > 0) {
          const firstGuild = sharedGuilds.first();
          const devMember = await firstGuild.members
            .fetch(DEV_USER_ID)
            .catch(() => null);

          if (devMember?.presence) {
            devPresence = devMember.presence.status;
            // Update tracking
            client.devTracking.lastSeen = Date.now();
            client.devTracking.currentStatus = devPresence;
          }
        }
      }
    } catch (error) {
      // Silently fail - not critical
    }

    // Determine status message
    const isOnline =
      devPresence === "online" ||
      devPresence === "idle" ||
      devPresence === "dnd";
    const lastSeen = client.devTracking.lastSeen;

    let devStatusMessage = "";
    if (isOnline) {
      devStatusMessage = `✅ **Dev is currently online!** If you join the support server, your question will be answered in due time.\n\n⏰ ${DEV_TIMEZONE_HINT}`;
    } else if (lastSeen) {
      const timeAgo = formatTimeAgo(lastSeen);
      devStatusMessage = `⏸️ **Dev is currently offline.** Last seen: ${timeAgo}\n\n⏰ ${DEV_TIMEZONE_HINT}\n\n💬 Responses to support questions may be slower, but they will be gotten to!`;
    } else {
      devStatusMessage = `⏸️ **Dev is currently offline.**\n\n⏰ ${DEV_TIMEZONE_HINT}\n\n💬 Responses to support questions may be slower, but they will be gotten to!`;
    }

    const embed = new EmbedBuilder()
      .setTitle("🆘 Nexus Bot Support")
      .setDescription("Need help? We're here for you!")
      .addFields(
        {
          name: "👨‍💻 Developer Status",
          value: devStatusMessage,
          inline: false,
        },
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
            "• [Support Server](https://discord.gg/warmA4BsPP)",
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
      .setURL("https://discord.gg/warmA4BsPP")
      .setStyle(ButtonStyle.Link);

    const githubButton = new ButtonBuilder()
      .setLabel("GitHub")
      .setURL("https://github.com/Azzraya/Nexus")
      .setStyle(ButtonStyle.Link);

    const inviteButton = new ButtonBuilder()
      .setLabel("Invite Bot")
      .setURL(`https://azzraya.github.io/Nexus/invite.html?source=discord-bot`)
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
