const db = require('./database');
const logger = require('./logger');
const cron = require('node-cron');

class ScheduledActions {
  constructor(client) {
    this.client = client;
    this.activeTasks = new Map(); // taskId -> cron task
    this.checkInterval = null;
  }

  async start() {
    try {
      // Load all scheduled actions and start them
      const actions = await db.getAllScheduledActions();
      
      for (const action of actions) {
        if (action.status === 'active') {
          await this.scheduleAction(action);
        }
      }

      // Check for one-time actions every minute
      this.checkInterval = setInterval(() => this.checkOneTimeActions(), 60 * 1000);
      
      logger.info(`[ScheduledActions] Started ${actions.length} scheduled actions`);
    } catch (error) {
      // If table doesn't exist yet, it's fine - first startup
      logger.debug('[ScheduledActions] No scheduled actions table yet (first startup)');
    }
  }

  async scheduleAction(action) {
    try {
      if (action.schedule_type === 'recurring' && action.cron_expression) {
        // Validate cron expression
        if (!cron.validate(action.cron_expression)) {
          logger.error(`[ScheduledActions] Invalid cron expression for action ${action.id}`);
          return;
        }

        const task = cron.schedule(action.cron_expression, async () => {
          await this.executeAction(action);
        });

        this.activeTasks.set(action.id, task);
        logger.info(`[ScheduledActions] Scheduled recurring action ${action.id}: ${action.action_type}`);
      } else if (action.schedule_type === 'once') {
        // Will be checked by checkOneTimeActions
        logger.info(`[ScheduledActions] One-time action ${action.id} scheduled for ${new Date(action.execute_at)}`);
      }
    } catch (error) {
      logger.error(`[ScheduledActions] Failed to schedule action ${action.id}:`, error);
    }
  }

  async checkOneTimeActions() {
    const now = Date.now();
    const dueActions = await db.getDueScheduledActions(now);

    for (const action of dueActions) {
      await this.executeAction(action);
      // Mark as completed
      await db.updateScheduledActionStatus(action.id, 'completed');
    }
  }

  async executeAction(action) {
    try {
      const guild = this.client.guilds.cache.get(action.guild_id);
      if (!guild) {
        logger.warn(`[ScheduledActions] Guild ${action.guild_id} not found for action ${action.id}`);
        return;
      }

      const actionData = JSON.parse(action.action_data);

      switch (action.action_type) {
        case 'send_message':
          await this.executeSendMessage(guild, actionData);
          break;
        
        case 'add_role':
          await this.executeAddRole(guild, actionData);
          break;
        
        case 'remove_role':
          await this.executeRemoveRole(guild, actionData);
          break;
        
        case 'create_channel':
          await this.executeCreateChannel(guild, actionData);
          break;
        
        case 'delete_channel':
          await this.executeDeleteChannel(guild, actionData);
          break;
        
        case 'ban_user':
          await this.executeBanUser(guild, actionData);
          break;
        
        case 'unban_user':
          await this.executeUnbanUser(guild, actionData);
          break;

        default:
          logger.warn(`[ScheduledActions] Unknown action type: ${action.action_type}`);
      }

      logger.success(`[ScheduledActions] Executed action ${action.id}: ${action.action_type}`);

      // Log execution
      await db.logScheduledActionExecution(action.id, true);

    } catch (error) {
      logger.error(`[ScheduledActions] Failed to execute action ${action.id}:`, error);
      await db.logScheduledActionExecution(action.id, false, error.message);
    }
  }

  async executeSendMessage(guild, data) {
    const channel = guild.channels.cache.get(data.channel_id);
    if (!channel || !channel.isTextBased()) {
      throw new Error('Channel not found or not text-based');
    }

    const { EmbedBuilder } = require('discord.js');

    if (data.embed) {
      const embed = new EmbedBuilder()
        .setDescription(data.message)
        .setColor(data.color || 0x0099ff);
      
      if (data.title) embed.setTitle(data.title);
      if (data.footer) embed.setFooter({ text: data.footer });
      
      await channel.send({ embeds: [embed] });
    } else {
      await channel.send(data.message);
    }
  }

  async executeAddRole(guild, data) {
    const member = await guild.members.fetch(data.user_id);
    const role = guild.roles.cache.get(data.role_id);
    
    if (!member || !role) {
      throw new Error('Member or role not found');
    }

    await member.roles.add(role, data.reason || 'Scheduled action');
  }

  async executeRemoveRole(guild, data) {
    const member = await guild.members.fetch(data.user_id);
    const role = guild.roles.cache.get(data.role_id);
    
    if (!member || !role) {
      throw new Error('Member or role not found');
    }

    await member.roles.remove(role, data.reason || 'Scheduled action');
  }

  async executeCreateChannel(guild, data) {
    await guild.channels.create({
      name: data.name,
      type: data.type || 0,
      parent: data.parent_id || undefined,
      reason: data.reason || 'Scheduled action'
    });
  }

  async executeDeleteChannel(guild, data) {
    const channel = guild.channels.cache.get(data.channel_id);
    if (!channel) {
      throw new Error('Channel not found');
    }

    await channel.delete(data.reason || 'Scheduled action');
  }

  async executeBanUser(guild, data) {
    await guild.members.ban(data.user_id, {
      reason: data.reason || 'Scheduled action',
      deleteMessageSeconds: (data.delete_days || 0) * 24 * 60 * 60
    });
  }

  async executeUnbanUser(guild, data) {
    await guild.members.unban(data.user_id, data.reason || 'Scheduled action');
  }

  async cancelAction(actionId) {
    // Stop cron task if running
    if (this.activeTasks.has(actionId)) {
      const task = this.activeTasks.get(actionId);
      task.stop();
      this.activeTasks.delete(actionId);
    }

    // Update database
    await db.updateScheduledActionStatus(actionId, 'cancelled');
  }

  stop() {
    // Stop all running tasks
    for (const task of this.activeTasks.values()) {
      task.stop();
    }
    this.activeTasks.clear();

    // Stop check interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    logger.info('[ScheduledActions] Stopped all scheduled actions');
  }
}

module.exports = ScheduledActions;

