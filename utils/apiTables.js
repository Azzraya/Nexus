// Create database tables for API features
const db = require("./database");

// Create all API-related tables
db.db.run(`
  CREATE TABLE IF NOT EXISTS ban_appeals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT,
    contact TEXT,
    status TEXT DEFAULT 'pending',
    created_at INTEGER,
    reviewed_at INTEGER,
    reviewed_by TEXT
  )
`);

db.db.run(`
  CREATE TABLE IF NOT EXISTS showcase_nominations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    reason TEXT,
    contact_email TEXT,
    status TEXT DEFAULT 'pending',
    created_at INTEGER,
    reviewed_at INTEGER
  )
`);

db.db.run(`
  CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_name TEXT NOT NULL,
    member_count INTEGER,
    quote TEXT,
    metrics TEXT,
    status TEXT DEFAULT 'pending',
    created_at INTEGER,
    approved_at INTEGER
  )
`);

db.db.run(`
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    message TEXT,
    contact TEXT,
    created_at INTEGER,
    status TEXT DEFAULT 'new'
  )
`);

db.db.run(`
  CREATE TABLE IF NOT EXISTS threat_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    pattern TEXT,
    description TEXT,
    severity TEXT,
    timestamp INTEGER,
    verified INTEGER DEFAULT 0
  )
`);

const logger = require("./logger");
logger.info("API Tables", "All API database tables created");

module.exports = {};
