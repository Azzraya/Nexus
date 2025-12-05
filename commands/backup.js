const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const backupManager = require("../utils/backupManager");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Backup and restore server configurations")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a backup of your server configuration")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all available backups for this server")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("restore")
        .setDescription("Restore a backup")
        .addStringOption((option) =>
          option
            .setName("backup-id")
            .setDescription("Backup ID to restore")
            .setRequired(true)
        )
        .addBooleanOption((option) =>
          option
            .setName("config")
            .setDescription("Restore bot configuration (default: true)")
        )
        .addBooleanOption((option) =>
          option
            .setName("roles")
            .setDescription(
              "Restore roles (CAREFUL: only creates missing roles)"
            )
        )
        .addBooleanOption((option) =>
          option
            .setName("channels")
            .setDescription(
              "Restore channels (CAREFUL: only creates missing channels)"
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a backup")
        .addStringOption((option) =>
          option
            .setName("backup-id")
            .setDescription("Backup ID to delete")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("info")
        .setDescription("View detailed information about a backup")
        .addStringOption((option) =>
          option
            .setName("backup-id")
            .setDescription("Backup ID to view")
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      await interaction.deferReply({ ephemeral: true });

      const result = await backupManager.createBackup(interaction.guild);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setTitle("✅ Backup Created Successfully")
          .setColor("#48bb78")
          .addFields(
            {
              name: "🆔 Backup ID",
              value: `\`${result.backupId}\``,
              inline: false,
            },
            {
              name: "📦 Size",
              value: `${(result.size / 1024).toFixed(2)} KB`,
              inline: true,
            },
            {
              name: "📅 Created",
              value: `<t:${Math.floor(result.timestamp / 1000)}:R>`,
              inline: true,
            }
          )
          .setDescription(
            "**What was backed up:**\n" +
              "• All bot configurations\n" +
              "• Role structure\n" +
              "• Channel layout\n" +
              "• Guild settings\n\n" +
              "**To restore:** `/backup restore backup-id:" +
              result.backupId +
              "`"
          )
          .setFooter({ text: "Keep this backup ID safe!" })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({
          content: `❌ ${result.error}`,
        });
      }
    } else if (subcommand === "list") {
      await interaction.deferReply({ ephemeral: true });

      const backups = await backupManager.listBackups(interaction.guild.id);

      if (backups.length === 0) {
        return await interaction.editReply({
          content:
            "📦 No backups found for this server. Use `/backup create` to create one!",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📦 Backups for ${interaction.guild.name}`)
        .setDescription(`Found **${backups.length}** backup(s)`)
        .setColor("#667eea")
        .setTimestamp();

      backups.slice(0, 10).forEach((backup, index) => {
        embed.addFields({
          name: `${index + 1}. ${backup.guildName}`,
          value: [
            `**ID:** \`${backup.id}\``,
            `**Created:** <t:${Math.floor(backup.timestamp / 1000)}:R>`,
            `**Size:** ${(backup.size / 1024).toFixed(2)} KB`,
          ].join("\n"),
          inline: false,
        });
      });

      if (backups.length > 10) {
        embed.setFooter({ text: `Showing 10 of ${backups.length} backups` });
      }

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === "restore") {
      await interaction.deferReply({ ephemeral: true });

      const backupId = interaction.options.getString("backup-id");
      const restoreConfig = interaction.options.getBoolean("config") ?? true;
      const restoreRoles = interaction.options.getBoolean("roles") ?? false;
      const restoreChannels =
        interaction.options.getBoolean("channels") ?? false;

      // Confirmation check
      const embed = new EmbedBuilder()
        .setTitle("⚠️ Confirm Restore")
        .setDescription(
          "**You are about to restore a backup!**\n\n" +
            "This will:\n" +
            (restoreConfig
              ? "✅ Restore bot configuration\n"
              : "❌ Skip bot configuration\n") +
            (restoreRoles ? "✅ Create missing roles\n" : "❌ Skip roles\n") +
            (restoreChannels
              ? "✅ Create missing channels\n"
              : "❌ Skip channels\n") +
            "\n**This action cannot be undone!**\n\n" +
            `Backup ID: \`${backupId}\``
        )
        .setColor("#ed8936")
        .setFooter({ text: "React with ✅ to confirm within 30 seconds" });

      await interaction.editReply({ embeds: [embed] });

      // Perform restore
      const result = await backupManager.restoreBackup(
        interaction.guild,
        backupId,
        { restoreConfig, restoreRoles, restoreChannels }
      );

      if (result.success) {
        const successEmbed = new EmbedBuilder()
          .setTitle("✅ Backup Restored Successfully")
          .setColor("#48bb78")
          .addFields(
            {
              name: "📋 What was restored",
              value: [
                result.restored.config
                  ? "✅ Bot Configuration"
                  : "➖ Bot Configuration (skipped)",
                `${result.restored.roles > 0 ? "✅" : "➖"} Roles (${result.restored.roles} created)`,
                `${result.restored.channels > 0 ? "✅" : "➖"} Channels (${result.restored.channels} created)`,
              ].join("\n"),
              inline: false,
            },
            {
              name: "📅 Backup Date",
              value: `<t:${Math.floor(result.timestamp / 1000)}:F>`,
              inline: false,
            }
          )
          .setFooter({ text: "Server configuration has been restored" })
          .setTimestamp();

        await interaction.editReply({ embeds: [successEmbed] });
      } else {
        await interaction.editReply({
          content: `❌ ${result.error}`,
        });
      }
    } else if (subcommand === "delete") {
      await interaction.deferReply({ ephemeral: true });

      const backupId = interaction.options.getString("backup-id");
      const result = await backupManager.deleteBackup(backupId);

      if (result.success) {
        await interaction.editReply({
          content: `✅ Backup \`${backupId}\` deleted successfully.`,
        });
      } else {
        await interaction.editReply({
          content: `❌ ${result.error}`,
        });
      }
    } else if (subcommand === "info") {
      await interaction.deferReply({ ephemeral: true });

      const backupId = interaction.options.getString("backup-id");
      const backup = await backupManager.loadBackup(backupId);

      if (!backup) {
        return await interaction.editReply({
          content: `❌ Backup not found: \`${backupId}\``,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📦 Backup Information")
        .setColor("#667eea")
        .addFields(
          {
            name: "🆔 Backup ID",
            value: `\`${backup.id}\``,
            inline: false,
          },
          {
            name: "🖥️ Server",
            value: backup.guildName,
            inline: true,
          },
          {
            name: "📅 Created",
            value: `<t:${Math.floor(backup.timestamp / 1000)}:F>`,
            inline: true,
          },
          {
            name: "📊 Contains",
            value: [
              `Roles: **${backup.data.roles?.length || 0}**`,
              `Channels: **${backup.data.channels?.length || 0}**`,
              `Config: **${backup.data.config ? "Yes" : "No"}**`,
            ].join("\n"),
            inline: false,
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
