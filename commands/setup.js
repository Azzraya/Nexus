const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const logger = require("../utils/logger");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Setup wizard and preset configurations for your server")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("wizard")
        .setDescription(
          "Interactive setup wizard - guides you through configuration"
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("preset")
        .setDescription("Apply a preset configuration for your server type")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Server type preset")
            .setRequired(true)
            .addChoices(
              { name: "Gaming Server", value: "gaming" },
              { name: "Community Server", value: "community" },
              { name: "Business/Professional", value: "business" },
              { name: "Streaming/Content Creator", value: "streaming" },
              { name: "Educational", value: "educational" },
              { name: "Custom (Wizard)", value: "custom" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Check your setup progress and completion")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "wizard") {
      await this.runWizard(interaction);
    } else if (subcommand === "preset") {
      await this.applyPreset(interaction);
    } else if (subcommand === "status") {
      await this.showStatus(interaction);
    }
  },

  async runWizard(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const embed = new EmbedBuilder()
      .setTitle("🎯 Nexus Setup Wizard")
      .setDescription(
        "Welcome! I'll guide you through setting up Nexus Bot for your server.\n\n" +
          "**This wizard will:**\n" +
          "• Configure optimal security settings\n" +
          "• Set up moderation tools\n" +
          "• Enable recommended features\n" +
          "• Create starter workflows\n\n" +
          "**Estimated time:** 3-5 minutes\n\n" +
          "Let's get started! Answer a few questions about your server."
      )
      .setColor(0x5865f2)
      .setFooter({ text: "Step 1 of 6" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("wizard_start")
        .setLabel("Start Setup")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("wizard_cancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });

    // Wizard will continue via button interactions
    // For now, provide immediate preset option
    const quickEmbed = new EmbedBuilder()
      .setTitle("⚡ Quick Setup Available")
      .setDescription(
        "**Want to skip the wizard?**\n\n" +
          "Use `/setup preset` to instantly configure your server:\n" +
          "• `gaming` - Gaming servers\n" +
          "• `community` - Large communities\n" +
          "• `business` - Professional servers\n" +
          "• `streaming` - Content creators\n" +
          "• `educational` - Schools/learning\n\n" +
          "Or continue with the interactive wizard above!"
      )
      .setColor(0x00ff00);

    await interaction.followUp({
      embeds: [quickEmbed],
      flags: MessageFlags.Ephemeral,
    });
  },

  async handleWizardStep(interaction, step) {
    if (step === "start") {
      // Interaction is already deferred in the event handler

      // Step 1: Server Type
      const embed = new EmbedBuilder()
        .setTitle("🎯 Setup Wizard - Step 1 of 6")
        .setDescription(
          "**What type of server is this?**\n\nThis helps us configure optimal settings for your server."
        )
        .addFields({
          name: "Server Types",
          value:
            "• **Gaming** - Gaming communities\n" +
            "• **Community** - Large communities\n" +
            "• **Business** - Professional servers\n" +
            "• **Streaming** - Content creators\n" +
            "• **Educational** - Schools/learning",
          inline: false,
        })
        .setColor(0x5865f2)
        .setFooter({ text: "Step 1 of 6 - Server Type" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("wizard_gaming")
          .setLabel("Gaming")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("wizard_community")
          .setLabel("Community")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("wizard_business")
          .setLabel("Business")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("wizard_streaming")
          .setLabel("Streaming")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("wizard_educational")
          .setLabel("Educational")
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    }
  },

  async applyPreset(interaction) {
    const presetType = interaction.options
      ? interaction.options.getString("type")
      : interaction.customId?.replace("wizard_", "");

    if (presetType === "custom") {
      return this.runWizard(interaction);
    }

    // Check if already deferred/updated (from button interaction)
    // Button interactions are already deferred in the event handler
    const isButtonInteraction = interaction.isButton && interaction.isButton();
    if (!isButtonInteraction && !interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const presets = {
      gaming: {
        name: "Gaming Server",
        description: "Optimized for gaming communities",
        config: {
          anti_raid_enabled: 1,
          anti_nuke_enabled: 1,
          heat_system_enabled: 1,
          auto_mod_enabled: 1,
          alert_threshold: 50,
        },
        features: [
          "✅ Anti-raid protection (moderate sensitivity)",
          "✅ Anti-nuke protection",
          "✅ Heat system for spam detection",
          "✅ Auto-moderation enabled",
          "✅ Join gate (7 day account age)",
          "✅ Moderation logging",
        ],
      },
      community: {
        name: "Large Community",
        description: "Optimized for large, active communities",
        config: {
          anti_raid_enabled: 1,
          anti_nuke_enabled: 1,
          heat_system_enabled: 1,
          auto_mod_enabled: 1,
          alert_threshold: 40,
        },
        features: [
          "✅ Anti-raid protection (high sensitivity)",
          "✅ Anti-nuke protection",
          "✅ Advanced heat system",
          "✅ Auto-moderation enabled",
          "✅ Join gate (3 day account age)",
          "✅ Threat intelligence network",
          "✅ Enhanced logging",
        ],
      },
      business: {
        name: "Business/Professional",
        description: "Optimized for professional environments",
        config: {
          anti_raid_enabled: 1,
          anti_nuke_enabled: 1,
          heat_system_enabled: 0,
          auto_mod_enabled: 1,
          alert_threshold: 30,
        },
        features: [
          "✅ Anti-raid protection (low sensitivity)",
          "✅ Anti-nuke protection",
          "✅ Manual moderation focus",
          "✅ Enhanced audit logging",
          "✅ Professional reporting",
          "✅ Privacy-focused settings",
        ],
      },
      streaming: {
        name: "Streaming/Content Creator",
        description: "Optimized for streamers and content creators",
        config: {
          anti_raid_enabled: 1,
          anti_nuke_enabled: 1,
          heat_system_enabled: 1,
          auto_mod_enabled: 1,
          alert_threshold: 60,
        },
        features: [
          "✅ Anti-raid protection (high sensitivity)",
          "✅ Anti-nuke protection",
          "✅ Spam protection",
          "✅ Auto-moderation",
          "✅ Join gate (1 day account age)",
          "✅ Real-time alerts",
        ],
      },
      educational: {
        name: "Educational",
        description: "Optimized for schools and learning communities",
        config: {
          anti_raid_enabled: 1,
          anti_nuke_enabled: 1,
          heat_system_enabled: 0,
          auto_mod_enabled: 1,
          alert_threshold: 25,
        },
        features: [
          "✅ Anti-raid protection",
          "✅ Anti-nuke protection",
          "✅ Manual moderation focus",
          "✅ Enhanced privacy settings",
          "✅ COPPA compliance",
          "✅ Educational reporting",
        ],
      },
    };

    const preset = presets[presetType];
    if (!preset) {
      return interaction.editReply({
        content: "❌ Invalid preset type. Please choose a valid option.",
      });
    }

    try {
      // Apply configuration
      const config = await db.getServerConfig(interaction.guild.id);
      const newConfig = { ...config, ...preset.config };

      await new Promise((resolve, reject) => {
        db.db.run(
          `INSERT INTO server_config (guild_id, ${Object.keys(
            preset.config
          ).join(", ")}) 
           VALUES (?, ${Object.keys(preset.config)
             .map(() => "?")
             .join(", ")}) 
           ON CONFLICT(guild_id) DO UPDATE SET ${Object.keys(preset.config)
             .map((k) => `${k} = excluded.${k}`)
             .join(", ")}`,
          [interaction.guild.id, ...Object.values(preset.config)],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Set up join gate for applicable presets
      if (
        presetType === "gaming" ||
        presetType === "community" ||
        presetType === "streaming"
      ) {
        const minAge =
          presetType === "gaming" ? 7 : presetType === "community" ? 3 : 1;
        await new Promise((resolve, reject) => {
          db.db.run(
            `INSERT INTO join_gate_config (guild_id, enabled, target_new_accounts, min_account_age_days) 
             VALUES (?, 1, 1, ?) 
             ON CONFLICT(guild_id) DO UPDATE SET enabled = 1, target_new_accounts = 1, min_account_age_days = ?`,
            [interaction.guild.id, minAge, minAge],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }

      logger.info(
        `Preset ${presetType} applied to guild ${interaction.guild.id}`
      );

      const embed = new EmbedBuilder()
        .setTitle(`✅ ${preset.name} Preset Applied`)
        .setDescription(preset.description)
        .addFields(
          {
            name: "📋 Configured Features",
            value: preset.features.join("\n"),
            inline: false,
          },
          {
            name: "🎯 Next Steps",
            value:
              "• Review settings with `/config view`\n" +
              "• Set up mod log channel: `/config modlog #channel`\n" +
              "• Get recommendations: `/recommend analyze`\n" +
              "• View dashboard: `/dashboard`",
            inline: false,
          }
        )
        .setColor(0x00ff00)
        .setFooter({ text: "Your server is now protected!" })
        .setTimestamp();

      // Use editReply if deferred (button interaction), otherwise reply
      if (interaction.deferred || interaction.isButton?.()) {
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.reply({ embeds: [embed] });
      }
    } catch (error) {
      logger.error("Error applying preset:", error);
      await interaction.editReply(ErrorMessages.genericError());
    }
  },

  async showStatus(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const config = await db.getServerConfig(interaction.guild.id);
      const joinGate = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM join_gate_config WHERE guild_id = ?",
          [interaction.guild.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      const completed = [];
      const incomplete = [];

      if (config) {
        if (config.mod_log_channel)
          completed.push("✅ Mod log channel configured");
        else incomplete.push("❌ Mod log channel not set");

        if (config.anti_raid_enabled) completed.push("✅ Anti-raid enabled");
        else incomplete.push("❌ Anti-raid disabled");

        if (config.anti_nuke_enabled) completed.push("✅ Anti-nuke enabled");
        else incomplete.push("❌ Anti-nuke disabled");

        if (config.auto_mod_enabled)
          completed.push("✅ Auto-moderation enabled");
        else incomplete.push("❌ Auto-moderation disabled");
      } else {
        incomplete.push(
          "❌ Server not configured - run `/setup preset` or `/setup wizard`"
        );
      }

      if (joinGate && joinGate.enabled) {
        completed.push("✅ Join gate configured");
      } else {
        incomplete.push("⚠️ Join gate not configured");
      }

      const completion = Math.round(
        (completed.length / (completed.length + incomplete.length)) * 100
      );

      const embed = new EmbedBuilder()
        .setTitle("📊 Setup Status")
        .setDescription(
          `**Completion: ${completion}%**\n\n${completed.length} of ${
            completed.length + incomplete.length
          } essential features configured`
        )
        .addFields(
          {
            name: "✅ Completed",
            value: completed.length > 0 ? completed.join("\n") : "None yet",
            inline: false,
          },
          {
            name: incomplete.length > 0 ? "⚠️ Needs Attention" : "✅ All Set",
            value:
              incomplete.length > 0
                ? incomplete.join("\n")
                : "Your server is fully configured!",
            inline: false,
          }
        )
        .setColor(
          completion === 100 ? 0x00ff00 : completion >= 50 ? 0xffaa00 : 0xff0000
        )
        .setFooter({
          text: "Use /setup preset or /setup wizard to complete setup",
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error showing setup status:", error);
      await interaction.editReply(ErrorMessages.genericError());
    }
  },
};
