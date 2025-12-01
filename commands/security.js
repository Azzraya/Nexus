const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const Security = require("../utils/security");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("security")
    .setDescription("Security management and auditing")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("check")
        .setDescription("Check security status of a user")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to check")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("audit").setDescription("Run security audit")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("whitelist")
        .setDescription("Manage security whitelist")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Action to perform")
            .setRequired(true)
            .addChoices(
              { name: "Add", value: "add" },
              { name: "Remove", value: "remove" },
              { name: "List", value: "list" }
            )
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to whitelist")
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "check") {
      const user = interaction.options.getUser("user");
      const threat = await Security.detectThreat(
        interaction.guild,
        user,
        "check"
      );

      const embed = new EmbedBuilder()
        .setTitle(`🔒 Security Check - ${user.tag}`)
        .addFields(
          {
            name: "Threat Level",
            value: threat.level.toUpperCase(),
            inline: true,
          },
          { name: "Threat Score", value: `${threat.score}/100`, inline: true },
          {
            name: "Recommended Action",
            value: threat.action || "None",
            inline: true,
          }
        )
        .setColor(
          threat.score >= 80
            ? 0xff0000
            : threat.score >= 60
            ? 0xff8800
            : threat.score >= 40
            ? 0xffff00
            : 0x00ff00
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

      // Add account info
      const accountAge = Date.now() - user.createdTimestamp;
      const daysOld = accountAge / (1000 * 60 * 60 * 24);
      embed.addFields({
        name: "Account Information",
        value: `**Age:** ${Math.floor(daysOld)} days\n**Avatar:** ${
          user.avatar ? "Yes" : "No"
        }\n**Discriminator:** ${user.discriminator}`,
        inline: false,
      });

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "audit") {
      await interaction.deferReply();

      const audit = await Security.auditSecurity(interaction.guild);

      const embed = new EmbedBuilder()
        .setTitle("🔒 Security Audit")
        .addFields(
          { name: "Security Score", value: `${audit.score}/100`, inline: true },
          {
            name: "Vulnerabilities",
            value: `${audit.vulnerabilities.length}`,
            inline: true,
          },
          {
            name: "Recommendations",
            value: `${audit.recommendations.length}`,
            inline: true,
          }
        )
        .setColor(
          audit.score >= 80 ? 0x00ff00 : audit.score >= 60 ? 0xffff00 : 0xff0000
        )
        .setTimestamp();

      if (audit.vulnerabilities.length > 0) {
        embed.addFields({
          name: "⚠️ Vulnerabilities",
          value: audit.vulnerabilities.map((v) => `• ${v}`).join("\n"),
          inline: false,
        });
      }

      if (audit.recommendations.length > 0) {
        embed.addFields({
          name: "💡 Recommendations",
          value: audit.recommendations.map((r) => `• ${r}`).join("\n"),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === "whitelist") {
      const action = interaction.options.getString("action");
      const user = interaction.options.getUser("user");

      if (action === "add") {
        if (!user) {
          return interaction.reply({
            content: "❌ Please specify a user!",
            flags: MessageFlags.Ephemeral,
          });
        }

        await new Promise((resolve, reject) => {
          db.db.run(
            "INSERT OR REPLACE INTO security_whitelist (guild_id, user_id) VALUES (?, ?)",
            [interaction.guild.id, user.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        await interaction.reply({
          embeds: [
            {
              title: "✅ User Whitelisted",
              description: `${user.tag} has been added to the security whitelist`,
              color: 0x00ff00,
            },
          ],
        });
      } else if (action === "remove") {
        if (!user) {
          return interaction.reply({
            content: "❌ Please specify a user!",
            flags: MessageFlags.Ephemeral,
          });
        }

        await new Promise((resolve, reject) => {
          db.db.run(
            "DELETE FROM security_whitelist WHERE guild_id = ? AND user_id = ?",
            [interaction.guild.id, user.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        await interaction.reply({
          content: `✅ Removed ${user.tag} from whitelist`,
          flags: MessageFlags.Ephemeral,
        });
      } else if (action === "list") {
        const whitelisted = await new Promise((resolve, reject) => {
          db.db.all(
            "SELECT user_id FROM security_whitelist WHERE guild_id = ?",
            [interaction.guild.id],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        });

        if (whitelisted.length === 0) {
          return interaction.reply({
            content: "❌ No users whitelisted!",
            flags: MessageFlags.Ephemeral,
          });
        }

        const list = await Promise.all(
          whitelisted.map(async (w) => {
            try {
              const user = await interaction.client.users.fetch(w.user_id);
              return user.tag;
            } catch {
              return `Unknown (${w.user_id})`;
            }
          })
        );

        const embed = new EmbedBuilder()
          .setTitle("📋 Security Whitelist")
          .setDescription(list.join("\n"))
          .setColor(0x0099ff)
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }
    }
  },
};
