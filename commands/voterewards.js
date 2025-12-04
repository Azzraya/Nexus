const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const Owner = require("../utils/owner");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("voterewards")
    .setDescription("Configure automatic vote rewards (Owner only)")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Set up automatic vote rewards")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to give voters (temporary, 12 hours)")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("webhook")
            .setDescription("Webhook URL for vote notifications (optional)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("toggle")
        .setDescription("Enable or disable automatic vote rewards")
        .addBooleanOption((option) =>
          option
            .setName("enabled")
            .setDescription("Enable vote rewards?")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("View vote rewards configuration")
    ),

  async execute(interaction) {
    // Owner only
    if (!Owner.isOwner(interaction.user.id)) {
      return interaction.reply({
        content: "❌ Only the bot owner can configure vote rewards.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "setup") {
      const role = interaction.options.getRole("role");
      const webhook = interaction.options.getString("webhook");

      // Validate webhook URL if provided
      if (webhook) {
        try {
          new URL(webhook);
          if (!webhook.includes("discord.com/api/webhooks/")) {
            return interaction.reply({
              content: "❌ Invalid Discord webhook URL",
              ephemeral: true,
            });
          }
        } catch (error) {
          return interaction.reply({
            content: "❌ Invalid webhook URL format",
            ephemeral: true,
          });
        }
      }

      // Update config
      await new Promise((resolve, reject) => {
        db.db.run(
          `UPDATE server_config 
           SET vote_rewards_enabled = 1, 
               vote_reward_role = ?, 
               vote_webhook_url = ?
           WHERE guild_id = ?`,
          [role.id, webhook, interaction.guild.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Vote Rewards Configured")
        .setDescription("Automatic vote rewards are now set up!")
        .addFields(
          {
            name: "Reward Role",
            value: `${role} (temporary, 12 hours)`,
            inline: false,
          },
          {
            name: "Webhook Notifications",
            value: "✅ Enabled (hardcoded)",
            inline: false,
          },
          {
            name: "How it Works",
            value:
              "• Bot checks for votes every 5 minutes\n" +
              "• Users who voted get the reward role automatically\n" +
              "• Role is removed after 12 hours\n" +
              "• Webhook notifications sent automatically to hardcoded webhook",
            inline: false,
          }
        )
        .setColor(0x00ff00)
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === "toggle") {
      const enabled = interaction.options.getBoolean("enabled");

      await new Promise((resolve, reject) => {
        db.db.run(
          "UPDATE server_config SET vote_rewards_enabled = ? WHERE guild_id = ?",
          [enabled ? 1 : 0, interaction.guild.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      return interaction.reply({
        content: `✅ Vote rewards ${enabled ? "enabled" : "disabled"}`,
        ephemeral: true,
      });
    }

    if (subcommand === "status") {
      const config = await db.getServerConfig(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle("📊 Vote Rewards Status")
        .setDescription(`Configuration for **${interaction.guild.name}**`)
        .setColor(0x5865f2)
        .setTimestamp();

      if (!config || !config.vote_rewards_enabled) {
        embed.addFields({
          name: "Status",
          value: "❌ **Disabled**",
          inline: false,
        });
        embed.addFields({
          name: "Setup",
          value: "Use `/voterewards setup` to configure",
          inline: false,
        });
      } else {
        embed.addFields({
          name: "Status",
          value: "✅ **Enabled**",
          inline: false,
        });

        if (config.vote_reward_role) {
          embed.addFields({
            name: "Reward Role",
            value: `<@&${config.vote_reward_role}>`,
            inline: true,
          });
        }

        // Webhook is always enabled (hardcoded in voteRewards.js)
        embed.addFields({
          name: "Webhook Notifications",
          value: "✅ Enabled (hardcoded)",
          inline: true,
        });

        embed.addFields({
          name: "Supported Bot Lists",
          value:
            (process.env.TOPGG_TOKEN ? "✅ Top.gg\n" : "") +
            (process.env.DISCORDBOTLIST_TOKEN ? "✅ Discord Bot List\n" : "") +
            (process.env.VOIDBOTS_TOKEN ? "✅ Void Bots\n" : ""),
          inline: false,
        });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
