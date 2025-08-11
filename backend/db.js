const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Determine database path and ensure directory exists
const dbPath = process.env.DB_PATH || './data/scout.db';
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// Create connection
const db = new Database(dbPath);

// Initial schema
db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  totem TEXT DEFAULT '',
  date_naissance TEXT NOT NULL,
  telephone TEXT NOT NULL,
  role TEXT NOT NULL,         -- SUPERADMIN | CHEF_UNITE | CHEF_SECTION
  section TEXT,               -- null pour SUPERADMIN/CHEF_UNITE, sinon Castors/Louveteaux/Éclaireurs/Pionniers
  status TEXT NOT NULL,       -- PENDING | APPROVED
  created_at TEXT NOT NULL,
  approved_by INTEGER,
  approved_at TEXT,
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL,          -- recette | depense
  amount REAL NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL,
  nom TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  etat TEXT NOT NULL,
  location TEXT NOT NULL,
  statut TEXT NOT NULL,        -- Disponible | Emprunté
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  description TEXT,
  is_commun INTEGER NOT NULL,  -- 0/1
  sections_json TEXT NOT NULL, -- JSON array des sections si !commun, [] sinon
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS children (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  age INTEGER,
  date_naissance TEXT,
  section TEXT NOT NULL,
  parent TEXT NOT NULL,
  telephone TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
`);

// Lightweight migrations
function safeAlter(sql) {
  try {
    db.exec(sql);
  } catch {
    // ignore if already applied
  }
}

// Add active column on users if missing
safeAlter(`ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;`);

module.exports = db;

