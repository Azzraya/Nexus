const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("quick")
    .setDescription("Quick actions panel - optimized for mobile")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Quick action to perform")
        .setRequired(false)
        .addChoices(
          { name: "Warn User", value: "warn" },
          { name: "Kick User", value: "kick" },
          { name: "Ban User", value: "ban" },
          { name: "Timeout User", value: "timeout" },
          { name: "View Cases", value: "cases" },
          { name: "Server Health", value: "health" },
          { name: "Security Status", value: "security" }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const action = interaction.options.getString("action");

    if (action) {
      // Handle specific action
      await this.handleQuickAction(interaction, action);
    } else {
      // Show quick actions menu
      await this.showQuickMenu(interaction);
    }
  },

  async showQuickMenu(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("⚡ Quick Actions")
      .setDescription("Fast moderation actions - optimized for mobile")
      .setColor(0x5865f2)
      .setFooter({ text: "Select an action below or use /quick action:..." })
      .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("quick_warn")
        .setLabel("⚠️ Warn")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("quick_kick")
        .setLabel("👢 Kick")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("quick_ban")
        .setLabel("🔨 Ban")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("quick_timeout")
        .setLabel("⏱️ Timeout")
        .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("quick_cases")
        .setLabel("📋 Cases")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("quick_health")
        .setLabel("💚 Health")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("quick_security")
        .setLabel("🛡️ Security")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("quick_dashboard")
        .setLabel("📊 Dashboard")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row1, row2],
      flags: MessageFlags.Ephemeral,
    });
  },

  async handleQuickAction(interaction, action) {
    // Defer reply to allow time to process
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    switch (action) {
      case "warn":
      case "kick":
      case "ban":
      case "timeout":
        const embed = new EmbedBuilder()
          .setTitle(
            `⚡ Quick ${action.charAt(0).toUpperCase() + action.slice(1)}`
          )
          .setDescription(
            `Use \`/${action}\` command with a user to ${action} them.\n\n` +
              `**Example:** \`/${action} user:@user reason:Spam\``
          )
          .setColor(0x5865f2)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        break;

      case "cases":
        // Redirect to cases command
        const casesEmbed = new EmbedBuilder()
          .setTitle("📋 Cases")
          .setDescription(
            "Use `/cases` to view moderation cases.\n\n**Quick access:** `/cases recent`"
          )
          .setColor(0x0099ff)
          .setTimestamp();

        await interaction.editReply({ embeds: [casesEmbed] });
        break;

      case "health":
        // Redirect to health command
        const healthEmbed = new EmbedBuilder()
          .setTitle("💚 Server Health")
          .setDescription("Use `/health` to check your server's health score.")
          .setColor(0x00ff00)
          .setTimestamp();

        await interaction.editReply({ embeds: [healthEmbed] });
        break;

      case "security":
        const config = await db.getServerConfig(interaction.guild.id);
        const securityEmbed = new EmbedBuilder()
          .setTitle("🛡️ Security Status")
          .addFields(
            {
              name: "Protection",
              value: [
                `Anti-Raid: ${config?.anti_raid_enabled ? "✅" : "❌"}`,
                `Anti-Nuke: ${config?.anti_nuke_enabled ? "✅" : "❌"}`,
                `Heat System: ${config?.heat_system_enabled ? "✅" : "❌"}`,
                `Auto-Mod: ${config?.auto_mod_enabled ? "✅" : "❌"}`,
              ].join("\n"),
              inline: true,
            },
            {
              name: "Quick Actions",
              value:
                "• `/security scan` - Scan for threats\n• `/dashboard security` - Detailed view",
              inline: false,
            }
          )
          .setColor(0x0099ff)
          .setTimestamp();

        await interaction.editReply({ embeds: [securityEmbed] });
        break;

      case "dashboard":
        // Redirect to dashboard command
        const dashboardEmbed = new EmbedBuilder()
          .setTitle("📊 Dashboard")
          .setDescription("Use `/dashboard` to view the server dashboard.")
          .setColor(0x5865f2)
          .setTimestamp();

        await interaction.editReply({ embeds: [dashboardEmbed] });
        break;
    }
  },
};
