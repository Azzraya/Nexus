const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription(
      "Configure advanced automod (spam, links, caps, emoji, mentions)"
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("enable").setDescription("Enable automod")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("disable").setDescription("Disable automod")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("spam")
        .setDescription("Configure spam detection")
        .addIntegerOption((option) =>
          option
            .setName("max_messages")
            .setDescription("Max messages in time window (default: 5)")
            .setMinValue(2)
            .setMaxValue(20)
        )
        .addIntegerOption((option) =>
          option
            .setName("time_window")
            .setDescription("Time window in seconds (default: 5)")
            .setMinValue(1)
            .setMaxValue(30)
        )
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Action to take")
            .addChoices(
              { name: "Delete", value: "delete" },
              { name: "Warn", value: "warn" },
              { name: "Timeout (5min)", value: "timeout" },
              { name: "Kick", value: "kick" },
              { name: "Ban", value: "ban" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("links")
        .setDescription("Configure link scanning")
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription("Link filtering mode")
            .addChoices(
              { name: "Whitelist Only", value: "whitelist" },
              { name: "Block Blacklist", value: "blacklist" },
              { name: "Block All", value: "block_all" },
              { name: "Disabled", value: "disabled" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("domains")
            .setDescription("Comma-separated domains (youtube.com,discord.gg)")
        )
        .addBooleanOption((option) =>
          option
            .setName("block_invites")
            .setDescription("Block Discord invites?")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("caps")
        .setDescription("Configure excessive caps detection")
        .addIntegerOption((option) =>
          option
            .setName("threshold")
            .setDescription("Max % of caps allowed (default: 70)")
            .setMinValue(50)
            .setMaxValue(100)
        )
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Action to take")
            .addChoices(
              { name: "Delete", value: "delete" },
              { name: "Warn", value: "warn" },
              { name: "Timeout", value: "timeout" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("emoji")
        .setDescription("Configure emoji spam detection")
        .addIntegerOption((option) =>
          option
            .setName("max_count")
            .setDescription("Max emojis per message (default: 10)")
            .setMinValue(3)
            .setMaxValue(50)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("mentions")
        .setDescription("Configure mention spam detection")
        .addIntegerOption((option) =>
          option
            .setName("max_count")
            .setDescription("Max mentions per message (default: 5)")
            .setMinValue(1)
            .setMaxValue(20)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ignore")
        .setDescription("Ignore channels/roles from automod")
        .addChannelOption((option) =>
          option.setName("channel").setDescription("Channel to ignore")
        )
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role to ignore")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("log")
        .setDescription("Set automod log channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel for automod logs")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("status").setDescription("View automod configuration")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("violations")
        .setDescription("View recent violations")
        .addUserOption((option) =>
          option.setName("user").setDescription("User to check")
        )
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of violations to show (default: 10)")
            .setMinValue(1)
            .setMaxValue(50)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "enable") {
      await db.updateAutomodConfig(interaction.guild.id, {
        spam_enabled: 1,
        link_scanning_enabled: 1,
        caps_enabled: 1,
        emoji_spam_enabled: 1,
        mention_spam_enabled: 1,
      });

      return interaction.reply({
        embeds: [
          {
            title: "✅ Automod Enabled",
            description: "Advanced automod is now active with default settings",
            color: 0x00ff00,
            fields: [
              { name: "Spam Detection", value: "✅ Enabled", inline: true },
              { name: "Link Scanning", value: "✅ Enabled", inline: true },
              { name: "Caps Detection", value: "✅ Enabled", inline: true },
            ],
          },
        ],
      });
    }

    if (subcommand === "disable") {
      await db.updateAutomodConfig(interaction.guild.id, {
        spam_enabled: 0,
        link_scanning_enabled: 0,
        caps_enabled: 0,
        emoji_spam_enabled: 0,
        mention_spam_enabled: 0,
      });

      return interaction.reply({
        embeds: [
          {
            title: "❌ Automod Disabled",
            description: "All automod features have been disabled",
            color: 0xff0000,
          },
        ],
      });
    }

    if (subcommand === "spam") {
      const maxMessages = interaction.options.getInteger("max_messages");
      const timeWindow = interaction.options.getInteger("time_window");
      const action = interaction.options.getString("action");

      const updates = {};
      if (maxMessages) updates.spam_max_messages = maxMessages;
      if (timeWindow) updates.spam_time_window = timeWindow * 1000;
      if (action) updates.spam_action = action;

      await db.updateAutomodConfig(interaction.guild.id, updates);

      const config = await db.getAutomodConfig(interaction.guild.id);

      return interaction.reply({
        embeds: [
          {
            title: "⚙️ Spam Detection Configured",
            fields: [
              {
                name: "Max Messages",
                value: `${config.spam_max_messages}`,
                inline: true,
              },
              {
                name: "Time Window",
                value: `${config.spam_time_window / 1000}s`,
                inline: true,
              },
              { name: "Action", value: config.spam_action, inline: true },
            ],
            color: 0x0099ff,
          },
        ],
      });
    }

    if (subcommand === "links") {
      const mode = interaction.options.getString("mode");
      const domains = interaction.options.getString("domains");
      const blockInvites = interaction.options.getBoolean("block_invites");

      const updates = {};

      if (mode) {
        switch (mode) {
          case "whitelist":
            updates.link_scanning_enabled = 1;
            updates.link_action = "delete";
            if (domains) {
              updates.link_whitelist = JSON.stringify(
                domains.split(",").map((d) => d.trim())
              );
            }
            break;
          case "blacklist":
            updates.link_scanning_enabled = 1;
            updates.link_action = "delete";
            if (domains) {
              updates.link_blacklist = JSON.stringify(
                domains.split(",").map((d) => d.trim())
              );
            }
            break;
          case "block_all":
            updates.link_scanning_enabled = 1;
            updates.link_action = "delete";
            updates.link_whitelist = JSON.stringify([]);
            break;
          case "disabled":
            updates.link_scanning_enabled = 0;
            break;
        }
      }

      if (blockInvites !== null) {
        updates.block_invites = blockInvites ? 1 : 0;
      }

      await db.updateAutomodConfig(interaction.guild.id, updates);

      return interaction.reply({
        embeds: [
          {
            title: "🔗 Link Scanning Configured",
            description: mode ? `Mode: **${mode}**` : "Link settings updated",
            color: 0x0099ff,
            fields: domains
              ? [
                  {
                    name: "Domains",
                    value: domains.split(",").join(", "),
                    inline: false,
                  },
                ]
              : [],
          },
        ],
      });
    }

    if (subcommand === "caps") {
      const threshold = interaction.options.getInteger("threshold");
      const action = interaction.options.getString("action");

      const updates = {};
      if (threshold) updates.caps_threshold = threshold;
      if (action) updates.caps_action = action;

      await db.updateAutomodConfig(interaction.guild.id, updates);

      const config = await db.getAutomodConfig(interaction.guild.id);

      return interaction.reply({
        embeds: [
          {
            title: "🔤 Caps Detection Configured",
            fields: [
              {
                name: "Threshold",
                value: `${config.caps_threshold}%`,
                inline: true,
              },
              { name: "Action", value: config.caps_action, inline: true },
            ],
            color: 0x0099ff,
          },
        ],
      });
    }

    if (subcommand === "emoji") {
      const maxCount = interaction.options.getInteger("max_count");

      await db.updateAutomodConfig(interaction.guild.id, {
        emoji_max_count: maxCount,
      });

      return interaction.reply({
        embeds: [
          {
            title: "😀 Emoji Spam Detection Configured",
            description: `Max emojis per message: **${maxCount}**`,
            color: 0x0099ff,
          },
        ],
      });
    }

    if (subcommand === "mentions") {
      const maxCount = interaction.options.getInteger("max_count");

      await db.updateAutomodConfig(interaction.guild.id, {
        mention_max_count: maxCount,
      });

      return interaction.reply({
        embeds: [
          {
            title: "📢 Mention Spam Detection Configured",
            description: `Max mentions per message: **${maxCount}**`,
            color: 0x0099ff,
          },
        ],
      });
    }

    if (subcommand === "ignore") {
      const channel = interaction.options.getChannel("channel");
      const role = interaction.options.getRole("role");

      if (!channel && !role) {
        return interaction.reply({
          content: "❌ Provide at least a channel or role to ignore",
          flags: MessageFlags.Ephemeral,
        });
      }

      const config = await db.getAutomodConfig(interaction.guild.id);
      const ignoredChannels = config?.ignored_channels
        ? JSON.parse(config.ignored_channels)
        : [];
      const ignoredRoles = config?.ignored_roles
        ? JSON.parse(config.ignored_roles)
        : [];

      if (channel && !ignoredChannels.includes(channel.id)) {
        ignoredChannels.push(channel.id);
      }
      if (role && !ignoredRoles.includes(role.id)) {
        ignoredRoles.push(role.id);
      }

      await db.updateAutomodConfig(interaction.guild.id, {
        ignored_channels: JSON.stringify(ignoredChannels),
        ignored_roles: JSON.stringify(ignoredRoles),
      });

      return interaction.reply({
        embeds: [
          {
            title: "✅ Automod Ignore List Updated",
            fields: [
              channel
                ? { name: "Ignored Channel", value: `${channel}`, inline: true }
                : null,
              role
                ? { name: "Ignored Role", value: `${role}`, inline: true }
                : null,
            ].filter(Boolean),
            color: 0x00ff00,
          },
        ],
      });
    }

    if (subcommand === "log") {
      const channel = interaction.options.getChannel("channel");

      await db.updateAutomodConfig(interaction.guild.id, {
        automod_log_channel: channel.id,
      });

      return interaction.reply({
        embeds: [
          {
            title: "📋 Automod Log Channel Set",
            description: `Automod actions will be logged to ${channel}`,
            color: 0x0099ff,
          },
        ],
      });
    }

    if (subcommand === "status") {
      const config = await db.getAutomodConfig(interaction.guild.id);

      if (!config) {
        return interaction.reply({
          content:
            "❌ Automod not configured. Use `/automod enable` to get started",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🤖 Automod Configuration")
        .setDescription("Current automod settings for this server")
        .setColor(0x0099ff)
        .addFields(
          {
            name: "Spam Detection",
            value: config.spam_enabled
              ? `✅ ${config.spam_max_messages} msgs / ${
                  config.spam_time_window / 1000
                }s → ${config.spam_action}`
              : "❌ Disabled",
            inline: false,
          },
          {
            name: "Link Scanning",
            value: config.link_scanning_enabled
              ? `✅ Action: ${config.link_action}`
              : "❌ Disabled",
            inline: false,
          },
          {
            name: "Caps Detection",
            value: config.caps_enabled
              ? `✅ ${config.caps_threshold}% → ${config.caps_action}`
              : "❌ Disabled",
            inline: true,
          },
          {
            name: "Emoji Spam",
            value: config.emoji_spam_enabled
              ? `✅ Max: ${config.emoji_max_count}`
              : "❌ Disabled",
            inline: true,
          },
          {
            name: "Mention Spam",
            value: config.mention_spam_enabled
              ? `✅ Max: ${config.mention_max_count}`
              : "❌ Disabled",
            inline: true,
          }
        )
        .setTimestamp();

      if (config.automod_log_channel) {
        embed.addFields({
          name: "Log Channel",
          value: `<#${config.automod_log_channel}>`,
          inline: false,
        });
      }

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === "violations") {
      const user = interaction.options.getUser("user");
      const limit = interaction.options.getInteger("limit") || 10;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const violations = await db.getAutomodViolations(
        interaction.guild.id,
        user?.id,
        limit
      );

      if (violations.length === 0) {
        return interaction.editReply({
          content: user
            ? `No violations found for ${user}`
            : "No violations found",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Automod Violations")
        .setDescription(
          user
            ? `Recent violations for ${user}`
            : `Last ${violations.length} violations`
        )
        .setColor(0xff6b6b)
        .setTimestamp();

      violations.slice(0, 10).forEach((v, i) => {
        embed.addFields({
          name: `${i + 1}. ${v.violation_type} - ${v.action_taken}`,
          value: `<@${v.user_id}> • <t:${Math.floor(v.timestamp / 1000)}:R>\n${
            v.message_content.substring(0, 100) || "No content"
          }`,
          inline: false,
        });
      });

      return interaction.editReply({ embeds: [embed] });
    }
  },
};
