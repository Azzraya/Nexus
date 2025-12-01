const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Configure anti-raid protection")
    .addSubcommand((subcommand) =>
      subcommand.setName("enable").setDescription("Enable anti-raid protection")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Disable anti-raid protection")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("config")
        .setDescription("Configure anti-raid settings")
        .addIntegerOption((option) =>
          option
            .setName("maxjoins")
            .setDescription("Max joins before trigger (default: 5)")
            .setMinValue(2)
            .setMaxValue(20)
        )
        .addIntegerOption((option) =>
          option
            .setName("timewindow")
            .setDescription("Time window in seconds (default: 10)")
            .setMinValue(5)
            .setMaxValue(60)
        )
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Action to take")
            .addChoices(
              { name: "Ban", value: "ban" },
              { name: "Kick", value: "kick" },
              { name: "Quarantine", value: "quarantine" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("status").setDescription("Check anti-raid status")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const config = interaction.client.antiRaid.config.get(
      interaction.guild.id
    ) || {
      enabled: true,
      maxJoins: 5,
      timeWindow: 10000,
      action: "ban",
      antiNuke: true,
    };

    if (subcommand === "enable") {
      config.enabled = true;
      interaction.client.antiRaid.config.set(interaction.guild.id, config);
      await interaction.reply({
        embeds: [
          {
            title: "✅ Anti-Raid Enabled",
            description: "Anti-raid protection is now active",
            color: 0x00ff00,
          },
        ],
      });
    } else if (subcommand === "disable") {
      config.enabled = false;
      interaction.client.antiRaid.config.set(interaction.guild.id, config);
      await interaction.reply({
        embeds: [
          {
            title: "❌ Anti-Raid Disabled",
            description: "Anti-raid protection is now inactive",
            color: 0xff0000,
          },
        ],
      });
    } else if (subcommand === "config") {
      const maxJoins = interaction.options.getInteger("maxjoins");
      const timeWindow = interaction.options.getInteger("timewindow");
      const action = interaction.options.getString("action");

      if (maxJoins) config.maxJoins = maxJoins;
      if (timeWindow) config.timeWindow = timeWindow * 1000;
      if (action) config.action = action;

      interaction.client.antiRaid.config.set(interaction.guild.id, config);
      await interaction.reply({
        embeds: [
          {
            title: "⚙️ Anti-Raid Configuration Updated",
            fields: [
              { name: "Max Joins", value: `${config.maxJoins}`, inline: true },
              {
                name: "Time Window",
                value: `${config.timeWindow / 1000}s`,
                inline: true,
              },
              { name: "Action", value: config.action, inline: true },
            ],
            color: 0x0099ff,
          },
        ],
      });
    } else if (subcommand === "status") {
      const embed = new EmbedBuilder()
        .setTitle("🛡️ Anti-Raid Status")
        .addFields(
          {
            name: "Status",
            value: config.enabled ? "✅ Enabled" : "❌ Disabled",
            inline: true,
          },
          { name: "Max Joins", value: `${config.maxJoins}`, inline: true },
          {
            name: "Time Window",
            value: `${config.timeWindow / 1000}s`,
            inline: true,
          },
          { name: "Action", value: config.action, inline: true },
          {
            name: "Anti-Nuke",
            value: config.antiNuke ? "✅ Enabled" : "❌ Disabled",
            inline: true,
          },
          {
            name: "Lockdown",
            value: interaction.client.antiRaid.lockdown.get(
              interaction.guild.id
            )
              ? "🔒 Active"
              : "🔓 Inactive",
            inline: true,
          }
        )
        .setColor(0x0099ff)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};
