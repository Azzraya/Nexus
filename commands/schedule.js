const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const logger = require("../utils/logger");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Schedule messages to be sent later")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("message")
        .setDescription("Schedule a message")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to send message in")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("content")
            .setDescription("Message content")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("time")
            .setDescription(
              "When to send (e.g., 'in 2 hours', 'tomorrow 3pm', '2025-12-25 12:00')"
            )
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List scheduled messages")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("Cancel a scheduled message")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("Scheduled message ID")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "message") {
      const channel = interaction.options.getChannel("channel");
      const content = interaction.options.getString("content");
      const timeStr = interaction.options.getString("time");

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Parse time
      const scheduledTime = parseTime(timeStr);
      if (!scheduledTime || scheduledTime < Date.now()) {
        return interaction.editReply({
          content:
            "❌ Invalid time! Use formats like 'in 2 hours', 'tomorrow 3pm', or '2025-12-25 12:00'",
        });
      }

      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO scheduled_messages (guild_id, channel_id, message_content, scheduled_for, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [
            interaction.guild.id,
            channel.id,
            content,
            scheduledTime,
            interaction.user.id,
            Date.now(),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Message Scheduled")
        .setDescription(
          `**Channel:** ${channel}\n**Content:** ${content.slice(0, 200)}${
            content.length > 200 ? "..." : ""
          }\n**Scheduled for:** <t:${Math.floor(
            scheduledTime / 1000
          )}:F> (<t:${Math.floor(scheduledTime / 1000)}:R>)`
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Schedule the message
      const delay = scheduledTime - Date.now();
      setTimeout(async () => {
        await sendScheduledMessage(
          interaction.client,
          interaction.guild.id,
          channel.id,
          content
        );
      }, delay);
    } else if (subcommand === "list") {
      const messages = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM scheduled_messages WHERE guild_id = ? AND sent = 0 ORDER BY scheduled_for ASC",
          [interaction.guild.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (messages.length === 0) {
        return interaction.reply({
          content: "❌ No scheduled messages found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📅 Scheduled Messages")
        .setDescription(
          messages
            .map(
              (m) =>
                `**ID:** ${m.id}\n` +
                `**Channel:** <#${m.channel_id}>\n` +
                `**Content:** ${m.message_content.slice(0, 100)}${
                  m.message_content.length > 100 ? "..." : ""
                }\n` +
                `**Scheduled:** <t:${Math.floor(m.scheduled_for / 1000)}:F>`
            )
            .join("\n\n")
        )
        .setColor(0x5865f2)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "cancel") {
      const id = interaction.options.getInteger("id");

      const result = await new Promise((resolve, reject) => {
        db.db.run(
          "DELETE FROM scheduled_messages WHERE guild_id = ? AND id = ? AND sent = 0",
          [interaction.guild.id, id],
          function (err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });

      if (result === 0) {
        return interaction.reply({
          content: "❌ Scheduled message not found or already sent!",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.reply({
        content: `✅ Scheduled message #${id} cancelled!`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

function parseTime(timeStr) {
  const now = Date.now();
  const lower = timeStr.toLowerCase().trim();

  // "in X hours/minutes/days"
  const inMatch = lower.match(/in\s+(\d+)\s+(hour|minute|day|week)s?/);
  if (inMatch) {
    const value = parseInt(inMatch[1]);
    const unit = inMatch[2];
    const multipliers = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    };
    return now + value * (multipliers[unit] || 0);
  }

  // "tomorrow X:XX"
  if (lower.startsWith("tomorrow")) {
    const timeMatch = lower.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2] || "0");
      const ampm = timeMatch[3];
      if (ampm === "pm" && hours !== 12) hours += 12;
      if (ampm === "am" && hours === 12) hours = 0;
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(hours, minutes, 0, 0);
      return tomorrow.getTime();
    }
    // Just "tomorrow" = tomorrow at current time
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.getTime();
  }

  // ISO date format or "YYYY-MM-DD HH:MM"
  const dateMatch = timeStr.match(
    /(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):?(\d{2})?/
  );
  if (dateMatch) {
    const year = parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]) - 1;
    const day = parseInt(dateMatch[3]);
    const hours = parseInt(dateMatch[4] || "0");
    const minutes = parseInt(dateMatch[5] || "0");
    const date = new Date(year, month, day, hours, minutes);
    return date.getTime();
  }

  return null;
}

async function sendScheduledMessage(client, guildId, channelId, content) {
  try {
    const channel = await client.channels.fetch(channelId);
    await channel.send(content);

    await new Promise((resolve, reject) => {
      db.db.run(
        "UPDATE scheduled_messages SET sent = 1 WHERE guild_id = ? AND channel_id = ? AND message_content = ? AND sent = 0",
        [guildId, channelId, content],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  } catch (error) {
    logger.error("Error sending scheduled message:", error);
  }
}
