/**
 * NCRIS · Server Entry Point
 * ────────────────────────────────────────────────────────────────────
 * Boots the National Clinical Referral & Intelligence Switch.
 *
 * Composition root: instantiates every service exactly once and
 * passes the same instances into the route registrar. This is the
 * only file that knows about all the moving parts; everything else
 * receives its dependencies through constructor injection.
 *
 * Lifecycle:
 *   1. Load configuration from environment
 *   2. Initialise storage (creates data dir if needed)
 *   3. Seed default users on first boot
 *   4. Construct identity, domain, and infrastructure services
 *   5. Construct the audit log (depends on storage)
 *   6. Construct the event bus (depends on audit + logger)
 *   7. Construct domain services (depend on storage + audit + bus)
 *   8. Register HTTP routes
 *   9. Start HTTP server, attach WebSocket upgrade handler
 *  10. Install signal handlers for graceful shutdown
 *
 * Production deployments swap:
 *   • Storage  → Postgres adapter (same Collection interface)
 *   • EventBus → Redis pub/sub or NATS for horizontal scale
 *   • Logger   → pino with structured output to ELK/Loki
 *   • Auth     → SMART-on-FHIR / OAuth2 with KMS-backed signing key
 */

import http from 'http';
import { URL } from 'url';
import { randomUUID } from 'crypto';

import { getStorage } from './core/storage.js';
import { Router, bodyParser, wrapResponse } from './core/router.js';
import { hashPassword, verifyJwt } from './core/auth.js';

import { AuditLog } from './audit/audit-log.js';
import { EventBus } from './events/event-bus.js';

import {
  FacilityRegistry,
  PersonnelDirectory,
  NhiaService,
  GhanaCardService,
  PatientIndex,
} from './identity/identity-services.js';

import {
  ReferralService,
  BedSearchService,
  DispatchService,
  BrokerageService,
  CapacityService,
  EscalationService,
  ObservationService,
} from './domain/services.js';

import { registerRoutes } from './routes.js';

// ─── Configuration ──────────────────────────────────────────────

const config = {
  port:        parseInt(process.env.PORT || '4000', 10),
  host:        process.env.HOST || '0.0.0.0',
  dataDir:     process.env.NCRIS_DATA_DIR || '/home/claude/ncris/.data',
  jwtSecret:   process.env.NCRIS_JWT_SECRET || 'ncris-dev-secret-CHANGE-IN-PROD-min-32-bytes',
  logLevel:    process.env.NCRIS_LOG_LEVEL || 'info',
  environment: process.env.NCRIS_ENV || 'reference',
};

// ─── Structured Logger (zero-dep) ───────────────────────────────

const LOG_LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
const minLevel = LOG_LEVELS[config.logLevel] || 30;

function log(level, payload) {
  if (LOG_LEVELS[level] < minLevel) return;
  const entry = {
    time: new Date().toISOString(),
    level,
    pid: process.pid,
    ...(typeof payload === 'string' ? { msg: payload } : payload),
  };
  const stream = LOG_LEVELS[level] >= 40 ? process.stderr : process.stdout;
  stream.write(JSON.stringify(entry) + '\n');
}

const logger = {
  trace: (p) => log('trace', p),
  debug: (p) => log('debug', p),
  info:  (p) => log('info',  p),
  warn:  (p) => log('warn',  p),
  error: (p) => log('error', p),
  fatal: (p) => log('fatal', p),
};

// ─── Seed Default Users ─────────────────────────────────────────

function seedDefaultUsers(storage) {
  const users = storage.collection('users');
  if (users.count() > 0) return;

  logger.info('Seeding default users (first boot)');

  const defaults = [
    {
      username: 'admin',
      password: 'ncris-admin-2026',
      role: 'admin',
      facility: null,
      region: 'all',
      scopes: ['admin:*'],
    },
    {
      username: 'kbth.tablet',
      password: 'tablet-demo-2026',
      role: 'doctor',
      facility: 'KBTH-001',
      region: 'GA',
      scopes: ['referral:create', 'observation:create'],
    },
    {
      username: 'kbth.portal',
      password: 'portal-demo-2026',
      role: 'doctor',
      facility: 'KBTH-001',
      region: 'GA',
      scopes: ['referral:read', 'referral:accept', 'referral:decline', 'capacity:update'],
    },
    {
      username: 'necc.operator',
      password: 'necc-demo-2026',
      role: 'necc_operator',
      facility: null,
      region: 'all',
      scopes: ['referral:read', 'bedsearch:run', 'escalation:*', 'capacity:read'],
    },
    {
      username: 'arcs.ga.dispatcher',
      password: 'arcs-demo-2026',
      role: 'arcs_dispatcher',
      facility: null,
      region: 'GA',
      scopes: ['dispatch:read', 'dispatch:assign', 'brokerage:request'],
    },
    {
      username: 'nas.hq',
      password: 'nashq-demo-2026',
      role: 'nas_hq',
      facility: null,
      region: 'all',
      scopes: ['dispatch:read', 'brokerage:approve', 'brokerage:reject'],
    },
    {
      username: 'emt.gr002',
      password: 'emt-demo-2026',
      role: 'emt',
      facility: null,
      region: 'GA',
      vehicleId: 'AMB-GR-002',
      scopes: ['dispatch:read', 'dispatch:transition', 'observation:create'],
    },
    {
      username: 'auditor.general',
      password: 'audit-demo-2026',
      role: 'auditor',
      facility: null,
      region: 'all',
      scopes: ['audit:read', 'audit:verify'],
    },
  ];

  for (const u of defaults) {
    users.insert({
      username: u.username,
      passwordHash: hashPassword(u.password),
      role: u.role,
      facility: u.facility,
      region: u.region,
      vehicleId: u.vehicleId || null,
      scopes: u.scopes,
      active: true,
    });
  }

  logger.info({ msg: 'Seeded default users', count: defaults.length });
  logger.warn('DEFAULT PASSWORDS ARE IN USE — change before any non-reference deployment');
}

// ─── Bootstrap ──────────────────────────────────────────────────

async function main() {
  logger.info({
    msg: 'NCRIS booting',
    version: '1.0.0',
    environment: config.environment,
    port: config.port,
    dataDir: config.dataDir,
  });

  if (config.jwtSecret.startsWith('ncris-dev-secret')) {
    logger.warn('Using DEVELOPMENT JWT secret — set NCRIS_JWT_SECRET for any non-reference deployment');
  }

  // Storage and seed
  const storage = getStorage(config.dataDir);
  seedDefaultUsers(storage);

  // Audit & event bus first — domain services depend on them
  const audit = new AuditLog(storage);
  const eventBus = new EventBus({ logger, audit });

  // Identity services
  const facilityRegistry  = new FacilityRegistry(storage);
  const personnelDirectory= new PersonnelDirectory(storage);
  const nhiaService       = new NhiaService(storage);
  const ghanaCardService  = new GhanaCardService(storage);
  const patientIndex      = new PatientIndex(storage, ghanaCardService);

  // Domain services
  const capacityService     = new CapacityService({ storage, audit, eventBus, facilityRegistry });
  const referralService     = new ReferralService({ storage, audit, eventBus, facilityRegistry, patientIndex });
  const bedSearchService    = new BedSearchService({ facilityRegistry, capacityService, audit });
  const dispatchService     = new DispatchService({ storage, audit, eventBus });
  const brokerageService    = new BrokerageService({ storage, audit, eventBus });
  const escalationService   = new EscalationService({ storage, audit, eventBus });
  const observationService  = new ObservationService({ storage, audit, eventBus });

  // HTTP router
  const router = new Router();
  router.use(bodyParser({ limit: 1024 * 1024 }));

  // Request-id + structured access logging
  router.use((req, res, next) => {
    req.id = randomUUID();
    const start = Date.now();
    res.header('X-Request-Id', req.id);
    const url = new URL(req.url, 'http://localhost');
    req._loggedPath = url.pathname;
    res._raw.on('finish', () => {
      logger.info({
        event: 'http.request',
        reqId: req.id,
        method: req.method,
        path: url.pathname,
        status: res._status,
        ms: Date.now() - start,
        ua: req.headers['user-agent'] || null,
      });
    });
    next();
  });

  registerRoutes(router, {
    storage, audit, eventBus,
    facilityRegistry, personnelDirectory, nhiaService, ghanaCardService, patientIndex,
    referralService, bedSearchService, dispatchService, brokerageService,
    capacityService, escalationService, observationService,
  });

  // HTTP server
  const server = http.createServer((rawReq, rawRes) => {
  const req = rawReq;
  const res = wrapResponse(rawRes);

  // ✅ Proper CORS headers
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // ✅ Handle preflight requests
  if (req.method === "OPTIONS") {
    res._raw.writeHead(204);
    res._raw.end();
    return;
  }

  router.handle(req, res).catch(err => {
    logger.error({ event: 'router.unhandled', error: err.message, stack: err.stack });
    if (!res._sent) res.error(500, 'INTERNAL_ERROR', 'Unhandled error');
  });
});
  // WebSocket upgrade — same port as HTTP
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws/v1/events') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    eventBus.handleUpgrade(req, socket, head, {
      authenticate: (token) => {
        if (!token) throw new Error('Missing token');
        return verifyJwt(token, config.jwtSecret);
      },
    });
  });

  // Start
  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(config.port, config.host, resolve);
  });

  logger.info({
    msg: 'NCRIS listening',
    port: config.port,
    host: config.host,
    endpoints: {
      banner:  `http://${config.host}:${config.port}/`,
      health:  `http://${config.host}:${config.port}/healthz`,
      metrics: `http://${config.host}:${config.port}/metrics`,
      api:     `http://${config.host}:${config.port}/api/v1`,
      fhir:    `http://${config.host}:${config.port}/fhir/r4/metadata`,
      events:  `ws://${config.host}:${config.port}/ws/v1/events`,
    },
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    logger.info({ msg: 'Shutdown signal received', signal });
    server.close(() => {
      logger.info('HTTP server closed');
      // Verify audit chain integrity on the way out — catches any
      // tampering that may have happened during this run
      const verification = audit.verifyChain();
      logger.info({ msg: 'Audit chain verification on shutdown', ...verification });
      process.exit(0);
    });
    setTimeout(() => {
      logger.warn('Forced exit after 10s grace period');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ event: 'unhandledRejection', reason: String(reason) });
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ event: 'uncaughtException', error: err.message, stack: err.stack });
    process.exit(1);
  });
}

main().catch(err => {
  logger.fatal({ msg: 'NCRIS failed to start', error: err.message, stack: err.stack });
  process.exit(1);
});
