const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Manage giveaways")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a new giveaway")
        .addStringOption((option) =>
          option
            .setName("prize")
            .setDescription("Prize to win")
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("duration")
            .setDescription("Duration in minutes")
            .setRequired(true)
            .setMinValue(1)
        )
        .addIntegerOption((option) =>
          option
            .setName("winners")
            .setDescription("Number of winners")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(10)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("end")
        .setDescription("End a giveaway")
        .addStringOption((option) =>
          option
            .setName("message_id")
            .setDescription("Giveaway message ID")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reroll")
        .setDescription("Reroll winners for an ended giveaway")
        .addStringOption((option) =>
          option
            .setName("message_id")
            .setDescription("Giveaway message ID")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      const prize = interaction.options.getString("prize");
      const duration = interaction.options.getInteger("duration");
      const winners = interaction.options.getInteger("winners") || 1;
      const endsAt = Date.now() + duration * 60000;

      const embed = new EmbedBuilder()
        .setTitle("🎉 Giveaway!")
        .setDescription(
          `**Prize:** ${prize}\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(
            endsAt / 1000
          )}:R>`
        )
        .setColor(0x00ff00)
        .setTimestamp();

      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway_${interaction.id}`)
          .setLabel("Enter Giveaway")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🎉")
      );

      await interaction.reply({
        embeds: [embed],
        components: [button],
      });
      const message = await interaction.fetchReply();

      // Save to database
      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winners, ends_at, entries) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            interaction.guild.id,
            interaction.channel.id,
            message.id,
            prize,
            winners,
            endsAt,
            "[]",
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Schedule end
      setTimeout(async () => {
        await this.endGiveaway(interaction.client, message.id);
      }, duration * 60000);
    } else if (subcommand === "end") {
      const messageId = interaction.options.getString("message_id");
      await this.endGiveaway(interaction.client, messageId);
      await interaction.reply({
        content: "✅ Giveaway ended!",
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "reroll") {
      const messageId = interaction.options.getString("message_id");
      const result = await this.rerollGiveaway(interaction.client, messageId);
      if (result.success) {
        await interaction.reply({
          content: `✅ Rerolled! New winners: ${result.winnerMentions}`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: `❌ ${result.error}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },

  async endGiveaway(client, messageId) {
    const giveaway = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT * FROM giveaways WHERE message_id = ?",
        [messageId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!giveaway) return;

    const entries = JSON.parse(giveaway.entries || "[]");
    if (entries.length === 0) {
      // No entries
      const channel = await client.channels.fetch(giveaway.channel_id);
      const message = await channel.messages.fetch(messageId);
      await message.edit({
        embeds: [
          {
            title: "🎉 Giveaway Ended",
            description: `**Prize:** ${giveaway.prize}\n\nNo one entered!`,
            color: 0xff0000,
          },
        ],
        components: [],
      });
      return;
    }

    // Select winners
    const winners = [];
    const winnerCount = Math.min(giveaway.winners, entries.length);
    for (let i = 0; i < winnerCount; i++) {
      const randomIndex = Math.floor(Math.random() * entries.length);
      winners.push(entries.splice(randomIndex, 1)[0]);
    }

    const channel = await client.channels.fetch(giveaway.channel_id);
    const message = await channel.messages.fetch(messageId);
    const winnerMentions = winners.map((id) => `<@${id}>`).join(", ");

    await message.edit({
      embeds: [
        {
          title: "🎉 Giveaway Ended!",
          description: `**Prize:** ${giveaway.prize}\n**Winners:** ${winnerMentions}`,
          color: 0x00ff00,
        },
      ],
      components: [],
    });

    await channel.send({
      content: `🎉 Congratulations ${winnerMentions}! You won: **${giveaway.prize}**`,
    });

    // Update database - mark as ended and store winners (don't delete for reroll capability)
    await new Promise((resolve, reject) => {
      db.db.run(
        "UPDATE giveaways SET ends_at = -1, requirements = ? WHERE message_id = ?",
        [JSON.stringify(winners), messageId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  },

  async rerollGiveaway(client, messageId) {
    const giveaway = await new Promise((resolve, reject) => {
      db.db.get(
        "SELECT * FROM giveaways WHERE message_id = ?",
        [messageId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!giveaway) {
      return { success: false, error: "Giveaway not found!" };
    }

    // Check if giveaway has ended (ends_at = -1 means ended)
    if (giveaway.ends_at !== -1) {
      return {
        success: false,
        error: "Giveaway hasn't ended yet! Use /giveaway end first.",
      };
    }

    const entries = JSON.parse(giveaway.entries || "[]");
    if (entries.length === 0) {
      return { success: false, error: "No entries to reroll from!" };
    }

    // Get previous winners from requirements field (we stored them there)
    const previousWinners = JSON.parse(giveaway.requirements || "[]");

    // Filter out previous winners from entries
    let availableEntries = entries.filter(
      (id) => !previousWinners.includes(id)
    );

    // If there aren't enough unique entries, allow rerolling from all entries
    // (including previous winners) to ensure we can always reroll
    if (availableEntries.length < giveaway.winners) {
      availableEntries = entries; // Use all entries if not enough unique ones
    }

    if (availableEntries.length === 0) {
      return { success: false, error: "No entries available to reroll!" };
    }

    // Select new winners
    const winners = [];
    const winnerCount = Math.min(giveaway.winners, availableEntries.length);
    const entriesCopy = [...availableEntries];

    for (let i = 0; i < winnerCount; i++) {
      const randomIndex = Math.floor(Math.random() * entriesCopy.length);
      winners.push(entriesCopy.splice(randomIndex, 1)[0]);
    }

    const channel = await client.channels.fetch(giveaway.channel_id);
    const message = await channel.messages.fetch(messageId);
    const winnerMentions = winners.map((id) => `<@${id}>`).join(", ");

    // Update message
    await message.edit({
      embeds: [
        {
          title: "🎉 Giveaway Ended! (Rerolled)",
          description: `**Prize:** ${giveaway.prize}\n**Winners:** ${winnerMentions}`,
          color: 0x00ff00,
        },
      ],
      components: [],
    });

    // Send reroll announcement
    await channel.send({
      content: `🎲 Rerolled! New winners: ${winnerMentions}! You won: **${giveaway.prize}**`,
    });

    // Update database with new winners
    await new Promise((resolve, reject) => {
      db.db.run(
        "UPDATE giveaways SET requirements = ? WHERE message_id = ?",
        [JSON.stringify(winners), messageId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    return { success: true, winnerMentions };
  },
};
