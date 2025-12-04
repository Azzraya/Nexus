const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const ShardManager = require("../utils/shardManager");
const Owner = require("../utils/owner");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shardinfo")
    .setDescription("View shard information and statistics (OWNER ONLY)"),

  async execute(interaction) {
    // Only bot owner can view shard info
    if (!Owner.isOwner(interaction.user.id)) {
      return interaction.reply({
        content: "❌ Only the bot owner can view shard information!",
        flags: MessageFlags.Ephemeral,
      });
    }
    const shardInfo = ShardManager.getShardInfo(interaction.client);
    const stats = await ShardManager.getShardStats(interaction.client);

    const embed = new EmbedBuilder()
      .setTitle("⚡ Shard Information")
      .addFields(
        { name: "Current Shard", value: `${shardInfo.shardId}`, inline: true },
        {
          name: "Total Shards",
          value: `${shardInfo.shardCount}`,
          inline: true,
        },
        {
          name: "Is Sharded",
          value: shardInfo.isSharded ? "✅ Yes" : "❌ No",
          inline: true,
        }
      )
      .setColor(0x0099ff)
      .setTimestamp();

    if (stats.shards) {
      const shardList = stats.shards
        .map(
          (shard) =>
            `**Shard ${shard.id}:** ${shard.guilds} guilds, ${shard.users} users, ${shard.ping}ms ping`
        )
        .join("\n");

      embed.addFields({
        name: "Shard Statistics",
        value: shardList || "No shards",
        inline: false,
      });

      if (stats.totalGuilds) {
        embed.addFields(
          { name: "Total Guilds", value: `${stats.totalGuilds}`, inline: true },
          { name: "Total Users", value: `${stats.totalUsers}`, inline: true }
        );
      }
    }

    await interaction.reply({ embeds: [embed] });
  },
};
