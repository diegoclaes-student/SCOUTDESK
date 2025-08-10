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
    const res = await fetch(`${API_BASE}/auth/register`, { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) });
    return res.json();
  },
  async login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ email, password }) });
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

  // Approvals
  async listPendingUsers() {
    const res = await fetch(`${API_BASE}/users/pending`, { headers: this.headers(false) });
    return res.json();
  },
  async approveUser(id) {
    const res = await fetch(`${API_BASE}/users/${id}/approve`, { method: 'POST', headers: this.headers(false) });
    return res.json();
  },

  // Staff (Chefs)
  async listStaff(params = {}) {
    const url = new URL(`${API_BASE}/staff`);
    Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v); });
    const res = await fetch(url, { headers: this.headers(false) });
    return res.json();
  },
  async setUserRole(id, role, section = null) {
    const res = await fetch(`${API_BASE}/users/${id}/role`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ role, section }) });
    return res.json();
  },
  async toggleUserActive(id) {
    const res = await fetch(`${API_BASE}/users/${id}/toggle-active`, { method: 'POST', headers: this.headers(false) });
    return res.json();
  },

  // Transactions
  async listTransactions(section) {
    const url = new URL(`${API_BASE}/transactions`);
    if (section) url.searchParams.set('section', section);
    const res = await fetch(url, { headers: this.headers(false) });
    return res.json();
  },
  async addTransaction(payload) {
    const res = await fetch(`${API_BASE}/transactions`, { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) });
    return res.json();
  },
  async deleteTransaction(id) {
    const res = await fetch(`${API_BASE}/transactions/${id}`, { method: 'DELETE', headers: this.headers(false) });
    return res.json();
  },

  // Items
  async listItems(section) {
    const url = new URL(`${API_BASE}/items`);
    if (section) url.searchParams.set('section', section);
    const res = await fetch(url, { headers: this.headers(false) });
    return res.json();
  },
  async addItem(payload) {
    const res = await fetch(`${API_BASE}/items`, { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) });
    return res.json();
  },
  async toggleItem(id) {
    const res = await fetch(`${API_BASE}/items/${id}/toggle`, { method: 'POST', headers: this.headers(false) });
    return res.json();
  },
  async deleteItem(id) {
    const res = await fetch(`${API_BASE}/items/${id}`, { method: 'DELETE', headers: this.headers(false) });
    return res.json();
  },

  // Events
  async listEvents() {
    const res = await fetch(`${API_BASE}/events`, { headers: this.headers(false) });
    return res.json();
  },
  async addEvent(payload) {
    const res = await fetch(`${API_BASE}/events`, { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) });
    return res.json();
  },
  async deleteEvent(id) {
    const res = await fetch(`${API_BASE}/events/${id}`, { method: 'DELETE', headers: this.headers(false) });
    return res.json();
  },

  // Children
  async listChildren(section) {
    const url = new URL(`${API_BASE}/children`);
    if (section) url.searchParams.set('section', section);
    const res = await fetch(url, { headers: this.headers(false) });
    return res.json();
  },
  async addChild(payload) {
    const res = await fetch(`${API_BASE}/children`, { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) });
    return res.json();
  },
  async updateChild(id, payload) {
    const res = await fetch(`${API_BASE}/children/${id}`, { method: 'PATCH', headers: this.headers(), body: JSON.stringify(payload) });
    return res.json();
  },
  async deleteChild(id) {
    const res = await fetch(`${API_BASE}/children/${id}`, { method: 'DELETE', headers: this.headers(false) });
    return res.json();
  }
};