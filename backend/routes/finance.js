const express = require('express');
const router = express.Router();
const db = require('../db');
const authorize = require('../middleware/authorize');

// Helpers
const asInt = (v) => parseInt(v, 10);
const toCents = (amount) => {
  if (typeof amount === 'number') return Math.round(amount * 100);
  return Math.round(parseFloat(String(amount).replace(',', '.')) * 100);
};

// Ensure category exists and return its id
function getOrCreateCategory(name, kind) {
  const sel = db.prepare('SELECT id FROM transaction_categories WHERE name = ?');
  const row = sel.get(name);
  if (row) return row.id;
  const ins = db.prepare('INSERT INTO transaction_categories (name, kind) VALUES (?, ?)');
  const info = ins.run(name, kind);
  return info.lastInsertRowid;
}

// Map method -> default account id
function defaultAccountIdForMethod(method) {
  const row = db.prepare('SELECT id FROM accounts WHERE kind = ? ORDER BY id LIMIT 1').get(method);
  if (!row) throw new Error(`Aucun compte par défaut pour ${method}`);
  return row.id;
}

// Accounts
router.get('/accounts', authorize(), (req, res) => {
  const accounts = db.prepare('SELECT id, name, kind, active FROM accounts WHERE active = 1 ORDER BY id').all();
  const balanceStmt = db.prepare(`
    SELECT
      SUM(CASE WHEN kind = 'INCOME' THEN amount_cents ELSE -amount_cents END) AS bal
    FROM transactions WHERE account_id = ?
  `);
  const withBal = accounts.map(a => {
    const b = balanceStmt.get(a.id);
    return { ...a, balance_cents: b?.bal || 0 };
  });
  res.json(withBal);
});

router.post('/accounts', authorize(['TREASURER','STAFF_LEAD']), (req, res) => {
  const { name, kind } = req.body || {};
  if (!name || !['BANK','CASH'].includes(kind)) return res.status(400).json({ error: 'Paramètres invalides' });
  try {
    const info = db.prepare('INSERT INTO accounts (name, kind) VALUES (?, ?)').run(name, kind);
    res.json({ id: info.lastInsertRowid, name, kind });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Categories
router.get('/categories', authorize(), (req, res) => {
  const rows = db.prepare('SELECT id, name, kind, active FROM transaction_categories WHERE active = 1 ORDER BY kind, name').all();
  res.json(rows);
});

router.post('/categories', authorize(['TREASURER','STAFF_LEAD']), (req, res) => {
  const { name, kind } = req.body || {};
  if (!name || !['INCOME','EXPENSE'].includes(kind)) return res.status(400).json({ error: 'Paramètres invalides' });
  try {
    const info = db.prepare('INSERT INTO transaction_categories (name, kind) VALUES (?, ?)').run(name, kind);
    res.json({ id: info.lastInsertRowid, name, kind });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Transactions
router.get('/transactions', authorize(), (req, res) => {
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

router.post('/transactions', authorize(['TREASURER','STAFF_LEAD']), (req, res) => {
  const { date, amount, kind, method, category_id, account_id, description, chef_id, create_debt, debt_reason } = req.body || {};
  if (!date || !amount || !['INCOME','EXPENSE'].includes(kind) || !['BANK','CASH'].includes(method))
    return res.status(400).json({ error: 'Paramètres invalides' });

  const amount_cents = toCents(amount);
  const accId = account_id || defaultAccountIdForMethod(method);
  const catId = category_id || null;
  if (!catId) return res.status(400).json({ error: 'category_id requis' });

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
    // Si on crée une dette liée à une dépense pour un chef
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

// Dettes: liste
router.get('/debts', authorize(), (req, res) => {
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

// Dettes: résumé par chef
router.get('/debts/summary', authorize(), (req, res) => {
  const rows = db.prepare(`
    SELECT d.chef_id, u.email AS chef_email,
      SUM(CASE WHEN d.status = 'OPEN' THEN d.amount_cents ELSE 0 END) AS open_cents,
      SUM(CASE WHEN d.status = 'SETTLED' THEN d.amount_cents ELSE 0 END) AS settled_cents,
      COUNT(*) AS items
    FROM chef_debts d
    LEFT JOIN users u ON u.id = d.chef_id
    GROUP BY d.chef_id
    ORDER BY open_cents DESC
  `).all();
  res.json(rows);
});

// Dettes: créer
router.post('/debts', authorize(['TREASURER','STAFF_LEAD']), (req, res) => {
  const { chef_id, amount, reason } = req.body || {};
  if (!chef_id || !amount || !reason) return res.status(400).json({ error: 'Paramètres invalides' });
  const info = db.prepare(`
    INSERT INTO chef_debts (chef_id, amount_cents, reason, status, created_by)
    VALUES (?, ?, ?, 'OPEN', ?)
  `).run(asInt(chef_id), toCents(amount), reason, req.user?.id || null);
  res.json({ id: info.lastInsertRowid });
});

// Dettes: solder (crée une transaction INCOME “Remboursement dette chef”)
router.post('/debts/:id/settle', authorize(['TREASURER','STAFF_LEAD']), (req, res) => {
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
    // Créer la transaction de remboursement
    const tx = db.prepare(`
      INSERT INTO transactions (date, amount_cents, kind, method, account_id, category_id, description, chef_id, created_by, linked_debt_id)
      VALUES (?, ?, 'INCOME', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      date, debt.amount_cents, method, accId, catId,
      description || `Remboursement dette: ${debt.reason}`, debt.chef_id, req.user?.id || null, id
    );

    // Marquer la dette comme soldée
    db.prepare(`
      UPDATE chef_debts
      SET status = 'SETTLED', settled_at = datetime('now'), settled_by = ?, settlement_tx_id = ?
      WHERE id = ?
    `).run(req.user?.id || null, tx.lastInsertRowid, id);

    db.exec('COMMIT');
    res.json({ settlement_tx_id: tx.lastInsertRowid });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;