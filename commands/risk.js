const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const memberIntelligence = require("../utils/memberIntelligence");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("risk")
    .setDescription("Analyze member risk levels and suspicious behavior")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("check")
        .setDescription("Check risk score for a specific member")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to analyze")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("top")
        .setDescription("View top risky members in this server")
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of members to show (default: 10)")
            .setMinValue(5)
            .setMaxValue(25)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "check") {
      await interaction.deferReply({ ephemeral: true });

      const user = interaction.options.getUser("user");
      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      if (!member) {
        return await interaction.editReply({
          content: "❌ User not found in this server.",
        });
      }

      const risk = await memberIntelligence.calculateRiskScore(member);

      const embed = new EmbedBuilder()
        .setTitle(`🔍 Risk Analysis - ${user.tag}`)
        .setThumbnail(user.displayAvatarURL())
        .setColor(risk.color)
        .addFields(
          {
            name: "⚠️ Risk Score",
            value: `**${risk.score}/100** (${risk.level})`,
            inline: true,
          },
          {
            name: "📊 Account Age",
            value: `${risk.accountAge} days`,
            inline: true,
          },
          {
            name: "🕐 In Server",
            value: `${risk.serverAge} days`,
            inline: true,
          },
          {
            name: "📝 Warnings",
            value: `${risk.warnings}`,
            inline: true,
          },
          {
            name: "💬 Messages",
            value: `${risk.activity}`,
            inline: true,
          },
          {
            name: "🎯 Status",
            value:
              risk.score >= 70
                ? "🚨 **HIGH RISK** - Immediate attention"
                : risk.score >= 50
                ? "⚠️ **MEDIUM RISK** - Monitor closely"
                : risk.score >= 30
                ? "🟡 **LOW RISK** - Normal monitoring"
                : "✅ **MINIMAL RISK** - Trusted member",
            inline: false,
          }
        )
        .setTimestamp();

      if (risk.reasons.length > 0) {
        embed.addFields({
          name: "📋 Risk Factors",
          value: risk.reasons.join("\n"),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === "top") {
      await interaction.deferReply({ ephemeral: true });

      const limit = interaction.options.getInteger("limit") || 10;

      await interaction.editReply({
        content: `🔍 Analyzing ${interaction.guild.memberCount} members... This may take a moment.`,
      });

      const riskyMembers = await memberIntelligence.getTopRiskyMembers(
        interaction.guild,
        limit
      );

      if (riskyMembers.length === 0) {
        return await interaction.editReply({
          content: "✅ No risky members found! Your server looks secure.",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`🚨 Top ${limit} Risky Members - ${interaction.guild.name}`)
        .setDescription("Members with the highest calculated risk scores")
        .setColor("#f56565")
        .setTimestamp();

      riskyMembers.forEach((data, index) => {
        const riskEmoji =
          data.score >= 70 ? "🔴" : data.score >= 50 ? "🟠" : "🟡";
        embed.addFields({
          name: `${riskEmoji} ${index + 1}. ${data.member.user.tag}`,
          value: [
            `**Risk Score:** ${data.score}/100 (${data.level})`,
            `**Account:** ${data.accountAge}d old`,
            `**Warnings:** ${data.warnings}`,
            `**Top Risk:** ${data.reasons[0] || "Multiple factors"}`,
          ].join("\n"),
          inline: false,
        });
      });

      embed.setFooter({
        text: "Use /risk check user:@user for detailed analysis",
      });

      await interaction.editReply({ content: null, embeds: [embed] });
    }
  },
};
