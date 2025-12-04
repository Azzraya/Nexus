const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const AutoMod = require("../utils/automod");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configure auto-moderation rules")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a new auto-mod rule")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Rule type")
            .setRequired(true)
            .addChoices(
              { name: "Contains", value: "contains" },
              { name: "Starts With", value: "starts_with" },
              { name: "Ends With", value: "ends_with" },
              { name: "Invite Link", value: "invite_link" },
              { name: "Spam", value: "spam" },
              { name: "Caps", value: "caps" },
              { name: "Mentions", value: "mentions" },
              { name: "Regex Pattern", value: "regex" },
              { name: "Link Detection", value: "links" },
              { name: "Emoji Spam", value: "emoji_spam" },
              { name: "Raid Keywords", value: "raid_keywords" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("trigger")
            .setDescription("Trigger text/pattern")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Action to take")
            .setRequired(true)
            .addChoices(
              { name: "Delete", value: "delete" },
              { name: "Warn", value: "warn" },
              { name: "Mute", value: "mute" },
              { name: "Kick", value: "kick" },
              { name: "Ban", value: "ban" },
              { name: "Timeout", value: "timeout" },
              { name: "Quarantine", value: "quarantine" }
            )
        )
        .addIntegerOption((option) =>
          option
            .setName("cooldown")
            .setDescription("Cooldown in seconds (0 = no cooldown)")
            .setMinValue(0)
            .setMaxValue(3600)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("threshold")
            .setDescription("Trigger threshold (how many times before action)")
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List all auto-mod rules")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove an auto-mod rule")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("Rule ID to remove")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("test")
        .setDescription("Test a message against auto-mod rules")
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Message to test")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("stats").setDescription("View auto-mod statistics")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Quick setup with preset word filters and common rules")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const type = interaction.options.getString("type");
      const trigger = interaction.options.getString("trigger");
      const action = interaction.options.getString("action");

      const ruleId = await AutoMod.addRule(
        interaction.guild.id,
        type,
        trigger,
        action
      );

      await interaction.reply({
        embeds: [
          {
            title: "✅ Auto-Mod Rule Added",
            description: `**Type:** ${type}\n**Trigger:** ${trigger}\n**Action:** ${action}`,
            color: 0x00ff00,
          },
        ],
      });
    } else if (subcommand === "list") {
      const rules = await AutoMod.getRules(interaction.guild.id);

      if (rules.length === 0) {
        return interaction.reply({
          embeds: [
            {
              title: "📋 Auto-Mod Rules",
              description: "No rules configured",
              color: 0x0099ff,
            },
          ],
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Auto-Mod Rules")
        .setColor(0x0099ff)
        .setTimestamp();

      const rulesList = rules
        .map(
          (r) =>
            `**ID:** ${r.id} | **Type:** ${r.rule_type} | **Trigger:** ${r.trigger} | **Action:** ${r.action}`
        )
        .join("\n");

      embed.setDescription(rulesList);
      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "remove") {
      const ruleId = interaction.options.getInteger("id");
      await AutoMod.removeRule(ruleId);

      await interaction.reply({
        embeds: [
          {
            title: "✅ Rule Removed",
            description: `Removed rule #${ruleId}`,
            color: 0x00ff00,
          },
        ],
      });
    } else if (subcommand === "test") {
      const messageText = interaction.options.getString("message");
      const rules = await AutoMod.getRules(interaction.guild.id);

      // Create a mock message object for testing
      const mockMessage = {
        content: messageText,
        author: {
          bot: false,
          id: interaction.user.id,
        },
        guild: interaction.guild,
        mentions: {
          users: {
            size: (messageText.match(/<@!?\d+>/g) || []).length,
          },
        },
      };

      const matchedRules = [];
      for (const rule of rules) {
        if (!rule.enabled) continue;
        const wouldTrigger = await AutoMod.checkRule(mockMessage, rule);
        if (wouldTrigger) {
          matchedRules.push(rule);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle("🧪 Auto-Mod Test Results")
        .addFields(
          {
            name: "Test Message",
            value: messageText,
            inline: false,
          },
          {
            name: "Matched Rules",
            value:
              matchedRules.length > 0
                ? matchedRules
                    .map((r) => `**#${r.id}** ${r.rule_type} → ${r.action}`)
                    .join("\n")
                : "✅ No rules matched",
            inline: false,
          }
        )
        .setColor(matchedRules.length > 0 ? 0xff0000 : 0x00ff00)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "stats") {
      const rules = await AutoMod.getRules(interaction.guild.id);
      const stats = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT COUNT(*) as total, SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as active FROM automod_rules WHERE guild_id = ?",
          [interaction.guild.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || { total: 0, active: 0 });
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("📊 Auto-Mod Statistics")
        .addFields(
          {
            name: "Total Rules",
            value: `${stats.total}`,
            inline: true,
          },
          {
            name: "Active Rules",
            value: `${stats.active}`,
            inline: true,
          },
          {
            name: "Inactive Rules",
            value: `${stats.total - stats.active}`,
            inline: true,
          }
        )
        .setColor(0x0099ff)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "setup") {
      await interaction.deferReply();

      // Enable auto-mod
      await db.setServerConfig(interaction.guild.id, {
        auto_mod_enabled: 1,
      });

      // Preset word list (spam/scam terms - moderate profanity filter)
      const presetWords = [
        // Spam/scam terms
        "discord.gg",
        "discord.com/invite",
        "nitro",
        "free nitro",
        "click here",
        "limited time",
        "steam",
        "gift card",
        "verify",
        "claim",
        "expired",
        "suspended",
        // Common spam phrases
        "get rich",
        "make money",
        "work from home",
        "bitcoin",
        "crypto",
        // Raid/harassment terms
        "raid",
        "nuke",
        "crash server",
      ];

      // Preset rules to add
      const presetRules = [
        // Word filters (spam/scam focused)
        ...presetWords.map((word) => ({
          type: "contains",
          trigger: word,
          action: "delete",
        })),
        // Invite links
        {
          type: "invite_link",
          trigger: ".*",
          action: "mute",
        },
        // Spam detection
        {
          type: "spam",
          trigger: ".*",
          action: "warn",
        },
        // Excessive caps
        {
          type: "caps",
          trigger: ".*",
          action: "delete",
        },
        // Excessive mentions
        {
          type: "mentions",
          trigger: ".*",
          action: "warn",
        },
        // Emoji spam
        {
          type: "emoji_spam",
          trigger: ".*",
          action: "delete",
        },
      ];

      let added = 0;
      let skipped = 0;
      const errors = [];

      // Check existing rules to avoid duplicates
      const existingRules = await AutoMod.getRules(interaction.guild.id);
      const existingTriggers = new Set(
        existingRules.map((r) => `${r.rule_type}:${r.trigger.toLowerCase()}`)
      );

      // Add preset rules
      for (const rule of presetRules) {
        const ruleKey = `${rule.type}:${rule.trigger.toLowerCase()}`;
        if (existingTriggers.has(ruleKey)) {
          skipped++;
          continue;
        }

        try {
          await AutoMod.addRule(
            interaction.guild.id,
            rule.type,
            rule.trigger,
            rule.action
          );
          added++;
        } catch (error) {
          errors.push(`${rule.type}: ${error.message}`);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Auto-Mod Quick Setup Complete")
        .setDescription(
          `Auto-moderation has been enabled with preset rules. You can still add custom rules with \`/automod add\`.`
        )
        .addFields(
          {
            name: "Rules Added",
            value: `${added} new rules`,
            inline: true,
          },
          {
            name: "Skipped (Already Exist)",
            value: `${skipped} rules`,
            inline: true,
          },
          {
            name: "Preset Features",
            value:
              "• Word filters (spam, scams, raid terms)\n• Invite link detection\n• Spam detection\n• Caps filter\n• Mention spam\n• Emoji spam",
            inline: false,
          },
          {
            name: "Next Steps",
            value:
              "• Use `/automod list` to see all rules\n• Use `/automod add` to add custom words\n• Use `/automod remove` to remove preset rules if needed",
            inline: false,
          }
        )
        .setColor(0x00ff00)
        .setTimestamp();

      if (errors.length > 0 && errors.length <= 5) {
        embed.addFields({
          name: "⚠️ Errors",
          value: errors.join("\n"),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
