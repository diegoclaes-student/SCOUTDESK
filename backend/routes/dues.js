const express = require('express');
const router = express.Router();
const db = require('../db');
const authorize = require('../middleware/authorize');

const toCents = (amount) => {
  if (typeof amount === 'number') return Math.round(amount * 100);
  return Math.round(parseFloat(String(amount).replace(',', '.')) * 100);
};

// Helper: ensure category id
function categoryIdByType(type) {
  if (type === 'COTISATION') {
    const row = db.prepare("SELECT id FROM transaction_categories WHERE name = 'Cotisation'").get();
    return row?.id || db.prepare("INSERT INTO transaction_categories (name, kind) VALUES ('Cotisation','INCOME')").run().lastInsertRowid;
  }
  if (type === 'ASSURANCE') {
    const row = db.prepare("SELECT id FROM transaction_categories WHERE name = 'Assurance'").get();
    return row?.id || db.prepare("INSERT INTO transaction_categories (name, kind) VALUES ('Assurance','INCOME')").run().lastInsertRowid;
  }
  throw new Error('Type inconnu');
}

function defaultAccountIdForMethod(method) {
  const row = db.prepare('SELECT id FROM accounts WHERE kind = ? ORDER BY id LIMIT 1').get(method);
  if (!row) throw new Error(`Compte par défaut manquant pour ${method}`);
  return row.id;
}

// Lister
router.get('/assignments', authorize(), (req, res) => {
  const { year, person_type, type, paid } = req.query;
  let sql = `SELECT * FROM dues_assignments WHERE 1=1`;
  const params = [];
  if (year) { sql += ' AND year = ?'; params.push(parseInt(year, 10)); }
  if (person_type && ['CHEF','CHILD'].includes(person_type)) { sql += ' AND person_type = ?'; params.push(person_type); }
  if (type && ['ASSURANCE','COTISATION'].includes(type)) { sql += ' AND type = ?'; params.push(type); }
  if (typeof paid !== 'undefined') { sql += ' AND paid = ?'; params.push(paid === 'true' ? 1 : 0); }
  sql += ' ORDER BY type, person_type, person_id';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// Affectation en masse
router.post('/assignments/bulk', authorize(['STAFF_LEAD','UNIT_LEAD','TREASURER']), (req, res) => {
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
      stmt.run(person_type, parseInt(pid, 10), type, scope, parseInt(year, 10), toCents(amount));
    }
    db.exec('COMMIT');
    res.json({ ok: true, count: person_ids.length });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: e.message });
  }
});

// Marquer payé (+ transaction)
router.patch('/assignments/:id/pay', authorize(['TREASURER','STAFF_LEAD']), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { method, date, description } = req.body || {};
  if (!['BANK','CASH'].includes(method) || !date) return res.status(400).json({ error: 'Paramètres invalides' });

  const due = db.prepare('SELECT * FROM dues_assignments WHERE id = ?').get(id);
  if (!due) return res.status(404).json({ error: 'Affectation introuvable' });
  if (due.paid) return res.status(400).json({ error: 'Déjà payé' });

  const catId = categoryIdByType(due.type);
  const accId = defaultAccountIdForMethod(method);

  db.exec('BEGIN');
  try {
    // Crée transaction de revenu
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

    // Marque comme payé
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

module.exports = router;