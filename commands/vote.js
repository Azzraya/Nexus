const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const Owner = require("../utils/owner");
const logger = require("../utils/logger");
const VoteRewards = require("../utils/voteRewards");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vote")
    .setDescription("Vote for the bot on bot listing websites")
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("View all voting links")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("check")
        .setDescription("Check if you've voted on Top.gg")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to check (defaults to you)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("rewards")
        .setDescription("View your voting rewards and streak")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to check (defaults to you)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leaderboard")
        .setDescription("View voting leaderboard")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Leaderboard type")
            .addChoices(
              { name: "Current Streak", value: "streak" },
              { name: "Total Votes", value: "total" },
              { name: "Longest Streak", value: "longest" }
            )
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a botlist voting link (Owner only)")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Name of the botlist (e.g., Top.gg, Discord Bot List)")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("url")
            .setDescription("Full voting URL for the botlist")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a botlist voting link (Owner only)")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Name of the botlist to remove")
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "list") {
      // Get all botlist links
      const botlists = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM botlist_links ORDER BY name ASC",
          [],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (botlists.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle("📊 Vote for Nexus")
          .setDescription(
            "No voting links have been configured yet.\n\nAdministrators can add voting links using `/vote add`"
          )
          .setColor(0x5865f2)
          .setFooter({
            text: "Thank you for supporting Nexus!",
          });

        return interaction.reply({ embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setTitle("📊 Vote for Nexus")
        .setDescription(
          "Help support Nexus by voting on these bot listing websites!\n\nYour votes help us grow and improve the bot. 💙"
        )
        .setColor(0x5865f2)
        .setFooter({
          text: `Thank you for supporting Nexus! • ${botlists.length} botlist${botlists.length !== 1 ? "s" : ""} available`,
        })
        .setTimestamp();

      // Add botlist links as fields
      botlists.forEach((botlist, index) => {
        embed.addFields({
          name: `${index + 1}. ${botlist.name}`,
          value: `[Click to vote →](${botlist.url})`,
          inline: true,
        });
      });

      // Create buttons for each botlist (max 5 buttons per row, Discord limit)
      const rows = [];
      const maxButtons = 5;
      
      for (let i = 0; i < botlists.length; i += maxButtons) {
        const row = new ActionRowBuilder();
        const batch = botlists.slice(i, i + maxButtons);
        
        batch.forEach((botlist) => {
          row.addComponents(
            new ButtonBuilder()
              .setLabel(botlist.name.length > 20 ? botlist.name.substring(0, 17) + "..." : botlist.name)
              .setURL(botlist.url)
              .setStyle(ButtonStyle.Link)
          );
        });
        
        rows.push(row);
      }

      // Check if user has voted on any bot lists (if configured)
      const voteChecks = [];
      if (process.env.TOPGG_TOKEN && interaction.client.user.id) {
        try {
          const Topgg = require("@top-gg/sdk");
          const api = new Topgg.Api(process.env.TOPGG_TOKEN);
          const hasVoted = await api.hasVoted(interaction.user.id, interaction.client.user.id);
          if (hasVoted) voteChecks.push("Top.gg");
        } catch (error) {
          // Silently fail - Top.gg check is optional
        }
      }
      
      if (process.env.DISCORDBOTLIST_TOKEN && interaction.client.user.id) {
        try {
          const DiscordBotList = require("../utils/discordbotlist");
          const dbl = new DiscordBotList(interaction.client, process.env.DISCORDBOTLIST_TOKEN);
          const vote = await dbl.hasVoted(interaction.user.id, interaction.client.user.id);
          if (vote) voteChecks.push("Discord Bot List");
        } catch (error) {
          // Silently fail - Discord Bot List check is optional
        }
      }

      if (process.env.VOIDBOTS_TOKEN && interaction.client.user.id) {
        try {
          const VoidBots = require("../utils/voidbots");
          const voidbots = interaction.client.voidbots || new VoidBots(interaction.client, process.env.VOIDBOTS_TOKEN);
          const hasVoted = await voidbots.hasVoted(interaction.user.id);
          if (hasVoted) voteChecks.push("VoidBots");
        } catch (error) {
          // Silently fail - VoidBots check is optional
        }
      }

      if (voteChecks.length > 0) {
        embed.setDescription(
          embed.data.description + `\n\n✅ **You have voted on ${voteChecks.join(" and ")}!** Thank you!`
        );
      } else if (botlists.length > 0) {
        const topggLink = botlists.find(b => 
          b.name.toLowerCase().includes("top.gg") || 
          b.url.includes("top.gg")
        );
        const dblLink = botlists.find(b => 
          b.name.toLowerCase().includes("discord bot list") || 
          b.url.includes("discordbotlist.com")
        );
        const voidbotsLink = botlists.find(b => 
          b.name.toLowerCase().includes("voidbots") || 
          b.url.includes("voidbots.net")
        );
        
        const links = [];
        if (topggLink) links.push(`[Top.gg](${topggLink.url})`);
        if (dblLink) links.push(`[Discord Bot List](${dblLink.url})`);
        if (voidbotsLink) links.push(`[VoidBots](${voidbotsLink.url})`);
        
        if (links.length > 0) {
          embed.setDescription(
            embed.data.description + 
            `\n\n💡 **Tip:** Vote on ${links.join(" or ")} to support the bot!`
          );
        }
      }

      return interaction.reply({
        embeds: [embed],
        components: rows,
      });
    }

    if (subcommand === "check") {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const isSelf = targetUser.id === interaction.user.id;

      if (!process.env.TOPGG_TOKEN && !process.env.DISCORDBOTLIST_TOKEN && !process.env.VOIDBOTS_TOKEN) {
        return interaction.reply({
          content: "❌ No bot list integrations are configured.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const voteStatus = {
          topgg: null,
          discordbotlist: null,
          voidbots: null,
          discordbots: null,
          botsondicord: null,
        };

        // Check Top.gg
        if (process.env.TOPGG_TOKEN) {
          try {
            const Topgg = require("@top-gg/sdk");
            const api = new Topgg.Api(process.env.TOPGG_TOKEN);
            voteStatus.topgg = await api.hasVoted(
              targetUser.id,
              interaction.client.user.id
            );
          } catch (error) {
            logger.debug("Error checking Top.gg vote:", error);
          }
        }

        // Check Discord Bot List
        if (process.env.DISCORDBOTLIST_TOKEN) {
          try {
            const DiscordBotList = require("../utils/discordbotlist");
            const dbl = new DiscordBotList(
              interaction.client,
              process.env.DISCORDBOTLIST_TOKEN
            );
            voteStatus.discordbotlist = await dbl.hasVoted(
              targetUser.id,
              interaction.client.user.id
            );
          } catch (error) {
            logger.debug("Error checking Discord Bot List vote:", error);
          }
        }

        // Check VoidBots
        if (process.env.VOIDBOTS_TOKEN) {
          try {
            const VoidBots = require("../utils/voidbots");
            let voidbots = interaction.client.voidbots;
            if (!voidbots) {
              voidbots = new VoidBots(
                interaction.client,
                process.env.VOIDBOTS_TOKEN
              );
              voidbots.initialize();
            }
            voteStatus.voidbots = await voidbots.hasVoted(targetUser.id);
          } catch (error) {
            logger.debug("Error checking VoidBots vote:", error);
          }
        }

        // Check Discord Bots (discord.bots.gg)
        if (process.env.DISCORDBOTS_TOKEN) {
          try {
            const DiscordBots = require("../utils/discordbots");
            const discordBots = interaction.client.discordBots || new DiscordBots(
              interaction.client,
              process.env.DISCORDBOTS_TOKEN
            );
            voteStatus.discordbots = await discordBots.hasVoted(targetUser.id);
          } catch (error) {
            logger.debug("Error checking Discord Bots vote:", error);
          }
        }

        // Check Bots on Discord
        if (process.env.BOTSONDICORD_TOKEN) {
          try {
            const BotsOnDiscord = require("../utils/botsondicord");
const ErrorMessages = require("../utils/errorMessages");
            const botsOnDiscord = interaction.client.botsOnDiscord || new BotsOnDiscord(
              interaction.client,
              process.env.BOTSONDICORD_TOKEN
            );
            voteStatus.botsondicord = await botsOnDiscord.hasVoted(targetUser.id);
          } catch (error) {
            logger.debug("Error checking Bots on Discord vote:", error);
          }
        }

        const hasVotedAny = voteStatus.topgg || voteStatus.discordbotlist || voteStatus.voidbots || voteStatus.discordbots || voteStatus.botsondicord;

        const embed = new EmbedBuilder()
          .setTitle("📊 Vote Status Check")
          .setColor(hasVotedAny ? 0x00ff00 : 0xffaa00)
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
          .addFields({
            name: "User",
            value: `${targetUser} (${targetUser.tag})`,
            inline: true,
          })
          .setTimestamp();

        // Add vote status fields
        const statusFields = [];
        if (process.env.TOPGG_TOKEN) {
          statusFields.push({
            name: "Top.gg",
            value: voteStatus.topgg ? "✅ Voted" : "❌ Not Voted",
            inline: true,
          });
        }
        if (process.env.DISCORDBOTLIST_TOKEN) {
          statusFields.push({
            name: "Discord Bot List",
            value: voteStatus.discordbotlist ? "✅ Voted" : "❌ Not Voted",
            inline: true,
          });
        }
        if (process.env.VOIDBOTS_TOKEN) {
          statusFields.push({
            name: "VoidBots",
            value: voteStatus.voidbots ? "✅ Voted" : "❌ Not Voted",
            inline: true,
          });
        }
        if (process.env.DISCORDBOTS_TOKEN) {
          statusFields.push({
            name: "Discord Bots",
            value: voteStatus.discordbots ? "✅ Voted" : "❌ Not Voted",
            inline: true,
          });
        }
        if (process.env.BOTSONDICORD_TOKEN) {
          statusFields.push({
            name: "Bots on Discord",
            value: voteStatus.botsondicord ? "✅ Voted" : "❌ Not Voted",
            inline: true,
          });
        }
        embed.addFields(statusFields);

        // Get voting links
        const botlists = await new Promise((resolve, reject) => {
          db.db.all("SELECT * FROM botlist_links ORDER BY name ASC", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        });

        if (!hasVotedAny && botlists.length > 0) {
          const links = botlists
            .slice(0, 5)
            .map((b) => `[${b.name}](${b.url})`)
            .join("\n");
          embed.addFields({
            name: "💡 Vote Now",
            value: links,
            inline: false,
          });

          embed.setDescription(
            isSelf
              ? "You haven't voted yet. Vote now to support the bot!"
              : "This user hasn't voted yet."
          );
        } else {
          const votedOn = [];
          if (voteStatus.topgg) votedOn.push("Top.gg");
          if (voteStatus.discordbotlist) votedOn.push("Discord Bot List");
          if (voteStatus.voidbots) votedOn.push("Void Bots");
          if (voteStatus.discordbots) votedOn.push("Discord Bots");
          if (voteStatus.botsondicord) votedOn.push("Bots on Discord");

          embed.setDescription(
            isSelf
              ? `Thank you for voting${votedOn.length > 0 ? ` on ${votedOn.join(" and ")}` : ""}! Your support helps us grow. 💙`
              : `This user has voted${votedOn.length > 0 ? ` on ${votedOn.join(" and ")}` : ""}.`
          );
        }

        return interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logger.error("Error checking vote status:", error);
        return interaction.editReply({
          content: "❌ Failed to check vote status. Please try again later.",
        });
      }
    }

    if (subcommand === "add") {
      // Owner only
      if (!Owner.isOwner(interaction.user.id)) {
        return interaction.reply({
          ErrorMessages.ownerOnly(),
          flags: MessageFlags.Ephemeral,
        });
      }

      const name = interaction.options.getString("name");
      const url = interaction.options.getString("url");

      // Validate URL
      try {
        new URL(url);
      } catch (error) {
        return interaction.reply({
          content: "❌ Invalid URL format. Please provide a valid URL (e.g., https://top.gg/bot/.../vote)",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Check if botlist already exists
      const existing = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM botlist_links WHERE LOWER(name) = LOWER(?)",
          [name],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (existing) {
        return interaction.reply({
          content: `❌ A botlist with the name "${name}" already exists. Use \`/vote remove\` first if you want to update it.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // Add botlist
      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO botlist_links (name, url, added_by, added_at) VALUES (?, ?, ?, ?)",
          [name, url, interaction.user.id, Date.now()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Botlist Added")
        .setDescription(`Successfully added **${name}** to the voting list.`)
        .addFields({
          name: "URL",
          value: url,
        })
        .setColor(0x00ff00)
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subcommand === "remove") {
      // Owner only
      if (!Owner.isOwner(interaction.user.id)) {
        return interaction.reply({
          ErrorMessages.ownerOnly(),
          flags: MessageFlags.Ephemeral,
        });
      }

      const name = interaction.options.getString("name");

      // Check if botlist exists
      const existing = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM botlist_links WHERE LOWER(name) = LOWER(?)",
          [name],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!existing) {
        return interaction.reply({
          content: `❌ No botlist found with the name "${name}".`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // Remove botlist
      await new Promise((resolve, reject) => {
        db.db.run(
          "DELETE FROM botlist_links WHERE LOWER(name) = LOWER(?)",
          [name],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Botlist Removed")
        .setDescription(`Successfully removed **${name}** from the voting list.`)
        .setColor(0xff0000)
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subcommand === "rewards") {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const isSelf = targetUser.id === interaction.user.id;

      const voteRewards = new VoteRewards(interaction.client);
      const stats = await voteRewards.getVoteStats(targetUser.id);

      const embed = new EmbedBuilder()
        .setTitle("🎁 Voting Rewards")
        .setDescription(
          isSelf
            ? "Your voting statistics and rewards"
            : `Voting statistics for ${targetUser.tag}`
        )
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setColor(0xffd700)
        .setTimestamp();

      // Streak information
      const streakEmoji =
        stats.current_streak >= 30
          ? "💎"
          : stats.current_streak >= 14
          ? "⚡"
          : stats.current_streak >= 7
          ? "🔥"
          : "📅";

      embed.addFields({
        name: `${streakEmoji} Current Streak`,
        value: `**${stats.current_streak}** day${stats.current_streak !== 1 ? "s" : ""}`,
        inline: true,
      });

      embed.addFields({
        name: "👑 Longest Streak",
        value: `**${stats.longest_streak}** day${stats.longest_streak !== 1 ? "s" : ""}`,
        inline: true,
      });

      embed.addFields({
        name: "📊 Total Votes",
        value: `**${stats.total_votes}**`,
        inline: true,
      });

      embed.addFields({
        name: "⭐ Vote Points",
        value: `**${stats.points}** points`,
        inline: true,
      });

      embed.addFields({
        name: "📅 Recent Votes",
        value: `**${stats.recent_votes}** (Last 30 days)`,
        inline: true,
      });

      // Show next milestone
      const streakMilestones = [7, 14, 30, 60, 90];
      const nextMilestone = streakMilestones.find(
        (m) => m > stats.current_streak
      );

      if (nextMilestone) {
        const daysToGo = nextMilestone - stats.current_streak;
        embed.addFields({
          name: "🎯 Next Milestone",
          value: `**${nextMilestone}** days (${daysToGo} day${daysToGo !== 1 ? "s" : ""} to go)`,
          inline: true,
        });
      }

      // Show if reward is active
      const hasActive = await voteRewards.hasActiveReward(targetUser.id);
      if (hasActive) {
        embed.addFields({
          name: "✅ Active Reward",
          value: "You have an active vote reward! (12 hours)",
          inline: false,
        });
      }

      // Last vote time
      if (stats.last_vote_at) {
        embed.setFooter({
          text: `Last voted: ${new Date(stats.last_vote_at).toLocaleString()}`,
        });
      }

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subcommand === "leaderboard") {
      const type = interaction.options.getString("type") || "streak";

      await interaction.deferReply();

      const voteRewards = new VoteRewards(interaction.client);
      const leaderboard = await voteRewards.getLeaderboard(type, 10);

      const typeNames = {
        streak: "Current Streak",
        total: "Total Votes",
        longest: "Longest Streak",
      };

      const embed = new EmbedBuilder()
        .setTitle(`🏆 Voting Leaderboard - ${typeNames[type]}`)
        .setDescription("Top 10 voters")
        .setColor(0xffd700)
        .setTimestamp();

      if (leaderboard.length === 0) {
        embed.setDescription("No voting data yet. Be the first to vote!");
        return interaction.editReply({ embeds: [embed] });
      }

      // Build leaderboard
      const medals = ["🥇", "🥈", "🥉"];
      let leaderboardText = "";

      for (let i = 0; i < leaderboard.length; i++) {
        const entry = leaderboard[i];
        const medal = medals[i] || `**${i + 1}.**`;

        let value;
        if (type === "streak") {
          value = `${entry.current_streak} day${entry.current_streak !== 1 ? "s" : ""}`;
        } else if (type === "total") {
          value = `${entry.total_votes} vote${entry.total_votes !== 1 ? "s" : ""}`;
        } else {
          value = `${entry.longest_streak} day${entry.longest_streak !== 1 ? "s" : ""}`;
        }

        leaderboardText += `${medal} <@${entry.user_id}> - **${value}**\n`;
      }

      embed.setDescription(leaderboardText);

      // Show user's rank if not in top 10
      const userRank = leaderboard.findIndex(
        (e) => e.user_id === interaction.user.id
      );
      if (userRank === -1) {
        const userStats = await voteRewards.getVoteStats(interaction.user.id);
        let userValue;
        if (type === "streak") {
          userValue = userStats.current_streak;
        } else if (type === "total") {
          userValue = userStats.total_votes;
        } else {
          userValue = userStats.longest_streak;
        }

        if (userValue > 0) {
          embed.setFooter({
            text: `Your ${typeNames[type].toLowerCase()}: ${userValue}`,
          });
        }
      }

      return interaction.editReply({ embeds: [embed] });
    }
  },
};

