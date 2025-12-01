const AutoMod = require("../utils/automod");
const db = require("../utils/database");
const logger = require("../utils/logger");

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    // Ignore bots
    if (message.author.bot) return;

    // Run security checks in parallel for better performance (EXCEEDS WICK)
    const securityChecks = [];
    if (client.advancedAntiNuke && message.channel) {
      securityChecks.push(
        client.advancedAntiNuke
          .monitorChannelMessage(message.channel, message.author.id)
          .catch(() => {})
      );
      securityChecks.push(
        client.advancedAntiNuke
          .monitorEmojiSpam(message, message.author.id)
          .catch(() => {})
      );
    }

    // Run security checks and stats update in parallel
    await Promise.all([
      ...securityChecks,
      db
        .updateUserStats(message.guild.id, message.author.id, "messages_sent")
        .catch(() => {}),
    ]);

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

    // Advanced Heat System
    if (
      client.heatSystem &&
      typeof client.heatSystem.calculateHeat === "function"
    ) {
      try {
        // Get server config for heat system
        const config = await db.getServerConfig(message.guild.id);
        const heatConfig = {
          heatThreshold: config?.heat_threshold || 100,
          heatCap: config?.heat_cap || 150,
          firstTimeoutDuration: config?.first_timeout_duration || 86400000, // 1 day
          capTimeoutDuration: config?.cap_timeout_duration || 1209600000, // 14 days
          panicModeRaiders: config?.panic_mode_raiders || 3,
          panicModeDuration: config?.panic_mode_duration || 600000, // 10 minutes
          panicTimeoutDuration: config?.panic_timeout_duration || 600000, // 10 minutes
          pingRaidThreshold: config?.ping_raid_threshold || 50,
          pingRaidTimeWindow: config?.ping_raid_time_window || 30000, // 30 seconds
          blacklistedWords: config?.blacklisted_words
            ? JSON.parse(config.blacklisted_words)
            : [],
          blacklistedLinks: config?.blacklisted_links
            ? JSON.parse(config.blacklisted_links)
            : [],
        };

        // Calculate heat for this message
        const heatAmount = client.heatSystem.calculateHeat(message, heatConfig);

        if (heatAmount > 0) {
          // Add heat to user
          const heatScore = await client.heatSystem.addHeat(
            message.guild.id,
            message.author.id,
            heatAmount,
            "Message heat calculation"
          );

          // Check for ping raid (mentions)
          const mentionCount =
            message.mentions.users.size + message.mentions.roles.size;
          if (mentionCount > 0) {
            await client.heatSystem.checkPingRaid(
              message.guild.id,
              message.author.id,
              mentionCount,
              heatConfig
            );
          }

          // Check if punishment is needed
          const punishment = await client.heatSystem.checkPunishment(
            message.guild.id,
            message.author.id,
            heatScore,
            heatConfig
          );

          if (punishment) {
            const ErrorHandler = require("../utils/errorHandler");
            const member = await message.guild.members
              .fetch(message.author.id)
              .catch(() => null);

            if (member && punishment.action === "timeout") {
              // Apply timeout with multiplier
              await ErrorHandler.safeExecute(
                member.timeout(punishment.duration, punishment.reason),
                `messageCreate [${message.guild.id}]`,
                `Timeout for heat score ${heatScore} (duration: ${punishment.duration}ms)`
              );

              // Delete message if needed
              if (punishment.purgeMessages) {
                await ErrorHandler.safeExecute(
                  message.delete(),
                  `messageCreate [${message.guild.id}]`,
                  `Delete message after timeout (cap reached)`
                );
              }

              // Mark as raider if in panic mode
              if (client.heatSystem.heatPanicMode.has(message.guild.id)) {
                client.heatSystem.markRaider(
                  message.guild.id,
                  message.author.id
                );
              }

              // Increase multiplier for next violation
              client.heatSystem.increaseTimeoutMultiplier(
                message.guild.id,
                message.author.id
              );
            }
          }

          // Check for heat panic mode trigger (multiple raiders)
          // This would need to track raiders across multiple users
          // For now, we'll trigger it if a single user reaches cap multiple times
          if (heatScore >= heatConfig.heatCap) {
            // Check if we should trigger panic mode
            const raiderCount = Array.from(
              client.heatSystem.raiderDetection.values()
            ).filter((r) => r.guildId === message.guild.id).length;

            if (raiderCount >= heatConfig.panicModeRaiders) {
              client.heatSystem.triggerHeatPanicMode(
                message.guild.id,
                raiderCount,
                heatConfig
              );
            }
          }
        }
      } catch (error) {
        logger.error(`[HeatSystem] Error processing message heat:`, error);
      }
    }

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
