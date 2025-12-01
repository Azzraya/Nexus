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
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Submit and manage suggestions")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a new suggestion")
        .addStringOption((option) =>
          option
            .setName("suggestion")
            .setDescription("Your suggestion")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("approve")
        .setDescription("Approve a suggestion")
        .addStringOption((option) =>
          option
            .setName("message_id")
            .setDescription("The suggestion message ID")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("deny")
        .setDescription("Deny a suggestion")
        .addStringOption((option) =>
          option
            .setName("message_id")
            .setDescription("The suggestion message ID")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for denial")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("implement")
        .setDescription("Mark a suggestion as implemented")
        .addStringOption((option) =>
          option
            .setName("message_id")
            .setDescription("The suggestion message ID")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all suggestions")
        .addStringOption((option) =>
          option
            .setName("status")
            .setDescription("Filter by status")
            .setRequired(false)
            .addChoices(
              { name: "Pending", value: "pending" },
              { name: "Approved", value: "approved" },
              { name: "Denied", value: "denied" },
              { name: "Implemented", value: "implemented" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("channel")
        .setDescription("Set the suggestions channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel for suggestions")
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      const suggestion = interaction.options.getString("suggestion");

      // Get suggestions channel from config
      const config = await db.getServerConfig(interaction.guild.id);
      const suggestionsChannelId = config?.suggestions_channel_id;

      if (!suggestionsChannelId) {
        return interaction.reply({
          content:
            "❌ Suggestions channel not set! Use `/suggest channel` to set it up.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const channel =
        interaction.guild.channels.cache.get(suggestionsChannelId);
      if (!channel) {
        return interaction.reply({
          content: "❌ Suggestions channel not found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const embed = new EmbedBuilder()
        .setTitle("💡 New Suggestion")
        .setDescription(suggestion)
        .addFields({
          name: "📊 Votes",
          value: "⬆️ 0 • ⬇️ 0",
          inline: true,
        })
        .addFields({
          name: "📝 Status",
          value: "⏳ Pending",
          inline: true,
        })
        .setAuthor({
          name: interaction.user.tag,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setColor(0xffa500)
        .setFooter({ text: `Suggestion ID: ${Date.now()}` })
        .setTimestamp();

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("suggest_upvote")
          .setLabel("Upvote")
          .setStyle(ButtonStyle.Success)
          .setEmoji("⬆️"),
        new ButtonBuilder()
          .setCustomId("suggest_downvote")
          .setLabel("Downvote")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("⬇️")
      );

      const message = await channel.send({
        embeds: [embed],
        components: [buttons],
      });

      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO suggestions (guild_id, channel_id, message_id, user_id, suggestion, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [
            interaction.guild.id,
            channel.id,
            message.id,
            interaction.user.id,
            suggestion,
            Date.now(),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await interaction.editReply({
        content: `✅ Suggestion posted in ${channel}!`,
      });
    } else if (subcommand === "channel") {
      if (
        !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)
      ) {
        return interaction.reply({
          content: "❌ You need Manage Server permission!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const channel = interaction.options.getChannel("channel");
      await db.setServerConfig(interaction.guild.id, {
        suggestions_channel_id: channel.id,
      });

      await interaction.reply({
        content: `✅ Suggestions channel set to ${channel}!`,
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "approve") {
      if (
        !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)
      ) {
        return interaction.reply({
          content: "❌ You need Manage Server permission!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const messageId = interaction.options.getString("message_id");
      await updateSuggestionStatus(
        interaction,
        messageId,
        "approved",
        interaction.user.id
      );
    } else if (subcommand === "deny") {
      if (
        !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)
      ) {
        return interaction.reply({
          content: "❌ You need Manage Server permission!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const messageId = interaction.options.getString("message_id");
      const reason =
        interaction.options.getString("reason") || "No reason provided";
      await updateSuggestionStatus(
        interaction,
        messageId,
        "denied",
        interaction.user.id,
        reason
      );
    } else if (subcommand === "implement") {
      if (
        !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)
      ) {
        return interaction.reply({
          content: "❌ You need Manage Server permission!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const messageId = interaction.options.getString("message_id");
      await updateSuggestionStatus(
        interaction,
        messageId,
        "implemented",
        interaction.user.id
      );
    } else if (subcommand === "list") {
      const status = interaction.options.getString("status");
      let query = "SELECT * FROM suggestions WHERE guild_id = ?";
      const params = [interaction.guild.id];

      if (status) {
        query += " AND status = ?";
        params.push(status);
      }

      query += " ORDER BY created_at DESC LIMIT 20";

      const suggestions = await new Promise((resolve, reject) => {
        db.db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      if (suggestions.length === 0) {
        return interaction.reply({
          content: "❌ No suggestions found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("💡 Suggestions")
        .setDescription(
          suggestions
            .map(
              (s) =>
                `**${getStatusEmoji(s.status)} ${s.status.toUpperCase()}**\n` +
                `${s.suggestion.slice(0, 100)}${
                  s.suggestion.length > 100 ? "..." : ""
                }\n` +
                `[Jump to Suggestion](https://discord.com/channels/${s.guild_id}/${s.channel_id}/${s.message_id})`
            )
            .join("\n\n")
        )
        .setColor(0xffa500)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};

async function updateSuggestionStatus(
  interaction,
  messageId,
  status,
  reviewedBy,
  reason
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const suggestion = await new Promise((resolve, reject) => {
    db.db.get(
      "SELECT * FROM suggestions WHERE guild_id = ? AND message_id = ?",
      [interaction.guild.id, messageId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });

  if (!suggestion) {
    return interaction.editReply({
      content: "❌ Suggestion not found!",
    });
  }

  await new Promise((resolve, reject) => {
    db.db.run(
      "UPDATE suggestions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE guild_id = ? AND message_id = ?",
      [status, reviewedBy, Date.now(), interaction.guild.id, messageId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  try {
    const channel = await interaction.client.channels.fetch(
      suggestion.channel_id
    );
    const message = await channel.messages.fetch(messageId);
    const oldEmbed = message.embeds[0];

    const newEmbed = EmbedBuilder.from(oldEmbed)
      .setFields(
        {
          name: "📊 Votes",
          value: `⬆️ ${suggestion.upvotes} • ⬇️ ${suggestion.downvotes}`,
          inline: true,
        },
        {
          name: "📝 Status",
          value: `${getStatusEmoji(status)} ${
            status.charAt(0).toUpperCase() + status.slice(1)
          }${reason ? `\n**Reason:** ${reason}` : ""}`,
          inline: true,
        }
      )
      .setColor(
        status === "approved"
          ? 0x00ff00
          : status === "denied"
          ? 0xff0000
          : status === "implemented"
          ? 0x0099ff
          : 0xffa500
      );

    await message.edit({ embeds: [newEmbed] });
  } catch (error) {
    logger.error("Error updating suggestion message:", error);
  }

  await interaction.editReply({
    content: `✅ Suggestion ${status}!`,
  });
}

function getStatusEmoji(status) {
  const emojis = {
    pending: "⏳",
    approved: "✅",
    denied: "❌",
    implemented: "✨",
  };
  return emojis[status] || "⏳";
}

// Handle suggestion vote buttons
module.exports.handleSuggestionVote = async (interaction) => {
  const isUpvote = interaction.customId === "suggest_upvote";
  const suggestion = await new Promise((resolve, reject) => {
    db.db.get(
      "SELECT * FROM suggestions WHERE guild_id = ? AND message_id = ?",
      [interaction.guild.id, interaction.message.id],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });

  if (!suggestion) {
    return interaction.reply({
      content: "❌ Suggestion not found!",
      flags: MessageFlags.Ephemeral,
    });
  }

  const voters = JSON.parse(suggestion.voters || "{}");
  const userId = interaction.user.id;

  // Toggle vote
  if (voters[userId] === (isUpvote ? "up" : "down")) {
    // Remove vote
    delete voters[userId];
    if (isUpvote) {
      suggestion.upvotes = Math.max(0, suggestion.upvotes - 1);
    } else {
      suggestion.downvotes = Math.max(0, suggestion.downvotes - 1);
    }
  } else {
    // Add/change vote
    const oldVote = voters[userId];
    if (oldVote === "up") {
      suggestion.upvotes = Math.max(0, suggestion.upvotes - 1);
    } else if (oldVote === "down") {
      suggestion.downvotes = Math.max(0, suggestion.downvotes - 1);
    }

    voters[userId] = isUpvote ? "up" : "down";
    if (isUpvote) {
      suggestion.upvotes++;
    } else {
      suggestion.downvotes++;
    }
  }

  await new Promise((resolve, reject) => {
    db.db.run(
      "UPDATE suggestions SET upvotes = ?, downvotes = ?, voters = ? WHERE guild_id = ? AND message_id = ?",
      [
        suggestion.upvotes,
        suggestion.downvotes,
        JSON.stringify(voters),
        interaction.guild.id,
        interaction.message.id,
      ],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  // Update embed
  const oldEmbed = interaction.message.embeds[0];
  const newEmbed = EmbedBuilder.from(oldEmbed).setFields(
    {
      name: "📊 Votes",
      value: `⬆️ ${suggestion.upvotes} • ⬇️ ${suggestion.downvotes}`,
      inline: true,
    },
    {
      name: "📝 Status",
      value: `${getStatusEmoji(suggestion.status)} ${
        suggestion.status.charAt(0).toUpperCase() + suggestion.status.slice(1)
      }`,
      inline: true,
    }
  );

  await interaction.update({ embeds: [newEmbed] });
};
