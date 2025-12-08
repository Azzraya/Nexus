const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const db = require("./database");
const logger = require("./logger");

/**
 * Interactive Setup Wizard
 * Guide users through Nexus configuration with smart recommendations
 */
class SetupWizard {
  constructor(client) {
    this.client = client;
    this.activeWizards = new Map(); // userId -> wizard state
  }

  /**
   * Start setup wizard
   */
  async start(interaction) {
    const wizardState = {
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      step: 0,
      selections: {},
      startTime: Date.now(),
    };

    this.activeWizards.set(interaction.user.id, wizardState);

    // Step 0: Welcome & Server Type Selection
    await this.showServerTypeSelection(interaction);
  }

  /**
   * Step 0: Server Type Selection
   */
  async showServerTypeSelection(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("🎯 Nexus Setup Wizard")
      .setDescription(
        "Let's configure Nexus to perfectly match your server!\n\n" +
          "**First, what type of server is this?**\n" +
          "This helps us optimize settings for your community."
      )
      .setColor(0x9333ea)
      .addFields(
        {
          name: "🎮 Gaming Community",
          value: "Optimized for gaming servers with focus on anti-raid",
        },
        {
          name: "💼 Professional/Business",
          value: "Professional settings with balanced protection",
        },
        {
          name: "🎨 Creative Community",
          value: "Art, music, content creation servers",
        },
        {
          name: "📚 Educational/Learning",
          value: "Schools, courses, study groups",
        },
        {
          name: "🌟 Social/General",
          value: "General community or social server",
        }
      );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setup_gaming")
        .setLabel("Gaming")
        .setEmoji("🎮")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("setup_professional")
        .setLabel("Professional")
        .setEmoji("💼")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("setup_creative")
        .setLabel("Creative")
        .setEmoji("🎨")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("setup_educational")
        .setLabel("Educational")
        .setEmoji("📚")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("setup_social")
        .setLabel("Social")
        .setEmoji("🌟")
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({
      embeds: [embed],
      components: [buttons],
      ephemeral: true,
    });
  }

  /**
   * Handle server type selection
   */
  async handleServerTypeSelection(interaction, serverType) {
    const wizardState = this.activeWizards.get(interaction.user.id);
    if (!wizardState) return;

    wizardState.selections.serverType = serverType;
    wizardState.step = 1;

    // Show security level selection
    await this.showSecurityLevelSelection(interaction, serverType);
  }

  /**
   * Step 1: Security Level Selection
   */
  async showSecurityLevelSelection(interaction, serverType) {
    const embed = new EmbedBuilder()
      .setTitle("🛡️ Security Level")
      .setDescription(
        "How strict should Nexus be?\n\n" +
          "**Higher security** = Better protection but more restrictive\n" +
          "**Lower security** = More relaxed but allows more risk"
      )
      .setColor(0x9333ea)
      .addFields(
        {
          name: "🔴 Maximum Security",
          value:
            "Strict verification, aggressive anti-raid, all features enabled",
        },
        {
          name: "🟡 Balanced (Recommended)",
          value: "Smart protection without being too restrictive",
        },
        {
          name: "🟢 Relaxed",
          value: "Minimal restrictions, only block obvious threats",
        }
      );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("security_maximum")
        .setLabel("Maximum")
        .setEmoji("🔴")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("security_balanced")
        .setLabel("Balanced")
        .setEmoji("🟡")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("security_relaxed")
        .setLabel("Relaxed")
        .setEmoji("🟢")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.update({
      embeds: [embed],
      components: [buttons],
    });
  }

  /**
   * Handle security level selection
   */
  async handleSecurityLevelSelection(interaction, securityLevel) {
    const wizardState = this.activeWizards.get(interaction.user.id);
    if (!wizardState) return;

    wizardState.selections.securityLevel = securityLevel;
    wizardState.step = 2;

    // Apply configuration
    await this.applyConfiguration(interaction, wizardState);
  }

  /**
   * Apply configuration based on selections
   */
  async applyConfiguration(interaction, wizardState) {
    const { guildId, selections } = wizardState;
    const config = this.generateConfig(selections);

    try {
      // Update database with configuration
      await db.updateServerConfig(guildId, config.settings);

      // Show completion message
      await this.showCompletion(interaction, config);

      // Clean up wizard state
      this.activeWizards.delete(wizardState.userId);

      logger.success(
        "SetupWizard",
        `Configured ${interaction.guild.name} as ${selections.serverType} with ${selections.securityLevel} security`
      );
    } catch (error) {
      logger.error("SetupWizard", "Configuration failed", error);
      await interaction.update({
        content:
          "❌ Setup failed. Please try again or use manual configuration.",
        embeds: [],
        components: [],
      });
    }
  }

  /**
   * Generate configuration based on selections
   */
  generateConfig(selections) {
    const { serverType, securityLevel } = selections;

    // Base configuration
    const config = {
      settings: {
        anti_raid_enabled: 1,
        anti_nuke_enabled: 1,
        auto_mod_enabled: 1,
        heat_system_enabled: 1,
      },
      features: [],
    };

    // Adjust based on server type
    if (serverType === "gaming") {
      config.settings.verification_enabled = 0; // Less friction for gamers
      config.settings.alert_threshold = 50; // Lower threshold
      config.features.push("Gaming-optimized anti-raid");
      config.features.push("Lower verification barriers");
    } else if (serverType === "professional") {
      config.settings.verification_enabled = 1;
      config.settings.verification_mode = "manual";
      config.features.push("Professional verification flow");
      config.features.push("Enhanced audit logging");
    } else if (serverType === "educational") {
      config.settings.verification_enabled = 1;
      config.settings.verification_mode = "instant";
      config.features.push("Student-friendly verification");
      config.features.push("Educational safety features");
    }

    // Adjust based on security level
    if (securityLevel === "maximum") {
      config.settings.verification_enabled = 1;
      config.settings.alert_threshold = 30;
      config.features.push("Maximum protection mode");
      config.features.push("Aggressive anti-raid");
      config.features.push("All security features enabled");
    } else if (securityLevel === "relaxed") {
      config.settings.alert_threshold = 80;
      config.features.push("Relaxed protection mode");
      config.features.push("Minimal restrictions");
    } else {
      // Balanced
      config.settings.alert_threshold = 60;
      config.features.push("Balanced protection");
      config.features.push("Smart recommendations");
    }

    return config;
  }

  /**
   * Show completion message
   */
  async showCompletion(interaction, config) {
    const embed = new EmbedBuilder()
      .setTitle("✅ Setup Complete!")
      .setDescription(
        "Nexus has been configured for your server!\n\n" +
          "**Features Enabled:**\n" +
          config.features.map((f) => `✅ ${f}`).join("\n")
      )
      .setColor(0x4caf50)
      .addFields(
        {
          name: "🎯 Next Steps",
          value:
            "1️⃣ Use `/dashboard` to fine-tune settings\n" +
            "2️⃣ Check `/performance` to verify everything works\n" +
            "3️⃣ Run `/quick` for quick actions panel",
        },
        {
          name: "🛡️ You're Protected!",
          value:
            "Nexus is now monitoring your server 24/7 with:\n" +
            "• 4 Anti-Raid Algorithms\n" +
            "• AI-Powered Threat Detection\n" +
            "• Hourly Auto-Backups\n" +
            "• Real-Time Monitoring",
        }
      )
      .setFooter({ text: "Need help? Use /help or visit our support server" });

    await interaction.update({
      embeds: [embed],
      components: [],
    });
  }

  /**
   * Cancel wizard
   */
  cancelWizard(userId) {
    this.activeWizards.delete(userId);
  }

  /**
   * Get active wizards count
   */
  getActiveCount() {
    return this.activeWizards.size;
  }
}

module.exports = SetupWizard;
