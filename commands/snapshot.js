const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("snapshot")
    .setDescription("Manage server snapshots for point-in-time recovery")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List available snapshots for this server")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a manual snapshot")
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for creating this snapshot")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("restore")
        .setDescription("Restore server to a previous snapshot")
        .addIntegerOption((option) =>
          option
            .setName("snapshot_id")
            .setDescription("ID of the snapshot to restore")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("stats").setDescription("View snapshot statistics")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "list") {
      if (!interaction.client.snapshotScheduler) {
        return interaction.reply({
          content: "❌ Snapshot scheduler not available",
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const snapshots = await interaction.client.snapshotScheduler.getAvailableSnapshots(
        interaction.guild.id,
        24
      );

      if (snapshots.length === 0) {
        return interaction.editReply({
          content: "No snapshots available for this server yet. Wait for the hourly snapshot or create one manually with `/snapshot create`.",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📸 Available Snapshots")
        .setDescription(`Point-in-time recovery snapshots for **${interaction.guild.name}**`)
        .setColor(0x5865f2)
        .setTimestamp();

      const snapshotList = snapshots
        .map((s, i) => {
          const date = new Date(s.created_at);
          const timeAgo = Math.floor((Date.now() - s.created_at) / 1000 / 60);
          return `**${i + 1}.** ID: \`${s.id}\` | ${date.toLocaleString()} (${timeAgo}m ago)\n└ ${s.reason}`;
        })
        .join("\n\n");

      embed.setDescription(
        embed.data.description + `\n\n${snapshotList}\n\n💡 Use \`/snapshot restore snapshot_id:<id>\` to restore`
      );

      embed.setFooter({
        text: `${snapshots.length} snapshot${snapshots.length !== 1 ? "s" : ""} available | Automatic snapshots every hour`,
      });

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "create") {
      const reason = interaction.options.getString("reason") || "Manual snapshot";

      await interaction.deferReply({ ephemeral: true });

      try {
        const AutoRecovery = require("../utils/autoRecovery");
const ErrorMessages = require("../utils/errorMessages");
        await AutoRecovery.createSnapshot(interaction.guild, "full", reason);

        const embed = new EmbedBuilder()
          .setTitle("✅ Snapshot Created")
          .setDescription(
            `Successfully created a snapshot for **${interaction.guild.name}**`
          )
          .addFields({
            name: "Reason",
            value: reason,
            inline: false,
          })
          .addFields({
            name: "Captured Data",
            value:
              `• Channels: ${interaction.guild.channels.cache.size}\n` +
              `• Roles: ${interaction.guild.roles.cache.size}\n` +
              `• Server settings`,
            inline: false,
          })
          .setColor(0x00ff00)
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (error) {
        return interaction.editReply({
          content: `❌ Failed to create snapshot: ${error.message}`,
        });
      }
    }

    if (subcommand === "restore") {
      const snapshotId = interaction.options.getInteger("snapshot_id");

      await interaction.deferReply({ ephemeral: true });

      if (!interaction.client.snapshotScheduler) {
        return interaction.editReply({
          content: "❌ Snapshot scheduler not available",
        });
      }

      try {
        const result = await interaction.client.snapshotScheduler.restoreToSnapshot(
          interaction.guild,
          snapshotId
        );

        const embed = new EmbedBuilder()
          .setTitle("✅ Server Restored")
          .setDescription(
            `Successfully restored **${interaction.guild.name}** to snapshot #${snapshotId}`
          )
          .addFields({
            name: "📊 Recovery Summary",
            value:
              `• Recovered: ${result.recovered.length} items\n` +
              `• Skipped: ${result.skipped.length} items`,
            inline: false,
          })
          .setColor(0x00ff00)
          .setTimestamp();

        if (result.recovered.length > 0) {
          const recoveredList = result.recovered
            .slice(0, 10)
            .map((r) => `• ${r.type}: ${r.name}`)
            .join("\n");

          embed.addFields({
            name: "Recovered Items",
            value: recoveredList + (result.recovered.length > 10 ? "\n...and more" : ""),
            inline: false,
          });
        }

        return interaction.editReply({ embeds: [embed] });
      } catch (error) {
        return interaction.editReply({
          content: `❌ Failed to restore snapshot: ${error.message}`,
        });
      }
    }

    if (subcommand === "stats") {
      if (!interaction.client.snapshotScheduler) {
        return interaction.reply({
          content: "❌ Snapshot scheduler not available",
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const stats = await interaction.client.snapshotScheduler.getStats();
      const guildSnapshots = await interaction.client.snapshotScheduler.getAvailableSnapshots(
        interaction.guild.id,
        1000
      );

      const embed = new EmbedBuilder()
        .setTitle("📊 Snapshot Statistics")
        .setDescription("Global and server-specific snapshot data")
        .setColor(0x5865f2)
        .setTimestamp();

      embed.addFields({
        name: "🌐 Global Statistics",
        value:
          `**Total Snapshots:** ${stats.totalSnapshots}\n` +
          `**Servers with Snapshots:** ${stats.guildsWithSnapshots}\n` +
          `**Recent Snapshots (24h):** ${stats.recentSnapshots}`,
        inline: false,
      });

      embed.addFields({
        name: "📸 This Server",
        value:
          `**Total Snapshots:** ${guildSnapshots.length}\n` +
          `**Oldest Snapshot:** ${guildSnapshots.length > 0 ? new Date(guildSnapshots[guildSnapshots.length - 1].created_at).toLocaleString() : "N/A"}\n` +
          `**Latest Snapshot:** ${guildSnapshots.length > 0 ? new Date(guildSnapshots[0].created_at).toLocaleString() : "N/A"}`,
        inline: false,
      });

      embed.addFields({
        name: "⚙️ Configuration",
        value:
          `**Automatic Snapshots:** Enabled (hourly)\n` +
          `**Retention:** 24 hours (24 snapshots)\n` +
          `**Next Snapshot:** <t:${Math.floor((Date.now() + 60 * 60 * 1000) / 1000)}:R>`,
        inline: false,
      });

      return interaction.editReply({ embeds: [embed] });
    }
  },
};

