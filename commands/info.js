const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("View information about server or user")
    .addSubcommand((subcommand) =>
      subcommand.setName("server").setDescription("View info about this server")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("user")
        .setDescription("View info about a certain user")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to view info for")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("bot")
        .setDescription("View information about Nexus Bot")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "server") {
      const guild = interaction.guild;
      const owner = await guild.fetchOwner();

      const embed = new EmbedBuilder()
        .setTitle(`📊 ${guild.name}`)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
          { name: "👑 Owner", value: `${owner.user.tag}`, inline: true },
          { name: "🆔 Server ID", value: guild.id, inline: true },
          {
            name: "📅 Created",
            value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
          { name: "👥 Members", value: `${guild.memberCount}`, inline: true },
          {
            name: "💬 Channels",
            value: `${guild.channels.cache.size}`,
            inline: true,
          },
          {
            name: "😀 Emojis",
            value: `${guild.emojis.cache.size}`,
            inline: true,
          },
          {
            name: "🔒 Verification",
            value: guild.verificationLevel.toString(),
            inline: true,
          },
          {
            name: "📈 Boost Level",
            value: guild.premiumTier.toString(),
            inline: true,
          },
          {
            name: "🚀 Boosts",
            value: `${guild.premiumSubscriptionCount || 0}`,
            inline: true,
          }
        )
        .setColor(0x0099ff)
        .setTimestamp();

      if (guild.description) {
        embed.setDescription(guild.description);
      }

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "user") {
      const user = interaction.options.getUser("user") || interaction.user;
      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      if (!member) {
        return interaction.reply({
          content: "❌ User not found in this server!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const stats = await db.getUserStats(interaction.guild.id, user.id);
      const warnings = await db.getWarnings(interaction.guild.id, user.id);
      const heatScore = await db.getHeatScore(interaction.guild.id, user.id);

      const roles =
        member.roles.cache
          .filter((role) => role.id !== interaction.guild.id)
          .map((role) => role.toString())
          .slice(0, 10)
          .join(", ") || "None";

      const embed = new EmbedBuilder()
        .setTitle(`👤 ${user.tag}`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: "🆔 User ID", value: user.id, inline: true },
          {
            name: "📅 Account Created",
            value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
          {
            name: "📥 Joined Server",
            value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
            inline: true,
          },
          {
            name: "💬 Messages Sent",
            value: `${stats.messages_sent}`,
            inline: true,
          },
          { name: "⚠️ Warnings", value: `${warnings.length}`, inline: true },
          { name: "🔥 Heat Score", value: `${heatScore}`, inline: true },
          { name: "🎭 Roles", value: roles || "None", inline: false }
        )
        .setColor(member.displayColor || 0x0099ff)
        .setTimestamp();

      if (member.premiumSince) {
        embed.addFields({
          name: "💎 Boosting Since",
          value: `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>`,
          inline: true,
        });
      }

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "bot") {
      const packageJson = require("../package.json");
      const bot = interaction.client.user;
      const uptime = process.uptime();
      const uptimeHours = Math.floor(uptime / 3600);
      const uptimeMinutes = Math.floor((uptime % 3600) / 60);
      const uptimeSeconds = Math.floor(uptime % 60);

      const embed = new EmbedBuilder()
        .setTitle(`🤖 ${bot.username}`)
        .setThumbnail(bot.displayAvatarURL({ dynamic: true }))
        .setDescription(
          packageJson.description ||
            "Advanced Discord security and moderation bot"
        )
        .addFields(
          {
            name: "📦 Version",
            value: packageJson.version || "1.6.0",
            inline: true,
          },
          { name: "🆔 Bot ID", value: bot.id, inline: true },
          {
            name: "📅 Created",
            value: `<t:${Math.floor(bot.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
          {
            name: "⏱️ Uptime",
            value: `${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s`,
            inline: true,
          },
          {
            name: "🖥️ Node.js",
            value: process.version,
            inline: true,
          },
          {
            name: "📚 Discord.js",
            value: require("discord.js").version || "14.14.1",
            inline: true,
          },
          {
            name: "🌐 Servers",
            value: `${interaction.client.guilds.cache.size}`,
            inline: true,
          },
          {
            name: "👥 Users",
            value: `${interaction.client.guilds.cache.reduce(
              (acc, guild) => acc + guild.memberCount,
              0
            )}`,
            inline: true,
          },
          {
            name: "💾 Memory",
            value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(
              2
            )} MB`,
            inline: true,
          }
        )
        .setColor(0x5865f2)
        .setTimestamp()
        .setFooter({
          text: `Nexus Bot - Exceeding Wick in every way`,
          iconURL: bot.displayAvatarURL({ dynamic: true }),
        });

      await interaction.reply({ embeds: [embed] });
    }
  },
};
