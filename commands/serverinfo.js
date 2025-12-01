const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Get information about the server"),

  async execute(interaction) {
    const guild = interaction.guild;
    const owner = await guild.fetchOwner();

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${guild.name}`)
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .addFields(
        { name: "👑 Owner", value: `${owner.user.tag}`, inline: true },
        { name: "🆔 Server ID", value: guild.id, inline: true },
        {
          name: "📅 Created",
          value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
          inline: true,
        },
        { name: "👥 Members", value: `${guild.memberCount}`, inline: true },
        {
          name: "💬 Channels",
          value: `${guild.channels.cache.size}`,
          inline: true,
        },
        {
          name: "😀 Emojis",
          value: `${guild.emojis.cache.size}`,
          inline: true,
        },
        {
          name: "🔒 Verification",
          value: guild.verificationLevel.toString(),
          inline: true,
        },
        {
          name: "📈 Boost Level",
          value: guild.premiumTier.toString(),
          inline: true,
        },
        {
          name: "🚀 Boosts",
          value: `${guild.premiumSubscriptionCount || 0}`,
          inline: true,
        }
      )
      .setColor(0x0099ff)
      .setTimestamp();

    if (guild.description) {
      embed.setDescription(guild.description);
    }

    await interaction.reply({ embeds: [embed] });
  },
};

