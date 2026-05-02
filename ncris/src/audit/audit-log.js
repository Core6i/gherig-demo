/**
 * NCRIS · Audit Log
 * ────────────────────────────────────────────────────────────────────
 * Every clinically-significant event in NCRIS writes an AuditEvent.
 * The audit log is hash-chained: each entry includes the SHA-256
 * hash of the previous entry. Tampering with any historical entry
 * breaks the chain at every entry that follows.
 *
 * This is the structure required for:
 *   • Auditor-General read-only access for forensic review
 *   • Clinical safety case documentation (DCB0129/DCB0160 equivalent)
 *   • Coronial inquest evidence trail
 *   • NHIA claims dispute resolution
 *   • Donor M&E and audit reporting
 *
 * Production deployments should add:
 *   • Periodic checkpointing to immutable storage (AWS S3 Object Lock,
 *     HashiCorp Vault, or write-once blockchain anchor)
 *   • Independent verifier process running every 6 hours
 *   • Mirror to Auditor-General read replica with delay
 *
 * The chain is verified by hashing every entry in sequence and
 * confirming each entry's `prevHash` field matches.
 */

import { createHash } from 'crypto';

// Standard FHIR R4 AuditEvent action codes used in NCRIS
export const AUDIT_ACTIONS = {
  CREATE: 'C',          // create resource
  READ:   'R',          // read resource
  UPDATE: 'U',          // update resource
  DELETE: 'D',          // delete resource
  EXECUTE:'E',          // execute (workflow step)
};

// NCRIS-specific event types — extends FHIR AuditEvent.type
export const AUDIT_TYPES = {
  // Identity
  USER_LOGIN:           'auth.user.login',
  USER_LOGOUT:          'auth.user.logout',
  USER_LOGIN_FAILED:    'auth.user.login.failed',
  TOKEN_ISSUED:         'auth.token.issued',
  TOKEN_REFRESHED:      'auth.token.refreshed',
  PASSWORD_CHANGED:     'auth.password.changed',

  // Patient identity
  PATIENT_CREATED:      'patient.created',
  PATIENT_LINKED:       'patient.linked.identifier',
  PATIENT_MERGED:       'patient.merged',

  // Referral lifecycle
  REFERRAL_CREATED:     'referral.created',
  REFERRAL_ROUTED:      'referral.routed',
  REFERRAL_ACCEPTED:    'referral.accepted',
  REFERRAL_REDIRECTED:  'referral.redirected',
  REFERRAL_DECLINED:    'referral.declined',
  REFERRAL_CANCELLED:   'referral.cancelled',

  // Bed-search & escalation
  BEDSEARCH_RUN:        'bedsearch.run',
  ESCALATION_RAISED:    'escalation.raised',
  ESCALATION_RESOLVED:  'escalation.resolved',

  // Dispatch lifecycle
  DISPATCH_REQUESTED:   'dispatch.requested',
  DISPATCH_ASSIGNED:    'dispatch.assigned',
  DISPATCH_DECLINED:    'dispatch.declined',
  DISPATCH_TRANSITION:  'dispatch.transition',
  DISPATCH_CLEARED:     'dispatch.cleared',

  // Brokerage
  BROKERAGE_REQUESTED:  'brokerage.requested',
  BROKERAGE_APPROVED:   'brokerage.approved',
  BROKERAGE_REJECTED:   'brokerage.rejected',

  // Clinical
  VITALS_RECORDED:      'observation.vitals',
  VITALS_DIVERGENCE:    'observation.engine.divergence',
  INTERVENTION_LOGGED:  'intervention.logged',
  HANDOFF_SIGNED:       'handoff.signed',

  // Capacity
  CAPACITY_UPDATED:     'capacity.updated',
  FACILITY_OFFLINE:     'facility.offline',
  FACILITY_ONLINE:      'facility.online',

  // Admin
  SUBSYSTEM_REGISTERED: 'admin.subsystem.registered',
  SUBSYSTEM_REVOKED:    'admin.subsystem.revoked',
  PARTNER_REGISTERED:   'admin.partner.registered',
  PARTNER_REVOKED:      'admin.partner.revoked',
  CONFIG_CHANGED:       'admin.config.changed',
};

const GENESIS_HASH = '0'.repeat(64);

/**
 * Compute the chain hash over a fixed canonical payload — only the
 * fields that semantically define the clinical event. Storage-layer
 * decorations (id, createdAt, updatedAt) are NOT included; this keeps
 * the hash stable regardless of which storage backend records the row.
 *
 * The set of canonical fields is FROZEN. Adding a new field that should
 * be hash-protected requires a chain version bump and a re-anchoring
 * ceremony.
 */
const HASH_FIELDS = ['seq', 'prevHash', 'timestamp', 'type', 'action', 'actor', 'actorRole', 'target', 'facility', 'outcome', 'detail'];

function hashEntry(entry) {
  const canonical = {};
  for (const k of HASH_FIELDS) {
    canonical[k] = entry[k] === undefined ? null : entry[k];
  }
  // Sort top-level keys for canonical encoding
  const sortedKeys = Object.keys(canonical).sort();
  const ordered = {};
  for (const k of sortedKeys) ordered[k] = canonical[k];
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

export class AuditLog {
  constructor(storage) {
    this.storage = storage;
    this.col = storage.collection('audit_events');
  }

  /**
   * Append a new audit event. Hash-chains automatically.
   *
   * @param {object} entry - the event to log
   * @param {string} entry.type - one of AUDIT_TYPES
   * @param {string} entry.action - one of AUDIT_ACTIONS
   * @param {string} entry.actor - id of the user or subsystem
   * @param {string} entry.actorRole - role of the actor
   * @param {object} [entry.target] - { resourceType, resourceId }
   * @param {string} [entry.facility] - facility code
   * @param {string} [entry.outcome] - 'success' | 'failure' | 'incomplete'
   * @param {object} [entry.detail] - structured event-specific data
   */
  append(entry) {
    return this.col.transaction(() => {
      const last = this.col.all({ sort: (a, b) => b.seq - a.seq, limit: 1 })[0];
      const seq = last ? last.seq + 1 : 1;
      const prevHash = last ? last.hash : GENESIS_HASH;
      const evt = {
        seq,
        prevHash,
        timestamp: new Date().toISOString(),
        type: entry.type,
        action: entry.action || AUDIT_ACTIONS.EXECUTE,
        actor: entry.actor,
        actorRole: entry.actorRole || null,
        target: entry.target || null,
        facility: entry.facility || null,
        outcome: entry.outcome || 'success',
        detail: entry.detail || null,
      };
      evt.hash = hashEntry(evt);
      return this.col.insert(evt);
    });
  }

  /**
   * Verify the integrity of the entire chain. Returns
   *   { valid: true, count }
   * or
   *   { valid: false, count, brokenAt: seq, reason }
   */
  verifyChain() {
    const events = this.col.all({ sort: (a, b) => a.seq - b.seq });
    let prevHash = GENESIS_HASH;
    for (const evt of events) {
      if (evt.prevHash !== prevHash) {
        return { valid: false, count: events.length, brokenAt: evt.seq, reason: 'prevHash mismatch' };
      }
      const recomputed = hashEntry(evt);
      if (recomputed !== evt.hash) {
        return { valid: false, count: events.length, brokenAt: evt.seq, reason: 'entry tampered (hash mismatch)' };
      }
      prevHash = evt.hash;
    }
    return { valid: true, count: events.length };
  }

  /**
   * Query audit events. Common filters:
   *   { type, actor, facility, since, until, target }
   */
  query(filter = {}, opts = {}) {
    const sinceTs = filter.since ? new Date(filter.since).getTime() : 0;
    const untilTs = filter.until ? new Date(filter.until).getTime() : Date.now() + 86400000;
    return this.col.findWhere(e => {
      const ts = new Date(e.timestamp).getTime();
      if (ts < sinceTs || ts > untilTs) return false;
      if (filter.type && e.type !== filter.type) return false;
      if (filter.types && !filter.types.includes(e.type)) return false;
      if (filter.actor && e.actor !== filter.actor) return false;
      if (filter.facility && e.facility !== filter.facility) return false;
      if (filter.targetId && e.target?.resourceId !== filter.targetId) return false;
      if (filter.outcome && e.outcome !== filter.outcome) return false;
      return true;
    }, {
      sort: (a, b) => b.seq - a.seq,
      limit: opts.limit || 500,
    });
  }

  /**
   * Stats for ops dashboards.
   */
  stats() {
    const all = this.col.all();
    const lastHour = Date.now() - 3600 * 1000;
    const lastDay  = Date.now() - 86400 * 1000;
    const inLastHour = all.filter(e => new Date(e.timestamp).getTime() >= lastHour);
    const inLastDay  = all.filter(e => new Date(e.timestamp).getTime() >= lastDay);
    const failures   = all.filter(e => e.outcome === 'failure');
    return {
      total: all.length,
      lastHour: inLastHour.length,
      lastDay: inLastDay.length,
      failures: failures.length,
      mostRecentSeq: all.length > 0 ? Math.max(...all.map(e => e.seq)) : 0,
    };
  }
}
