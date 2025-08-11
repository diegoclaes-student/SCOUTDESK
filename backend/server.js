/* ScoutDeskV2 backend simple – serveur unique avec schéma auto, seed et API complète
   Auth (JWT), Rôles, Trésorerie (banque/caisse, catégories, transactions),
   Dettes des chefs, Assurance/Cotisation (dues)
*/
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const cookieParser = require('cookie-parser');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Config
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './data/scout.db';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-please';

// Init DB
const dataDir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
app.locals.db = db;

// Helpers
const now = () => new Date().toISOString();
const toCents = (amount) => {
  if (typeof amount === 'number') return Math.round(amount * 100);
  return Math.round(parseFloat(String(amount).replace(',', '.')) * 100);
};
const asInt = (v) => parseInt(v, 10);

// Schema + seed
function migrate() {
  const sql = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER',
    status TEXT NOT NULL DEFAULT 'APPROVED',
    active INTEGER NOT NULL DEFAULT 1,
    first_name TEXT, last_name TEXT, phone TEXT, birthdate TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('BANK','CASH')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS transaction_categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('INCOME','EXPENSE')),
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('INCOME','EXPENSE')),
    method TEXT NOT NULL CHECK (method IN ('BANK','CASH')),
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    category_id INTEGER NOT NULL REFERENCES transaction_categories(id) ON DELETE RESTRICT,
    description TEXT,
    chef_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    linked_debt_id INTEGER REFERENCES chef_debts(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

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

  CREATE TABLE IF NOT EXISTS dues_assignments (
    id INTEGER PRIMARY KEY,
    person_type TEXT NOT NULL CHECK (person_type IN ('CHEF','CHILD')),
    person_id INTEGER NOT NULL,
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
  `;
  db.exec(sql);

  // Seed accounts
  db.prepare("INSERT OR IGNORE INTO accounts (name, kind) VALUES ('Banque','BANK')").run();
  db.prepare("INSERT OR IGNORE INTO accounts (name, kind) VALUES ('Caisse','CASH')").run();

  // Seed categories
  const catSeed = [
    ['Cotisation','INCOME'],
    ['Assurance','INCOME'],
    ['Remboursement dette chef','INCOME'],
    ['Don','INCOME'],
    ['Subvention','INCOME'],
    ['Matériel','EXPENSE'],
    ['Activité','EXPENSE'],
    ['Assurance (frais)','EXPENSE'],
    ['Frais bancaires','EXPENSE']
  ];
  const insCat = db.prepare('INSERT OR IGNORE INTO transaction_categories (name, kind) VALUES (?, ?)');
  for (const [n,k] of catSeed) insCat.run(n,k);

  // Seed superadmin
  const email = process.env.SUPERADMIN_EMAIL;
  const pass = process.env.SUPERADMIN_PASSWORD;
  if (email && pass) {
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!exists) {
      const hash = bcrypt.hashSync(pass, 12);
      db.prepare(`
        INSERT INTO users (email, password_hash, role, status, active, first_name, last_name)
        VALUES (?, ?, 'SUPERADMIN', 'APPROVED', 1, ?, ?)
      `).run(email, hash, process.env.SUPERADMIN_PRENOM || 'Super', process.env.SUPERADMIN_NOM || 'Admin');
      console.log(`Seed: SUPERADMIN créé (${email})`);
    }
  } else {
    console.log('Astuce: définissez SUPERADMIN_EMAIL et SUPERADMIN_PASSWORD dans .env pour créer un superadmin automatiquement.');
  }
}
migrate();

// Auth
function sign(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}
function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Non authentifié' });
    const payload = jwt.verify(token, JWT_SECRET);
    const u = db.prepare('SELECT id, email, role, status, active, first_name, last_name FROM users WHERE id = ?').get(payload.sub);
    if (!u || !u.active) return res.status(401).json({ error: 'Non authentifié' });
    req.user = u;
    next();
  } catch {
    return res.status(401).json({ error: 'Non authentifié' });
  }
}
function authorize(roles = []) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    if (req.user.role === 'SUPERADMIN') return next();
    if (roles.length === 0) return next();
    if (roles.includes(req.user.role)) return next();
    return res.status(403).json({ error: 'Accès interdit' });
  };
}
const canFinanceWrite = authorize(['TREASURER','STAFF_LEAD']);
const canRolesManage = authorize(['STAFF_LEAD','UNIT_LEAD']);

// Auth routes
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !bcrypt.compareSync(password, u.password_hash)) return res.status(400).json({ error: 'Identifiants invalides' });
  if (!u.active || u.status !== 'APPROVED') return res.status(403).json({ error: 'Compte inactif ou non approuvé' });
  const token = sign(u);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
  res.json({ user: { id: u.id, email: u.email, role: u.role, status: u.status, active: u.active } });
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.user));
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// Users: lister et changer rôle (gestion par STAFF_LEAD / UNIT_LEAD, SUPERADMIN tout puissant)
app.get('/api/users', requireAuth, authorize(), (req, res) => {
  const rows = db.prepare('SELECT id, email, role, status, active, first_name, last_name FROM users ORDER BY id').all();
  res.json(rows);
});
app.patch('/api/users/:id/role', requireAuth, canRolesManage, (req, res) => {
  const id = asInt(req.params.id);
  const { role } = req.body || {};
  const allowed = ['USER','CHEF','TREASURER','UNIT_LEAD','STAFF_LEAD','SUPERADMIN'];
  if (!allowed.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });

  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

  // Unicité du STAFF_LEAD
  if (role === 'STAFF_LEAD') {
    const already = db.prepare('SELECT id FROM users WHERE role = ? AND id != ?').get('STAFF_LEAD', id);
    if (already) return res.status(400).json({ error: 'Il existe déjà un Chef de staff (unique)' });
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  res.json({ ok: true });
});

// Children (enfants)
app.get('/api/children', requireAuth, authorize(), (req, res) => {
  const rows = db.prepare('SELECT id, nom, prenom, age, date_naissance, section, parent, telephone, notes FROM children ORDER BY nom, prenom').all();
  res.json(rows);
});
app.post('/api/children', requireAuth, authorize(['UNIT_LEAD','STAFF_LEAD']), (req, res) => {
  const { nom, prenom, age, date_naissance, section, parent, telephone, notes } = req.body || {};
  if (!nom || !prenom || !section || !parent || !telephone) return res.status(400).json({ error: 'Paramètres invalides' });
  const info = db.prepare(`INSERT INTO children (nom, prenom, age, date_naissance, section, parent, telephone, notes, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    nom, prenom, age || null, date_naissance || null, section, parent, telephone, notes || '', req.user?.id || null, now()
  );
  res.json({ id: info.lastInsertRowid });
});
app.delete('/api/children/:id', requireAuth, authorize(['UNIT_LEAD','STAFF_LEAD']), (req, res) => {
  const id = asInt(req.params.id);
  db.prepare('DELETE FROM children WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Finance helpers
function defaultAccountIdForMethod(method) {
  const row = db.prepare('SELECT id FROM accounts WHERE kind = ? ORDER BY id LIMIT 1').get(method);
  if (!row) throw new Error(`Aucun compte par défaut pour ${method}`);
  return row.id;
}
function getOrCreateCategory(name, kind) {
  const row = db.prepare('SELECT id FROM transaction_categories WHERE name = ?').get(name);
  if (row) return row.id;
  const info = db.prepare('INSERT INTO transaction_categories (name, kind) VALUES (?, ?)').run(name, kind);
  return info.lastInsertRowid;
}

// Finance: comptes
app.get('/api/finance/accounts', requireAuth, authorize(), (req, res) => {
  const accounts = db.prepare('SELECT id, name, kind, active FROM accounts WHERE active = 1 ORDER BY id').all();
  const balStmt = db.prepare(`
    SELECT
      SUM(CASE WHEN kind='INCOME' THEN amount_cents ELSE -amount_cents END) AS bal
    FROM transactions WHERE account_id = ?
  `);
  const withBal = accounts.map(a => ({ ...a, balance_cents: balStmt.get(a.id)?.bal || 0 }));
  res.json(withBal);
});
app.post('/api/finance/accounts', requireAuth, canFinanceWrite, (req, res) => {
  const { name, kind } = req.body || {};
  if (!name || !['BANK','CASH'].includes(kind)) return res.status(400).json({ error: 'Paramètres invalides' });
  try {
    const info = db.prepare('INSERT INTO accounts (name, kind) VALUES (?, ?)').run(name, kind);
    res.json({ id: info.lastInsertRowid, name, kind });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Finance: catégories
app.get('/api/finance/categories', requireAuth, authorize(), (req, res) => {
  const rows = db.prepare('SELECT id, name, kind, active FROM transaction_categories WHERE active = 1 ORDER BY kind, name').all();
  res.json(rows);
});
app.post('/api/finance/categories', requireAuth, canFinanceWrite, (req, res) => {
  const { name, kind } = req.body || {};
  if (!name || !['INCOME','EXPENSE'].includes(kind)) return res.status(400).json({ error: 'Paramètres invalides' });
  try {
    const info = db.prepare('INSERT INTO transaction_categories (name, kind) VALUES (?, ?)').run(name, kind);
    res.json({ id: info.lastInsertRowid, name, kind });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Finance: transactions
app.get('/api/finance/transactions', requireAuth, authorize(), (req, res) => {
  const { start, end, kind, method, category_id, chef_id, limit = 200, offset = 0 } = req.query;
  let sql = `
    SELECT t.*, a.name AS account_name, c.name AS category_name
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    JOIN transaction_categories c ON c.id = t.category_id
    WHERE 1=1
  `;
  const params = [];
  if (start) { sql += ' AND t.date >= ?'; params.push(start); }
  if (end)   { sql += ' AND t.date <= ?'; params.push(end); }
  if (kind && ['INCOME','EXPENSE'].includes(kind)) { sql += ' AND t.kind = ?'; params.push(kind); }
  if (method && ['BANK','CASH'].includes(method)) { sql += ' AND t.method = ?'; params.push(method); }
  if (category_id) { sql += ' AND t.category_id = ?'; params.push(asInt(category_id)); }
  if (chef_id) { sql += ' AND t.chef_id = ?'; params.push(asInt(chef_id)); }
  sql += ' ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?';
  params.push(asInt(limit), asInt(offset));
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});
app.post('/api/finance/transactions', requireAuth, canFinanceWrite, (req, res) => {
  const { date, amount, kind, method, category_id, category_name, account_id, description, chef_id, create_debt, debt_reason } = req.body || {};
  if (!date || !amount || !['INCOME','EXPENSE'].includes(kind) || !['BANK','CASH'].includes(method))
    return res.status(400).json({ error: 'Paramètres invalides' });

  const amount_cents = toCents(amount);
  const accId = account_id || defaultAccountIdForMethod(method);
  const catId = category_id || (category_name ? getOrCreateCategory(category_name, kind) : null);
  if (!catId) return res.status(400).json({ error: 'category_id ou category_name requis' });

  const insertTx = db.prepare(`
    INSERT INTO transactions (date, amount_cents, kind, method, account_id, category_id, description, chef_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDebt = db.prepare(`
    INSERT INTO chef_debts (chef_id, amount_cents, reason, status, created_by)
    VALUES (?, ?, ?, 'OPEN', ?)
  `);
  const linkDebtToTx = db.prepare(`UPDATE transactions SET linked_debt_id = ? WHERE id = ?`);

  db.exec('BEGIN');
  try {
    const txInfo = insertTx.run(
      date, amount_cents, kind, method, accId, catId, description || null, chef_id || null, req.user?.id || null
    );

    let debtId = null;
    if (create_debt && kind === 'EXPENSE' && chef_id && amount_cents > 0) {
      if (!debt_reason) throw new Error('Raison de la dette manquante');
      const d = insertDebt.run(chef_id, amount_cents, debt_reason, req.user?.id || null);
      debtId = d.lastInsertRowid;
      linkDebtToTx.run(debtId, txInfo.lastInsertRowid);
    }

    db.exec('COMMIT');
    res.json({ id: txInfo.lastInsertRowid, linked_debt_id: debtId });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: e.message });
  }
});

// Finance: dettes
app.get('/api/finance/debts', requireAuth, authorize(), (req, res) => {
  const { status, chef_id } = req.query;
  let sql = `
    SELECT d.*, u.email AS chef_email
    FROM chef_debts d
    LEFT JOIN users u ON u.id = d.chef_id
    WHERE 1=1
  `;
  const params = [];
  if (status && ['OPEN','SETTLED'].includes(status)) { sql += ' AND d.status = ?'; params.push(status); }
  if (chef_id) { sql += ' AND d.chef_id = ?'; params.push(asInt(chef_id)); }
  sql += ' ORDER BY d.status ASC, d.created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});
app.get('/api/finance/debts/summary', requireAuth, authorize(), (req, res) => {
  const rows = db.prepare(`
    SELECT d.chef_id, u.email AS chef_email,
      SUM(CASE WHEN d.status='OPEN' THEN d.amount_cents ELSE 0 END) AS open_cents,
      SUM(CASE WHEN d.status='SETTLED' THEN d.amount_cents ELSE 0 END) AS settled_cents,
      COUNT(*) AS items
    FROM chef_debts d
    LEFT JOIN users u ON u.id = d.chef_id
    GROUP BY d.chef_id
    ORDER BY open_cents DESC
  `).all();
  res.json(rows);
});
app.post('/api/finance/debts', requireAuth, canFinanceWrite, (req, res) => {
  const { chef_id, amount, reason } = req.body || {};
  if (!chef_id || !amount || !reason) return res.status(400).json({ error: 'Paramètres invalides' });
  const info = db.prepare(`
    INSERT INTO chef_debts (chef_id, amount_cents, reason, status, created_by)
    VALUES (?, ?, ?, 'OPEN', ?)
  `).run(asInt(chef_id), toCents(amount), reason, req.user?.id || null);
  res.json({ id: info.lastInsertRowid });
});
app.post('/api/finance/debts/:id/settle', requireAuth, canFinanceWrite, (req, res) => {
  const id = asInt(req.params.id);
  const { date, method, description } = req.body || {};
  if (!date || !['BANK','CASH'].includes(method)) return res.status(400).json({ error: 'Paramètres invalides' });

  const debt = db.prepare('SELECT * FROM chef_debts WHERE id = ?').get(id);
  if (!debt) return res.status(404).json({ error: 'Dette introuvable' });
  if (debt.status === 'SETTLED') return res.status(400).json({ error: 'Déjà soldée' });

  const catId = getOrCreateCategory('Remboursement dette chef', 'INCOME');
  const accId = defaultAccountIdForMethod(method);

  db.exec('BEGIN');
  try {
    const tx = db.prepare(`
      INSERT INTO transactions (date, amount_cents, kind, method, account_id, category_id, description, chef_id, created_by, linked_debt_id)
      VALUES (?, ?, 'INCOME', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      date, debt.amount_cents, method, accId, catId,
      description || `Remboursement dette: ${debt.reason}`, debt.chef_id, req.user?.id || null, id
    );
    db.prepare(`
      UPDATE chef_debts
      SET status='SETTLED', settled_at = datetime('now'), settled_by = ?, settlement_tx_id = ?
      WHERE id = ?
    `).run(req.user?.id || null, tx.lastInsertRowid, id);

    db.exec('COMMIT');
    res.json({ settlement_tx_id: tx.lastInsertRowid });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: e.message });
  }
});

// Dues (assurance/cotisation)
function categoryIdByType(type) {
  if (type === 'COTISATION') return getOrCreateCategory('Cotisation','INCOME');
  if (type === 'ASSURANCE') return getOrCreateCategory('Assurance','INCOME');
  throw new Error('Type inconnu');
}
app.get('/api/dues/assignments', requireAuth, authorize(), (req, res) => {
  const { year, person_type, type, paid } = req.query;
  let sql = `SELECT * FROM dues_assignments WHERE 1=1`;
  const params = [];
  if (year) { sql += ' AND year = ?'; params.push(asInt(year)); }
  if (person_type && ['CHEF','CHILD'].includes(person_type)) { sql += ' AND person_type = ?'; params.push(person_type); }
  if (type && ['ASSURANCE','COTISATION'].includes(type)) { sql += ' AND type = ?'; params.push(type); }
  if (typeof paid !== 'undefined') { sql += ' AND paid = ?'; params.push(paid === 'true' ? 1 : 0); }
  sql += ' ORDER BY type, person_type, person_id';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});
app.post('/api/dues/assignments/bulk', requireAuth, authorize(['STAFF_LEAD','UNIT_LEAD','TREASURER']), (req, res) => {
  const { person_type, person_ids, type, scope, year, amount } = req.body || {};
  if (!['CHEF','CHILD'].includes(person_type) || !Array.isArray(person_ids) || person_ids.length === 0) {
    return res.status(400).json({ error: 'Paramètres invalides (personnes)' });
  }
  if (!['ASSURANCE','COTISATION'].includes(type) || !['UNIT','SECTION'].includes(scope)) {
    return res.status(400).json({ error: 'Paramètres invalides (type/scope)' });
  }
  if (!year || !amount) return res.status(400).json({ error: 'Année et montant requis' });

  const stmt = db.prepare(`
    INSERT INTO dues_assignments (person_type, person_id, type, scope, year, amount_cents, paid)
    VALUES (?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(person_type, person_id, type, year) DO UPDATE SET amount_cents = excluded.amount_cents
  `);

  db.exec('BEGIN');
  try {
    for (const pid of person_ids) {
      stmt.run(person_type, asInt(pid), type, scope, asInt(year), toCents(amount));
    }
    db.exec('COMMIT');
    res.json({ ok: true, count: person_ids.length });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: e.message });
  }
});
app.patch('/api/dues/assignments/:id/pay', requireAuth, canFinanceWrite, (req, res) => {
  const id = asInt(req.params.id);
  const { method, date, description } = req.body || {};
  if (!['BANK','CASH'].includes(method) || !date) return res.status(400).json({ error: 'Paramètres invalides' });

  const due = db.prepare('SELECT * FROM dues_assignments WHERE id = ?').get(id);
  if (!due) return res.status(404).json({ error: 'Affectation introuvable' });
  if (due.paid) return res.status(400).json({ error: 'Déjà payé' });

  const catId = categoryIdByType(due.type);
  const accId = defaultAccountIdForMethod(method);

  db.exec('BEGIN');
  try {
    const tx = db.prepare(`
      INSERT INTO transactions (date, amount_cents, kind, method, account_id, category_id, description, chef_id, created_by)
      VALUES (?, ?, 'INCOME', ?, ?, ?, ?, ?, ?)
    `).run(
      date,
      due.amount_cents,
      method,
      accId,
      catId,
      description || `${due.type === 'ASSURANCE' ? 'Assurance' : 'Cotisation'} ${due.year}`,
      due.person_type === 'CHEF' ? due.person_id : null,
      req.user?.id || null
    );

    db.prepare(`
      UPDATE dues_assignments
      SET paid = 1, paid_on = ?, payment_method = ?, transaction_id = ?
      WHERE id = ?
    `).run(date, method, tx.lastInsertRowid, id);

    db.exec('COMMIT');
    res.json({ transaction_id: tx.lastInsertRowid });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: e.message });
  }
});

// Health
app.get('/api/health', (req, res) => res.json({ ok: true, now: now() }));

// Boot
if (require.main === module) {
  if (process.argv.includes('--seed-only')) {
    console.log('Seed/migration terminés.');
    process.exit(0);
  } else {
    app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
  }
}

module.exports = app;