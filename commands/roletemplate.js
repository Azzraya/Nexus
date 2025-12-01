const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("roletemplate")
    .setDescription("Create and manage role templates")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a role template")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Template name")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("roles")
            .setDescription("Role IDs or mentions separated by spaces")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("apply")
        .setDescription("Apply a role template to a user")
        .addStringOption((option) =>
          option
            .setName("template")
            .setDescription("Template name")
            .setRequired(true)
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to apply template to")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List all templates")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a template")
        .addStringOption((option) =>
          option
            .setName("template")
            .setDescription("Template name")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      const name = interaction.options.getString("name");
      const rolesStr = interaction.options.getString("roles");

      // Parse role IDs from mentions or raw IDs
      const roleIds = rolesStr
        .split(/\s+/)
        .map((r) => {
          const match = r.match(/<@&(\d+)>|(\d+)/);
          return match ? match[1] || match[2] : null;
        })
        .filter((id) => id && interaction.guild.roles.cache.has(id));

      if (roleIds.length === 0) {
        return interaction.reply({
          content: "❌ No valid roles found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Check if template exists
      const existing = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM role_templates WHERE guild_id = ? AND template_name = ?",
          [interaction.guild.id, name],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (existing) {
        return interaction.reply({
          content: "❌ A template with that name already exists!",
          flags: MessageFlags.Ephemeral,
        });
      }

      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO role_templates (guild_id, template_name, role_ids, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
          [
            interaction.guild.id,
            name,
            JSON.stringify(roleIds),
            interaction.user.id,
            Date.now(),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const roles = roleIds.map((id) => `<@&${id}>`).join(", ");

      const embed = new EmbedBuilder()
        .setTitle("✅ Role Template Created")
        .setDescription(
          `**Template:** \`${name}\`\n**Roles:** ${roles}\n\n💡 Use \`/roletemplate apply template:${name}\` to apply this template.`
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "apply") {
      const templateName = interaction.options.getString("template");
      const user = interaction.options.getUser("user");
      const member = await interaction.guild.members.fetch(user.id);

      const template = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM role_templates WHERE guild_id = ? AND template_name = ?",
          [interaction.guild.id, templateName],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!template) {
        return interaction.reply({
          content: "❌ Template not found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply();

      const roleIds = JSON.parse(template.role_ids);
      const roles = roleIds
        .map((id) => interaction.guild.roles.cache.get(id))
        .filter((r) => r);

      if (roles.length === 0) {
        return interaction.editReply({
          content: "❌ All roles in this template are invalid!",
        });
      }

      const added = [];
      const failed = [];

      for (const role of roles) {
        try {
          if (member.roles.cache.has(role.id)) {
            continue; // Already has role
          }
          await member.roles.add(role);
          added.push(role);
        } catch (error) {
          failed.push(role);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Template Applied")
        .setDescription(
          `**Template:** \`${templateName}\`\n**User:** ${user}\n\n` +
            (added.length > 0
              ? `✅ **Added:** ${added.map((r) => r.toString()).join(", ")}\n`
              : "") +
            (failed.length > 0
              ? `❌ **Failed:** ${failed.map((r) => r.name).join(", ")}`
              : "")
        )
        .setColor(added.length > 0 ? 0x00ff00 : 0xff0000)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === "list") {
      const templates = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM role_templates WHERE guild_id = ? ORDER BY created_at DESC",
          [interaction.guild.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (templates.length === 0) {
        return interaction.reply({
          content: "❌ No templates found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Role Templates")
        .setDescription(
          templates
            .map((t) => {
              const roleIds = JSON.parse(t.role_ids);
              const roles = roleIds
                .map((id) => {
                  const role = interaction.guild.roles.cache.get(id);
                  return role ? role.name : `Unknown (${id})`;
                })
                .join(", ");
              return `**${t.template_name}**\n${roles || "No roles"}`;
            })
            .join("\n\n")
        )
        .setColor(0x5865f2)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "delete") {
      const templateName = interaction.options.getString("template");

      const result = await new Promise((resolve, reject) => {
        db.db.run(
          "DELETE FROM role_templates WHERE guild_id = ? AND template_name = ?",
          [interaction.guild.id, templateName],
          function (err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });

      if (result === 0) {
        return interaction.reply({
          content: "❌ Template not found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.reply({
        content: `✅ Template \`${templateName}\` deleted!`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
