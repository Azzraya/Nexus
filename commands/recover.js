const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const AutoRecovery = require("../utils/autoRecovery");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recover")
    .setDescription(
      "Auto-recovery system for server restoration "
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("snapshot")
        .setDescription("Create a recovery snapshot")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Snapshot type")
            .setRequired(true)
            .addChoices(
              { name: "Full (Channels + Roles)", value: "full" },
              { name: "Channels Only", value: "channels" },
              { name: "Roles Only", value: "roles" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for snapshot")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List recovery snapshots")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("restore")
        .setDescription("Restore from a snapshot")
        .addIntegerOption((option) =>
          option
            .setName("snapshot_id")
            .setDescription("Snapshot ID to restore")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "snapshot") {
      await interaction.deferReply();

      const type = interaction.options.getString("type");
      const reason =
        interaction.options.getString("reason") || "Manual snapshot";

      await AutoRecovery.createSnapshot(interaction.guild, type, reason);

      await interaction.editReply({
        content: `✅ Recovery snapshot created (${type})`,
      });
    } else if (subcommand === "list") {
      const snapshots = await db.getRecoverySnapshots(interaction.guild.id);

      if (snapshots.length === 0) {
        return interaction.reply({
          content: "❌ No snapshots found. Create one with `/recover snapshot`",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("💾 Recovery Snapshots")
        .setDescription(
          snapshots
            .map(
              (s) =>
                `**${s.id}.** ${s.snapshot_type} - ${new Date(
                  s.created_at
                ).toLocaleString()}\n   Reason: ${s.reason}`
            )
            .join("\n\n")
        )
        .setColor(0x0099ff)
        .setFooter({ text: `${snapshots.length} snapshots available` });

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "restore") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const snapshotId = interaction.options.getInteger("snapshot_id");

      try {
        const result = await AutoRecovery.recover(
          interaction.guild,
          snapshotId
        );

        const embed = new EmbedBuilder()
          .setTitle("✅ Recovery Complete")
          .setDescription(`Successfully recovered ${result.recovered} items`)
          .addFields({
            name: "Recovered Items",
            value:
              result.items.length > 0
                ? result.items.map((i) => `${i.type}: ${i.name}`).join("\n")
                : "No items recovered",
            inline: false,
          })
          .setColor(0x00ff00);

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        await interaction.editReply({
          content: `❌ Recovery failed: ${error.message}`,
        });
      }
    }
  },
};
