const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  AttachmentBuilder,
} = require("discord.js");
const db = require("../utils/database");
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("configexport")
    .setDescription("Export and import server configurations")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("export")
        .setDescription("Export your server configuration to a file")
        .addBooleanOption((option) =>
          option
            .setName("include_data")
            .setDescription("Include user data and logs (default: false)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("import")
        .setDescription("Import configuration from a file")
        .addAttachmentOption((option) =>
          option
            .setName("file")
            .setDescription("Configuration JSON file")
            .setRequired(true)
        )
        .addBooleanOption((option) =>
          option
            .setName("overwrite")
            .setDescription("Overwrite existing settings (default: false)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("compare")
        .setDescription("Compare two configurations")
        .addAttachmentOption((option) =>
          option
            .setName("file1")
            .setDescription("First configuration file")
            .setRequired(true)
        )
        .addAttachmentOption((option) =>
          option
            .setName("file2")
            .setDescription("Second configuration file")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "export") {
      await this.exportConfig(interaction);
    } else if (subcommand === "import") {
      await this.importConfig(interaction);
    } else if (subcommand === "compare") {
      await this.compareConfigs(interaction);
    }
  },

  async exportConfig(interaction) {
    const includeData = interaction.options.getBoolean("include_data") || false;

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

      const threatSensitivity = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM threat_sensitivity WHERE guild_id = ?",
          [interaction.guild.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      const exportData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        guildId: interaction.guild.id,
        guildName: interaction.guild.name,
        config: {
          serverConfig: config,
          joinGate: joinGate,
          threatSensitivity: threatSensitivity,
        },
      };

      if (includeData) {
        // Include automod rules, workflows, etc. (but not user data)
        const automodRules = await new Promise((resolve, reject) => {
          db.db.all(
            "SELECT * FROM automod_rules WHERE guild_id = ?",
            [interaction.guild.id],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        });

        const workflows = await new Promise((resolve, reject) => {
          db.db.all(
            "SELECT * FROM workflows WHERE guild_id = ?",
            [interaction.guild.id],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        });

        exportData.config.automodRules = automodRules;
        exportData.config.workflows = workflows;
      }

      const filename = `nexus_config_${
        interaction.guild.id
      }_${Date.now()}.json`;
      const exportsDir = path.join(__dirname, "..", "data", "exports");
      if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
      }

      const filePath = path.join(exportsDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));

      const embed = new EmbedBuilder()
        .setTitle("✅ Configuration Exported")
        .setDescription(
          "Your server configuration has been exported successfully."
        )
        .addFields(
          {
            name: "📦 Export Details",
            value: `**Guild:** ${
              interaction.guild.name
            }\n**Date:** ${new Date().toLocaleString()}\n**Includes Data:** ${
              includeData ? "Yes" : "No"
            }`,
          },
          {
            name: "💡 Usage",
            value:
              "• Share with other servers\n• Backup your settings\n• Import to another server\n• Compare configurations",
          }
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
        files: [new AttachmentBuilder(filePath, { name: filename })],
      });

      // Clean up after 5 minutes
      setTimeout(() => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          logger.error("Error cleaning up export file:", error);
        }
      }, 5 * 60 * 1000);
    } catch (error) {
      logger.error("Error exporting config:", error);
      await interaction.editReply({
        content: "❌ An error occurred while exporting configuration.",
      });
    }
  },

  async importConfig(interaction) {
    const file = interaction.options.getAttachment("file");
    const overwrite = interaction.options.getBoolean("overwrite") || false;

    if (!file.name.endsWith(".json")) {
      return interaction.reply({
        content: "❌ Invalid file format. Please provide a JSON file.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const response = await fetch(file.url);
      const importData = await response.json();

      if (!importData.config || !importData.config.serverConfig) {
        return interaction.editReply({
          content: "❌ Invalid configuration file format.",
        });
      }

      const config = importData.config.serverConfig;

      // Import server config
      if (overwrite || !(await db.getServerConfig(interaction.guild.id))) {
        await new Promise((resolve, reject) => {
          const keys = Object.keys(config).filter((k) => k !== "guild_id");
          const values = keys.map((k) => config[k]);

          db.db.run(
            `INSERT INTO server_config (guild_id, ${keys.join(", ")}) 
             VALUES (?, ${keys.map(() => "?").join(", ")}) 
             ON CONFLICT(guild_id) DO UPDATE SET ${keys
               .map((k) => `${k} = excluded.${k}`)
               .join(", ")}`,
            [interaction.guild.id, ...values],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }

      // Import join gate if present
      if (importData.config.joinGate) {
        const jg = importData.config.joinGate;
        await new Promise((resolve, reject) => {
          db.db.run(
            `INSERT INTO join_gate_config (guild_id, enabled, target_unauthorized_bots, target_new_accounts, min_account_age_days) 
             VALUES (?, ?, ?, ?, ?) 
             ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled, target_unauthorized_bots = excluded.target_unauthorized_bots, target_new_accounts = excluded.target_new_accounts, min_account_age_days = excluded.min_account_age_days`,
            [
              interaction.guild.id,
              jg.enabled || 0,
              jg.target_unauthorized_bots || 0,
              jg.target_new_accounts || 0,
              jg.min_account_age_days || 7,
            ],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Configuration Imported")
        .setDescription(
          "Your server configuration has been imported successfully."
        )
        .addFields({
          name: "📋 Imported Settings",
          value: `• Server configuration\n${
            importData.config.joinGate ? "• Join gate settings\n" : ""
          }${
            importData.config.automodRules
              ? `• ${importData.config.automodRules.length} automod rules\n`
              : ""
          }${
            importData.config.workflows
              ? `• ${importData.config.workflows.length} workflows\n`
              : ""
          }`,
        })
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error importing config:", error);
      await interaction.editReply({
        content:
          "❌ An error occurred while importing configuration. Please check the file format.",
      });
    }
  },

  async compareConfigs(interaction) {
    const file1 = interaction.options.getAttachment("file1");
    const file2 = interaction.options.getAttachment("file2");

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const [response1, response2] = await Promise.all([
        fetch(file1.url),
        fetch(file2.url),
      ]);

      const [config1, config2] = await Promise.all([
        response1.json(),
        response2.json(),
      ]);

      const differences = [];
      const config1Data = config1.config?.serverConfig || {};
      const config2Data = config2.config?.serverConfig || {};

      // Compare key settings
      const keysToCompare = [
        "anti_raid_enabled",
        "anti_nuke_enabled",
        "heat_system_enabled",
        "auto_mod_enabled",
        "alert_threshold",
      ];

      keysToCompare.forEach((key) => {
        if (config1Data[key] !== config2Data[key]) {
          differences.push({
            setting: key.replace(/_/g, " "),
            config1: config1Data[key] ?? "Not set",
            config2: config2Data[key] ?? "Not set",
          });
        }
      });

      const embed = new EmbedBuilder()
        .setTitle("📊 Configuration Comparison")
        .setDescription(
          differences.length === 0
            ? "✅ Configurations are identical"
            : `Found **${differences.length}** differences`
        )
        .setColor(differences.length === 0 ? 0x00ff00 : 0xffaa00)
        .setTimestamp();

      if (differences.length > 0) {
        differences.slice(0, 10).forEach((diff) => {
          embed.addFields({
            name: diff.setting,
            value: `**Config 1:** ${diff.config1}\n**Config 2:** ${diff.config2}`,
            inline: true,
          });
        });

        if (differences.length > 10) {
          embed.setFooter({
            text: `+${differences.length - 10} more differences`,
          });
        }
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error comparing configs:", error);
      await interaction.editReply({
        content: "❌ An error occurred while comparing configurations.",
      });
    }
  },
};
