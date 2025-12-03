// Team Management System
// Multiple admins with granular permissions and audit logs

const db = require('./database');

class TeamManagement {
  constructor() {
    this.createTables();
  }

  createTables() {
    // Team members table
    db.db.run(`
      CREATE TABLE IF NOT EXISTS team_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        permissions TEXT,
        added_by TEXT,
        added_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        UNIQUE(guild_id, user_id)
      )
    `);

    // Audit log table
    db.db.run(`
      CREATE TABLE IF NOT EXISTS team_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        details TEXT,
        timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);
  }

  /**
   * Add team member with specific permissions
   */
  async addMember(guildId, userId, role, permissions, addedBy) {
    try {
      await new Promise((resolve, reject) => {
        db.db.run(
          `INSERT INTO team_members (guild_id, user_id, role, permissions, added_by) VALUES (?, ?, ?, ?, ?)`,
          [guildId, userId, role, JSON.stringify(permissions), addedBy],
          function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID });
          }
        );
      });

      // Log the action
      await this.logAction(guildId, addedBy, 'team.add', userId, `Added as ${role}`);

      return { success: true };
    } catch (error) {
      if (error.message.includes('UNIQUE')) {
        return { success: false, error: 'User already on team' };
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove team member
   */
  async removeMember(guildId, userId, removedBy) {
    try {
      await new Promise((resolve, reject) => {
        db.db.run(
          `DELETE FROM team_members WHERE guild_id = ? AND user_id = ?`,
          [guildId, userId],
          function(err) {
            if (err) reject(err);
            else resolve({ deleted: this.changes > 0 });
          }
        );
      });

      await this.logAction(guildId, removedBy, 'team.remove', userId, 'Removed from team');

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all team members for a guild
   */
  async getTeamMembers(guildId) {
    return new Promise((resolve, reject) => {
      db.db.all(
        'SELECT * FROM team_members WHERE guild_id = ? ORDER BY added_at DESC',
        [guildId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Check if user has permission
   */
  async hasPermission(guildId, userId, permission) {
    try {
      const member = await new Promise((resolve, reject) => {
        db.db.get(
          'SELECT * FROM team_members WHERE guild_id = ? AND user_id = ?',
          [guildId, userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!member) return false;

      const permissions = JSON.parse(member.permissions || '[]');
      return permissions.includes(permission) || permissions.includes('*');
    } catch (error) {
      return false;
    }
  }

  /**
   * Log a team action
   */
  async logAction(guildId, userId, action, target, details) {
    return new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO team_audit_log (guild_id, user_id, action, target, details) VALUES (?, ?, ?, ?, ?)`,
        [guildId, userId, action, target, details],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Get audit log
   */
  async getAuditLog(guildId, limit = 50) {
    return new Promise((resolve, reject) => {
      db.db.all(
        'SELECT * FROM team_audit_log WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?',
        [guildId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Available permissions
   */
  getAvailablePermissions() {
    return [
      { name: '*', description: 'All permissions (Owner)' },
      { name: 'config.edit', description: 'Edit bot configuration' },
      { name: 'security.manage', description: 'Manage security settings' },
      { name: 'logs.view', description: 'View server logs' },
      { name: 'team.manage', description: 'Manage team members' },
      { name: 'backup.create', description: 'Create backups' },
      { name: 'backup.restore', description: 'Restore backups' },
      { name: 'webhooks.manage', description: 'Manage webhook integrations' }
    ];
  }

  /**
   * Role presets
   */
  getRolePresets() {
    return {
      owner: ['*'],
      admin: ['config.edit', 'security.manage', 'logs.view', 'backup.create', 'backup.restore'],
      moderator: ['logs.view'],
      viewer: []
    };
  }
}

module.exports = new TeamManagement();

