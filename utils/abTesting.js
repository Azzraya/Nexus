// A/B Testing System
// Test different moderation strategies and measure effectiveness

const db = require("./database");

class ABTesting {
  constructor() {
    this.createTable();
  }

  createTable() {
    db.db.run(`
      CREATE TABLE IF NOT EXISTS ab_tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        test_name TEXT NOT NULL,
        variant_a TEXT NOT NULL,
        variant_b TEXT NOT NULL,
        metric TEXT NOT NULL,
        start_date INTEGER,
        end_date INTEGER,
        results_a TEXT,
        results_b TEXT,
        winner TEXT,
        status TEXT DEFAULT 'running',
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        UNIQUE(guild_id, test_name)
      )
    `);
  }

  /**
   * Create a new A/B test
   */
  async createTest(guildId, testName, variantA, variantB, metric) {
    return new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO ab_tests (guild_id, test_name, variant_a, variant_b, metric, start_date, status) 
         VALUES (?, ?, ?, ?, ?, ?, 'running')`,
        [guildId, testName, variantA, variantB, metric, Date.now()],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }

  /**
   * Record test result
   */
  async recordResult(testId, variant, value) {
    return new Promise((resolve, reject) => {
      const field = variant === "a" ? "results_a" : "results_b";

      db.db.get(
        `SELECT ${field} FROM ab_tests WHERE id = ?`,
        [testId],
        (err, row) => {
          if (err) return reject(err);

          const current = row[field] ? JSON.parse(row[field]) : [];
          current.push(value);

          db.db.run(
            `UPDATE ab_tests SET ${field} = ? WHERE id = ?`,
            [JSON.stringify(current), testId],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        }
      );
    });
  }

  /**
   * Calculate test results
   */
  async calculateResults(testId) {
    try {
      const test = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM ab_tests WHERE id = ?",
          [testId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!test) return null;

      const resultsA = test.results_a ? JSON.parse(test.results_a) : [];
      const resultsB = test.results_b ? JSON.parse(test.results_b) : [];

      // Calculate statistics
      const avgA =
        resultsA.reduce((sum, v) => sum + v, 0) / resultsA.length || 0;
      const avgB =
        resultsB.reduce((sum, v) => sum + v, 0) / resultsB.length || 0;

      const improvement = ((avgB - avgA) / avgA) * 100;
      const winner = avgB > avgA ? "B" : avgA > avgB ? "A" : "Tie";

      return {
        testName: test.test_name,
        variantA: test.variant_a,
        variantB: test.variant_b,
        metric: test.metric,
        resultsA: {
          count: resultsA.length,
          average: Math.round(avgA * 100) / 100,
        },
        resultsB: {
          count: resultsB.length,
          average: Math.round(avgB * 100) / 100,
        },
        improvement: Math.round(improvement * 100) / 100,
        winner,
        confidence: this.calculateConfidence(resultsA, resultsB),
      };
    } catch (error) {
      const logger = require("./logger");
      logger.error("abTesting", "Calculate results error", error);
      return null;
    }
  }

  /**
   * Simple confidence calculation
   */
  calculateConfidence(resultsA, resultsB) {
    const minSampleSize = 30;
    const sampleSize = Math.min(resultsA.length, resultsB.length);

    if (sampleSize < minSampleSize) {
      return "Low (need more data)";
    } else if (sampleSize < 100) {
      return "Medium";
    } else {
      return "High";
    }
  }

  /**
   * End a test
   */
  async endTest(testId) {
    const results = await this.calculateResults(testId);

    return new Promise((resolve, reject) => {
      db.db.run(
        `UPDATE ab_tests SET status = 'completed', end_date = ?, winner = ? WHERE id = ?`,
        [Date.now(), results.winner, testId],
        (err) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });
  }
}

module.exports = new ABTesting();
