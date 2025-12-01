const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bulk")
    .setDescription("Bulk moderation actions ")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ban")
        .setDescription("Ban multiple users at once")
        .addStringOption((option) =>
          option
            .setName("users")
            .setDescription("User IDs separated by commas or spaces")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for bans")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("kick")
        .setDescription("Kick multiple users at once")
        .addStringOption((option) =>
          option
            .setName("users")
            .setDescription("User IDs separated by commas or spaces")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for kicks")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("timeout")
        .setDescription("Timeout multiple users at once")
        .addStringOption((option) =>
          option
            .setName("users")
            .setDescription("User IDs separated by commas or spaces")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("duration")
            .setDescription("Duration (e.g., 1h, 30m)")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for timeouts")
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const usersInput = interaction.options.getString("users");
    const reason = interaction.options.getString("reason") || "Bulk action";

    const userIds = usersInput
      .split(/[,\s]+/)
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (userIds.length === 0) {
      return interaction.reply({
        content: "❌ No valid user IDs provided!",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (userIds.length > 50) {
      return interaction.reply({
        content: "❌ Maximum 50 users at once!",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    let success = 0;
    let failed = 0;
    const errors = [];

    // Check if moderator is server owner (owners can moderate anyone)
    const isOwner = interaction.member.id === interaction.guild.ownerId;

    for (const userId of userIds) {
      try {
        // Skip self and bot
        if (userId === interaction.user.id) {
          failed++;
          errors.push(`${userId}: Cannot ${subcommand} yourself`);
          continue;
        }
        if (userId === interaction.client.user.id) {
          failed++;
          errors.push(`${userId}: Cannot ${subcommand} the bot`);
          continue;
        }

        // Prevent moderating the server owner
        if (userId === interaction.guild.ownerId) {
          failed++;
          errors.push(`${userId}: Cannot ${subcommand} the server owner`);
          continue;
        }

        const user = await interaction.client.users.fetch(userId);
        const member = await interaction.guild.members.fetch(userId);

        // Check role hierarchy (unless moderator is owner)
        if (
          !isOwner &&
          member.roles.highest.position >=
            interaction.member.roles.highest.position
        ) {
          failed++;
          errors.push(
            `${userId}: Cannot ${subcommand} user with equal or higher roles`
          );
          continue;
        }

        if (subcommand === "ban") {
          if (!member.manageable) {
            failed++;
            errors.push(`${userId}: Bot cannot ban this user`);
            continue;
          }
          await member.ban({ reason, deleteMessageDays: 1 });
          success++;
        } else if (subcommand === "kick") {
          if (!member.kickable) {
            failed++;
            errors.push(`${userId}: Bot cannot kick this user`);
            continue;
          }
          await member.kick(reason);
          success++;
        } else if (subcommand === "timeout") {
          if (!member.moderatable) {
            failed++;
            errors.push(`${userId}: Bot cannot timeout this user`);
            continue;
          }
          const duration = interaction.options.getString("duration");
          const ms = require("ms")(duration);
          await member.timeout(ms, reason);
          success++;
        }
      } catch (error) {
        failed++;
        errors.push(`${userId}: ${error.message}`);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`✅ Bulk ${subcommand.toUpperCase()} Complete`)
      .addFields(
        {
          name: "Success",
          value: `${success}`,
          inline: true,
        },
        {
          name: "Failed",
          value: `${failed}`,
          inline: true,
        },
        {
          name: "Total",
          value: `${userIds.length}`,
          inline: true,
        }
      )
      .setColor(success > 0 ? 0x00ff00 : 0xff0000)
      .setTimestamp();

    if (errors.length > 0 && errors.length <= 10) {
      embed.addFields({
        name: "Errors",
        value: errors.join("\n"),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
