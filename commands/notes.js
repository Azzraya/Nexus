const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("notes")
    .setDescription("Manage member notes")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a new note to a member")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to add note to")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("note")
            .setDescription("Note content")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("modify")
        .setDescription("Edit the note of a certain user")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User whose note to edit")
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("note_id")
            .setDescription("Note ID to modify")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("note")
            .setDescription("New note content")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a certain note from a user")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User whose note to remove")
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("note_id")
            .setDescription("Note ID to remove")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View all notes or specific filtered notes")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("View notes for a specific user")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("sweep")
        .setDescription(
          "Deletes all notes of a specific user or the whole server"
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription(
              "User to delete all notes for (leave empty for all)"
            )
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const user = interaction.options.getUser("user");
      const note = interaction.options.getString("note");

      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO notes (guild_id, user_id, note, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
          [
            interaction.guild.id,
            user.id,
            note,
            interaction.user.id,
            Date.now(),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await interaction.reply({
        embeds: [
          {
            title: "✅ Note Added",
            description: `Added note to ${user.tag}`,
            fields: [{ name: "Note", value: note, inline: false }],
            color: 0x00ff00,
          },
        ],
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "modify") {
      const user = interaction.options.getUser("user");
      const noteId = interaction.options.getInteger("note_id");
      const newNote = interaction.options.getString("note");

      const noteData = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM notes WHERE id = ? AND guild_id = ? AND user_id = ?",
          [noteId, interaction.guild.id, user.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!noteData) {
        return interaction.reply({
          content: "❌ Note not found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      await new Promise((resolve, reject) => {
        db.db.run(
          "UPDATE notes SET note = ? WHERE id = ? AND guild_id = ? AND user_id = ?",
          [newNote, noteId, interaction.guild.id, user.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await interaction.reply({
        embeds: [
          {
            title: "✅ Note Modified",
            description: `Updated note #${noteId} for ${user.tag}`,
            color: 0x00ff00,
          },
        ],
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "remove") {
      const user = interaction.options.getUser("user");
      const noteId = interaction.options.getInteger("note_id");

      const result = await new Promise((resolve, reject) => {
        db.db.run(
          "DELETE FROM notes WHERE id = ? AND guild_id = ? AND user_id = ?",
          [noteId, interaction.guild.id, user.id],
          function (err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });

      if (result === 0) {
        return interaction.reply({
          content: "❌ Note not found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.reply({
        content: `✅ Removed note #${noteId} from ${user.tag}`,
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "view") {
      const user = interaction.options.getUser("user");

      let query = "SELECT * FROM notes WHERE guild_id = ?";
      const params = [interaction.guild.id];

      if (user) {
        query += " AND user_id = ?";
        params.push(user.id);
      }

      query += " ORDER BY created_at DESC";

      const notes = await new Promise((resolve, reject) => {
        db.db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      if (notes.length === 0) {
        return interaction.reply({
          content: user
            ? `❌ No notes found for ${user.tag}!`
            : "❌ No notes found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(
          user ? `Notes for ${user.tag}` : `All Notes (${notes.length})`
        )
        .setColor(0x0099ff)
        .setTimestamp();

      const noteList = notes
        .slice(0, 10)
        .map(
          (n) =>
            `**#${n.id}** <t:${Math.floor(n.created_at / 1000)}:R> by <@${
              n.created_by
            }>\n${n.note}`
        )
        .join("\n\n");

      embed.setDescription(noteList);

      if (notes.length > 10) {
        embed.setFooter({
          text: `Showing 10 of ${notes.length} notes`,
        });
      }

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "sweep") {
      const user = interaction.options.getUser("user");

      let query = "DELETE FROM notes WHERE guild_id = ?";
      const params = [interaction.guild.id];

      if (user) {
        query += " AND user_id = ?";
        params.push(user.id);
      }

      const result = await new Promise((resolve, reject) => {
        db.db.run(query, params, function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });

      await interaction.reply({
        content: `✅ Deleted ${result} note(s)${
          user ? ` for ${user.tag}` : " from the server"
        }`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
