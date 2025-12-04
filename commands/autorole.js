const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Manage auto-roles")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add an auto-role")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to auto-assign")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("When to assign")
            .setRequired(true)
            .addChoices({ name: "On Join", value: "join" })
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove an auto-role")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to remove")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List all auto-roles")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const role = interaction.options.getRole("role");
      const type = interaction.options.getString("type");

      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT OR REPLACE INTO auto_roles (guild_id, role_id, type) VALUES (?, ?, ?)",
          [interaction.guild.id, role.id, type],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await interaction.reply({
        embeds: [
          {
            title: "✅ Auto-Role Added",
            description: `${role} will be assigned ${
              type === "join" ? "when users join" : ""
            }`,
            color: 0x00ff00,
          },
        ],
      });
    } else if (subcommand === "remove") {
      const role = interaction.options.getRole("role");

      await new Promise((resolve, reject) => {
        db.db.run(
          "DELETE FROM auto_roles WHERE guild_id = ? AND role_id = ?",
          [interaction.guild.id, role.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await interaction.reply({
        content: `✅ Removed auto-role: ${role.name}`,
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "list") {
      const autoRoles = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT role_id, type FROM auto_roles WHERE guild_id = ?",
          [interaction.guild.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (autoRoles.length === 0) {
        return interaction.reply({
          content: "❌ No auto-roles configured!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const list = await Promise.all(
        autoRoles.map(async (ar) => {
          const role = interaction.guild.roles.cache.get(ar.role_id);
          return `${role ? role.name : "Unknown"} - ${ar.type}`;
        })
      );

      const embed = new EmbedBuilder()
        .setTitle("📋 Auto-Roles")
        .setDescription(list.join("\n"))
        .setColor(0x0099ff)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};
