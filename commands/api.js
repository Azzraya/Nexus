const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const crypto = require("crypto");
const db = require("../utils/database");
const Owner = require("../utils/owner");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("api")
    .setDescription(
      "Manage REST API keys for external integrations "
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a new API key")
        .addStringOption((option) =>
          option.setName("name").setDescription("Key name").setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("permissions")
            .setDescription("Comma-separated permissions (read,write,admin)")
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("expires_days")
            .setDescription("Days until expiration (0 = never)")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(365)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List all API keys")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("revoke")
        .setDescription("Revoke an API key")
        .addStringOption((option) =>
          option
            .setName("key_id")
            .setDescription("Key ID to revoke")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // Only bot owner can manage API keys
    if (!Owner.isOwner(interaction.user.id)) {
      return interaction.reply({
        content: "❌ Only the bot owner can manage API keys!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      const name = interaction.options.getString("name");
      const permsString =
        interaction.options.getString("permissions") || "read";
      const expiresDays = interaction.options.getInteger("expires_days") || 0;

      const permissions = permsString.split(",").map((p) => p.trim());
      const key = crypto.randomBytes(32).toString("hex");
      const keyHash = crypto.createHash("sha256").update(key).digest("hex");

      const expiresAt =
        expiresDays > 0 ? Date.now() + expiresDays * 86400000 : null;

      await db.createAPIKey(
        interaction.guild.id,
        keyHash,
        name,
        permissions,
        interaction.user.id,
        expiresAt
      );

      const embed = new EmbedBuilder()
        .setTitle("🔑 API Key Created")
        .setDescription(
          `**Name:** ${name}\n**Permissions:** ${permissions.join(
            ", "
          )}\n**Expires:** ${
            expiresAt ? new Date(expiresAt).toLocaleDateString() : "Never"
          }`
        )
        .addFields({
          name: "⚠️ IMPORTANT - Save This Key",
          value: `\`\`\`${key}\`\`\`\nThis key will not be shown again!`,
          inline: false,
        })
        .setColor(0x00ff00)
        .setFooter({
          text: "Use this key in the Authorization header: Bearer <key>",
        });

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } else if (subcommand === "list") {
      const keys = await db.getAPIKeys(interaction.guild.id);

      if (keys.length === 0) {
        return interaction.reply({
          content: "❌ No API keys found. Create one with `/api create`",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🔑 API Keys")
        .setDescription(
          keys
            .map(
              (k) =>
                `**${k.id}.** ${k.name}\n   Permissions: ${k.permissions.join(
                  ", "
                )}\n   Created: ${new Date(
                  k.created_at
                ).toLocaleDateString()}\n   Last Used: ${
                  k.last_used
                    ? new Date(k.last_used).toLocaleDateString()
                    : "Never"
                }\n   Status: ${k.enabled ? "✅ Active" : "❌ Disabled"}`
            )
            .join("\n\n")
        )
        .setColor(0x0099ff)
        .setFooter({ text: `Total: ${keys.length} keys` });

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } else if (subcommand === "revoke") {
      const keyId = interaction.options.getString("key_id");

      // Update to disable instead of delete
      await db.updateAPIKey(keyId, { enabled: 0 });

      await interaction.reply({
        content: `✅ API key #${keyId} revoked`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
