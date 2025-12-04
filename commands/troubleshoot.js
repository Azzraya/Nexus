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
    .setName("troubleshoot")
    .setDescription("Diagnose and fix common issues with the bot")
    .addStringOption((option) =>
      option
        .setName("issue")
        .setDescription("What issue are you experiencing?")
        .setRequired(false)
        .addChoices(
          { name: "Bot not responding", value: "not_responding" },
          { name: "Commands not working", value: "commands" },
          { name: "Missing permissions", value: "permissions" },
          { name: "Notifications not working", value: "notifications" },
          { name: "Anti-raid not working", value: "antiraid" },
          { name: "General check", value: "general" }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const issue = interaction.options.getString("issue") || "general";

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const diagnostics = await this.runDiagnostics(interaction.guild, issue);
      const embed = this.createDiagnosticsEmbed(diagnostics, issue);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error running diagnostics:", error);
      await interaction.editReply({
        content: "❌ An error occurred while running diagnostics.",
      });
    }
  },

  async runDiagnostics(guild, issue) {
    const diagnostics = {
      botInGuild: guild.members.me !== null,
      botPermissions: [],
      configStatus: {},
      issues: [],
      recommendations: [],
    };

    // Check bot permissions
    const me = guild.members.me;
    if (me) {
      const requiredPerms = [
        "ViewChannels",
        "SendMessages",
        "EmbedLinks",
        "ReadMessageHistory",
        "ManageMessages",
        "BanMembers",
        "KickMembers",
        "ManageRoles",
        "ModerateMembers",
      ];

      requiredPerms.forEach((perm) => {
        const hasPerm = me.permissions.has(perm);
        diagnostics.botPermissions.push({ name: perm, has: hasPerm });
        if (!hasPerm) {
          diagnostics.issues.push(`Missing permission: ${perm}`);
        }
      });
    } else {
      diagnostics.issues.push("Bot is not in the server");
    }

    // Check configuration
    const config = await db.getServerConfig(guild.id);
    if (!config) {
      diagnostics.issues.push(
        "Server not configured - run `/setup preset` or `/setup wizard`"
      );
      diagnostics.recommendations.push(
        "Run `/setup preset` to quickly configure your server"
      );
    } else {
      diagnostics.configStatus = {
        modLogSet: !!config.mod_log_channel,
        antiRaidEnabled: !!config.anti_raid_enabled,
        antiNukeEnabled: !!config.anti_nuke_enabled,
        autoModEnabled: !!config.auto_mod_enabled,
      };

      if (!config.mod_log_channel) {
        diagnostics.issues.push("Mod log channel not set");
        diagnostics.recommendations.push(
          "Set mod log channel: `/config modlog #channel`"
        );
      }

      if (!config.anti_raid_enabled && issue === "antiraid") {
        diagnostics.issues.push("Anti-raid is disabled");
        diagnostics.recommendations.push(
          "Enable anti-raid in server configuration"
        );
      }
    }

    // Issue-specific checks
    if (issue === "not_responding") {
      diagnostics.recommendations.push("Check bot status: `/ping`");
      diagnostics.recommendations.push("Verify bot has proper permissions");
      diagnostics.recommendations.push("Check if bot is online in member list");
    }

    if (issue === "commands") {
      diagnostics.recommendations.push(
        "Try refreshing commands: Wait a few minutes for command sync"
      );
      diagnostics.recommendations.push(
        "Check bot permissions (especially 'Use Application Commands')"
      );
      diagnostics.recommendations.push(
        "Verify you're using slash commands (/) not prefix commands"
      );
    }

    if (issue === "permissions") {
      diagnostics.recommendations.push(
        "Check Server Settings > Roles > Nexus Bot"
      );
      diagnostics.recommendations.push(
        "Ensure bot role is above roles it needs to manage"
      );
      diagnostics.recommendations.push(
        "Use `/troubleshoot permissions` for detailed permission check"
      );
    }

    if (issue === "notifications") {
      const notifications = await db.getNotifications(guild.id);
      if (notifications.length === 0) {
        diagnostics.issues.push("No notifications configured");
        diagnostics.recommendations.push(
          "Set up notifications: `/notify setup`"
        );
      }
    }

    return diagnostics;
  },

  createDiagnosticsEmbed(diagnostics, issue) {
    const embed = new EmbedBuilder()
      .setTitle("🔧 Troubleshooting Diagnostics")
      .setDescription(`Diagnostic results for: **${issue.replace(/_/g, " ")}**`)
      .setColor(diagnostics.issues.length === 0 ? 0x00ff00 : 0xffaa00)
      .setTimestamp();

    // Bot Status
    embed.addFields({
      name: "🤖 Bot Status",
      value: diagnostics.botInGuild
        ? "✅ Bot is in the server"
        : "❌ Bot is not in the server",
      inline: true,
    });

    // Permissions
    const missingPerms = diagnostics.botPermissions.filter((p) => !p.has);
    embed.addFields({
      name: "🔐 Permissions",
      value:
        missingPerms.length === 0
          ? "✅ All required permissions granted"
          : `❌ Missing ${missingPerms.length} permission(s)\n${missingPerms
              .map((p) => `• ${p.name}`)
              .join("\n")}`,
      inline: true,
    });

    // Configuration
    const configIssues = Object.values(diagnostics.configStatus).filter(
      (v) => !v
    ).length;
    embed.addFields({
      name: "⚙️ Configuration",
      value:
        configIssues === 0
          ? "✅ Fully configured"
          : `⚠️ ${configIssues} setting(s) need attention`,
      inline: true,
    });

    // Issues
    if (diagnostics.issues.length > 0) {
      embed.addFields({
        name: "⚠️ Issues Found",
        value:
          diagnostics.issues.slice(0, 5).join("\n") +
          (diagnostics.issues.length > 5
            ? `\n+${diagnostics.issues.length - 5} more`
            : ""),
        inline: false,
      });
    }

    // Recommendations
    if (diagnostics.recommendations.length > 0) {
      embed.addFields({
        name: "💡 Recommendations",
        value: diagnostics.recommendations.slice(0, 5).join("\n"),
        inline: false,
      });
    }

    // Overall Status
    const status =
      diagnostics.issues.length === 0
        ? "✅ All systems operational"
        : diagnostics.issues.length <= 2
        ? "⚠️ Minor issues detected"
        : "❌ Multiple issues detected";

    embed.setFooter({ text: status });

    return embed;
  },
};
