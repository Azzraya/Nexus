const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const serverHealth = require('../utils/serverHealth');
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('health')
    .setDescription('View your server\'s security and configuration health score')
    .addStringOption(option =>
      option
        .setName('view')
        .setDescription('What to view')
        .addChoices(
          { name: 'Overview', value: 'overview' },
          { name: 'Detailed Breakdown', value: 'detailed' },
          { name: 'Recommendations', value: 'recommendations' }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const view = interaction.options.getString('view') || 'overview';
      const health = await serverHealth.calculateHealth(interaction.guild.id);

      if (view === 'overview') {
        const embed = new EmbedBuilder()
          .setTitle(`🏥 Server Health Report - ${interaction.guild.name}`)
          .setColor(health.color)
          .addFields(
            {
              name: '📊 Overall Health Score',
              value: `**${health.overall}/100** (Grade: **${health.grade}**)`,
              inline: false
            },
            {
              name: '🎯 Status',
              value: health.status,
              inline: true
            },
            {
              name: '🔍 Quick Stats',
              value: [
                `Security: **${Math.round(health.breakdown.security)}/100**`,
                `Configuration: **${Math.round(health.breakdown.configuration)}/100**`,
                `Activity: **${Math.round(health.breakdown.activity)}/100**`
              ].join('\n'),
              inline: true
            }
          )
          .setDescription(
            health.overall >= 90
              ? '✅ Excellent! Your server is very well protected.'
              : health.overall >= 80
              ? '👍 Good! A few minor improvements would help.'
              : health.overall >= 70
              ? '⚠️ Fair. Consider improving your security setup.'
              : health.overall >= 60
              ? '🔶 Needs improvement. Review recommendations below.'
              : '🚨 Critical! Your server needs immediate attention.'
          )
          .setFooter({
            text: 'Use /health view:detailed for a full breakdown • /health view:recommendations for tips'
          })
          .setTimestamp();

        // Add top recommendation if health is not excellent
        if (health.recommendations.length > 0) {
          const topRec = health.recommendations[0];
          embed.addFields({
            name: '💡 Top Recommendation',
            value: `**${topRec.category}:** ${topRec.message}\n\`${topRec.action}\``,
            inline: false
          });
        }

        await interaction.editReply({ embeds: [embed] });
      } else if (view === 'detailed') {
        const embed = new EmbedBuilder()
          .setTitle(`📊 Detailed Health Breakdown - ${interaction.guild.name}`)
          .setColor(health.color)
          .addFields(
            {
              name: '🛡️ Security Features',
              value: `**${Math.round(health.breakdown.security)}/100**\nMeasures enabled security protections`,
              inline: true
            },
            {
              name: '⚙️ Configuration',
              value: `**${Math.round(health.breakdown.configuration)}/100**\nSetup completeness`,
              inline: true
            },
            {
              name: '📈 Activity',
              value: `**${Math.round(health.breakdown.activity)}/100**\nRecent moderation actions`,
              inline: true
            },
            {
              name: '⚠️ Threat Handling',
              value: `**${Math.round(health.breakdown.threats)}/100**\nSecurity incidents managed`,
              inline: true
            },
            {
              name: '⏱️ Uptime',
              value: `**${Math.round(health.breakdown.uptime)}/100**\nTime bot has been in server`,
              inline: true
            },
            {
              name: '🎯 Overall',
              value: `**${health.overall}/100** (${health.grade})`,
              inline: true
            }
          )
          .setDescription('Each category contributes to your overall health score based on weighted importance.')
          .setFooter({ text: 'Green = Excellent • Yellow = Good • Orange = Fair • Red = Poor' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (view === 'recommendations') {
        if (health.recommendations.length === 0) {
          const embed = new EmbedBuilder()
            .setTitle('✅ No Recommendations')
            .setDescription('Your server is well-configured! Keep up the good work.')
            .setColor('#48bb78')
            .setTimestamp();

          return await interaction.editReply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
          .setTitle(`💡 Health Recommendations - ${interaction.guild.name}`)
          .setDescription(`Here are ${health.recommendations.length} suggestions to improve your server health:`)
          .setColor(health.color)
          .setTimestamp();

        health.recommendations.forEach((rec, index) => {
          const emoji = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
          embed.addFields({
            name: `${emoji} ${index + 1}. ${rec.category}`,
            value: `${rec.message}\n\`${rec.action}\``,
            inline: false
          });
        });

        embed.setFooter({ text: '🔴 = High Priority • 🟡 = Medium • 🟢 = Low' });

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error('[Health Command] Error:', error);
      await interaction.editReply({
        content: '❌ Failed to calculate server health. Please try again later.',
        ephemeral: true
      });
    }
  },
};
