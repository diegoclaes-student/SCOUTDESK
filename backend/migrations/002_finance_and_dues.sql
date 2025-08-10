PRAGMA foreign_keys = ON;

/* -----------------------------
   Accounts (Banque / Caisse)
------------------------------*/
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('BANK','CASH')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

INSERT OR IGNORE INTO accounts (name, kind) VALUES
  ('Banque', 'BANK'),
  ('Caisse', 'CASH');

/* -----------------------------
   Transaction categories
------------------------------*/
CREATE TABLE IF NOT EXISTS transaction_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('INCOME','EXPENSE')),
  active INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO transaction_categories (name, kind) VALUES
  ('Cotisation', 'INCOME'),
  ('Assurance', 'INCOME'),
  ('Remboursement dette chef', 'INCOME'),
  ('Don', 'INCOME'),
  ('Subvention', 'INCOME'),
  ('Matériel', 'EXPENSE'),
  ('Activité', 'EXPENSE'),
  ('Assurance (frais)', 'EXPENSE'),
  ('Frais bancaires', 'EXPENSE');

/* -----------------------------
   Transactions (ledger)
   Montants en centimes pour précision
------------------------------*/
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,                         -- ISO: YYYY-MM-DD
  amount_cents INTEGER NOT NULL,              -- positif: sens en fonction de 'kind'
  kind TEXT NOT NULL CHECK (kind IN ('INCOME','EXPENSE')),
  method TEXT NOT NULL CHECK (method IN ('BANK','CASH')),  -- cash vs banque
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id INTEGER NOT NULL REFERENCES transaction_categories(id) ON DELETE RESTRICT,
  description TEXT,
  chef_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- si lié à un chef
  linked_debt_id INTEGER REFERENCES chef_debts(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);

/* -----------------------------
   Dettes des chefs envers la section
------------------------------*/
CREATE TABLE IF NOT EXISTS chef_debts (
  id INTEGER PRIMARY KEY,
  chef_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','SETTLED')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  settled_at TEXT,
  settled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  settlement_tx_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_chef_debts_status ON chef_debts(status);
CREATE INDEX IF NOT EXISTS idx_chef_debts_chef ON chef_debts(chef_id);

/* -----------------------------
   Suivi Assurance & Cotisation
   person_type: 'CHEF' | 'CHILD'
   scope: 'UNIT' (assurance) | 'SECTION' (cotisation)
------------------------------*/
CREATE TABLE IF NOT EXISTS dues_assignments (
  id INTEGER PRIMARY KEY,
  person_type TEXT NOT NULL CHECK (person_type IN ('CHEF','CHILD')),
  person_id INTEGER NOT NULL,                           -- référence à users.id (CHEF) ou à la table enfants (CHILD)
  type TEXT NOT NULL CHECK (type IN ('ASSURANCE','COTISATION')),
  scope TEXT NOT NULL CHECK (scope IN ('UNIT','SECTION')),
  year INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_on TEXT,
  payment_method TEXT CHECK (payment_method IN ('BANK','CASH')),
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  UNIQUE(person_type, person_id, type, year)
);

CREATE INDEX IF NOT EXISTS idx_dues_year ON dues_assignments(year);
CREATE INDEX IF NOT EXISTS idx_dues_paid ON dues_assignments(paid);