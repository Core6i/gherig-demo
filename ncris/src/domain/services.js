/**
 * NCRIS · Domain Services
 * ────────────────────────────────────────────────────────────────────
 * The high-level operations that the five subsystems invoke. These
 * orchestrate identity, FHIR resources, audit, and event publishing.
 *
 * Services:
 *   • ReferralService    — the referral envelope lifecycle
 *   • BedSearchService   — match a referral to a receiving facility
 *   • DispatchService    — ambulance dispatch lifecycle
 *   • BrokerageService   — inter-region brokerage approvals
 *   • EscalationService  — capacity / clinical escalations
 *   • CapacityService    — facility capacity tracking
 *
 * All services share a common pattern:
 *   1. Validate the request against the actor's authority
 *   2. Apply the state transition in a transaction
 *   3. Write an AuditEvent
 *   4. Publish the event to subscribed clients
 *
 * Failure modes are explicit. Services throw structured errors with
 * status codes and machine-readable error codes. The HTTP layer
 * translates these to RFC 7807 responses.
 */

import { randomUUID } from 'crypto';
import { assessVitals, verifyClientAssessment, ENGINE_VERSION } from '../core/clinical-engine.js';
import { AUDIT_TYPES, AUDIT_ACTIONS } from '../audit/audit-log.js';

class DomainError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ────────────────────────────────────────────────────────────────
// Referral Service
// ────────────────────────────────────────────────────────────────

export const REFERRAL_STATES = ['draft', 'submitted', 'routed', 'accepted', 'in-transit', 'completed', 'declined', 'cancelled'];

export class ReferralService {
  constructor({ storage, audit, eventBus, facilityRegistry, patientIndex }) {
    this.col = storage.collection('referrals');
    this.audit = audit;
    this.bus = eventBus;
    this.facilities = facilityRegistry;
    this.patients = patientIndex;
  }

  /**
   * Create a new referral envelope.
   * Called by the Pre-referral Tablet after a doctor completes the workflow.
   */
  create(payload, actor) {
    if (!payload.fromFacilityCode) throw new DomainError(400, 'FROM_FACILITY_REQUIRED', 'fromFacilityCode is required');
    if (!payload.condition)        throw new DomainError(400, 'CONDITION_REQUIRED', 'condition is required');
    if (!payload.priority)         throw new DomainError(400, 'PRIORITY_REQUIRED', 'priority is required');
    if (!payload.patient)          throw new DomainError(400, 'PATIENT_REQUIRED', 'patient is required');

    const fromFacility = this.facilities.byCode(payload.fromFacilityCode);
    if (!fromFacility) throw new DomainError(404, 'FACILITY_NOT_FOUND', `Unknown facility: ${payload.fromFacilityCode}`);

    // Resolve patient via MPI
    const { patient, action: mpiAction } = this.patients.resolveOrCreate({
      ...payload.patient,
      facilityCode: fromFacility.code,
    });

    // Server-side re-assessment of vitals as authoritative check
    let serverAssessment = null;
    if (payload.vitals) {
      serverAssessment = assessVitals(payload.vitals, payload.patient.ageYears, payload.patient.category);
    }

    // Verify client engine output matches server (clinical safety)
    let engineDivergence = null;
    if (serverAssessment && payload.clientAssessment) {
      const verification = verifyClientAssessment(serverAssessment, payload.clientAssessment);
      if (!verification.match) {
        engineDivergence = verification;
      }
    }

    const referralNumber = `REF-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const referral = this.col.insert({
      referralNumber,
      patientId: patient.id,
      ncrisPatientId: patient.ncrisPatientId,
      mpiAction,
      fromFacilityId: fromFacility.id,
      fromFacilityCode: fromFacility.code,
      fromRegion: fromFacility.region,
      condition: payload.condition,
      reasonCode: payload.reasonCode || null,
      priority: payload.priority,
      stability: payload.stability || 'unknown',
      summary: payload.summary || '',
      vitals: payload.vitals || null,
      engineAssessment: serverAssessment,
      requesterId: actor.sub,
      requesterRole: actor.role,
      state: 'submitted',
      submittedAt: new Date().toISOString(),
      targetFacilityId: null,
      targetFacilityCode: null,
      targetUnit: null,
      acceptedAt: null,
      completedAt: null,
      declinedAt: null,
      declineReason: null,
    });

    this.audit.append({
      type: AUDIT_TYPES.REFERRAL_CREATED,
      action: AUDIT_ACTIONS.CREATE,
      actor: actor.sub,
      actorRole: actor.role,
      facility: fromFacility.code,
      target: { resourceType: 'ServiceRequest', resourceId: referral.id },
      detail: { referralNumber, priority: payload.priority, mpiAction },
    });

    if (engineDivergence) {
      this.audit.append({
        type: AUDIT_TYPES.VITALS_DIVERGENCE,
        action: AUDIT_ACTIONS.EXECUTE,
        actor: actor.sub,
        actorRole: actor.role,
        facility: fromFacility.code,
        target: { resourceType: 'ServiceRequest', resourceId: referral.id },
        outcome: 'incomplete',
        detail: engineDivergence,
      });
    }

    this.bus.publish(`referral.${fromFacility.code}`, { event: 'created', referral });
    this.bus.publish('necc.national', { event: 'referral.created', referral });

    return { referral, mpiAction, engineDivergence };
  }

  /**
   * Route a referral to a receiving facility. Called either directly
   * by the originating Portal or by NECC after a bed-search.
   */
  route(referralId, { targetFacilityCode, targetUnit, routedBy }, actor) {
    const referral = this.col.findById(referralId);
    if (!referral) throw new DomainError(404, 'REFERRAL_NOT_FOUND', 'Referral not found');
    if (!['submitted', 'routed'].includes(referral.state)) {
      throw new DomainError(409, 'INVALID_STATE', `Cannot route from state '${referral.state}'`);
    }

    const target = this.facilities.byCode(targetFacilityCode);
    if (!target) throw new DomainError(404, 'TARGET_NOT_FOUND', `Unknown facility: ${targetFacilityCode}`);

    const updated = this.col.update(referralId, {
      state: 'routed',
      targetFacilityId: target.id,
      targetFacilityCode: target.code,
      targetUnit: targetUnit || null,
      routedAt: new Date().toISOString(),
      routedBy: routedBy || actor.sub,
    });

    this.audit.append({
      type: AUDIT_TYPES.REFERRAL_ROUTED,
      action: AUDIT_ACTIONS.UPDATE,
      actor: actor.sub,
      actorRole: actor.role,
      facility: referral.fromFacilityCode,
      target: { resourceType: 'ServiceRequest', resourceId: referralId },
      detail: { targetFacilityCode, targetUnit },
    });

    this.bus.publish(`referral.${target.code}`, { event: 'incoming', referral: updated });
    this.bus.publish(`referral.${referral.fromFacilityCode}`, { event: 'routed', referral: updated });
    this.bus.publish('necc.national', { event: 'referral.routed', referral: updated });

    return updated;
  }

  accept(referralId, { acceptedBy, acceptedNote }, actor) {
    const referral = this.col.findById(referralId);
    if (!referral) throw new DomainError(404, 'REFERRAL_NOT_FOUND', 'Referral not found');
    if (referral.state !== 'routed') {
      throw new DomainError(409, 'INVALID_STATE', `Cannot accept from state '${referral.state}'`);
    }

    const updated = this.col.update(referralId, {
      state: 'accepted',
      acceptedAt: new Date().toISOString(),
      acceptedBy: acceptedBy || actor.sub,
      acceptedNote: acceptedNote || null,
    });

    this.audit.append({
      type: AUDIT_TYPES.REFERRAL_ACCEPTED,
      action: AUDIT_ACTIONS.UPDATE,
      actor: actor.sub,
      actorRole: actor.role,
      facility: referral.targetFacilityCode,
      target: { resourceType: 'ServiceRequest', resourceId: referralId },
    });

    this.bus.publish(`referral.${referral.fromFacilityCode}`, { event: 'accepted', referral: updated });
    this.bus.publish(`referral.${referral.targetFacilityCode}`, { event: 'accepted', referral: updated });
    this.bus.publish('necc.national', { event: 'referral.accepted', referral: updated });

    return updated;
  }

  decline(referralId, { reason }, actor) {
    const referral = this.col.findById(referralId);
    if (!referral) throw new DomainError(404, 'REFERRAL_NOT_FOUND', 'Referral not found');

    const updated = this.col.update(referralId, {
      state: 'declined',
      declinedAt: new Date().toISOString(),
      declinedBy: actor.sub,
      declineReason: reason || null,
    });

    this.audit.append({
      type: AUDIT_TYPES.REFERRAL_DECLINED,
      action: AUDIT_ACTIONS.UPDATE,
      actor: actor.sub,
      actorRole: actor.role,
      facility: referral.targetFacilityCode,
      target: { resourceType: 'ServiceRequest', resourceId: referralId },
      detail: { reason },
    });

    this.bus.publish(`referral.${referral.fromFacilityCode}`, { event: 'declined', referral: updated });
    this.bus.publish(`referral.${referral.targetFacilityCode}`, { event: 'declined', referral: updated });
    this.bus.publish('necc.national', { event: 'referral.declined', referral: updated });

    return updated;
  }

  list(filter = {}) {
    return this.col.findWhere(r => {
      if (filter.state && r.state !== filter.state) return false;
      if (filter.fromFacilityCode && r.fromFacilityCode !== filter.fromFacilityCode) return false;
      if (filter.targetFacilityCode && r.targetFacilityCode !== filter.targetFacilityCode) return false;
      if (filter.priority && r.priority !== filter.priority) return false;
      if (filter.region && r.fromRegion !== filter.region) return false;
      return true;
    }, { sort: (a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0) });
  }

  byId(id) { return this.col.findById(id); }
}

// ────────────────────────────────────────────────────────────────
// Bed Search Service — NECC's matching engine
// ────────────────────────────────────────────────────────────────

export class BedSearchService {
  constructor({ facilityRegistry, capacityService, audit }) {
    this.facilities = facilityRegistry;
    this.capacity = capacityService;
    this.audit = audit;
  }

  /**
   * Find candidate receiving facilities for a referral.
   * Ranks by:
   *   1. Capability match (specialty)
   *   2. Capacity (beds available, ICU available)
   *   3. Distance (proxy: same region = closer)
   *   4. Acuity match (level-appropriate for priority)
   */
  search({ specialty, requireIcu, priority, originRegion, originLat, originLon, excludeFacilityCodes = [] }, actor) {
    let candidates = this.facilities.search({ specialty, hasIcu: requireIcu });
    candidates = candidates.filter(f => !excludeFacilityCodes.includes(f.code));

    // Score each
    const scored = candidates.map(f => {
      const cap = this.capacity.byFacilityCode(f.code);
      let score = 0;
      let reasons = [];

      // Specialty match — already filtered
      score += 100;

      // ICU available when required
      if (requireIcu && cap?.icuAvailable > 0) { score += 50; reasons.push('ICU available'); }
      else if (requireIcu)                     { score -= 100; reasons.push('ICU required, none free'); }

      // Beds available
      if (cap?.bedsAvailable > 5)      { score += 30; reasons.push(`${cap.bedsAvailable} beds`); }
      else if (cap?.bedsAvailable > 0) { score += 10; reasons.push(`${cap.bedsAvailable} beds (low)`); }
      else                             { score -= 80; reasons.push('No beds available'); }

      // Region — proxy for distance
      if (f.region === originRegion) { score += 25; reasons.push('Same region'); }

      // Capacity status
      if (cap?.status === 'full') { score -= 100; reasons.push('FULL'); }
      if (cap?.status === 'constrained') { score -= 30; reasons.push('Constrained'); }
      if (cap?.status === 'open') score += 10;

      // Distance approximation if coords available
      let approxDistanceKm = null;
      if (originLat != null && originLon != null && f.lat != null && f.lon != null) {
        approxDistanceKm = haversineKm(originLat, originLon, f.lat, f.lon);
        score -= approxDistanceKm * 0.4;       // 0.4 points per km penalty
        reasons.push(`${approxDistanceKm.toFixed(0)} km`);
      }

      return {
        facility: f,
        capacity: cap,
        score,
        approxDistanceKm,
        reasons,
      };
    }).sort((a, b) => b.score - a.score);

    if (this.audit) {
      this.audit.append({
        type: AUDIT_TYPES.BEDSEARCH_RUN,
        action: AUDIT_ACTIONS.EXECUTE,
        actor: actor?.sub || 'system',
        actorRole: actor?.role,
        detail: { specialty, requireIcu, priority, originRegion, candidateCount: scored.length, topCandidate: scored[0]?.facility.code },
      });
    }

    return scored;
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ────────────────────────────────────────────────────────────────
// Dispatch Service
// ────────────────────────────────────────────────────────────────

export const DISPATCH_STATES = ['requested', 'assigned', 'en_route_pickup', 'on_scene', 'en_route_dest', 'arrived', 'cleared'];

export class DispatchService {
  constructor({ storage, audit, eventBus }) {
    this.col = storage.collection('dispatches');
    this.vehicles = storage.collection('vehicles');
    this.audit = audit;
    this.bus = eventBus;
    if (this.vehicles.count() === 0) this._seedVehicles();
  }

  _seedVehicles() {
    [
      { code: 'AMB-GR-001', type: 'BLS', region: 'GA', district: 'Tema East', station: 'NAS Tema East', status: 'available' },
      { code: 'AMB-GR-002', type: 'BLS', region: 'GA', district: 'Tema East', station: 'NAS Tema East', status: 'available' },
      { code: 'AMB-GR-003', type: 'ALS', region: 'GA', district: 'Accra Central', station: 'NAS Korle-Bu', status: 'available' },
      { code: 'AMB-GR-004', type: 'BLS', region: 'GA', district: 'Achimota', station: 'NAS Achimota', status: 'available' },
    ].forEach(v => this.vehicles.insert(v));
  }

  request(payload, actor) {
    const dispatch = this.col.insert({
      referralId: payload.referralId,
      condition: payload.condition,
      priority: payload.priority,
      fromFacilityCode: payload.fromFacilityCode,
      toFacilityCode: payload.toFacilityCode,
      fromRegion: payload.fromRegion,
      toRegion: payload.toRegion,
      patientInitials: payload.patientInitials,
      patientAge: payload.patientAge,
      patientSex: payload.patientSex,
      state: 'requested',
      requestedAt: new Date().toISOString(),
      requestedBy: actor.sub,
      vehicleCode: null,
      crewIds: [],
    });

    this.audit.append({
      type: AUDIT_TYPES.DISPATCH_REQUESTED,
      action: AUDIT_ACTIONS.CREATE,
      actor: actor.sub,
      actorRole: actor.role,
      target: { resourceType: 'Dispatch', resourceId: dispatch.id },
      detail: { region: payload.fromRegion, priority: payload.priority },
    });

    this.bus.publish(`dispatch.${payload.fromRegion}`, { event: 'requested', dispatch });
    this.bus.publish('necc.national', { event: 'dispatch.requested', dispatch });

    return dispatch;
  }

  assign(dispatchId, { vehicleCode, crewIds, etaMin }, actor) {
    const dispatch = this.col.findById(dispatchId);
    if (!dispatch) throw new DomainError(404, 'DISPATCH_NOT_FOUND', 'Dispatch not found');
    if (dispatch.state !== 'requested') {
      throw new DomainError(409, 'INVALID_STATE', `Cannot assign from state '${dispatch.state}'`);
    }

    const vehicle = this.vehicles.findOne(v => v.code === vehicleCode);
    if (!vehicle) throw new DomainError(404, 'VEHICLE_NOT_FOUND', `Vehicle ${vehicleCode} not found`);
    if (vehicle.status !== 'available') {
      throw new DomainError(409, 'VEHICLE_UNAVAILABLE', `Vehicle ${vehicleCode} status is ${vehicle.status}`);
    }

    const updated = this.col.update(dispatchId, {
      state: 'assigned',
      vehicleCode,
      crewIds: crewIds || [],
      assignedAt: new Date().toISOString(),
      assignedBy: actor.sub,
      etaMin: etaMin || null,
    });
    this.vehicles.update(vehicle.id, { status: 'dispatched' });

    this.audit.append({
      type: AUDIT_TYPES.DISPATCH_ASSIGNED,
      action: AUDIT_ACTIONS.UPDATE,
      actor: actor.sub,
      actorRole: actor.role,
      target: { resourceType: 'Dispatch', resourceId: dispatchId },
      detail: { vehicleCode, etaMin },
    });

    this.bus.publish(`dispatch.${dispatch.fromRegion}`, { event: 'assigned', dispatch: updated });
    this.bus.publish(`dispatch.${vehicleCode}`, { event: 'assigned', dispatch: updated });
    this.bus.publish('necc.national', { event: 'dispatch.assigned', dispatch: updated });

    return updated;
  }

  transition(dispatchId, { toState, gpsLat, gpsLon }, actor) {
    const dispatch = this.col.findById(dispatchId);
    if (!dispatch) throw new DomainError(404, 'DISPATCH_NOT_FOUND', 'Dispatch not found');
    const fromIdx = DISPATCH_STATES.indexOf(dispatch.state);
    const toIdx = DISPATCH_STATES.indexOf(toState);
    if (toIdx === -1) throw new DomainError(400, 'INVALID_STATE', `Unknown state ${toState}`);
    if (toIdx !== fromIdx + 1) {
      throw new DomainError(409, 'INVALID_TRANSITION', `Cannot transition ${dispatch.state} → ${toState}`);
    }

    const tsField = `${toState}At`;
    const patch = { state: toState, [tsField]: new Date().toISOString() };
    if (gpsLat != null && gpsLon != null) {
      patch.lastGps = { lat: gpsLat, lon: gpsLon, at: new Date().toISOString() };
    }

    const updated = this.col.update(dispatchId, patch);

    if (toState === 'cleared' && dispatch.vehicleCode) {
      const v = this.vehicles.findOne(x => x.code === dispatch.vehicleCode);
      if (v) this.vehicles.update(v.id, { status: 'available' });
    }

    this.audit.append({
      type: AUDIT_TYPES.DISPATCH_TRANSITION,
      action: AUDIT_ACTIONS.UPDATE,
      actor: actor.sub,
      actorRole: actor.role,
      target: { resourceType: 'Dispatch', resourceId: dispatchId },
      detail: { from: dispatch.state, to: toState, gps: patch.lastGps },
    });

    this.bus.publish(`dispatch.${dispatch.fromRegion}`, { event: 'transition', dispatch: updated });
    if (dispatch.vehicleCode) {
      this.bus.publish(`dispatch.${dispatch.vehicleCode}`, { event: 'transition', dispatch: updated });
    }
    this.bus.publish('necc.national', { event: 'dispatch.transition', dispatch: updated });

    return updated;
  }

  recordGps(dispatchId, { lat, lon }, actor) {
    const dispatch = this.col.findById(dispatchId);
    if (!dispatch) throw new DomainError(404, 'DISPATCH_NOT_FOUND', 'Dispatch not found');
    const updated = this.col.update(dispatchId, {
      lastGps: { lat, lon, at: new Date().toISOString() },
    });
    // Don't audit every GPS ping (would flood the log) — only state transitions
    this.bus.publish(`dispatch.${dispatch.vehicleCode}`, { event: 'gps', dispatch: updated });
    return updated;
  }

  list(filter = {}) {
    return this.col.findWhere(d => {
      if (filter.state && d.state !== filter.state) return false;
      if (filter.region && d.fromRegion !== filter.region) return false;
      if (filter.vehicle && d.vehicleCode !== filter.vehicle) return false;
      return true;
    }, { sort: (a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0) });
  }

  byId(id) { return this.col.findById(id); }
  vehicleByCode(code) { return this.vehicles.findOne(v => v.code === code); }
  allVehicles(filter) { return filter ? this.vehicles.findWhere(filter) : this.vehicles.all(); }
}

// ────────────────────────────────────────────────────────────────
// Brokerage Service
// ────────────────────────────────────────────────────────────────

export class BrokerageService {
  constructor({ storage, audit, eventBus }) {
    this.col = storage.collection('brokerage');
    this.audit = audit;
    this.bus = eventBus;
  }

  request({ requestingRegion, targetRegion, condition, fromFacility, toFacility, reason }, actor) {
    if (requestingRegion === targetRegion) {
      throw new DomainError(400, 'SAME_REGION', 'Brokerage requires different regions');
    }
    const broker = this.col.insert({
      requestingRegion, targetRegion, condition,
      fromFacility, toFacility, reason,
      raisedBy: actor.sub,
      status: 'pending_hq',
    });
    this.audit.append({
      type: AUDIT_TYPES.BROKERAGE_REQUESTED,
      action: AUDIT_ACTIONS.CREATE,
      actor: actor.sub,
      actorRole: actor.role,
      target: { resourceType: 'Brokerage', resourceId: broker.id },
      detail: { requestingRegion, targetRegion },
    });
    this.bus.publish('brokerage.hq', { event: 'requested', broker });
    return broker;
  }

  approve(brokerId, actor) {
    if (actor.role !== 'nas_hq') {
      throw new DomainError(403, 'HQ_ONLY', 'Only NAS HQ can approve brokerage');
    }
    const broker = this.col.findById(brokerId);
    if (!broker) throw new DomainError(404, 'BROKERAGE_NOT_FOUND', 'Brokerage request not found');
    const updated = this.col.update(brokerId, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: actor.sub,
    });
    this.audit.append({
      type: AUDIT_TYPES.BROKERAGE_APPROVED,
      action: AUDIT_ACTIONS.UPDATE,
      actor: actor.sub,
      actorRole: actor.role,
      target: { resourceType: 'Brokerage', resourceId: brokerId },
    });
    this.bus.publish('brokerage.hq', { event: 'approved', broker: updated });
    this.bus.publish(`dispatch.${updated.requestingRegion}`, { event: 'brokerage.approved', broker: updated });
    this.bus.publish(`dispatch.${updated.targetRegion}`, { event: 'brokerage.approved', broker: updated });
    return updated;
  }

  reject(brokerId, { reason }, actor) {
    if (actor.role !== 'nas_hq') {
      throw new DomainError(403, 'HQ_ONLY', 'Only NAS HQ can reject brokerage');
    }
    const broker = this.col.findById(brokerId);
    if (!broker) throw new DomainError(404, 'BROKERAGE_NOT_FOUND', 'Brokerage request not found');
    const updated = this.col.update(brokerId, {
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedBy: actor.sub,
      rejectReason: reason || null,
    });
    this.audit.append({
      type: AUDIT_TYPES.BROKERAGE_REJECTED,
      action: AUDIT_ACTIONS.UPDATE,
      actor: actor.sub,
      actorRole: actor.role,
      target: { resourceType: 'Brokerage', resourceId: brokerId },
      detail: { reason },
    });
    this.bus.publish('brokerage.hq', { event: 'rejected', broker: updated });
    return updated;
  }

  list(filter = {}) {
    return this.col.findWhere(b => {
      if (filter.status && b.status !== filter.status) return false;
      if (filter.region && b.requestingRegion !== filter.region && b.targetRegion !== filter.region) return false;
      return true;
    });
  }
}

// ────────────────────────────────────────────────────────────────
// Capacity Service
// ────────────────────────────────────────────────────────────────

export class CapacityService {
  constructor({ storage, audit, eventBus, facilityRegistry }) {
    this.col = storage.collection('capacity');
    this.audit = audit;
    this.bus = eventBus;
    this.facilities = facilityRegistry;
    if (this.col.count() === 0) this._seed();
  }

  _seed() {
    for (const f of this.facilities.all()) {
      this.col.insert({
        facilityId: f.id,
        facilityCode: f.code,
        bedsTotal: f.beds || 100,
        bedsAvailable: Math.floor((f.beds || 100) * 0.3),
        icuTotal: f.specialties.includes('icu') ? 20 : 0,
        icuAvailable: f.specialties.includes('icu') ? 4 : 0,
        status: 'open',
        updatedBy: 'system-seed',
      });
    }
  }

  byFacilityCode(code) { return this.col.findOne(c => c.facilityCode === code); }
  all() { return this.col.all(); }

  update(facilityCode, patch, actor) {
    const cap = this.byFacilityCode(facilityCode);
    if (!cap) throw new DomainError(404, 'FACILITY_NOT_FOUND', `Facility ${facilityCode} not found`);
    const updated = this.col.update(cap.id, { ...patch, updatedBy: actor.sub });
    this.audit.append({
      type: AUDIT_TYPES.CAPACITY_UPDATED,
      action: AUDIT_ACTIONS.UPDATE,
      actor: actor.sub,
      actorRole: actor.role,
      facility: facilityCode,
      target: { resourceType: 'Capacity', resourceId: cap.id },
      detail: patch,
    });
    this.bus.publish(`capacity.${facilityCode}`, { event: 'updated', capacity: updated });
    this.bus.publish('necc.national', { event: 'capacity.updated', capacity: updated });
    return updated;
  }
}

// ────────────────────────────────────────────────────────────────
// Escalation Service
// ────────────────────────────────────────────────────────────────

export class EscalationService {
  constructor({ storage, audit, eventBus }) {
    this.col = storage.collection('escalations');
    this.audit = audit;
    this.bus = eventBus;
  }

  raise({ facilityCode, kind, severity, summary }, actor) {
    const esc = this.col.insert({
      facilityCode, kind, severity: severity || 'high', summary,
      raisedBy: actor.sub,
      status: 'open',
      raisedAt: new Date().toISOString(),
    });
    this.audit.append({
      type: AUDIT_TYPES.ESCALATION_RAISED,
      action: AUDIT_ACTIONS.CREATE,
      actor: actor.sub,
      actorRole: actor.role,
      facility: facilityCode,
      target: { resourceType: 'Escalation', resourceId: esc.id },
      detail: { kind, severity },
    });
    this.bus.publish('escalation.national', { event: 'raised', escalation: esc });
    return esc;
  }

  resolve(escId, { resolution }, actor) {
    const esc = this.col.findById(escId);
    if (!esc) throw new DomainError(404, 'ESCALATION_NOT_FOUND', 'Escalation not found');
    const updated = this.col.update(escId, {
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      resolvedBy: actor.sub,
      resolution,
    });
    this.audit.append({
      type: AUDIT_TYPES.ESCALATION_RESOLVED,
      action: AUDIT_ACTIONS.UPDATE,
      actor: actor.sub,
      actorRole: actor.role,
      facility: esc.facilityCode,
      target: { resourceType: 'Escalation', resourceId: escId },
      detail: { resolution },
    });
    this.bus.publish('escalation.national', { event: 'resolved', escalation: updated });
    return updated;
  }

  list(filter = {}) {
    return this.col.findWhere(e => {
      if (filter.status && e.status !== filter.status) return false;
      if (filter.facility && e.facilityCode !== filter.facility) return false;
      return true;
    });
  }
}

// ────────────────────────────────────────────────────────────────
// Observation Service (vitals)
// ────────────────────────────────────────────────────────────────

export class ObservationService {
  constructor({ storage, audit, eventBus }) {
    this.col = storage.collection('observations');
    this.audit = audit;
    this.bus = eventBus;
  }

  record(payload, actor) {
    const serverAssessment = assessVitals(payload.vitals, payload.patientAge, payload.patientCategory);
    const obs = this.col.insert({
      patientId: payload.patientId,
      encounterId: payload.encounterId || null,
      vitals: payload.vitals,
      engineAssessment: serverAssessment,
      performerId: actor.sub,
      performerRole: actor.role,
      recordedAt: new Date().toISOString(),
      source: payload.source || 'unknown',
    });

    this.audit.append({
      type: AUDIT_TYPES.VITALS_RECORDED,
      action: AUDIT_ACTIONS.CREATE,
      actor: actor.sub,
      actorRole: actor.role,
      target: { resourceType: 'Observation', resourceId: obs.id },
      detail: { criticalCount: serverAssessment.criticalCount, totalScore: serverAssessment.totalScore },
    });

    if (payload.dispatchId) {
      this.bus.publish(`dispatch.${payload.vehicleCode}`, { event: 'observation', observation: obs });
    }
    if (payload.targetFacilityCode) {
      this.bus.publish(`referral.${payload.targetFacilityCode}`, { event: 'observation', observation: obs });
    }

    return obs;
  }

  byPatient(patientId) {
    return this.col.findWhere(o => o.patientId === patientId, {
      sort: (a, b) => new Date(b.recordedAt) - new Date(a.recordedAt),
    });
  }
}

export { DomainError };
