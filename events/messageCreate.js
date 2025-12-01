const AutoMod = require("../utils/automod");
const db = require("../utils/database");

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    // Ignore bots
    if (message.author.bot) return;

    // Advanced anti-nuke: Monitor spam in newly created channels
    if (client.advancedAntiNuke && message.channel) {
      await client.advancedAntiNuke.monitorChannelMessage(
        message.channel,
        message.author.id
      );
    }

    // Update user stats
    await db.updateUserStats(
      message.guild.id,
      message.author.id,
      "messages_sent"
    );

    // Add XP for leveling (1-5 random XP per message)
    const Leveling = require("../utils/leveling");
    const xpGain = Math.floor(Math.random() * 5) + 1;
    const levelResult = await Leveling.addXP(
      message.guild.id,
      message.author.id,
      xpGain
    );

    // Send level up message if leveled up
    if (levelResult.leveledUp) {
      const config = await db.getServerConfig(message.guild.id);
      if (config && config.level_up_channel) {
        const levelChannel = message.guild.channels.cache.get(
          config.level_up_channel
        );
        if (levelChannel) {
          levelChannel.send({
            embeds: [
              Leveling.createLevelUpEmbed(
                message.author,
                levelResult.level,
                levelResult.xp
              ),
            ],
          });
        }
      }
    }

    // Check for custom commands
    if (message.content.startsWith("!")) {
      const commandName = message.content.slice(1).split(" ")[0].toLowerCase();
      const customCommand = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM custom_commands WHERE guild_id = ? AND command_name = ?",
          [message.guild.id, commandName],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (customCommand) {
        let response = customCommand.response;

        // Replace variables
        response = response
          .replace(/{user}/g, `<@${message.author.id}>`)
          .replace(/{user\.tag}/g, message.author.tag)
          .replace(/{user\.id}/g, message.author.id)
          .replace(/{guild}/g, message.guild.name)
          .replace(
            /{member}/g,
            message.member?.displayName || message.author.username
          )
          .replace(/{channel}/g, `<#${message.channel.id}>`);

        if (customCommand.use_embed) {
          const { EmbedBuilder } = require("discord.js");
          const embed = new EmbedBuilder()
            .setDescription(response)
            .setColor(0x5865f2)
            .setTimestamp();
          await message.reply({ embeds: [embed] });
        } else {
          await message.reply(response);
        }
        return;
      }
    }

    // Check auto-responders
    const AutoResponder = require("../commands/autoresponder");
    await AutoResponder.checkAutoResponder(message);

    // Check auto-moderation
    await AutoMod.checkMessage(message, client);

    // Check for spam patterns
    const content = message.content.toLowerCase();
    const spamPatterns = [
      /(discord\.gg|discord\.com\/invite)\/\w+/g, // Invite links
      /(http|https):\/\/\S+/g, // URLs
      /@everyone|@here/g, // Mentions
    ];

    let spamScore = 0;
    for (const pattern of spamPatterns) {
      const matches = message.content.match(pattern);
      if (matches) spamScore += matches.length * 5;
    }

    // Check for repeated characters (spam)
    if (/(.)\1{10,}/.test(message.content)) {
      spamScore += 20;
    }

    // Check message length
    if (message.content.length > 2000) {
      spamScore += 15;
    }

    // Check for rapid messages
    const userKey = `${message.guild.id}-${message.author.id}`;
    const userData = client.heatSystem.get(userKey) || {
      lastMessage: 0,
      messageCount: 0,
    };
    const timeSinceLastMessage = Date.now() - userData.lastMessage;

    if (timeSinceLastMessage < 1000) {
      spamScore += 10;
    }

    if (spamScore > 0) {
      const heatResult = await client.addHeat(
        message.guild.id,
        message.author.id,
        spamScore,
        "Spam detection"
      );

      if (heatResult.action) {
        // Auto-moderate based on heat
        if (heatResult.action === "warn") {
          message.reply(
            "⚠️ Warning: Your message was flagged. Please follow server rules."
          );
        } else if (heatResult.action === "mute") {
          const ErrorHandler = require("../utils/errorHandler");
          const constants = require("../utils/constants");
          await ErrorHandler.safeExecute(
            message.member.timeout(
              constants.TIME.MINUTE * 10,
              "Auto-mute: High heat score"
            ),
            `messageCreate [${message.guild.id}]`,
            `Auto-mute for heat score ${heatResult.score}`
          );
          await ErrorHandler.safeExecute(
            message.delete(),
            `messageCreate [${message.guild.id}]`,
            `Delete message after mute action`
          );
        } else if (heatResult.action === "kick") {
          const ErrorHandler = require("../utils/errorHandler");
          await ErrorHandler.safeExecute(
            message.member.kick("Auto-kick: Excessive spam"),
            `messageCreate [${message.guild.id}]`,
            `Auto-kick for heat score ${heatResult.score}`
          );
          await ErrorHandler.safeExecute(
            message.delete(),
            `messageCreate [${message.guild.id}]`,
            `Delete message after kick action`
          );
        } else if (heatResult.action === "ban") {
          const ErrorHandler = require("../utils/errorHandler");
          await ErrorHandler.safeExecute(
            message.member.ban({
              reason: "Auto-ban: Extreme spam",
              deleteMessageDays: 1,
            }),
            `messageCreate [${message.guild.id}]`,
            `Auto-ban for heat score ${heatResult.score}`
          );
        }
      }
    }

    // Update user data
    userData.lastMessage = Date.now();
    userData.messageCount++;
    client.heatSystem.set(userKey, userData);

    // Track behavior
    const BehavioralAnalysis = require("../utils/behavioralAnalysis");
    await BehavioralAnalysis.trackBehavior(
      message.guild.id,
      message.author.id,
      "message",
      {
        content: message.content,
        length: message.content.length,
        hasLinks: /https?:\/\//.test(message.content),
        hasMentions: /<@!?\d+>/.test(message.content),
      }
    );

    // Check workflows
    if (client.workflows) {
      await client.workflows.checkTriggers(message.guild.id, "messageCreate", {
        message,
        user: message.author,
        member: message.member,
        guild: message.guild,
      });
    }
  },
};
