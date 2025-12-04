const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("inspire")
    .setDescription("✨ Get an inspirational quote (bot-related)"),
  category: "fun",

  async execute(interaction) {
    const quotes = [
      {
        quote:
          "A bot that crashes is just a bot that's learning how not to crash.",
        author: "Every Developer, 3am",
      },
      {
        quote:
          "99 bugs in the code, 99 bugs. Take one down, patch it around, 127 bugs in the code.",
        author: "Ancient Developer Proverb",
      },
      {
        quote:
          "The best Discord bot is a free Discord bot. The second best is one that actually works.",
        author: "Nexus Philosophy",
      },
      {
        quote: "Console.log() is not a debugging strategy. But here we are.",
        author: "Reality Check",
      },
      {
        quote:
          "If your bot runs for 24 hours without crashing, you're either very good or very lucky. Probably lucky.",
        author: "Murphy's Law of Bots",
      },
      {
        quote: "Open source: where 'trust me bro' becomes 'read the code bro'.",
        author: "GitHub Wisdom",
      },
      {
        quote:
          "They said I couldn't build a better bot than Wick. I said watch me make it free.",
        author: "Nexus Origin Story",
      },
      {
        quote:
          "Sub-millisecond detection isn't just a flex. Okay, it's mostly a flex.",
        author: "process.hrtime.bigint()",
      },
      {
        quote:
          "The only thing faster than our raid detection is how fast I run out of coffee.",
        author: "Developer Confession",
      },
      {
        quote:
          "Your server is protected by 95+ commands and questionable amounts of caffeine.",
        author: "Nexus Promise",
      },
    ];

    const random = quotes[Math.floor(Math.random() * quotes.length)];

    const embed = new EmbedBuilder()
      .setTitle("✨ Inspiration")
      .setDescription(`*"${random.quote}"*`)
      .addFields({
        name: "— Source",
        value: random.author,
        inline: false,
      })
      .setColor(0xf39c12)
      .setFooter({
        text: "Need more wisdom? Run /inspire again!",
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
