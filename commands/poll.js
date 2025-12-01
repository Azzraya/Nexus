const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const db = require("../utils/database");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create and manage polls")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a new poll")
        .addStringOption((option) =>
          option
            .setName("question")
            .setDescription("The poll question")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("options")
            .setDescription(
              "Poll options separated by | (e.g., Option 1|Option 2|Option 3)"
            )
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("duration")
            .setDescription("Duration in hours (default: 24)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(168)
        )
        .addBooleanOption((option) =>
          option
            .setName("multiple")
            .setDescription("Allow multiple votes (default: false)")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("anonymous")
            .setDescription("Hide voter names (default: false)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("end")
        .setDescription("End a poll early")
        .addStringOption((option) =>
          option
            .setName("message_id")
            .setDescription("The poll message ID")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List active polls")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      const question = interaction.options.getString("question");
      const optionsStr = interaction.options.getString("options");
      const duration = interaction.options.getInteger("duration") || 24;
      const allowMultiple = interaction.options.getBoolean("multiple") || false;
      const anonymous = interaction.options.getBoolean("anonymous") || false;

      const options = optionsStr
        .split("|")
        .map((o) => o.trim())
        .filter((o) => o);
      if (options.length < 2) {
        return interaction.reply({
          content: "❌ You need at least 2 options!",
          flags: MessageFlags.Ephemeral,
        });
      }
      if (options.length > 10) {
        return interaction.reply({
          content: "❌ Maximum 10 options allowed!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const endsAt = Date.now() + duration * 60 * 60 * 1000;
      const votes = JSON.stringify({});

      await interaction.deferReply();

      const embed = new EmbedBuilder()
        .setTitle(`📊 ${question}`)
        .setDescription(
          options
            .map(
              (opt, idx) =>
                `${getEmoji(idx)} **${opt}**\n${getBar(0, 0)} 0 votes (0%)`
            )
            .join("\n\n")
        )
        .addFields({
          name: "📊 Statistics",
          value: `**Total Votes:** 0\n**Ends:** <t:${Math.floor(
            endsAt / 1000
          )}:R>`,
          inline: false,
        })
        .setColor(0x5865f2)
        .setFooter({
          text: anonymous
            ? "Anonymous Poll • Multiple votes allowed"
            : allowMultiple
            ? "Multiple votes allowed"
            : "One vote per user",
        })
        .setTimestamp(endsAt);

      const buttons = new ActionRowBuilder().addComponents(
        ...options.slice(0, 5).map((opt, idx) =>
          new ButtonBuilder()
            .setCustomId(`poll_vote_${idx}`)
            .setLabel(opt.length > 20 ? opt.slice(0, 17) + "..." : opt)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(getEmoji(idx))
        )
      );

      const message = await interaction.editReply({
        embeds: [embed],
        components: options.length <= 5 ? [buttons] : [],
      });

      // Store poll in database
      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO polls (guild_id, channel_id, message_id, creator_id, question, options, votes, ends_at, allow_multiple, anonymous, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            interaction.guild.id,
            interaction.channel.id,
            message.id,
            interaction.user.id,
            question,
            JSON.stringify(options),
            votes,
            endsAt,
            allowMultiple ? 1 : 0,
            anonymous ? 1 : 0,
            Date.now(),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Schedule poll end
      setTimeout(async () => {
        await endPoll(interaction.client, interaction.guild.id, message.id);
      }, duration * 60 * 60 * 1000);
    } else if (subcommand === "end") {
      const messageId = interaction.options.getString("message_id");
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const poll = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM polls WHERE guild_id = ? AND message_id = ?",
          [interaction.guild.id, messageId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!poll) {
        return interaction.editReply({
          content: "❌ Poll not found!",
        });
      }

      if (poll.ended) {
        return interaction.editReply({
          content: "❌ This poll has already ended!",
        });
      }

      await endPoll(interaction.client, interaction.guild.id, messageId);
      await interaction.editReply({
        content: "✅ Poll ended successfully!",
      });
    } else if (subcommand === "list") {
      const polls = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM polls WHERE guild_id = ? AND ended = 0 ORDER BY created_at DESC",
          [interaction.guild.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (polls.length === 0) {
        return interaction.reply({
          content: "❌ No active polls found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📊 Active Polls")
        .setDescription(
          polls
            .map(
              (poll) =>
                `**${poll.question}**\n` +
                `ID: \`${poll.message_id}\` • Ends: <t:${Math.floor(
                  poll.ends_at / 1000
                )}:R>\n` +
                `[Jump to Poll](https://discord.com/channels/${poll.guild_id}/${poll.channel_id}/${poll.message_id})`
            )
            .join("\n\n")
        )
        .setColor(0x5865f2)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};

async function endPoll(client, guildId, messageId) {
  const poll = await new Promise((resolve, reject) => {
    db.db.get(
      "SELECT * FROM polls WHERE guild_id = ? AND message_id = ?",
      [guildId, messageId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });

  if (!poll || poll.ended) return;

  const options = JSON.parse(poll.options);
  const votes = JSON.parse(poll.votes || "{}");

  const voteCounts = {};
  const totalVotes = Object.keys(votes).length;

  options.forEach((_, idx) => {
    voteCounts[idx] = 0;
  });

  Object.values(votes).forEach((vote) => {
    if (Array.isArray(vote)) {
      vote.forEach((v) => {
        if (voteCounts[v] !== undefined) voteCounts[v]++;
      });
    } else if (voteCounts[vote] !== undefined) {
      voteCounts[vote]++;
    }
  });

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${poll.question} - ENDED`)
    .setDescription(
      options
        .map((opt, idx) => {
          const count = voteCounts[idx] || 0;
          const percentage =
            totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          return `${getEmoji(idx)} **${opt}**\n${getBar(
            count,
            totalVotes
          )} ${count} votes (${percentage}%)`;
        })
        .join("\n\n")
    )
    .addFields({
      name: "📊 Final Results",
      value: `**Total Votes:** ${totalVotes}\n**Ended:** <t:${Math.floor(
        Date.now() / 1000
      )}:F>`,
      inline: false,
    })
    .setColor(0x5865f2)
    .setFooter({ text: "Poll Ended" })
    .setTimestamp();

  try {
    const channel = await client.channels.fetch(poll.channel_id);
    const message = await channel.messages.fetch(messageId);
    await message.edit({ embeds: [embed], components: [] });
  } catch (error) {
    logger.error("Error ending poll:", error);
  }

  await new Promise((resolve, reject) => {
    db.db.run(
      "UPDATE polls SET ended = 1 WHERE guild_id = ? AND message_id = ?",
      [guildId, messageId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function getEmoji(idx) {
  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  return emojis[idx] || "•";
}

function getBar(count, total) {
  if (total === 0) return "░░░░░░░░░░";
  const filled = Math.round((count / total) * 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

// Handle poll button interactions
module.exports.handlePollVote = async (interaction) => {
  const [_, __, optionIdx] = interaction.customId.split("_");
  const poll = await new Promise((resolve, reject) => {
    db.db.get(
      "SELECT * FROM polls WHERE guild_id = ? AND message_id = ?",
      [interaction.guild.id, interaction.message.id],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });

  if (!poll) {
    return interaction.reply({
      content: "❌ Poll not found!",
      flags: MessageFlags.Ephemeral,
    });
  }

  if (poll.ended) {
    return interaction.reply({
      content: "❌ This poll has ended!",
      flags: MessageFlags.Ephemeral,
    });
  }

  if (Date.now() > poll.ends_at) {
    await endPoll(
      interaction.client,
      interaction.guild.id,
      interaction.message.id
    );
    return interaction.reply({
      content: "❌ This poll has expired!",
      flags: MessageFlags.Ephemeral,
    });
  }

  const votes = JSON.parse(poll.votes || "{}");
  const userId = interaction.user.id;
  const option = parseInt(optionIdx);

  if (!poll.allow_multiple) {
    // Single vote - replace existing
    votes[userId] = option;
  } else {
    // Multiple votes - toggle
    if (!votes[userId]) votes[userId] = [];
    const userVotes = votes[userId];
    const idx = userVotes.indexOf(option);
    if (idx > -1) {
      userVotes.splice(idx, 1);
    } else {
      userVotes.push(option);
    }
    votes[userId] = userVotes;
  }

  await new Promise((resolve, reject) => {
    db.db.run(
      "UPDATE polls SET votes = ? WHERE guild_id = ? AND message_id = ?",
      [JSON.stringify(votes), interaction.guild.id, interaction.message.id],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  // Update embed
  const options = JSON.parse(poll.options);
  const voteCounts = {};
  const totalVotes = Object.keys(votes).length;

  options.forEach((_, idx) => {
    voteCounts[idx] = 0;
  });

  Object.values(votes).forEach((vote) => {
    if (Array.isArray(vote)) {
      vote.forEach((v) => {
        if (voteCounts[v] !== undefined) voteCounts[v]++;
      });
    } else if (voteCounts[vote] !== undefined) {
      voteCounts[vote]++;
    }
  });

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${poll.question}`)
    .setDescription(
      options
        .map((opt, idx) => {
          const count = voteCounts[idx] || 0;
          const percentage =
            totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          return `${getEmoji(idx)} **${opt}**\n${getBar(
            count,
            totalVotes
          )} ${count} votes (${percentage}%)`;
        })
        .join("\n\n")
    )
    .addFields({
      name: "📊 Statistics",
      value: `**Total Votes:** ${totalVotes}\n**Ends:** <t:${Math.floor(
        poll.ends_at / 1000
      )}:R>`,
      inline: false,
    })
    .setColor(0x5865f2)
    .setFooter({
      text: poll.anonymous
        ? "Anonymous Poll • Multiple votes allowed"
        : poll.allow_multiple
        ? "Multiple votes allowed"
        : "One vote per user",
    })
    .setTimestamp(poll.ends_at);

  await interaction.update({ embeds: [embed] });
};
