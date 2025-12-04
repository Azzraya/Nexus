const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const Leveling = require("../utils/leveling");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("achievement")
    .setDescription("View achievements and badges")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View your or someone's achievements")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to check")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all available achievements")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "view") {
      const user = interaction.options.getUser("user") || interaction.user;
      const member = interaction.guild.members.cache.get(user.id);

      // Get user achievements
      const achievements = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM achievements WHERE guild_id = ? AND user_id = ?",
          [interaction.guild.id, user.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      // Get user stats for achievement calculation
      const levelData = await Leveling.getLevel(interaction.guild.id, user.id);
      const userStats = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM user_stats WHERE guild_id = ? AND user_id = ?",
          [interaction.guild.id, user.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || {});
          }
        );
      });

      // Check and award new achievements
      const newAchievements = await checkAchievements(
        interaction.guild.id,
        user.id,
        levelData,
        userStats,
        achievements
      );

      // Get updated achievements list
      const updatedAchievements = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM achievements WHERE guild_id = ? AND user_id = ?",
          [interaction.guild.id, user.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle(`🏆 Achievements - ${user.tag}`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setColor(0xffd700)
        .setTimestamp();

      if (updatedAchievements.length === 0) {
        embed.setDescription("No achievements unlocked yet!");
      } else {
        const achievementList = updatedAchievements
          .map((a) => {
            const data = JSON.parse(a.achievement_data || "{}");
            return `${getAchievementEmoji(a.achievement_type)} **${
              data.name || a.achievement_type
            }**\n${data.description || ""}`;
          })
          .join("\n\n");
        embed.setDescription(achievementList);
        embed.addFields({
          name: "📊 Total Achievements",
          value: `${updatedAchievements.length}/${getTotalAchievements()}`,
          inline: true,
        });
      }

      if (newAchievements.length > 0) {
        embed.addFields({
          name: "✨ New Achievements!",
          value: newAchievements.map((a) => `🎉 ${a.name}`).join("\n"),
          inline: false,
        });
      }

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "list") {
      const embed = new EmbedBuilder()
        .setTitle("🏆 Available Achievements")
        .setDescription(
          getAllAchievements()
            .map(
              (a) =>
                `${getAchievementEmoji(a.type)} **${a.name}**\n${
                  a.description
                }\n*Requirement: ${a.requirement}*`
            )
            .join("\n\n")
        )
        .setColor(0xffd700)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};

async function checkAchievements(
  guildId,
  userId,
  levelData,
  userStats,
  existing
) {
  const existingTypes = existing.map((a) => a.achievement_type);
  const allAchievements = getAllAchievements();
  const newAchievements = [];

  for (const achievement of allAchievements) {
    if (existingTypes.includes(achievement.type)) continue;

    let unlocked = false;
    switch (achievement.type) {
      case "first_message":
        unlocked = (userStats.messages_sent || 0) >= 1;
        break;
      case "level_10":
        unlocked = levelData.level >= 10;
        break;
      case "level_25":
        unlocked = levelData.level >= 25;
        break;
      case "level_50":
        unlocked = levelData.level >= 50;
        break;
      case "level_100":
        unlocked = levelData.level >= 100;
        break;
      case "messages_100":
        unlocked = (userStats.messages_sent || 0) >= 100;
        break;
      case "messages_1000":
        unlocked = (userStats.messages_sent || 0) >= 1000;
        break;
      case "messages_10000":
        unlocked = (userStats.messages_sent || 0) >= 10000;
        break;
    }

    if (unlocked) {
      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO achievements (guild_id, user_id, achievement_type, achievement_data, unlocked_at) VALUES (?, ?, ?, ?, ?)",
          [
            guildId,
            userId,
            achievement.type,
            JSON.stringify({
              name: achievement.name,
              description: achievement.description,
            }),
            Date.now(),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      newAchievements.push(achievement);
    }
  }

  return newAchievements;
}

function getAllAchievements() {
  return [
    {
      type: "first_message",
      name: "First Message",
      description: "Send your first message in the server",
      requirement: "Send 1 message",
    },
    {
      type: "level_10",
      name: "Rising Star",
      description: "Reach level 10",
      requirement: "Level 10",
    },
    {
      type: "level_25",
      name: "Experienced",
      description: "Reach level 25",
      requirement: "Level 25",
    },
    {
      type: "level_50",
      name: "Veteran",
      description: "Reach level 50",
      requirement: "Level 50",
    },
    {
      type: "level_100",
      name: "Legend",
      description: "Reach level 100",
      requirement: "Level 100",
    },
    {
      type: "messages_100",
      name: "Chatterbox",
      description: "Send 100 messages",
      requirement: "100 messages",
    },
    {
      type: "messages_1000",
      name: "Social Butterfly",
      description: "Send 1,000 messages",
      requirement: "1,000 messages",
    },
    {
      type: "messages_10000",
      name: "Chat Master",
      description: "Send 10,000 messages",
      requirement: "10,000 messages",
    },
  ];
}

function getTotalAchievements() {
  return getAllAchievements().length;
}

function getAchievementEmoji(type) {
  const emojis = {
    first_message: "👋",
    level_10: "⭐",
    level_25: "🌟",
    level_50: "💫",
    level_100: "✨",
    messages_100: "💬",
    messages_1000: "🗣️",
    messages_10000: "📢",
  };
  return emojis[type] || "🏆";
}
