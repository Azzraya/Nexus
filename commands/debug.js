const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const logger = require("../utils/logger");
const ErrorHandler = require("../utils/errorHandler");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("debug")
    .setDescription("Generate detailed debug report for support")
    .addBooleanOption((option) =>
      option
        .setName("export")
        .setDescription("Export full logs as file (last 100 events)")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const exportLogs = interaction.options.getBoolean("export") || false;
      const guild = interaction.guild;

      // Gather comprehensive diagnostics
      const report = await this.generateDebugReport(guild, interaction.client);

      if (exportLogs) {
        // Generate log file
        const logFile = this.generateLogFile(guild, report);
        const attachment = new AttachmentBuilder(
          Buffer.from(logFile, "utf-8"),
          { name: `nexus-debug-${guild.id}-${Date.now()}.txt` }
        );

        const embed = new EmbedBuilder()
          .setTitle("🔍 Debug Report Generated")
          .setDescription(
            "Debug logs exported. Share this file with support if needed."
          )
          .setColor(0x00ff00)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed], files: [attachment] });
      } else {
        // Show summary embed
        const embed = this.createDebugEmbed(report, guild);
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      logger.error("Error generating debug report:", error);
      await interaction.editReply({
        content: "❌ Failed to generate debug report. Please try again.",
      });
    }
  },

  async generateDebugReport(guild, client) {
    const report = {
      timestamp: new Date().toISOString(),
      server: {
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        createdAt: guild.createdAt.toISOString(),
        ownerId: guild.ownerId,
      },
      bot: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
        discordJsVersion: require("discord.js").version,
      },
      permissions: {},
      config: {},
      recentErrors: [],
      recentActions: [],
      antiNukeStatus: {},
      roleHierarchy: {},
    };

    // Bot permissions check
    const me = guild.members.me;
    if (me) {
      const criticalPerms = [
        "ViewChannel",
        "SendMessages",
        "EmbedLinks",
        "ManageMessages",
        "BanMembers",
        "KickMembers",
        "ManageRoles",
        "ManageChannels",
        "ManageGuild",
        "ModerateMembers",
        "ViewAuditLog",
      ];

      report.permissions = {
        hasAllCritical: true,
        missing: [],
        granted: [],
      };

      criticalPerms.forEach((perm) => {
        if (me.permissions.has(perm)) {
          report.permissions.granted.push(perm);
        } else {
          report.permissions.missing.push(perm);
          report.permissions.hasAllCritical = false;
        }
      });

      // Role hierarchy check
      const botRole = me.roles.highest;
      const ownerMember = await guild.members
        .fetch(guild.ownerId)
        .catch(() => null);
      const highestRole = guild.roles.highest;

      report.roleHierarchy = {
        botRoleName: botRole.name,
        botRolePosition: botRole.position,
        highestRoleName: highestRole.name,
        highestRolePosition: highestRole.position,
        isAtTop: botRole.position >= highestRole.position - 1,
        rolesAboveBot: guild.roles.cache.filter(
          (r) => r.position > botRole.position && r.id !== guild.id
        ).size,
      };
    }

    // Server config
    const config = await db.getServerConfig(guild.id);
    if (config) {
      report.config = {
        antiRaidEnabled: !!config.anti_raid_enabled,
        antiNukeEnabled: !!config.anti_nuke_enabled,
        autoModEnabled: !!config.auto_mod_enabled,
        modLogChannel: config.mod_log_channel || null,
        welcomeChannel: config.welcome_channel || null,
        autoRecoveryEnabled: !!config.auto_recovery_enabled,
      };
    }

    // Recent errors from ErrorHandler
    const errorStats = ErrorHandler.getErrorStats();
    report.recentErrors = errorStats.criticalErrors.slice(0, 10);
    report.totalErrors = errorStats.totalErrors;

    // Recent security actions
    const recentActions = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM security_logs WHERE guild_id = ? ORDER BY timestamp DESC LIMIT 20",
        [guild.id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    }).catch(() => []);

    report.recentActions = recentActions.map((action) => ({
      type: action.threat_type,
      userId: action.user_id,
      actionTaken: action.action_taken,
      timestamp: new Date(action.timestamp).toISOString(),
    }));

    // Anti-nuke tracking status
    if (client.advancedAntiNuke) {
      const antiNuke = client.advancedAntiNuke;
      const guildKey = `${guild.id}-`;

      let totalTrackedChannels = 0;
      let totalTrackedRoles = 0;
      let totalTrackedWebhooks = 0;

      // Count tracked items for this guild
      antiNuke.attackerCreatedChannels.forEach((channels, key) => {
        if (key.includes(guild.id)) totalTrackedChannels += channels.size;
      });
      antiNuke.attackerCreatedRoles.forEach((roles, key) => {
        if (key.includes(guild.id)) totalTrackedRoles += roles.size;
      });
      antiNuke.attackerCreatedWebhooks.forEach((webhooks, key) => {
        if (key.includes(guild.id)) totalTrackedWebhooks += webhooks.size;
      });

      report.antiNukeStatus = {
        isActive: true,
        lockedDown: antiNuke.lockedGuilds.has(guild.id),
        trackedChannels: totalTrackedChannels,
        trackedRoles: totalTrackedRoles,
        trackedWebhooks: totalTrackedWebhooks,
        activeThreats: antiNuke.actionHistory.size,
      };
    }

    return report;
  },

  createDebugEmbed(report, guild) {
    const embed = new EmbedBuilder()
      .setTitle("🔍 Debug Report")
      .setDescription(`Comprehensive diagnostics for **${guild.name}**`)
      .setColor(report.permissions.hasAllCritical ? 0x00ff00 : 0xff6b6b)
      .setTimestamp();

    // Server Info
    embed.addFields({
      name: "📊 Server Info",
      value: `**Members:** ${report.server.memberCount}\n**Owner:** <@${report.server.ownerId}>\n**Created:** <t:${Math.floor(new Date(report.server.createdAt).getTime() / 1000)}:R>`,
      inline: true,
    });

    // Bot Status
    const uptimeHours = Math.floor(report.bot.uptime / 3600);
    const memoryMB = Math.floor(report.bot.memoryUsage.heapUsed / 1024 / 1024);
    embed.addFields({
      name: "🤖 Bot Status",
      value: `**Uptime:** ${uptimeHours}h\n**Memory:** ${memoryMB}MB\n**Node:** ${report.bot.nodeVersion}`,
      inline: true,
    });

    // Permissions
    embed.addFields({
      name: "🔐 Permissions",
      value:
        report.permissions.missing.length === 0
          ? `✅ All ${report.permissions.granted.length} critical permissions granted`
          : `❌ Missing ${report.permissions.missing.length} permissions:\n${report.permissions.missing.slice(0, 3).join(", ")}${report.permissions.missing.length > 3 ? "..." : ""}`,
      inline: false,
    });

    // Role Hierarchy
    if (report.roleHierarchy.botRoleName) {
      const hierarchyStatus = report.roleHierarchy.isAtTop
        ? "✅ Positioned correctly"
        : `⚠️ ${report.roleHierarchy.rolesAboveBot} roles above bot`;

      embed.addFields({
        name: "🎭 Role Hierarchy",
        value: `**Bot Role:** ${report.roleHierarchy.botRoleName} (pos: ${report.roleHierarchy.botRolePosition})\n**Status:** ${hierarchyStatus}`,
        inline: false,
      });
    }

    // Configuration
    const configStatus = Object.entries(report.config)
      .map(([key, value]) => {
        const icon = value ? "✅" : "❌";
        return `${icon} ${key.replace(/([A-Z])/g, " $1").trim()}`;
      })
      .join("\n");

    if (configStatus) {
      embed.addFields({
        name: "⚙️ Configuration",
        value: configStatus,
        inline: false,
      });
    }

    // Anti-Nuke Status
    if (report.antiNukeStatus.isActive) {
      embed.addFields({
        name: "🛡️ Anti-Nuke Status",
        value: `**Locked Down:** ${report.antiNukeStatus.lockedDown ? "🔒 Yes" : "🔓 No"}\n**Tracking:** ${report.antiNukeStatus.trackedChannels} channels, ${report.antiNukeStatus.trackedRoles} roles, ${report.antiNukeStatus.trackedWebhooks} webhooks\n**Active Threats:** ${report.antiNukeStatus.activeThreats}`,
        inline: false,
      });
    }

    // Recent Errors
    if (report.totalErrors > 0) {
      embed.addFields({
        name: "⚠️ Recent Errors",
        value: `**Total:** ${report.totalErrors}\n**Critical:** ${report.recentErrors.length}${report.recentErrors.length > 0 ? `\nLatest: \`${report.recentErrors[0].key}\`` : ""}`,
        inline: false,
      });
    }

    // Recent Actions
    if (report.recentActions.length > 0) {
      const actionSummary = report.recentActions
        .slice(0, 3)
        .map(
          (a) =>
            `• ${a.type} - <t:${Math.floor(new Date(a.timestamp).getTime() / 1000)}:R>`
        )
        .join("\n");

      embed.addFields({
        name: "📋 Recent Security Actions",
        value:
          actionSummary +
          (report.recentActions.length > 3
            ? `\n+${report.recentActions.length - 3} more`
            : ""),
        inline: false,
      });
    }

    embed.addFields({
      name: "💬 Need Help?",
      value: "Use `/debug export:true` to get full log file for support",
      inline: false,
    });

    return embed;
  },

  generateLogFile(guild, report) {
    let log = "";
    log += "=".repeat(60) + "\n";
    log += `NEXUS DEBUG REPORT\n`;
    log += `Generated: ${report.timestamp}\n`;
    log += "=".repeat(60) + "\n\n";

    log += "SERVER INFORMATION\n";
    log += "-".repeat(60) + "\n";
    log += `Name: ${report.server.name}\n`;
    log += `ID: ${report.server.id}\n`;
    log += `Members: ${report.server.memberCount}\n`;
    log += `Owner: ${report.server.ownerId}\n`;
    log += `Created: ${report.server.createdAt}\n\n`;

    log += "BOT STATUS\n";
    log += "-".repeat(60) + "\n";
    log += `Uptime: ${Math.floor(report.bot.uptime / 3600)}h ${Math.floor((report.bot.uptime % 3600) / 60)}m\n`;
    log += `Memory: ${Math.floor(report.bot.memoryUsage.heapUsed / 1024 / 1024)}MB / ${Math.floor(report.bot.memoryUsage.heapTotal / 1024 / 1024)}MB\n`;
    log += `Node Version: ${report.bot.nodeVersion}\n`;
    log += `Discord.js Version: ${report.bot.discordJsVersion}\n\n`;

    log += "PERMISSIONS\n";
    log += "-".repeat(60) + "\n";
    log += `Granted (${report.permissions.granted.length}):\n`;
    report.permissions.granted.forEach((p) => (log += `  ✓ ${p}\n`));
    if (report.permissions.missing.length > 0) {
      log += `\nMissing (${report.permissions.missing.length}):\n`;
      report.permissions.missing.forEach((p) => (log += `  ✗ ${p}\n`));
    }
    log += "\n";

    log += "ROLE HIERARCHY\n";
    log += "-".repeat(60) + "\n";
    log += `Bot Role: ${report.roleHierarchy.botRoleName} (Position: ${report.roleHierarchy.botRolePosition})\n`;
    log += `Highest Role: ${report.roleHierarchy.highestRoleName} (Position: ${report.roleHierarchy.highestRolePosition})\n`;
    log += `Roles Above Bot: ${report.roleHierarchy.rolesAboveBot}\n`;
    log += `Status: ${report.roleHierarchy.isAtTop ? "✓ Positioned correctly" : "✗ NOT at top (anti-nuke may fail)"}\n\n`;

    log += "CONFIGURATION\n";
    log += "-".repeat(60) + "\n";
    Object.entries(report.config).forEach(([key, value]) => {
      log += `${value ? "✓" : "✗"} ${key}: ${value || "not set"}\n`;
    });
    log += "\n";

    log += "ANTI-NUKE STATUS\n";
    log += "-".repeat(60) + "\n";
    if (report.antiNukeStatus.isActive) {
      log += `Active: Yes\n`;
      log += `Locked Down: ${report.antiNukeStatus.lockedDown ? "Yes" : "No"}\n`;
      log += `Tracked Channels: ${report.antiNukeStatus.trackedChannels}\n`;
      log += `Tracked Roles: ${report.antiNukeStatus.trackedRoles}\n`;
      log += `Tracked Webhooks: ${report.antiNukeStatus.trackedWebhooks}\n`;
      log += `Active Threats: ${report.antiNukeStatus.activeThreats}\n`;
    } else {
      log += `Active: No\n`;
    }
    log += "\n";

    log += "RECENT ERRORS\n";
    log += "-".repeat(60) + "\n";
    if (report.recentErrors.length > 0) {
      report.recentErrors.forEach((err) => {
        log += `[${new Date(err.timestamp).toISOString()}] ${err.key}\n`;
        log += `  Count: ${err.count}\n`;
        log += `  Message: ${err.message}\n\n`;
      });
    } else {
      log += "No recent errors\n\n";
    }

    log += "RECENT SECURITY ACTIONS\n";
    log += "-".repeat(60) + "\n";
    if (report.recentActions.length > 0) {
      report.recentActions.forEach((action) => {
        log += `[${action.timestamp}] ${action.type}\n`;
        log += `  User: ${action.userId}\n`;
        log += `  Action: ${action.actionTaken}\n\n`;
      });
    } else {
      log += "No recent security actions\n\n";
    }

    log += "=".repeat(60) + "\n";
    log += "END OF REPORT\n";
    log += "=".repeat(60) + "\n";

    return log;
  },

  createDebugEmbed(report, guild) {
    const embed = new EmbedBuilder()
      .setTitle("🔍 Debug Report")
      .setDescription(`Quick diagnostics for **${guild.name}**`)
      .setColor(report.permissions.hasAllCritical ? 0x00ff00 : 0xff6b6b)
      .setTimestamp();

    // Quick Status
    const status = [];
    status.push(
      report.permissions.hasAllCritical
        ? "✅ Permissions OK"
        : `❌ Missing ${report.permissions.missing.length} permissions`
    );
    status.push(
      report.roleHierarchy.isAtTop
        ? "✅ Role hierarchy OK"
        : "⚠️ Role not at top"
    );
    status.push(
      report.config.antiNukeEnabled ? "✅ Anti-nuke ON" : "❌ Anti-nuke OFF"
    );
    status.push(
      report.config.antiRaidEnabled ? "✅ Anti-raid ON" : "❌ Anti-raid OFF"
    );

    embed.addFields({
      name: "⚡ Quick Status",
      value: status.join("\n"),
      inline: false,
    });

    // Critical Issues
    const issues = [];
    if (report.permissions.missing.length > 0) {
      issues.push(
        `Missing permissions: ${report.permissions.missing.slice(0, 3).join(", ")}`
      );
    }
    if (!report.roleHierarchy.isAtTop) {
      issues.push(
        `Bot role not at top (${report.roleHierarchy.rolesAboveBot} roles above it)`
      );
    }
    if (!report.config.antiNukeEnabled) {
      issues.push("Anti-nuke is disabled");
    }
    if (!report.config.modLogChannel) {
      issues.push("Mod log channel not set");
    }

    if (issues.length > 0) {
      embed.addFields({
        name: "⚠️ Issues Detected",
        value: issues.join("\n"),
        inline: false,
      });
    }

    // System Health
    const memoryMB = Math.floor(report.bot.memoryUsage.heapUsed / 1024 / 1024);
    const uptimeHours = Math.floor(report.bot.uptime / 3600);

    embed.addFields({
      name: "💻 System Health",
      value: `**Uptime:** ${uptimeHours}h\n**Memory:** ${memoryMB}MB\n**Errors (24h):** ${report.totalErrors || 0}`,
      inline: true,
    });

    // Anti-Nuke Tracking
    if (report.antiNukeStatus.isActive) {
      embed.addFields({
        name: "🛡️ Anti-Nuke Tracking",
        value: `**Channels:** ${report.antiNukeStatus.trackedChannels}\n**Roles:** ${report.antiNukeStatus.trackedRoles}\n**Webhooks:** ${report.antiNukeStatus.trackedWebhooks}`,
        inline: true,
      });
    }

    // Recent Activity
    if (report.recentActions.length > 0) {
      embed.addFields({
        name: "📋 Recent Security Actions",
        value: `${report.recentActions.length} actions logged\nLatest: ${report.recentActions[0].type}`,
        inline: false,
      });
    }

    embed.addFields({
      name: "📁 Full Report",
      value: "Use `/debug export:true` to get detailed log file",
      inline: false,
    });

    return embed;
  },
};
