/**
 * Database Query Optimizer
 * Provides optimized query patterns and caching
 */

const db = require("./database");
const logger = require("./logger");

class QueryOptimizer {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.performanceMetrics = new Map();
  }

  /**
   * Execute query with caching
   */
  async cachedQuery(cacheKey, query, params = [], cacheDuration = null) {
    const duration = cacheDuration || this.cacheTimeout;

    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() < cached.expires) {
        logger.debug("QueryCache", `Cache hit: ${cacheKey}`);
        return cached.data;
      }
      // Expired, remove
      this.cache.delete(cacheKey);
    }

    // Execute query
    const startTime = Date.now();
    const result = await this.executeQuery(query, params);
    const queryTime = Date.now() - startTime;

    // Log slow queries
    if (queryTime > 1000) {
      logger.warn("SlowQuery", `Query took ${queryTime}ms`, { query, params });
    }

    // Cache result
    this.cache.set(cacheKey, {
      data: result,
      expires: Date.now() + duration,
    });

    // Track performance
    this.trackPerformance(query, queryTime);

    return result;
  }

  /**
   * Execute raw query with error handling
   */
  async executeQuery(query, params = []) {
    db._ensureInitialized();
    return new Promise((resolve, reject) => {
      const method = query.trim().toUpperCase().startsWith("SELECT")
        ? "all"
        : "run";

      db.db[method](query, params, function (err, result) {
        if (err) {
          logger.error("Database", "Query failed", {
            query,
            error: err.message,
          });
          reject(err);
        } else {
          resolve(
            method === "all"
              ? result
              : { lastID: this?.lastID, changes: this?.changes }
          );
        }
      });
    });
  }

  /**
   * Batch insert for better performance
   */
  async batchInsert(table, records, columns) {
    if (!records || records.length === 0) return { inserted: 0 };

    const placeholders = `(${columns.map(() => "?").join(",")})`;
    const values = records.flatMap((record) =>
      columns.map((col) => record[col])
    );

    const query = `INSERT INTO ${table} (${columns.join(",")}) VALUES ${records
      .map(() => placeholders)
      .join(",")}`;

    const result = await this.executeQuery(query, values);
    logger.db("BATCH_INSERT", table);

    return { inserted: records.length };
  }

  /**
   * Get query with pagination
   */
  async paginatedQuery(query, params, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const paginatedQuery = `${query} LIMIT ? OFFSET ?`;

    const [data, totalResult] = await Promise.all([
      this.executeQuery(paginatedQuery, [...params, limit, offset]),
      this.executeQuery(`SELECT COUNT(*) as total FROM (${query})`, params),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total: totalResult[0]?.total || 0,
        pages: Math.ceil((totalResult[0]?.total || 0) / limit),
        hasMore: offset + data.length < (totalResult[0]?.total || 0),
      },
    };
  }

  /**
   * Clear cache
   */
  clearCache(pattern = null) {
    if (!pattern) {
      this.cache.clear();
      logger.info("QueryCache", "Cache cleared completely");
      return;
    }

    // Clear matching keys
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
    logger.info("QueryCache", `Cache cleared for pattern: ${pattern}`);
  }

  /**
   * Track query performance
   */
  trackPerformance(query, duration) {
    const queryType = query.trim().split(" ")[0].toUpperCase();

    if (!this.performanceMetrics.has(queryType)) {
      this.performanceMetrics.set(queryType, {
        count: 0,
        totalTime: 0,
        avgTime: 0,
        maxTime: 0,
      });
    }

    const metrics = this.performanceMetrics.get(queryType);
    metrics.count++;
    metrics.totalTime += duration;
    metrics.avgTime = metrics.totalTime / metrics.count;
    metrics.maxTime = Math.max(metrics.maxTime, duration);
  }

  /**
   * Get performance stats
   */
  getPerformanceStats() {
    const stats = {};
    for (const [type, metrics] of this.performanceMetrics.entries()) {
      stats[type] = {
        ...metrics,
        avgTime: Math.round(metrics.avgTime * 100) / 100,
        maxTime: Math.round(metrics.maxTime * 100) / 100,
      };
    }
    return stats;
  }
}

// Export singleton
module.exports = new QueryOptimizer();
