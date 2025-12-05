const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const Security = require("../utils/security");
const IntelligentDetection = require("../utils/intelligentDetection");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("scan")
    .setDescription("Scan server for security threats")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("What to scan")
        .setRequired(true)
        .addChoices(
          { name: "All Members", value: "members" },
          { name: "Recent Joins", value: "joins" },
          { name: "Roles", value: "roles" },
          { name: "Channels", value: "channels" }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply();

    const scanType = interaction.options.getString("type");
    let threats = [];
    let safe = 0;

    if (scanType === "members") {
      const members = await interaction.guild.members.fetch({ limit: 100 });

      for (const member of members.values()) {
        const threat = await Security.detectThreat(
          interaction.guild,
          member.user,
          "scan"
        );

        if (threat.score >= 40) {
          threats.push({
            user: member.user.tag,
            score: threat.score,
            level: threat.level,
          });
        } else {
          safe++;
        }
      }
    } else if (scanType === "joins") {
      const recentJoins = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT user_id FROM anti_raid_logs WHERE guild_id = ? AND timestamp > ?",
          [interaction.guild.id, Date.now() - 86400000], // Last 24 hours
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      for (const join of recentJoins.slice(0, 50)) {
        try {
          const user = await interaction.client.users.fetch(join.user_id);
          const threat = await Security.detectThreat(
            interaction.guild,
            user,
            "scan"
          );

          if (threat.score >= 40) {
            threats.push({
              user: user.tag,
              score: threat.score,
              level: threat.level,
            });
          } else {
            safe++;
          }
        } catch (error) {
          const ErrorHandler = require("../utils/errorHandler");
          const ErrorMessages = require("../utils/errorMessages");
          ErrorHandler.logError(
            error,
            `scan [${interaction.guild.id}]`,
            `Scan user ${userId}`
          );
        }
      }
    }

    threats.sort((a, b) => b.score - a.score);

    const embed = new EmbedBuilder()
      .setTitle(`🔍 Security Scan - ${scanType.toUpperCase()}`)
      .addFields(
        { name: "Threats Found", value: `${threats.length}`, inline: true },
        { name: "Safe", value: `${safe}`, inline: true },
        {
          name: "Total Scanned",
          value: `${threats.length + safe}`,
          inline: true,
        }
      )
      .setColor(threats.length > 0 ? 0xff0000 : 0x00ff00)
      .setTimestamp();

    if (threats.length > 0) {
      const topThreats = threats
        .slice(0, 10)
        .map((t, i) => `${i + 1}. ${t.user} - ${t.score}% (${t.level})`);
      embed.addFields({
        name: "Top Threats",
        value: topThreats.join("\n") || "None",
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
