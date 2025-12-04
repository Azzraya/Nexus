const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const DataPrivacy = require("../utils/dataPrivacy");
const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("privacy")
    .setDescription("Privacy and data management commands")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("export")
        .setDescription("Request a copy of your data (GDPR/CCPA)")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("What data to export")
            .setRequired(true)
            .addChoices(
              { name: "Server Data (Admin Only)", value: "server" },
              { name: "Your User Data", value: "user" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription(
          "Request deletion of your data (GDPR Right to be Forgotten)"
        )
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("What data to delete")
            .setRequired(true)
            .addChoices(
              { name: "Server Data (Owner Only)", value: "server" },
              { name: "Your User Data", value: "user" }
            )
        )
        .addBooleanOption((option) =>
          option
            .setName("confirm")
            .setDescription("Confirm you want to delete this data")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("info")
        .setDescription("View privacy policy and data practices")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "info") {
      const embed = new EmbedBuilder()
        .setTitle("🔒 Privacy Information")
        .setDescription(
          "Nexus Bot is committed to protecting your privacy and complying with GDPR, CCPA, and other privacy regulations."
        )
        .addFields(
          {
            name: "📋 Privacy Policy",
            value:
              "[View Full Privacy Policy](https://github.com/Azzraya/Nexus/blob/main/PRIVACY_POLICY.md)",
            inline: true,
          },
          {
            name: "📊 Data Handling",
            value:
              "[View Data Handling Policy](https://github.com/Azzraya/Nexus/blob/main/DATA_HANDLING.md)",
            inline: true,
          },
          {
            name: "⚖️ Terms of Service",
            value:
              "[View Terms of Service](https://github.com/Azzraya/Nexus/blob/main/TERMS_OF_SERVICE.md)",
            inline: true,
          },
          {
            name: "📥 Export Your Data",
            value: "Use `/privacy export` to request a copy of your data",
            inline: false,
          },
          {
            name: "🗑️ Delete Your Data",
            value: "Use `/privacy delete` to request data deletion",
            inline: false,
          },
          {
            name: "📧 Contact",
            value:
              "For privacy concerns: ashlynnadams635@gmail.com or join our [Support Server](https://discord.gg/UHNcUKheZP)",
            inline: false,
          }
        )
        .setColor(0x5865f2)
        .setFooter({ text: "Nexus Bot - Privacy First" })
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "export") {
      const type = interaction.options.getString("type");

      if (type === "server") {
        // Server data export - admin only
        if (
          !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          return interaction.reply({
            content: "❌ You must be an administrator to export server data.",
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          logger.info(
            `Server data export requested by ${interaction.user.id} for guild ${interaction.guild.id}`
          );

          const data = await DataPrivacy.exportServerData(interaction.guild.id);
          const filename = `server_export_${
            interaction.guild.id
          }_${Date.now()}.json`;
          const filePath = await DataPrivacy.createExportFile(data, filename);

          const embed = new EmbedBuilder()
            .setTitle("✅ Data Export Complete")
            .setDescription(
              "Your server data has been exported. This file contains all data we have stored about your server."
            )
            .addFields(
              {
                name: "📦 Export Details",
                value: `**Server:** ${
                  interaction.guild.name
                }\n**Export Date:** ${new Date().toLocaleString()}\n**File:** \`${filename}\``,
              },
              {
                name: "📋 What's Included",
                value:
                  "• Server configurations\n• Moderation logs\n• Warnings and cases\n• User stats and levels\n• Custom commands\n• Workflows and settings\n• And all other server data",
              },
              {
                name: "⚠️ Important",
                value:
                  "This file contains sensitive data. Keep it secure and do not share it publicly. You have the right to request deletion of this data at any time using `/privacy delete`.",
              }
            )
            .setColor(0x00ff00)
            .setTimestamp();

          await interaction.editReply({
            embeds: [embed],
            files: [{ attachment: filePath, name: filename }],
          });

          // Clean up file after 5 minutes
          setTimeout(() => {
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                logger.info(`Cleaned up export file: ${filename}`);
              }
            } catch (error) {
              logger.error("Error cleaning up export file:", error);
            }
          }, 5 * 60 * 1000);
        } catch (error) {
          logger.error("Error exporting server data:", error);
          await interaction.editReply({
            content:
              "❌ An error occurred while exporting your data. Please try again or contact support.",
            flags: MessageFlags.Ephemeral,
          });
        }
      } else if (type === "user") {
        // User data export
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          logger.info(
            `User data export requested by ${interaction.user.id} for guild ${interaction.guild.id}`
          );

          const data = await DataPrivacy.exportUserData(
            interaction.user.id,
            interaction.guild.id
          );
          const filename = `user_export_${interaction.user.id}_${
            interaction.guild.id
          }_${Date.now()}.json`;
          const filePath = await DataPrivacy.createExportFile(data, filename);

          const embed = new EmbedBuilder()
            .setTitle("✅ Data Export Complete")
            .setDescription(
              "Your personal data has been exported. This file contains all data we have stored about you in this server."
            )
            .addFields(
              {
                name: "📦 Export Details",
                value: `**User:** ${interaction.user.tag}\n**Server:** ${
                  interaction.guild.name
                }\n**Export Date:** ${new Date().toLocaleString()}\n**File:** \`${filename}\``,
              },
              {
                name: "📋 What's Included",
                value:
                  "• Your moderation history\n• Warnings and cases\n• Heat scores\n• User stats and levels\n• Notes about you\n• Behavioral data\n• And all other user data",
              },
              {
                name: "⚠️ Important",
                value:
                  "This file contains your personal data. Keep it secure. You have the right to request deletion of this data at any time using `/privacy delete`.",
              }
            )
            .setColor(0x00ff00)
            .setTimestamp();

          await interaction.editReply({
            embeds: [embed],
            files: [{ attachment: filePath, name: filename }],
          });

          // Clean up file after 5 minutes
          setTimeout(() => {
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                logger.info(`Cleaned up export file: ${filename}`);
              }
            } catch (error) {
              logger.error("Error cleaning up export file:", error);
            }
          }, 5 * 60 * 1000);
        } catch (error) {
          logger.error("Error exporting user data:", error);
          await interaction.editReply({
            content:
              "❌ An error occurred while exporting your data. Please try again or contact support.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    }

    if (subcommand === "delete") {
      const type = interaction.options.getString("type");
      const confirm = interaction.options.getBoolean("confirm");

      if (!confirm) {
        return interaction.reply({
          content:
            "❌ You must confirm data deletion by setting the `confirm` option to `true`. **This action cannot be undone.**",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (type === "server") {
        // Server data deletion - owner only
        if (interaction.user.id !== interaction.guild.ownerId) {
          return interaction.reply({
            content: "❌ Only the server owner can delete server data.",
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          logger.warn(
            `Server data deletion requested by ${interaction.user.id} for guild ${interaction.guild.id}`
          );

          const summary = await DataPrivacy.deleteServerData(
            interaction.guild.id
          );

          const embed = new EmbedBuilder()
            .setTitle("✅ Server Data Deleted")
            .setDescription(
              "All server data has been permanently deleted from our database. This action cannot be undone."
            )
            .addFields(
              {
                name: "🗑️ Deletion Summary",
                value: `**Server:** ${interaction.guild.name}\n**Deleted At:** ${summary.deletedAt}\n**Tables Processed:** ${summary.tablesDeleted.length}`,
              },
              {
                name: "⚠️ Important",
                value:
                  "All server configurations, logs, and data have been removed. The bot will need to be reconfigured if you add it back to this server.",
              }
            )
            .setColor(0xff0000)
            .setTimestamp();

          if (summary.errors.length > 0) {
            embed.addFields({
              name: "⚠️ Errors",
              value: `Some errors occurred during deletion:\n${summary.errors
                .map((e) => `• ${e.table}: ${e.error}`)
                .join("\n")}`,
            });
          }

          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          logger.error("Error deleting server data:", error);
          await interaction.editReply({
            content:
              "❌ An error occurred while deleting server data. Please contact support.",
            flags: MessageFlags.Ephemeral,
          });
        }
      } else if (type === "user") {
        // User data deletion
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          logger.warn(
            `User data deletion requested by ${interaction.user.id} for guild ${interaction.guild.id}`
          );

          const summary = await DataPrivacy.deleteUserData(
            interaction.user.id,
            interaction.guild.id
          );

          const embed = new EmbedBuilder()
            .setTitle("✅ Your Data Deleted")
            .setDescription(
              "Your personal data for this server has been permanently deleted from our database. This action cannot be undone."
            )
            .addFields(
              {
                name: "🗑️ Deletion Summary",
                value: `**User:** ${interaction.user.tag}\n**Server:** ${interaction.guild.name}\n**Deleted At:** ${summary.deletedAt}\n**Tables Processed:** ${summary.tablesDeleted.length}`,
              },
              {
                name: "⚠️ Important",
                value:
                  "Your warnings, moderation history, stats, and other personal data have been removed. This will not affect the bot's ability to protect the server.",
              }
            )
            .setColor(0xff0000)
            .setTimestamp();

          if (summary.errors.length > 0) {
            embed.addFields({
              name: "⚠️ Errors",
              value: `Some errors occurred during deletion:\n${summary.errors
                .map((e) => `• ${e.table}: ${e.error}`)
                .join("\n")}`,
            });
          }

          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          logger.error("Error deleting user data:", error);
          await interaction.editReply({
            content:
              "❌ An error occurred while deleting your data. Please contact support.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    }
  },
};
