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
    .setName("role")
    .setDescription("Manage user roles")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a role to a user")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to add role to")
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role to add").setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a role from a user")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to remove role from")
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to remove")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("all")
        .setDescription("Add/remove role from all members")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to manage")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Action to perform")
            .setRequired(true)
            .addChoices(
              { name: "Add", value: "add" },
              { name: "Remove", value: "remove" }
            )
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");

      try {
        const member = await interaction.guild.members.fetch(user.id);
        await member.roles.add(role);

        await interaction.reply({
          embeds: [
            {
              title: "✅ Role Added",
              description: `Added ${role} to ${user.tag}`,
              color: 0x00ff00,
            },
          ],
        });
      } catch (error) {
        await interaction.reply({
          ErrorMessages.commandFailed(error.message),
          flags: MessageFlags.Ephemeral,
        });
      }
    } else if (subcommand === "remove") {
      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");

      try {
        const member = await interaction.guild.members.fetch(user.id);
        await member.roles.remove(role);

        await interaction.reply({
          embeds: [
            {
              title: "✅ Role Removed",
              description: `Removed ${role} from ${user.tag}`,
              color: 0x00ff00,
            },
          ],
        });
      } catch (error) {
        await interaction.reply({
          ErrorMessages.commandFailed(error.message),
          flags: MessageFlags.Ephemeral,
        });
      }
    } else if (subcommand === "all") {
      const role = interaction.options.getRole("role");
      const action = interaction.options.getString("action");

      await interaction.deferReply();

      const members = await interaction.guild.members.fetch();
      let success = 0;
      let failed = 0;

      for (const member of members.values()) {
        try {
          if (action === "add") {
            await member.roles.add(role);
          } else {
            await member.roles.remove(role);
          }
          success++;
        } catch {
          failed++;
        }
      }

      await interaction.editReply({
        embeds: [
          {
            title: `✅ Role ${action === "add" ? "Added" : "Removed"} to All`,
            description: `**Success:** ${success}\n**Failed:** ${failed}`,
            color: 0x00ff00,
          },
        ],
      });
    }
  },
};
