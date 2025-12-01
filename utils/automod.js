const db = require("./database");
const logger = require("./logger");

class AutoMod {
  static async checkMessage(message, client) {
    if (message.author.bot) return false;

    // Skip automod for server owner
    if (message.guild && message.guild.ownerId === message.author.id) return false;

    const config = await db.getServerConfig(message.guild.id);
    if (!config || !config.auto_mod_enabled) return false;

    const rules = await this.getRules(message.guild.id);
    let actionTaken = false;

    for (const rule of rules) {
      if (!rule.enabled) continue;

      const triggered = await this.checkRule(message, rule);
      if (triggered) {
        actionTaken = await this.executeAction(message, rule, client);
        if (actionTaken) break;
      }
    }

    return actionTaken;
  }

  static async getRules(guildId) {
    return new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM automod_rules WHERE guild_id = ? AND enabled = 1",
        [guildId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  static async checkRule(message, rule) {
    const content = message.content.toLowerCase();
    const trigger = rule.trigger.toLowerCase();

    switch (rule.rule_type) {
      case "contains":
        return content.includes(trigger);
      case "starts_with":
        return content.startsWith(trigger);
      case "ends_with":
        return content.endsWith(trigger);
      case "regex":
        try {
          return new RegExp(trigger, "i").test(message.content);
        } catch {
          return false;
        }
      case "invite_link":
        return /(discord\.gg|discord\.com\/invite)\/\w+/i.test(message.content);
      case "spam":
        return this.detectSpam(message);
      case "caps":
        const capsRatio =
          (message.content.match(/[A-Z]/g) || []).length /
          message.content.length;
        return message.content.length > 10 && capsRatio > 0.7;
      case "mentions":
        return message.mentions.users.size > 5;
      default:
        return false;
    }
  }

  static detectSpam(message) {
    // Check for repeated characters
    if (/(.)\1{10,}/.test(message.content)) return true;

    // Check for rapid messages (would need message history tracking)
    // This is a simplified version
    return false;
  }

  static async executeAction(message, rule, client) {
    const action = rule.action.toLowerCase();

    try {
      switch (action) {
        case "delete":
          await message.delete();
          return true;
        case "warn":
          await message.delete();
          await message.channel.send(
            `⚠️ ${message.author}, your message was removed for violating server rules.`
          );
          return true;
        case "mute":
          await message.delete();
          const member = await message.guild.members.fetch(message.author.id);
          await member.timeout(600000, "Auto-moderation: Rule violation");
          return true;
        case "kick":
          const kickMember = await message.guild.members.fetch(
            message.author.id
          );
          await kickMember.kick("Auto-moderation: Rule violation");
          return true;
        case "ban":
          const banMember = await message.guild.members.fetch(
            message.author.id
          );
          await banMember.ban({
            reason: "Auto-moderation: Rule violation",
            deleteMessageDays: 1,
          });
          return true;
        default:
          return false;
      }
    } catch (error) {
      logger.error(`Auto-mod action failed: ${error.message}`);
      return false;
    }
  }

  static async addRule(guildId, ruleType, trigger, action) {
    return new Promise((resolve, reject) => {
      db.db.run(
        "INSERT INTO automod_rules (guild_id, rule_type, trigger, action) VALUES (?, ?, ?, ?)",
        [guildId, ruleType, trigger, action],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  static async removeRule(ruleId) {
    return new Promise((resolve, reject) => {
      db.db.run("DELETE FROM automod_rules WHERE id = ?", [ruleId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

module.exports = AutoMod;
