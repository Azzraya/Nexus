const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("voice")
    .setDescription("Voice channel moderation")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("move")
        .setDescription("Move a user to another voice channel")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to move")
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Target voice channel")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disconnect")
        .setDescription("Disconnect a user from voice")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to disconnect")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("mute")
        .setDescription("Mute a user in voice")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to mute")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("unmute")
        .setDescription("Unmute a user in voice")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to unmute")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const user = interaction.options.getUser("user");

    try {
      const member = await interaction.guild.members.fetch(user.id);

      if (subcommand === "move") {
        const channel = interaction.options.getChannel("channel");
        if (channel.type !== 2) {
          return interaction.reply({
            content: "❌ Target must be a voice channel!",
            flags: MessageFlags.Ephemeral,
          });
        }

        await member.voice.setChannel(channel);
        await interaction.reply({
          embeds: [
            {
              title: "✅ User Moved",
              description: `Moved ${user.tag} to ${channel.name}`,
              color: 0x00ff00,
            },
          ],
        });
      } else if (subcommand === "disconnect") {
        await member.voice.disconnect();
        await interaction.reply({
          embeds: [
            {
              title: "✅ User Disconnected",
              description: `Disconnected ${user.tag} from voice`,
              color: 0x00ff00,
            },
          ],
        });
      } else if (subcommand === "mute") {
        await member.voice.setMute(true);
        await interaction.reply({
          embeds: [
            {
              title: "✅ User Muted",
              description: `Muted ${user.tag} in voice`,
              color: 0x00ff00,
            },
          ],
        });
      } else if (subcommand === "unmute") {
        await member.voice.setMute(false);
        await interaction.reply({
          embeds: [
            {
              title: "✅ User Unmuted",
              description: `Unmuted ${user.tag} in voice`,
              color: 0x00ff00,
            },
          ],
        });
      }
    } catch (error) {
      await interaction.reply({
        content: `❌ Failed: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
