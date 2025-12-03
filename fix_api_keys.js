// Quick fix script to forcefully recreate api_keys table
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "nexus.db");
const db = new sqlite3.Database(dbPath);

console.log("🔧 Force-fixing api_keys table...");

db.serialize(() => {
  // Drop both tables if they exist
  db.run("DROP TABLE IF EXISTS api_keys", (err) => {
    if (err) console.error("Error dropping api_keys:", err);
    else console.log("✅ Dropped old api_keys table");
  });

  db.run("DROP TABLE IF EXISTS api_keys_old", (err) => {
    if (err) console.error("Error dropping api_keys_old:", err);
    else console.log("✅ Dropped api_keys_old table");
  });

  // Create new table with correct schema
  db.run(
    `CREATE TABLE api_keys (
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

      console.log("✅ Created new api_keys table with correct schema!");
      console.log("\n🎉 Fix complete! Restart your bot now!");
      db.close();
      process.exit(0);
    }
  );
});

