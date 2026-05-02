/**
 * NCRIS · End-to-End Integration Tests
 * ────────────────────────────────────────────────────────────────────
 * Boots the NCRIS server in-process and exercises the full HTTP API
 * over real TCP. Verifies:
 *
 *   1. Service banner & health
 *   2. Login flow (8 default users)
 *   3. Engine version endpoint matches authoritative engine
 *   4. Engine assessment regression (8 case suite)
 *   5. NHIA verification (mocked)
 *   6. Ghana Card verification (format check)
 *   7. Patient MPI resolution
 *   8. End-to-end referral lifecycle:
 *        Tablet creates → Portal accepts (via NECC routing) →
 *        ARCS dispatches → EMT lifecycle → handoff
 *   9. Bed-search ranking
 *  10. Brokerage HQ approval workflow
 *  11. Capacity board updates
 *  12. Partner API key auth + scope enforcement
 *  13. FHIR R4 conformance — Patient, ServiceRequest, Bundle
 *  14. Audit log — chain verification + filtered queries
 *  15. WebSocket subscription receives published events
 *
 * Run: node test/run.js
 *
 * Exit code 0 = all green. Non-zero = at least one failure.
 */

import http from 'http';
import { spawn } from 'child_process';
import { rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, '.test-data');

const BASE = 'http://127.0.0.1:4099';
const PORT = 4099;

// ─── Test harness ───────────────────────────────────────────────

let passes = 0;
let failures = 0;
const failureDetails = [];

function bold(s) { return `\x1b[1m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function red(s) { return `\x1b[31m${s}\x1b[0m`; }
function dim(s) { return `\x1b[2m${s}\x1b[0m`; }

function assert(cond, message) {
  if (cond) {
    passes++;
    console.log(`  ${green('✓')} ${dim(message)}`);
  } else {
    failures++;
    const detail = new Error(message).stack.split('\n').slice(1, 3).join('\n');
    failureDetails.push({ message, detail });
    console.log(`  ${red('✗')} ${red(message)}`);
  }
}

function section(name) {
  console.log(`\n${bold(name)}`);
}

// ─── HTTP helper (zero-dep) ─────────────────────────────────────

function request(method, path, { body, token, apiKey, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };
    if (token)  opts.headers['Authorization'] = `Bearer ${token}`;
    if (apiKey) opts.headers['X-API-Key'] = apiKey;
    if (body) {
      const data = JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (_) { /* non-json ok */ }
        resolve({ status: res.statusCode, body: json, raw, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Server lifecycle ───────────────────────────────────────────

let serverProc = null;

function startServer() {
  return new Promise((resolve, reject) => {
    rmSync(DATA_DIR, { recursive: true, force: true });
    serverProc = spawn('node', ['src/index.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        NCRIS_DATA_DIR: DATA_DIR,
        NCRIS_JWT_SECRET: 'test-secret-for-integration-tests-only',
        NCRIS_LOG_LEVEL: 'warn',           // quiet startup; tests print their own logs
        NCRIS_ENV: 'test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let booted = false;
    const onLine = (chunk) => {
      const text = chunk.toString();
      if (text.includes('NCRIS listening') || text.includes('"msg":"NCRIS listening"')) {
        booted = true;
        resolve();
      }
    };
    serverProc.stdout.on('data', onLine);
    serverProc.stderr.on('data', onLine);
    serverProc.on('error', reject);
    serverProc.on('exit', (code) => {
      if (!booted) reject(new Error(`server exited before boot (code ${code})`));
    });

    // Fallback: poll /healthz
    const startTime = Date.now();
    const poll = async () => {
      if (booted) return;
      if (Date.now() - startTime > 8000) {
        return reject(new Error('server boot timeout'));
      }
      try {
        const r = await request('GET', '/healthz');
        if (r.status === 200) { booted = true; resolve(); return; }
      } catch (_) { /* not yet */ }
      setTimeout(poll, 100);
    };
    setTimeout(poll, 200);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProc) return resolve();
    serverProc.on('exit', () => resolve());
    serverProc.kill('SIGTERM');
    setTimeout(() => {
      try { serverProc.kill('SIGKILL'); } catch (_) {}
      resolve();
    }, 3000);
  });
}

// ─── Tests ──────────────────────────────────────────────────────

async function login(username, password) {
  const r = await request('POST', '/api/v1/auth/login', { body: { username, password } });
  if (r.status !== 200) throw new Error(`Login failed for ${username}: ${r.status} ${r.raw}`);
  return r.body.accessToken;
}

async function runTests() {
  // ── 1. Banner & health
  section('1. Service banner & health');
  {
    const r = await request('GET', '/');
    assert(r.status === 200, 'GET / returns 200');
    assert(r.body.service === 'NCRIS', 'banner reports service: NCRIS');
    assert(r.body.engineVersion, 'banner reports engineVersion');
  }
  {
    const r = await request('GET', '/healthz');
    assert(r.status === 200 && r.body.status === 'ok', '/healthz reports ok');
  }

  // ── 2. Login flow
  section('2. Authentication');
  let tabletToken, portalToken, neccToken, arcsToken, hqToken, emtToken, auditorToken, adminToken;
  {
    tabletToken  = await login('kbth.tablet',        'tablet-demo-2026');
    portalToken  = await login('kbth.portal',        'portal-demo-2026');
    neccToken    = await login('necc.operator',      'necc-demo-2026');
    arcsToken    = await login('arcs.ga.dispatcher', 'arcs-demo-2026');
    hqToken      = await login('nas.hq',             'nashq-demo-2026');
    emtToken     = await login('emt.gr002',          'emt-demo-2026');
    auditorToken = await login('auditor.general',    'audit-demo-2026');
    adminToken   = await login('admin',              'ncris-admin-2026');
    assert(tabletToken && portalToken && neccToken && arcsToken && hqToken && emtToken && auditorToken && adminToken, 'all 8 default users can log in');
  }
  {
    const bad = await request('POST', '/api/v1/auth/login', { body: { username: 'kbth.tablet', password: 'wrong-password' } });
    assert(bad.status === 401, 'bad password returns 401');
  }
  {
    const me = await request('GET', '/api/v1/auth/me', { token: tabletToken });
    assert(me.status === 200 && me.body.user.role === 'doctor', '/auth/me returns user claims');
  }
  {
    const noToken = await request('GET', '/api/v1/auth/me');
    assert(noToken.status === 401, 'protected route rejects missing token');
  }

  // ── 3. Engine version
  section('3. Clinical engine');
  {
    const r = await request('GET', '/api/v1/clinical/engine-version');
    assert(r.status === 200 && r.body.engineVersion, 'engine-version endpoint exposes ENGINE_VERSION');
  }

  // ── 4. Engine regression — 8-case suite (parity with subsystems)
  {
    const cases = [
      // [name, vitals, age, category, expectedPriority]
      ['adult normal',            { sbp: 120, dbp: 80, hr: 76, rr: 16, spo2: 98, gcs: 15 }, 30, 'Adult',      'routine'],
      ['adult borderline',        { sbp: 142, dbp: 88, hr: 102, rr: 21, spo2: 95, gcs: 15 }, 45, 'Adult',     'routine'],
      ['adult abnormal',          { sbp: 165, dbp: 95, hr: 118, rr: 24, spo2: 92, gcs: 14 }, 50, 'Adult',     'high'],
      ['adult critical (STEMI)',  { sbp: 222, dbp: 174, hr: 135, rr: 36, spo2: 89, gcs: 14 }, 59, 'Adult',    'critical'],
      ['paeds severe pneumonia',  { sbp: 78, dbp: 50, hr: 165, rr: 58, spo2: 88, gcs: 13 }, 4, 'Paediatric', 'critical'],
      ['neonate critical',        { sbp: 45, dbp: 28, hr: 88, rr: 22, spo2: 86, gcs: 13 }, 0, 'Neonate',     'critical'],
      ['eclampsia',               { sbp: 169, dbp: 112, hr: 110, rr: 22, spo2: 95, gcs: 13 }, 29, 'Adult',    'high'],
      ['septic shock',            { sbp: 78, dbp: 48, hr: 138, rr: 32, spo2: 90, gcs: 11 }, 67, 'Adult',     'critical'],
    ];
    for (const [name, vitals, age, category, expected] of cases) {
      const r = await request('POST', '/api/v1/clinical/assess', {
        token: tabletToken,
        body: { vitals, ageYears: age, category },
      });
      const got = r.body.serverAssessment.recommendedPriority;
      assert(got === expected, `engine: ${name} → ${expected} (got ${got})`);
    }
  }

  // ── 5. NHIA verification
  section('4. Identity services');
  {
    const r = await request('POST', '/api/v1/identity/nhia/verify', {
      token: tabletToken,
      body: { membershipNumber: '7821-4523-9018' },
    });
    assert(r.status === 200 && r.body.found && r.body.member.name === 'Kofi Asante', 'NHIA verify finds Kofi Asante');
  }
  {
    const r = await request('POST', '/api/v1/identity/nhia/verify', {
      token: tabletToken,
      body: { membershipNumber: '0000-0000-0000' },
    });
    assert(r.status === 200 && !r.body.found, 'NHIA verify returns not-found for unknown number');
  }

  // ── 6. Ghana Card format
  {
    const ok = await request('POST', '/api/v1/identity/ghana-card/verify', {
      token: tabletToken,
      body: { pin: 'GHA-123456789-0' },
    });
    assert(ok.body.valid === true && ok.body.pinHash, 'Ghana Card valid format → pinHash');
    const bad = await request('POST', '/api/v1/identity/ghana-card/verify', {
      token: tabletToken,
      body: { pin: 'INVALID-FORMAT' },
    });
    assert(bad.body.valid === false, 'Ghana Card invalid format rejected');
  }

  // ── 7. Facility registry
  {
    const r = await request('GET', '/api/v1/identity/facilities?specialty=cardiology', { token: tabletToken });
    assert(r.body.count >= 1 && r.body.facilities.some(f => f.code === 'KBTH-001'), 'facility search by specialty includes KBTH');
  }

  // ── 8. End-to-end referral lifecycle
  section('5. End-to-end referral lifecycle');
  let referralId, dispatchId;

  // Tablet creates referral
  {
    const r = await request('POST', '/api/v1/referrals', {
      token: tabletToken,
      body: {
        fromFacilityCode: 'KBTH-001',
        condition: 'Acute coronary syndrome',
        reasonCode: 'I21.9',
        priority: 'critical',
        stability: 'unstable',
        summary: 'STEMI confirmed on ECG, urgent PCI needed',
        patient: {
          nhiaMembershipNumber: '7821-4523-9018',
          name: { first: 'Kofi', last: 'Asante' },
          dob: '1967-04-12', sex: 'M', ageYears: 59, category: 'Adult',
        },
        vitals: { sbp: 222, dbp: 174, hr: 135, rr: 36, spo2: 89, gcs: 14 },
      },
    });
    assert(r.status === 201, 'tablet POST /referrals returns 201');
    assert(r.body.referral.state === 'submitted', 'referral state is submitted');
    assert(r.body.referral.engineAssessment.recommendedPriority === 'critical', 'server engine assessed critical');
    assert(r.body.mpiAction === 'matched-nhia' || r.body.mpiAction === 'created', `MPI resolved (action: ${r.body.mpiAction})`);
    referralId = r.body.referral.id;
  }

  // NECC routes referral
  {
    const r = await request('POST', `/api/v1/referrals/${referralId}/route`, {
      token: neccToken,
      body: { targetFacilityCode: 'MIL-001', targetUnit: 'Cath Lab Bay 2' },
    });
    assert(r.status === 200 && r.body.state === 'routed', 'NECC routes referral → routed');
    assert(r.body.targetFacilityCode === 'MIL-001', 'target facility set to 37 Military');
  }

  // Receiving Portal accepts
  {
    const milPortalToken = await login('kbth.portal', 'portal-demo-2026'); // any portal can accept routed referrals in this reference
    const r = await request('POST', `/api/v1/referrals/${referralId}/accept`, {
      token: milPortalToken,
      body: { acceptedNote: 'Cath team alerted; bay ready' },
    });
    assert(r.status === 200 && r.body.state === 'accepted', 'Portal accepts → accepted');
  }

  // ARCS dispatch request
  {
    const r = await request('POST', '/api/v1/dispatches', {
      token: neccToken,
      body: {
        referralId,
        condition: 'Acute coronary syndrome',
        priority: 'critical',
        fromFacilityCode: 'KBTH-001',
        toFacilityCode: 'MIL-001',
        fromRegion: 'GA',
        toRegion: 'GA',
        patientInitials: 'KA',
        patientAge: 59,
        patientSex: 'M',
      },
    });
    assert(r.status === 201, 'NECC creates dispatch → 201');
    assert(r.body.state === 'requested', 'dispatch state is requested');
    dispatchId = r.body.id;
  }

  // ARCS dispatcher assigns vehicle
  {
    const r = await request('POST', `/api/v1/dispatches/${dispatchId}/assign`, {
      token: arcsToken,
      body: { vehicleCode: 'AMB-GR-002', etaMin: 12 },
    });
    assert(r.status === 200 && r.body.state === 'assigned', 'ARCS assigns vehicle → assigned');
    assert(r.body.vehicleCode === 'AMB-GR-002', 'vehicle code set');
  }

  // EMT walks the lifecycle
  {
    const states = ['en_route_pickup', 'on_scene', 'en_route_dest', 'arrived', 'cleared'];
    for (const toState of states) {
      const r = await request('POST', `/api/v1/dispatches/${dispatchId}/transition`, {
        token: emtToken,
        body: { toState, gpsLat: 5.55 + Math.random() * 0.05, gpsLon: -0.20 + Math.random() * 0.05 },
      });
      assert(r.status === 200 && r.body.state === toState, `EMT transition → ${toState}`);
    }
  }

  // Verify vehicle freed after cleared
  {
    const r = await request('GET', '/api/v1/vehicles?region=GA', { token: arcsToken });
    const v = r.body.vehicles.find(x => x.code === 'AMB-GR-002');
    assert(v && v.status === 'available', 'vehicle returned to available after cleared');
  }

  // EMT records vitals during transit
  {
    const r = await request('POST', '/api/v1/observations', {
      token: emtToken,
      body: {
        patientId: 'patient-test',
        patientAge: 59,
        patientCategory: 'Adult',
        vitals: { sbp: 198, dbp: 142, hr: 128, rr: 28, spo2: 91, gcs: 14 },
        source: 'emt-device',
        vehicleCode: 'AMB-GR-002',
        targetFacilityCode: 'MIL-001',
        dispatchId,
      },
    });
    assert(r.status === 201 && r.body.engineAssessment.recommendedPriority === 'critical', 'EMT vitals re-assessed critical server-side');
  }

  // ── 9. Bed-search ranking
  section('6. Bed-search ranking');
  {
    const r = await request('POST', '/api/v1/bedsearch', {
      token: neccToken,
      body: {
        specialty: 'cardiology',
        requireIcu: true,
        priority: 'critical',
        originRegion: 'GA',
        originLat: 5.6739, originLon: -0.0132,             // Tema
      },
    });
    assert(r.status === 200, 'bed-search returns 200');
    assert(r.body.candidates.length >= 1, 'at least one candidate returned');
    assert(r.body.candidates[0].score === Math.max(...r.body.candidates.map(c => c.score)), 'top candidate has highest score');
  }

  // ── 10. Brokerage HQ workflow
  section('7. Brokerage HQ approval');
  let brokerId;
  {
    const r = await request('POST', '/api/v1/brokerage', {
      token: arcsToken,
      body: {
        requestingRegion: 'GA',
        targetRegion: 'ER',
        condition: 'STEMI overflow',
        fromFacility: 'KBTH-001',
        toFacility: 'KOR-RH',
        reason: 'GA tertiary cath labs all booked',
      },
    });
    assert(r.status === 201 && r.body.status === 'pending_hq', 'brokerage requested → pending_hq');
    brokerId = r.body.id;
  }
  {
    const denied = await request('POST', `/api/v1/brokerage/${brokerId}/approve`, { token: arcsToken });
    assert(denied.status === 403, 'non-HQ user cannot approve brokerage');
  }
  {
    const r = await request('POST', `/api/v1/brokerage/${brokerId}/approve`, { token: hqToken });
    assert(r.status === 200 && r.body.status === 'approved', 'HQ approves brokerage');
  }

  // ── 11. Capacity update
  section('8. Capacity board');
  {
    const r = await request('PUT', '/api/v1/capacity/KBTH-001', {
      token: portalToken,
      body: { bedsAvailable: 0, status: 'full' },
    });
    assert(r.status === 200 && r.body.bedsAvailable === 0 && r.body.status === 'full', 'KBTH capacity → full');
  }

  // ── 12. Partner API key flow
  section('9. Partner API gateway');
  let partnerKey;
  {
    const r = await request('POST', '/api/v1/admin/partners', {
      token: adminToken,
      body: { name: 'NHIS Claims', contactEmail: 'integrations@nhis.gov.gh', scopes: ['referral:read:aggregate'] },
    });
    assert(r.status === 201 && r.body.apiKey, 'admin issues partner API key');
    partnerKey = r.body.apiKey;
  }
  {
    const ok = await request('GET', '/api/v1/partner/health', { apiKey: partnerKey });
    assert(ok.status === 200, 'partner health with valid key → 200');
  }
  {
    const noKey = await request('GET', '/api/v1/partner/health');
    assert(noKey.status === 401, 'partner endpoint rejects missing key');
  }
  {
    const allowed = await request('GET', '/api/v1/partner/referrals/aggregate', { apiKey: partnerKey });
    assert(allowed.status === 200 && typeof allowed.body.total === 'number', 'partner with correct scope → 200 aggregate');
    const denied = await request('GET', '/api/v1/partner/dispatches/aggregate', { apiKey: partnerKey });
    assert(denied.status === 403, 'partner without correct scope → 403');
  }

  // ── 13. FHIR conformance
  section('10. FHIR R4 conformance');
  {
    const r = await request('GET', '/fhir/r4/metadata');
    assert(r.status === 200 && r.body.resourceType === 'CapabilityStatement', 'FHIR /metadata returns CapabilityStatement');
    assert(r.body.fhirVersion === '4.0.1', 'FHIR version 4.0.1');
  }
  {
    const r = await request('GET', '/fhir/r4/Organization', { token: portalToken });
    assert(r.status === 200 && r.body.resourceType === 'Bundle' && r.body.entry.length >= 5, 'FHIR Organization Bundle returned');
  }
  {
    const r = await request('GET', `/fhir/r4/ServiceRequest/${referralId}`, { token: portalToken });
    assert(r.status === 200 && r.body.resourceType === 'ServiceRequest', 'FHIR ServiceRequest by id');
    assert(r.body.priority === 'stat', 'FHIR priority mapped: critical → stat');
  }

  // ── 14. Audit log
  section('11. Audit log');
  {
    const r = await request('GET', '/api/v1/admin/audit/verify', { token: auditorToken });
    assert(r.status === 200 && r.body.valid === true, `audit chain valid (${r.body.count} events)`);
  }
  {
    const r = await request('GET', '/api/v1/admin/audit?type=referral.created', { token: auditorToken });
    assert(r.status === 200 && r.body.count >= 1, 'audit query by type returns events');
  }
  {
    const r = await request('GET', '/api/v1/admin/audit/stats', { token: auditorToken });
    assert(r.status === 200 && r.body.total > 0, 'audit stats reports total');
  }
  {
    // Check non-elevated user can't read audit
    const r = await request('GET', '/api/v1/admin/audit', { token: tabletToken });
    assert(r.status === 403, 'tablet user cannot read audit log');
  }

  // ── 15. WebSocket events
  section('12. WebSocket event bus');
  {
    const wsResult = await testWebSocket(neccToken);
    assert(wsResult.connected, 'WebSocket connection established with token');
    assert(wsResult.subscribed, 'subscription confirmation received');
    assert(wsResult.eventReceived, 'published event received by subscriber');
  }

  // ── 16. Subsystem registration
  section('13. Subsystem extensibility');
  {
    const r = await request('POST', '/api/v1/admin/subsystems', {
      token: adminToken,
      body: {
        name: 'Future MoH Inspector App',
        kind: 'inspector',
        allowedScopes: ['inspection:create', 'audit:read'],
        contactEmail: 'inspector@moh.gov.gh',
      },
    });
    assert(r.status === 201 && r.body.id, 'admin can register a NEW subsystem (extensibility proven)');
  }
  {
    const r = await request('GET', '/api/v1/admin/subsystems', { token: adminToken });
    assert(r.status === 200 && r.body.subsystems.length >= 1, 'subsystem registry lists registered subsystems');
  }

  // ── 17. Metrics
  section('14. Operational telemetry');
  {
    const r = await request('GET', '/metrics');
    assert(r.status === 200, '/metrics returns 200');
    assert(r.raw.includes('ncris_audit_events_total'), '/metrics includes audit counter');
    assert(r.raw.includes('ncris_referrals_total'), '/metrics includes referral counter');
  }
}

// ─── WebSocket test ─────────────────────────────────────────────

function testWebSocket(token) {
  return new Promise((resolve) => {
    import('crypto').then(({ randomBytes, createHash }) => {
      const net = require('net');
      const result = { connected: false, subscribed: false, eventReceived: false };
      const key = randomBytes(16).toString('base64');
      const socket = net.connect(PORT, '127.0.0.1', () => {
        socket.write([
          `GET /ws/v1/events?token=${token} HTTP/1.1`,
          `Host: 127.0.0.1:${PORT}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          '\r\n',
        ].join('\r\n'));
      });

      let buffer = Buffer.alloc(0);
      let upgraded = false;

      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (!upgraded) {
          const headerEnd = buffer.indexOf('\r\n\r\n');
          if (headerEnd === -1) return;
          const head = buffer.slice(0, headerEnd).toString();
          if (head.includes('101 Switching Protocols')) {
            upgraded = true;
            result.connected = true;
            buffer = buffer.slice(headerEnd + 4);
            // Subscribe to escalation.national — that's where the test event publishes
            const subMsg = JSON.stringify({ type: 'subscribe', topics: ['escalation.national'] });
            socket.write(encodeWsTextFrame(subMsg));
          }
        }
        // Parse frames
        while (buffer.length >= 2) {
          const frame = decodeWsFrame(buffer);
          if (!frame) break;
          buffer = buffer.slice(frame.frameLength);
          if (frame.opcode === 0x1) {
            try {
              const msg = JSON.parse(frame.payload.toString('utf-8'));
              if (msg.type === 'subscribed') {
                result.subscribed = true;
                // Trigger an event by raising an escalation through HTTP
                request('POST', '/api/v1/escalations', {
                  token,
                  body: { facilityCode: 'KBTH-001', kind: 'icu_full', severity: 'high', summary: 'Test from WS test' },
                });
              } else if (msg.type === 'event' && msg.topic === 'escalation.national') {
                result.eventReceived = true;
                socket.end();
              }
            } catch (_) { /* ignore */ }
          }
        }
      });

      socket.on('close', () => resolve(result));
      socket.on('error', () => resolve(result));
      setTimeout(() => { try { socket.destroy(); } catch (_) {} resolve(result); }, 3000);
    });
  });
}

function encodeWsTextFrame(text) {
  const data = Buffer.from(text);
  const len = data.length;
  // Client → server frames must be masked (RFC 6455)
  const mask = Buffer.from([0xa1, 0xb2, 0xc3, 0xd4]);
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i % 4];
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, 0x80 | len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, mask, masked]);
}

function decodeWsFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); offset = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); offset = 10; }
  let mask;
  if (masked) { if (buf.length < offset + 4) return null; mask = buf.slice(offset, offset + 4); offset += 4; }
  if (buf.length < offset + len) return null;
  let payload = buf.slice(offset, offset + len);
  if (masked) {
    const u = Buffer.alloc(len);
    for (let i = 0; i < len; i++) u[i] = payload[i] ^ mask[i % 4];
    payload = u;
  }
  return { opcode, payload, frameLength: offset + len };
}

// ─── Main ───────────────────────────────────────────────────────

(async () => {
  console.log(bold('\nNCRIS · Integration Test Suite\n'));
  try {
    console.log(dim('Booting NCRIS server on port ' + PORT + '...'));
    await startServer();
    console.log(dim('Server up. Running tests.\n'));
    await runTests();
  } catch (err) {
    console.error(red('\nTest harness crashed: ' + err.message));
    console.error(err.stack);
    failures++;
  } finally {
    console.log(dim('\nStopping server...'));
    await stopServer();
  }

  console.log(`\n${bold('Results')}`);
  console.log(`  ${green(passes + ' passed')}`);
  if (failures > 0) {
    console.log(`  ${red(failures + ' failed')}`);
    for (const f of failureDetails) {
      console.log(`    ${red('•')} ${f.message}`);
    }
  }
  console.log(`  ${dim('Total: ' + (passes + failures))}\n`);

  process.exit(failures > 0 ? 1 : 0);
})();

// Use crypto via createRequire fallback for the websocket test
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
