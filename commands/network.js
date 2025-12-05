const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("network")
    .setDescription("Multi-server network management (sync bans, shared lists)")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a new server network")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Network name")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("join")
        .setDescription("Add this server to a network")
        .addIntegerOption((option) =>
          option
            .setName("network_id")
            .setDescription("Network ID to join")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leave")
        .setDescription("Remove this server from its network")
        .addIntegerOption((option) =>
          option
            .setName("network_id")
            .setDescription("Network ID to leave")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List your networks")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("info")
        .setDescription("View network information")
        .addIntegerOption((option) =>
          option
            .setName("network_id")
            .setDescription("Network ID")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("broadcast")
        .setDescription("Send announcement to all servers in network")
        .addIntegerOption((option) =>
          option
            .setName("network_id")
            .setDescription("Network ID")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Announcement message")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel name to post in (e.g., 'announcements')")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      const name = interaction.options.getString("name");

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const networkId = await db.createServerNetwork(name, interaction.user.id);

      // Automatically add current server
      await db.addGuildToNetwork(
        networkId,
        interaction.guild.id,
        interaction.user.id
      );

      // Initialize in client
      if (interaction.client.multiServer) {
        await interaction.client.multiServer.addServerToNetwork(
          networkId,
          interaction.guild.id,
          interaction.user.id
        );
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Network Created")
        .setDescription(`Created server network: **${name}**`)
        .setColor(0x00ff00)
        .addFields(
          { name: "Network ID", value: `${networkId}`, inline: true },
          { name: "Servers", value: "1", inline: true },
          {
            name: "Features",
            value: "✅ Ban Sync\n✅ Whitelist Sync\n✅ Shared Blacklist",
            inline: false,
          }
        )
        .setFooter({
          text: "Share the Network ID with other server owners to add them",
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "join") {
      const networkId = interaction.options.getInteger("network_id");

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Verify network exists
      const network = await db.getServerNetwork(networkId);
      if (!network) {
        return interaction.editReply({
          content: "❌ Network not found. Check the network ID.",
        });
      }

      // Add server to network
      await db.addGuildToNetwork(
        networkId,
        interaction.guild.id,
        interaction.user.id
      );

      if (interaction.client.multiServer) {
        await interaction.client.multiServer.addServerToNetwork(
          networkId,
          interaction.guild.id,
          interaction.user.id
        );
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Joined Network")
        .setDescription(`This server joined: **${network.network_name}**`)
        .setColor(0x00ff00)
        .addFields(
          { name: "Network ID", value: `${networkId}`, inline: true },
          {
            name: "Total Servers",
            value: `${network.guilds.length + 1}`,
            inline: true,
          }
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "leave") {
      const networkId = interaction.options.getInteger("network_id");

      await db.removeGuildFromNetwork(networkId, interaction.guild.id);

      if (interaction.client.multiServer) {
        await interaction.client.multiServer.removeServerFromNetwork(
          networkId,
          interaction.guild.id
        );
      }

      return interaction.reply({
        embeds: [
          {
            title: "👋 Left Network",
            description: "This server has been removed from the network",
            color: 0xffa500,
          },
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "list") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const networks = await db.getUserNetworks(interaction.user.id);

      if (networks.length === 0) {
        return interaction.editReply({
          content:
            "❌ You don't own any networks. Use `/network create` to make one!",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🌐 Your Server Networks")
        .setDescription(`You manage ${networks.length} network(s)`)
        .setColor(0x0099ff)
        .setTimestamp();

      for (const network of networks) {
        const networkData = await db.getServerNetwork(network.id);
        embed.addFields({
          name: `${network.id}. ${network.network_name}`,
          value: `Servers: **${
            networkData.guilds.length
          }**\nCreated: <t:${Math.floor(network.created_at / 1000)}:R>`,
          inline: false,
        });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "info") {
      const networkId = interaction.options.getInteger("network_id");

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (!interaction.client.multiServer) {
        return interaction.editReply({
          content: "❌ Multi-server system not initialized",
        });
      }

      const stats =
        await interaction.client.multiServer.getNetworkStats(networkId);

      if (!stats) {
        return interaction.editReply({
          content: "❌ Network not found",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`🌐 Network: ${stats.networkName}`)
        .setDescription("Cross-server network information")
        .setColor(0x0099ff)
        .addFields(
          {
            name: "Total Servers",
            value: `${stats.totalGuilds}`,
            inline: true,
          },
          {
            name: "Total Members",
            value: `${stats.totalMembers.toLocaleString()}`,
            inline: true,
          },
          {
            name: "Features",
            value: [
              `Ban Sync: ${stats.config.syncBans ? "✅" : "❌"}`,
              `Whitelist Sync: ${stats.config.syncWhitelist ? "✅" : "❌"}`,
              `Announcements: ${
                stats.config.sharedAnnouncements ? "✅" : "❌"
              }`,
            ].join("\n"),
            inline: false,
          }
        )
        .setTimestamp();

      // List servers
      if (stats.guilds.length > 0) {
        embed.addFields({
          name: "📋 Servers",
          value: stats.guilds
            .slice(0, 10)
            .map((g) => `• **${g.name}** (${g.memberCount} members)`)
            .join("\n"),
          inline: false,
        });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "broadcast") {
      const networkId = interaction.options.getInteger("network_id");
      const message = interaction.options.getString("message");
      const channelName = interaction.options.getString("channel");

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Verify ownership
      const network = await db.getServerNetwork(networkId);
      if (!network || network.owner_id !== interaction.user.id) {
        return interaction.editReply({
          content: "❌ You don't own this network",
        });
      }

      if (!interaction.client.multiServer) {
        return interaction.editReply({
          content: "❌ Multi-server system not initialized",
        });
      }

      const results =
        await interaction.client.multiServer.broadcastAnnouncement(
          networkId,
          channelName,
          message,
          { title: "📢 Network Announcement", color: 0x5865f2 }
        );

      const embed = new EmbedBuilder()
        .setTitle("📢 Broadcast Sent")
        .setColor(results.failed > 0 ? 0xffa500 : 0x00ff00)
        .addFields(
          {
            name: "✅ Successful",
            value: `${results.success} server(s)`,
            inline: true,
          },
          {
            name: "❌ Failed",
            value: `${results.failed} server(s)`,
            inline: true,
          }
        )
        .setTimestamp();

      if (results.errors.length > 0) {
        embed.addFields({
          name: "⚠️ Errors",
          value: results.errors.slice(0, 5).join("\n"),
          inline: false,
        });
      }

      return interaction.editReply({ embeds: [embed] });
    }
  },
};
