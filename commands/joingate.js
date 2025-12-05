const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const JoinGate = require("../utils/joinGate");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("joingate")
    .setDescription("Configure Join Gate - Filter new members")
    .addSubcommand((subcommand) =>
      subcommand.setName("enable").setDescription("Enable Join Gate")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("disable").setDescription("Disable Join Gate")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("config")
        .setDescription("Configure Join Gate settings")
        .addStringOption((option) =>
          option
            .setName("setting")
            .setDescription("Setting to configure")
            .setRequired(true)
            .addChoices(
              { name: "Target Unauthorized Bots", value: "unauthorized_bots" },
              { name: "Target New Accounts", value: "new_accounts" },
              { name: "Target No Avatar", value: "no_avatar" },
              { name: "Target Unverified Bots", value: "unverified_bots" },
              { name: "Target Invite Usernames", value: "invite_usernames" },
              { name: "Target Suspicious", value: "suspicious" }
            )
        )
        .addBooleanOption((option) =>
          option
            .setName("enabled")
            .setDescription("Enable or disable this setting")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("age")
        .setDescription("Set minimum account age")
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Minimum account age in days")
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(365)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("action")
        .setDescription("Set action for filtered members")
        .addStringOption((option) =>
          option
            .setName("action_type")
            .setDescription("Action to take")
            .setRequired(true)
            .addChoices(
              { name: "Kick", value: "kick" },
              { name: "Ban", value: "ban" },
              { name: "Timeout", value: "timeout" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("word")
        .setDescription("Manage strict/wildcard words")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Word list type")
            .setRequired(true)
            .addChoices(
              { name: "Strict Words", value: "strict" },
              { name: "Wildcard Words", value: "wildcard" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Action to perform")
            .setRequired(true)
            .addChoices(
              { name: "Add", value: "add" },
              { name: "Remove", value: "remove" },
              { name: "List", value: "list" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("word")
            .setDescription("Word/pattern to add or remove")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View current Join Gate configuration")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "enable") {
      await JoinGate.setConfig(interaction.guild.id, { enabled: true });
      await interaction.reply({
        embeds: [
          {
            title: "✅ Join Gate Enabled",
            description: "Join Gate is now active and filtering new members.",
            color: 0x00ff00,
          },
        ],
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "disable") {
      await JoinGate.setConfig(interaction.guild.id, { enabled: false });
      await interaction.reply({
        embeds: [
          {
            title: "❌ Join Gate Disabled",
            description: "Join Gate is now inactive.",
            color: 0xff0000,
          },
        ],
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "config") {
      const setting = interaction.options.getString("setting");
      const enabled = interaction.options.getBoolean("enabled");

      const configMap = {
        unauthorized_bots: "target_unauthorized_bots",
        new_accounts: "target_new_accounts",
        no_avatar: "target_no_avatar",
        unverified_bots: "target_unverified_bots",
        invite_usernames: "target_invite_usernames",
        suspicious: "target_suspicious",
      };

      await JoinGate.setConfig(interaction.guild.id, {
        [configMap[setting]]: enabled,
      });

      await interaction.reply({
        embeds: [
          {
            title: "✅ Setting Updated",
            description: `**${setting
              .replace(/_/g, " ")
              .toUpperCase()}** is now ${enabled ? "enabled" : "disabled"}`,
            color: 0x00ff00,
          },
        ],
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "age") {
      const days = interaction.options.getInteger("days");
      await JoinGate.setConfig(interaction.guild.id, {
        min_account_age_days: days,
      });

      await interaction.reply({
        embeds: [
          {
            title: "✅ Minimum Account Age Set",
            description: `Accounts must be at least **${days} days** old to join.`,
            color: 0x00ff00,
          },
        ],
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "action") {
      const actionType = interaction.options.getString("action_type");
      await JoinGate.setConfig(interaction.guild.id, { action: actionType });

      await interaction.reply({
        embeds: [
          {
            title: "✅ Action Updated",
            description: `Filtered members will now be **${actionType}ed**.`,
            color: 0x00ff00,
          },
        ],
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "word") {
      const type = interaction.options.getString("type");
      const action = interaction.options.getString("action");
      const word = interaction.options.getString("word");

      const config = await JoinGate.getConfig(interaction.guild.id);
      if (!config) {
        await JoinGate.setConfig(interaction.guild.id, { enabled: false });
      }

      const wordKey = type === "strict" ? "strict_words" : "wildcard_words";
      const words = config?.[wordKey] || [];

      if (action === "add") {
        if (!word) {
          return interaction.reply({
            content: "❌ Please provide a word/pattern to add!",
            flags: MessageFlags.Ephemeral,
          });
        }
        if (words.includes(word)) {
          return interaction.reply({
            content: "❌ This word/pattern is already in the list!",
            flags: MessageFlags.Ephemeral,
          });
        }
        words.push(word);
        await JoinGate.setConfig(interaction.guild.id, { [wordKey]: words });

        await interaction.reply({
          embeds: [
            {
              title: "✅ Word Added",
              description: `Added **${word}** to ${type} words.`,
              color: 0x00ff00,
            },
          ],
          flags: MessageFlags.Ephemeral,
        });
      } else if (action === "remove") {
        if (!word) {
          return interaction.reply({
            content: "❌ Please provide a word/pattern to remove!",
            flags: MessageFlags.Ephemeral,
          });
        }
        const index = words.indexOf(word);
        if (index === -1) {
          return interaction.reply({
            content: "❌ Word/pattern not found in list!",
            flags: MessageFlags.Ephemeral,
          });
        }
        words.splice(index, 1);
        await JoinGate.setConfig(interaction.guild.id, { [wordKey]: words });

        await interaction.reply({
          embeds: [
            {
              title: "✅ Word Removed",
              description: `Removed **${word}** from ${type} words.`,
              color: 0x00ff00,
            },
          ],
          flags: MessageFlags.Ephemeral,
        });
      } else if (action === "list") {
        if (words.length === 0) {
          return interaction.reply({
            content: `❌ No ${type} words configured!`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const embed = new EmbedBuilder()
          .setTitle(`${type === "strict" ? "Strict" : "Wildcard"} Words`)
          .setDescription(words.map((w) => `• ${w}`).join("\n"))
          .setColor(0x0099ff)
          .setTimestamp();

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
      }
    } else if (subcommand === "view") {
      const config = await JoinGate.getConfig(interaction.guild.id);

      if (!config || !config.enabled) {
        return interaction.reply({
          embeds: [
            {
              title: "🛡️ Join Gate Status",
              description: "Join Gate is **disabled**.",
              color: 0xff0000,
            },
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🛡️ Join Gate Configuration")
        .addFields(
          {
            name: "Status",
            value: config.enabled ? "✅ Enabled" : "❌ Disabled",
            inline: true,
          },
          {
            name: "Action",
            value: config.action?.toUpperCase() || "KICK",
            inline: true,
          },
          {
            name: "Minimum Account Age",
            value: `${config.min_account_age_days} days`,
            inline: true,
          },
          {
            name: "Detection Filters",
            value: [
              config.target_unauthorized_bots
                ? "✅ Unauthorized Bots"
                : "❌ Unauthorized Bots",
              config.target_new_accounts
                ? "✅ New Accounts"
                : "❌ New Accounts",
              config.target_no_avatar ? "✅ No Avatar" : "❌ No Avatar",
              config.target_unverified_bots
                ? "✅ Unverified Bots"
                : "❌ Unverified Bots",
              config.target_invite_usernames
                ? "✅ Invite Usernames"
                : "❌ Invite Usernames",
              config.target_suspicious
                ? "✅ Suspicious Accounts"
                : "❌ Suspicious Accounts",
            ].join("\n"),
            inline: false,
          }
        )
        .setColor(0x00ff00)
        .setTimestamp();

      if (config.strict_words?.length > 0) {
        embed.addFields({
          name: "Strict Words",
          value: config.strict_words.join(", ") || "None",
          inline: false,
        });
      }

      if (config.wildcard_words?.length > 0) {
        embed.addFields({
          name: "Wildcard Words",
          value: config.wildcard_words.join(", ") || "None",
          inline: false,
        });
      }

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
