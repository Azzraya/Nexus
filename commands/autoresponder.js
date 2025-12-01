const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autoresponder")
    .setDescription("Manage auto-responders (auto-reply to keywords)")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create an auto-responder")
        .addStringOption((option) =>
          option
            .setName("trigger")
            .setDescription("Keyword or phrase to trigger response")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("response")
            .setDescription("Response message")
            .setRequired(true)
        )
        .addBooleanOption((option) =>
          option
            .setName("case_sensitive")
            .setDescription("Case sensitive matching (default: false)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete an auto-responder")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("Auto-responder ID")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List all auto-responders")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("toggle")
        .setDescription("Enable/disable an auto-responder")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("Auto-responder ID")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      const trigger = interaction.options.getString("trigger");
      const response = interaction.options.getString("response");
      const caseSensitive =
        interaction.options.getBoolean("case_sensitive") || false;

      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO auto_responders (guild_id, trigger, response, case_sensitive, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [
            interaction.guild.id,
            trigger,
            response,
            caseSensitive ? 1 : 0,
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
        .setTitle("✅ Auto-Responder Created")
        .setDescription(
          `**Trigger:** \`${trigger}\`\n**Response:** ${response.slice(
            0,
            200
          )}${response.length > 200 ? "..." : ""}\n**Case Sensitive:** ${
            caseSensitive ? "Yes" : "No"
          }`
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "delete") {
      const id = interaction.options.getInteger("id");

      const result = await new Promise((resolve, reject) => {
        db.db.run(
          "DELETE FROM auto_responders WHERE guild_id = ? AND id = ?",
          [interaction.guild.id, id],
          function (err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });

      if (result === 0) {
        return interaction.reply({
          content: "❌ Auto-responder not found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.reply({
        content: `✅ Auto-responder #${id} deleted!`,
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "list") {
      const responders = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM auto_responders WHERE guild_id = ? ORDER BY created_at DESC",
          [interaction.guild.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (responders.length === 0) {
        return interaction.reply({
          content: "❌ No auto-responders found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🤖 Auto-Responders")
        .setDescription(
          responders
            .map(
              (r) =>
                `**ID:** ${r.id} ${r.enabled ? "✅" : "❌"}\n` +
                `**Trigger:** \`${r.trigger}\`\n` +
                `**Response:** ${r.response.slice(0, 100)}${
                  r.response.length > 100 ? "..." : ""
                }\n` +
                `**Case Sensitive:** ${r.case_sensitive ? "Yes" : "No"}`
            )
            .join("\n\n")
        )
        .setColor(0x5865f2)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "toggle") {
      const id = interaction.options.getInteger("id");

      const responder = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM auto_responders WHERE guild_id = ? AND id = ?",
          [interaction.guild.id, id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!responder) {
        return interaction.reply({
          content: "❌ Auto-responder not found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const newStatus = responder.enabled ? 0 : 1;

      await new Promise((resolve, reject) => {
        db.db.run(
          "UPDATE auto_responders SET enabled = ? WHERE guild_id = ? AND id = ?",
          [newStatus, interaction.guild.id, id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await interaction.reply({
        content: `✅ Auto-responder #${id} ${
          newStatus ? "enabled" : "disabled"
        }!`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

// Handle auto-responder in messageCreate event
module.exports.checkAutoResponder = async (message) => {
  const responders = await new Promise((resolve, reject) => {
    db.db.all(
      "SELECT * FROM auto_responders WHERE guild_id = ? AND enabled = 1",
      [message.guild.id],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });

  for (const responder of responders) {
    const trigger = responder.trigger;
    const messageContent = responder.case_sensitive
      ? message.content
      : message.content.toLowerCase();
    const triggerLower = responder.case_sensitive
      ? trigger
      : trigger.toLowerCase();

    if (messageContent.includes(triggerLower)) {
      await message.reply(responder.response);
      return true; // Only respond once
    }
  }

  return false;
};
