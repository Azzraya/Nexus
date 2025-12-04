const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create and manage polls")
    .addSubcommand(subcommand =>
      subcommand
        .setName("create")
        .setDescription("Create a new poll")
        .addStringOption(option =>
          option
            .setName("question")
            .setDescription("Poll question")
            .setRequired(true)
            .setMaxLength(256)
        )
        .addStringOption(option =>
          option
            .setName("options")
            .setDescription("Poll options separated by semicolons (;)")
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName("duration")
            .setDescription("Poll duration in minutes (default: 60)")
            .setMinValue(1)
            .setMaxValue(10080) // 1 week
        )
        .addBooleanOption(option =>
          option
            .setName("anonymous")
            .setDescription("Hide who voted for what")
        )
        .addBooleanOption(option =>
          option
            .setName("multiple")
            .setDescription("Allow multiple choices")
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("end")
        .setDescription("End a poll early")
        .addStringOption(option =>
          option
            .setName("message_id")
            .setDescription("Poll message ID")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("results")
        .setDescription("View poll results")
        .addStringOption(option =>
          option
            .setName("message_id")
            .setDescription("Poll message ID")
            .setRequired(true)
        )
    ),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      await this.handleCreate(interaction, client);
    } else if (subcommand === "end") {
      await this.handleEnd(interaction);
    } else if (subcommand === "results") {
      await this.handleResults(interaction);
    }
  },

  async handleCreate(interaction, client) {
    try {
      const question = interaction.options.getString("question");
      const optionsStr = interaction.options.getString("options");
      const duration = interaction.options.getInteger("duration") || 60;
      const anonymous = interaction.options.getBoolean("anonymous") || false;
      const multiple = interaction.options.getBoolean("multiple") || false;

      const options = optionsStr.split(";").map(o => o.trim()).filter(o => o.length > 0);

    if (options.length < 2) {
      return interaction.reply({
        content: "❌ You need at least 2 options! Separate them with semicolons (;)",
        ephemeral: true
      });
    }

    if (options.length > 10) {
      return interaction.reply({
        content: "❌ Maximum 10 options allowed!",
        ephemeral: true
      });
    }

    const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${question}`)
      .setDescription(
        options.map((opt, i) => `${emojis[i]} ${opt}`).join("\n\n")
      )
      .setColor(0x667eea)
      .addFields(
        { name: "Duration", value: `${duration} minutes`, inline: true },
        { name: "Multiple Choices", value: multiple ? "✅ Yes" : "❌ No", inline: true },
        { name: "Anonymous", value: anonymous ? "✅ Yes" : "❌ No", inline: true }
      )
      .setFooter({ text: `Poll by ${interaction.user.username}` })
      .setTimestamp();

    const message = await interaction.reply({
      embeds: [embed],
      fetchReply: true
    });

    // Add reactions
    for (let i = 0; i < options.length; i++) {
      await message.react(emojis[i]);
    }

    // Store poll data
    const pollData = {
      messageId: message.id,
      channelId: interaction.channel.id,
      guildId: interaction.guild.id,
      question,
      options,
      creatorId: interaction.user.id,
      duration,
      anonymous,
      multiple,
      endTime: Date.now() + (duration * 60 * 1000),
      active: true
    };

    await this.storePoll(pollData);

    // Schedule poll end
    const self = this;
    setTimeout(() => {
      self.endPoll(message.id, interaction.guild.id, client).catch(err => {
        console.error('[Poll] Error in scheduled poll end:', err);
      });
    }, duration * 60 * 1000);
    } catch (error) {
      console.error('[Poll] Error creating poll:', error);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `❌ Failed to create poll: ${error.message}`,
          ephemeral: true
        }).catch(() => {});
      } else {
        await interaction.editReply({
          content: `❌ Failed to create poll: ${error.message}`
        }).catch(() => {});
      }
    }
  },

  async handleEnd(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: "❌ You need Manage Messages permission to end polls!",
        ephemeral: true
      });
    }

    const messageId = interaction.options.getString("message_id");
    
    try {
      const message = await interaction.channel.messages.fetch(messageId);
      await this.endPoll(messageId, interaction.guild.id, interaction.client);
      
      await interaction.reply({
        content: "✅ Poll ended!",
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({
        content: "❌ Could not find poll message!",
        ephemeral: true
      });
    }
  },

  async handleResults(interaction) {
    const messageId = interaction.options.getString("message_id");
    
    try {
      const message = await interaction.channel.messages.fetch(messageId);
      const pollData = await this.getPoll(messageId, interaction.guild.id);

      if (!pollData) {
        return interaction.reply({
          content: "❌ Poll data not found!",
          ephemeral: true
        });
      }

      const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
      const reactions = message.reactions.cache;

      const results = [];
      let totalVotes = 0;

      for (let i = 0; i < pollData.options.length; i++) {
        const reaction = reactions.get(emojis[i]);
        const count = reaction ? reaction.count - 1 : 0; // -1 for bot's reaction
        totalVotes += count;
        results.push({ option: pollData.options[i], votes: count });
      }

      results.sort((a, b) => b.votes - a.votes);

      const embed = new EmbedBuilder()
        .setTitle(`📊 Poll Results: ${pollData.question}`)
        .setDescription(
          results.map((r, i) => {
            const percentage = totalVotes > 0 ? Math.floor((r.votes / totalVotes) * 100) : 0;
            const bar = "▓".repeat(Math.floor(percentage / 10)) + "░".repeat(10 - Math.floor(percentage / 10));
            return `**${i + 1}.** ${r.option}\n${bar} ${r.votes} votes (${percentage}%)`;
          }).join("\n\n")
        )
        .setColor(0x00ff88)
        .addFields(
          { name: "Total Votes", value: `${totalVotes}`, inline: true },
          { name: "Winner", value: results[0].option, inline: true }
        )
        .setFooter({ text: `Poll by ${pollData.creatorId}` });

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      await interaction.reply({
        content: "❌ Could not fetch poll results!",
        ephemeral: true
      });
    }
  },

  async endPoll(messageId, guildId, client) {
    const pollData = await this.getPoll(messageId, guildId);
    if (!pollData || !pollData.active) return;

    try {
      const guild = await interaction.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(pollData.channelId);
      const message = await channel.messages.fetch(messageId);

      const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
      const reactions = message.reactions.cache;

      const results = [];
      let totalVotes = 0;

      for (let i = 0; i < pollData.options.length; i++) {
        const reaction = reactions.get(emojis[i]);
        const count = reaction ? reaction.count - 1 : 0;
        totalVotes += count;
        results.push({ option: pollData.options[i], votes: count });
      }

      results.sort((a, b) => b.votes - a.votes);

      const embed = new EmbedBuilder()
        .setTitle(`📊 ${pollData.question}`)
        .setDescription("**Poll Ended!**\n\n" +
          results.map((r, i) => {
            const percentage = totalVotes > 0 ? Math.floor((r.votes / totalVotes) * 100) : 0;
            const bar = "▓".repeat(Math.floor(percentage / 10)) + "░".repeat(10 - Math.floor(percentage / 10));
            return `${emojis[i]} ${r.option}\n${bar} ${r.votes} votes (${percentage}%)`;
          }).join("\n\n")
        )
        .setColor(0xff0000)
        .addFields(
          { name: "Total Votes", value: `${totalVotes}`, inline: true },
          { name: "Winner", value: `🏆 ${results[0].option}`, inline: true }
        )
        .setFooter({ text: `Poll by ${pollData.creatorId} • Ended` });

      await message.edit({ embeds: [embed] });

      // Mark as ended in database
      await this.updatePollStatus(messageId, guildId, false);
    } catch (error) {
      console.error("[Poll] Failed to end poll:", error);
    }
  },

  async storePoll(pollData) {
    return new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO polls (message_id, channel_id, guild_id, question, options, creator_id, duration, anonymous, multiple_choice, end_time, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pollData.messageId,
          pollData.channelId,
          pollData.guildId,
          pollData.question,
          JSON.stringify(pollData.options),
          pollData.creatorId,
          pollData.duration,
          pollData.anonymous ? 1 : 0,
          pollData.multiple ? 1 : 0,
          pollData.endTime,
          1
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  },

  async getPoll(messageId, guildId) {
    return new Promise((resolve, reject) => {
      db.db.get(
        `SELECT * FROM polls WHERE message_id = ? AND guild_id = ?`,
        [messageId, guildId],
        (err, row) => {
          if (err) reject(err);
          else {
            if (row) {
              row.options = JSON.parse(row.options);
            }
            resolve(row);
          }
        }
      );
    });
  },

  async updatePollStatus(messageId, guildId, active) {
    return new Promise((resolve, reject) => {
      db.db.run(
        `UPDATE polls SET active = ? WHERE message_id = ? AND guild_id = ?`,
        [active ? 1 : 0, messageId, guildId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }
};
