const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("secret")
    .setDescription("🤫 You found a secret command!"),
  category: "fun",

  async execute(interaction) {
    const secrets = [
      {
        title: "🎨 Secret #1: The Name",
        description:
          "Nexus means 'connection' or 'link' - fitting for a bot that protects communities and shares threat intelligence across servers!",
        color: 0x667eea,
      },
      {
        title: "⚡ Secret #2: The Speed",
        description:
          "Our raid detection is so fast (0.15ms) because we run 4 algorithms in parallel. Most bots run them sequentially. Parallel FTW!",
        color: 0x00d1b2,
      },
      {
        title: "🔓 Secret #3: Why Open Source?",
        description:
          "Security through transparency. You can audit every line of code. No hidden backdoors, no data selling, just honest code.",
        color: 0xffa500,
      },
      {
        title: "🤖 Secret #4: The Developer",
        description:
          "Built by one person who got tired of paying for premium Discord bots. Sometimes the best motivation is being broke 😅",
        color: 0xff69b4,
      },
      {
        title: "📊 Secret #5: The Goal",
        description:
          "Prove that free, open-source bots can compete with premium ones. Currently at 18+ servers. Destination: 1,000+. You're part of the journey!",
        color: 0x9b59b6,
      },
    ];

    const random = secrets[Math.floor(Math.random() * secrets.length)];

    const embed = new EmbedBuilder()
      .setTitle(random.title)
      .setDescription(random.description)
      .setColor(random.color)
      .setFooter({
        text: `Secret ${secrets.indexOf(random) + 1} of ${
          secrets.length
        } | There are more hidden commands... 👀`,
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
