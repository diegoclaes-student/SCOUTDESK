// API client: gère auth, appels au backend
const API_BASE = 'http://localhost:3000/api';

const api = {
  token: localStorage.getItem('scout_token') || null,

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('scout_token', token);
    else localStorage.removeItem('scout_token');
  },

  headers(json = true) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  },

  // Auth
  async register(payload) {
    // ATTENTION: nécessite que le backend implémente POST /api/auth/register
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  async login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok && data.token) this.setToken(data.token);
    return { ok: res.ok, data };
  },

  async me() {
    if (!this.token) return null;
    const res = await fetch(`${API_BASE}/auth/me`, { headers: this.headers(false) });
    if (!res.ok) return null;
    return res.json();
  },

  // Utilisateurs / Staff
  async listUsers() {
    const res = await fetch(`${API_BASE}/users`, { headers: this.headers(false) });
    return res.json();
  },

  // (Optionnel) si tu veux une liste “staff” filtrée côté client
  async listStaff() {
    const users = await this.listUsers();
    const staffRoles = new Set(['CHEF', 'TREASURER', 'UNIT_LEAD', 'STAFF_LEAD', 'SUPERADMIN']);
    return Array.isArray(users) ? users.filter(u => staffRoles.has(String(u.role || '').toUpperCase())) : [];
  },

  async setUserRole(id, role) {
    const res = await fetch(`${API_BASE}/users/${id}/role`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ role }),
    });
    return res.json();
  },

  // Approbations (nécessite backend pour fonctionner)
  async listPendingUsers() {
    // backend à implémenter: GET /api/users/pending
    const res = await fetch(`${API_BASE}/users/pending`, { headers: this.headers(false) });
    return res.json();
  },

  async approveUser(id) {
    // backend à implémenter: POST /api/users/:id/approve
    const res = await fetch(`${API_BASE}/users/${id}/approve`, {
      method: 'POST',
      headers: this.headers(false),
    });
    return res.json();
  },

  async toggleUserActive(id) {
    // backend à implémenter: POST /api/users/:id/toggle-active
    const res = await fetch(`${API_BASE}/users/${id}/toggle-active`, {
      method: 'POST',
      headers: this.headers(false),
    });
    return res.json();
  },

  // Finance
  async listAccounts() {
    const res = await fetch(`${API_BASE}/finance/accounts`, { headers: this.headers(false) });
    return res.json();
  },

  async listCategories() {
    const res = await fetch(`${API_BASE}/finance/categories`, { headers: this.headers(false) });
    return res.json();
  }

  ,async listTransactions(params = {}) {
    const url = new URL(`${API_BASE}/finance/transactions`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
    const res = await fetch(url, { headers: this.headers(false) });
    return res.json();
  },

  async addTransaction(payload) {
    // Le backend accepte category_name (ex: "Cotisation") ou category_id (si connu)
    const res = await fetch(`${API_BASE}/finance/transactions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  async deleteTransaction(id) {
    const res = await fetch(`${API_BASE}/finance/transactions/${id}`, {
      method: 'DELETE',
      headers: this.headers(false),
    });
    return res.json();
  },

  // Dettes
  async listDebts(params = {}) {
    const url = new URL(`${API_BASE}/finance/debts`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
    const res = await fetch(url, { headers: this.headers(false) });
    return res.json();
  },

  async createDebt({ chef_id, amount, reason }) {
    const res = await fetch(`${API_BASE}/finance/debts`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ chef_id, amount, reason }),
    });
    return res.json();
  },

  async settleDebt(id, { date, method, description }) {
    const res = await fetch(`${API_BASE}/finance/debts/${id}/settle`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ date, method, description }),
    });
    return res.json();
  },
};

window.scoutApi = api;