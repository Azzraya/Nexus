/**
 * Migration Assistant Command
 * Help servers migrate from other security bots (especially Wick)
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const db = require("../utils/database");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("migrate")
    .setDescription("🔄 Migrate from other security bots to Nexus")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("from-wick")
        .setDescription("Migrate from Wick to Nexus")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("guide")
        .setDescription("Show migration guide and checklist")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === "from-wick") {
        await this.migrateFromWick(interaction);
      } else if (subcommand === "guide") {
        await this.showGuide(interaction);
      }
    } catch (error) {
      logger.error("Migrate Command Error:", error);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ An error occurred.",
          ephemeral: true,
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          content: "❌ An error occurred.",
        });
      }
    }
  },

  async migrateFromWick(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle("🔄 Migrating from Wick to Nexus")
      .setDescription(
        "**Good choice!** Here's your step-by-step migration plan:\n\n" +
        "Don't worry - you can keep Wick running while testing Nexus."
      )
      .setColor(0x667eea)
      .addFields(
        {
          name: "✅ Step 1: Configure Nexus",
          value:
            "Run `/setup preset` and choose your server type.\n" +
            "This will configure Nexus similar to Wick's defaults.",
          inline: false,
        },
        {
          name: "🔍 Step 2: Get Recommendations",
          value:
            "Run `/recommend analyze` to get AI-powered suggestions.\n" +
            "This will optimize your setup beyond Wick's capabilities.",
          inline: false,
        },
        {
          name: "🛡️ Step 3: Enable Protection",
          value:
            "• Anti-Raid: `/antiraid enable`\n" +
            "• Anti-Nuke: Enable via config\n" +
            "• Join Gate: `/joingate enable`\n" +
            "• Heat System: Auto-enabled",
          inline: false,
        },
        {
          name: "📊 Step 4: Compare Side-by-Side",
          value:
            "Run both bots for 1-2 weeks.\n" +
            "Use `/health` to see security score.\n" +
            "Use `/compare` to benchmark your config.",
          inline: false,
        },
        {
          name: "🎯 Step 5: Make the Switch",
          value:
            "Once confident, remove Wick and enjoy:\n" +
            "• Better features\n" +
            "• $0/month savings\n" +
            "• AI-powered security",
          inline: false,
        }
      )
      .addFields({
        name: "💡 Pro Tips",
        value:
          "• Use `/threatdashboard live` to see real-time security\n" +
          "• `/backup create` before removing Wick (safety first!)\n" +
          "• `/troubleshoot` if you hit any issues\n" +
          "• Keep Wick for first week (backup plan)",
        inline: false,
      })
      .setFooter({
        text: "Need help? Run /support or join our Discord",
      })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("View Full Comparison")
        .setStyle(ButtonStyle.Link)
        .setURL("https://azzraya.github.io/Nexus/comparison.html"),
      new ButtonBuilder()
        .setLabel("Migration Guide")
        .setStyle(ButtonStyle.Link)
        .setURL("https://azzraya.github.io/Nexus/docs.html")
    );

    await interaction.editReply({ embeds: [embed], components: [row] });

    // Log migration attempt
    await new Promise((resolve) => {
      db.db.run(
        "INSERT INTO migration_log (guild_id, from_bot, timestamp) VALUES (?, ?, ?)",
        [interaction.guild.id, "wick", Date.now()],
        () => resolve()
      );
    }).catch(() => {});

    logger.info(`[Migration] ${interaction.guild.name} starting Wick migration`);
  },

  async showGuide(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("📋 Migration Checklist")
      .setDescription("Complete guide to switching security bots")
      .setColor(0x667eea)
      .addFields(
        {
          name: "✅ Before You Start",
          value:
            "• [ ] Read comparison: Nexus vs Wick\n" +
            "• [ ] Backup your current setup\n" +
            "• [ ] Note your current bot's config\n" +
            "• [ ] Plan a test period (1-2 weeks)",
          inline: false,
        },
        {
          name: "🔧 During Migration",
          value:
            "• [ ] Configure Nexus with `/setup preset`\n" +
            "• [ ] Enable security features\n" +
            "• [ ] Test with `/health check`\n" +
            "• [ ] Run both bots simultaneously",
          inline: false,
        },
        {
          name: "✅ After Migration",
          value:
            "• [ ] Verify all features working\n" +
            "• [ ] Train your mod team\n" +
            "• [ ] Remove old bot\n" +
            "• [ ] Enjoy free security! 🎉",
          inline: false,
        }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

