const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const ModerationQueue = require("../utils/moderationQueue");
const Moderation = require("../utils/moderation");
const constants = require("../utils/constants");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription(
      "Smart moderation queue with AI suggestions "
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("view").setDescription("View moderation queue")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("process")
        .setDescription("Process a queue item")
        .addIntegerOption((option) =>
          option.setName("id").setDescription("Queue item ID").setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Action to take")
            .setRequired(true)
            .addChoices(
              { name: "Ban", value: "ban" },
              { name: "Kick", value: "kick" },
              { name: "Mute", value: "mute" },
              { name: "Warn", value: "warn" },
              { name: "Dismiss", value: "dismiss" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("suggestions")
        .setDescription("Get AI suggestions for a queue item")
        .addIntegerOption((option) =>
          option.setName("id").setDescription("Queue item ID").setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "view") {
      const queue = await ModerationQueue.getQueue(interaction.guild.id, true);

      if (queue.length === 0) {
        return interaction.reply({
          content: "✅ Moderation queue is empty",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Moderation Queue")
        .setDescription(
          queue
            .slice(0, 10)
            .map(
              (q) =>
                `**${q.id}.** <@${q.user_id}> - ${
                  q.action_type
                }\n   Priority: ${q.priority} | Suggested: ${
                  q.suggested_action || "none"
                }`
            )
            .join("\n\n")
        )
        .setColor(0x0099ff)
        .setFooter({ text: `${queue.length} items in queue` });

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "process") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const queueId = interaction.options.getInteger("id");
      const action = interaction.options.getString("action");

      const queue = await ModerationQueue.getQueue(interaction.guild.id, false);
      const item = queue.find((q) => q.id === queueId);

      if (!item) {
        return interaction.editReply({
          content: "❌ Queue item not found",
        });
      }

      const user = await interaction.client.users
        .fetch(item.user_id)
        .catch(() => null);
      if (!user) {
        return interaction.editReply({
          content: "❌ User not found",
        });
      }

      if (action !== "dismiss") {
        if (action === "ban") {
          await Moderation.ban(
            interaction.guild,
            user,
            interaction.user,
            item.reason
          );
        } else if (action === "kick") {
          await Moderation.kick(
            interaction.guild,
            user,
            interaction.user,
            item.reason
          );
        } else if (action === "mute") {
          await Moderation.mute(
            interaction.guild,
            user,
            interaction.user,
            item.reason,
            constants.TIME.HOUR
          );
        } else if (action === "warn") {
          await Moderation.warn(
            interaction.guild,
            user,
            interaction.user,
            item.reason
          );
        }
      }

      await ModerationQueue.process(
        interaction.guild.id,
        queueId,
        interaction.user.id,
        action
      );

      await interaction.editReply({
        content: `✅ Queue item #${queueId} processed (${action})`,
      });
    } else if (subcommand === "suggestions") {
      await interaction.deferReply();

      const queueId = interaction.options.getInteger("id");
      const suggestions = await ModerationQueue.getSuggestions(
        interaction.guild.id,
        queueId
      );

      if (suggestions.suggestions.length === 0) {
        return interaction.editReply({
          content: "No suggestions available for this queue item",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🤖 AI Suggestions")
        .setDescription(
          suggestions.suggestions
            .map(
              (s) =>
                `**${s.type}:** ${s.message || `${s.current} → ${s.suggested}`}`
            )
            .join("\n\n")
        )
        .setColor(0x0099ff);

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
