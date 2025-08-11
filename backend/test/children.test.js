const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'testsecret';

const app = require('../server');
const db = app.locals.db;

db.prepare("INSERT INTO users (id, email, password_hash, role, status, active) VALUES (1,'test@example.com','x','SUPERADMIN','APPROVED',1)").run();
const token = jwt.sign({ sub:1, role:'SUPERADMIN', email:'test@example.com' }, process.env.JWT_SECRET);

test('children CRUD', async () => {
  let res = await request(app).get('/api/children').set('Authorization', 'Bearer '+token);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, []);

  res = await request(app).post('/api/children').set('Authorization','Bearer '+token).send({ nom:'Doe', prenom:'John', section:'Castors', parent:'Jane', telephone:'123' });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.id);

  res = await request(app).get('/api/children').set('Authorization', 'Bearer '+token);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 1);
  assert.strictEqual(res.body[0].nom, 'Doe');
});
