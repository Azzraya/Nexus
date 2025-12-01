const db = require("../utils/database");
const { EmbedBuilder } = require("discord.js");
const ErrorHandler = require("../utils/errorHandler");

module.exports = {
  name: "guildUpdate",
  async execute(oldGuild, newGuild, client) {
    const changes = [];

    // Check for name change
    if (oldGuild.name !== newGuild.name) {
      changes.push({
        name: "Server Name Changed",
        value: `**Old:** ${oldGuild.name}\n**New:** ${newGuild.name}`,
        inline: false,
      });
    }

    // Check for icon change
    if (oldGuild.icon !== newGuild.icon) {
      changes.push({
        name: "Server Icon Changed",
        value: newGuild.icon
          ? `[New Icon](${newGuild.iconURL({ dynamic: true, size: 4096 })})`
          : "Icon removed",
        inline: true,
      });
    }

    // Check for banner change
    if (oldGuild.banner !== newGuild.banner) {
      changes.push({
        name: "Server Banner Changed",
        value: newGuild.banner
          ? `[New Banner](${newGuild.bannerURL({ dynamic: true, size: 4096 })})`
          : "Banner removed",
        inline: true,
      });
    }

    // Check for description change
    if (oldGuild.description !== newGuild.description) {
      changes.push({
        name: "Server Description Changed",
        value: `**Old:** ${oldGuild.description || "None"}\n**New:** ${
          newGuild.description || "None"
        }`,
        inline: false,
      });
    }

    // Check for verification level change
    if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
      const levels = ["None", "Low", "Medium", "High", "Very High"];
      changes.push({
        name: "Verification Level Changed",
        value: `**Old:** ${levels[oldGuild.verificationLevel]}\n**New:** ${
          levels[newGuild.verificationLevel]
        }`,
        inline: true,
      });
    }

    // Check for MFA level change
    if (oldGuild.mfaLevel !== newGuild.mfaLevel) {
      const levels = ["None", "Elevated"];
      changes.push({
        name: "MFA Level Changed",
        value: `**Old:** ${levels[oldGuild.mfaLevel]}\n**New:** ${
          levels[newGuild.mfaLevel]
        }`,
        inline: true,
      });
    }

    // Check for explicit content filter change
    if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) {
      const filters = ["Disabled", "Members without roles", "All members"];
      changes.push({
        name: "Explicit Content Filter Changed",
        value: `**Old:** ${filters[oldGuild.explicitContentFilter]}\n**New:** ${
          filters[newGuild.explicitContentFilter]
        }`,
        inline: true,
      });
    }

    // Check for default message notifications change
    if (
      oldGuild.defaultMessageNotifications !==
      newGuild.defaultMessageNotifications
    ) {
      const levels = ["All Messages", "Only Mentions"];
      changes.push({
        name: "Default Notifications Changed",
        value: `**Old:** ${
          levels[oldGuild.defaultMessageNotifications]
        }\n**New:** ${levels[newGuild.defaultMessageNotifications]}`,
        inline: true,
      });
    }

    // Check for AFK channel change
    if (oldGuild.afkChannelId !== newGuild.afkChannelId) {
      changes.push({
        name: "AFK Channel Changed",
        value: `**Old:** ${oldGuild.afkChannel?.name || "None"}\n**New:** ${
          newGuild.afkChannel?.name || "None"
        }`,
        inline: true,
      });
    }

    // Check for AFK timeout change
    if (oldGuild.afkTimeout !== newGuild.afkTimeout) {
      changes.push({
        name: "AFK Timeout Changed",
        value: `**Old:** ${oldGuild.afkTimeout}s\n**New:** ${newGuild.afkTimeout}s`,
        inline: true,
      });
    }

    // Check for system channel change
    if (oldGuild.systemChannelId !== newGuild.systemChannelId) {
      changes.push({
        name: "System Channel Changed",
        value: `**Old:** ${oldGuild.systemChannel?.name || "None"}\n**New:** ${
          newGuild.systemChannel?.name || "None"
        }`,
        inline: true,
      });
    }

    // Check for rules channel change
    if (oldGuild.rulesChannelId !== newGuild.rulesChannelId) {
      changes.push({
        name: "Rules Channel Changed",
        value: `**Old:** ${oldGuild.rulesChannel?.name || "None"}\n**New:** ${
          newGuild.rulesChannel?.name || "None"
        }`,
        inline: true,
      });
    }

    // Check for vanity URL change
    if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
      changes.push({
        name: "Vanity URL Changed",
        value: `**Old:** ${oldGuild.vanityURLCode || "None"}\n**New:** ${
          newGuild.vanityURLCode || "None"
        }`,
        inline: false,
      });
    }

    // Only log if there are actual changes
    if (changes.length === 0) return;

    // Console logging
    console.log(
      `⚙️ [${newGuild.name} (${newGuild.id})] Server settings updated: ${changes
        .map((c) => c.name)
        .join(", ")}`
    );

    // Enhanced logging
    const EnhancedLogging = require("../utils/enhancedLogging");
    await EnhancedLogging.log(newGuild.id, "guild_update", "server", {
      userId: null,
      moderatorId: null,
      action: "server_updated",
      details: `Server settings updated: ${changes.length} change(s)`,
      metadata: {
        changes: changes.map((c) => c.name),
        oldName: oldGuild.name,
        newName: newGuild.name,
      },
      severity: "warning",
    });

    // Check for mod log channel
    const config = await db.getServerConfig(newGuild.id);
    if (config && config.mod_log_channel) {
      const logChannel = newGuild.channels.cache.get(config.mod_log_channel);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle("⚙️ Server Settings Updated")
          .setDescription(`Server settings were changed`)
          .addFields(...changes)
          .setColor(0xffa500)
          .setThumbnail(
            newGuild.iconURL({ dynamic: true }) ||
              newGuild.bannerURL({ dynamic: true }) ||
              null
          )
          .setTimestamp();

        logChannel
          .send({ embeds: [embed] })
          .catch(
            ErrorHandler.createSafeCatch(
              `guildUpdate [${newGuild.id}]`,
              `Send mod log for guild update`
            )
          );
      }
    }
  },
};
