// Migration script to update api_keys table structure
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "nexus.db");
const db = new sqlite3.Database(dbPath);

console.log("🔄 Starting API keys table migration...");

db.serialize(() => {
  // Step 1: Check if old table exists and has data
  db.get("SELECT COUNT(*) as count FROM api_keys", [], (err, row) => {
    if (err) {
      console.log("⚠️  No existing api_keys table found, will create new one");
    } else {
      console.log(`📊 Found ${row.count} existing API keys`);
      if (row.count > 0) {
        console.log("⚠️  WARNING: Existing API keys will be backed up but structure will change!");
      }
    }

    // Step 2: Rename old table as backup
    db.run("ALTER TABLE api_keys RENAME TO api_keys_old", (err) => {
      if (err) {
        console.log("ℹ️  No old table to backup (this is fine for first-time setup)");
      } else {
        console.log("✅ Old table backed up as 'api_keys_old'");
      }

      // Step 3: Create new table with correct schema
      db.run(
        `CREATE TABLE IF NOT EXISTS api_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          api_key TEXT NOT NULL UNIQUE,
          discord_user_id TEXT NOT NULL,
          discord_username TEXT,
          email TEXT,
          purpose TEXT,
          created_at INTEGER,
          created_by_admin TEXT,
          last_used INTEGER,
          rate_limit INTEGER DEFAULT 100,
          requests_today INTEGER DEFAULT 0,
          total_requests INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          notes TEXT
        )`,
        (err) => {
          if (err) {
            console.error("❌ Error creating new table:", err);
            process.exit(1);
          }

          console.log("✅ New api_keys table created with correct schema");

          // Step 4: Try to migrate old data if it exists
          db.all("SELECT * FROM api_keys_old", [], (err, rows) => {
            if (err || !rows || rows.length === 0) {
              console.log("ℹ️  No old data to migrate");
              finish();
              return;
            }

            console.log(`🔄 Migrating ${rows.length} old API keys...`);

            const stmt = db.prepare(
              `INSERT INTO api_keys (api_key, discord_user_id, discord_username, created_at, last_used, rate_limit, requests_today, total_requests, is_active, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );

            let migrated = 0;
            rows.forEach((row) => {
              // Map old columns to new columns
              stmt.run(
                [
                  row.key || row.api_key || "nx_migrated_" + Date.now(),
                  row.user_id || row.discord_user_id || "unknown",
                  row.name || row.discord_username || "Migrated User",
                  row.created_at || Date.now(),
                  row.last_used || null,
                  row.rate_limit || 100,
                  row.requests_today || 0,
                  row.total_requests || 0,
                  row.is_active !== undefined ? row.is_active : 1,
                  "Migrated from old schema"
                ],
                (err) => {
                  if (err) {
                    console.error("⚠️  Error migrating key:", err.message);
                  } else {
                    migrated++;
                  }

                  if (migrated + 1 === rows.length) {
                    stmt.finalize();
                    console.log(`✅ Migrated ${migrated} API keys successfully`);
                    finish();
                  }
                }
              );
            });
          });
        }
      );
    });
  });
});

function finish() {
  console.log("\n🎉 Migration complete!");
  console.log("ℹ️  Old table preserved as 'api_keys_old' (you can drop it later)");
  console.log("ℹ️  To drop old table: DELETE FROM api_keys_old; DROP TABLE api_keys_old;");
  console.log("\n✅ You can now restart the bot!");
  db.close();
  process.exit(0);
}

