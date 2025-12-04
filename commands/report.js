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
    .setName("report")
    .setDescription("Generate and schedule security reports")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("generate")
        .setDescription("Generate a security report")
        .addStringOption((option) =>
          option
            .setName("period")
            .setDescription("Report period")
            .setRequired(false)
            .addChoices(
              { name: "Last 24 Hours", value: "24h" },
              { name: "Last 7 Days", value: "7d" },
              { name: "Last 30 Days", value: "30d" },
              { name: "Custom", value: "custom" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("schedule")
        .setDescription("Schedule automatic reports")
        .addStringOption((option) =>
          option
            .setName("frequency")
            .setDescription("How often to generate reports")
            .setRequired(true)
            .addChoices(
              { name: "Daily", value: "daily" },
              { name: "Weekly", value: "weekly" },
              { name: "Monthly", value: "monthly" }
            )
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to send reports to")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List scheduled reports")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("Cancel a scheduled report")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("Scheduled report ID")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "generate") {
      await this.generateReport(interaction);
    } else if (subcommand === "schedule") {
      await this.scheduleReport(interaction);
    } else if (subcommand === "list") {
      await this.listScheduled(interaction);
    } else if (subcommand === "cancel") {
      await this.cancelSchedule(interaction);
    }
  },

  async generateReport(interaction) {
    const period = interaction.options.getString("period") || "7d";
    await interaction.deferReply();

    try {
      const report = await this.createReport(interaction.guild.id, period);

      const embed = new EmbedBuilder()
        .setTitle(`📊 Security Report - ${period.toUpperCase()}`)
        .setDescription(`Report generated for ${interaction.guild.name}`)
        .setColor(0x0099ff)
        .setTimestamp();

      // Security Summary
      embed.addFields({
        name: "🛡️ Security Summary",
        value: [
          `Threats Detected: **${report.threats}**`,
          `Average Threat Score: **${report.avgThreatScore}%**`,
          `Raids Prevented: **${report.raidsPrevented}**`,
          `Security Level: ${this.getSecurityLevel(report.avgThreatScore)}`,
        ].join("\n"),
        inline: false,
      });

      // Moderation Summary
      embed.addFields({
        name: "🔨 Moderation Summary",
        value: [
          `Total Actions: **${report.moderationActions}**`,
          `Warnings: **${report.warnings}**`,
          `Bans: **${report.bans}**`,
          `Kicks: **${report.kicks}**`,
        ].join("\n"),
        inline: true,
      });

      // Activity Summary
      embed.addFields({
        name: "📈 Activity Summary",
        value: [
          `New Members: **${report.newMembers}**`,
          `Messages Sent: **${report.messagesSent}**`,
          `Commands Used: **${report.commandsUsed}**`,
        ].join("\n"),
        inline: true,
      });

      // Recommendations
      if (report.recommendations && report.recommendations.length > 0) {
        embed.addFields({
          name: "💡 Recommendations",
          value: report.recommendations.slice(0, 3).join("\n"),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error generating report:", error);
      await interaction.editReply({
        content: "❌ An error occurred while generating the report.",
      });
    }
  },

  async createReport(guildId, period) {
    const periodMs = this.getPeriodMs(period);
    const startTime = Date.now() - periodMs;

    // Get threats
    const threats = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT threat_score FROM security_logs WHERE guild_id = ? AND timestamp > ?",
        [guildId, startTime],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    const avgThreatScore =
      threats.length > 0
        ? Math.round(
            threats.reduce((sum, t) => sum + (t.threat_score || 0), 0) /
              threats.length
          )
        : 0;

    // Get moderation stats
    const moderationStats = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT action, COUNT(*) as count FROM moderation_logs WHERE guild_id = ? AND timestamp > ? GROUP BY action",
        [guildId, startTime],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    const bans = moderationStats.find((s) => s.action === "ban")?.count || 0;
    const kicks = moderationStats.find((s) => s.action === "kick")?.count || 0;
    const warnings = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT COUNT(*) as count FROM warnings WHERE guild_id = ? AND timestamp > ?",
        [guildId, startTime],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.count || 0);
        }
      );
    });

    // Get activity stats
    const newMembers = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT COUNT(*) as count FROM analytics WHERE guild_id = ? AND event_type = 'member_join' AND timestamp > ?",
        [guildId, startTime],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.count || 0);
        }
      );
    });

    const activityStats = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT SUM(messages_sent) as messages, SUM(commands_used) as commands FROM user_stats WHERE guild_id = ? AND last_active > ?",
        [guildId, startTime],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || { messages: 0, commands: 0 });
        }
      );
    });

    // Get raids prevented
    const raidsPrevented = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT COUNT(*) as count FROM anti_raid_logs WHERE guild_id = ? AND timestamp > ?",
        [guildId, startTime],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.count || 0);
        }
      );
    });

    // Generate recommendations
    const recommendations = [];
    if (avgThreatScore > 60) {
      recommendations.push(
        "🔴 High threat activity - Review security settings"
      );
    }
    if (bans + kicks === 0 && warnings > 10) {
      recommendations.push(
        "⚠️ Many warnings but no bans/kicks - Consider stricter moderation"
      );
    }
    if (raidsPrevented > 0) {
      recommendations.push(
        `✅ Successfully prevented ${raidsPrevented} raid(s)`
      );
    }

    return {
      threats: threats.length,
      avgThreatScore,
      raidsPrevented,
      moderationActions: moderationStats.reduce((sum, s) => sum + s.count, 0),
      warnings,
      bans,
      kicks,
      newMembers,
      messagesSent: activityStats.messages || 0,
      commandsUsed: activityStats.commands || 0,
      recommendations,
    };
  },

  getPeriodMs(period) {
    switch (period) {
      case "24h":
        return 86400000;
      case "7d":
        return 604800000;
      case "30d":
        return 2592000000;
      default:
        return 604800000;
    }
  },

  getSecurityLevel(score) {
    if (score >= 70) return "🔴 High Risk";
    if (score >= 40) return "🟡 Medium Risk";
    return "🟢 Low Risk";
  },

  async scheduleReport(interaction) {
    const frequency = interaction.options.getString("frequency");
    const channel =
      interaction.options.getChannel("channel") || interaction.channel;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Calculate next run time
      const nextRun = this.calculateNextRun(frequency);

      // Store schedule (you'd need to add this to database)
      const scheduleId = await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO scheduled_reports (guild_id, frequency, channel_id, next_run, enabled) VALUES (?, ?, ?, ?, 1)",
          [interaction.guild.id, frequency, channel.id, nextRun],
          function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Report Scheduled")
        .setDescription(
          `Reports will be generated **${frequency}** and sent to ${channel}`
        )
        .addFields({
          name: "📅 Next Report",
          value: `<t:${Math.floor(nextRun / 1000)}:F>`,
        })
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error scheduling report:", error);
      await interaction.editReply({
        content: "❌ An error occurred while scheduling the report.",
      });
    }
  },

  calculateNextRun(frequency) {
    const now = Date.now();
    switch (frequency) {
      case "daily":
        return now + 86400000; // Next day
      case "weekly":
        return now + 604800000; // Next week
      case "monthly":
        return now + 2592000000; // Next month
      default:
        return now + 604800000;
    }
  },

  async listScheduled(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const schedules = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM scheduled_reports WHERE guild_id = ? AND enabled = 1",
          [interaction.guild.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (schedules.length === 0) {
        return interaction.editReply({
          content:
            "❌ No scheduled reports. Use `/report schedule` to create one.",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📅 Scheduled Reports")
        .setDescription(
          schedules
            .map(
              (s) =>
                `**#${s.id}** - ${s.frequency}\nChannel: <#${
                  s.channel_id
                }>\nNext: <t:${Math.floor(s.next_run / 1000)}:R>`
            )
            .join("\n\n")
        )
        .setColor(0x0099ff)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error listing schedules:", error);
      await interaction.editReply({
        content: "❌ An error occurred while listing scheduled reports.",
      });
    }
  },

  async cancelSchedule(interaction) {
    const id = interaction.options.getInteger("id");

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await new Promise((resolve, reject) => {
        db.db.run(
          "UPDATE scheduled_reports SET enabled = 0 WHERE id = ? AND guild_id = ?",
          [id, interaction.guild.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await interaction.editReply({
        content: `✅ Scheduled report #${id} cancelled`,
      });
    } catch (error) {
      logger.error("Error cancelling schedule:", error);
      await interaction.editReply({
        content: "❌ An error occurred while cancelling the schedule.",
      });
    }
  },
};
