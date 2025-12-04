/**
 * Standardized Error Messages
 * Consistent, helpful, and user-friendly
 */

const { EmbedBuilder } = require("discord.js");

class ErrorMessages {
  // Permission errors
  static noPermission(permission) {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Missing Permission")
          .setDescription(
            `You need the **${permission}** permission to use this command.`
          )
          .setColor(0xff4444)
          .setFooter({
            text: "Ask a server admin for help!",
          }),
      ],
      ephemeral: true,
    };
  }

  static botNoPermission(permission) {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Bot Missing Permission")
          .setDescription(
            `I need the **${permission}** permission to do that.\n\n` +
              `Please give me this permission and try again!`
          )
          .setColor(0xff4444)
          .addFields({
            name: "🔧 How to Fix",
            value:
              "Go to Server Settings → Roles → Find my role → Enable the permission",
          })
          .setFooter({
            text: "Need help? Run /support",
          }),
      ],
      ephemeral: true,
    };
  }

  // User errors
  static userNotFound() {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ User Not Found")
          .setDescription(
            "I couldn't find that user. Make sure:\n" +
              "• They're in this server\n" +
              "• You mentioned them correctly\n" +
              "• The ID is valid"
          )
          .setColor(0xff4444),
      ],
      ephemeral: true,
    };
  }

  static cannotTargetSelf() {
    return {
      content: "❌ You can't use this command on yourself! 😅",
      ephemeral: true,
    };
  }

  static cannotTargetBot() {
    return {
      content:
        "❌ Nice try, but you can't use that on me! 🤖\n\n*I'm protected from shenanigans.*",
      ephemeral: true,
    };
  }

  static cannotTargetOwner() {
    return {
      content: "❌ You can't target the server owner! They're untouchable. 👑",
      ephemeral: true,
    };
  }

  static targetHigherRole(action = "target") {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Role Hierarchy Issue")
          .setDescription(
            `You can't ${action} someone with a higher role than you!\n\n` +
              `**Discord's role hierarchy prevents this.**`
          )
          .setColor(0xff4444)
          .addFields({
            name: "💡 Why?",
            value:
              "This prevents abuse. Lower-ranked mods can't moderate higher-ranked ones.",
          }),
      ],
      ephemeral: true,
    };
  }

  static botTargetHigherRole(action = "target") {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ I Can't Do That")
          .setDescription(
            `I can't ${action} someone with a higher role than me!\n\n` +
              `**Move my role higher in Server Settings → Roles**`
          )
          .setColor(0xff4444)
          .addFields({
            name: "🔧 How to Fix",
            value:
              "Drag my role above the target user's highest role in the role list.",
          }),
      ],
      ephemeral: true,
    };
  }

  // Input errors
  static invalidInput(field, expected) {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Invalid Input")
          .setDescription(
            `The **${field}** you provided is invalid.\n\n` +
              `Expected: ${expected}`
          )
          .setColor(0xff4444),
      ],
      ephemeral: true,
    };
  }

  static missingArgument(argument) {
    return {
      content: `❌ Missing required argument: **${argument}**\n\nCheck the command options and try again!`,
      ephemeral: true,
    };
  }

  // Feature errors
  static featureNotEnabled(feature) {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Feature Not Enabled")
          .setDescription(
            `**${feature}** is not enabled in this server.\n\n` +
              `Enable it with \`/config\` or ask an admin!`
          )
          .setColor(0xffa500),
      ],
      ephemeral: true,
    };
  }

  static featureNotSetup(feature, setupCommand) {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Not Set Up Yet")
          .setDescription(
            `**${feature}** hasn't been set up in this server.\n\n` +
              `Run \`${setupCommand}\` to get started!`
          )
          .setColor(0xffa500)
          .addFields({
            name: "📚 Need Help?",
            value: "Check `/help` or visit our docs!",
          }),
      ],
      ephemeral: true,
    };
  }

  // Database errors
  static databaseError() {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Database Error")
          .setDescription(
            "Something went wrong with the database.\n\n" +
              "This has been logged. Please try again in a moment!"
          )
          .setColor(0xff4444)
          .setFooter({
            text: "If this persists, contact support!",
          }),
      ],
      ephemeral: true,
    };
  }

  // Rate limit errors
  static rateLimited(retryAfter) {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle("⏰ Slow Down!")
          .setDescription(
            `You're using commands too fast!\n\n` +
              `Try again in **${retryAfter} seconds**.`
          )
          .setColor(0xffa500)
          .setFooter({
            text: "Cooldowns prevent spam and protect the bot!",
          }),
      ],
      ephemeral: true,
    };
  }

  // Generic errors
  static genericError(details = null) {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Something Went Wrong")
          .setDescription(
            "An unexpected error occurred.\n\n" +
              (details ? `**Details:** ${details}\n\n` : "") +
              "This has been logged. Please try again!"
          )
          .setColor(0xff4444)
          .setFooter({
            text: "If this keeps happening, contact support!",
          }),
      ],
      ephemeral: true,
    };
  }

  static commandFailed(reason = "unknown") {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Command Failed")
          .setDescription(
            `The command couldn't be executed.\n\n` + `**Reason:** ${reason}`
          )
          .setColor(0xff4444)
          .addFields({
            name: "💡 What to try:",
            value:
              "• Check if the bot has permissions\n" +
              "• Verify command arguments\n" +
              "• Try again in a moment",
          }),
      ],
      ephemeral: true,
    };
  }

  // Success messages (for consistency)
  static success(title, description) {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle(`✅ ${title}`)
          .setDescription(description)
          .setColor(0x00ff00)
          .setTimestamp(),
      ],
    };
  }

  static successWithFields(title, description, fields) {
    const embed = new EmbedBuilder()
      .setTitle(`✅ ${title}`)
      .setDescription(description)
      .setColor(0x00ff00)
      .setTimestamp();

    if (fields && fields.length > 0) {
      embed.addFields(fields);
    }

    return { embeds: [embed] };
  }

  // Info messages
  static info(title, description, color = 0x3498db) {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle(`ℹ️ ${title}`)
          .setDescription(description)
          .setColor(color)
          .setTimestamp(),
      ],
    };
  }

  // Warning messages
  static warning(title, description) {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle(`⚠️ ${title}`)
          .setDescription(description)
          .setColor(0xffa500)
          .setTimestamp(),
      ],
    };
  }

  // DM required
  static requiresDM() {
    return {
      content:
        "❌ This command only works in DMs!\n\nSend me a DM and try again. 📬",
      ephemeral: true,
    };
  }

  // Guild required
  static requiresGuild() {
    return {
      content:
        "❌ This command only works in servers!\n\nRun it in a server where I'm present. 🏠",
      ephemeral: true,
    };
  }

  // Owner only
  static ownerOnly() {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Owner Only")
          .setDescription(
            "This command is restricted to the bot owner.\n\n" +
              "*It's for maintenance and administrative tasks.*"
          )
          .setColor(0xff4444)
          .setFooter({
            text: "Looking for admin commands? Try /help admin",
          }),
      ],
      ephemeral: true,
    };
  }

  // Cooldown message
  static onCooldown(command, timeLeft) {
    const seconds = (timeLeft / 1000).toFixed(1);
    return {
      content: `⏰ **Cooldown Active**\n\n\`/${command}\` is on cooldown. Try again in **${seconds}s**.\n\n*Cooldowns prevent spam and keep the bot responsive for everyone!*`,
      ephemeral: true,
    };
  }
}

module.exports = ErrorMessages;
