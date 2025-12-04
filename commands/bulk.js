const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Moderation = require('../utils/moderation');
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bulk')
    .setDescription('Perform bulk moderation operations')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('ban')
        .setDescription('Ban multiple users at once')
        .addStringOption(option =>
          option
            .setName('user-ids')
            .setDescription('User IDs separated by commas or spaces')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('reason')
            .setDescription('Reason for bans')
        )
        .addIntegerOption(option =>
          option
            .setName('delete-days')
            .setDescription('Days of messages to delete (0-7)')
            .setMinValue(0)
            .setMaxValue(7)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('kick')
        .setDescription('Kick multiple users at once')
        .addStringOption(option =>
          option
            .setName('user-ids')
            .setDescription('User IDs separated by commas or spaces')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('reason')
            .setDescription('Reason for kicks')
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('role')
        .setDescription('Assign or remove a role from multiple users')
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Role to assign/remove')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('user-ids')
            .setDescription('User IDs separated by commas or spaces')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Add or remove role')
            .addChoices(
              { name: 'Add', value: 'add' },
              { name: 'Remove', value: 'remove' }
            )
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('purge-bots')
        .setDescription('Kick all bot accounts from the server')
        .addBooleanOption(option =>
          option
            .setName('confirm')
            .setDescription('Confirm you want to kick ALL bots')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('purge-new')
        .setDescription('Kick all members who joined in the last X hours')
        .addIntegerOption(option =>
          option
            .setName('hours')
            .setDescription('Hours (kick members who joined in last X hours)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(72)
        )
        .addBooleanOption(option =>
          option
            .setName('confirm')
            .setDescription('Confirm bulk kick')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'ban') {
      await interaction.deferReply({ ephemeral: true });

      const userIdsRaw = interaction.options.getString('user-ids');
      const reason = interaction.options.getString('reason') || 'Bulk ban';
      const deleteDays = interaction.options.getInteger('delete-days') || 0;

      // Parse user IDs
      const userIds = userIdsRaw
        .split(/[,\s]+/)
        .filter(id => id.match(/^\d{17,19}$/));

      if (userIds.length === 0) {
        return await interaction.editReply({
          content: '❌ No valid user IDs found. Provide IDs separated by commas or spaces.'
        });
      }

      if (userIds.length > 50) {
        return await interaction.editReply({
          content: '❌ Maximum 50 users per bulk operation. Please split into multiple commands.'
        });
      }

      const results = { success: 0, failed: 0, errors: [] };

      for (const userId of userIds) {
        try {
          await interaction.guild.members.ban(userId, {
            deleteMessageSeconds: deleteDays * 24 * 60 * 60,
            reason: `${reason} (Bulk ban by ${interaction.user.tag})`
          });
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push(`${userId}: ${error.message}`);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('⚔️ Bulk Ban Complete')
        .setColor(results.failed > 0 ? '#ed8936' : '#48bb78')
        .addFields(
          {
            name: '✅ Successful',
            value: `${results.success} user(s)`,
            inline: true
          },
          {
            name: '❌ Failed',
            value: `${results.failed} user(s)`,
            inline: true
          },
          {
            name: '📋 Details',
            value: `Total attempted: ${userIds.length}`,
            inline: true
          }
        )
        .setTimestamp();

      if (results.errors.length > 0) {
        embed.addFields({
          name: '⚠️ Errors',
          value: results.errors.slice(0, 5).join('\n') + 
                 (results.errors.length > 5 ? `\n... and ${results.errors.length - 5} more` : ''),
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === 'kick') {
      await interaction.deferReply({ ephemeral: true });

      const userIdsRaw = interaction.options.getString('user-ids');
      const reason = interaction.options.getString('reason') || 'Bulk kick';

      const userIds = userIdsRaw
        .split(/[,\s]+/)
        .filter(id => id.match(/^\d{17,19}$/));

      if (userIds.length === 0) {
        return await interaction.editReply({
          content: '❌ No valid user IDs found.'
        });
      }

      if (userIds.length > 50) {
        return await interaction.editReply({
          content: '❌ Maximum 50 users per bulk operation.'
        });
      }

      const results = { success: 0, failed: 0, errors: [] };

      for (const userId of userIds) {
        try {
          const member = await interaction.guild.members.fetch(userId);
          await member.kick(`${reason} (Bulk kick by ${interaction.user.tag})`);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push(`${userId}: ${error.message}`);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('👢 Bulk Kick Complete')
        .setColor(results.failed > 0 ? '#ed8936' : '#48bb78')
        .addFields(
          {
            name: '✅ Successful',
            value: `${results.success} user(s)`,
            inline: true
          },
          {
            name: '❌ Failed',
            value: `${results.failed} user(s)`,
            inline: true
          }
        )
        .setTimestamp();

      if (results.errors.length > 0) {
        embed.addFields({
          name: '⚠️ Errors',
          value: results.errors.slice(0, 5).join('\n'),
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === 'role') {
      await interaction.deferReply({ ephemeral: true });

      const role = interaction.options.getRole('role');
      const userIdsRaw = interaction.options.getString('user-ids');
      const action = interaction.options.getString('action');

      const userIds = userIdsRaw
        .split(/[,\s]+/)
        .filter(id => id.match(/^\d{17,19}$/));

      if (userIds.length === 0) {
        return await interaction.editReply({
          content: '❌ No valid user IDs found.'
        });
      }

      if (userIds.length > 50) {
        return await interaction.editReply({
          content: '❌ Maximum 50 users per bulk operation.'
        });
      }

      const results = { success: 0, failed: 0, errors: [] };

      for (const userId of userIds) {
        try {
          const member = await interaction.guild.members.fetch(userId);
          
          if (action === 'add') {
            await member.roles.add(role, `Bulk role add by ${interaction.user.tag}`);
          } else {
            await member.roles.remove(role, `Bulk role remove by ${interaction.user.tag}`);
          }
          
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push(`${userId}: ${error.message}`);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle(`🎭 Bulk Role ${action === 'add' ? 'Assignment' : 'Removal'} Complete`)
        .setColor(results.failed > 0 ? '#ed8936' : '#48bb78')
        .addFields(
          {
            name: '🎯 Role',
            value: role.toString(),
            inline: false
          },
          {
            name: '✅ Successful',
            value: `${results.success} user(s)`,
            inline: true
          },
          {
            name: '❌ Failed',
            value: `${results.failed} user(s)`,
            inline: true
          }
        )
        .setTimestamp();

      if (results.errors.length > 0) {
        embed.addFields({
          name: '⚠️ Errors',
          value: results.errors.slice(0, 5).join('\n'),
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === 'purge-bots') {
      await interaction.deferReply({ ephemeral: true });

      const confirm = interaction.options.getBoolean('confirm');
      if (!confirm) {
        return await interaction.editReply({
          content: '❌ You must confirm this action by setting confirm:True'
        });
      }

      // Fetch all members and filter bots
      await interaction.guild.members.fetch();
      const bots = interaction.guild.members.cache.filter(m => m.user.bot && m.id !== interaction.client.user.id);

      if (bots.size === 0) {
        return await interaction.editReply({
          content: '✅ No bot accounts found (other than me!)'
        });
      }

      const results = { success: 0, failed: 0, errors: [] };

      for (const [id, member] of bots) {
        try {
          await member.kick(`Bulk bot purge by ${interaction.user.tag}`);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push(`${member.user.tag}: ${error.message}`);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('🤖 Bot Purge Complete')
        .setDescription(`Removed bot accounts from server`)
        .setColor(results.failed > 0 ? '#ed8936' : '#48bb78')
        .addFields(
          {
            name: '✅ Kicked',
            value: `${results.success} bot(s)`,
            inline: true
          },
          {
            name: '❌ Failed',
            value: `${results.failed} bot(s)`,
            inline: true
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === 'purge-new') {
      await interaction.deferReply({ ephemeral: true });

      const hours = interaction.options.getInteger('hours');
      const confirm = interaction.options.getBoolean('confirm');

      if (!confirm) {
        return await interaction.editReply({
          content: '❌ You must confirm this action by setting confirm:True'
        });
      }

      const cutoff = Date.now() - (hours * 60 * 60 * 1000);
      
      await interaction.guild.members.fetch();
      const recentMembers = interaction.guild.members.cache.filter(m => 
        m.joinedTimestamp > cutoff && !m.user.bot
      );

      if (recentMembers.size === 0) {
        return await interaction.editReply({
          content: `✅ No members joined in the last ${hours} hour(s).`
        });
      }

      const results = { success: 0, failed: 0, errors: [] };

      for (const [id, member] of recentMembers) {
        try {
          await member.kick(`Bulk purge: Joined within ${hours}h (by ${interaction.user.tag})`);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push(`${member.user.tag}: ${error.message}`);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('🧹 New Member Purge Complete')
        .setDescription(`Removed members who joined in the last ${hours} hour(s)`)
        .setColor(results.failed > 0 ? '#ed8936' : '#48bb78')
        .addFields(
          {
            name: '✅ Kicked',
            value: `${results.success} member(s)`,
            inline: true
          },
          {
            name: '❌ Failed',
            value: `${results.failed} member(s)`,
            inline: true
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
