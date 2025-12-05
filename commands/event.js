const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("event")
    .setDescription("Manage server events and RSVPs")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a new server event")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Event name")
            .setRequired(true)
            .setMaxLength(100)
        )
        .addStringOption((option) =>
          option
            .setName("date")
            .setDescription("Event date/time (e.g., '2025-12-25 18:00')")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Event description")
            .setMaxLength(500)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Event channel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
        )
        .addIntegerOption((option) =>
          option
            .setName("max_participants")
            .setDescription("Maximum participants (leave empty for unlimited)")
            .setMinValue(1)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("View upcoming events")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("info")
        .setDescription("View detailed event information")
        .addIntegerOption((option) =>
          option
            .setName("event_id")
            .setDescription("Event ID")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("rsvp")
        .setDescription("RSVP to an event")
        .addIntegerOption((option) =>
          option
            .setName("event_id")
            .setDescription("Event ID")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("status")
            .setDescription("Your RSVP status")
            .setRequired(true)
            .addChoices(
              { name: "✅ Going", value: "going" },
              { name: "❓ Maybe", value: "maybe" },
              { name: "❌ Not Going", value: "not_going" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("Cancel an event")
        .addIntegerOption((option) =>
          option
            .setName("event_id")
            .setDescription("Event ID")
            .setRequired(true)
        )
    ),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      await this.handleCreate(interaction);
    } else if (subcommand === "list") {
      await this.handleList(interaction);
    } else if (subcommand === "info") {
      await this.handleInfo(interaction);
    } else if (subcommand === "rsvp") {
      await this.handleRSVP(interaction);
    } else if (subcommand === "cancel") {
      await this.handleCancel(interaction);
    }
  },

  async handleCreate(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) {
      return interaction.reply({
        content: "You need Manage Events permission to create events!",
        ephemeral: true,
      });
    }

    const name = interaction.options.getString("name");
    const dateStr = interaction.options.getString("date");
    const description =
      interaction.options.getString("description") || "No description provided";
    const channel = interaction.options.getChannel("channel");
    const maxParticipants = interaction.options.getInteger("max_participants");

    // Parse date
    const eventDate = new Date(dateStr);
    if (isNaN(eventDate.getTime())) {
      return interaction.reply({
        content:
          "❌ Invalid date format! Use format: `YYYY-MM-DD HH:MM` (e.g., `2025-12-25 18:00`)",
        ephemeral: true,
      });
    }

    const startTime = eventDate.getTime();
    if (startTime < Date.now()) {
      return interaction.reply({
        content: "❌ Event date must be in the future!",
        ephemeral: true,
      });
    }

    const eventData = {
      name,
      description,
      startTime,
      endTime: null,
      hostId: interaction.user.id,
      channelId: channel?.id || null,
      maxParticipants: maxParticipants || null,
    };

    const eventId = await db.createServerEvent(interaction.guild.id, eventData);

    const embed = new EmbedBuilder()
      .setTitle("✅ Event Created!")
      .setDescription(`**${name}**\n\n${description}`)
      .addFields(
        { name: "Event ID", value: `${eventId}`, inline: true },
        {
          name: "Date",
          value: `<t:${Math.floor(startTime / 1000)}:F>`,
          inline: true,
        },
        { name: "Host", value: `<@${interaction.user.id}>`, inline: true }
      )
      .setColor(0x00ff88)
      .setTimestamp();

    if (channel) {
      embed.addFields({ name: "Channel", value: `${channel}`, inline: true });
    }

    if (maxParticipants) {
      embed.addFields({
        name: "Max Participants",
        value: `${maxParticipants}`,
        inline: true,
      });
    }

    embed.setFooter({ text: `Use /event rsvp ${eventId} to RSVP!` });

    await interaction.reply({ embeds: [embed] });
  },

  async handleList(interaction) {
    await interaction.deferReply();

    const events = await db.getServerEvents(interaction.guild.id, true);

    if (events.length === 0) {
      return interaction.editReply({
        content: "No upcoming events! Create one with `/event create`",
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("📅 Upcoming Events")
      .setColor(0x667eea)
      .setDescription(
        events
          .slice(0, 10)
          .map((event) => {
            const rsvpCount = 0; // TODO: Count RSVPs
            return (
              `**${event.id}.** ${event.event_name}\n` +
              `🕒 <t:${Math.floor(event.start_time / 1000)}:R>\n` +
              `👤 Host: <@${event.host_id}>\n` +
              `📝 \`/event info ${event.id}\` for details`
            );
          })
          .join("\n\n")
      )
      .setFooter({ text: `${events.length} upcoming events` });

    await interaction.editReply({ embeds: [embed] });
  },

  async handleInfo(interaction) {
    await interaction.deferReply();

    const eventId = interaction.options.getInteger("event_id");

    const event = await new Promise((resolve, reject) => {
      db.db.get(
        `SELECT * FROM server_events WHERE id = ? AND guild_id = ?`,
        [eventId, interaction.guild.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!event) {
      return interaction.editReply({
        content: "❌ Event not found!",
        ephemeral: true,
      });
    }

    const rsvps = await db.getEventRSVPs(eventId);
    const going = rsvps.filter((r) => r.status === "going").length;
    const maybe = rsvps.filter((r) => r.status === "maybe").length;
    const notGoing = rsvps.filter((r) => r.status === "not_going").length;

    const embed = new EmbedBuilder()
      .setTitle(event.event_name)
      .setDescription(event.description)
      .setColor(0x667eea)
      .addFields(
        {
          name: "Date",
          value: `<t:${Math.floor(event.start_time / 1000)}:F>`,
          inline: true,
        },
        { name: "Host", value: `<@${event.host_id}>`, inline: true },
        { name: "Event ID", value: `${event.id}`, inline: true }
      );

    if (event.channel_id) {
      embed.addFields({
        name: "Channel",
        value: `<#${event.channel_id}>`,
        inline: true,
      });
    }

    if (event.max_participants) {
      embed.addFields({
        name: "Participants",
        value: `${going} / ${event.max_participants}`,
        inline: true,
      });
    }

    embed.addFields({
      name: "RSVPs",
      value: `✅ Going: ${going}\n❓ Maybe: ${maybe}\n❌ Not Going: ${notGoing}`,
      inline: false,
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rsvp_going_${eventId}`)
        .setLabel("Going")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId(`rsvp_maybe_${eventId}`)
        .setLabel("Maybe")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("❓"),
      new ButtonBuilder()
        .setCustomId(`rsvp_not_going_${eventId}`)
        .setLabel("Not Going")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("❌")
    );

    const message = await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    // Handle button interactions
    const collector = message.createMessageComponentCollector({
      time: 300000, // 5 minutes
    });

    collector.on("collect", async (i) => {
      const [, status, id] = i.customId.split("_");

      await db.rsvpToEvent(parseInt(id), i.user.id, status);

      await i.reply({
        content: `✅ Your RSVP has been updated to: **${status.replace("_", " ")}**`,
        ephemeral: true,
      });

      // Refresh RSVP counts
      const newRsvps = await db.getEventRSVPs(eventId);
      const newGoing = newRsvps.filter((r) => r.status === "going").length;
      const newMaybe = newRsvps.filter((r) => r.status === "maybe").length;
      const newNotGoing = newRsvps.filter(
        (r) => r.status === "not_going"
      ).length;

      embed.spliceFields(embed.data.fields.length - 1, 1, {
        name: "RSVPs",
        value: `✅ Going: ${newGoing}\n❓ Maybe: ${newMaybe}\n❌ Not Going: ${newNotGoing}`,
        inline: false,
      });

      await message.edit({ embeds: [embed] });
    });
  },

  async handleRSVP(interaction) {
    const eventId = interaction.options.getInteger("event_id");
    const status = interaction.options.getString("status");

    const event = await new Promise((resolve, reject) => {
      db.db.get(
        `SELECT * FROM server_events WHERE id = ? AND guild_id = ?`,
        [eventId, interaction.guild.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!event) {
      return interaction.reply({
        content: "❌ Event not found!",
        ephemeral: true,
      });
    }

    // Check if event is full
    if (event.max_participants && status === "going") {
      const rsvps = await db.getEventRSVPs(eventId);
      const going = rsvps.filter((r) => r.status === "going").length;

      if (going >= event.max_participants) {
        return interaction.reply({
          content: "❌ This event is full!",
          ephemeral: true,
        });
      }
    }

    await db.rsvpToEvent(eventId, interaction.user.id, status);

    const statusEmojis = {
      going: "✅",
      maybe: "❓",
      not_going: "❌",
    };

    await interaction.reply({
      content: `${statusEmojis[status]} RSVP'd as **${status.replace("_", " ")}** for **${event.event_name}**!`,
      ephemeral: true,
    });
  },

  async handleCancel(interaction) {
    const eventId = interaction.options.getInteger("event_id");

    const event = await new Promise((resolve, reject) => {
      db.db.get(
        `SELECT * FROM server_events WHERE id = ? AND guild_id = ?`,
        [eventId, interaction.guild.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!event) {
      return interaction.reply({
        content: "❌ Event not found!",
        ephemeral: true,
      });
    }

    if (
      event.host_id !== interaction.user.id &&
      !interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)
    ) {
      return interaction.reply({
        content:
          "❌ Only the event host or someone with Manage Events permission can cancel this event!",
        ephemeral: true,
      });
    }

    await new Promise((resolve, reject) => {
      db.db.run(`DELETE FROM server_events WHERE id = ?`, [eventId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await interaction.reply({
      content: `✅ Event **${event.event_name}** has been cancelled.`,
      ephemeral: true,
    });
  },
};
