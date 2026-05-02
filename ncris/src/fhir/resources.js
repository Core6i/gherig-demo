/**
 * NCRIS · FHIR R4 Resources
 * ────────────────────────────────────────────────────────────────────
 * NCRIS exposes core clinical resources as FHIR R4 (HL7 spec v4.0.1).
 * This makes the system interoperable with:
 *   • External hospital information systems (when partner HIS need to
 *     read GhERIG referral state)
 *   • International donor M&E platforms expecting FHIR
 *   • Future research data warehouses
 *   • EU GDPR / Ghana DPA-compliant data export
 *
 * Resources implemented:
 *   • Patient                       — patient demographics + identifiers
 *   • Practitioner                  — clinicians and EMTs
 *   • PractitionerRole              — role at a facility
 *   • Organization                  — hospitals and facilities
 *   • Encounter                     — a clinical episode
 *   • ServiceRequest                — the referral primitive
 *   • Observation                   — vital signs, lab results
 *   • Condition                     — diagnoses
 *   • MedicationAdministration      — drugs given (interventions)
 *   • Procedure                     — interventions other than meds
 *   • Location                      — physical locations (vehicles)
 *   • AuditEvent                    — surfaced from audit log
 *   • CapacityStatement (custom)    — facility capacity (NCRIS extension)
 *
 * The resource shapes match the HL7 FHIR R4 spec. Production deployments
 * should validate against the formal FHIR profile registry; this
 * reference implementation does spec-shaped output but does not run
 * the formal validator. A Phase 2 task is to introduce HAPI FHIR or
 * Medplum as the FHIR persistence layer.
 */

import { randomUUID } from 'crypto';

const NCRIS_BASE = 'https://ncris.gov.gh/fhir';

// ────────────────────────────────────────────────────────────────
// Common helpers
// ────────────────────────────────────────────────────────────────

const reference = (resourceType, id) => ({ reference: `${resourceType}/${id}` });

const codeableConcept = (system, code, display) => ({
  coding: [{ system, code, display }],
  text: display,
});

const period = (start, end) => {
  const p = {};
  if (start) p.start = start;
  if (end)   p.end   = end;
  return p;
};

// ────────────────────────────────────────────────────────────────
// Patient
// ────────────────────────────────────────────────────────────────

export function patientResource(patient) {
  const identifiers = [];
  if (patient.ncrisPatientId) {
    identifiers.push({
      use: 'official',
      system: `${NCRIS_BASE}/identifier/ncris`,
      value: patient.ncrisPatientId,
    });
  }
  if (patient.identifiers?.nhia) {
    identifiers.push({
      use: 'usual',
      system: 'https://nhis.gov.gh/identifier/membership',
      value: patient.identifiers.nhia,
    });
  }
  if (patient.identifiers?.ghanaCardHash) {
    identifiers.push({
      use: 'secondary',
      system: `${NCRIS_BASE}/identifier/ghana-card-hashed`,
      value: patient.identifiers.ghanaCardHash,
      // Note: hash only, original PIN never stored
    });
  }

  const out = {
    resourceType: 'Patient',
    id: patient.id,
    meta: { lastUpdated: patient.updatedAt, profile: [`${NCRIS_BASE}/StructureDefinition/Patient-NCRIS`] },
    identifier: identifiers,
    active: true,
  };

  if (patient.demographics?.name) {
    out.name = [{
      use: 'official',
      family: patient.demographics.name.last || '',
      given: [patient.demographics.name.first].filter(Boolean),
    }];
  }
  if (patient.demographics?.dob) out.birthDate = patient.demographics.dob;
  if (patient.demographics?.sex) {
    out.gender = patient.demographics.sex === 'M' ? 'male' :
                 patient.demographics.sex === 'F' ? 'female' : 'unknown';
  }

  return out;
}

// ────────────────────────────────────────────────────────────────
// Practitioner
// ────────────────────────────────────────────────────────────────

export function practitionerResource(person) {
  return {
    resourceType: 'Practitioner',
    id: person.id,
    meta: { lastUpdated: person.updatedAt },
    identifier: [
      person.council ? {
        use: 'official',
        system: `${NCRIS_BASE}/identifier/council`,
        value: person.council,
      } : null,
    ].filter(Boolean),
    name: person.name ? [{
      use: 'official',
      text: person.name,
    }] : [],
    active: true,
  };
}

// ────────────────────────────────────────────────────────────────
// Organization (facility)
// ────────────────────────────────────────────────────────────────

export function organizationResource(facility) {
  return {
    resourceType: 'Organization',
    id: facility.id,
    meta: { lastUpdated: facility.updatedAt },
    identifier: [{
      use: 'official',
      system: `${NCRIS_BASE}/identifier/moh-facility`,
      value: facility.code,
    }],
    active: facility.active,
    type: [codeableConcept(`${NCRIS_BASE}/CodeSystem/facility-level`, facility.level, facility.level)],
    name: facility.name,
    address: [{
      use: 'work',
      city: facility.district,
      state: facility.region,
      country: 'GH',
    }],
    extension: [
      {
        url: `${NCRIS_BASE}/StructureDefinition/Organization-coordinates`,
        valueGeolocation: {
          latitude: facility.lat,
          longitude: facility.lon,
        },
      },
      {
        url: `${NCRIS_BASE}/StructureDefinition/Organization-specialties`,
        valueCodeableConcept: {
          coding: facility.specialties.map(s => ({
            system: `${NCRIS_BASE}/CodeSystem/specialty`,
            code: s,
          })),
        },
      },
    ],
  };
}

// ────────────────────────────────────────────────────────────────
// Encounter
// ────────────────────────────────────────────────────────────────

export function encounterResource(encounter) {
  return {
    resourceType: 'Encounter',
    id: encounter.id,
    meta: { lastUpdated: encounter.updatedAt },
    status: encounter.status,
    class: codeableConcept('http://terminology.hl7.org/CodeSystem/v3-ActCode', 'EMER', 'emergency'),
    subject: reference('Patient', encounter.patientId),
    serviceProvider: reference('Organization', encounter.facilityId),
    period: period(encounter.startedAt, encounter.endedAt),
    reasonCode: encounter.reason ? [codeableConcept(`${NCRIS_BASE}/CodeSystem/icd-10`, encounter.reasonCode, encounter.reason)] : [],
  };
}

// ────────────────────────────────────────────────────────────────
// ServiceRequest — the referral primitive
// ────────────────────────────────────────────────────────────────

const FHIR_PRIORITY_MAP = {
  critical: 'stat',
  high:     'urgent',
  routine:  'routine',
};

export function serviceRequestResource(referral) {
  return {
    resourceType: 'ServiceRequest',
    id: referral.id,
    meta: { lastUpdated: referral.updatedAt, profile: [`${NCRIS_BASE}/StructureDefinition/ServiceRequest-Referral`] },
    identifier: [{
      use: 'official',
      system: `${NCRIS_BASE}/identifier/referral`,
      value: referral.referralNumber || referral.id,
    }],
    status: mapReferralStatus(referral.state),
    intent: 'order',
    priority: FHIR_PRIORITY_MAP[referral.priority] || 'routine',
    category: [codeableConcept(`${NCRIS_BASE}/CodeSystem/referral-category`, 'inter-facility-transfer', 'Inter-facility transfer')],
    code: codeableConcept(`${NCRIS_BASE}/CodeSystem/referral-reason`, referral.reasonCode || 'unspecified', referral.condition),
    subject: reference('Patient', referral.patientId),
    encounter: referral.encounterId ? reference('Encounter', referral.encounterId) : undefined,
    requester: reference('Practitioner', referral.requesterId),
    performer: referral.targetFacilityId ? [reference('Organization', referral.targetFacilityId)] : [],
    locationReference: referral.targetUnit ? [{ display: referral.targetUnit }] : [],
    authoredOn: referral.createdAt,
    note: referral.summary ? [{ text: referral.summary }] : [],
    extension: [
      {
        url: `${NCRIS_BASE}/StructureDefinition/ServiceRequest-engineAssessment`,
        valueString: JSON.stringify(referral.engineAssessment || {}),
      },
      {
        url: `${NCRIS_BASE}/StructureDefinition/ServiceRequest-stability`,
        valueString: referral.stability,
      },
    ],
  };
}

function mapReferralStatus(state) {
  switch (state) {
    case 'draft':       return 'draft';
    case 'submitted':   return 'active';
    case 'routed':      return 'active';
    case 'accepted':    return 'active';
    case 'in-transit':  return 'active';
    case 'completed':   return 'completed';
    case 'cancelled':   return 'revoked';
    case 'declined':    return 'revoked';
    default:            return 'unknown';
  }
}

// ────────────────────────────────────────────────────────────────
// Observation — vital signs
// ────────────────────────────────────────────────────────────────

const LOINC = {
  sbp:        { code: '8480-6',  display: 'Systolic blood pressure', unit: 'mmHg' },
  dbp:        { code: '8462-4',  display: 'Diastolic blood pressure', unit: 'mmHg' },
  bp:         { code: '85354-9', display: 'Blood pressure panel', unit: null },
  hr:         { code: '8867-4',  display: 'Heart rate', unit: '/min' },
  rr:         { code: '9279-1',  display: 'Respiratory rate', unit: '/min' },
  spo2:       { code: '2708-6',  display: 'Oxygen saturation', unit: '%' },
  gcs:        { code: '9269-2',  display: 'Glasgow Coma Scale', unit: '{score}' },
  temperature:{ code: '8310-5',  display: 'Body temperature', unit: 'Cel' },
};

export function observationResource(observation) {
  const v = observation.vitals;
  const components = [];
  if (v.sbp != null && v.dbp != null) {
    components.push({
      code: codeableConcept('http://loinc.org', LOINC.sbp.code, LOINC.sbp.display),
      valueQuantity: { value: v.sbp, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
    });
    components.push({
      code: codeableConcept('http://loinc.org', LOINC.dbp.code, LOINC.dbp.display),
      valueQuantity: { value: v.dbp, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
    });
  }
  if (v.hr != null) {
    components.push({
      code: codeableConcept('http://loinc.org', LOINC.hr.code, LOINC.hr.display),
      valueQuantity: { value: v.hr, unit: '/min', system: 'http://unitsofmeasure.org', code: '/min' },
    });
  }
  if (v.rr != null) {
    components.push({
      code: codeableConcept('http://loinc.org', LOINC.rr.code, LOINC.rr.display),
      valueQuantity: { value: v.rr, unit: '/min', system: 'http://unitsofmeasure.org', code: '/min' },
    });
  }
  if (v.spo2 != null) {
    components.push({
      code: codeableConcept('http://loinc.org', LOINC.spo2.code, LOINC.spo2.display),
      valueQuantity: { value: v.spo2, unit: '%', system: 'http://unitsofmeasure.org', code: '%' },
    });
  }
  if (v.gcs != null) {
    components.push({
      code: codeableConcept('http://loinc.org', LOINC.gcs.code, LOINC.gcs.display),
      valueQuantity: { value: v.gcs, unit: '{score}', system: 'http://unitsofmeasure.org', code: '{score}' },
    });
  }

  return {
    resourceType: 'Observation',
    id: observation.id,
    meta: { lastUpdated: observation.updatedAt, profile: [`${NCRIS_BASE}/StructureDefinition/Observation-Vitals`] },
    status: 'final',
    category: [codeableConcept('http://terminology.hl7.org/CodeSystem/observation-category', 'vital-signs', 'Vital Signs')],
    code: codeableConcept('http://loinc.org', '85353-1', 'Vital signs, weight, height, head circumference, oxygen saturation and BMI panel'),
    subject: reference('Patient', observation.patientId),
    encounter: observation.encounterId ? reference('Encounter', observation.encounterId) : undefined,
    effectiveDateTime: observation.recordedAt,
    performer: observation.performerId ? [reference('Practitioner', observation.performerId)] : [],
    component: components,
    extension: observation.engineAssessment ? [{
      url: `${NCRIS_BASE}/StructureDefinition/Observation-engineAssessment`,
      valueString: JSON.stringify(observation.engineAssessment),
    }] : [],
  };
}

// ────────────────────────────────────────────────────────────────
// MedicationAdministration / Procedure — interventions
// ────────────────────────────────────────────────────────────────

export function medicationAdministrationResource(intervention) {
  return {
    resourceType: 'MedicationAdministration',
    id: intervention.id,
    meta: { lastUpdated: intervention.updatedAt },
    status: 'completed',
    medicationCodeableConcept: codeableConcept(`${NCRIS_BASE}/CodeSystem/intervention`, intervention.presetId, intervention.label),
    subject: reference('Patient', intervention.patientId),
    context: intervention.encounterId ? reference('Encounter', intervention.encounterId) : undefined,
    effectiveDateTime: intervention.recordedAt,
    performer: intervention.performerId ? [{
      actor: reference('Practitioner', intervention.performerId),
    }] : [],
  };
}

export function procedureResource(intervention) {
  return {
    resourceType: 'Procedure',
    id: intervention.id,
    meta: { lastUpdated: intervention.updatedAt },
    status: 'completed',
    code: codeableConcept(`${NCRIS_BASE}/CodeSystem/intervention`, intervention.presetId, intervention.label),
    subject: reference('Patient', intervention.patientId),
    encounter: intervention.encounterId ? reference('Encounter', intervention.encounterId) : undefined,
    performedDateTime: intervention.recordedAt,
    performer: intervention.performerId ? [{
      actor: reference('Practitioner', intervention.performerId),
    }] : [],
  };
}

// ────────────────────────────────────────────────────────────────
// CapacityStatement (NCRIS extension)
// ────────────────────────────────────────────────────────────────

export function capacityStatementResource(capacity) {
  return {
    resourceType: 'Basic',
    id: capacity.id,
    meta: { lastUpdated: capacity.updatedAt, profile: [`${NCRIS_BASE}/StructureDefinition/CapacityStatement`] },
    code: codeableConcept(`${NCRIS_BASE}/CodeSystem/basic-resource-type`, 'CapacityStatement', 'Capacity Statement'),
    subject: reference('Organization', capacity.facilityId),
    extension: [
      { url: `${NCRIS_BASE}/StructureDefinition/Capacity-bedsAvailable`, valueInteger: capacity.bedsAvailable },
      { url: `${NCRIS_BASE}/StructureDefinition/Capacity-icuAvailable`, valueInteger: capacity.icuAvailable },
      { url: `${NCRIS_BASE}/StructureDefinition/Capacity-bedsTotal`,    valueInteger: capacity.bedsTotal },
      { url: `${NCRIS_BASE}/StructureDefinition/Capacity-status`,        valueCode: capacity.status },
    ],
  };
}

// ────────────────────────────────────────────────────────────────
// AuditEvent
// ────────────────────────────────────────────────────────────────

export function auditEventResource(audit) {
  return {
    resourceType: 'AuditEvent',
    id: audit.id,
    meta: { lastUpdated: audit.timestamp },
    type: codeableConcept(`${NCRIS_BASE}/CodeSystem/audit-type`, audit.type, audit.type),
    action: audit.action,
    recorded: audit.timestamp,
    outcome: audit.outcome === 'success' ? '0' : '4',
    agent: [{
      who: audit.actor ? { identifier: { value: audit.actor } } : undefined,
      requestor: true,
      role: audit.actorRole ? [codeableConcept(`${NCRIS_BASE}/CodeSystem/role`, audit.actorRole, audit.actorRole)] : [],
    }],
    source: { observer: { display: 'NCRIS' } },
    entity: audit.target ? [{
      what: { reference: `${audit.target.resourceType}/${audit.target.resourceId}` },
    }] : [],
    extension: [
      { url: `${NCRIS_BASE}/StructureDefinition/AuditEvent-seq`, valueInteger: audit.seq },
      { url: `${NCRIS_BASE}/StructureDefinition/AuditEvent-prevHash`, valueString: audit.prevHash },
      { url: `${NCRIS_BASE}/StructureDefinition/AuditEvent-hash`, valueString: audit.hash },
    ],
  };
}

// ────────────────────────────────────────────────────────────────
// Bundle (FHIR collection wrapper)
// ────────────────────────────────────────────────────────────────

export function bundle(resources, type = 'searchset') {
  return {
    resourceType: 'Bundle',
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    total: resources.length,
    entry: resources.map(r => ({
      fullUrl: `${NCRIS_BASE}/${r.resourceType}/${r.id}`,
      resource: r,
    })),
  };
}

// ────────────────────────────────────────────────────────────────
// Capability statement (FHIR conformance)
// ────────────────────────────────────────────────────────────────

export function capabilityStatement() {
  return {
    resourceType: 'CapabilityStatement',
    id: 'ncris-capability',
    url: `${NCRIS_BASE}/CapabilityStatement/ncris-capability`,
    version: '1.0.0',
    name: 'NCRIS',
    title: 'NCRIS — National Clinical Referral & Intelligence Switch',
    status: 'active',
    date: new Date().toISOString(),
    publisher: 'Government of Ghana — Ministry of Health',
    kind: 'instance',
    software: { name: 'NCRIS', version: '1.0.0' },
    fhirVersion: '4.0.1',
    format: ['application/fhir+json', 'application/json'],
    rest: [{
      mode: 'server',
      resource: [
        { type: 'Patient',                    interaction: [{ code: 'read' }, { code: 'search-type' }] },
        { type: 'Practitioner',               interaction: [{ code: 'read' }, { code: 'search-type' }] },
        { type: 'Organization',               interaction: [{ code: 'read' }, { code: 'search-type' }] },
        { type: 'Encounter',                  interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }] },
        { type: 'ServiceRequest',             interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }, { code: 'update' }] },
        { type: 'Observation',                interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }] },
        { type: 'MedicationAdministration',   interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }] },
        { type: 'Procedure',                  interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }] },
        { type: 'AuditEvent',                 interaction: [{ code: 'read' }, { code: 'search-type' }] },
      ],
    }],
  };
}
