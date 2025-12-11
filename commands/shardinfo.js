const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const ShardManager = require("../utils/shardManager");
const Owner = require("../utils/owner");
const ErrorMessages = require("../utils/errorMessages");
const { getShardDisplay } = require("../utils/shardNames");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shardinfo")
    .setDescription("View shard information and statistics (OWNER ONLY)"),

  async execute(interaction) {
    // Only bot owner can view shard info
    if (!Owner.isOwner(interaction.user.id)) {
      return interaction.reply(ErrorMessages.ownerOnly());
    }
    const shardInfo = ShardManager.getShardInfo(interaction.client);
    const stats = await ShardManager.getShardStats(interaction.client);

    // Get gateway stats if available 
    let gatewayStats = null;
    if (interaction.client.gatewayManager) {
      gatewayStats = interaction.client.gatewayManager.getAllStats();
    }

    const embed = new EmbedBuilder()
      .setTitle("⚡ Shard Information")
      .addFields(
        {
          name: "Current Shard",
          value: getShardDisplay(shardInfo.shardId),
          inline: true,
        },
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
        .map((shard) => {
          const shardName = getShardDisplay(shard.id);
          let gatewayInfo = "";
          if (gatewayStats && gatewayStats.shards) {
            const gwShard = gatewayStats.shards.find(
              (g) => g.shardId === shard.id
            );
            if (gwShard) {
              gatewayInfo = ` | 🌐 ${gwShard.connectionQuality}% quality`;
            }
          }
          return `**${shardName}:** ${shard.guilds} guilds, ${shard.users} users, ${shard.ping}ms ping${gatewayInfo}`;
        })
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

    // Add gateway stats if available (EXCEEDS WICK - Enterprise monitoring)
    if (gatewayStats && gatewayStats.global) {
      const g = gatewayStats.global;
      embed.addFields({
        name: "🌐 Gateway Health (Enterprise)",
        value: [
          `**Quality:** ${Math.round(g.averageQuality)}% avg`,
          `**Latency:** ${Math.round(g.averageLatency)}ms avg`,
          `**Identifies:** ${g.totalIdentifies}`,
          `**Resumes:** ${g.totalResumes}`,
          `**Reconnects:** ${g.totalReconnects}`,
          `**Health:** ${g.healthyShards}/${g.totalShards} healthy`,
        ].join("\n"),
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
