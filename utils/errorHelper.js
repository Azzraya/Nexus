const logger = require("./logger");

class ErrorHelper {
  /**
   * Get user-friendly error message with solution
   */
  static getErrorMessage(error, context = {}) {
    const errorCode = error.code || error.status || error.name;
    const commandName = context.commandName || "command";
    const userId = context.userId;
    const guildId = context.guildId;

    // Discord API errors
    if (errorCode === 50001) {
      return {
        message: "❌ Missing permissions to execute this command.",
        solution: "Make sure the bot has the required permissions. Use `/help` to see required permissions.",
        help: "Check bot permissions in Server Settings > Roles > Nexus Bot",
      };
    }

    if (errorCode === 50013) {
      return {
        message: "❌ Missing required permissions.",
        solution: "The bot needs additional permissions. Check Server Settings > Roles.",
        help: "Common missing permissions: Manage Messages, Ban Members, Manage Roles",
      };
    }

    if (errorCode === 429 || error.status === 429) {
      return {
        message: "⏳ Rate limited. Please try again in a moment.",
        solution: "You're sending commands too quickly. Wait a few seconds and try again.",
        help: "Rate limits reset after a short cooldown period.",
      };
    }

    if (errorCode === 10008) {
      return {
        message: "❌ Message not found.",
        solution: "The message you're trying to interact with may have been deleted.",
        help: "Try the command again with a different message.",
      };
    }

    if (errorCode === 10003) {
      return {
        message: "❌ Channel not found.",
        solution: "The channel may have been deleted or you don't have access.",
        help: "Check that the channel exists and you have permission to view it.",
      };
    }

    // Database errors
    if (error.message?.includes("SQLITE") || error.message?.includes("database")) {
      return {
        message: "❌ Database error occurred.",
        solution: "There was an issue accessing the database. This has been logged.",
        help: "If this persists, contact support with the error details.",
      };
    }

    // Network errors
    if (error.message?.includes("ECONNREFUSED") || error.message?.includes("timeout")) {
      return {
        message: "❌ Connection error.",
        solution: "Unable to connect to Discord's servers. Please try again in a moment.",
        help: "Check your internet connection and Discord's status.",
      };
    }

    // Generic error
    return {
      message: "❌ An error occurred while executing this command.",
      solution: "This error has been logged. Please try again, or contact support if it persists.",
      help: `Error: ${error.message || "Unknown error"}`,
    };
  }

  /**
   * Create troubleshooting embed
   */
  static createTroubleshootingEmbed(error, context) {
    const { EmbedBuilder } = require("discord.js");
    const errorInfo = this.getErrorMessage(error, context);

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Error Occurred")
      .setDescription(errorInfo.message)
      .addFields(
        {
          name: "💡 Solution",
          value: errorInfo.solution,
          inline: false,
        },
        {
          name: "🔧 Help",
          value: errorInfo.help,
          inline: false,
        }
      )
      .setColor(0xff0000)
      .setFooter({ text: "Need more help? Use /support or join our support server" })
      .setTimestamp();

    return embed;
  }

  /**
   * Log error with full context
   */
  static logError(error, context) {
    logger.error("Command execution error", {
      error: {
        message: error.message,
        code: error.code,
        status: error.status,
        stack: error.stack,
      },
      context: {
        command: context.commandName,
        userId: context.userId,
        guildId: context.guildId,
        channelId: context.channelId,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

module.exports = ErrorHelper;

