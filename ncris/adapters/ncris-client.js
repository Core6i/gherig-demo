/**
 * NCRIS Client Adapter (shared by all 5 subsystems)
 * ────────────────────────────────────────────────────────────────────
 * Drop-in client that the Tablet, Portal, NECC, ARCS, and EMT
 * subsystems use to talk to NCRIS.
 *
 * Responsibilities:
 *   • Token storage and refresh
 *   • HTTP request helpers with consistent error shape
 *   • WebSocket connection with auto-reconnect and backoff
 *   • Topic subscription management
 *   • Offline draft queue (sync on reconnect) — for Tablet + EMT Device
 *
 * Usage:
 *   import { NcrisClient } from './ncris-client.js';
 *   const client = new NcrisClient({ baseUrl: 'https://ncris.gov.gh' });
 *   await client.login('kbth.tablet', 'password');
 *   const referral = await client.createReferral({ ... });
 *   client.subscribe(['referral.KBTH-001'], (event) => { ... });
 */

export class NcrisClient {
  constructor({ baseUrl, fetch: fetchImpl, WebSocket: WsImpl } = {}) {
    this.baseUrl = baseUrl || 'http://127.0.0.1:4000';
    this.fetch = fetchImpl || globalThis.fetch;
    this.WS = WsImpl || globalThis.WebSocket;
    this.token = null;
    this.user = null;
    this.ws = null;
    this.subs = new Map();              // topic -> Set<handler>
    this.draftQueue = [];               // offline drafts
    this.reconnectAttempt = 0;
  }

  // ─── HTTP ────────────────────────────────────────────────────

  async _request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await this.fetch(this.baseUrl + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch (_) { json = { raw: text }; }
    if (!res.ok) {
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
    this.token = r.accessToken;
    this.user = r.user;
    return r;
  }

  async logout() {
    if (this.token) {
      try { await this._request('POST', '/api/v1/auth/logout'); } catch (_) {}
    }
    this.token = null;
    this.user = null;
    this.disconnect();
  }

  async whoami() {
    return this._request('GET', '/api/v1/auth/me');
  }

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

  async getEngineVersion() {
    return this._request('GET', '/api/v1/clinical/engine-version');
  }

  // ─── Referrals ───────────────────────────────────────────────

  async createReferral(payload) {
    if (!navigator?.onLine && typeof navigator !== 'undefined') {
      this.draftQueue.push({ kind: 'referral', payload, queuedAt: Date.now() });
      return { queued: true };
    }
    return this._request('POST', '/api/v1/referrals', payload);
  }

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

  // ─── Brokerage ───────────────────────────────────────────────

  async requestBrokerage(body) { return this._request('POST', '/api/v1/brokerage', body); }
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

  // ─── WebSocket ───────────────────────────────────────────────

  connectEvents() {
    if (!this.token) throw new Error('login() before connectEvents()');
    if (this.ws) return;
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + `/ws/v1/events?token=${this.token}`;
    this.ws = new this.WS(wsUrl);
    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      // Re-subscribe everything
      const topics = Array.from(this.subs.keys());
      if (topics.length) this.ws.send(JSON.stringify({ type: 'subscribe', topics }));
    };
    this.ws.onmessage = (msg) => {
      try {
        const m = JSON.parse(msg.data);
        if (m.type === 'event' && m.topic) {
          const handlers = this.subs.get(m.topic) || new Set();
          for (const h of handlers) { try { h(m); } catch (e) { console.error('subscriber error', e); } }
          // Wildcard handlers
          for (const [topic, hs] of this.subs.entries()) {
            if (topic.endsWith('.*') && m.topic.startsWith(topic.slice(0, -2) + '.')) {
              for (const h of hs) { try { h(m); } catch (_) {} }
            }
          }
        }
      } catch (_) {}
    };
    this.ws.onclose = () => {
      this.ws = null;
      // Auto-reconnect with backoff
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
  }

  unsubscribe(topics, handler) {
    if (!Array.isArray(topics)) topics = [topics];
    for (const t of topics) {
      const set = this.subs.get(t);
      if (set) {
        if (handler) set.delete(handler); else set.clear();
        if (set.size === 0) this.subs.delete(t);
      }
    }
  }

  // ─── Offline draft sync ──────────────────────────────────────

  async flushDraftQueue() {
    const drained = this.draftQueue.splice(0);
    const results = [];
    for (const d of drained) {
      try {
        if (d.kind === 'referral') {
          results.push({ ok: true, response: await this._request('POST', '/api/v1/referrals', d.payload) });
        } else if (d.kind === 'observation') {
          results.push({ ok: true, response: await this._request('POST', '/api/v1/observations', d.payload) });
        }
      } catch (err) {
        // Re-queue and stop on first failure
        this.draftQueue.unshift(d);
        results.push({ ok: false, error: err.message });
        break;
      }
    }
    return results;
  }
}
