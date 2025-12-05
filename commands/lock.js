const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Manage server locks")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a lock")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Type of lock to add")
            .setRequired(true)
            .addChoices(
              { name: "Channel", value: "channel" },
              { name: "Channels", value: "channels" },
              { name: "Joins", value: "joins" },
              { name: "Roles", value: "roles" }
            )
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to lock (for channel type)")
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to lock (for roles type)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a lock")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Type of lock to remove")
            .setRequired(true)
            .addChoices(
              { name: "Channel", value: "channel" },
              { name: "Channels", value: "channels" },
              { name: "Joins", value: "joins" },
              { name: "Roles", value: "roles" }
            )
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to unlock (for channel type)")
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to unlock (for roles type)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("update")
        .setDescription(
          "Add a new announcement to the temporary announcements channel"
        )
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Announcement message")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("Check the current ongoing lockdown modes")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const type = interaction.options.getString("type");

      if (type === "channel") {
        const channel = interaction.options.getChannel("channel");
        if (!channel) {
          return interaction.reply({
            content: "Γ¥î Please specify a channel!",
            flags: MessageFlags.Ephemeral,
          });
        }

        // Lock channel (remove send messages permission for @everyone)
        const everyone = interaction.guild.roles.everyone;
        await channel.permissionOverwrites.edit(everyone, {
          SendMessages: false,
        });

        await new Promise((resolve, reject) => {
          db.db.run(
            "INSERT OR REPLACE INTO locked_channels (guild_id, channel_id) VALUES (?, ?)",
            [interaction.guild.id, channel.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        await interaction.reply({
          embeds: [
            {
              title: "Γ£à Channel Locked",
              description: `${channel} has been locked.`,
              color: 0xff0000,
            },
          ],
        });
      } else if (type === "channels") {
        // Defer reply since this might take a while
        await interaction.deferReply();

        // Lock all public channels
        const publicChannels = interaction.guild.channels.cache.filter(
          (ch) =>
            ch.type === ChannelType.GuildText &&
            ch
              .permissionsFor(interaction.guild.roles.everyone)
              .has("ViewChannel")
        );

        const everyone = interaction.guild.roles.everyone;
        let locked = 0;
        let failed = 0;

        for (const channel of publicChannels.values()) {
          try {
            await channel.permissionOverwrites.edit(everyone, {
              SendMessages: false,
            });
            await new Promise((resolve, reject) => {
              db.db.run(
                "INSERT OR REPLACE INTO locked_channels (guild_id, channel_id) VALUES (?, ?)",
                [interaction.guild.id, channel.id],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
            locked++;
          } catch (error) {
            failed++;
            const ErrorHandler = require("../utils/errorHandler");
            ErrorHandler.logError(
              error,
              `lock [${interaction.guild.id}]`,
              `Lock channel ${channel.id}`
            );
          }
        }

        await interaction.editReply({
          embeds: [
            {
              title: "Γ£à All Public Channels Locked",
              description: `Locked ${locked} channel(s).${
                failed > 0
                  ? ` Failed to lock ${failed} channel(s) (missing permissions).`
                  : ""
              }`,
              color: 0xff0000,
            },
          ],
        });
      } else if (type === "joins") {
        // Enable join lock (kick/ban new members)
        interaction.client.antiRaid.lockdown.set(interaction.guild.id, true);
        await db.setServerConfig(interaction.guild.id, {
          join_lock_enabled: 1,
        });

        await interaction.reply({
          embeds: [
            {
              title: "Γ£à Join Lock Enabled",
              description: "New members joining will be kicked/banned.",
              color: 0xff0000,
            },
          ],
        });
      } else if (type === "roles") {
        const role = interaction.options.getRole("role");
        if (!role) {
          return interaction.reply({
            content: "Γ¥î Please specify a role!",
            flags: MessageFlags.Ephemeral,
          });
        }

        // Lock role (remove ability to assign it)
        await new Promise((resolve, reject) => {
          db.db.run(
            "INSERT OR REPLACE INTO locked_roles (guild_id, role_id) VALUES (?, ?)",
            [interaction.guild.id, role.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        await interaction.reply({
          embeds: [
            {
              title: "Γ£à Role Locked",
              description: `${role} has been locked.`,
              color: 0xff0000,
            },
          ],
        });
      }
    } else if (subcommand === "remove") {
      const type = interaction.options.getString("type");

      if (type === "channel") {
        const channel = interaction.options.getChannel("channel");
        if (!channel) {
          return interaction.reply({
            content: "Γ¥î Please specify a channel!",
            flags: MessageFlags.Ephemeral,
          });
        }

        // Unlock channel
        const everyone = interaction.guild.roles.everyone;
        await channel.permissionOverwrites.edit(everyone, {
          SendMessages: null,
        });

        await new Promise((resolve, reject) => {
          db.db.run(
            "DELETE FROM locked_channels WHERE guild_id = ? AND channel_id = ?",
            [interaction.guild.id, channel.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        await interaction.reply({
          embeds: [
            {
              title: "Γ£à Channel Unlocked",
              description: `${channel} has been unlocked.`,
              color: 0x00ff00,
            },
          ],
        });
      } else if (type === "channels") {
        // Unlock all locked channels
        const lockedChannels = await new Promise((resolve, reject) => {
          db.db.all(
            "SELECT channel_id FROM locked_channels WHERE guild_id = ?",
            [interaction.guild.id],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        });

        const everyone = interaction.guild.roles.everyone;
        let unlocked = 0;

        for (const row of lockedChannels) {
          const channel = interaction.guild.channels.cache.get(row.channel_id);
          if (channel) {
            try {
              await channel.permissionOverwrites.edit(everyone, {
                SendMessages: null,
              });
              unlocked++;
            } catch (error) {
              const ErrorHandler = require("../utils/errorHandler");
              ErrorHandler.logError(
                error,
                `lock [${interaction.guild.id}]`,
                `Lock channel ${channel.id}`
              );
            }
          }
        }

        await new Promise((resolve, reject) => {
          db.db.run(
            "DELETE FROM locked_channels WHERE guild_id = ?",
            [interaction.guild.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        await interaction.reply({
          embeds: [
            {
              title: "Γ£à All Channels Unlocked",
              description: `Unlocked ${unlocked} channel(s).`,
              color: 0x00ff00,
            },
          ],
        });
      } else if (type === "joins") {
        interaction.client.antiRaid.lockdown.set(interaction.guild.id, false);
        await db.setServerConfig(interaction.guild.id, {
          join_lock_enabled: 0,
        });

        await interaction.reply({
          embeds: [
            {
              title: "Γ£à Join Lock Disabled",
              description: "New members can now join normally.",
              color: 0x00ff00,
            },
          ],
        });
      } else if (type === "roles") {
        const role = interaction.options.getRole("role");
        if (!role) {
          return interaction.reply({
            content: "Γ¥î Please specify a role!",
            flags: MessageFlags.Ephemeral,
          });
        }

        await new Promise((resolve, reject) => {
          db.db.run(
            "DELETE FROM locked_roles WHERE guild_id = ? AND role_id = ?",
            [interaction.guild.id, role.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        await interaction.reply({
          embeds: [
            {
              title: "Γ£à Role Unlocked",
              description: `${role} has been unlocked.`,
              color: 0x00ff00,
            },
          ],
        });
      }
    } else if (subcommand === "update") {
      const message = interaction.options.getString("message");

      // Get or create announcements channel
      let announcementsChannel = interaction.guild.channels.cache.find((ch) =>
        ch.name.toLowerCase().includes("announcements")
      );

      if (!announcementsChannel) {
        announcementsChannel = await interaction.guild.channels.create({
          name: "announcements",
          type: ChannelType.GuildText,
          reason: "Lock system announcements",
        });
      }

      await announcementsChannel.send({
        embeds: [
          {
            title: "≡ƒöÆ Lockdown Announcement",
            description: message,
            color: 0xff0000,
            timestamp: new Date().toISOString(),
          },
        ],
      });

      await interaction.reply({
        content: `Γ£à Announcement sent to ${announcementsChannel}`,
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "view") {
      const lockedChannels = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT channel_id FROM locked_channels WHERE guild_id = ?",
          [interaction.guild.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      const lockedRoles = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT role_id FROM locked_roles WHERE guild_id = ?",
          [interaction.guild.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      const config = await db.getServerConfig(interaction.guild.id);
      const joinLock = config?.join_lock_enabled === 1;
      const lockdown = interaction.client.antiRaid.lockdown.get(
        interaction.guild.id
      );

      const embed = new EmbedBuilder()
        .setTitle("≡ƒöÆ Current Lockdown Status")
        .addFields(
          {
            name: "Join Lock",
            value: joinLock || lockdown ? "≡ƒöÆ Active" : "≡ƒöô Inactive",
            inline: true,
          },
          {
            name: "Locked Channels",
            value: `${lockedChannels.length}`,
            inline: true,
          },
          {
            name: "Locked Roles",
            value: `${lockedRoles.length}`,
            inline: true,
          }
        )
        .setColor(0x0099ff)
        .setTimestamp();

      if (lockedChannels.length > 0) {
        const channelList = lockedChannels
          .slice(0, 10)
          .map((c) => `<#${c.channel_id}>`)
          .join(", ");
        embed.addFields({
          name: "Locked Channels",
          value: channelList,
          inline: false,
        });
      }

      if (lockedRoles.length > 0) {
        const roleList = lockedRoles
          .slice(0, 10)
          .map((r) => `<@&${r.role_id}>`)
          .join(", ");
        embed.addFields({
          name: "Locked Roles",
          value: roleList,
          inline: false,
        });
      }

      await interaction.reply({ embeds: [embed] });
    }
  },
};
