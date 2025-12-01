const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const fs = require("fs");
const path = require("path");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Backup server configuration and data")
    .addSubcommand((subcommand) =>
      subcommand.setName("create").setDescription("Create a backup")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("restore")
        .setDescription("Restore from backup")
        .addStringOption((option) =>
          option
            .setName("backup_id")
            .setDescription("Backup ID to restore")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List all backups")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      await interaction.deferReply();

      // Fetch all backup data in parallel for better performance (EXCEEDS WICK)
      const [config, modLogs, warnings] = await Promise.all([
        db.getServerConfig(interaction.guild.id),
        db.getModLogs(interaction.guild.id, null, 1000),
        new Promise((resolve, reject) => {
          db.db.all(
            "SELECT * FROM warnings WHERE guild_id = ?",
            [interaction.guild.id],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        }),
      ]);
      const automodRules = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM automod_rules WHERE guild_id = ?",
          [interaction.guild.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      // Backup server structure
      const serverData = {
        name: interaction.guild.name,
        description: interaction.guild.description,
        icon: interaction.guild.iconURL(),
        banner: interaction.guild.bannerURL(),
        verificationLevel: interaction.guild.verificationLevel,
        defaultMessageNotifications:
          interaction.guild.defaultMessageNotifications,
        explicitContentFilter: interaction.guild.explicitContentFilter,
        mfaLevel: interaction.guild.mfaLevel,
        preferredLocale: interaction.guild.preferredLocale,
        nsfwLevel: interaction.guild.nsfwLevel,
        premiumTier: interaction.guild.premiumTier,
        systemChannelId: interaction.guild.systemChannelId,
        rulesChannelId: interaction.guild.rulesChannelId,
        publicUpdatesChannelId: interaction.guild.publicUpdatesChannelId,
        afkChannelId: interaction.guild.afkChannelId,
        afkTimeout: interaction.guild.afkTimeout,
        vanityURLCode: interaction.guild.vanityURLCode,
        memberCount: interaction.guild.memberCount,
      };

      // Backup roles (excluding @everyone)
      const roles = interaction.guild.roles.cache
        .filter((role) => role.id !== interaction.guild.id)
        .map((role) => ({
          id: role.id,
          name: role.name,
          color: role.color,
          hoist: role.hoist,
          position: role.position,
          mentionable: role.mentionable,
          permissions: role.permissions.bitfield.toString(),
          icon: role.iconURL(),
          unicodeEmoji: role.unicodeEmoji,
        }))
        .sort((a, b) => b.position - a.position);

      // Backup channels
      const channels = interaction.guild.channels.cache.map((channel) => {
        const channelData = {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          position: channel.position,
          parentId: channel.parentId,
          nsfw: channel.nsfw,
        };

        // Text channel specific
        if (channel.type === 0) {
          // GuildText
          channelData.topic = channel.topic;
          channelData.rateLimitPerUser = channel.rateLimitPerUser;
          channelData.defaultAutoArchiveDuration =
            channel.defaultAutoArchiveDuration;
        }

        // Voice channel specific
        if (channel.type === 2) {
          // GuildVoice
          channelData.bitrate = channel.bitrate;
          channelData.userLimit = channel.userLimit;
          channelData.rtcRegion = channel.rtcRegion;
        }

        // Forum channel specific
        if (channel.type === 15) {
          // GuildForum
          channelData.topic = channel.topic;
          channelData.defaultAutoArchiveDuration =
            channel.defaultAutoArchiveDuration;
          channelData.defaultReactionEmoji = channel.defaultReactionEmoji;
          channelData.defaultThreadRateLimitPerUser =
            channel.defaultThreadRateLimitPerUser;
        }

        // Backup permission overwrites (if available)
        if (
          channel.permissionOverwrites &&
          channel.permissionOverwrites.cache
        ) {
          channelData.permissionOverwrites =
            channel.permissionOverwrites.cache.map((overwrite) => ({
              id: overwrite.id,
              type: overwrite.type,
              allow: overwrite.allow.bitfield.toString(),
              deny: overwrite.deny.bitfield.toString(),
            }));
        } else {
          channelData.permissionOverwrites = [];
        }

        return channelData;
      });

      // Backup categories
      const categories = interaction.guild.channels.cache
        .filter((ch) => ch.type === 4)
        .map((category) => {
          const categoryData = {
            id: category.id,
            name: category.name,
            position: category.position,
          };

          // Backup permission overwrites (if available)
          if (
            category.permissionOverwrites &&
            category.permissionOverwrites.cache
          ) {
            categoryData.permissionOverwrites =
              category.permissionOverwrites.cache.map((overwrite) => ({
                id: overwrite.id,
                type: overwrite.type,
                allow: overwrite.allow.bitfield.toString(),
                deny: overwrite.deny.bitfield.toString(),
              }));
          } else {
            categoryData.permissionOverwrites = [];
          }

          return categoryData;
        })
        .sort((a, b) => a.position - b.position);

      // Backup emojis
      const emojis = interaction.guild.emojis.cache.map((emoji) => ({
        id: emoji.id,
        name: emoji.name,
        animated: emoji.animated,
        url: emoji.url,
        roles: emoji.roles.cache.map((r) => r.id),
      }));

      // Backup stickers
      const stickers = interaction.guild.stickers.cache.map((sticker) => ({
        id: sticker.id,
        name: sticker.name,
        description: sticker.description,
        tags: sticker.tags,
        type: sticker.type,
        format: sticker.format,
        url: sticker.url,
      }));

      const backup = {
        guild_id: interaction.guild.id,
        timestamp: Date.now(),
        config,
        modLogs,
        warnings,
        automodRules,
        serverData,
        roles,
        channels,
        categories,
        emojis,
        stickers,
        stats: {
          channels: interaction.guild.channels.cache.size,
          members: interaction.guild.memberCount,
          roles: interaction.guild.roles.cache.size,
          emojis: interaction.guild.emojis.cache.size,
          stickers: interaction.guild.stickers.cache.size,
        },
      };

      const backupDir = path.join(__dirname, "..", "backups");
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const backupId = `backup_${interaction.guild.id}_${Date.now()}`;
      const backupPath = path.join(backupDir, `${backupId}.json`);

      fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

      // Save backup record
      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO backups (guild_id, backup_id, file_path, created_at) VALUES (?, ?, ?, ?)",
          [interaction.guild.id, backupId, backupPath, Date.now()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await interaction.editReply({
        embeds: [
          {
            title: "✅ Backup Created",
            description: `Backup ID: \`${backupId}\`\n**Included:**\n- Server Configuration\n- ${modLogs.length} Moderation Logs\n- ${warnings.length} Warnings\n- ${automodRules.length} Auto-Mod Rules\n- Server Structure (${roles.length} roles, ${channels.length} channels, ${categories.length} categories)\n- ${emojis.length} Emojis\n- ${stickers.length} Stickers`,
            color: 0x00ff00,
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } else if (subcommand === "list") {
      const backups = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM backups WHERE guild_id = ? ORDER BY created_at DESC LIMIT 10",
          [interaction.guild.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (backups.length === 0) {
        return interaction.reply({
          content: "❌ No backups found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const list = backups
        .map(
          (b) => `\`${b.backup_id}\` - <t:${Math.floor(b.created_at / 1000)}:R>`
        )
        .join("\n");

      const embed = new EmbedBuilder()
        .setTitle("📦 Backups")
        .setDescription(list)
        .setColor(0x0099ff)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "restore") {
      const backupId = interaction.options.getString("backup_id");

      const backupRecord = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM backups WHERE guild_id = ? AND backup_id = ?",
          [interaction.guild.id, backupId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!backupRecord) {
        return interaction.reply({
          content: "❌ Backup not found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const backupData = JSON.parse(
        fs.readFileSync(backupRecord.file_path, "utf8")
      );

      // Restore config
      if (backupData.config) {
        await db.setServerConfig(interaction.guild.id, backupData.config);
      }

      await interaction.reply({
        embeds: [
          {
            title: "✅ Backup Restored",
            description: `Restored backup: \`${backupId}\``,
            color: 0x00ff00,
          },
        ],
      });
    }
  },
};
