const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("workflow")
    .setDescription("Create and manage custom automation workflows ")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a new workflow")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Workflow name")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Workflow description")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List all workflows")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a workflow")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("Workflow ID to delete")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("toggle")
        .setDescription("Enable/disable a workflow")
        .addIntegerOption((option) =>
          option.setName("id").setDescription("Workflow ID").setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      await interaction.reply({
        content:
          "🔄 Workflow creation is interactive. Use `/workflow create` and follow the prompts, or use the web dashboard for advanced workflow building.",
        flags: MessageFlags.Ephemeral,
      });

      // Simplified workflow creation
      const name = interaction.options.getString("name");
      const description =
        interaction.options.getString("description") || "No description";

      const embed = new EmbedBuilder()
        .setTitle("⚙️ Create Workflow")
        .setDescription(
          `**Name:** ${name}\n**Description:** ${description}\n\nWorkflows allow you to automate actions based on triggers. Use the web dashboard for full workflow builder, or configure via commands.`
        )
        .addFields({
          name: "Available Triggers",
          value: [
            "• `message_pattern` - Trigger on message content",
            "• `user_join` - When a user joins",
            "• `user_leave` - When a user leaves",
            "• `heat_threshold` - When heat score exceeds threshold",
            "• `threat_detected` - When threat is detected",
            "• `time_based` - Scheduled triggers",
          ].join("\n"),
          inline: false,
        })
        .addFields({
          name: "Available Actions",
          value: [
            "• `ban` - Ban the user",
            "• `kick` - Kick the user",
            "• `mute` - Mute the user",
            "• `warn` - Warn the user",
            "• `add_role` - Add a role",
            "• `remove_role` - Remove a role",
            "• `send_message` - Send a message",
            "• `quarantine` - Quarantine the user",
          ].join("\n"),
          inline: false,
        })
        .setColor(0x0099ff);

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === "list") {
      const workflows = await db.getWorkflows(interaction.guild.id);

      if (workflows.length === 0) {
        return interaction.reply({
          content: "❌ No workflows found. Create one with `/workflow create`",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("⚙️ Workflows")
        .setDescription(
          workflows
            .map(
              (w) =>
                `**${w.id}.** ${w.name} ${w.enabled ? "✅" : "❌"}\n   ${
                  w.description || "No description"
                }\n   Triggered: ${w.trigger_count || 0} times`
            )
            .join("\n\n")
        )
        .setColor(0x0099ff)
        .setFooter({ text: `Total: ${workflows.length} workflows` });

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "delete") {
      const id = interaction.options.getInteger("id");
      await db.deleteWorkflow(id);

      await interaction.reply({
        content: `✅ Workflow #${id} deleted`,
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "toggle") {
      const id = interaction.options.getInteger("id");
      const workflows = await db.getWorkflows(interaction.guild.id);
      const workflow = workflows.find((w) => w.id === id);

      if (!workflow) {
        return interaction.reply({
          content: "❌ Workflow not found",
          flags: MessageFlags.Ephemeral,
        });
      }

      await db.updateWorkflow(id, { enabled: !workflow.enabled });

      await interaction.reply({
        content: `✅ Workflow #${id} ${
          !workflow.enabled ? "enabled" : "disabled"
        }`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
