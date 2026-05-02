/**
 * NCRIS · Event Bus
 * ────────────────────────────────────────────────────────────────────
 * Real-time event distribution to subscribed clients via WebSocket.
 *
 * Topics are namespaced by domain:
 *   • referral.{facilityCode}        — referral events for a facility
 *   • dispatch.{regionCode}          — dispatch events for a region
 *   • dispatch.{vehicleId}           — events for a specific vehicle
 *   • necc.national                  — national overview events
 *   • capacity.{facilityCode}        — capacity changes
 *   • escalation.national            — open escalations
 *   • brokerage.hq                   — brokerage requests for HQ
 *   • partner.{partnerId}            — events scoped to a partner
 *
 * Wildcards supported:
 *   referral.*                       — all referral events
 *   dispatch.*                       — all dispatch events
 *
 * Production Phase 2 considerations:
 *   • Replace in-process bus with Redis pub/sub or NATS for horizontal
 *     scaling (multiple NCRIS instances behind a load balancer).
 *   • Add per-client backpressure handling and slow-consumer eviction.
 *   • TLS-only WebSocket (wss://) with certificate pinning at the
 *     subsystem clients.
 *
 * The reference implements RFC 6455 WebSocket frame parsing/encoding
 * directly using Node's built-in `crypto` and `net` — no `ws` package.
 */

import { createHash } from 'crypto';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ────────────────────────────────────────────────────────────────
// WebSocket frame protocol (RFC 6455)
// ────────────────────────────────────────────────────────────────

function encodeFrame(payload, opcode = 0x1) {
  const data = Buffer.from(payload, 'utf-8');
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, data]);
}

function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const fin     = (buf[0] & 0x80) !== 0;
  const opcode  =  buf[0] & 0x0f;
  const masked  = (buf[1] & 0x80) !== 0;
  let len       =  buf[1] & 0x7f;
  let offset    = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }
  let mask;
  if (masked) {
    if (buf.length < offset + 4) return null;
    mask = buf.slice(offset, offset + 4);
    offset += 4;
  }
  if (buf.length < offset + len) return null;
  let payload = buf.slice(offset, offset + len);
  if (masked) {
    const unmasked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) unmasked[i] = payload[i] ^ mask[i % 4];
    payload = unmasked;
  }
  return { fin, opcode, payload, frameLength: offset + len };
}

// ────────────────────────────────────────────────────────────────
// EventBus
// ────────────────────────────────────────────────────────────────

export class EventBus {
  constructor({ logger, audit } = {}) {
    this.logger = logger || console;
    this.audit = audit;
    this.clients = new Map();           // clientId -> { socket, subscriptions, user }
  }

  /**
   * Handle an incoming WebSocket upgrade request.
   * Called from the HTTP server upgrade handler.
   */
  handleUpgrade(req, socket, head, { authenticate }) {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    // Authenticate via query token (?token=...) since browsers can't
    // set Authorization headers on WebSocket upgrades.
    let user;
    try {
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      user = authenticate(token);
    } catch (err) {
      socket.write(`HTTP/1.1 401 Unauthorized\r\nContent-Length: ${err.message.length}\r\n\r\n${err.message}`);
      socket.destroy();
      return;
    }

    const acceptKey = createHash('sha1').update(key + WS_GUID).digest('base64');
    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n',
    ];
    socket.write(responseHeaders.join('\r\n'));

    const clientId = createHash('sha256').update(key + Date.now()).digest('hex').slice(0, 16);
    const client = { id: clientId, socket, subscriptions: new Set(), user, buffer: Buffer.alloc(0) };
    this.clients.set(clientId, client);

    // Welcome message
    this.sendTo(clientId, { type: 'welcome', clientId, user: { sub: user.sub, role: user.role, facility: user.facility } });

    socket.on('data', (chunk) => this._handleData(client, chunk));
    socket.on('close', () => this._handleClose(client));
    socket.on('error', (err) => {
      this.logger.warn({ event: 'ws.error', clientId, error: err.message });
      this._handleClose(client);
    });

    if (this.audit) {
      this.audit.append({
        type: 'auth.ws.connected',
        action: 'E',
        actor: user.sub,
        actorRole: user.role,
        facility: user.facility,
        outcome: 'success',
        detail: { clientId },
      });
    }
  }

  _handleData(client, chunk) {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    while (true) {
      const frame = decodeFrame(client.buffer);
      if (!frame) break;
      client.buffer = client.buffer.slice(frame.frameLength);

      if (frame.opcode === 0x8) {                  // close
        this._handleClose(client);
        return;
      }
      if (frame.opcode === 0x9) {                  // ping
        client.socket.write(encodeFrame(frame.payload, 0xA));
        continue;
      }
      if (frame.opcode === 0x1) {                  // text
        try {
          const msg = JSON.parse(frame.payload.toString('utf-8'));
          this._handleMessage(client, msg);
        } catch (err) {
          this.sendTo(client.id, { type: 'error', error: 'Invalid JSON' });
        }
      }
    }
  }

  _handleMessage(client, msg) {
    if (msg.type === 'subscribe' && Array.isArray(msg.topics)) {
      for (const topic of msg.topics) {
        if (this._authorizeSubscription(client, topic)) {
          client.subscriptions.add(topic);
        }
      }
      this.sendTo(client.id, { type: 'subscribed', topics: Array.from(client.subscriptions) });
    } else if (msg.type === 'unsubscribe' && Array.isArray(msg.topics)) {
      for (const topic of msg.topics) client.subscriptions.delete(topic);
      this.sendTo(client.id, { type: 'unsubscribed', topics: msg.topics });
    } else if (msg.type === 'ping') {
      this.sendTo(client.id, { type: 'pong', t: Date.now() });
    }
  }

  /**
   * Topic subscription authorisation.
   * - Subsystems can subscribe to the topics matching their role.
   * - Facility-scoped users can only subscribe to their own facility topic.
   * - HQ users (NECC operators, NAS HQ) can subscribe to national topics.
   */
  _authorizeSubscription(client, topic) {
    const u = client.user;
    if (!u) return false;
    // Public topics
    if (topic.startsWith('public.')) return true;
    // Facility-scoped — must match user's facility or be HQ
    if (topic.startsWith('referral.') || topic.startsWith('capacity.')) {
      const target = topic.split('.')[1];
      if (u.role === 'necc_operator' || u.role === 'nas_hq' || u.role === 'auditor') return true;
      return target === u.facility || target === '*';
    }
    // Region-scoped dispatch
    if (topic.startsWith('dispatch.')) {
      const target = topic.split('.')[1];
      if (u.role === 'necc_operator' || u.role === 'nas_hq' || u.role === 'auditor') return true;
      if (u.role === 'arcs_dispatcher' && (u.region === target || target === '*')) return true;
      if (u.role === 'emt' && u.vehicleId === target) return true;
      return false;
    }
    // National topics
    if (topic === 'necc.national' || topic === 'escalation.national' || topic === 'brokerage.hq') {
      return ['necc_operator', 'nas_hq', 'auditor'].includes(u.role);
    }
    return false;
  }

  _handleClose(client) {
    if (!this.clients.has(client.id)) return;
    this.clients.delete(client.id);
    try { client.socket.destroy(); } catch (_) { /* already closed */ }
    if (this.audit) {
      this.audit.append({
        type: 'auth.ws.disconnected',
        action: 'E',
        actor: client.user?.sub || 'unknown',
        actorRole: client.user?.role || null,
        facility: client.user?.facility || null,
        outcome: 'success',
        detail: { clientId: client.id, subscriptionsAtClose: Array.from(client.subscriptions) },
      });
    }
  }

  sendTo(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return false;
    try {
      client.socket.write(encodeFrame(JSON.stringify(message)));
      return true;
    } catch (err) {
      this.logger.warn({ event: 'ws.send.failed', clientId, error: err.message });
      return false;
    }
  }

  /**
   * Publish to a topic. All clients with matching subscriptions receive it.
   * Wildcards: clients subscribed to "dispatch.*" receive "dispatch.GA",
   * "dispatch.VR", etc.
   */
  publish(topic, payload) {
    const message = { type: 'event', topic, timestamp: new Date().toISOString(), payload };
    let recipients = 0;
    for (const client of this.clients.values()) {
      let match = false;
      for (const sub of client.subscriptions) {
        if (sub === topic) { match = true; break; }
        if (sub.endsWith('.*')) {
          const prefix = sub.slice(0, -2);
          if (topic.startsWith(prefix + '.')) { match = true; break; }
        }
      }
      if (match) {
        if (this.sendTo(client.id, message)) recipients++;
      }
    }
    return recipients;
  }

  stats() {
    const clientList = Array.from(this.clients.values()).map(c => ({
      id: c.id,
      role: c.user?.role,
      facility: c.user?.facility,
      subscriptions: Array.from(c.subscriptions),
    }));
    return {
      connectedClients: this.clients.size,
      clients: clientList,
    };
  }
}
