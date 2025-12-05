const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tutorial")
    .setDescription("Interactive tutorial to learn Nexus features")
    .addStringOption((option) =>
      option
        .setName("topic")
        .setDescription("Specific topic to learn about")
        .addChoices(
          { name: "🛡️ Security & Protection", value: "security" },
          { name: "⚙️ Basic Setup", value: "setup" },
          { name: "🎮 XP & Leveling", value: "xp" },
          { name: "🏆 Achievements & Events", value: "achievements" },
          { name: "🤖 Automod", value: "automod" },
          { name: "📊 Moderation", value: "moderation" },
          { name: "🔗 Integrations", value: "integrations" }
        )
    ),

  async execute(interaction) {
    const topic = interaction.options.getString("topic");

    if (topic) {
      return this.showTopic(interaction, topic);
    }

    // Show tutorial menu
    await this.showMenu(interaction);
  },

  async showMenu(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("🎓 Nexus Interactive Tutorial")
      .setDescription(
        "Welcome to Nexus! Choose a topic below to learn more about the bot's features.\n\n" +
          "**Topics:**\n" +
          "🛡️ **Security & Protection** - Anti-raid, anti-nuke, and security features\n" +
          "⚙️ **Basic Setup** - Get started with `/quicksetup`\n" +
          "🎮 **XP & Leveling** - Gamification and engagement\n" +
          "🏆 **Achievements & Events** - Community features\n" +
          "🤖 **Automod** - Automatic moderation\n" +
          "📊 **Moderation** - Moderation commands and tools\n" +
          "🔗 **Integrations** - Platform integrations"
      )
      .setColor(0x667eea)
      .setFooter({ text: "Use the buttons below or /tutorial topic:<name>" });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("tutorial_security")
        .setLabel("Security")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🛡️"),
      new ButtonBuilder()
        .setCustomId("tutorial_setup")
        .setLabel("Setup")
        .setStyle(ButtonStyle.Success)
        .setEmoji("⚙️"),
      new ButtonBuilder()
        .setCustomId("tutorial_xp")
        .setLabel("XP & Leveling")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎮")
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("tutorial_achievements")
        .setLabel("Achievements")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🏆"),
      new ButtonBuilder()
        .setCustomId("tutorial_automod")
        .setLabel("Automod")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🤖"),
      new ButtonBuilder()
        .setCustomId("tutorial_moderation")
        .setLabel("Moderation")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("📊")
    );

    const message = await interaction.reply({
      embeds: [embed],
      components: [row1, row2],
      fetchReply: true,
    });

    const collector = message.createMessageComponentCollector({
      time: 300000, // 5 minutes
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content:
            "This tutorial is not for you! Run `/tutorial` to start your own.",
          ephemeral: true,
        });
      }

      const topic = i.customId.replace("tutorial_", "");
      await i.deferUpdate();
      await this.showTopic(i, topic, true);
    });
  },

  async showTopic(interaction, topic, isUpdate = false) {
    const tutorials = {
      security: {
        title: "🛡️ Security & Protection",
        pages: [
          {
            title: "Anti-Raid System",
            description:
              "Nexus uses **4 detection algorithms** to catch raids:\n\n" +
              "1️⃣ **Join Rate** - Detects mass joins\n" +
              "2️⃣ **Account Age** - Flags new/suspicious accounts\n" +
              "3️⃣ **Username Pattern** - Detects similar names\n" +
              "4️⃣ **Behavior Analysis** - AI-powered detection\n\n" +
              "**Commands:**\n" +
              "`/antiraid config` - Configure settings\n" +
              "`/antiraid status` - View current status\n" +
              "`/antiraid whitelist` - Manage whitelist",
            color: 0xff0000,
          },
          {
            title: "Anti-Nuke Protection",
            description:
              "Protects against server destruction:\n\n" +
              "✅ **Channel Protection** - Prevents mass channel deletion\n" +
              "✅ **Role Protection** - Stops unauthorized role changes\n" +
              "✅ **Permission Monitoring** - Detects dangerous permission grants\n" +
              "✅ **Instant Lockdown** - Automatic server lockdown on threat\n\n" +
              "**Commands:**\n" +
              "`/antinuke enable` - Enable protection\n" +
              "`/security rolecheck` - Check role hierarchy",
            color: 0xff0000,
          },
        ],
      },
      setup: {
        title: "⚙️ Basic Setup",
        pages: [
          {
            title: "Quick Setup Wizard",
            description:
              "Get started in **under 2 minutes**:\n\n" +
              "1️⃣ Run `/quicksetup`\n" +
              "2️⃣ Enable security features\n" +
              "3️⃣ Set up logging channel\n" +
              "4️⃣ Configure automod\n\n" +
              "The wizard will guide you through each step with buttons and explanations.\n\n" +
              "**Pro Tip:** You can always change settings later with specific commands!",
            color: 0x00ff88,
          },
          {
            title: "Essential Commands",
            description:
              "**Configuration:**\n" +
              "`/config logchannel` - Set logging channel\n" +
              "`/config prefix` - Change bot prefix\n\n" +
              "**Security:**\n" +
              "`/antiraid config` - Configure anti-raid\n" +
              "`/automod config` - Set up automod\n\n" +
              "**Moderation:**\n" +
              "`/warn`, `/kick`, `/ban` - Basic moderation\n" +
              "`/purge` - Bulk message deletion\n\n" +
              "**Info:**\n" +
              "`/help` - List all commands\n" +
              "`/botinfo` - Bot statistics",
            color: 0x00ff88,
          },
        ],
      },
      xp: {
        title: "🎮 XP & Leveling System",
        pages: [
          {
            title: "How XP Works",
            description:
              "Earn XP by being active:\n\n" +
              "💬 **Messages** - Earn 15-25 XP per message\n" +
              "🎤 **Voice Activity** - Earn 10 XP per minute\n" +
              "🏆 **Achievements** - Bonus XP rewards\n\n" +
              "**Level Formula:**\n" +
              "XP needed = (level × 10)²\n\n" +
              "**Cooldown:** 60 seconds between XP gains\n" +
              "(Prevents spam)",
            color: 0x667eea,
          },
          {
            title: "Commands & Configuration",
            description:
              "**User Commands:**\n" +
              "`/xp rank` - View your XP card\n" +
              "`/xp leaderboard` - See top members\n\n" +
              "**Admin Commands:**\n" +
              "`/xp config` - Configure XP rates\n" +
              "`/xp reward` - Set level rewards\n" +
              "`/xp add/remove` - Manual XP adjustment\n\n" +
              "**Features:**\n" +
              "✅ Level-up announcements\n" +
              "✅ Role rewards at milestones\n" +
              "✅ Ignored channels/roles\n" +
              "✅ XP multipliers for boosters",
            color: 0x667eea,
          },
        ],
      },
      achievements: {
        title: "🏆 Achievements & Events",
        pages: [
          {
            title: "Achievement System",
            description:
              "Unlock achievements by reaching milestones:\n\n" +
              "**Types:**\n" +
              "🌱 **Level Achievements** - Reach levels 10, 25, 50, 75, 100\n" +
              "💬 **Message Milestones** - Send 100, 1K, 10K messages\n" +
              "🎤 **Voice Activity** - 1hr, 10hr, 100hr in voice\n" +
              "🌅 **Special** - Early Bird, Night Owl, Helpful\n\n" +
              "**Rarities:** Common, Uncommon, Rare, Epic, Legendary\n\n" +
              "`/achievements view` - View your achievements\n" +
              "`/achievements list` - See all achievements",
            color: 0xffd700,
          },
          {
            title: "Server Events",
            description:
              "Create and manage server events:\n\n" +
              "`/event create` - Create a new event\n" +
              "`/event list` - View upcoming events\n" +
              "`/event info <id>` - Detailed event info\n" +
              "`/event rsvp <id>` - RSVP to an event\n\n" +
              "**Features:**\n" +
              "✅ RSVP tracking (Going/Maybe/Not Going)\n" +
              "✅ Participant limits\n" +
              "✅ Automatic countdowns\n" +
              "✅ Interactive buttons\n" +
              "✅ Event reminders",
            color: 0xffd700,
          },
        ],
      },
      automod: {
        title: "🤖 Automod System",
        pages: [
          {
            title: "What Gets Detected",
            description:
              "**Spam Detection:**\n" +
              "• Message spam (5+ messages in 5 seconds)\n" +
              "• Repeated content\n" +
              "• Emoji spam\n\n" +
              "**Content Scanning:**\n" +
              "• Malicious links\n" +
              "• Discord invites\n" +
              "• Excessive caps (>70%)\n" +
              "• Mass mentions (@everyone abuse)\n\n" +
              "**Actions:** Warn, Timeout, Kick, or Ban\n" +
              "**Configurable:** Set thresholds and actions",
            color: 0x0099ff,
          },
          {
            title: "Configuration",
            description:
              "`/automod config` - Main configuration\n" +
              "`/automod enable` - Enable/disable\n" +
              "`/automod whitelist` - Whitelist users/channels\n\n" +
              "**Settings You Can Customize:**\n" +
              "• Spam threshold (messages per second)\n" +
              "• Caps percentage limit\n" +
              "• Link scanning (whitelist/blacklist)\n" +
              "• Invite blocking\n" +
              "• Punishment actions\n" +
              "• Ignored channels/roles\n\n" +
              "**Smart Features:**\n" +
              "✅ Auto-deletes violating messages\n" +
              "✅ Escalating punishments\n" +
              "✅ Logs all actions",
            color: 0x0099ff,
          },
        ],
      },
      moderation: {
        title: "📊 Moderation Tools",
        pages: [
          {
            title: "Basic Moderation",
            description:
              "**User Actions:**\n" +
              "`/warn <user> <reason>` - Issue warning\n" +
              "`/timeout <user> <duration>` - Timeout user\n" +
              "`/kick <user>` - Kick from server\n" +
              "`/ban <user>` - Ban from server\n" +
              "`/unban <user>` - Unban user\n\n" +
              "**Message Management:**\n" +
              "`/purge <amount>` - Delete messages\n" +
              "`/slowmode <seconds>` - Set slowmode\n\n" +
              "**Logs:**\n" +
              "`/warnings <user>` - View warnings\n" +
              "`/modlogs` - View mod actions",
            color: 0xff4444,
          },
          {
            title: "Advanced Tools",
            description:
              "**Bulk Actions:**\n" +
              "`/bulk ban` - Mass ban users\n" +
              "`/bulk kick` - Mass kick users\n" +
              "`/bulk timeout` - Mass timeout\n\n" +
              "**Lockdown:**\n" +
              "`/lock` - Lock channel/server\n" +
              "`/unlock` - Unlock channel/server\n\n" +
              "**Case Management:**\n" +
              "`/cases <user>` - View user's cases\n" +
              "`/case <id>` - View specific case\n\n" +
              "**Audit:**\n" +
              "`/auditlog` - Search audit logs",
            color: 0xff4444,
          },
        ],
      },
      integrations: {
        title: "🔗 Platform Integrations",
        description:
          "**Coming Soon:**\n\n" +
          "🎮 **Twitch** - Stream notifications, sub alerts\n" +
          "📺 **YouTube** - Upload & live stream alerts\n" +
          "📋 **Trello** - Task management sync\n" +
          "📝 **Notion** - Note-taking integration\n" +
          "📅 **Google Calendar** - Event sync\n\n" +
          "Stay tuned for these features in upcoming updates!",
        color: 0x9b59b6,
        pages: [
          {
            title: "Platform Integrations (Coming Soon)",
            description:
              "**Planned Features:**\n\n" +
              "🎮 **Twitch Integration**\n" +
              "• Stream go-live notifications\n" +
              "• Subscriber alerts\n" +
              "• Clip sharing\n\n" +
              "📺 **YouTube Integration**\n" +
              "• Upload notifications\n" +
              "• Live stream alerts\n" +
              "• Premiere reminders\n\n" +
              "📋 **Productivity Tools**\n" +
              "• Trello board sync\n" +
              "• Notion integration\n" +
              "• Calendar events\n\n" +
              "These features are in development!",
            color: 0x9b59b6,
          },
        ],
      },
    };

    const tutorial = tutorials[topic];
    if (!tutorial.pages) {
      tutorial.pages = [
        {
          title: tutorial.title,
          description: tutorial.description,
          color: tutorial.color,
        },
      ];
    }

    let currentPage = 0;

    const showPage = async (pageNum, isUpdate = false) => {
      const page = tutorial.pages[pageNum];

      const embed = new EmbedBuilder()
        .setTitle(tutorial.title)
        .setDescription(`**${page.title}**\n\n${page.description}`)
        .setColor(page.color || tutorial.color || 0x667eea)
        .setFooter({
          text: `Page ${pageNum + 1}/${tutorial.pages.length} • Use /help for command list`,
        });

      const row = new ActionRowBuilder();

      if (tutorial.pages.length > 1) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId("prev")
            .setLabel("◀ Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pageNum === 0),
          new ButtonBuilder()
            .setCustomId("next")
            .setLabel("Next ▶")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(pageNum === tutorial.pages.length - 1)
        );
      }

      row.addComponents(
        new ButtonBuilder()
          .setCustomId("menu")
          .setLabel("📚 Back to Menu")
          .setStyle(ButtonStyle.Success)
      );

      const components = row.components.length > 0 ? [row] : [];

      if (isUpdate) {
        await interaction.editReply({ embeds: [embed], components });
      } else {
        const message = await interaction.reply({
          embeds: [embed],
          components,
          fetchReply: true,
          ephemeral: true,
        });

        const collector = message.createMessageComponentCollector({
          time: 300000,
        });

        collector.on("collect", async (i) => {
          if (i.user.id !== interaction.user.id) {
            return i.reply({
              content: "This tutorial is not for you!",
              ephemeral: true,
            });
          }

          if (i.customId === "prev") {
            currentPage--;
            await i.deferUpdate();
            await showPage(currentPage, true);
          } else if (i.customId === "next") {
            currentPage++;
            await i.deferUpdate();
            await showPage(currentPage, true);
          } else if (i.customId === "menu") {
            await i.deferUpdate();
            await this.showMenu(i);
          }
        });
      }
    };

    await showPage(0, isUpdate);
  },
};
