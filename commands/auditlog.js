const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  AuditLogEvent,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("auditlog")
    .setDescription("Advanced audit log viewer with search and filters")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("search")
        .setDescription("Search audit logs")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Filter by action type")
            .addChoices(
              { name: "Member Ban", value: "MEMBER_BAN_ADD" },
              { name: "Member Kick", value: "MEMBER_KICK" },
              { name: "Member Update", value: "MEMBER_UPDATE" },
              { name: "Channel Create", value: "CHANNEL_CREATE" },
              { name: "Channel Delete", value: "CHANNEL_DELETE" },
              { name: "Channel Update", value: "CHANNEL_UPDATE" },
              { name: "Role Create", value: "ROLE_CREATE" },
              { name: "Role Delete", value: "ROLE_DELETE" },
              { name: "Role Update", value: "ROLE_UPDATE" },
              { name: "Message Delete", value: "MESSAGE_DELETE" },
              { name: "Message Bulk Delete", value: "MESSAGE_BULK_DELETE" },
              { name: "Webhook Create", value: "WEBHOOK_CREATE" },
              { name: "Webhook Delete", value: "WEBHOOK_DELETE" }
            )
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Filter by user who performed action")
        )
        .addUserOption((option) =>
          option.setName("target").setDescription("Filter by target user")
        )
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of results (default: 10)")
            .setMinValue(1)
            .setMaxValue(50)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("export")
        .setDescription("Export audit logs to JSON")
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Days to export (default: 7)")
            .setMinValue(1)
            .setMaxValue(30)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("recent")
        .setDescription("View recent audit log entries")
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of entries (default: 10)")
            .setMinValue(1)
            .setMaxValue(25)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("user")
        .setDescription("View all actions performed by a user")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to check")
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of actions (default: 10)")
            .setMinValue(1)
            .setMaxValue(50)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "search") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const actionType = interaction.options.getString("action");
      const user = interaction.options.getUser("user");
      const target = interaction.options.getUser("target");
      const limit = interaction.options.getInteger("limit") || 10;

      try {
        // Fetch audit logs with filters
        const auditLogs = await interaction.guild.fetchAuditLogs({
          limit: 100, // Fetch more to filter
          type: actionType ? AuditLogEvent[actionType] : undefined,
          user: user || undefined,
        });

        let entries = Array.from(auditLogs.entries.values());

        // Filter by target if specified
        if (target) {
          entries = entries.filter((entry) => entry.target?.id === target.id);
        }

        // Limit results
        entries = entries.slice(0, limit);

        if (entries.length === 0) {
          return interaction.editReply({
            content: "❌ No audit log entries found matching your criteria",
          });
        }

        const embed = new EmbedBuilder()
          .setTitle("🔍 Audit Log Search Results")
          .setDescription(`Found ${entries.length} matching entries`)
          .setColor(0x0099ff)
          .setTimestamp();

        entries.forEach((entry, i) => {
          const executor = entry.executor;
          const targetInfo = entry.target
            ? entry.target.tag || entry.target.name || entry.target.id
            : "Unknown";

          embed.addFields({
            name: `${i + 1}. ${entry.action} by ${executor?.tag || "Unknown"}`,
            value: [
              `**Target:** ${targetInfo}`,
              `**Reason:** ${entry.reason || "No reason"}`,
              `**Time:** <t:${Math.floor(entry.createdTimestamp / 1000)}:R>`,
            ].join("\n"),
            inline: false,
          });
        });

        return interaction.editReply({ embeds: [embed] });
      } catch (error) {
        return interaction.editReply({
          content: `❌ Failed to fetch audit logs: ${error.message}`,
        });
      }
    }

    if (subcommand === "export") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const days = interaction.options.getInteger("days") || 7;
      const since = Date.now() - days * 24 * 60 * 60 * 1000;

      try {
        const auditLogs = await interaction.guild.fetchAuditLogs({
          limit: 100,
        });
        const entries = Array.from(auditLogs.entries.values())
          .filter((entry) => entry.createdTimestamp >= since)
          .map((entry) => ({
            id: entry.id,
            action: entry.actionType,
            executor: {
              id: entry.executor?.id,
              tag: entry.executor?.tag,
            },
            target: {
              id: entry.target?.id,
              name: entry.target?.tag || entry.target?.name,
            },
            reason: entry.reason,
            timestamp: entry.createdTimestamp,
            changes: entry.changes?.map((c) => ({
              key: c.key,
              old: c.old,
              new: c.new,
            })),
          }));

        const json = JSON.stringify(
          {
            guild: {
              id: interaction.guild.id,
              name: interaction.guild.name,
            },
            exported_at: Date.now(),
            exported_by: {
              id: interaction.user.id,
              tag: interaction.user.tag,
            },
            days: days,
            entries: entries,
          },
          null,
          2
        );

        // Save to buffer and send as file
        const buffer = Buffer.from(json, "utf-8");

        return interaction.editReply({
          content: `✅ Exported ${entries.length} audit log entries from the last ${days} days`,
          files: [
            {
              attachment: buffer,
              name: `audit-log-${interaction.guild.id}-${Date.now()}.json`,
            },
          ],
        });
      } catch (error) {
        return interaction.editReply({
          content: `❌ Failed to export audit logs: ${error.message}`,
        });
      }
    }

    if (subcommand === "recent") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const limit = interaction.options.getInteger("limit") || 10;

      try {
        const auditLogs = await interaction.guild.fetchAuditLogs({ limit });
        const entries = Array.from(auditLogs.entries.values());

        if (entries.length === 0) {
          return interaction.editReply({
            content: "❌ No recent audit log entries found",
          });
        }

        const embed = new EmbedBuilder()
          .setTitle("📋 Recent Audit Log Entries")
          .setDescription(`Last ${entries.length} actions`)
          .setColor(0x0099ff)
          .setTimestamp();

        entries.forEach((entry, i) => {
          const executor = entry.executor;
          const targetInfo = entry.target
            ? entry.target.tag || entry.target.name || entry.target.id
            : "Unknown";

          embed.addFields({
            name: `${i + 1}. ${entry.action}`,
            value: [
              `**By:** ${executor?.tag || "Unknown"}`,
              `**Target:** ${targetInfo}`,
              `**Reason:** ${entry.reason || "No reason"}`,
              `**Time:** <t:${Math.floor(entry.createdTimestamp / 1000)}:R>`,
            ].join("\n"),
            inline: false,
          });
        });

        return interaction.editReply({ embeds: [embed] });
      } catch (error) {
        return interaction.editReply({
          content: `❌ Failed to fetch audit logs: ${error.message}`,
        });
      }
    }

    if (subcommand === "user") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const user = interaction.options.getUser("user");
      const limit = interaction.options.getInteger("limit") || 10;

      try {
        const auditLogs = await interaction.guild.fetchAuditLogs({
          limit: 100,
          user: user,
        });
        const entries = Array.from(auditLogs.entries.values()).slice(0, limit);

        if (entries.length === 0) {
          return interaction.editReply({
            content: `❌ No audit log entries found for ${user.tag}`,
          });
        }

        const embed = new EmbedBuilder()
          .setTitle(`📋 Audit Log - ${user.tag}`)
          .setDescription(`Last ${entries.length} actions performed`)
          .setColor(0x0099ff)
          .setThumbnail(user.displayAvatarURL())
          .setTimestamp();

        // Count actions by type
        const actionCounts = {};
        entries.forEach((entry) => {
          actionCounts[entry.action] = (actionCounts[entry.action] || 0) + 1;
        });

        embed.addFields({
          name: "📊 Action Summary",
          value: Object.entries(actionCounts)
            .map(([action, count]) => `${action}: **${count}**`)
            .join("\n"),
          inline: false,
        });

        entries.slice(0, 10).forEach((entry, i) => {
          const targetInfo = entry.target
            ? entry.target.tag || entry.target.name || entry.target.id
            : "Unknown";

          embed.addFields({
            name: `${i + 1}. ${entry.action}`,
            value: [
              `**Target:** ${targetInfo}`,
              `**Reason:** ${entry.reason || "No reason"}`,
              `**Time:** <t:${Math.floor(entry.createdTimestamp / 1000)}:R>`,
            ].join("\n"),
            inline: false,
          });
        });

        return interaction.editReply({ embeds: [embed] });
      } catch (error) {
        return interaction.editReply({
          content: `❌ Failed to fetch audit logs: ${error.message}`,
        });
      }
    }
  },
};
