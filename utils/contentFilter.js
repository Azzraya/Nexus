const logger = require("./logger");

class ContentFilter {
  constructor() {
    // Offensive terms list (add more as needed)
    this.offensiveTerms = [
      // Racial slurs
      "nigga",
      "nigger",
      "chink",
      "spic",
      "kike",
      "faggot",
      "tranny",
      "retard",
      // Nazi/hate symbols
      "nazi",
      "hitler",
      "holocaust",
      "swastika",
      "white power",
      "kkk",
      // Extreme violence
      "concentration camp",
      "genocide",
      "ethnic cleansing",
      // NSFW/inappropriate
      "porn",
      "hentai",
      "r34",
      "nsfw",
      "sex",
      "rape",
    ];

    // Compile regex patterns for efficient matching
    this.offensivePatterns = this.offensiveTerms.map(
      (term) => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
    );
  }

  /**
   * Check if text contains offensive content
   * @param {string} text - Text to check
   * @returns {boolean} - True if offensive content detected
   */
  isOffensive(text) {
    if (!text || typeof text !== "string") return false;

    const lowerText = text.toLowerCase();
    return this.offensivePatterns.some((pattern) => pattern.test(lowerText));
  }

  /**
   * Sanitize text by replacing offensive content with [REDACTED]
   * @param {string} text - Text to sanitize
   * @returns {string} - Sanitized text
   */
  sanitize(text) {
    if (!text || typeof text !== "string") return text;

    let sanitized = text;
    this.offensivePatterns.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    });
    return sanitized;
  }

  /**
   * Check if guild should be auto-rejected
   * @param {Guild} guild - Discord guild object
   * @returns {Object} - {shouldLeave: boolean, reason: string, sanitizedName: string}
   */
  checkGuild(guild) {
    const guildName = guild.name || "";
    const isOffensive = this.isOffensive(guildName);

    return {
      shouldLeave: isOffensive,
      reason: isOffensive ? "Offensive server name detected" : null,
      sanitizedName: this.sanitize(guildName),
    };
  }

  /**
   * Auto-leave guild if offensive
   * @param {Guild} guild - Discord guild object
   * @returns {Promise<boolean>} - True if left, false if stayed
   */
  async autoModerateGuild(guild) {
    const check = this.checkGuild(guild);

    if (check.shouldLeave) {
      logger.warn(
        "ContentFilter",
        `🚫 Auto-leaving offensive server: ${check.sanitizedName} (${guild.id})`
      );

      try {
        // Leave the guild
        await guild.leave();

        // Log to database if available
        try {
          const db = require("./database");
          await db.run(
            `INSERT INTO bot_activity_log (event_type, guild_id, guild_name, timestamp, details) 
             VALUES (?, ?, ?, ?, ?)`,
            [
              "auto_leave_offensive",
              guild.id,
              check.sanitizedName,
              Date.now(),
              JSON.stringify({ reason: check.reason }),
            ]
          );
        } catch (dbErr) {
          logger.error("ContentFilter", "Failed to log auto-leave", dbErr);
        }

        // Alert owner
        try {
          const client = guild.client;
          if (process.env.OWNER_ID) {
            const owner = await client.users.fetch(process.env.OWNER_ID);
            await owner.send({
              embeds: [
                {
                  title: "🚫 Auto-Left Offensive Server",
                  description: `The bot automatically left a server with offensive content.`,
                  color: 0xef4444,
                  fields: [
                    {
                      name: "Server Name (Sanitized)",
                      value: `\`${check.sanitizedName}\``,
                      inline: true,
                    },
                    {
                      name: "Server ID",
                      value: `\`${guild.id}\``,
                      inline: true,
                    },
                    {
                      name: "Reason",
                      value: check.reason,
                      inline: false,
                    },
                  ],
                  footer: {
                    text: "Content Filter System",
                  },
                  timestamp: new Date().toISOString(),
                },
              ],
            });
          }
        } catch (alertErr) {
          logger.error("ContentFilter", "Failed to alert owner", alertErr);
        }

        return true;
      } catch (error) {
        logger.error(
          "ContentFilter",
          `Failed to leave offensive server: ${check.sanitizedName}`,
          error
        );
        return false;
      }
    }

    return false;
  }
}

module.exports = new ContentFilter();
