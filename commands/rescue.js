const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require("discord.js");
const RescueKey = require("../utils/rescueKey");
const Owner = require("../utils/owner");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rescue")
    .setDescription("Manage rescue key for bot ownership recovery")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Set up rescue key with authenticator (OWNER ONLY)")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View your rescue key setup (OWNER ONLY)")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("regenerate")
        .setDescription("Regenerate rescue key (OWNER ONLY)")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("use")
        .setDescription("Use rescue key to claim ownership")
        .addStringOption((option) =>
          option
            .setName("server_id")
            .setDescription("The server ID you lost access to")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("code")
            .setDescription("6-digit authenticator code")
            .setRequired(true)
            .setMinLength(6)
            .setMaxLength(6)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "setup") {
      // Only bot owner can set up rescue key
      if (!Owner.isOwner(interaction.user.id)) {
        return interaction.reply(ErrorMessages.ownerOnly());
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const result = await RescueKey.setKey(
        interaction.guild.id,
        interaction.user.id
      );

      const embed = new EmbedBuilder()
        .setTitle("🔑 Rescue Key Setup")
        .setDescription(
          "Scan the QR code with Google Authenticator or any TOTP app to set up your rescue key."
        )
        .addFields({
          name: "⚠️ IMPORTANT",
          value: [
            "• Save this QR code securely!",
            "• If you lose access to your physical owner account, you'll need the authenticator code to recover.",
            "• This rescue key grants you NEXUS owner permissions, not Discord ownership.",
            "• Keep your authenticator app secure!",
          ].join("\n"),
          inline: false,
        })
        .setColor(0xff8800)
        .setTimestamp();

      // Send QR code as attachment if available
      if (result.qrCode) {
        const buffer = Buffer.from(result.qrCode.split(",")[1], "base64");
        const attachment = new AttachmentBuilder(buffer, {
          name: "rescue-qr.png",
        });
        embed.setImage("attachment://rescue-qr.png");
        await interaction.editReply({
          embeds: [embed],
          files: [attachment],
        });
      } else {
        // Fallback: show manual entry code
        embed.addFields({
          name: "Manual Entry Code",
          value: `\`${result.secret}\``,
          inline: false,
        });
        await interaction.editReply({ embeds: [embed] });
      }
    } else if (subcommand === "view") {
      // Only bot owner can view rescue key
      if (!Owner.isOwner(interaction.user.id)) {
        return interaction.reply(ErrorMessages.ownerOnly());
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let rescueKey = await RescueKey.getKey(interaction.guild.id);

      if (!rescueKey) {
        return interaction.editReply({
          content:
            "❌ No rescue key set up. Use `/rescue setup` to create one.",
        });
      }

      const qrCode = await RescueKey.getQRCode(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle("🔑 Recovery Key")
        .setDescription(
          "If you lose control over Nexus in your server (you can't access your owner account and no one is above Nexus ownership), use the authenticator code from your app to recover."
        )
        .addFields({
          name: "⚠️ IMPORTANT",
          value: [
            "• Keep your authenticator app secure!",
            "• Anyone with access to your authenticator can get dangerous Nexus permissions",
            "• This rescue key is used ONLY when you lose physical owner account access",
            "• This rescue key grants you NEXUS owner permissions, not Discord ownership.",
          ].join("\n"),
          inline: false,
        })
        .setColor(0xff8800)
        .setTimestamp();

      if (qrCode) {
        const buffer = Buffer.from(qrCode.split(",")[1], "base64");
        const attachment = new AttachmentBuilder(buffer, {
          name: "rescue-qr.png",
        });
        embed.setImage("attachment://rescue-qr.png");
        await interaction.editReply({
          embeds: [embed],
          files: [attachment],
        });
      } else {
        await interaction.editReply({ embeds: [embed] });
      }
    } else if (subcommand === "regenerate") {
      // Only bot owner can regenerate
      if (!Owner.isOwner(interaction.user.id)) {
        return interaction.reply(ErrorMessages.ownerOnly());
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const result = await RescueKey.regenerateKey(
        interaction.guild.id,
        interaction.user.id
      );

      const embed = new EmbedBuilder()
        .setTitle("✅ Rescue Key Regenerated")
        .setDescription(
          "Your rescue key has been regenerated. The old authenticator code is no longer valid. Scan the new QR code with your authenticator app."
        )
        .setColor(0x00ff00)
        .setTimestamp();

      if (result.qrCode) {
        const buffer = Buffer.from(result.qrCode.split(",")[1], "base64");
        const attachment = new AttachmentBuilder(buffer, {
          name: "rescue-qr.png",
        });
        embed.setImage("attachment://rescue-qr.png");
        await interaction.editReply({
          embeds: [embed],
          files: [attachment],
        });
      } else {
        embed.addFields({
          name: "Manual Entry Code",
          value: `\`${result.secret}\``,
          inline: false,
        });
        await interaction.editReply({ embeds: [embed] });
      }
    } else if (subcommand === "use") {
      const serverId = interaction.options.getString("server_id");
      const code = interaction.options.getString("code");

      // Validate server ID format
      if (!/^\d{17,19}$/.test(serverId)) {
        return interaction.reply({
          content: "❌ Invalid server ID format!",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Validate code format (6 digits)
      if (!/^\d{6}$/.test(code)) {
        return interaction.reply({
          content: "❌ Invalid code format! Must be 6 digits.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Check if user is in the server
      let targetGuild;
      try {
        targetGuild = await interaction.client.guilds.fetch(serverId);
        if (!targetGuild.members.cache.has(interaction.user.id)) {
          return interaction.editReply({
            content:
              "❌ You must be a member of that server to use the rescue key!",
          });
        }
      } catch (error) {
        return interaction.editReply({
          content: "❌ Server not found or bot is not in that server!",
        });
      }

      const result = await RescueKey.useKey(
        serverId,
        code,
        interaction.user.id
      );

      if (!result.valid) {
        return interaction.editReply({
          ErrorMessages.commandFailed(result.message).embeds[0].description,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Rescue Key Used Successfully")
        .setDescription(
          `You have successfully claimed Nexus ownership in **${targetGuild.name}** using the rescue key.`
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
