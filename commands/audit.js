const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const db = require("../utils/database");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("audit")
    .setDescription("Comprehensive server security audit")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("full")
        .setDescription("Complete security audit with recommendations")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("quick").setDescription("Quick security check")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("permissions")
        .setDescription("Audit role permissions for security risks")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("channels")
        .setDescription("Audit channel security and permissions")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    try {
      switch (subcommand) {
        case "full":
          return await this.fullAudit(interaction);
        case "quick":
          return await this.quickAudit(interaction);
        case "permissions":
          return await this.permissionsAudit(interaction);
        case "channels":
          return await this.channelsAudit(interaction);
      }
    } catch (error) {
      logger.error("audit", "Audit command error", error);
      return interaction.editReply({
        content: "❌ An error occurred during the audit. Please try again.",
        ephemeral: true,
      });
    }
  },

  async fullAudit(interaction) {
    const guild = interaction.guild;
    const issues = [];
    const warnings = [];
    const recommendations = [];
    let securityScore = 100;

    // 1. Check Verification Level
    const verificationLevel = guild.verificationLevel;
    if (verificationLevel === 0) {
      issues.push(
        "❌ No verification level set - server is vulnerable to raids"
      );
      securityScore -= 15;
    } else if (verificationLevel === 1) {
      warnings.push(
        "⚠️ Low verification level - consider increasing to Medium or High"
      );
      securityScore -= 5;
    }

    // 2. Check 2FA Requirement
    if (guild.mfaLevel === 0) {
      issues.push("❌ 2FA not required for moderators - major security risk");
      securityScore -= 20;
    }

    // 3. Check Default Notifications
    if (guild.defaultMessageNotifications === 0) {
      // ALL_MESSAGES
      warnings.push(
        "⚠️ Default notifications set to All Messages - can cause spam"
      );
      securityScore -= 3;
    }

    // 4. Check Explicit Content Filter
    if (guild.explicitContentFilter === 0) {
      warnings.push("⚠️ No explicit content filter - consider enabling");
      securityScore -= 5;
    }

    // 5. Audit @everyone Role
    const everyoneRole = guild.roles.everyone;
    const dangerousPerms = [
      "Administrator",
      "ManageGuild",
      "ManageRoles",
      "ManageChannels",
      "ManageWebhooks",
      "ManageGuildExpressions",
      "BanMembers",
      "KickMembers",
      "MentionEveryone",
    ];

    const everyoneHas = dangerousPerms.filter((perm) =>
      everyoneRole.permissions.has(PermissionFlagsBits[perm])
    );

    if (everyoneHas.length > 0) {
      issues.push(
        `❌ @everyone has dangerous permissions: ${everyoneHas.join(", ")}`
      );
      securityScore -= everyoneHas.length * 10;
    }

    // 6. Check Role Hierarchy
    const adminRoles = guild.roles.cache.filter((r) =>
      r.permissions.has(PermissionFlagsBits.Administrator)
    );

    if (adminRoles.size > 5) {
      warnings.push(
        `⚠️ Many roles have Administrator (${adminRoles.size}) - consider limiting`
      );
      securityScore -= 5;
    }

    // 7. Check Bot Permissions
    const bots = guild.members.cache.filter((m) => m.user.bot);
    const adminBots = bots.filter((b) =>
      b.permissions.has(PermissionFlagsBits.Administrator)
    );

    if (adminBots.size > 0) {
      warnings.push(
        `⚠️ ${adminBots.size} bot(s) have Administrator - consider specific permissions`
      );
      securityScore -= adminBots.size * 2;
    }

    // 8. Check for Vanity URL
    if (guild.vanityURLCode) {
      recommendations.push("✅ Vanity URL enabled - good for branding");
    } else if (guild.features.includes("VANITY_URL")) {
      recommendations.push("💡 Enable a vanity URL for better branding");
    }

    // 9. Check for Discovery
    if (guild.features.includes("DISCOVERABLE")) {
      recommendations.push("✅ Server is discoverable - good for growth");
    }

    // 10. Check Nexus Bot Configuration
    const config = await db.getServerConfig(guild.id);
    const nexusModules = {
      antiraid: config?.antiraid_enabled,
      automod: config?.automod_enabled,
      logging: config?.log_channel,
      verification: config?.verification_enabled,
      backup: config?.auto_backup,
    };

    const enabledModules = Object.entries(nexusModules).filter(
      ([_, enabled]) => enabled
    ).length;
    const totalModules = Object.keys(nexusModules).length;

    if (enabledModules < totalModules * 0.5) {
      recommendations.push(
        `💡 Only ${enabledModules}/${totalModules} Nexus modules enabled - enable more for better protection`
      );
      securityScore -= 10;
    }

    // 11. Check Recent Audit Logs for Suspicious Activity
    try {
      const auditLogs = await guild.fetchAuditLogs({ limit: 50 });
      const recentActions = auditLogs.entries.filter(
        (e) => Date.now() - e.createdTimestamp < 86400000 // Last 24 hours
      );

      const suspiciousActions = recentActions.filter((e) =>
        [
          "MEMBER_BAN_ADD",
          "MEMBER_KICK",
          "CHANNEL_DELETE",
          "ROLE_DELETE",
        ].includes(e.action)
      );

      if (suspiciousActions.size > 10) {
        warnings.push(
          `⚠️ High moderation activity detected (${suspiciousActions.size} actions in 24h)`
        );
      }
    } catch (err) {
      warnings.push(
        "⚠️ Unable to check audit logs - ensure bot has View Audit Log permission"
      );
    }

    // 12. Check Channel Permissions
    const publicChannels = guild.channels.cache.filter(
      (c) =>
        c.permissionOverwrites.cache.has(guild.roles.everyone.id) &&
        c.permissionOverwrites.cache
          .get(guild.roles.everyone.id)
          .allow.has(PermissionFlagsBits.ViewChannel)
    );

    if (publicChannels.size === guild.channels.cache.size) {
      warnings.push(
        "⚠️ All channels are public - consider creating private staff channels"
      );
      securityScore -= 5;
    }

    // Calculate final score
    securityScore = Math.max(0, Math.min(100, securityScore));

    // Determine rating
    let rating, ratingEmoji, ratingColor;
    if (securityScore >= 90) {
      rating = "Excellent";
      ratingEmoji = "🛡️";
      ratingColor = 0x00ff00;
    } else if (securityScore >= 75) {
      rating = "Good";
      ratingEmoji = "✅";
      ratingColor = 0x00ff00;
    } else if (securityScore >= 50) {
      rating = "Fair";
      ratingEmoji = "⚠️";
      ratingColor = 0xffa500;
    } else {
      rating = "Poor";
      ratingEmoji = "❌";
      ratingColor = 0xff0000;
    }

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle(`${ratingEmoji} Server Security Audit`)
      .setDescription(
        `**Overall Security Score: ${securityScore}/100** (${rating})`
      )
      .setColor(ratingColor)
      .setTimestamp()
      .setFooter({ text: `Audited by ${interaction.client.user.username}` });

    if (issues.length > 0) {
      embed.addFields({
        name: "🚨 Critical Issues",
        value: issues.slice(0, 10).join("\n") || "None",
        inline: false,
      });
    }

    if (warnings.length > 0) {
      embed.addFields({
        name: "⚠️ Warnings",
        value: warnings.slice(0, 10).join("\n") || "None",
        inline: false,
      });
    }

    if (recommendations.length > 0) {
      embed.addFields({
        name: "💡 Recommendations",
        value: recommendations.slice(0, 5).join("\n") || "None",
        inline: false,
      });
    }

    embed.addFields({
      name: "📊 Quick Stats",
      value: [
        `Verification: ${["None", "Low", "Medium", "High", "Highest"][verificationLevel]}`,
        `2FA Required: ${guild.mfaLevel === 1 ? "Yes ✅" : "No ❌"}`,
        `Content Filter: ${["Disabled", "No Role", "Everyone"][guild.explicitContentFilter]}`,
        `Nexus Modules: ${enabledModules}/${totalModules} enabled`,
      ].join("\n"),
      inline: false,
    });

    // Store audit result
    await db.db.run(
      `INSERT INTO audit_history (guild_id, audit_type, score, issues, warnings, recommendations, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        guild.id,
        "full",
        securityScore,
        JSON.stringify(issues),
        JSON.stringify(warnings),
        JSON.stringify(recommendations),
        Date.now(),
      ]
    );

    return interaction.editReply({ embeds: [embed] });
  },

  async quickAudit(interaction) {
    const guild = interaction.guild;
    const issues = [];

    // Quick checks
    if (guild.verificationLevel === 0) issues.push("No verification");
    if (guild.mfaLevel === 0) issues.push("No 2FA requirement");
    if (
      guild.roles.everyone.permissions.has(PermissionFlagsBits.MentionEveryone)
    ) {
      issues.push("@everyone can mention everyone");
    }

    const config = await db.getServerConfig(guild.id);
    if (!config?.antiraid_enabled) issues.push("Anti-raid disabled");
    if (!config?.automod_enabled) issues.push("AutoMod disabled");

    const score = Math.max(0, 100 - issues.length * 20);
    const status =
      score >= 70
        ? "✅ Secure"
        : score >= 40
          ? "⚠️ Needs Attention"
          : "❌ Vulnerable";

    const embed = new EmbedBuilder()
      .setTitle("⚡ Quick Security Check")
      .setDescription(`**Status:** ${status}\n**Score:** ${score}/100`)
      .setColor(score >= 70 ? 0x00ff00 : score >= 40 ? 0xffa500 : 0xff0000)
      .addFields({
        name: "Issues Found",
        value:
          issues.length > 0
            ? issues.map((i) => `• ${i}`).join("\n")
            : "None - Looking good!",
        inline: false,
      })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },

  async permissionsAudit(interaction) {
    const guild = interaction.guild;
    const dangerous = [];

    // Check all roles
    for (const role of guild.roles.cache.values()) {
      const perms = role.permissions.toArray();
      const bad = [
        "Administrator",
        "ManageGuild",
        "ManageRoles",
        "BanMembers",
        "KickMembers",
      ];
      const hasBad = perms.filter((p) => bad.includes(p));

      if (hasBad.length > 0 && role.id !== guild.id) {
        dangerous.push(`${role.name}: ${hasBad.join(", ")}`);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("🔒 Permissions Audit")
      .setDescription(
        `Found ${dangerous.length} role(s) with elevated permissions`
      )
      .setColor(
        dangerous.length > 5
          ? 0xff0000
          : dangerous.length > 2
            ? 0xffa500
            : 0x00ff00
      )
      .addFields({
        name: "Roles with Elevated Permissions",
        value: dangerous.slice(0, 20).join("\n") || "None",
        inline: false,
      })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },

  async channelsAudit(interaction) {
    const guild = interaction.guild;
    const issues = [];

    // Check each channel
    for (const channel of guild.channels.cache.values()) {
      if (!channel.permissionOverwrites) continue;

      const everyoneOverwrite = channel.permissionOverwrites.cache.get(
        guild.roles.everyone.id
      );
      if (everyoneOverwrite) {
        if (everyoneOverwrite.allow.has(PermissionFlagsBits.ManageChannels)) {
          issues.push(`${channel.name}: @everyone can manage channel`);
        }
        if (everyoneOverwrite.allow.has(PermissionFlagsBits.ManageWebhooks)) {
          issues.push(`${channel.name}: @everyone can manage webhooks`);
        }
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("📁 Channel Security Audit")
      .setDescription(`Checked ${guild.channels.cache.size} channels`)
      .setColor(issues.length > 0 ? 0xff0000 : 0x00ff00)
      .addFields({
        name: "Security Issues",
        value: issues.slice(0, 20).join("\n") || "✅ No issues found!",
        inline: false,
      })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
