const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("migrate")
    .setDescription("Migrate from Wick to Nexus")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const WickMigration = require("../utils/wickMigration");
      const migration = new WickMigration(interaction.client);

      // Analyze current setup
      const analysis = await migration.analyzeWickConfig(interaction.guild);

      if (!analysis.hasWick) {
        const embed = new EmbedBuilder()
          .setTitle("ℹ️ Wick Not Found")
          .setDescription(
            "Wick bot is not in this server. Nothing to migrate!"
          )
          .setColor(0x2196f3);

        return await interaction.editReply({ embeds: [embed] });
      }

      // Show migration preview
      const comparisonData = migration.generateComparison();
      const embed = new EmbedBuilder()
        .setTitle("🔄 Wick Migration Ready")
        .setDescription(
          `**Found Wick in your server!**\n\n` +
            `Ready to migrate and upgrade your security?\n\n` +
            `**What we'll import:**\n` +
            (analysis.detectedSettings.logChannels
              ? `✅ ${analysis.detectedSettings.logChannels.length} log channel(s)\n`
              : "") +
            (analysis.detectedSettings.quarantineRoles
              ? `✅ ${analysis.detectedSettings.quarantineRoles.length} moderation role(s)\n`
              : "") +
            `✅ All compatible settings`
        )
        .setColor(0x9333ea)
        .addFields({
          name: "🚀 Instant Upgrades You'll Get",
          value: comparisonData.features
            .filter((f) => f.advantage === "nexus")
            .slice(0, 5)
            .map((f) => `✅ **${f.feature}:** ${f.wick} → ${f.nexus}`)
            .join("\n"),
        })
        .setFooter({
          text: "Use the dashboard to complete migration: /dashboard",
        });

      await interaction.editReply({ embeds: [embed] });

      logger.info("Command", `/migrate executed in ${interaction.guild.name}`);
    } catch (error) {
      logger.error("Command", "Migration error", error);
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription(
          "Migration failed. Please try manual setup with `/quicksetup`"
        )
        .setColor(0xf44336);

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};
