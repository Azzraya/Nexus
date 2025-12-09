/**
 * Server Templates - One-click configuration presets
 * Different server types get optimized configs
 * EXCEEDS WICK - They don't have preset configs
 */

const TEMPLATES = {
  gaming: {
    name: "🎮 Gaming Server",
    description:
      "Optimized for gaming communities with raid protection and voice monitoring",
    config: {
      anti_raid_enabled: 1,
      anti_raid_threshold: 15, // Higher threshold for gaming servers
      anti_nuke_enabled: 1,
      auto_mod_enabled: 1,
      spam_enabled: 1,
      spam_max_messages: 7, // More lenient for gaming chat
      mention_spam_enabled: 1,
      mention_spam_threshold: 5,
      link_spam_enabled: 1,
      caps_enabled: 1,
      caps_threshold: 80,
      emoji_spam_enabled: 1,
      emoji_spam_threshold: 10,
      verification_enabled: 0, // Usually not needed for gaming
      heat_system_enabled: 1,
      voice_monitoring_enabled: 1, // Important for gaming servers
      raid_detection_enabled: 1,
    },
    roles: {
      muted: true,
      verified: false,
    },
    channels: {
      mod_log: true,
      alert: true,
    },
  },

  community: {
    name: "👥 Community Server",
    description: "Balanced protection for general community servers",
    config: {
      anti_raid_enabled: 1,
      anti_raid_threshold: 10,
      anti_nuke_enabled: 1,
      auto_mod_enabled: 1,
      spam_enabled: 1,
      spam_max_messages: 5,
      mention_spam_enabled: 1,
      mention_spam_threshold: 4,
      link_spam_enabled: 1,
      caps_enabled: 1,
      caps_threshold: 70,
      emoji_spam_enabled: 1,
      emoji_spam_threshold: 8,
      verification_enabled: 1, // Recommended for communities
      verification_role_required: 1,
      heat_system_enabled: 1,
      voice_monitoring_enabled: 0,
      raid_detection_enabled: 1,
    },
    roles: {
      muted: true,
      verified: true,
    },
    channels: {
      mod_log: true,
      alert: true,
      welcome: true,
    },
  },

  business: {
    name: "💼 Business/Professional",
    description: "Strict moderation for professional environments",
    config: {
      anti_raid_enabled: 1,
      anti_raid_threshold: 5, // Low threshold - strict
      anti_nuke_enabled: 1,
      auto_mod_enabled: 1,
      spam_enabled: 1,
      spam_max_messages: 3, // Very strict
      mention_spam_enabled: 1,
      mention_spam_threshold: 2,
      link_spam_enabled: 1,
      caps_enabled: 1,
      caps_threshold: 50, // Stricter caps limit
      emoji_spam_enabled: 1,
      emoji_spam_threshold: 5,
      verification_enabled: 1,
      verification_role_required: 1,
      min_account_age_days: 30, // Require older accounts
      heat_system_enabled: 1,
      voice_monitoring_enabled: 0,
      raid_detection_enabled: 1,
    },
    roles: {
      muted: true,
      verified: true,
    },
    channels: {
      mod_log: true,
      alert: true,
      rules: true,
    },
  },

  educational: {
    name: "📚 Educational/School",
    description: "Safe environment for students and educators",
    config: {
      anti_raid_enabled: 1,
      anti_raid_threshold: 8,
      anti_nuke_enabled: 1,
      auto_mod_enabled: 1,
      spam_enabled: 1,
      spam_max_messages: 4,
      mention_spam_enabled: 1,
      mention_spam_threshold: 3,
      link_spam_enabled: 1,
      link_whitelist_only: 1, // Only allow whitelisted links
      caps_enabled: 1,
      caps_threshold: 60,
      emoji_spam_enabled: 1,
      emoji_spam_threshold: 6,
      toxicity_enabled: 1, // Enable toxicity detection
      toxicity_threshold: 60,
      verification_enabled: 1,
      verification_role_required: 1,
      min_account_age_days: 7,
      heat_system_enabled: 1,
      voice_monitoring_enabled: 1,
      raid_detection_enabled: 1,
    },
    roles: {
      muted: true,
      verified: true,
      student: true,
    },
    channels: {
      mod_log: true,
      alert: true,
      rules: true,
      welcome: true,
    },
  },

  streaming: {
    name: "🎬 Streaming/Content Creator",
    description: "Optimized for streamers and content creators",
    config: {
      anti_raid_enabled: 1,
      anti_raid_threshold: 20, // High threshold - expect viewer spikes
      anti_nuke_enabled: 1,
      auto_mod_enabled: 1,
      spam_enabled: 1,
      spam_max_messages: 6,
      mention_spam_enabled: 1,
      mention_spam_threshold: 8, // Allow more mentions for hype
      link_spam_enabled: 1,
      caps_enabled: 0, // Allow caps for hype messages
      emoji_spam_enabled: 1,
      emoji_spam_threshold: 12, // Allow more emojis
      verification_enabled: 0, // Don't gate viewers
      heat_system_enabled: 1,
      voice_monitoring_enabled: 0,
      raid_detection_enabled: 1,
      adaptive_thresholds: 1, // Adapt to viewer count changes
    },
    roles: {
      muted: true,
      verified: false,
      subscriber: true,
    },
    channels: {
      mod_log: true,
      alert: true,
      welcome: true,
    },
  },

  highSecurity: {
    name: "🔒 Maximum Security",
    description: "Strictest protection for high-value servers",
    config: {
      anti_raid_enabled: 1,
      anti_raid_threshold: 3, // Very strict
      anti_nuke_enabled: 1,
      auto_mod_enabled: 1,
      spam_enabled: 1,
      spam_max_messages: 2,
      mention_spam_enabled: 1,
      mention_spam_threshold: 2,
      link_spam_enabled: 1,
      link_whitelist_only: 1,
      caps_enabled: 1,
      caps_threshold: 40,
      emoji_spam_enabled: 1,
      emoji_spam_threshold: 3,
      toxicity_enabled: 1,
      toxicity_threshold: 40,
      verification_enabled: 1,
      verification_role_required: 1,
      min_account_age_days: 60, // Require very old accounts
      phone_verification_required: 1, // Require phone verification
      heat_system_enabled: 1,
      voice_monitoring_enabled: 1,
      raid_detection_enabled: 1,
      behavioral_analysis: 1, // Enable all AI features
      threat_intelligence: 1,
      predictive_detection: 1,
    },
    roles: {
      muted: true,
      verified: true,
      trusted: true,
    },
    channels: {
      mod_log: true,
      alert: true,
      rules: true,
      verification: true,
    },
  },
};

class ServerTemplates {
  /**
   * Get all available templates
   */
  static getTemplates() {
    return Object.entries(TEMPLATES).map(([id, template]) => ({
      id,
      name: template.name,
      description: template.description,
    }));
  }

  /**
   * Get a specific template by ID
   */
  static getTemplate(templateId) {
    return TEMPLATES[templateId] || null;
  }

  /**
   * Apply a template to a server
   */
  static async applyTemplate(guild, templateId, db) {
    const template = TEMPLATES[templateId];
    if (!template) {
      throw new Error(`Template "${templateId}" not found`);
    }

    const results = {
      config: false,
      roles: {},
      channels: {},
      errors: [],
    };

    try {
      // Apply configuration
      await db.updateServerConfig(guild.id, template.config);
      results.config = true;
    } catch (error) {
      results.errors.push(`Config: ${error.message}`);
    }

    // Create roles if needed
    if (template.roles.muted) {
      try {
        const existing = guild.roles.cache.find((r) => r.name === "Muted");
        if (!existing) {
          const mutedRole = await guild.roles.create({
            name: "Muted",
            color: "#808080",
            permissions: [],
            reason: "Nexus template setup",
          });

          // Remove send message permissions in all channels
          for (const channel of guild.channels.cache.values()) {
            if (channel.isTextBased()) {
              await channel.permissionOverwrites.create(mutedRole, {
                SendMessages: false,
                AddReactions: false,
              });
            }
          }
          results.roles.muted = true;
        }
      } catch (error) {
        results.errors.push(`Muted role: ${error.message}`);
      }
    }

    if (template.roles.verified) {
      try {
        const existing = guild.roles.cache.find((r) => r.name === "Verified");
        if (!existing) {
          await guild.roles.create({
            name: "Verified",
            color: "#00FF00",
            reason: "Nexus template setup",
          });
          results.roles.verified = true;
        }
      } catch (error) {
        results.errors.push(`Verified role: ${error.message}`);
      }
    }

    // Create channels if needed
    if (template.channels.mod_log) {
      try {
        const existing = guild.channels.cache.find(
          (c) => c.name === "nexus-logs"
        );
        if (!existing) {
          const channel = await guild.channels.create({
            name: "nexus-logs",
            type: 0,
            reason: "Nexus template setup",
            permissionOverwrites: [
              {
                id: guild.id,
                deny: ["ViewChannel"],
              },
            ],
          });
          await db.updateServerConfig(guild.id, {
            mod_log_channel: channel.id,
          });
          results.channels.mod_log = true;
        }
      } catch (error) {
        results.errors.push(`Mod log channel: ${error.message}`);
      }
    }

    if (template.channels.alert) {
      try {
        const existing = guild.channels.cache.find(
          (c) => c.name === "nexus-alerts"
        );
        if (!existing) {
          const channel = await guild.channels.create({
            name: "nexus-alerts",
            type: 0,
            reason: "Nexus template setup",
            permissionOverwrites: [
              {
                id: guild.id,
                deny: ["ViewChannel"],
              },
            ],
          });
          await db.updateServerConfig(guild.id, {
            alert_channel: channel.id,
          });
          results.channels.alert = true;
        }
      } catch (error) {
        results.errors.push(`Alert channel: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Get template recommendation based on server analysis
   */
  static recommendTemplate(guild) {
    const memberCount = guild.memberCount;
    const hasVoiceChannels =
      guild.channels.cache.filter((c) => c.type === 2).size > 0;
    const channelCount = guild.channels.cache.size;

    // Business/Professional - small, few channels, no voice
    if (memberCount < 100 && channelCount < 20 && !hasVoiceChannels) {
      return "business";
    }

    // Gaming - has voice channels, medium size
    if (hasVoiceChannels && memberCount < 1000) {
      return "gaming";
    }

    // Streaming - large member count, has voice
    if (memberCount > 500 && hasVoiceChannels) {
      return "streaming";
    }

    // High security - very large server
    if (memberCount > 5000) {
      return "highSecurity";
    }

    // Default to community
    return "community";
  }
}

module.exports = { ServerTemplates, TEMPLATES };
