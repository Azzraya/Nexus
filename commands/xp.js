const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("xp")
    .setDescription("Manage the XP and leveling system")
    .addSubcommand(subcommand =>
      subcommand
        .setName("rank")
        .setDescription("Check your or someone else's XP and level")
        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("User to check (leave empty for yourself)")
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("leaderboard")
        .setDescription("View the server XP leaderboard")
        .addIntegerOption(option =>
          option
            .setName("page")
            .setDescription("Page number")
            .setMinValue(1)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("config")
        .setDescription("Configure XP settings")
        .addBooleanOption(option =>
          option
            .setName("enabled")
            .setDescription("Enable/disable XP system")
        )
        .addIntegerOption(option =>
          option
            .setName("xp_per_message")
            .setDescription("XP gained per message")
            .setMinValue(1)
            .setMaxValue(100)
        )
        .addIntegerOption(option =>
          option
            .setName("cooldown")
            .setDescription("Cooldown between XP gains (seconds)")
            .setMinValue(10)
            .setMaxValue(300)
        )
        .addChannelOption(option =>
          option
            .setName("levelup_channel")
            .setDescription("Channel for level up announcements")
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("reward")
        .setDescription("Add/remove level rewards")
        .addIntegerOption(option =>
          option
            .setName("level")
            .setDescription("Level for the reward")
            .setRequired(true)
            .setMinValue(1)
        )
        .addRoleOption(option =>
          option
            .setName("role")
            .setDescription("Role to award (leave empty to remove)")
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("rewards")
        .setDescription("List all level rewards")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("add")
        .setDescription("Manually add XP to a user")
        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("User to award XP to")
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName("amount")
            .setDescription("Amount of XP to add")
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("remove")
        .setDescription("Manually remove XP from a user")
        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("User to remove XP from")
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName("amount")
            .setDescription("Amount of XP to remove")
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("reset")
        .setDescription("Reset a user's XP and level")
        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("User to reset")
            .setRequired(true)
        )
    ),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "rank") {
      await this.handleRank(interaction, client);
    } else if (subcommand === "leaderboard") {
      await this.handleLeaderboard(interaction, client);
    } else if (subcommand === "config") {
      await this.handleConfig(interaction, client);
    } else if (subcommand === "reward") {
      await this.handleReward(interaction, client);
    } else if (subcommand === "rewards") {
      await this.handleRewards(interaction, client);
    } else if (subcommand === "add") {
      await this.handleAdd(interaction, client);
    } else if (subcommand === "remove") {
      await this.handleRemove(interaction, client);
    } else if (subcommand === "reset") {
      await this.handleReset(interaction, client);
    }
  },

  async handleRank(interaction, client) {
    const user = interaction.options.getUser("user") || interaction.user;
    const userData = await db.getUserXP(interaction.guild.id, user.id);

    if (!userData) {
      return interaction.reply({
        content: `${user.tag} hasn't earned any XP yet!`,
        ephemeral: true
      });
    }

    const level = client.xpSystem.calculateLevel(userData.xp);
    const nextLevelXP = client.xpSystem.xpForLevel(level);
    const progress = Math.floor((userData.xp / nextLevelXP) * 100);

    // Get rank position
    const leaderboard = await db.getXPLeaderboard(interaction.guild.id, 1000);
    const rank = leaderboard.findIndex(u => u.user_id === user.id) + 1;

    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s XP Card`)
      .setThumbnail(user.displayAvatarURL())
      .setColor(0x667eea)
      .addFields(
        { name: "Level", value: `${level}`, inline: true },
        { name: "XP", value: `${userData.xp.toLocaleString()} / ${nextLevelXP.toLocaleString()}`, inline: true },
        { name: "Rank", value: `#${rank}`, inline: true },
        { name: "Messages", value: `${userData.messages_sent.toLocaleString()}`, inline: true },
        { name: "Voice Minutes", value: `${userData.voice_minutes.toLocaleString()}`, inline: true },
        { name: "Progress", value: `${'▓'.repeat(Math.floor(progress / 10))}${'░'.repeat(10 - Math.floor(progress / 10))} ${progress}%`, inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  async handleLeaderboard(interaction, client) {
    await interaction.deferReply();

    const page = interaction.options.getInteger("page") || 1;
    const perPage = 10;
    const offset = (page - 1) * perPage;

    const allUsers = await db.getXPLeaderboard(interaction.guild.id, 1000);
    const pageUsers = allUsers.slice(offset, offset + perPage);

    if (pageUsers.length === 0) {
      return interaction.editReply({
        content: "No users found on this page!",
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🏆 XP Leaderboard - Page ${page}`)
      .setColor(0xffd700)
      .setDescription(
        pageUsers.map((user, index) => {
          const rank = offset + index + 1;
          const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
          const level = client.xpSystem.calculateLevel(user.xp);
          return `${medal} <@${user.user_id}> - Level **${level}** (${user.xp.toLocaleString()} XP)`;
        }).join("\n")
      )
      .setFooter({ text: `Total users: ${allUsers.length}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },

  async handleConfig(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "You need Administrator permission to configure XP settings!",
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const config = {};
    const enabled = interaction.options.getBoolean("enabled");
    const xpPerMessage = interaction.options.getInteger("xp_per_message");
    const cooldown = interaction.options.getInteger("cooldown");
    const channel = interaction.options.getChannel("levelup_channel");

    if (enabled !== null) config.enabled = enabled ? 1 : 0;
    if (xpPerMessage !== null) config.xp_per_message = xpPerMessage;
    if (cooldown !== null) config.xp_cooldown = cooldown * 1000;
    if (channel) config.level_up_channel = channel.id;

    if (Object.keys(config).length === 0) {
      const currentConfig = await db.getXPConfig(interaction.guild.id);
      const embed = new EmbedBuilder()
        .setTitle("⚙️ XP Configuration")
        .setColor(0x667eea)
        .addFields(
          { name: "Enabled", value: currentConfig.enabled ? "✅ Yes" : "❌ No", inline: true },
          { name: "XP per Message", value: `${currentConfig.xp_per_message}`, inline: true },
          { name: "Cooldown", value: `${currentConfig.xp_cooldown / 1000}s`, inline: true },
          { name: "Level Up Channel", value: currentConfig.level_up_channel ? `<#${currentConfig.level_up_channel}>` : "Current channel", inline: false }
        );

      return interaction.editReply({ embeds: [embed] });
    }

    await db.updateXPConfig(interaction.guild.id, config);

    await interaction.editReply({
      content: "✅ XP configuration updated successfully!"
    });
  },

  async handleReward(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        content: "You need Manage Roles permission to configure level rewards!",
        ephemeral: true
      });
    }

    const level = interaction.options.getInteger("level");
    const role = interaction.options.getRole("role");

    if (!role) {
      // Remove reward
      await db.removeLevelReward(interaction.guild.id, level);
      return interaction.reply({
        content: `✅ Removed level reward for level ${level}`,
        ephemeral: true
      });
    }

    // Add reward
    await db.addLevelReward(interaction.guild.id, level, role.id);
    await interaction.reply({
      content: `✅ Set ${role} as the reward for reaching level ${level}!`,
      ephemeral: true
    });
  },

  async handleRewards(interaction, client) {
    const rewards = await db.getLevelRewards(interaction.guild.id);

    if (rewards.length === 0) {
      return interaction.reply({
        content: "No level rewards configured yet!",
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("🎁 Level Rewards")
      .setColor(0x667eea)
      .setDescription(
        rewards.map(r => `Level **${r.level}**: <@&${r.role_id}>`).join("\n")
      );

    await interaction.reply({ embeds: [embed] });
  },

  async handleAdd(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "You need Administrator permission to manually add XP!",
        ephemeral: true
      });
    }

    const user = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");

    await db.addUserXP(interaction.guild.id, user.id, amount, 'manual');

    const userData = await db.getUserXP(interaction.guild.id, user.id);
    const newLevel = client.xpSystem.calculateLevel(userData.xp);
    await db.updateUserLevel(interaction.guild.id, user.id, newLevel);

    await interaction.reply({
      content: `✅ Added ${amount} XP to ${user}! They now have ${userData.xp} XP (Level ${newLevel})`,
      ephemeral: true
    });
  },

  async handleRemove(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "You need Administrator permission to manually remove XP!",
        ephemeral: true
      });
    }

    const user = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");

    await db.addUserXP(interaction.guild.id, user.id, -amount, 'manual');

    const userData = await db.getUserXP(interaction.guild.id, user.id);
    const newLevel = client.xpSystem.calculateLevel(userData.xp);
    await db.updateUserLevel(interaction.guild.id, user.id, newLevel);

    await interaction.reply({
      content: `✅ Removed ${amount} XP from ${user}! They now have ${userData.xp} XP (Level ${newLevel})`,
      ephemeral: true
    });
  },

  async handleReset(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "You need Administrator permission to reset XP!",
        ephemeral: true
      });
    }

    const user = interaction.options.getUser("user");

    await new Promise((resolve, reject) => {
      db.db.run(
        `DELETE FROM user_xp WHERE guild_id = ? AND user_id = ?`,
        [interaction.guild.id, user.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await interaction.reply({
      content: `✅ Reset ${user}'s XP and level!`,
      ephemeral: true
    });
  }
};

