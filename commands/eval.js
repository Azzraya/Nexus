const {
  SlashCommandBuilder,
  EmbedBuilder,
  codeBlock,
  MessageFlags,
} = require("discord.js");
const Owner = require("../utils/owner");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("eval")
    .setDescription("Evaluate JavaScript code (OWNER ONLY)")
    .addStringOption((option) =>
      option
        .setName("code")
        .setDescription("The code to evaluate")
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName("silent")
        .setDescription("Only show output if there's an error")
        .setRequired(false)
    ),

  /**
   * Helper function to ensure field values don't exceed Discord's 1024 char limit
   * codeBlock adds "```js\n" and "\n```" = ~10 chars, so limit to 990 to be safe
   */
  ensureFieldLength(text, maxChars) {
    const constants = require("../utils/constants");
    if (maxChars === undefined)
      maxChars = constants.DISCORD.EMBED_FIELD_VALUE_SAFE;
    if (typeof text !== "string") text = String(text);
    if (text.length > maxChars) {
      return text.substring(0, maxChars) + "... (truncated)";
    }
    return text;
  },

  /**
   * Sanitize output to remove any potential token leaks
   */
  sanitizeOutput(output) {
    if (typeof output !== "string") {
      output = String(output);
    }

    // Get token from env (we'll redact it)
    const token = process.env.DISCORD_TOKEN;
    if (token) {
      // Redact the actual token
      output = output.replace(
        new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
        "[TOKEN_REDACTED]"
      );
      // Also redact partial matches (first/last parts)
      if (token.length > 10) {
        const firstPart = token.substring(0, 10);
        const lastPart = token.substring(token.length - 10);
        output = output.replace(
          new RegExp(firstPart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
          "[TOKEN_START_REDACTED]"
        );
        output = output.replace(
          new RegExp(lastPart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
          "[TOKEN_END_REDACTED]"
        );
      }
    }

    // Redact common token patterns (Discord bot tokens)
    output = output.replace(
      /[MN][A-Za-z\d]{23}\.[A-Za-z\d-_]{6}\.[A-Za-z\d-_]{27}/g,
      "[TOKEN_REDACTED]"
    );
    // Redact other sensitive env vars
    const sensitiveKeys = [
      "DISCORD_TOKEN",
      "TOPGG_TOKEN",
      "DISCORDBOTLIST_TOKEN",
      "VOIDBOTS_TOKEN",
      "CLIENT_SECRET",
      "ADMIN_PASSWORD",
      "SESSION_SECRET",
    ];
    sensitiveKeys.forEach((key) => {
      const value = process.env[key];
      if (value) {
        output = output.replace(
          new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
          `[${key}_REDACTED]`
        );
      }
    });

    return output;
  },

  /**
   * Check if code attempts to access sensitive information
   */
  checkForSensitiveAccess(code) {
    const sensitivePatterns = [
      /process\.env\s*\[?\s*['"]DISCORD_TOKEN['"]\s*\]?/i,
      /process\.env\.DISCORD_TOKEN/i,
      /client\.token/i,
      /\.token\s*[=:]/i,
      /process\.env\s*\[?\s*['"]TOPGG_TOKEN['"]\s*\]?/i,
      /process\.env\s*\[?\s*['"]CLIENT_SECRET['"]\s*\]?/i,
      /process\.env\s*\[?\s*['"]ADMIN_PASSWORD['"]\s*\]?/i,
      /require\(['"]\.env['"]\)/i,
      /require\(['"]dotenv['"]\)/i,
      /\.config\(\)/i, // dotenv.config()
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(code)) {
        return true;
      }
    }
    return false;
  },

  async execute(interaction) {
    // Owner check
    if (!Owner.isOwner(interaction.user.id)) {
      return interaction.reply(ErrorMessages.ownerOnly());
    }

    const code = interaction.options.getString("code");
    const silent = interaction.options.getBoolean("silent") ?? false;

    // Check for sensitive access attempts
    if (this.checkForSensitiveAccess(code)) {
      return interaction.reply({
        content:
          "❌ **Security Blocked:** Access to sensitive information (tokens, secrets) is not allowed in eval.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Extract variables for eval context (outside try block so they're accessible in catch)
    const client = interaction.client;
    const channel = interaction.channel;
    const guild = interaction.guild;
    const user = interaction.user;
    const member = interaction.member;

    // Create a sanitized process.env proxy that blocks sensitive keys
    const sanitizedEnv = new Proxy(process.env, {
      get(target, prop) {
        const sensitiveKeys = [
          "DISCORD_TOKEN",
          "TOPGG_TOKEN",
          "DISCORDBOTLIST_TOKEN",
          "VOIDBOTS_TOKEN",
          "CLIENT_SECRET",
          "ADMIN_PASSWORD",
          "SESSION_SECRET",
          "ADMIN_WEBHOOK_URL",
          "VOTE_WEBHOOK_URL",
        ];
        if (sensitiveKeys.includes(prop)) {
          return "[REDACTED]";
        }
        return target[prop];
      },
      has(target, prop) {
        return prop in target;
      },
      ownKeys(target) {
        return Object.keys(target).filter((key) => {
          const sensitiveKeys = [
            "DISCORD_TOKEN",
            "TOPGG_TOKEN",
            "DISCORDBOTLIST_TOKEN",
            "VOIDBOTS_TOKEN",
            "CLIENT_SECRET",
            "ADMIN_PASSWORD",
            "SESSION_SECRET",
            "ADMIN_WEBHOOK_URL",
            "VOTE_WEBHOOK_URL",
          ];
          return !sensitiveKeys.includes(key);
        });
      },
    });

    // Create a sanitized client object without token access
    const sanitizedClient = new Proxy(client, {
      get(target, prop) {
        if (prop === "token") {
          return "[REDACTED]";
        }
        // Block access to token through other means
        if (prop === "options" && target.options) {
          return new Proxy(target.options, {
            get(optTarget, optProp) {
              if (optProp === "token") {
                return "[REDACTED]";
              }
              return optTarget[optProp];
            },
          });
        }
        return target[prop];
      },
    });

    // Defer reply if not silent
    if (!silent) {
      await interaction.deferReply();
    }

    try {
      // Check if code is a simple expression (single line, no semicolons, no return, no declarations)
      const trimmedCode = code.trim();
      const isSimpleExpression =
        !trimmedCode.includes("\n") &&
        !trimmedCode.includes(";") &&
        !trimmedCode.match(
          /^\s*(if|for|while|switch|function|const|let|var|class|try|async|await|return)\s/
        ) &&
        !trimmedCode.includes("return ") &&
        trimmedCode.length > 0;

      // Wrap code in an async IIFE that provides all context variables
      // This allows the evaluated code to use: client, channel, guild, user, member, interaction
      // If it's a simple expression, automatically return it; otherwise execute as-is
      // Note: process.env is replaced with sanitizedEnv, client is replaced with sanitizedClient
      const wrappedCode = `(async function(client, channel, guild, user, member, interaction, process) {
        // Override process.env with sanitized version
        const originalEnv = process.env;
        process.env = arguments[6].env;
        try {
          ${isSimpleExpression ? `return ${code}` : code}
        } finally {
          process.env = originalEnv;
        }
      })`;

      // Create and execute function with context variables
      // Pass sanitized client and process with sanitized env
      const evalFunction = eval(wrappedCode);
      let result = await evalFunction(
        sanitizedClient,
        channel,
        guild,
        user,
        member,
        interaction,
        { env: sanitizedEnv }
      );

      // Convert result to string, handling circular references and depth limits
      const constants = require("../utils/constants");
      const ErrorMessages = require("../utils/errorMessages");
      let output =
        typeof result === "string"
          ? result
          : require("util").inspect(result, {
              depth: 2,
              maxArrayLength: constants.DATABASE.QUERY_LIMIT_DEFAULT,
              compact: false,
              breakLength: 60,
              showHidden: false,
            });

      // Sanitize output to remove any token leaks
      output = this.sanitizeOutput(output);

      // Limit output and code display lengths
      output = this.ensureFieldLength(output, 990);
      const codeDisplay = this.ensureFieldLength(code, 990);

      // Create field values with codeBlock - ensure they're strings and within limits
      let inputValue, outputValue, typeValue;
      try {
        inputValue = codeBlock("js", codeDisplay || "");
        outputValue = codeBlock("js", output || "");
        typeValue = codeBlock("js", typeof result || "undefined");
      } catch (err) {
        // If codeBlock fails, use plain strings
        inputValue = ensureFieldLength(codeDisplay || "", 990);
        outputValue = ensureFieldLength(output || "", 990);
        typeValue = typeof result || "undefined";
      }

      // Final safety check - Discord field value limit is 1024 characters
      const fields = [];
      if (inputValue && inputValue.length <= 1024) {
        fields.push({
          name: "📥 Input",
          value: inputValue,
          inline: false,
        });
      }
      if (outputValue && outputValue.length <= 1024) {
        fields.push({
          name: "📤 Output",
          value: outputValue,
          inline: false,
        });
      }
      if (typeValue && typeValue.length <= 1024) {
        fields.push({
          name: "📊 Type",
          value: typeValue,
          inline: true,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Evaluation Successful")
        .addFields(fields)
        .setColor(0x00ff00)
        .setTimestamp()
        .setFooter({ text: `Executed by ${user.tag}` });

      if (silent) {
        return interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
      } else {
        return interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      let errorOutput = error.toString();
      if (error.stack) {
        errorOutput = error.stack;
      }

      // Sanitize error output to remove any token leaks
      errorOutput = this.sanitizeOutput(errorOutput);

      // Limit error output and code display lengths
      errorOutput = this.ensureFieldLength(errorOutput, 990);
      const codeDisplay = this.ensureFieldLength(code, 990);

      // Create field values with codeBlock - ensure they're strings and within limits
      let inputValue, errorValue;
      try {
        inputValue = codeBlock("js", codeDisplay || "");
        errorValue = codeBlock("js", errorOutput || "");
      } catch (err) {
        // If codeBlock fails, use plain strings
        inputValue = ensureFieldLength(codeDisplay || "", 990);
        errorValue = ensureFieldLength(errorOutput || "", 990);
      }

      // Final safety check - Discord field value limit is 1024 characters
      const fields = [];
      if (inputValue && inputValue.length <= 1024) {
        fields.push({
          name: "📥 Input",
          value: inputValue,
          inline: false,
        });
      }
      if (errorValue && errorValue.length <= 1024) {
        fields.push({
          name: "❌ Error",
          value: errorValue,
          inline: false,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("❌ Evaluation Error")
        .addFields(fields)
        .setColor(0xff0000)
        .setTimestamp()
        .setFooter({ text: `Executed by ${user.tag}` });

      if (silent) {
        return interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
      } else {
        return interaction.editReply({ embeds: [embed] });
      }
    }
  },
};
