const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("threatdashboard")
    .setDescription("View real-time threat monitoring dashboard")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand.setName("live").setDescription("View live threat monitoring")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("history").setDescription("View threat history")
        .addIntegerOption((option) =>
          option
            .setName("hours")
            .setDescription("Hours of history to view (default: 24)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(168)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("stats").setDescription("View threat statistics")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "live") {
      // Get current threat monitoring status
      const guild = interaction.guild;
      const client = interaction.client;

      const embed = new EmbedBuilder()
        .setTitle("🛡️ Live Threat Dashboard")
        .setDescription(`Real-time security monitoring for **${guild.name}**`)
        .setColor(0x00ff00)
        .setTimestamp();

      // Anti-nuke status
      const antiNuke = client.advancedAntiNuke;
      if (antiNuke) {
        const monitoring = antiNuke.monitoring.get(guild.id) || {};
        const lockedDown = antiNuke.lockedGuilds.has(guild.id);
        const whitelistCache = antiNuke.whitelistCache.get(guild.id) || new Set();

        embed.addFields({
          name: "🛡️ Anti-Nuke Status",
          value: lockedDown
            ? "🔴 **LOCKDOWN ACTIVE**"
            : "🟢 **Active & Monitoring**",
          inline: true,
        });

        embed.addFields({
          name: "📊 Whitelisted Users",
          value: `${whitelistCache.size} users`,
          inline: true,
        });

        // Get recent actions monitored
        const recentActions = antiNuke.actionHistory.size || 0;
        embed.addFields({
          name: "🔍 Actions Monitored",
          value: `${recentActions} recent actions`,
          inline: true,
        });
      }

      // Anti-raid status
      const config = await db.getServerConfig(guild.id);
      if (config && config.anti_raid_enabled) {
        const raidData = client.antiRaid?.joinRate?.get(guild.id);
        const recentJoins = raidData?.joins?.length || 0;

        embed.addFields({
          name: "🚨 Anti-Raid Status",
          value: "🟢 **Active & Monitoring**",
          inline: true,
        });

        embed.addFields({
          name: "👥 Recent Joins",
          value: `${recentJoins} in last window`,
          inline: true,
        });
      }

      // Threat intelligence
      const ThreatIntelligence = require("../utils/threatIntelligence");
const ErrorMessages = require("../utils/errorMessages");
      
      // Get recent threats from this server
      const recentThreats = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM threat_intelligence WHERE source_guild_id = ? AND reported_at > ? ORDER BY reported_at DESC LIMIT 5",
          [guild.id, Date.now() - 86400000], // Last 24 hours
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (recentThreats.length > 0) {
        embed.addFields({
          name: "⚠️ Recent Threats Detected",
          value: recentThreats
            .map(
              (t) =>
                `• ${t.threat_type} (Severity: ${t.severity}) - <@${t.user_id}>`
            )
            .join("\n")
            .substring(0, 1024),
          inline: false,
        });
      } else {
        embed.addFields({
          name: "✅ No Recent Threats",
          value: "No threats detected in the last 24 hours",
          inline: false,
        });
      }

      // Performance metrics
      if (client.performanceMonitor) {
        const metrics = client.performanceMonitor.getMetrics();
        embed.addFields({
          name: "⚡ Bot Performance",
          value: `**Memory:** ${(metrics.memory / 1024 / 1024).toFixed(2)} MB\n**Uptime:** ${Math.floor(metrics.uptime / 3600)}h ${Math.floor((metrics.uptime % 3600) / 60)}m`,
          inline: true,
        });
      }

      // Add refresh button
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("refresh_dashboard")
          .setLabel("Refresh")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🔄")
      );

      return interaction.reply({
        embeds: [embed],
        components: [row],
      });
    }

    if (subcommand === "history") {
      const hours = interaction.options.getInteger("hours") || 24;
      const timeAgo = Date.now() - hours * 3600000;

      await interaction.deferReply();

      // Get threat history
      const threats = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM threat_intelligence WHERE source_guild_id = ? AND reported_at > ? ORDER BY reported_at DESC",
          [interaction.guild.id, timeAgo],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      // Get moderation cases
      const cases = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM cases WHERE guild_id = ? AND timestamp > ? ORDER BY timestamp DESC LIMIT 20",
          [interaction.guild.id, timeAgo],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle(`📊 Threat History (Last ${hours}h)`)
        .setDescription(`Security activity for **${interaction.guild.name}**`)
        .setColor(0x5865f2)
        .setTimestamp();

      // Threat summary
      const threatTypes = {};
      const severityCount = { critical: 0, high: 0, medium: 0, low: 0 };

      threats.forEach((t) => {
        threatTypes[t.threat_type] = (threatTypes[t.threat_type] || 0) + 1;
        severityCount[t.severity] = (severityCount[t.severity] || 0) + 1;
      });

      if (threats.length > 0) {
        embed.addFields({
          name: "⚠️ Threats Detected",
          value: `**Total:** ${threats.length}\n**Critical:** ${severityCount.critical} | **High:** ${severityCount.high} | **Medium:** ${severityCount.medium} | **Low:** ${severityCount.low}`,
          inline: false,
        });

        // Top threat types
        const topThreats = Object.entries(threatTypes)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);

        embed.addFields({
          name: "🔝 Top Threat Types",
          value: topThreats.map(([type, count]) => `• ${type}: ${count}`).join("\n"),
          inline: true,
        });
      } else {
        embed.addFields({
          name: "✅ No Threats Detected",
          value: `No security threats in the last ${hours} hours`,
          inline: false,
        });
      }

      // Moderation summary
      if (cases.length > 0) {
        const actionTypes = {};
        cases.forEach((c) => {
          actionTypes[c.action] = (actionTypes[c.action] || 0) + 1;
        });

        const actionSummary = Object.entries(actionTypes)
          .map(([action, count]) => `• ${action}: ${count}`)
          .join("\n");

        embed.addFields({
          name: "⚖️ Moderation Actions",
          value: `**Total:** ${cases.length}\n${actionSummary}`,
          inline: true,
        });
      }

      // Recent activity
      const recentActivity = [
        ...threats.slice(0, 3).map((t) => ({
          type: "threat",
          time: t.reported_at,
          desc: `⚠️ ${t.threat_type} threat (${t.severity})`,
        })),
        ...cases.slice(0, 3).map((c) => ({
          type: "case",
          time: c.timestamp,
          desc: `⚖️ ${c.action} - <@${c.user_id}>`,
        })),
      ]
        .sort((a, b) => b.time - a.time)
        .slice(0, 5);

      if (recentActivity.length > 0) {
        embed.addFields({
          name: "🕐 Recent Activity",
          value: recentActivity
            .map((a) => `<t:${Math.floor(a.time / 1000)}:R> ${a.desc}`)
            .join("\n"),
          inline: false,
        });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "stats") {
      await interaction.deferReply();

      // Get all-time stats
      const allThreats = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM threat_intelligence WHERE source_guild_id = ?",
          [interaction.guild.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      const allCases = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM cases WHERE guild_id = ?",
          [interaction.guild.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("📈 Security Statistics")
        .setDescription(`All-time security stats for **${interaction.guild.name}**`)
        .setColor(0x5865f2)
        .setTimestamp();

      // Overall stats
      embed.addFields({
        name: "📊 Overall Statistics",
        value: `**Threats Detected:** ${allThreats.length}\n**Moderation Actions:** ${allCases.length}\n**Total Users:** ${interaction.guild.memberCount}`,
        inline: false,
      });

      // Calculate threat density
      const threatsPerDay =
        allThreats.length > 0
          ? (
              allThreats.length /
              ((Date.now() - allThreats[allThreats.length - 1].reported_at) /
                86400000)
            ).toFixed(2)
          : 0;

      embed.addFields({
        name: "⚡ Threat Density",
        value: `${threatsPerDay} threats/day average`,
        inline: true,
      });

      // Most common threats
      const threatTypes = {};
      allThreats.forEach((t) => {
        threatTypes[t.threat_type] = (threatTypes[t.threat_type] || 0) + 1;
      });

      const topThreats = Object.entries(threatTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (topThreats.length > 0) {
        embed.addFields({
          name: "🔝 Most Common Threats",
          value: topThreats.map(([type, count]) => `• ${type}: ${count}`).join("\n"),
          inline: true,
        });
      }

      // Server security score
      const securityScore = Math.max(
        0,
        100 - Math.min(100, allThreats.length * 2)
      );
      const scoreEmoji =
        securityScore >= 80 ? "🟢" : securityScore >= 60 ? "🟡" : "🔴";

      embed.addFields({
        name: "🛡️ Security Score",
        value: `${scoreEmoji} **${securityScore}/100**\n${
          securityScore >= 80
            ? "Excellent security"
            : securityScore >= 60
            ? "Good security, room for improvement"
            : "Needs attention"
        }`,
        inline: false,
      });

      return interaction.editReply({ embeds: [embed] });
    }
  },
};

