const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("coffee")
    .setDescription("☕ Check if the developer needs coffee"),
  category: "fun",

  async execute(interaction) {
    const hour = new Date().getHours();

    let status, message, color;

    if (hour >= 0 && hour < 6) {
      status = "😴 Probably Sleeping";
      message =
        "The developer is likely asleep (or pulling an all-nighter fixing bugs). Either way, there's definitely cold coffee nearby.";
      color = 0x2c3e50;
    } else if (hour >= 6 && hour < 12) {
      status = "☕ CRITICAL COFFEE LEVELS";
      message =
        "Morning time = peak coffee consumption. The developer is probably on their 2nd cup while reviewing pull requests and panicking about server counts.";
      color = 0xd35400;
    } else if (hour >= 12 && hour < 18) {
      status = "💻 Caffeinated & Coding";
      message =
        "Afternoon coding session in progress. Coffee mug is within arm's reach at all times. Features are being shipped.";
      color = 0x16a085;
    } else {
      status = "🌙 Evening Coffee (Questionable Decision)";
      message =
        "Drinking coffee at this hour? Bold move. The developer is either debugging a critical issue or making questionable life choices. Probably both.";
      color = 0x8e44ad;
    }

    const embed = new EmbedBuilder()
      .setTitle(status)
      .setDescription(message)
      .addFields({
        name: "☕ Fun Fact",
        value:
          "This bot was built on a diet of coffee, energy drinks, and the pure rage of paying for premium Discord bots. Mostly coffee though.",
      })
      .setColor(color)
      .setFooter({
        text: "This command serves no practical purpose. But you used it anyway. 👀",
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
