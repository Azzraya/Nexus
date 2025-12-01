const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const cron = require("node-cron");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Schedule moderation actions ")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ban")
        .setDescription("Schedule a ban")
        .addUserOption((option) =>
          option.setName("user").setDescription("User to ban").setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("time")
            .setDescription("When to ban (e.g., 'in 1h', '2024-12-31 23:59')")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for ban")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("unban")
        .setDescription("Schedule an unban")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to unban")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("time")
            .setDescription("When to unban (e.g., 'in 7d', '2024-12-31 23:59')")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List scheduled actions")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("Cancel a scheduled action")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("Scheduled action ID")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "ban" || subcommand === "unban") {
      const user = interaction.options.getUser("user");
      const timeInput = interaction.options.getString("time");
      const reason =
        interaction.options.getString("reason") || "Scheduled action";

      // Parse time
      let executeAt;
      if (timeInput.startsWith("in ")) {
        const ms = require("ms")(timeInput.slice(3));
        if (!ms) {
          return interaction.reply({
            content: "❌ Invalid time format! Use 'in 1h', 'in 7d', etc.",
            flags: MessageFlags.Ephemeral,
          });
        }
        executeAt = Date.now() + ms;
      } else {
        executeAt = new Date(timeInput).getTime();
        if (isNaN(executeAt)) {
          return interaction.reply({
            content: "❌ Invalid date format!",
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      if (executeAt <= Date.now()) {
        return interaction.reply({
          content: "❌ Scheduled time must be in the future!",
          flags: MessageFlags.Ephemeral,
        });
      }

      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO scheduled_actions (guild_id, user_id, action_type, reason, execute_at, created_by) VALUES (?, ?, ?, ?, ?, ?)",
          [
            interaction.guild.id,
            user.id,
            subcommand,
            reason,
            executeAt,
            interaction.user.id,
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Action Scheduled")
        .setDescription(
          `${subcommand.toUpperCase()} for ${
            user.tag
          } scheduled for <t:${Math.floor(executeAt / 1000)}:F>`
        )
        .addFields({ name: "Reason", value: reason, inline: false })
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "list") {
      const scheduled = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM scheduled_actions WHERE guild_id = ? AND execute_at > ? ORDER BY execute_at ASC",
          [interaction.guild.id, Date.now()],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (scheduled.length === 0) {
        return interaction.reply({
          content: "❌ No scheduled actions found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📅 Scheduled Actions")
        .setDescription(
          scheduled
            .map(
              (s) =>
                `**#${s.id}** ${s.action_type.toUpperCase()} <@${
                  s.user_id
                }> - <t:${Math.floor(s.execute_at / 1000)}:R>`
            )
            .join("\n")
        )
        .setColor(0x0099ff)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "cancel") {
      const id = interaction.options.getInteger("id");

      const result = await new Promise((resolve, reject) => {
        db.db.run(
          "DELETE FROM scheduled_actions WHERE id = ? AND guild_id = ?",
          [id, interaction.guild.id],
          function (err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });

      if (result === 0) {
        return interaction.reply({
          content: "❌ Scheduled action not found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.reply({
        content: `✅ Cancelled scheduled action #${id}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
