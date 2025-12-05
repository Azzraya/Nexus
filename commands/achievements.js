const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("achievements")
    .setDescription("View and manage achievements")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View your achievements")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to check (leave empty for yourself)")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all available achievements")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("progress")
        .setDescription("Check your progress towards achievements")
    ),

  async execute(interaction, client) {
    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "view") {
        await this.handleView(interaction);
      } else if (subcommand === "list") {
        await this.handleList(interaction);
      } else if (subcommand === "progress") {
        await this.handleProgress(interaction, client);
      }
    } catch (error) {
      const ErrorHelper = require("../utils/errorHelper");
      ErrorHelper.logError(error, {
        commandName: "achievements",
        userId: interaction.user?.id,
        guildId: interaction.guild?.id,
        channelId: interaction.channel?.id,
      });

      const errorInfo = ErrorHelper.getErrorMessage(error, {
        commandName: "achievements",
      });

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            content: errorInfo.message || "❌ An error occurred while processing this command.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: errorInfo.message || "❌ An error occurred while processing this command.",
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        // Interaction expired or invalid - silently ignore
      }
    }
  },

  async handleView(interaction) {
    try {
      const user = interaction.options.getUser("user") || interaction.user;
      const achievements = await db.getUserAchievements(
        interaction.guild.id,
        user.id
      );

      if (!achievements || achievements.length === 0) {
        return interaction.reply({
          content: `${user.username || user.tag} hasn't unlocked any achievements yet!`,
          flags: MessageFlags.Ephemeral,
        });
      }

    const rarityColors = {
      common: 0x808080,
      uncommon: 0x00ff00,
      rare: 0x0080ff,
      epic: 0x8000ff,
      legendary: 0xffd700,
    };

    const pages = [];
    const perPage = 5;

    for (let i = 0; i < achievements.length; i += perPage) {
      const pageAchievements = achievements.slice(i, i + perPage);

      const embed = new EmbedBuilder()
        .setTitle(`${user.username}'s Achievements`)
        .setThumbnail(user.displayAvatarURL())
        .setColor(0x667eea)
        .setDescription(
          pageAchievements
            .map(
              (a) =>
                `${a.icon || "🏆"} **${a.name || "Unknown"}** (${a.rarity || "common"})\n` +
                `${a.description || "No description"}\n` +
                `Unlocked: <t:${Math.floor((a.unlocked_at || Date.now()) / 1000)}:R>`
            )
            .join("\n\n")
        )
        .setFooter({
          text: `Page ${pages.length + 1} • ${achievements.length} total achievements`,
        });

      pages.push(embed);
    }

    if (pages.length === 1) {
      return interaction.reply({ embeds: [pages[0]] });
    }

    // Multiple pages - add navigation buttons
    let currentPage = 0;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("prev")
        .setLabel("◀")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("next")
        .setLabel("▶")
        .setStyle(ButtonStyle.Primary)
    );

    const message = await interaction.reply({
      embeds: [pages[0]],
      components: [row],
      fetchReply: true,
    });

    const collector = message.createMessageComponentCollector({
      time: 60000,
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: "These aren't your achievements!",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (i.customId === "prev") {
        currentPage--;
      } else {
        currentPage++;
      }

      row.components[0].setDisabled(currentPage === 0);
      row.components[1].setDisabled(currentPage === pages.length - 1);

      await i.update({
        embeds: [pages[currentPage]],
        components: [row],
      });
    });

    collector.on("end", () => {
      row.components.forEach((button) => button.setDisabled(true));
      message.edit({ components: [row] }).catch(() => {});
    });
    } catch (error) {
      throw error; // Re-throw to be caught by execute
    }
  },

  async handleList(interaction) {
    try {
      await interaction.deferReply();

      const achievements = await db.getAllAchievements();

      if (!achievements || achievements.length === 0) {
      // Create default achievements
      await this.createDefaultAchievements();
      const newAchievements = await db.getAllAchievements();

      const embed = new EmbedBuilder()
        .setTitle("🏆 All Achievements")
        .setDescription(
          newAchievements
            .map(
              (a) => `${a.icon} **${a.name}** (${a.rarity})\n${a.description}`
            )
            .join("\n\n")
        )
        .setColor(0xffd700);

      return interaction.editReply({ embeds: [embed] });
    }

    const rarityOrder = {
      common: 1,
      uncommon: 2,
      rare: 3,
      epic: 4,
      legendary: 5,
    };
    const sorted = achievements.sort(
      (a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]
    );

    const embed = new EmbedBuilder()
      .setTitle("🏆 All Achievements")
      .setDescription(
        sorted
            .map((a) => `${a.icon || "🏆"} **${a.name || "Unknown"}** (${a.rarity || "common"})\n${a.description || "No description"}`)
          .join("\n\n")
      )
      .setColor(0xffd700)
      .setFooter({ text: `${achievements.length} achievements available` });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      throw error; // Re-throw to be caught by execute
    }
  },

  async handleProgress(interaction, client) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const userData = await db.getUserXP(
        interaction.guild.id,
        interaction.user.id
      );
      const userAchievements = await db.getUserAchievements(
        interaction.guild.id,
        interaction.user.id
      ) || [];
      const allAchievements = await db.getAllAchievements() || [];

      const unlocked = new Set((userAchievements || []).map((a) => a.achievement_id));
      const pending = (allAchievements || []).filter(
        (a) => !unlocked.has(a.achievement_id)
      );

      const embed = new EmbedBuilder()
        .setTitle("📊 Achievement Progress")
        .setColor(0x667eea)
        .addFields(
          {
            name: "Unlocked",
            value: `${userAchievements.length} / ${allAchievements.length}`,
            inline: true,
          },
          {
            name: "Progress",
            value: `${Math.floor((userAchievements.length / allAchievements.length) * 100)}%`,
            inline: true,
          }
        );

      if (userData && pending.length > 0 && client.xpSystem) {
        const level = client.xpSystem.calculateLevel(userData.xp);

      const closest = pending
        .filter((a) => a.requirement_type === "level")
        .sort((a, b) => a.requirement_value - b.requirement_value)
        .slice(0, 3);

      if (closest.length > 0) {
        embed.addFields({
          name: "Next Achievements",
          value: closest
            .map((a) => {
              const progress =
                level >= a.requirement_value
                  ? 100
                  : Math.floor((level / a.requirement_value) * 100);
              return `${a.icon || "🏆"} **${a.name || "Unknown"}**\nProgress: ${progress}% (${level}/${a.requirement_value || 0})`;
            })
            .join("\n\n"),
        });
      }
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      throw error; // Re-throw to be caught by execute
    }
  },

  async createDefaultAchievements() {
    const achievements = [
      // Level achievements
      {
        id: "level_10",
        name: "Novice",
        description: "Reach level 10",
        icon: "🌱",
        type: "level",
        value: 10,
        xp: 100,
        rarity: "common",
      },
      {
        id: "level_25",
        name: "Apprentice",
        description: "Reach level 25",
        icon: "⭐",
        type: "level",
        value: 25,
        xp: 250,
        rarity: "uncommon",
      },
      {
        id: "level_50",
        name: "Expert",
        description: "Reach level 50",
        icon: "💎",
        type: "level",
        value: 50,
        xp: 500,
        rarity: "rare",
      },
      {
        id: "level_75",
        name: "Master",
        description: "Reach level 75",
        icon: "👑",
        type: "level",
        value: 75,
        xp: 750,
        rarity: "epic",
      },
      {
        id: "level_100",
        name: "Legend",
        description: "Reach level 100",
        icon: "🏆",
        type: "level",
        value: 100,
        xp: 1000,
        rarity: "legendary",
      },

      // Message achievements
      {
        id: "messages_100",
        name: "Chatterbox",
        description: "Send 100 messages",
        icon: "💬",
        type: "messages",
        value: 100,
        xp: 50,
        rarity: "common",
      },
      {
        id: "messages_1000",
        name: "Conversationalist",
        description: "Send 1,000 messages",
        icon: "🗣️",
        type: "messages",
        value: 1000,
        xp: 200,
        rarity: "uncommon",
      },
      {
        id: "messages_10000",
        name: "Community Voice",
        description: "Send 10,000 messages",
        icon: "📢",
        type: "messages",
        value: 10000,
        xp: 1000,
        rarity: "rare",
      },

      // Voice achievements
      {
        id: "voice_60",
        name: "Voice Regular",
        description: "Spend 60 minutes in voice",
        icon: "🎤",
        type: "voice",
        value: 60,
        xp: 100,
        rarity: "common",
      },
      {
        id: "voice_600",
        name: "Voice Enthusiast",
        description: "Spend 10 hours in voice",
        icon: "🎧",
        type: "voice",
        value: 600,
        xp: 500,
        rarity: "uncommon",
      },
      {
        id: "voice_6000",
        name: "Voice Legend",
        description: "Spend 100 hours in voice",
        icon: "🎵",
        type: "voice",
        value: 6000,
        xp: 2000,
        rarity: "epic",
      },

      // Special achievements
      {
        id: "early_bird",
        name: "Early Bird",
        description: "Active before 6 AM",
        icon: "🌅",
        type: "special",
        value: 1,
        xp: 50,
        rarity: "uncommon",
      },
      {
        id: "night_owl",
        name: "Night Owl",
        description: "Active after midnight",
        icon: "🦉",
        type: "special",
        value: 1,
        xp: 50,
        rarity: "uncommon",
      },
      {
        id: "helpful",
        name: "Helpful Member",
        description: "Receive 10 thank you reactions",
        icon: "🤝",
        type: "special",
        value: 10,
        xp: 100,
        rarity: "rare",
      },
    ];

    for (const achievement of achievements) {
      await new Promise((resolve, reject) => {
        db.db.run(
          `INSERT OR IGNORE INTO achievements (achievement_id, name, description, icon, requirement_type, requirement_value, reward_xp, rarity)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            achievement.id,
            achievement.name,
            achievement.description,
            achievement.icon,
            achievement.type,
            achievement.value,
            achievement.xp,
            achievement.rarity,
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
  },
};
