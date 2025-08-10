import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

const email = process.env.SUPERADMIN_EMAIL;
const password = process.env.SUPERADMIN_PASSWORD;

if (!email || !password) {
  console.error('Veuillez définir SUPERADMIN_EMAIL et SUPERADMIN_PASSWORD dans .env');
  process.exit(1);
}

const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
if (existing) {
  console.log('Superadmin existe déjà:', email);
  process.exit(0);
}

const hash = bcrypt.hashSync(password, 12);
const nom = process.env.SUPERADMIN_NOM || 'Super';
const prenom = process.env.SUPERADMIN_PRENOM || 'Admin';
const totem = process.env.SUPERADMIN_TOTEM || '';
const telephone = process.env.SUPERADMIN_TEL || '0000000000';
const date_naissance = process.env.SUPERADMIN_DATE_NAISSANCE || '1970-01-01';

db.prepare(`
  INSERT INTO users (email, password_hash, nom, prenom, totem, date_naissance, telephone, role, section, status, created_at, approved_by, approved_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'SUPERADMIN', NULL, 'APPROVED', ?, NULL, NULL)
`).run(email, hash, nom, prenom, totem, date_naissance, telephone, new Date().toISOString());

console.log('Superadmin créé:', email);