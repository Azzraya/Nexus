const db = require("./database");
const Moderation = require("./moderation");
const Security = require("./security");

class WorkflowEngine {
  constructor(client) {
    this.client = client;
    this.activeWorkflows = new Map();
  }

  async loadWorkflows(guildId) {
    const workflows = await db.getWorkflows(guildId, true);
    this.activeWorkflows.set(guildId, workflows);
    return workflows;
  }

  async checkTriggers(guildId, eventType, eventData) {
    const workflows = this.activeWorkflows.get(guildId) || [];

    for (const workflow of workflows) {
      if (!workflow.enabled) continue;

      if (this.matchesTrigger(workflow, eventType, eventData)) {
        await this.executeWorkflow(workflow, eventData);
      }
    }
  }

  matchesTrigger(workflow, eventType, eventData) {
    const { trigger_type, trigger_config } = workflow;

    switch (trigger_type) {
      case "message_count":
        return this.checkMessageCountTrigger(
          eventType,
          eventData,
          trigger_config
        );
      case "message_pattern":
        return this.checkMessagePatternTrigger(
          eventType,
          eventData,
          trigger_config
        );
      case "user_join":
        return eventType === "guildMemberAdd";
      case "user_leave":
        return eventType === "guildMemberRemove";
      case "role_added":
        return (
          eventType === "roleAdd" && eventData.roleId === trigger_config.role_id
        );
      case "role_removed":
        return (
          eventType === "roleRemove" &&
          eventData.roleId === trigger_config.role_id
        );
      case "channel_created":
        return eventType === "channelCreate";
      case "channel_deleted":
        return eventType === "channelDelete";
      case "time_based":
        return this.checkTimeBasedTrigger(trigger_config);
      case "heat_threshold":
        return this.checkHeatThresholdTrigger(
          eventType,
          eventData,
          trigger_config
        );
      case "threat_detected":
        return (
          eventType === "threatDetected" &&
          eventData.threatScore >= trigger_config.min_score
        );
      default:
        return false;
    }
  }

  checkMessageCountTrigger(eventType, eventData, config) {
    if (eventType !== "messageCreate") return false;

    // This would need to track message counts per user
    // For now, simplified check
    return false;
  }

  checkMessagePatternTrigger(eventType, eventData, config) {
    if (eventType !== "messageCreate") return false;

    const message = eventData.message?.content?.toLowerCase() || "";
    const patterns = config.patterns || [];

    return patterns.some((pattern) => {
      if (pattern.type === "contains") {
        return message.includes(pattern.value.toLowerCase());
      } else if (pattern.type === "regex") {
        try {
          const regex = new RegExp(pattern.value, "i");
          return regex.test(message);
        } catch {
          return false;
        }
      } else if (pattern.type === "starts_with") {
        return message.startsWith(pattern.value.toLowerCase());
      } else if (pattern.type === "ends_with") {
        return message.endsWith(pattern.value.toLowerCase());
      }
      return false;
    });
  }

  checkTimeBasedTrigger(config) {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    if (config.hours && !config.hours.includes(hour)) return false;
    if (config.days && !config.days.includes(day)) return false;

    return true;
  }

  async checkHeatThresholdTrigger(eventType, eventData, config) {
    if (eventType !== "messageCreate") return false;

    const heatScore = await db.getHeatScore(
      eventData.guild.id,
      eventData.user.id
    );
    return heatScore >= (config.threshold || 50);
  }

  async executeWorkflow(workflow, eventData) {
    const { actions, guild_id } = workflow;
    const guild = this.client.guilds.cache.get(guild_id);

    if (!guild) return;

    // Update trigger count
    await db.updateWorkflow(workflow.id, {
      last_triggered: Date.now(),
      trigger_count: (workflow.trigger_count || 0) + 1,
    });

    for (const action of actions) {
      try {
        await this.executeAction(action, eventData, guild);
      } catch (error) {
        console.error(`Error executing workflow action ${action.type}:`, error);
      }
    }
  }

  async executeAction(action, eventData, guild) {
    const { type, config } = action;

    switch (type) {
      case "ban":
        if (eventData.user) {
          await Moderation.ban(
            guild,
            eventData.user,
            this.client.user,
            config.reason || "Workflow automation"
          );
        }
        break;

      case "kick":
        if (eventData.user) {
          await Moderation.kick(
            guild,
            eventData.user,
            this.client.user,
            config.reason || "Workflow automation"
          );
        }
        break;

      case "mute":
        if (eventData.user) {
          await Moderation.mute(
            guild,
            eventData.user,
            this.client.user,
            config.reason || "Workflow automation",
            config.duration || 3600000
          );
        }
        break;

      case "warn":
        if (eventData.user) {
          await Moderation.warn(
            guild,
            eventData.user,
            this.client.user,
            config.reason || "Workflow automation"
          );
        }
        break;

      case "add_role":
        if (eventData.member && config.role_id) {
          const role = guild.roles.cache.get(config.role_id);
          if (role) {
            await eventData.member.roles.add(role);
          }
        }
        break;

      case "remove_role":
        if (eventData.member && config.role_id) {
          const role = guild.roles.cache.get(config.role_id);
          if (role) {
            await eventData.member.roles.remove(role);
          }
        }
        break;

      case "send_message":
        if (config.channel_id) {
          const channel = guild.channels.cache.get(config.channel_id);
          if (channel) {
            await channel.send(config.message || "Workflow triggered");
          }
        }
        break;

      case "log":
        await db.addEnhancedLog(
          guild.id,
          "workflow",
          "automation",
          eventData.user?.id,
          this.client.user.id,
          "workflow_executed",
          `Workflow: ${action.workflow_name || "Unknown"}`,
          { action_type: type, config },
          "info"
        );
        break;

      case "quarantine":
        if (eventData.user) {
          // Quarantine by removing all roles and adding quarantine role
          const ErrorHandler = require("./errorHandler");
          const member = await ErrorHandler.safeExecute(
            guild.members.fetch(eventData.user.id),
            `workflows [${guild.id}]`,
            `Fetch member for quarantine action`
          );
          if (member) {
            const roles = member.roles.cache.filter(r => r.id !== guild.id);
            await ErrorHandler.safeExecute(
              member.roles.set([], config.reason || "Workflow automation"),
              `workflows [${guild.id}]`,
              `Quarantine: Clear roles for ${eventData.user.id}`
            );
            if (config.quarantine_role_id) {
              const quarantineRole = guild.roles.cache.get(config.quarantine_role_id);
              if (quarantineRole) {
                await ErrorHandler.safeExecute(
                  member.roles.add(quarantineRole),
                  `workflows [${guild.id}]`,
                  `Quarantine: Add role to ${eventData.user.id}`
                );
              }
            }
          }
        }
        break;

      default:
        console.warn(`Unknown workflow action type: ${type}`);
    }
  }
}

module.exports = WorkflowEngine;
