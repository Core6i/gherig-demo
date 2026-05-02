/**
 * NCRIS · Browser Client
 * ────────────────────────────────────────────────────────────────────
 * The browser-side counterpart to ncris/adapters/ncris-client.js.
 * Identical interface, uses the browser's fetch and WebSocket.
 *
 * In production this client is what every subsystem (Tablet, Portal,
 * NECC, ARCS, EMT) uses to talk to NCRIS. The dev server proxies
 * /api/* and /ws/* to localhost:4000 (NCRIS), so the same code works
 * in development and production with no URL changes.
 */

const TOKEN_KEY = 'ncris.token';
const USER_KEY = 'ncris.user';

export class NcrisClient {
  constructor({ baseUrl = '' } = {}) {
    // Empty baseUrl uses the proxy in dev / same-origin in prod.
    this.baseUrl = baseUrl;
    this.token = sessionStorage.getItem(TOKEN_KEY) || null;
    this.user = JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
    this.ws = null;
    this.subs = new Map();
    this.reconnectAttempt = 0;
    this.listeners = new Set();
  }

  // ─── Auth state ──────────────────────────────────────────────

  isAuthenticated() { return !!this.token; }

  onAuthChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _notify() { for (const fn of this.listeners) try { fn(); } catch (_) {} }

  _setSession(token, user) {
    this.token = token;
    this.user = user;
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    }
    this._notify();
  }

  // ─── HTTP ────────────────────────────────────────────────────

  async _request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(this.baseUrl + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch (_) { json = { raw: text }; }
    if (!res.ok) {
      // Auto-logout on 401 (token expired)
      if (res.status === 401 && this.token) this._setSession(null, null);
      const err = new Error(json?.error?.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = json?.error?.code;
      err.details = json?.error?.details;
      throw err;
    }
    return json;
  }

  // ─── Auth ────────────────────────────────────────────────────

  async login(username, password, subsystem) {
    const r = await this._request('POST', '/api/v1/auth/login', { username, password, subsystem });
    this._setSession(r.accessToken, r.user);
    return r;
  }

  async logout() {
    if (this.token) { try { await this._request('POST', '/api/v1/auth/logout'); } catch (_) {} }
    this.disconnect();
    this._setSession(null, null);
  }

  async whoami() { return this._request('GET', '/api/v1/auth/me'); }

  // ─── Identity ────────────────────────────────────────────────

  async verifyNhia(membershipNumber) {
    return this._request('POST', '/api/v1/identity/nhia/verify', { membershipNumber });
  }
  async verifyGhanaCard(pin) {
    return this._request('POST', '/api/v1/identity/ghana-card/verify', { pin });
  }
  async resolvePatient(payload) {
    return this._request('POST', '/api/v1/identity/patients/resolve', payload);
  }
  async listFacilities(filter = {}) {
    const params = new URLSearchParams(filter).toString();
    return this._request('GET', `/api/v1/identity/facilities${params ? '?' + params : ''}`);
  }

  // ─── Clinical ────────────────────────────────────────────────

  async assessVitals(vitals, ageYears, category, clientAssessment) {
    return this._request('POST', '/api/v1/clinical/assess', { vitals, ageYears, category, clientAssessment });
  }
  async getEngineVersion() { return this._request('GET', '/api/v1/clinical/engine-version'); }

  // ─── Referrals ───────────────────────────────────────────────

  async createReferral(payload) { return this._request('POST', '/api/v1/referrals', payload); }
  async listReferrals(filter = {}) {
    const params = new URLSearchParams(filter).toString();
    return this._request('GET', `/api/v1/referrals${params ? '?' + params : ''}`);
  }
  async getReferral(id) { return this._request('GET', `/api/v1/referrals/${id}`); }
  async routeReferral(id, body) { return this._request('POST', `/api/v1/referrals/${id}/route`, body); }
  async acceptReferral(id, body = {}) { return this._request('POST', `/api/v1/referrals/${id}/accept`, body); }
  async declineReferral(id, body = {}) { return this._request('POST', `/api/v1/referrals/${id}/decline`, body); }

  // ─── Bed search ──────────────────────────────────────────────

  async bedSearch(criteria) { return this._request('POST', '/api/v1/bedsearch', criteria); }

  // ─── Dispatch ────────────────────────────────────────────────

  async createDispatch(payload) { return this._request('POST', '/api/v1/dispatches', payload); }
  async listDispatches(filter = {}) {
    const params = new URLSearchParams(filter).toString();
    return this._request('GET', `/api/v1/dispatches${params ? '?' + params : ''}`);
  }
  async assignVehicle(id, body) { return this._request('POST', `/api/v1/dispatches/${id}/assign`, body); }
  async transitionDispatch(id, body) { return this._request('POST', `/api/v1/dispatches/${id}/transition`, body); }
  async sendGps(id, lat, lon) { return this._request('POST', `/api/v1/dispatches/${id}/gps`, { lat, lon }); }
  async listVehicles(filter = {}) {
    const params = new URLSearchParams(filter).toString();
    return this._request('GET', `/api/v1/vehicles${params ? '?' + params : ''}`);
  }

  // ─── Brokerage ───────────────────────────────────────────────

  async requestBrokerage(body) { return this._request('POST', '/api/v1/brokerage', body); }
  async listBrokerage(filter = {}) {
    const params = new URLSearchParams(filter).toString();
    return this._request('GET', `/api/v1/brokerage${params ? '?' + params : ''}`);
  }
  async approveBrokerage(id) { return this._request('POST', `/api/v1/brokerage/${id}/approve`); }
  async rejectBrokerage(id, reason) { return this._request('POST', `/api/v1/brokerage/${id}/reject`, { reason }); }

  // ─── Capacity ────────────────────────────────────────────────

  async getCapacity(facilityCode) {
    return facilityCode
      ? this._request('GET', `/api/v1/capacity/${facilityCode}`)
      : this._request('GET', '/api/v1/capacity');
  }
  async updateCapacity(facilityCode, patch) {
    return this._request('PUT', `/api/v1/capacity/${facilityCode}`, patch);
  }

  // ─── Escalations ─────────────────────────────────────────────

  async raiseEscalation(body) { return this._request('POST', '/api/v1/escalations', body); }
  async resolveEscalation(id, body) { return this._request('POST', `/api/v1/escalations/${id}/resolve`, body); }
  async listEscalations(filter = {}) {
    const params = new URLSearchParams(filter).toString();
    return this._request('GET', `/api/v1/escalations${params ? '?' + params : ''}`);
  }

  // ─── Observations ────────────────────────────────────────────

  async recordObservation(body) { return this._request('POST', '/api/v1/observations', body); }
  async getObservations(patientId) { return this._request('GET', `/api/v1/observations/patient/${patientId}`); }

  // ─── Audit (auditor / admin only) ────────────────────────────

  async queryAudit(filter = {}) {
    const params = new URLSearchParams(filter).toString();
    return this._request('GET', `/api/v1/admin/audit${params ? '?' + params : ''}`);
  }
  async verifyAuditChain() { return this._request('GET', '/api/v1/admin/audit/verify'); }
  async auditStats() { return this._request('GET', '/api/v1/admin/audit/stats'); }

  // ─── WebSocket ───────────────────────────────────────────────

  connectEvents() {
    if (!this.token || this.ws) return;
    const wsBase = (this.baseUrl || window.location.origin).replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/ws/v1/events?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(wsUrl);
    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      const topics = Array.from(this.subs.keys());
      if (topics.length) this.ws.send(JSON.stringify({ type: 'subscribe', topics }));
    };
    this.ws.onmessage = (msg) => {
      try {
        const m = JSON.parse(msg.data);
        if (m.type === 'event' && m.topic) {
          for (const [topic, handlers] of this.subs.entries()) {
            const exact = topic === m.topic;
            const wildcard = topic.endsWith('.*') && m.topic.startsWith(topic.slice(0, -2) + '.');
            if (exact || wildcard) {
              for (const h of handlers) try { h(m); } catch (_) {}
            }
          }
        }
      } catch (_) {}
    };
    this.ws.onclose = () => {
      this.ws = null;
      if (this.token) {
        const delay = Math.min(30000, 500 * Math.pow(2, this.reconnectAttempt++));
        setTimeout(() => this.connectEvents(), delay);
      }
    };
  }

  disconnect() {
    if (this.ws) { try { this.ws.close(); } catch (_) {} this.ws = null; }
  }

  subscribe(topics, handler) {
    if (!Array.isArray(topics)) topics = [topics];
    for (const t of topics) {
      if (!this.subs.has(t)) this.subs.set(t, new Set());
      this.subs.get(t).add(handler);
    }
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ type: 'subscribe', topics }));
    }
    return () => this.unsubscribe(topics, handler);
  }

  unsubscribe(topics, handler) {
    if (!Array.isArray(topics)) topics = [topics];
    for (const t of topics) {
      const set = this.subs.get(t);
      if (set) { handler ? set.delete(handler) : set.clear(); if (!set.size) this.subs.delete(t); }
    }
  }
}

// Singleton — every subsystem shares the same authenticated client
export const ncris = new NcrisClient();
