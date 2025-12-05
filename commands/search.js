const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const logger = require("../utils/logger");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("Universal search across cases, logs, and data")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Search query (keywords, user ID, case ID, etc.)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("What to search")
        .setRequired(false)
        .addChoices(
          { name: "All", value: "all" },
          { name: "Cases", value: "cases" },
          { name: "Logs", value: "logs" },
          { name: "Users", value: "users" },
          { name: "Warnings", value: "warnings" }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const query = interaction.options.getString("query");
    const type = interaction.options.getString("type") || "all";

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const results = await this.search(query, interaction.guild.id, type);

      const embed = new EmbedBuilder()
        .setTitle(`🔍 Search Results: "${query}"`)
        .setDescription(
          results.total > 0
            ? `Found **${results.total}** result(s)`
            : "No results found. Try different keywords."
        )
        .setColor(results.total > 0 ? 0x0099ff : 0xff0000)
        .setTimestamp();

      if (results.cases && results.cases.length > 0) {
        embed.addFields({
          name: `📋 Cases (${results.cases.length})`,
          value:
            results.cases
              .slice(0, 5)
              .map(
                (c) =>
                  `**Case #${c.id}** - ${c.action} - <@${
                    c.user_id
                  }>\n   Reason: ${(c.reason || "No reason").substring(
                    0,
                    50
                  )}...`
              )
              .join("\n\n") +
            (results.cases.length > 5
              ? `\n\n+${results.cases.length - 5} more`
              : ""),
          inline: false,
        });
      }

      if (results.logs && results.logs.length > 0) {
        embed.addFields({
          name: `📝 Logs (${results.logs.length})`,
          value:
            results.logs
              .slice(0, 5)
              .map(
                (l) =>
                  `**${l.event_type}** - <@${l.user_id}>\n   ${new Date(
                    l.timestamp
                  ).toLocaleString()}`
              )
              .join("\n\n") +
            (results.logs.length > 5
              ? `\n\n+${results.logs.length - 5} more`
              : ""),
          inline: false,
        });
      }

      if (results.warnings && results.warnings.length > 0) {
        embed.addFields({
          name: `⚠️ Warnings (${results.warnings.length})`,
          value:
            results.warnings
              .slice(0, 5)
              .map(
                (w) =>
                  `**Warning #${w.id}** - <@${w.user_id}>\n   ${(
                    w.reason || "No reason"
                  ).substring(0, 50)}...`
              )
              .join("\n\n") +
            (results.warnings.length > 5
              ? `\n\n+${results.warnings.length - 5} more`
              : ""),
          inline: false,
        });
      }

      if (results.total === 0) {
        embed.addFields({
          name: "💡 Search Tips",
          value:
            "• Try searching by user ID or mention\n• Search by case ID (e.g., 'case:123')\n• Use keywords from reasons or descriptions\n• Try different spellings or partial matches",
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error searching:", error);
      await interaction.editReply(ErrorMessages.genericError());
    }
  },

  async search(query, guildId, type) {
    const results = {
      total: 0,
      cases: [],
      logs: [],
      warnings: [],
      users: [],
    };

    // Check if query is a user ID or mention
    const userIdMatch = query.match(/<@!?(\d+)>|(\d{17,19})/);
    const userId = userIdMatch ? userIdMatch[1] || userIdMatch[2] : null;

    // Check if query is a case ID
    const caseIdMatch = query.match(/case[:\s]*(\d+)/i);
    const caseId = caseIdMatch ? parseInt(caseIdMatch[1]) : null;

    if (type === "all" || type === "cases") {
      let casesQuery;
      let casesParams;

      if (caseId) {
        casesQuery =
          "SELECT * FROM moderation_logs WHERE guild_id = ? AND id = ?";
        casesParams = [guildId, caseId];
      } else if (userId) {
        casesQuery =
          "SELECT * FROM moderation_logs WHERE guild_id = ? AND (user_id = ? OR moderator_id = ?)";
        casesParams = [guildId, userId, userId];
      } else {
        casesQuery =
          "SELECT * FROM moderation_logs WHERE guild_id = ? AND (reason LIKE ? OR action LIKE ?)";
        casesParams = [guildId, `%${query}%`, `%${query}%`];
      }

      const cases = await new Promise((resolve, reject) => {
        db.db.all(casesQuery, casesParams, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      results.cases = cases;
      results.total += cases.length;
    }

    if (type === "all" || type === "logs") {
      let logsQuery;
      let logsParams;

      if (userId) {
        logsQuery =
          "SELECT * FROM security_logs WHERE guild_id = ? AND user_id = ? ORDER BY timestamp DESC LIMIT 20";
        logsParams = [guildId, userId];
      } else {
        logsQuery =
          "SELECT * FROM security_logs WHERE guild_id = ? AND (event_type LIKE ? OR details LIKE ?) ORDER BY timestamp DESC LIMIT 20";
        logsParams = [guildId, `%${query}%`, `%${query}%`];
      }

      const logs = await new Promise((resolve, reject) => {
        db.db.all(logsQuery, logsParams, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      results.logs = logs;
      results.total += logs.length;
    }

    if (type === "all" || type === "warnings") {
      let warningsQuery;
      let warningsParams;

      if (userId) {
        warningsQuery =
          "SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY timestamp DESC";
        warningsParams = [guildId, userId];
      } else {
        warningsQuery =
          "SELECT * FROM warnings WHERE guild_id = ? AND reason LIKE ? ORDER BY timestamp DESC LIMIT 20";
        warningsParams = [guildId, `%${query}%`];
      }

      const warnings = await new Promise((resolve, reject) => {
        db.db.all(warningsQuery, warningsParams, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      results.warnings = warnings;
      results.total += warnings.length;
    }

    return results;
  },
};
