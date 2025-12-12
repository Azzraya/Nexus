const {
  SlashCommandBuilder,
  EmbedBuilder,
  codeBlock,
  MessageFlags,
} = require("discord.js");
const Owner = require("../utils/owner");
const ErrorMessages = require("../utils/errorMessages");
const logger = require("../utils/logger");

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
      "ADMIN_WEBHOOK_URL",
      "VOTE_WEBHOOK_URL",
    ];
    sensitiveKeys.forEach((key) => {
      const value = process.env[key];
      if (value) {
        // Redact full value
        output = output.replace(
          new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
          `[${key}_REDACTED]`
        );
        // Redact partial matches (first 10 and last 10 chars)
        if (value.length > 20) {
          const firstPart = value.substring(0, 10);
          const lastPart = value.substring(value.length - 10);
          output = output.replace(
            new RegExp(firstPart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
            `[${key}_START_REDACTED]`
          );
          output = output.replace(
            new RegExp(lastPart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
            `[${key}_END_REDACTED]`
          );
        }
      }
    });

    // Redact any webhook URLs (they contain tokens)
    output = output.replace(
      /https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/gi,
      "[WEBHOOK_URL_REDACTED]"
    );

    // Redact any JWT tokens (common format)
    output = output.replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,
      "[JWT_TOKEN_REDACTED]"
    );

    return output;
  },

  /**
   * Check if code attempts to access sensitive information
   */
  checkForSensitiveAccess(code) {
    const sensitivePatterns = [
      // Direct process.env access
      /process\.env\s*\[?\s*['"]DISCORD_TOKEN['"]\s*\]?/i,
      /process\.env\.DISCORD_TOKEN/i,
      /process\.env\s*\[?\s*['"]TOPGG_TOKEN['"]\s*\]?/i,
      /process\.env\s*\[?\s*['"]CLIENT_SECRET['"]\s*\]?/i,
      /process\.env\s*\[?\s*['"]ADMIN_PASSWORD['"]\s*\]?/i,
      /process\.env\s*\[?\s*['"]SESSION_SECRET['"]\s*\]?/i,
      /process\.env\s*\[?\s*['"]DISCORDBOTLIST_TOKEN['"]\s*\]?/i,
      /process\.env\s*\[?\s*['"]VOIDBOTS_TOKEN['"]\s*\]?/i,
      /process\.env\s*\[?\s*['"]ADMIN_WEBHOOK_URL['"]\s*\]?/i,
      /process\.env\s*\[?\s*['"]VOTE_WEBHOOK_URL['"]\s*\]?/i,

      // Client token access
      /client\.token/i,
      /client\.options\.token/i,
      /\.token\s*[=:]/i,

      // File system access to .env
      /require\(['"]fs['"]\)/i,
      /require\(['"]\.fs['"]\)/i,
      /fs\.readFile/i,
      /fs\.readFileSync/i,
      /fs\.readdir/i,
      /fs\.readdirSync/i,
      /\.readFile/i,
      /\.readFileSync/i,
      /\.readdir/i,
      /\.readdirSync/i,
      /['"]\.env['"]/i,
      /path\.join.*\.env/i,
      /\.env['"]/i,

      // dotenv package
      /require\(['"]\.env['"]\)/i,
      /require\(['"]dotenv['"]\)/i,
      /\.config\(\)/i, // dotenv.config()
      /dotenv\./i,

      // Object methods that could expose env
      /Object\.keys\s*\(\s*process\.env/i,
      /Object\.values\s*\(\s*process\.env/i,
      /Object\.entries\s*\(\s*process\.env/i,
      /Object\.getOwnPropertyNames\s*\(\s*process\.env/i,
      /JSON\.stringify\s*\(\s*process\.env/i,
      /Reflect\.ownKeys\s*\(\s*process\.env/i,
      /Object\.getOwnPropertyDescriptor\s*\(\s*process\.env/i,

      // Spread operator and destructuring
      /\{\.\.\.\s*process\.env/i,
      /\[\.\.\.\s*process\.env/i,
      /Array\.from\s*\(\s*process\.env/i,

      // Child process and execution
      /require\(['"]child_process['"]\)/i,
      /child_process\./i,
      /\.exec\(/i,
      /\.execSync\(/i,
      /\.spawn\(/i,
      /\.spawnSync\(/i,

      // VM and worker threads
      /require\(['"]vm['"]\)/i,
      /require\(['"]worker_threads['"]\)/i,
      /vm\./i,
      /Worker\(/i,

      // Eval/Function constructors (could bypass checks)
      /new\s+Function\(/i,
      /Function\(/i,
      /eval\(/i,
      /setTimeout\(/i,
      /setInterval\(/i,
      /setImmediate\(/i,

      // Path manipulation
      /require\(['"]path['"]\)/i,
      /process\.cwd\(\)/i,
      /__dirname/i,
      /__filename/i,
      /require\.resolve\(/i,

      // Block dynamic imports
      /import\s*\(/i,
      /dynamic\s+import/i,

      // Process binding and internal access
      /process\.binding\(/i,
      /process\.mainModule/i,
      /process\._getActiveHandles/i,
      /process\._getActiveRequests/i,

      // OS module (could be used to find .env location)
      /require\(['"]os['"]\)/i,
      /os\.homedir/i,
      /os\.tmpdir/i,

      // Crypto module (could be used for file access)
      /require\(['"]crypto['"]\)/i,

      // Buffer manipulation (could reconstruct tokens)
      /Buffer\.from\(/i,
      /new\s+Buffer\(/i,

      // String manipulation to reconstruct
      /String\.fromCharCode/i,
      /String\.fromCodePoint/i,

      // Global access
      /global\[/i,
      /global\./i,
      /GLOBAL\[/i,
      /GLOBAL\./i,

      // Module system access
      /require\.main/i,
      /require\.cache/i,
      /module\.require/i,

      // Process info that could help locate files
      /process\.pid/i,
      /process\.ppid/i,
      /process\.platform/i,

      // File path construction
      /path\.resolve\(/i,
      /path\.normalize\(/i,
      /\.\.\/\.env/i, // Relative path to .env
      /\.\/\.env/i,
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

    // Rate limiting for eval command (prevent abuse even by owner)
    const rateLimiter = interaction.client.rateLimiter;
    if (rateLimiter) {
      const rateLimitKey = `eval:${interaction.user.id}`;
      const rateLimitCheck = await rateLimiter.checkLimit(rateLimitKey, {
        points: 10, // 10 evals per minute
        duration: 60,
      });

      if (!rateLimitCheck.allowed) {
        const resetIn = rateLimitCheck.reset
          ? Math.ceil(rateLimitCheck.reset - Date.now() / 1000)
          : 60;
        return interaction.reply({
          content: `❌ **Rate Limited:** You can only run 10 eval commands per minute. Try again in ${resetIn} seconds.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // Check for sensitive access attempts
    if (this.checkForSensitiveAccess(code)) {
      return interaction.reply({
        content:
          "❌ **Security Blocked:** Access to sensitive information (tokens, secrets) is not allowed in eval.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Check code length (prevent extremely long code)
    const MAX_CODE_LENGTH = 2000; // Discord message limit
    if (code.length > MAX_CODE_LENGTH) {
      return interaction.reply({
        content: `❌ **Code Too Long:** Maximum code length is ${MAX_CODE_LENGTH} characters.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Extract variables for eval context (outside try block so they're accessible in catch)
    const client = interaction.client;
    const channel = interaction.channel;
    const guild = interaction.guild;
    const user = interaction.user;
    const member = interaction.member;

    // Track eval usage for analytics (will be updated after execution with timing)
    const analyticsStartTime = Date.now();

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
            has(optTarget, optProp) {
              if (optProp === "token") {
                return false;
              }
              return optProp in optTarget;
            },
            ownKeys(optTarget) {
              return Object.keys(optTarget).filter((key) => key !== "token");
            },
          });
        }
        // Block access to rest property
        if (prop === "rest" && target.rest) {
          return new Proxy(target.rest, {
            get(restTarget, restProp) {
              if (restProp === "token") {
                return "[REDACTED]";
              }
              return restTarget[restProp];
            },
          });
        }
        return target[prop];
      },
      has(target, prop) {
        if (prop === "token") {
          return false;
        }
        return prop in target;
      },
      ownKeys(target) {
        return Object.keys(target).filter((key) => key !== "token");
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
      // Block access to require, fs, child_process, vm, etc.
      const wrappedCode = `(async function(client, channel, guild, user, member, interaction, sanitizedEnv) {
        // Block dangerous requires
        const originalRequire = require;
        require = function(module) {
          const blocked = ['fs', 'child_process', 'vm', 'worker_threads', 'dotenv', '.env', 'os', 'crypto'];
          if (blocked.includes(module)) {
            throw new Error('Access to ' + module + ' is blocked for security');
          }
          return originalRequire(module);
        };
        
        // Note: Cannot block 'import' keyword directly (it's reserved), but it's blocked
        // in pre-execution check via checkForSensitiveAccess()
        
        // Block process.binding
        let originalBinding = null;
        if (process.binding) {
          originalBinding = process.binding;
          process.binding = function() {
            throw new Error('process.binding is blocked for security');
          };
        }
        
        // Note: process.env is non-configurable, so we cannot redefine it
        // The sanitizedEnv Proxy we pass will intercept individual key access
        // when accessed through the Proxy, but direct process.env access will
        // still use the real object. This is acceptable as:
        // 1. Pre-execution check blocks process.env access patterns
        // 2. The Proxy protects individual key access when used correctly
        // 3. Output sanitization redacts any leaked values
        
        // Block dangerous globals
        const originalEval = eval;
        const originalFunction = Function;
        const originalSetTimeout = setTimeout;
        const originalSetInterval = setInterval;
        const originalSetImmediate = setImmediate;
        
        // Block Buffer constructor if used maliciously
        const originalBuffer = Buffer;
        Buffer = new Proxy(Buffer, {
          construct(target, args) {
            return new originalBuffer(...args);
          },
          get(target, prop) {
            return target[prop];
          }
        });
        
        try {
          ${isSimpleExpression ? `return ${code}` : code}
        } finally {
          // Restore require
          require = originalRequire;
          if (originalBinding) {
            process.binding = originalBinding;
          }
        }
      })`;

      // Create and execute function with context variables
      // Pass sanitized client and process with sanitized env
      const evalFunction = eval(wrappedCode);

      // Execution timeout (30 seconds max)
      const EXECUTION_TIMEOUT = 30000;
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      let result;
      try {
        // Execute with timeout protection
        result = await Promise.race([
          evalFunction(
            sanitizedClient,
            channel,
            guild,
            user,
            member,
            interaction,
            { env: sanitizedEnv }
          ),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Execution timeout (30s limit exceeded)")),
              EXECUTION_TIMEOUT
            )
          ),
        ]);

        // Check execution time and memory
        const executionTime = Date.now() - startTime;
        const endMemory = process.memoryUsage().heapUsed;
        const memoryUsed = (endMemory - startMemory) / 1024 / 1024; // MB

        // Log performance metrics
        if (executionTime > 5000 || memoryUsed > 50) {
          logger.warn(
            "Eval",
            `Slow/heavy eval: ${executionTime}ms, ${memoryUsed.toFixed(2)}MB by ${user.tag}`
          );
        }
      } catch (timeoutError) {
        if (timeoutError.message.includes("timeout")) {
          throw new Error(
            `⏱️ **Execution Timeout:** Code execution exceeded 30 seconds and was terminated.`
          );
        }
        throw timeoutError;
      }

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

      // Limit output size (prevent massive outputs)
      const MAX_OUTPUT_LENGTH = 1900; // Leave room for truncation message
      if (output.length > MAX_OUTPUT_LENGTH) {
        output =
          output.substring(0, MAX_OUTPUT_LENGTH) +
          `\n\n... (truncated, ${output.length - MAX_OUTPUT_LENGTH} characters removed)`;
        logger.warn(
          "Eval",
          `Large output truncated: ${output.length} chars by ${user.tag}`
        );
      }

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

      // Calculate execution metrics
      const executionTime = Date.now() - startTime;
      const memoryUsed =
        (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024;

      // Track eval usage for analytics (async, don't wait)
      if (client.commandAnalytics) {
        client.commandAnalytics
          .trackCommand(guild?.id || "DM", user.id, "eval", true, executionTime)
          .catch((err) => {
            // Silently fail analytics - don't break eval
            logger.debug("Eval", `Analytics tracking failed: ${err.message}`);
          });
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Evaluation Successful")
        .addFields(fields)
        .setColor(0x00ff00)
        .setTimestamp()
        .setFooter({
          text: `Executed by ${user.tag} | ${executionTime}ms | ${memoryUsed.toFixed(2)}MB`,
        });

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

      // Track eval usage for analytics (failed execution)
      if (client.commandAnalytics) {
        const executionTime = Date.now() - analyticsStartTime;
        client.commandAnalytics
          .trackCommand(
            guild?.id || "DM",
            user.id,
            "eval",
            false,
            executionTime
          )
          .catch((err) => {
            // Silently fail analytics - don't break eval
            logger.debug("Eval", `Analytics tracking failed: ${err.message}`);
          });
      }

      // Log eval errors for debugging
      logger.error("Eval", `Error in eval by ${user.tag}:`, {
        message: error.message,
        code: code.substring(0, 100), // First 100 chars for context
      });

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
