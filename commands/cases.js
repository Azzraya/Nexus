const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("cases")
    .setDescription("Manage moderation cases")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View your server's cases or a specific one")
        .addIntegerOption((option) =>
          option
            .setName("case_id")
            .setDescription("Specific case ID to view")
            .setRequired(false)
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("View cases for a specific user")
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of cases to show (1-25)")
            .setMinValue(1)
            .setMaxValue(25)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("modify")
        .setDescription("Modify a certain moderation case")
        .addIntegerOption((option) =>
          option
            .setName("case_id")
            .setDescription("Case ID to modify")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("New reason for the case")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "view") {
      const caseId = interaction.options.getInteger("case_id");
      const user = interaction.options.getUser("user");
      const limit = interaction.options.getInteger("limit") || 10;

      if (caseId) {
        // View specific case
        const caseData = await new Promise((resolve, reject) => {
          db.db.get(
            "SELECT * FROM moderation_logs WHERE id = ? AND guild_id = ?",
            [caseId, interaction.guild.id],
            (err, row) => {
              if (err) reject(err);
              else resolve(row);
            }
          );
        });

        if (!caseData) {
          return interaction.reply({
            content: "❌ Case not found!",
            flags: MessageFlags.Ephemeral,
          });
        }

        const embed = new EmbedBuilder()
          .setTitle(`Case #${caseData.id}`)
          .addFields(
            {
              name: "User",
              value: `<@${caseData.user_id}> (${caseData.user_id})`,
              inline: true,
            },
            {
              name: "Moderator",
              value: `<@${caseData.moderator_id}>`,
              inline: true,
            },
            {
              name: "Action",
              value: caseData.action.toUpperCase(),
              inline: true,
            },
            {
              name: "Reason",
              value: caseData.reason || "No reason provided",
              inline: false,
            },
            {
              name: "Date",
              value: `<t:${Math.floor(caseData.timestamp / 1000)}:F>`,
              inline: true,
            }
          )
          .setColor(0x0099ff)
          .setTimestamp();

        if (caseData.duration) {
          embed.addFields({
            name: "Duration",
            value: `${caseData.duration}ms`,
            inline: true,
          });
        }

        await interaction.reply({ embeds: [embed] });
      } else {
        // View cases list
        let query = "SELECT * FROM moderation_logs WHERE guild_id = ?";
        const params = [interaction.guild.id];

        if (user) {
          query += " AND user_id = ?";
          params.push(user.id);
        }

        query += " ORDER BY timestamp DESC LIMIT ?";
        params.push(limit);

        const cases = await new Promise((resolve, reject) => {
          db.db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        });

        if (cases.length === 0) {
          return interaction.reply({
            content: user
              ? `❌ No cases found for ${user.tag}!`
              : "❌ No cases found!",
            flags: MessageFlags.Ephemeral,
          });
        }

        const embed = new EmbedBuilder()
          .setTitle(
            user
              ? `Cases for ${user.tag}`
              : `Moderation Cases (${cases.length})`
          )
          .setColor(0x0099ff)
          .setTimestamp();

        const caseList = cases
          .slice(0, 10)
          .map(
            (c) =>
              `**#${c.id}** ${c.action.toUpperCase()} - <@${c.user_id}> - ${
                c.reason?.slice(0, 50) || "No reason"
              }`
          )
          .join("\n");

        embed.setDescription(caseList);

        if (cases.length > 10) {
          embed.setFooter({
            text: `Showing 10 of ${cases.length} cases. Use /cases view limit:${cases.length} to see all.`,
          });
        }

        await interaction.reply({ embeds: [embed] });
      }
    } else if (subcommand === "modify") {
      const caseId = interaction.options.getInteger("case_id");
      const newReason = interaction.options.getString("reason");

      const caseData = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM moderation_logs WHERE id = ? AND guild_id = ?",
          [caseId, interaction.guild.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!caseData) {
        return interaction.reply({
          content: "❌ Case not found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      await new Promise((resolve, reject) => {
        db.db.run(
          "UPDATE moderation_logs SET reason = ? WHERE id = ? AND guild_id = ?",
          [newReason, caseId, interaction.guild.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Case Modified")
        .setDescription(`**Case #${caseId}** has been updated.`)
        .addFields(
          {
            name: "Old Reason",
            value: caseData.reason || "No reason provided",
            inline: false,
          },
          {
            name: "New Reason",
            value: newReason,
            inline: false,
          }
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};
