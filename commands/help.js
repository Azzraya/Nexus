const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show bot commands and features")
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("Category to view")
        .setRequired(false)
        .addChoices(
          { name: "Moderation", value: "moderation" },
          { name: "Security", value: "security" },
          { name: "Utility", value: "utility" },
          { name: "Fun", value: "fun" }
        )
    ),

  async execute(interaction) {
    const category = interaction.options.getString("category");
    const commandsPath = path.join(__dirname);
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith(".js") && file !== "help.js");

    // Categorize commands
    const categories = {
      moderation: [
        "ban",
        "kick",
        "mute",
        "warn",
        "warnings",
        "clearwarnings",
        "timeout",
        "purge",
        "modlogs",
        "unban",
        "cases",
        "notes",
        "quarantine",
        "sanitize",
        "bulk",
      ],
      security: [
        "antiraid",
        "joinraid",
        "joingate",
        "heat",
        "lockdown",
        "lock",
        "security",
        "verify",
        "scan",
        "alert",
        "predict",
        "autotune",
        "rescue",
        "smartban",
        "recommend",
        "notify",
        "threatnet",
        "recover",
      ],
      utility: [
        "config",
        "setup",
        "quicksetup",
        "welcome",
        "info",
        "botinfo",
        "serverinfo",
        "userinfo",
        "stats",
        "activity",
        "ticket",
        "backup",
        "performance",
        "shardinfo",
        "slowmode",
        "voice",
        "role",
        "ping",
        "dashboard",
        "analytics",
        "search",
        "workflow",
        "logs",
        "vote",
        "report",
        "roletemplate",
        "schedule",
        "autoresponder",
        "unlock",
        "queue",
        "behavior",
        "invite",
        "support",
        "troubleshoot",
      ],
      fun: [
        "level",
        "xp",
        "leaderboard",
        "giveaway",
        "reactionrole",
        "customcommand",
        "autorole",
        "poll",
        "suggest",
        "achievements",
      ],
    };

    const embed = new EmbedBuilder()
      .setTitle("🛡️ Nexus Bot - Advanced Protection")
      .setDescription(
        "Everything Wick does, plus AI, plus better UX, plus it's free and open source"
      )
      .setColor(0x0099ff)
      .setFooter({
        text: "Nexus - Beyond Wick. Free. Open Source. Powerful.",
      })
      .setTimestamp();

    if (category) {
      // Show specific category
      const categoryNames = {
        moderation: "🔨 Moderation Commands",
        security: "🛡️ Security Commands",
        utility: "⚙️ Utility Commands",
        fun: "🎉 Fun & Features",
      };

      const categoryCommands = categories[category] || [];
      const commandList = [];

      for (const file of commandFiles) {
        const commandName = file.replace(".js", "");
        if (categoryCommands.includes(commandName)) {
          try {
            const command = require(`./${file}`);
            if (command.data) {
              commandList.push(
                `\`/${command.data.name}\` - ${command.data.description}`
              );
            }
          } catch (error) {
            // Skip if command can't be loaded
          }
        }
      }

      if (commandList.length > 0) {
        embed
          .setTitle(categoryNames[category])
          .setDescription(commandList.join("\n"));
      } else {
        embed.setDescription("No commands found in this category.");
      }
    } else {
      // Show all commands grouped by category
      const allCommands = [];

      for (const [cat, commandNames] of Object.entries(categories)) {
        const catCommands = [];
        for (const file of commandFiles) {
          const commandName = file.replace(".js", "");
          if (commandNames.includes(commandName)) {
            try {
              const command = require(`./${file}`);
              const ErrorMessages = require("../utils/errorMessages");
              if (command.data) {
                catCommands.push(`\`/${command.data.name}\``);
              }
            } catch (error) {
              // Skip if command can't be loaded
            }
          }
        }
        if (catCommands.length > 0) {
          const categoryNames = {
            moderation: "🔨 Moderation",
            security: "🛡️ Security",
            utility: "⚙️ Utility",
            fun: "🎉 Fun & Features",
          };
          allCommands.push({
            name: categoryNames[cat],
            value: catCommands.join(", "),
            inline: false,
          });
        }
      }

      embed
        .setDescription(
          "Use `/help [category]` to see detailed descriptions.\n\n**Quick Links:**\n🔨 `/help moderation` | 🛡️ `/help security`\n⚙️ `/help utility` | 🎉 `/help fun`"
        )
        .addFields(allCommands);

      embed.addFields({
        name: "🌟 Key Features",
        value:
          "• Multi-algorithm anti-raid\n• Predictive security\n• Heat-based moderation\n• Auto-moderation\n• Real-time threat detection\n• Cross-server intelligence\n• Intelligent auto-tuning",
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
