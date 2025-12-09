const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const { ServerTemplates } = require("../utils/serverTemplates");
const db = require("../utils/database");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("template")
    .setDescription("Apply server configuration templates for quick setup")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("View all available server templates")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("apply")
        .setDescription("Apply a template to your server")
        .addStringOption((option) =>
          option
            .setName("template")
            .setDescription("Choose a template")
            .setRequired(true)
            .addChoices(
              { name: "🎮 Gaming Server", value: "gaming" },
              { name: "👥 Community Server", value: "community" },
              { name: "💼 Business/Professional", value: "business" },
              { name: "📚 Educational/School", value: "educational" },
              { name: "🎬 Streaming/Content Creator", value: "streaming" },
              { name: "🔒 Maximum Security", value: "highSecurity" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("recommend")
        .setDescription("Get a template recommendation for your server")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "list") {
      return this.handleList(interaction);
    } else if (subcommand === "apply") {
      return this.handleApply(interaction);
    } else if (subcommand === "recommend") {
      return this.handleRecommend(interaction);
    }
  },

  async handleList(interaction) {
    const templates = ServerTemplates.getTemplates();

    const embed = new EmbedBuilder()
      .setTitle("📋 Server Templates")
      .setDescription(
        "Choose a template to quickly configure your server based on its type.\n\n" +
          "**Templates will:**\n" +
          "✅ Configure anti-raid & anti-nuke\n" +
          "✅ Set up auto-moderation\n" +
          "✅ Create necessary roles\n" +
          "✅ Create log channels\n\n" +
          "**Available Templates:**"
      )
      .setColor(0x667eea);

    templates.forEach((template) => {
      embed.addFields({
        name: template.name,
        value: template.description,
        inline: false,
      });
    });

    embed.addFields({
      name: "📝 How to Apply",
      value:
        "Use `/template apply template:<name>` to apply a template\n" +
        "Use `/template recommend` to get a recommendation",
      inline: false,
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async handleApply(interaction) {
    const templateId = interaction.options.getString("template");
    const template = ServerTemplates.getTemplate(templateId);

    if (!template) {
      return interaction.reply({
        content: "❌ Template not found!",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Apply template
      const results = await ServerTemplates.applyTemplate(
        interaction.guild,
        templateId,
        db
      );

      const embed = new EmbedBuilder()
        .setTitle(`✅ ${template.name} Template Applied!`)
        .setDescription(
          `Successfully configured your server with the **${template.name}** template.`
        )
        .setColor(0x48bb78);

      const applied = [];
      const failed = [];

      if (results.config) {
        applied.push("✅ Server configuration");
      } else {
        failed.push("❌ Server configuration");
      }

      if (results.roles.muted) applied.push("✅ Muted role");
      if (results.roles.verified) applied.push("✅ Verified role");
      if (results.channels.mod_log) applied.push("✅ Mod log channel");
      if (results.channels.alert) applied.push("✅ Alert channel");

      if (applied.length > 0) {
        embed.addFields({
          name: "🎉 Successfully Applied",
          value: applied.join("\n"),
          inline: false,
        });
      }

      if (results.errors.length > 0) {
        embed.addFields({
          name: "⚠️ Errors",
          value: results.errors.join("\n").substring(0, 1024),
          inline: false,
        });
      }

      embed.addFields({
        name: "🔧 Next Steps",
        value:
          "1. Review the configuration with `/config show`\n" +
          "2. Test with `/security test` (if available)\n" +
          "3. Adjust settings with `/setup` commands",
        inline: false,
      });

      await interaction.editReply({ embeds: [embed] });

      logger.info(
        "Template",
        `Applied ${template.name} template to ${interaction.guild.name}`
      );
    } catch (error) {
      logger.error("Template", `Failed to apply template: ${error.message}`);

      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Template Application Failed")
        .setDescription(
          `Failed to apply template: ${error.message}\n\n` +
            "This is usually due to missing permissions. Make sure the bot has:\n" +
            "• Manage Roles\n" +
            "• Manage Channels\n" +
            "• Administrator (recommended)"
        )
        .setColor(0xf44336);

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleRecommend(interaction) {
    const recommended = ServerTemplates.recommendTemplate(interaction.guild);
    const template = ServerTemplates.getTemplate(recommended);

    if (!template) {
      return interaction.reply({
        content: "❌ Failed to generate recommendation",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("🎯 Recommended Template")
      .setDescription(
        `Based on your server's size and structure, we recommend:\n\n` +
          `**${template.name}**\n` +
          `${template.description}\n\n` +
          `**Server Analysis:**\n` +
          `• Members: ${interaction.guild.memberCount}\n` +
          `• Channels: ${interaction.guild.channels.cache.size}\n` +
          `• Voice Channels: ${interaction.guild.channels.cache.filter((c) => c.type === 2).size}`
      )
      .setColor(0x667eea);

    embed.addFields({
      name: "📝 Apply This Template",
      value: `Use \`/template apply template:${recommended}\` to apply this configuration`,
      inline: false,
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
