/**
 * Database Optimization & Index Management
 * Creates indexes and optimizes database performance
 */

const db = require('./database');
const logger = require('./logger');

class DatabaseOptimizer {
  /**
   * Create all necessary indexes for optimal performance
   */
  async createIndexes() {
    logger.info('DB Optimizer', 'Creating database indexes...');

    const indexes = [
      // Warnings table indexes
      { table: 'warnings', columns: ['guild_id', 'user_id'], name: 'idx_warnings_guild_user' },
      { table: 'warnings', columns: ['timestamp'], name: 'idx_warnings_timestamp' },
      
      // Server config indexes
      { table: 'server_config', columns: ['guild_id'], name: 'idx_server_config_guild', unique: true },
      
      // Security logs indexes
      { table: 'security_logs', columns: ['guild_id', 'timestamp'], name: 'idx_security_guild_time' },
      { table: 'security_logs', columns: ['threat_level'], name: 'idx_security_threat' },
      
      // Moderation logs indexes
      { table: 'moderation_logs', columns: ['guild_id', 'timestamp'], name: 'idx_modlog_guild_time' },
      { table: 'moderation_logs', columns: ['user_id'], name: 'idx_modlog_user' },
      { table: 'moderation_logs', columns: ['action'], name: 'idx_modlog_action' },
      
      // IP logs indexes
      { table: 'ip_logs', columns: ['ip_address', 'timestamp'], name: 'idx_ip_logs_ip_time' },
      { table: 'ip_logs', columns: ['discord_id'], name: 'idx_ip_logs_discord' },
      
      // Invite tracking indexes
      { table: 'invite_sources', columns: ['source_name'], name: 'idx_invite_source', unique: true },
      { table: 'guild_invite_tracking', columns: ['guild_id', 'timestamp'], name: 'idx_guild_invite_time' },
      { table: 'guild_invite_tracking', columns: ['source_id'], name: 'idx_guild_invite_source' },
      
      // Custom commands indexes
      { table: 'custom_commands', columns: ['guild_id', 'command_name'], name: 'idx_custom_cmd_guild' },
      
      // Member tracking indexes
      { table: 'member_tracking', columns: ['guild_id', 'user_id'], name: 'idx_member_track_guild_user' },
      { table: 'member_tracking', columns: ['join_timestamp'], name: 'idx_member_track_join' },
      
      // Command usage indexes
      { table: 'command_usage_log', columns: ['guild_id', 'timestamp'], name: 'idx_cmd_usage_guild_time' },
      { table: 'command_usage_log', columns: ['command_name'], name: 'idx_cmd_usage_name' },
      
      // Analytics indexes
      { table: 'analytics_events', columns: ['guild_id', 'timestamp'], name: 'idx_analytics_guild_time' },
      { table: 'analytics_events', columns: ['event_type'], name: 'idx_analytics_type' },
      
      // Threat predictions indexes
      { table: 'threat_predictions', columns: ['guild_id', 'timestamp'], name: 'idx_threat_pred_guild_time' },
      { table: 'threat_predictions', columns: ['prediction_score'], name: 'idx_threat_pred_score' }
    ];

    let created = 0;
    let skipped = 0;

    for (const index of indexes) {
      try {
        const unique = index.unique ? 'UNIQUE' : '';
        const query = `CREATE ${unique} INDEX IF NOT EXISTS ${index.name} ON ${index.table} (${index.columns.join(', ')})`;
        
        await new Promise((resolve, reject) => {
          db.db.run(query, (err) => {
            if (err) {
              if (err.message.includes('already exists')) {
                skipped++;
                resolve();
              } else {
                reject(err);
              }
            } else {
              created++;
              resolve();
            }
          });
        });
      } catch (error) {
        logger.error('DB Optimizer', `Failed to create index ${index.name}`, error);
      }
    }

    logger.success('DB Optimizer', `Indexes created: ${created}, already existed: ${skipped}`);
  }

  /**
   * Analyze database and get optimization recommendations
   */
  async analyzeDatabase() {
    logger.info('DB Optimizer', 'Analyzing database...');

    const analysis = {
      tables: [],
      totalSize: 0,
      recommendations: []
    };

    try {
      // Get all tables
      const tables = await new Promise((resolve, reject) => {
        db.db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      for (const table of tables) {
        const tableName = table.name;
        
        // Get row count
        const count = await new Promise((resolve, reject) => {
          db.db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
            if (err) reject(err);
            else resolve(row?.count || 0);
          });
        });

        // Get indexes
        const indexes = await new Promise((resolve, reject) => {
          db.db.all(`PRAGMA index_list(${tableName})`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        });

        analysis.tables.push({
          name: tableName,
          rows: count,
          indexes: indexes.length
        });

        // Generate recommendations
        if (count > 10000 && indexes.length === 0) {
          analysis.recommendations.push({
            type: 'performance',
            severity: 'high',
            message: `Table ${tableName} has ${count} rows but no indexes. Consider adding indexes.`
          });
        }

        if (count > 100000) {
          analysis.recommendations.push({
            type: 'maintenance',
            severity: 'medium',
            message: `Table ${tableName} has ${count} rows. Consider archiving old data.`
          });
        }
      }

      logger.success('DB Optimizer', `Analyzed ${tables.length} tables`);
      return analysis;
    } catch (error) {
      logger.error('DB Optimizer', 'Database analysis failed', error);
      throw error;
    }
  }

  /**
   * Vacuum database to reclaim space and improve performance
   */
  async vacuum() {
    logger.info('DB Optimizer', 'Running VACUUM to optimize database...');
    
    return new Promise((resolve, reject) => {
      db.db.run('VACUUM', (err) => {
        if (err) {
          logger.error('DB Optimizer', 'VACUUM failed', err);
          reject(err);
        } else {
          logger.success('DB Optimizer', 'Database vacuumed successfully');
          resolve();
        }
      });
    });
  }

  /**
   * Analyze query execution plan
   */
  async explainQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      db.db.all(`EXPLAIN QUERY PLAN ${query}`, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * Clean up old data
   */
  async cleanupOldData(daysToKeep = 90) {
    logger.info('DB Optimizer', `Cleaning up data older than ${daysToKeep} days...`);
    
    const cutoffDate = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    let totalDeleted = 0;

    const tables = [
      { name: 'security_logs', timestampColumn: 'timestamp' },
      { name: 'analytics_events', timestampColumn: 'timestamp' },
      { name: 'ip_logs', timestampColumn: 'timestamp' },
      { name: 'command_usage_log', timestampColumn: 'timestamp' }
    ];

    for (const table of tables) {
      try {
        const result = await new Promise((resolve, reject) => {
          db.db.run(
            `DELETE FROM ${table.name} WHERE ${table.timestampColumn} < ?`,
            [cutoffDate],
            function(err) {
              if (err) reject(err);
              else resolve(this.changes);
            }
          );
        });

        totalDeleted += result;
        logger.info('DB Optimizer', `Deleted ${result} old records from ${table.name}`);
      } catch (error) {
        logger.error('DB Optimizer', `Failed to clean ${table.name}`, error);
      }
    }

    logger.success('DB Optimizer', `Cleanup complete: ${totalDeleted} total records deleted`);
    return totalDeleted;
  }

  /**
   * Get database statistics
   */
  async getStats() {
    const stats = {};

    try {
      // Database size
      const size = await new Promise((resolve, reject) => {
        db.db.get("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()", (err, row) => {
          if (err) reject(err);
          else resolve(row?.size || 0);
        });
      });

      stats.sizeBytes = size;
      stats.sizeMB = (size / (1024 * 1024)).toFixed(2);

      // Total rows across all tables
      const tables = await new Promise((resolve, reject) => {
        db.db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      let totalRows = 0;
      for (const table of tables) {
        const count = await new Promise((resolve, reject) => {
          db.db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, row) => {
            if (err) resolve(0);
            else resolve(row?.count || 0);
          });
        });
        totalRows += count;
      }

      stats.totalRows = totalRows;
      stats.tables = tables.length;

      return stats;
    } catch (error) {
      logger.error('DB Optimizer', 'Failed to get stats', error);
      return stats;
    }
  }
}

// Export singleton
module.exports = new DatabaseOptimizer();

