const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const growthTracker = require("../utils/growthTracker");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("analytics")
    .setDescription("📊 View bot growth and usage analytics")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName("overview").setDescription("View overall bot analytics")
    )
    .addSubcommand((sub) =>
      sub
        .setName("commands")
        .setDescription("View most popular commands (last 7 days)")
    )
    .addSubcommand((sub) =>
      sub.setName("growth").setDescription("View server growth metrics")
    )
    .addSubcommand((sub) =>
      sub.setName("retention").setDescription("View server retention rate")
    )
    .addSubcommand((sub) =>
      sub.setName("sources").setDescription("View where invites come from")
    ),
  category: "admin",

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === "overview") {
        const metrics = await growthTracker.getTodayMetrics();
        const retention = await growthTracker.getRetentionRate();
        const history = await growthTracker.getGrowthHistory(7);

        const embed = new EmbedBuilder()
          .setTitle("📊 Bot Analytics Overview")
          .setDescription("**Performance metrics and growth tracking**")
          .addFields(
            {
              name: "📈 Today's Activity",
              value:
                `Servers Added: **${metrics.serversAdded}**\n` +
                `Servers Removed: **${metrics.serversRemoved}**\n` +
                `Commands Run: **${metrics.commandsRun}**\n` +
                `Raids Detected: **${metrics.raidsDetected}**`,
              inline: true,
            },
            {
              name: "💚 Retention (30 Days)",
              value:
                `Adds: **${retention.adds}**\n` +
                `Removes: **${retention.removes}**\n` +
                `Rate: **${retention.retention}%**`,
              inline: true,
            },
            {
              name: "🏠 Current Status",
              value:
                `Total Servers: **${interaction.client.guilds.cache.size}**\n` +
                `Total Users: **${interaction.client.guilds.cache.reduce(
                  (a, g) => a + g.memberCount,
                  0
                )}**\n` +
                `Uptime: **${this.formatUptime(interaction.client.uptime)}**`,
              inline: false,
            }
          )
          .setColor(0x00d1b2)
          .setFooter({ text: "Use /analytics [subcommand] for detailed views" })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === "commands") {
        const topCommands = await growthTracker.getTopCommands(15);

        if (topCommands.length === 0) {
          return interaction.editReply({
            content:
              "📊 No command usage data yet (data tracked from last 7 days)",
          });
        }

        const commandList = topCommands
          .map(
            (cmd, i) => `**${i + 1}.** \`/${cmd.command}\` - ${cmd.usage} uses`
          )
          .join("\n");

        const embed = new EmbedBuilder()
          .setTitle("📊 Most Popular Commands (Last 7 Days)")
          .setDescription(commandList)
          .setColor(0x3498db)
          .setFooter({
            text: `Total: ${topCommands.reduce(
              (a, c) => a + c.usage,
              0
            )} commands run`,
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === "growth") {
        const history = await growthTracker.getGrowthHistory(30);

        if (history.length === 0) {
          return interaction.editReply({
            content: "📊 No growth history yet (snapshots created daily)",
          });
        }

        // Calculate growth rate
        const oldest = history[history.length - 1];
        const newest = history[0];
        const serverGrowth = newest.total_servers - oldest.total_servers;
        const growthRate =
          oldest.total_servers > 0
            ? ((serverGrowth / oldest.total_servers) * 100).toFixed(1)
            : 0;

        const embed = new EmbedBuilder()
          .setTitle("📈 Server Growth (Last 30 Days)")
          .setDescription(
            `**Change:** ${
              serverGrowth >= 0 ? "+" : ""
            }${serverGrowth} servers (${
              growthRate >= 0 ? "+" : ""
            }${growthRate}%)`
          )
          .addFields(
            {
              name: "📊 Current",
              value: `Servers: **${newest.total_servers}**\nUsers: **${newest.total_users}**`,
              inline: true,
            },
            {
              name: "📅 30 Days Ago",
              value: `Servers: **${oldest.total_servers}**\nUsers: **${oldest.total_users}**`,
              inline: true,
            },
            {
              name: "📈 Last 7 Days",
              value:
                history.length >= 7
                  ? `Added: **${history
                      .slice(0, 7)
                      .reduce((a, d) => a + d.servers_added, 0)}**\n` +
                    `Removed: **${history
                      .slice(0, 7)
                      .reduce((a, d) => a + d.servers_removed, 0)}**`
                  : "Insufficient data",
              inline: false,
            }
          )
          .setColor(serverGrowth >= 0 ? 0x00ff00 : 0xff4444)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === "retention") {
        const retention = await growthTracker.getRetentionRate();

        let grade, color, message;
        if (retention.retention >= 90) {
          grade = "A+";
          color = 0x00ff00;
          message = "Excellent retention! Servers love Nexus! 🎉";
        } else if (retention.retention >= 75) {
          grade = "A";
          color = 0x00d1b2;
          message = "Great retention! Most servers are staying.";
        } else if (retention.retention >= 60) {
          grade = "B";
          color = 0xffa500;
          message = "Good retention, but room for improvement.";
        } else {
          grade = "C";
          color = 0xff4444;
          message = "Low retention. Need to investigate why servers leave.";
        }

        const embed = new EmbedBuilder()
          .setTitle(`📊 Server Retention Rate: ${grade}`)
          .setDescription(message)
          .addFields(
            {
              name: "📈 Last 30 Days",
              value:
                `Servers Added: **${retention.adds}**\n` +
                `Servers Removed: **${retention.removes}**\n` +
                `Net Growth: **${retention.adds - retention.removes}**`,
              inline: true,
            },
            {
              name: "💚 Retention",
              value: `**${retention.retention}%**\n\nThis means ${retention.retention}% of servers that join stay with Nexus!`,
              inline: true,
            }
          )
          .setColor(color)
          .setFooter({
            text: "Goal: 85%+ retention rate",
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === "sources") {
        const sources = await growthTracker.getInviteSources(30);

        if (Object.keys(sources).length === 0) {
          return interaction.editReply({
            content: "📊 No invite source data yet",
          });
        }

        const total = Object.values(sources).reduce((a, b) => a + b, 0);
        const sourceList = Object.entries(sources)
          .sort(([, a], [, b]) => b - a)
          .map(([source, count]) => {
            const percentage = ((count / total) * 100).toFixed(1);
            return `**${source}:** ${count} (${percentage}%)`;
          })
          .join("\n");

        const embed = new EmbedBuilder()
          .setTitle("📊 Invite Sources (Last 30 Days)")
          .setDescription(sourceList)
          .addFields({
            name: "📈 Total Invites",
            value: `**${total}** servers added`,
            inline: false,
          })
          .setColor(0x9b59b6)
          .setFooter({
            text: "Track sources with ?source= parameter in invite links",
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      logger.error("Analytics command error:", error);
      await interaction.editReply({
        content: "❌ Failed to load analytics data",
      });
    }
  },

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m ${seconds % 60}s`;
  },
};
