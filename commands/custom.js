const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const customCommands = require("../utils/customCommands");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("custom")
    .setDescription("Manage custom commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a new custom command")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Command name (without /)")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("response")
            .setDescription("What the command should respond with")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option.setName("description").setDescription("Command description")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("embed")
        .setDescription("Create a custom command with an embed")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Command name (without /)")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("Embed title")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Embed description")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("color")
            .setDescription("Embed color (hex code like #667eea)")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all custom commands in this server")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a custom command")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Command name to delete")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("info")
        .setDescription("View information about a custom command")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Command name")
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      await interaction.deferReply({ ephemeral: true });

      const name = interaction.options.getString("name").toLowerCase();
      const response = interaction.options.getString("response");
      const description =
        interaction.options.getString("description") || "Custom command";

      // Validate name
      if (name.length > 32 || !/^[a-z0-9_-]+$/.test(name)) {
        return await interaction.editReply({
          content:
            "❌ Command name must be 1-32 characters and contain only letters, numbers, hyphens, and underscores.",
        });
      }

      try {
        const result = await customCommands.createCommand(
          interaction.guild.id,
          {
            name,
            description,
            type: "text",
            content: response,
            createdBy: interaction.user.id,
          }
        );

        const embed = new EmbedBuilder()
          .setTitle("✅ Custom Command Created")
          .setColor("#48bb78")
          .addFields(
            {
              name: "📝 Command",
              value: `\`/${name}\``,
              inline: true,
            },
            {
              name: "📋 Description",
              value: description,
              inline: true,
            },
            {
              name: "💬 Response",
              value:
                response.length > 100
                  ? response.substring(0, 100) + "..."
                  : response,
              inline: false,
            }
          )
          .setFooter({
            text: "Note: You need to restart the bot for this command to appear in Discord",
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        await interaction.editReply({
          content: `❌ ${error.message}`,
        });
      }
    } else if (subcommand === "embed") {
      await interaction.deferReply({ ephemeral: true });

      const name = interaction.options.getString("name").toLowerCase();
      const title = interaction.options.getString("title");
      const description = interaction.options.getString("description");
      const color = interaction.options.getString("color") || "#667eea";

      // Validate name
      if (name.length > 32 || !/^[a-z0-9_-]+$/.test(name)) {
        return await interaction.editReply({
          content:
            "❌ Command name must be 1-32 characters and contain only letters, numbers, hyphens, and underscores.",
        });
      }

      // Validate color
      const colorInt = parseInt(color.replace("#", ""), 16);
      if (isNaN(colorInt)) {
        return await interaction.editReply({
          content: "❌ Invalid color. Use hex format like #667eea",
        });
      }

      try {
        await customCommands.createCommand(interaction.guild.id, {
          name,
          description: `Custom embed command`,
          type: "embed",
          content: null,
          embedTitle: title,
          embedDescription: description,
          embedColor: color,
          createdBy: interaction.user.id,
        });

        const embed = new EmbedBuilder()
          .setTitle("✅ Custom Embed Command Created")
          .setColor("#48bb78")
          .addFields({
            name: "📝 Command",
            value: `\`/${name}\``,
            inline: false,
          })
          .setDescription("**Preview:**")
          .setFooter({ text: "Restart bot to use this command" })
          .setTimestamp();

        const preview = new EmbedBuilder()
          .setTitle(title)
          .setDescription(description)
          .setColor(colorInt);

        await interaction.editReply({ embeds: [embed, preview] });
      } catch (error) {
        await interaction.editReply({
          content: `❌ ${error.message}`,
        });
      }
    } else if (subcommand === "list") {
      await interaction.deferReply({ ephemeral: true });

      const commands = await customCommands.getCommands(interaction.guild.id);

      if (commands.length === 0) {
        return await interaction.editReply({
          content:
            "📋 No custom commands found. Use `/custom create` to make one!",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📝 Custom Commands - ${interaction.guild.name}`)
        .setDescription(`Total: **${commands.length}** custom command(s)`)
        .setColor("#667eea")
        .setTimestamp();

      commands.slice(0, 15).forEach((cmd, index) => {
        embed.addFields({
          name: `${index + 1}. /${cmd.command_name}`,
          value: [
            `Type: ${cmd.response_type}`,
            `Uses: ${cmd.uses}`,
            `Created: <t:${Math.floor(cmd.created_at / 1000)}:R>`,
          ].join(" • "),
          inline: false,
        });
      });

      if (commands.length > 15) {
        embed.setFooter({ text: `Showing 15 of ${commands.length} commands` });
      }

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === "delete") {
      await interaction.deferReply({ ephemeral: true });

      const name = interaction.options.getString("name").toLowerCase().trim();
      const logger = require("../utils/logger");

      try {
        // First check if command exists - list all commands for debugging
        const allCommands = await customCommands.getCommands(
          interaction.guild.id
        );
        logger.info(
          "Custom Command Delete",
          `Looking for command "${name}" in guild ${interaction.guild.id}. Total commands: ${allCommands.length}`
        );

        const existing = await customCommands.getCommand(
          interaction.guild.id,
          name
        );

        if (!existing) {
          logger.warn(
            "Custom Command Delete",
            `Command "${name}" not found. Available commands: ${allCommands.map((c) => c.command_name).join(", ")}`
          );
          return await interaction.editReply({
            content: `❌ Command \`/${name}\` not found. Use \`/custom list\` to see available commands.`,
          });
        }

        logger.info(
          "Custom Command Delete",
          `Found command to delete: "${existing.command_name}" (ID: ${existing.id})`
        );

        // Clear cache BEFORE deletion
        try {
          const redisCache = require("../utils/redisCache");
          const cacheKey = `custom_cmd_${interaction.guild.id}_${name}`;
          await redisCache.del(cacheKey);
          logger.info("Custom Command Delete", `Cleared cache: ${cacheKey}`);
        } catch (cacheErr) {
          logger.warn(
            "Custom Command Delete",
            `Cache clear failed: ${cacheErr.message}`
          );
        }

        // Delete the command
        const result = await customCommands.deleteCommand(
          interaction.guild.id,
          name
        );

        if (result.deleted) {
          // Verify it's actually gone
          const verifyDeleted = await customCommands.getCommand(
            interaction.guild.id,
            name
          );

          if (verifyDeleted) {
            logger.error(
              "Custom Command Delete",
              `Command still exists after deletion! Command: ${name}`
            );
            await interaction.editReply({
              content: `⚠️ Warning: Command deletion reported success but command may still exist. Please try again or check manually.`,
            });
          } else {
            logger.info(
              "Custom Command Delete",
              `✅ Verified deletion - command no longer exists`
            );
            await interaction.editReply({
              content: `✅ Custom command \`/${name}\` deleted successfully.`,
            });
          }
        } else {
          logger.warn(
            "Custom Command Delete",
            `Deletion failed: ${result.reason || "unknown"}`
          );
          await interaction.editReply({
            content: `❌ Failed to delete command \`/${name}\`. Reason: ${result.reason || "unknown"}`,
          });
        }
      } catch (error) {
        logger.error("Custom Command Delete", "Error deleting command", {
          message: error?.message || String(error),
          stack: error?.stack,
          name: error?.name,
        });
        await interaction.editReply({
          content: `❌ An error occurred while deleting the command: ${error.message}`,
        });
      }
    } else if (subcommand === "info") {
      await interaction.deferReply({ ephemeral: true });

      const name = interaction.options.getString("name").toLowerCase();
      const command = await customCommands.getCommand(
        interaction.guild.id,
        name
      );

      if (!command) {
        return await interaction.editReply({
          content: `❌ Command \`/${name}\` not found.`,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📝 Command Info - /${command.command_name}`)
        .setColor("#667eea")
        .addFields(
          {
            name: "📋 Description",
            value: command.description || "No description",
            inline: false,
          },
          {
            name: "💬 Type",
            value: command.response_type,
            inline: true,
          },
          {
            name: "📊 Uses",
            value: `${command.uses}`,
            inline: true,
          },
          {
            name: "👤 Created By",
            value: `<@${command.created_by}>`,
            inline: true,
          },
          {
            name: "📅 Created",
            value: `<t:${Math.floor(command.created_at / 1000)}:F>`,
            inline: false,
          }
        )
        .setTimestamp();

      if (command.response_type === "text") {
        embed.addFields({
          name: "💬 Response",
          value:
            command.response_content.length > 500
              ? command.response_content.substring(0, 500) + "..."
              : command.response_content,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
