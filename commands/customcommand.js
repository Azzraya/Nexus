const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("customcommand")
    .setDescription("Manage custom commands")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a custom command")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Command name")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("response")
            .setDescription(
              "Command response (supports variables: {user}, {guild}, {member}, {channel})"
            )
            .setRequired(true)
        )
        .addBooleanOption((option) =>
          option
            .setName("embed")
            .setDescription("Send as embed (default: false)")
            .setRequired(false)
        )
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
      subcommand.setName("list").setDescription("List all custom commands")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("info")
        .setDescription("Learn how to use custom commands")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      const name = interaction.options.getString("name").toLowerCase();
      const response = interaction.options.getString("response");
      const useEmbed = interaction.options.getBoolean("embed") || false;

      // Check if command already exists
      const existing = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM custom_commands WHERE guild_id = ? AND command_name = ?",
          [interaction.guild.id, name],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (existing) {
        return interaction.reply({
          content: "❌ A command with that name already exists!",
          flags: MessageFlags.Ephemeral,
        });
      }

      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO custom_commands (guild_id, command_name, response, use_embed, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [
            interaction.guild.id,
            name,
            response,
            useEmbed ? 1 : 0,
            interaction.user.id,
            Date.now(),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Custom Command Created")
        .setDescription(
          `**Command:** \`!${name}\`\n` +
            `**Response:** ${response.slice(0, 200)}${
              response.length > 200 ? "..." : ""
            }\n` +
            `**Type:** ${useEmbed ? "Embed" : "Text"}\n\n` +
            `💡 **Usage:** Type \`!${name}\` in any channel to trigger this command.\n\n` +
            `**Available Variables:**\n` +
            `• \`{user}\` - User mention\n` +
            `• \`{user.tag}\` - User tag\n` +
            `• \`{user.id}\` - User ID\n` +
            `• \`{guild}\` - Server name\n` +
            `• \`{member}\` - Member display name\n` +
            `• \`{channel}\` - Channel mention`
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "delete") {
      const name = interaction.options.getString("name").toLowerCase();

      await new Promise((resolve, reject) => {
        db.db.run(
          "DELETE FROM custom_commands WHERE guild_id = ? AND command_name = ?",
          [interaction.guild.id, name],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await interaction.reply({
        content: `✅ Command \`${name}\` deleted!`,
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "list") {
      const commands = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT command_name, response FROM custom_commands WHERE guild_id = ?",
          [interaction.guild.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (commands.length === 0) {
        return interaction.reply({
          content: "❌ No custom commands found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const list = commands
        .map(
          (cmd) => `\`${cmd.command_name}\` - ${cmd.response.slice(0, 50)}...`
        )
        .join("\n");

      const embed = new EmbedBuilder()
        .setTitle("📋 Custom Commands")
        .setDescription(list)
        .setColor(0x0099ff)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "info") {
      const embed = new EmbedBuilder()
        .setTitle("📖 How to Use Custom Commands")
        .setDescription(
          "Custom commands are triggered using the **`!` prefix** in chat.\n\n" +
            "**Example:**\n" +
            "1. Create a command: `/customcommand create name:hello response:Hello there!`\n" +
            "2. Use it in chat: Type `!hello` in any channel\n" +
            "3. Bot responds: `Hello there!`\n\n" +
            "**Features:**\n" +
            "• Server-specific commands (each server has its own)\n" +
            "• Simple text responses\n" +
            "• Use `/customcommand list` to see all commands\n" +
            "• Use `/customcommand delete` to remove commands"
        )
        .setColor(0x0099ff)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};
