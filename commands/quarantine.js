const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("quarantine")
    .setDescription("Manage member quarantine")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a member to quarantine")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to quarantine")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for quarantine")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription(
          "Remove a member from quarantine and restore their roles"
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to remove from quarantine")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const user = interaction.options.getUser("user");
      const reason =
        interaction.options.getString("reason") || "No reason provided";

      // Safety checks
      if (user.id === interaction.user.id) {
        return interaction.reply({
          content: "❌ You cannot quarantine yourself!",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (user.id === interaction.client.user.id) {
        return interaction.reply(ErrorMessages.cannotTargetBot());
      }

      // Prevent moderating the server owner
      if (user.id === interaction.guild.ownerId) {
        return interaction.reply(ErrorMessages.cannotTargetOwner());
      }

      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      if (!member) {
        return interaction.reply({
          ErrorMessages.userNotFound(),
          flags: MessageFlags.Ephemeral,
        });
      }

      // Check if moderator is server owner (owners can quarantine anyone)
      const isOwner = interaction.member.id === interaction.guild.ownerId;

      // Check role hierarchy (unless moderator is owner)
      if (
        !isOwner &&
        member.roles.highest.position >=
          interaction.member.roles.highest.position
      ) {
        return interaction.reply({
          content:
            "❌ You cannot quarantine someone with equal or higher roles!",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Check if bot can manage this member
      const botMember = await interaction.guild.members.fetch(
        interaction.client.user.id
      );
      if (!member.manageable) {
        return interaction.reply({
          content:
            "❌ I cannot manage this user (they have a higher role than me or are the server owner)!",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Defer reply since we're about to do heavy async work
      await interaction.deferReply();

      // Get or create quarantine role
      let quarantineRole = interaction.guild.roles.cache.find((r) =>
        r.name.toLowerCase().includes("quarantine")
      );

      if (!quarantineRole) {
        // Create quarantine role below bot's highest role
        const botHighestRole = botMember.roles.highest;
        quarantineRole = await interaction.guild.roles.create({
          name: "Quarantine",
          color: 0xff0000,
          reason: "Quarantine system",
          permissions: [], // NO base permissions - channel-specific overrides will handle access
          position:
            botHighestRole.position > 0 ? botHighestRole.position - 1 : 0,
        });
      } else {
        // Ensure quarantine role is below bot's highest role
        const botHighestRole = botMember.roles.highest;
        if (quarantineRole.position >= botHighestRole.position) {
          try {
            await quarantineRole.setPosition(botHighestRole.position - 1, {
              reason: "Quarantine system - ensure bot can manage role",
            });
          } catch (error) {
            return interaction.editReply({
              content: `❌ Cannot position quarantine role correctly. The bot's role must be higher than the quarantine role!`,
            });
          }
        }

        // Ensure quarantine role has no base permissions
        // Channel-specific overrides will handle access (prevents seeing hidden channels)
        const currentPerms = quarantineRole.permissions;
        if (currentPerms.bitfield !== 0n) {
          try {
            await quarantineRole.setPermissions([]);
          } catch (error) {
            console.error(
              `Failed to update quarantine role permissions: ${error.message}`
            );
          }
        }
      }

      // Store original roles and permissions
      const originalRoles = member.roles.cache
        .filter((r) => r.id !== interaction.guild.id)
        .map((r) => r.id);

      // Store which channels the user could view before quarantine
      const viewableChannels = [];
      for (const channel of interaction.guild.channels.cache.values()) {
        if (
          channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)
        ) {
          viewableChannels.push(channel.id);
        }
      }

      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT OR REPLACE INTO quarantine (guild_id, user_id, original_roles, reason, quarantined_by, quarantined_at) VALUES (?, ?, ?, ?, ?, ?)",
          [
            interaction.guild.id,
            user.id,
            JSON.stringify({
              roles: originalRoles,
              viewableChannels: viewableChannels,
            }),
            reason,
            interaction.user.id,
            Date.now(),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Remove all roles and add quarantine role
      try {
        await member.roles.set([quarantineRole.id], reason);

        // Override channel permissions to restrict the quarantined user
        // Only apply to channels the user could already view (don't grant access to hidden channels)
        const channelOverrides = {
          SendMessages: false, // Cannot send messages
          AddReactions: false, // Cannot react
          UseExternalEmojis: false, // Cannot use external emojis
          AttachFiles: false, // Cannot attach files
          EmbedLinks: false, // Cannot embed links
          MentionEveryone: false, // Cannot mention everyone
          UseApplicationCommands: false, // Cannot use slash commands
        };

        // Only apply to channels the user could already view
        // This prevents granting access to hidden channels
        let updated = 0;
        for (const channelId of viewableChannels) {
          const channel = interaction.guild.channels.cache.get(channelId);
          if (
            !channel ||
            (channel.type !== ChannelType.GuildText &&
              channel.type !== ChannelType.GuildVoice)
          ) {
            continue;
          }

          try {
            // Allow viewing only for channels they could already see
            const overrides = {
              ...channelOverrides,
              ViewChannel: true, // They could view it before, so allow viewing
            };

            await channel.permissionOverwrites.edit(
              quarantineRole.id,
              overrides
            );
            updated++;
          } catch (error) {
            // Skip if we can't edit (e.g., missing permissions on that channel)
            console.error(
              `Failed to update permissions for ${channel.name}: ${error.message}`
            );
          }
        }

        // Explicitly deny access to ALL channels they couldn't view
        // This prevents them from seeing hidden channels
        const allChannels = interaction.guild.channels.cache.filter(
          (ch) =>
            ch.type === ChannelType.GuildText ||
            ch.type === ChannelType.GuildVoice ||
            ch.type === ChannelType.GuildForum
        );

        for (const channel of allChannels.values()) {
          // Skip channels they can already view (handled above)
          if (viewableChannels.includes(channel.id)) {
            continue;
          }

          try {
            // Explicitly deny viewing for channels they couldn't see
            // This is critical to prevent seeing hidden channels
            await channel.permissionOverwrites.edit(quarantineRole.id, {
              ViewChannel: false,
            });
          } catch (error) {
            // Skip if we can't edit (might not have permission for that channel)
            console.error(
              `Failed to deny access for ${channel.name}: ${error.message}`
            );
          }
        }
      } catch (error) {
        return interaction.editReply({
          content: `❌ Failed to quarantine user: ${error.message}. Make sure the bot has "Manage Roles" permission and its role is higher than the quarantine role.`,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Member Quarantined")
        .setDescription(`${user.tag} has been quarantined.`)
        .addFields(
          { name: "User", value: `${user.tag} (${user.id})`, inline: true },
          { name: "Reason", value: reason, inline: false }
        )
        .setColor(0xff0000)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === "remove") {
      const user = interaction.options.getUser("user");

      const quarantineData = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM quarantine WHERE guild_id = ? AND user_id = ?",
          [interaction.guild.id, user.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!quarantineData) {
        return interaction.reply({
          content: "❌ User is not in quarantine!",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Defer reply since we're about to do heavy async work
      await interaction.deferReply();

      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      if (member) {
        // Check if bot can manage this member
        const botMember = await interaction.guild.members.fetch(
          interaction.client.user.id
        );
        if (!member.manageable) {
          return interaction.editReply({
            content:
              "❌ I cannot manage this user (they have a higher role than me or are the server owner)!",
          });
        }

        // Restore original roles
        // Handle both old format (array) and new format (object with roles property)
        const parsedData = JSON.parse(quarantineData.original_roles || "[]");
        const originalRoles = Array.isArray(parsedData)
          ? parsedData
          : parsedData.roles || [];

        const rolesToAdd = originalRoles.filter((roleId) => {
          const role = interaction.guild.roles.cache.get(roleId);
          return role && role.position < botMember.roles.highest.position;
        });

        // Remove quarantine role
        const quarantineRole = interaction.guild.roles.cache.find((r) =>
          r.name.toLowerCase().includes("quarantine")
        );
        if (quarantineRole) {
          try {
            await member.roles.remove(quarantineRole);
          } catch (error) {
            return interaction.editReply({
              ErrorMessages.commandFailed(error.message),
            });
          }
        }

        // Restore original roles (only if bot can manage them)
        if (rolesToAdd.length > 0) {
          try {
            await member.roles.add(rolesToAdd);
          } catch (error) {
            // If some roles can't be added, continue but log it
            console.error(`Failed to restore some roles: ${error.message}`);
          }
        }
      }

      // Remove from database
      await new Promise((resolve, reject) => {
        db.db.run(
          "DELETE FROM quarantine WHERE guild_id = ? AND user_id = ?",
          [interaction.guild.id, user.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Member Removed from Quarantine")
        .setDescription(
          `${user.tag} has been removed from quarantine and their roles have been restored.`
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
