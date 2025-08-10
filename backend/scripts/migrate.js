const fs = require('fs');
const path = require('path');
const db = require('../db');

function runSql(sql) {
  db.exec('BEGIN');
  try {
    db.exec(sql);
    db.exec('COMMIT');
    console.log('Migration applied successfully.');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('Migration failed:', e.message);
    process.exit(1);
  }
}

(function main() {
  const file = path.join(__dirname, '..', 'migrations', '002_finance_and_dues.sql');
  const sql = fs.readFileSync(file, 'utf8');
  runSql(sql);
})();