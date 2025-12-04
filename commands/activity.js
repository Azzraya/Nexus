const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const Owner = require("../utils/owner");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("activity")
    .setDescription(
      "View bot activity logs (server joins/leaves and command usage)"
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("servers")
        .setDescription("View server join/leave logs")
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of entries to show (default: 20)")
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("commands")
        .setDescription("View command usage logs")
        .addStringOption((option) =>
          option
            .setName("server")
            .setDescription("Filter by server ID (owner only)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("command")
            .setDescription("Filter by command name")
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of entries to show (default: 20)")
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "servers") {
      // Owner-only for security
      if (!Owner.isOwner(interaction.user.id)) {
        return interaction.reply({
          content: "❌ Only the bot owner can view server activity logs!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const limit = interaction.options.getInteger("limit") || 20;

      const logs = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM bot_activity_log ORDER BY timestamp DESC LIMIT ?",
          [limit],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (logs.length === 0) {
        return interaction.reply({
          content: "❌ No server activity logs found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📊 Server Activity Logs")
        .setDescription(`Last ${logs.length} server events`)
        .setColor(0x0099ff)
        .setTimestamp();

      const logList = logs
        .map((log) => {
          const date = new Date(log.timestamp);
          const eventIcon = log.event_type === "guild_join" ? "🆕" : "❌";
          return `${eventIcon} **${log.guild_name}** (${log.guild_id})\n   ${
            log.event_type === "guild_join" ? "Joined" : "Left"
          } • ${log.member_count} members • <t:${Math.floor(
            log.timestamp / 1000
          )}:R>`;
        })
        .join("\n\n");

      embed.setDescription(logList);

      // Add summary
      const joins = logs.filter((l) => l.event_type === "guild_join").length;
      const leaves = logs.filter((l) => l.event_type === "guild_leave").length;
      embed.addFields({
        name: "Summary",
        value: `🆕 Joins: ${joins}\n❌ Leaves: ${leaves}`,
        inline: true,
      });

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "commands") {
      // Owner-only for security
      if (!Owner.isOwner(interaction.user.id)) {
        return interaction.reply({
          content: "❌ Only the bot owner can view command usage logs!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const serverId = interaction.options.getString("server");
      const commandName = interaction.options.getString("command");
      const limit = interaction.options.getInteger("limit") || 20;

      let query = "SELECT * FROM command_usage_log WHERE 1=1";
      const params = [];

      if (serverId) {
        query += " AND guild_id = ?";
        params.push(serverId);
      }

      if (commandName) {
        query += " AND command_name = ?";
        params.push(commandName);
      }

      query += " ORDER BY timestamp DESC LIMIT ?";
      params.push(limit);

      const logs = await new Promise((resolve, reject) => {
        db.db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      if (logs.length === 0) {
        return interaction.reply({
          content: "❌ No command usage logs found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📊 Command Usage Logs")
        .setDescription(`Last ${logs.length} commands executed`)
        .setColor(0x0099ff)
        .setTimestamp();

      const logList = logs
        .map((log) => {
          return `\`/${log.command_name}\` by **${log.user_tag}**\n   Server: ${
            log.guild_name
          } (${log.guild_id})\n   <t:${Math.floor(log.timestamp / 1000)}:R>`;
        })
        .join("\n\n");

      embed.setDescription(logList);

      // Add summary
      const commandCounts = {};
      logs.forEach((log) => {
        commandCounts[log.command_name] =
          (commandCounts[log.command_name] || 0) + 1;
      });

      const topCommands = Object.entries(commandCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cmd, count]) => `\`/${cmd}\`: ${count}`)
        .join("\n");

      if (topCommands) {
        embed.addFields({
          name: "Top Commands",
          value: topCommands,
          inline: false,
        });
      }

      await interaction.reply({ embeds: [embed] });
    }
  },
};
