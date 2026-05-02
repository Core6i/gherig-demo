/**
 * NCRIS · HTTP Routes
 * ────────────────────────────────────────────────────────────────────
 * The full API surface, organised by route family:
 *
 *   /api/v1/auth/*            — login, logout, token refresh
 *   /api/v1/identity/*        — NHIA / Ghana Card / facility / personnel lookups
 *   /api/v1/referrals/*       — referral CRUD and lifecycle
 *   /api/v1/bedsearch         — NECC bed-search engine
 *   /api/v1/dispatches/*      — dispatch CRUD and lifecycle
 *   /api/v1/brokerage/*       — inter-region brokerage
 *   /api/v1/escalations/*     — escalation broker
 *   /api/v1/capacity/*        — facility capacity board
 *   /api/v1/observations/*    — vital signs
 *   /api/v1/clinical/*        — engine version, assessment endpoint
 *
 *   /fhir/r4/*                — FHIR R4 RESTful interface
 *
 *   /api/v1/partner/*         — Partner API gateway (API key auth)
 *
 *   /api/v1/admin/*           — Subsystem & partner administration
 *   /api/v1/admin/audit/*     — Audit log query and chain verification
 *
 *   /healthz                  — health probe
 *   /metrics                  — Prometheus-style metrics
 *   /                         — service banner / openapi link
 */

import {
  patientResource, practitionerResource, organizationResource,
  encounterResource, serviceRequestResource, observationResource,
  medicationAdministrationResource, procedureResource,
  capacityStatementResource, auditEventResource, bundle,
  capabilityStatement,
} from './fhir/resources.js';
import { ENGINE_VERSION, assessVitals, verifyClientAssessment } from './core/clinical-engine.js';
import { signJwt, hashPassword, verifyPassword, generateApiKey, hashApiKey, authRequired, apiKeyRequired } from './core/auth.js';
import { AUDIT_TYPES, AUDIT_ACTIONS } from './audit/audit-log.js';

const JWT_SECRET = process.env.NCRIS_JWT_SECRET || 'ncris-dev-secret-CHANGE-IN-PROD-min-32-bytes';
const JWT_TTL = parseInt(process.env.NCRIS_JWT_TTL_SEC || '28800', 10);   // 8 hours

export function registerRoutes(router, ctx) {
  const {
    storage, audit, eventBus,
    facilityRegistry, personnelDirectory, nhiaService, ghanaCardService, patientIndex,
    referralService, bedSearchService, dispatchService, brokerageService,
    capacityService, escalationService, observationService,
  } = ctx;

  const requireAuth = authRequired({ secret: JWT_SECRET });
  const requirePartner = apiKeyRequired({ storage });

  // ──────────────────────────────────────────────────────────
  // Service banner & health
  // ──────────────────────────────────────────────────────────

  router.get('/', (req, res) => {
    res.json({
      service: 'NCRIS',
      title: 'National Clinical Referral & Intelligence Switch',
      programme: 'GhERIG · Ghana Emergency Referral & Intelligence Grid',
      version: '1.0.0',
      engineVersion: ENGINE_VERSION,
      apis: {
        domain: '/api/v1',
        fhir: '/fhir/r4',
        partner: '/api/v1/partner',
        admin: '/api/v1/admin',
      },
      docs: '/api/v1/openapi.json',
      health: '/healthz',
      metrics: '/metrics',
    });
  });

  router.get('/healthz', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
  });

  router.get('/metrics', (req, res) => {
    const stats = {
      ncris_audit_events_total: audit.col.count(),
      ncris_referrals_total: storage.collection('referrals').count(),
      ncris_dispatches_total: storage.collection('dispatches').count(),
      ncris_escalations_open: storage.collection('escalations').count(e => e.status === 'open'),
      ncris_websocket_clients: eventBus.clients.size,
      ncris_facilities_total: storage.collection('facilities').count(),
      ncris_uptime_seconds: process.uptime(),
    };
    let out = '';
    for (const [k, v] of Object.entries(stats)) {
      out += `# TYPE ${k} gauge\n${k} ${v}\n`;
    }
    res.text(out);
  });

  // ──────────────────────────────────────────────────────────
  // Auth
  // ──────────────────────────────────────────────────────────

  /**
   * POST /api/v1/auth/login
   *   { username, password, subsystem }
   *   subsystem ∈ tablet | portal | necc | arcs | emt
   */
  router.post('/api/v1/auth/login', (req, res) => {
    const { username, password, subsystem } = req.body || {};
    if (!username || !password) {
      return res.error(400, 'CREDENTIALS_REQUIRED', 'username and password required');
    }
    const users = storage.collection('users');
    const user = users.findOne(u => u.username === username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      audit.append({
        type: AUDIT_TYPES.USER_LOGIN_FAILED,
        action: AUDIT_ACTIONS.EXECUTE,
        actor: username,
        outcome: 'failure',
        detail: { subsystem },
      });
      return res.error(401, 'BAD_CREDENTIALS', 'Invalid username or password');
    }

    const token = signJwt({
      sub: user.id,
      username: user.username,
      role: user.role,
      facility: user.facility,
      region: user.region,
      vehicleId: user.vehicleId,
      scopes: user.scopes || [],
      subsystem,
    }, JWT_SECRET, { ttlSec: JWT_TTL });

    audit.append({
      type: AUDIT_TYPES.USER_LOGIN,
      action: AUDIT_ACTIONS.EXECUTE,
      actor: user.id,
      actorRole: user.role,
      facility: user.facility,
      detail: { subsystem },
    });
    audit.append({
      type: AUDIT_TYPES.TOKEN_ISSUED,
      action: AUDIT_ACTIONS.EXECUTE,
      actor: user.id,
      actorRole: user.role,
      detail: { subsystem, ttlSec: JWT_TTL },
    });

    res.json({
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: JWT_TTL,
      user: { id: user.id, username: user.username, role: user.role, facility: user.facility, region: user.region },
    });
  });

  router.post('/api/v1/auth/logout', requireAuth, (req, res) => {
    audit.append({
      type: AUDIT_TYPES.USER_LOGOUT,
      action: AUDIT_ACTIONS.EXECUTE,
      actor: req.user.sub,
      actorRole: req.user.role,
    });
    res.json({ ok: true });
  });

  router.get('/api/v1/auth/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  // ──────────────────────────────────────────────────────────
  // Identity
  // ──────────────────────────────────────────────────────────

  router.get('/api/v1/identity/facilities', requireAuth, (req, res) => {
    const filter = {};
    if (req.query.specialty) filter.specialty = req.query.specialty;
    if (req.query.region)    filter.region = req.query.region;
    if (req.query.level)     filter.level = req.query.level;
    const facilities = facilityRegistry.search(filter);
    res.json({ count: facilities.length, facilities });
  });

  router.get('/api/v1/identity/facilities/:code', requireAuth, (req, res) => {
    const f = facilityRegistry.byCode(req.params.code);
    if (!f) return res.error(404, 'FACILITY_NOT_FOUND', 'Facility not found');
    res.json(f);
  });

  router.post('/api/v1/identity/nhia/verify', requireAuth, (req, res) => {
    const { membershipNumber } = req.body || {};
    if (!membershipNumber) return res.error(400, 'MEMBERSHIP_NUMBER_REQUIRED', 'membershipNumber required');
    const result = nhiaService.verify(membershipNumber);
    audit.append({
      type: 'identity.nhia.verify',
      action: AUDIT_ACTIONS.READ,
      actor: req.user.sub,
      actorRole: req.user.role,
      outcome: result.found ? 'success' : 'incomplete',
      detail: { lookupId: result.lookupId, found: result.found },
    });
    res.json(result);
  });

  router.post('/api/v1/identity/ghana-card/verify', requireAuth, (req, res) => {
    const { pin } = req.body || {};
    if (!pin) return res.error(400, 'PIN_REQUIRED', 'pin required');
    const result = ghanaCardService.verify(pin);
    res.json(result);
  });

  router.get('/api/v1/identity/personnel/:council', requireAuth, (req, res) => {
    const p = personnelDirectory.byCouncil(req.params.council);
    if (!p) return res.error(404, 'PERSONNEL_NOT_FOUND', 'Personnel not found');
    res.json(p);
  });

  router.get('/api/v1/identity/patients/:id', requireAuth, (req, res) => {
    const p = patientIndex.byId(req.params.id);
    if (!p) return res.error(404, 'PATIENT_NOT_FOUND', 'Patient not found');
    res.json(p);
  });

  router.post('/api/v1/identity/patients/resolve', requireAuth, (req, res) => {
    const result = patientIndex.resolveOrCreate(req.body || {});
    res.json(result);
  });

  // ──────────────────────────────────────────────────────────
  // Clinical Engine
  // ──────────────────────────────────────────────────────────

  router.get('/api/v1/clinical/engine-version', (req, res) => {
    res.json({ engineVersion: ENGINE_VERSION });
  });

  router.post('/api/v1/clinical/assess', requireAuth, (req, res) => {
    const { vitals, ageYears, category, clientAssessment } = req.body || {};
    if (!vitals) return res.error(400, 'VITALS_REQUIRED', 'vitals required');
    const serverAssessment = assessVitals(vitals, ageYears, category);
    const verification = clientAssessment ? verifyClientAssessment(serverAssessment, clientAssessment) : null;
    res.json({ serverAssessment, verification });
  });

  // ──────────────────────────────────────────────────────────
  // Referrals
  // ──────────────────────────────────────────────────────────

  router.post('/api/v1/referrals', requireAuth, (req, res) => {
    const result = referralService.create(req.body, req.user);
    res.status(201).json(result);
  });

  router.get('/api/v1/referrals', requireAuth, (req, res) => {
    const referrals = referralService.list({
      state: req.query.state,
      fromFacilityCode: req.query.fromFacility,
      targetFacilityCode: req.query.targetFacility,
      priority: req.query.priority,
      region: req.query.region,
    });
    res.json({ count: referrals.length, referrals });
  });

  router.get('/api/v1/referrals/:id', requireAuth, (req, res) => {
    const r = referralService.byId(req.params.id);
    if (!r) return res.error(404, 'REFERRAL_NOT_FOUND', 'Referral not found');
    res.json(r);
  });

  router.post('/api/v1/referrals/:id/route', requireAuth, (req, res) => {
    const updated = referralService.route(req.params.id, req.body, req.user);
    res.json(updated);
  });

  router.post('/api/v1/referrals/:id/accept', requireAuth, (req, res) => {
    const updated = referralService.accept(req.params.id, req.body || {}, req.user);
    res.json(updated);
  });

  router.post('/api/v1/referrals/:id/decline', requireAuth, (req, res) => {
    const updated = referralService.decline(req.params.id, req.body || {}, req.user);
    res.json(updated);
  });

  // ──────────────────────────────────────────────────────────
  // Bed Search
  // ──────────────────────────────────────────────────────────

  router.post('/api/v1/bedsearch', requireAuth, (req, res) => {
    const candidates = bedSearchService.search(req.body || {}, req.user);
    res.json({ count: candidates.length, candidates });
  });

  // ──────────────────────────────────────────────────────────
  // Dispatch
  // ──────────────────────────────────────────────────────────

  router.post('/api/v1/dispatches', requireAuth, (req, res) => {
    const dispatch = dispatchService.request(req.body, req.user);
    res.status(201).json(dispatch);
  });

  router.get('/api/v1/dispatches', requireAuth, (req, res) => {
    const dispatches = dispatchService.list({
      state: req.query.state,
      region: req.query.region,
      vehicle: req.query.vehicle,
    });
    res.json({ count: dispatches.length, dispatches });
  });

  router.get('/api/v1/dispatches/:id', requireAuth, (req, res) => {
    const d = dispatchService.byId(req.params.id);
    if (!d) return res.error(404, 'DISPATCH_NOT_FOUND', 'Dispatch not found');
    res.json(d);
  });

  router.post('/api/v1/dispatches/:id/assign', requireAuth, (req, res) => {
    const updated = dispatchService.assign(req.params.id, req.body, req.user);
    res.json(updated);
  });

  router.post('/api/v1/dispatches/:id/transition', requireAuth, (req, res) => {
    const updated = dispatchService.transition(req.params.id, req.body, req.user);
    res.json(updated);
  });

  router.post('/api/v1/dispatches/:id/gps', requireAuth, (req, res) => {
    const updated = dispatchService.recordGps(req.params.id, req.body, req.user);
    res.json(updated);
  });

  router.get('/api/v1/vehicles', requireAuth, (req, res) => {
    const vehicles = dispatchService.allVehicles(req.query.region ? v => v.region === req.query.region : null);
    res.json({ count: vehicles.length, vehicles });
  });

  // ──────────────────────────────────────────────────────────
  // Brokerage
  // ──────────────────────────────────────────────────────────

  router.post('/api/v1/brokerage', requireAuth, (req, res) => {
    const broker = brokerageService.request(req.body, req.user);
    res.status(201).json(broker);
  });

  router.get('/api/v1/brokerage', requireAuth, (req, res) => {
    const list = brokerageService.list({
      status: req.query.status,
      region: req.query.region,
    });
    res.json({ count: list.length, brokerage: list });
  });

  router.post('/api/v1/brokerage/:id/approve', requireAuth, (req, res) => {
    const updated = brokerageService.approve(req.params.id, req.user);
    res.json(updated);
  });

  router.post('/api/v1/brokerage/:id/reject', requireAuth, (req, res) => {
    const updated = brokerageService.reject(req.params.id, req.body || {}, req.user);
    res.json(updated);
  });

  // ──────────────────────────────────────────────────────────
  // Escalations
  // ──────────────────────────────────────────────────────────

  router.post('/api/v1/escalations', requireAuth, (req, res) => {
    const esc = escalationService.raise(req.body, req.user);
    res.status(201).json(esc);
  });

  router.get('/api/v1/escalations', requireAuth, (req, res) => {
    const list = escalationService.list({
      status: req.query.status,
      facility: req.query.facility,
    });
    res.json({ count: list.length, escalations: list });
  });

  router.post('/api/v1/escalations/:id/resolve', requireAuth, (req, res) => {
    const updated = escalationService.resolve(req.params.id, req.body || {}, req.user);
    res.json(updated);
  });

  // ──────────────────────────────────────────────────────────
  // Capacity
  // ──────────────────────────────────────────────────────────

  router.get('/api/v1/capacity', requireAuth, (req, res) => {
    res.json({ capacity: capacityService.all() });
  });

  router.get('/api/v1/capacity/:code', requireAuth, (req, res) => {
    const cap = capacityService.byFacilityCode(req.params.code);
    if (!cap) return res.error(404, 'NOT_FOUND', 'Capacity record not found');
    res.json(cap);
  });

  router.put('/api/v1/capacity/:code', requireAuth, (req, res) => {
    const updated = capacityService.update(req.params.code, req.body || {}, req.user);
    res.json(updated);
  });

  // ──────────────────────────────────────────────────────────
  // Observations (vitals)
  // ──────────────────────────────────────────────────────────

  router.post('/api/v1/observations', requireAuth, (req, res) => {
    const obs = observationService.record(req.body, req.user);
    res.status(201).json(obs);
  });

  router.get('/api/v1/observations/patient/:patientId', requireAuth, (req, res) => {
    res.json({ observations: observationService.byPatient(req.params.patientId) });
  });

  // ──────────────────────────────────────────────────────────
  // FHIR R4
  // ──────────────────────────────────────────────────────────

  router.get('/fhir/r4/metadata', (req, res) => {
    res.header('Content-Type', 'application/fhir+json');
    res.json(capabilityStatement());
  });

  router.get('/fhir/r4/Patient/:id', requireAuth, (req, res) => {
    const p = patientIndex.byId(req.params.id);
    if (!p) return res.error(404, 'NOT_FOUND', 'Patient not found');
    res.header('Content-Type', 'application/fhir+json');
    res.json(patientResource(p));
  });

  router.get('/fhir/r4/Organization/:id', requireAuth, (req, res) => {
    const f = facilityRegistry.byId(req.params.id);
    if (!f) return res.error(404, 'NOT_FOUND', 'Organization not found');
    res.header('Content-Type', 'application/fhir+json');
    res.json(organizationResource(f));
  });

  router.get('/fhir/r4/Organization', requireAuth, (req, res) => {
    const facilities = facilityRegistry.all();
    res.header('Content-Type', 'application/fhir+json');
    res.json(bundle(facilities.map(organizationResource)));
  });

  router.get('/fhir/r4/Practitioner/:id', requireAuth, (req, res) => {
    const p = personnelDirectory.byId(req.params.id);
    if (!p) return res.error(404, 'NOT_FOUND', 'Practitioner not found');
    res.header('Content-Type', 'application/fhir+json');
    res.json(practitionerResource(p));
  });

  router.get('/fhir/r4/ServiceRequest/:id', requireAuth, (req, res) => {
    const r = referralService.byId(req.params.id);
    if (!r) return res.error(404, 'NOT_FOUND', 'ServiceRequest not found');
    res.header('Content-Type', 'application/fhir+json');
    res.json(serviceRequestResource(r));
  });

  router.get('/fhir/r4/ServiceRequest', requireAuth, (req, res) => {
    const referrals = referralService.list({
      state: req.query.status,
      priority: req.query.priority,
    });
    res.header('Content-Type', 'application/fhir+json');
    res.json(bundle(referrals.map(serviceRequestResource)));
  });

  router.get('/fhir/r4/Observation/:id', requireAuth, (req, res) => {
    const o = storage.collection('observations').findById(req.params.id);
    if (!o) return res.error(404, 'NOT_FOUND', 'Observation not found');
    res.header('Content-Type', 'application/fhir+json');
    res.json(observationResource(o));
  });

  router.get('/fhir/r4/AuditEvent', requireAuth, (req, res) => {
    if (!['necc_operator', 'nas_hq', 'auditor', 'admin'].includes(req.user.role)) {
      return res.error(403, 'FORBIDDEN', 'AuditEvent access requires elevated role');
    }
    const events = audit.query({
      type: req.query.type,
      since: req.query.since,
      until: req.query.until,
      facility: req.query.facility,
    }, { limit: parseInt(req.query._count || '100', 10) });
    res.header('Content-Type', 'application/fhir+json');
    res.json(bundle(events.map(auditEventResource)));
  });

  // ──────────────────────────────────────────────────────────
  // Partner API
  // ──────────────────────────────────────────────────────────

  router.get('/api/v1/partner/health', requirePartner, (req, res) => {
    res.json({ ok: true, partner: req.partner.name });
  });

  router.get('/api/v1/partner/referrals/aggregate', requirePartner, (req, res) => {
    if (!req.partner.scopes.includes('referral:read:aggregate')) {
      return res.error(403, 'INSUFFICIENT_SCOPE', 'partner missing scope referral:read:aggregate');
    }
    const all = storage.collection('referrals').all();
    const since = req.query.since ? new Date(req.query.since).getTime() : 0;
    const filtered = all.filter(r => new Date(r.createdAt).getTime() >= since);
    const byPriority = { critical: 0, high: 0, routine: 0 };
    const byState = {};
    for (const r of filtered) {
      byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
      byState[r.state] = (byState[r.state] || 0) + 1;
    }
    res.json({
      windowStart: req.query.since || null,
      windowEnd: new Date().toISOString(),
      total: filtered.length,
      byPriority,
      byState,
    });
  });

  router.get('/api/v1/partner/dispatches/aggregate', requirePartner, (req, res) => {
    if (!req.partner.scopes.includes('dispatch:read:aggregate')) {
      return res.error(403, 'INSUFFICIENT_SCOPE', 'partner missing scope dispatch:read:aggregate');
    }
    const all = storage.collection('dispatches').all();
    const since = req.query.since ? new Date(req.query.since).getTime() : 0;
    const filtered = all.filter(d => new Date(d.requestedAt).getTime() >= since);
    const byRegion = {};
    const byState = {};
    for (const d of filtered) {
      byRegion[d.fromRegion] = (byRegion[d.fromRegion] || 0) + 1;
      byState[d.state] = (byState[d.state] || 0) + 1;
    }
    res.json({
      windowStart: req.query.since || null,
      windowEnd: new Date().toISOString(),
      total: filtered.length,
      byRegion,
      byState,
    });
  });

  router.get('/api/v1/partner/capacity/snapshot', requirePartner, (req, res) => {
    if (!req.partner.scopes.includes('capacity:read')) {
      return res.error(403, 'INSUFFICIENT_SCOPE', 'partner missing scope capacity:read');
    }
    res.json({ timestamp: new Date().toISOString(), capacity: capacityService.all() });
  });

  // ──────────────────────────────────────────────────────────
  // Admin
  // ──────────────────────────────────────────────────────────

  const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') return res.error(403, 'ADMIN_ONLY', 'Admin role required');
    next();
  };

  // Subsystem registration — for plugging in current 5 + future
  router.post('/api/v1/admin/subsystems', requireAuth, requireAdmin, (req, res) => {
    const { name, kind, allowedScopes, contactEmail } = req.body || {};
    if (!name || !kind) return res.error(400, 'NAME_AND_KIND_REQUIRED', 'name and kind required');
    const subsystems = storage.collection('subsystems');
    const sub = subsystems.insert({ name, kind, allowedScopes: allowedScopes || [], contactEmail, registeredBy: req.user.sub, active: true });
    audit.append({
      type: AUDIT_TYPES.SUBSYSTEM_REGISTERED,
      action: AUDIT_ACTIONS.CREATE,
      actor: req.user.sub, actorRole: req.user.role,
      target: { resourceType: 'Subsystem', resourceId: sub.id },
      detail: { name, kind },
    });
    res.status(201).json(sub);
  });

  router.get('/api/v1/admin/subsystems', requireAuth, requireAdmin, (req, res) => {
    res.json({ subsystems: storage.collection('subsystems').all() });
  });

  router.delete('/api/v1/admin/subsystems/:id', requireAuth, requireAdmin, (req, res) => {
    storage.collection('subsystems').update(req.params.id, { active: false, revokedAt: new Date().toISOString(), revokedBy: req.user.sub });
    audit.append({
      type: AUDIT_TYPES.SUBSYSTEM_REVOKED,
      action: AUDIT_ACTIONS.UPDATE,
      actor: req.user.sub, actorRole: req.user.role,
      target: { resourceType: 'Subsystem', resourceId: req.params.id },
    });
    res.json({ ok: true });
  });

  // Partner registration & API key issuance
  router.post('/api/v1/admin/partners', requireAuth, requireAdmin, (req, res) => {
    const { name, contactEmail, scopes } = req.body || {};
    if (!name) return res.error(400, 'NAME_REQUIRED', 'name required');
    const apiKey = generateApiKey('partner');
    const keyHash = hashApiKey(apiKey);
    const partner = storage.collection('partners').insert({
      name, contactEmail, scopes: scopes || [], keyHash, active: true, registeredBy: req.user.sub,
    });
    audit.append({
      type: AUDIT_TYPES.PARTNER_REGISTERED,
      action: AUDIT_ACTIONS.CREATE,
      actor: req.user.sub, actorRole: req.user.role,
      target: { resourceType: 'Partner', resourceId: partner.id },
      detail: { name, scopes },
    });
    // Return the API key once — never again
    res.status(201).json({ partner: { id: partner.id, name: partner.name, scopes: partner.scopes }, apiKey, warning: 'Store this API key now. It cannot be retrieved later.' });
  });

  router.get('/api/v1/admin/partners', requireAuth, requireAdmin, (req, res) => {
    const partners = storage.collection('partners').all().map(p => {
      const { keyHash, ...safe } = p;
      return safe;
    });
    res.json({ partners });
  });

  router.delete('/api/v1/admin/partners/:id', requireAuth, requireAdmin, (req, res) => {
    storage.collection('partners').update(req.params.id, { active: false, revokedAt: new Date().toISOString() });
    audit.append({
      type: AUDIT_TYPES.PARTNER_REVOKED,
      action: AUDIT_ACTIONS.UPDATE,
      actor: req.user.sub, actorRole: req.user.role,
      target: { resourceType: 'Partner', resourceId: req.params.id },
    });
    res.json({ ok: true });
  });

  // Audit
  router.get('/api/v1/admin/audit', requireAuth, (req, res) => {
    if (!['necc_operator', 'nas_hq', 'auditor', 'admin'].includes(req.user.role)) {
      return res.error(403, 'FORBIDDEN', 'Audit access requires elevated role');
    }
    const events = audit.query({
      type: req.query.type,
      actor: req.query.actor,
      facility: req.query.facility,
      since: req.query.since,
      until: req.query.until,
      outcome: req.query.outcome,
    }, { limit: parseInt(req.query.limit || '200', 10) });
    res.json({ count: events.length, events });
  });

  router.get('/api/v1/admin/audit/verify', requireAuth, (req, res) => {
    if (!['auditor', 'admin'].includes(req.user.role)) {
      return res.error(403, 'FORBIDDEN', 'Chain verification requires auditor or admin');
    }
    const result = audit.verifyChain();
    res.json(result);
  });

  router.get('/api/v1/admin/audit/stats', requireAuth, (req, res) => {
    res.json(audit.stats());
  });

  // Event bus stats
  router.get('/api/v1/admin/events/stats', requireAuth, requireAdmin, (req, res) => {
    res.json(eventBus.stats());
  });
}
