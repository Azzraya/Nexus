const db = require("./database");
const logger = require("./logger");

/**
 * Server Templates Marketplace
 * Share and download security configurations
 */
class ServerTemplates {
  constructor(client) {
    this.client = client;
    this.templates = new Map();
  }

  /**
   * Create template from server configuration
   */
  async createTemplate(
    guildId,
    creatorId,
    templateName,
    description,
    isPublic = false
  ) {
    try {
      // Get server configuration
      const config = await db.getServerConfig(guildId);

      // Strip server-specific IDs
      const template = {
        name: templateName,
        description,
        creator_id: creatorId,
        config: {
          anti_raid_enabled: config.anti_raid_enabled,
          anti_nuke_enabled: config.anti_nuke_enabled,
          auto_mod_enabled: config.auto_mod_enabled,
          heat_system_enabled: config.heat_system_enabled,
          verification_enabled: config.verification_enabled,
          verification_mode: config.verification_mode,
          alert_threshold: config.alert_threshold,
        },
        is_public: isPublic,
        downloads: 0,
        rating: 0,
        created_at: Date.now(),
      };

      // Store template
      return new Promise((resolve, reject) => {
        db.db.run(
          `INSERT INTO server_templates 
           (name, description, creator_id, config_data, is_public, created_at) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            templateName,
            description,
            creatorId,
            JSON.stringify(template.config),
            isPublic ? 1 : 0,
            Date.now(),
          ],
          function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });
    } catch (error) {
      logger.error("ServerTemplates", "Failed to create template", error);
      throw error;
    }
  }

  /**
   * Get public templates
   */
  async getPublicTemplates(limit = 50) {
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT * FROM server_templates 
         WHERE is_public = 1 
         ORDER BY downloads DESC, rating DESC 
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else
            resolve(
              (rows || []).map((r) => ({
                ...r,
                config_data: JSON.parse(r.config_data),
              }))
            );
        }
      );
    });
  }

  /**
   * Apply template to server
   */
  async applyTemplate(guildId, templateId) {
    try {
      // Get template
      const template = await new Promise((resolve, reject) => {
        db.db.get(
          `SELECT * FROM server_templates WHERE id = ?`,
          [templateId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!template) throw new Error("Template not found");

      const config = JSON.parse(template.config_data);

      // Apply configuration
      await db.updateServerConfig(guildId, config);

      // Increment download counter
      await db.db.run(
        `UPDATE server_templates SET downloads = downloads + 1 WHERE id = ?`,
        [templateId]
      );

      logger.success(
        "ServerTemplates",
        `Applied template ${template.name} to guild ${guildId}`
      );

      return {
        success: true,
        templateName: template.name,
        appliedSettings: Object.keys(config),
      };
    } catch (error) {
      logger.error("ServerTemplates", "Failed to apply template", error);
      throw error;
    }
  }

  /**
   * Rate template
   */
  async rateTemplate(templateId, userId, rating) {
    if (rating < 1 || rating > 5) throw new Error("Rating must be 1-5");

    try {
      // Store rating
      await db.db.run(
        `INSERT OR REPLACE INTO template_ratings (template_id, user_id, rating, created_at) 
         VALUES (?, ?, ?, ?)`,
        [templateId, userId, rating, Date.now()]
      );

      // Calculate average rating
      const avgRating = await new Promise((resolve, reject) => {
        db.db.get(
          `SELECT AVG(rating) as avg FROM template_ratings WHERE template_id = ?`,
          [templateId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row?.avg || 0);
          }
        );
      });

      // Update template
      await db.db.run(`UPDATE server_templates SET rating = ? WHERE id = ?`, [
        avgRating,
        templateId,
      ]);

      return avgRating;
    } catch (error) {
      logger.error("ServerTemplates", "Failed to rate template", error);
      throw error;
    }
  }

  /**
   * Get popular templates
   */
  async getPopularTemplates(limit = 10) {
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT * FROM server_templates 
         WHERE is_public = 1 
         ORDER BY (downloads * 0.7 + rating * 20 * 0.3) DESC 
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else
            resolve(
              (rows || []).map((r) => ({
                ...r,
                config_data: JSON.parse(r.config_data),
              }))
            );
        }
      );
    });
  }

  /**
   * Featured templates (curated by admins)
   */
  getFeaturedTemplates() {
    return [
      {
        id: "featured_gaming",
        name: "Gaming Community",
        description:
          "Optimized for gaming servers - fast anti-raid, minimal verification",
        config: {
          anti_raid_enabled: 1,
          anti_nuke_enabled: 1,
          auto_mod_enabled: 1,
          verification_enabled: 0,
          alert_threshold: 50,
        },
        badge: "🎮 Official",
      },
      {
        id: "featured_professional",
        name: "Professional Server",
        description: "Enterprise-grade security for business servers",
        config: {
          anti_raid_enabled: 1,
          anti_nuke_enabled: 1,
          auto_mod_enabled: 1,
          verification_enabled: 1,
          verification_mode: "manual",
          alert_threshold: 70,
        },
        badge: "💼 Official",
      },
      {
        id: "featured_maximum",
        name: "Maximum Security",
        description: "All features enabled - fortress mode",
        config: {
          anti_raid_enabled: 1,
          anti_nuke_enabled: 1,
          auto_mod_enabled: 1,
          heat_system_enabled: 1,
          verification_enabled: 1,
          alert_threshold: 30,
        },
        badge: "🔒 Official",
      },
    ];
  }
}

module.exports = ServerTemplates;
