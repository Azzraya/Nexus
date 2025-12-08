const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("referral")
    .setDescription("Get your referral code and track rewards")
    .addSubcommand((sub) =>
      sub.setName("code").setDescription("Get your unique referral code")
    )
    .addSubcommand((sub) =>
      sub.setName("stats").setDescription("View your referral statistics")
    )
    .addSubcommand((sub) =>
      sub.setName("rewards").setDescription("View reward tiers and benefits")
    ),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const ReferralSystem = require("../utils/referralSystem");
      const referralSystem = new ReferralSystem(interaction.client);

      if (subcommand === "code") {
        const code = await referralSystem.getReferralCode(interaction.user.id);

        const embed = new EmbedBuilder()
          .setTitle("🎁 Your Referral Code")
          .setDescription(
            `Share Nexus with others and earn rewards!\n\n` +
              `**Your Code:** \`${code}\`\n\n` +
              `**How to Use:**\n` +
              `1. Share your code with server owners\n` +
              `2. They add it during bot setup\n` +
              `3. You earn referral credit when bot joins\n` +
              `4. Unlock premium features for free!`
          )
          .setColor(0x9333ea)
          .addFields({
            name: "🎯 Reward Tiers",
            value:
              "🥉 **5 referrals:** Priority support, custom status\n" +
              "🥈 **15 referrals:** Faster snapshots, advanced analytics\n" +
              "🥇 **50 referrals:** Dedicated support, API boost\n" +
              "💎 **100 referrals:** Lifetime premium, custom features",
          })
          .setFooter({
            text: `Invite link: /invite | Track stats: /referral stats`,
          });

        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else if (subcommand === "stats") {
        const stats = await referralSystem.getUserStats(interaction.user.id);
        const tierData = referralSystem.rewards[stats.current_tier] || {
          badge: "No tier",
          rewards: [],
        };
        const nextTier = this.getNextTier(
          stats.total_referrals || 0,
          referralSystem.rewards
        );

        const embed = new EmbedBuilder()
          .setTitle("📊 Your Referral Stats")
          .setDescription(
            `**Total Referrals:** ${stats.total_referrals || 0}\n` +
              `**Current Tier:** ${tierData.badge}\n` +
              `**Next Tier:** ${nextTier.needed} more referrals to ${nextTier.name}`
          )
          .setColor(0x9333ea)
          .addFields({
            name: "🎁 Active Rewards",
            value:
              tierData.rewards.length > 0
                ? tierData.rewards.map((r) => `✅ ${r}`).join("\n")
                : "Earn 5 referrals to unlock your first rewards!",
          })
          .setFooter({ text: "Get your code: /referral code" });

        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else if (subcommand === "rewards") {
        const embed = new EmbedBuilder()
          .setTitle("🎁 Referral Rewards")
          .setDescription(
            "Unlock premium features by inviting Nexus to servers!"
          )
          .setColor(0x9333ea)
          .addFields(
            {
              name: "🥉 Bronze (5 referrals)",
              value:
                "• Priority support\n• Custom bot status\n• Early feature access",
            },
            {
              name: "🥈 Silver (15 referrals)",
              value:
                "• All Bronze rewards\n• 30min snapshots\n• Advanced analytics\n• Custom branding",
            },
            {
              name: "🥇 Gold (50 referrals)",
              value:
                "• All Silver rewards\n• Dedicated support\n• 10x API rate limit\n• Feature priority",
            },
            {
              name: "💎 Diamond (100 referrals)",
              value:
                "• All Gold rewards\n• Lifetime premium\n• Custom features\n• Developer access",
            }
          )
          .setFooter({ text: "Get started: /referral code" });

        await interaction.reply({ embeds: [embed] });
      }

      logger.info(
        "Command",
        `/referral ${subcommand} executed by ${interaction.user.tag}`
      );
    } catch (error) {
      logger.error("Command", "Referral error", error);
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription("Failed to process referral command.")
        .setColor(0xf44336);

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  getNextTier(referralCount, rewards) {
    if (referralCount < 5) return { needed: 5 - referralCount, name: "Bronze" };
    if (referralCount < 15)
      return { needed: 15 - referralCount, name: "Silver" };
    if (referralCount < 50) return { needed: 50 - referralCount, name: "Gold" };
    if (referralCount < 100)
      return { needed: 100 - referralCount, name: "Diamond" };
    return { needed: 0, name: "Max Level!" };
  },
};
