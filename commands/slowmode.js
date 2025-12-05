const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Manage channel slowmode")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set slowmode for a channel")
        .addIntegerOption((option) =>
          option
            .setName("seconds")
            .setDescription("Slowmode in seconds (0-21600)")
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(21600)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to set slowmode")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove slowmode from a channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to remove slowmode")
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const channel =
      interaction.options.getChannel("channel") || interaction.channel;

    if (subcommand === "set") {
      const seconds = interaction.options.getInteger("seconds");

      try {
        await channel.setRateLimitPerUser(seconds);

        // Save to database
        await new Promise((resolve, reject) => {
          db.db.run(
            "INSERT OR REPLACE INTO slowmode_channels (guild_id, channel_id, rate_limit) VALUES (?, ?, ?)",
            [interaction.guild.id, channel.id, seconds],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        await interaction.reply({
          embeds: [
            {
              title: "✅ Slowmode Set",
              description: `Slowmode set to ${seconds} seconds in ${channel}`,
              color: 0x00ff00,
            },
          ],
        });
      } catch (error) {
        await interaction.reply(ErrorMessages.commandFailed(error.message));
      }
    } else if (subcommand === "remove") {
      try {
        await channel.setRateLimitPerUser(0);

        await new Promise((resolve, reject) => {
          db.db.run(
            "DELETE FROM slowmode_channels WHERE guild_id = ? AND channel_id = ?",
            [interaction.guild.id, channel.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        await interaction.reply({
          content: `✅ Slowmode removed from ${channel}`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        await interaction.reply(ErrorMessages.commandFailed(error.message));
      }
    }
  },
};
