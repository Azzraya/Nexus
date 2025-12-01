const {
  SlashCommandBuilder,
  EmbedBuilder,
  codeBlock,
  MessageFlags,
} = require("discord.js");
const Owner = require("../utils/owner");

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
    if (maxChars === undefined) maxChars = constants.DISCORD.EMBED_FIELD_VALUE_SAFE;
    if (typeof text !== "string") text = String(text);
    if (text.length > maxChars) {
      return text.substring(0, maxChars) + "... (truncated)";
    }
    return text;
  },

  async execute(interaction) {
    // Owner check
    if (!Owner.isOwner(interaction.user.id)) {
      return interaction.reply({
        content: "❌ Only the bot owner can use this command!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const code = interaction.options.getString("code");
    const silent = interaction.options.getBoolean("silent") ?? false;

    // Extract variables for eval context (outside try block so they're accessible in catch)
    const client = interaction.client;
    const channel = interaction.channel;
    const guild = interaction.guild;
    const user = interaction.user;
    const member = interaction.member;

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
      const wrappedCode = `(async function(client, channel, guild, user, member, interaction) {
        ${isSimpleExpression ? `return ${code}` : code}
      })`;

      // Create and execute function with context variables
      const evalFunction = eval(wrappedCode);
      let result = await evalFunction(
        client,
        channel,
        guild,
        user,
        member,
        interaction
      );

      // Convert result to string, handling circular references and depth limits
      const constants = require("../utils/constants");
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
