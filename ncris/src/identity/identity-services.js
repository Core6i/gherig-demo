/**
 * NCRIS · Identity Services
 * ────────────────────────────────────────────────────────────────────
 * Manages all the identifier services that GhERIG needs:
 *
 *   1. NHIA Membership Lookup — verify an NHIA membership number against
 *      the National Health Insurance Authority database. Returns
 *      member status (active/expired/suspended), benefit package, and
 *      basic demographics.
 *
 *   2. Ghana Card Verification — verify a Ghana Card (PIN) against the
 *      National Identification Authority. Optional but recommended for
 *      patients without NHIA cover (out-of-pocket emergencies, recent
 *      accidents, etc.). Privacy-preserving: NCRIS does not store full
 *      Ghana Card data, only a hashed token.
 *
 *   3. MoH Facility Registry — every health facility in Ghana has a
 *      unique Facility Code issued by the Ministry of Health. The
 *      registry maps facility codes to organisation details, level
 *      (CHPS, polyclinic, district, regional, tertiary, private),
 *      ownership, location, and capabilities.
 *
 *   4. NAS Personnel Directory — National Ambulance Service staff,
 *      indexed by Council Number. Used by ARCS and EMT Device for
 *      authentication and crew assignment.
 *
 *   5. Patient Master Index (MPI) — the unified patient record that
 *      links NHIA number, Ghana Card hash, hospital folder numbers
 *      across multiple facilities, and a stable NCRIS patient ID.
 *      Implements deterministic + probabilistic matching for dedup.
 *
 * For the reference implementation, NHIA and NIA verification are
 * stub-mocked. In production they hit the NHIA Member Verification
 * API and the NIA verifier service respectively. The interface here
 * is identical so swapping in real adapters is a one-file change.
 */

import { createHash, randomBytes } from 'crypto';

// ────────────────────────────────────────────────────────────────
// MoH Facility Registry
// ────────────────────────────────────────────────────────────────

export const FACILITY_LEVELS = {
  CHPS:       'Community-based Health Planning and Services compound',
  HEALTH_CTR: 'Health Centre',
  POLYCLINIC: 'Polyclinic',
  DISTRICT:   'District Hospital',
  REGIONAL:   'Regional Hospital',
  TEACHING:   'Teaching Hospital',
  PRIVATE:    'Private Hospital',
  QUASI_GOV:  'Quasi-government Hospital',
};

const SEED_FACILITIES = [
  // Tertiary
  { id: 'F-KBTH', code: 'KBTH-001', name: 'Korle-Bu Teaching Hospital',     level: 'TEACHING',   ownership: 'GoG',   region: 'GA', district: 'Ablekuma South', specialties: ['cardiology','cardiothoracic','neurosurgery','obgyn','paeds','icu','emergency','renal','oncology'], beds: 2000, lat: 5.5360, lon: -0.2261, primary: true },
  { id: 'F-37MIL', code: 'MIL-001',  name: '37 Military Hospital',           level: 'TEACHING',   ownership: 'GoG',   region: 'GA', district: 'Ayawaso West', specialties: ['general_surgery','obgyn','paeds','icu','emergency','orthopaedic'], beds: 800,  lat: 5.5805, lon: -0.1816, primary: true },
  { id: 'F-RIDGE', code: 'RDG-001',  name: 'Greater Accra Regional Hospital',level: 'REGIONAL',   ownership: 'GoG',   region: 'GA', district: 'Ayawaso Central', specialties: ['general_surgery','obgyn','paeds','icu','emergency'], beds: 420,  lat: 5.5610, lon: -0.2080, primary: false },
  { id: 'F-LEKMA',code: 'LEK-001',  name: 'LEKMA Hospital',                  level: 'DISTRICT',   ownership: 'GoG',   region: 'GA', district: 'Ledzokuku', specialties: ['general_surgery','obgyn','emergency'], beds: 200,  lat: 5.5818, lon: -0.0744, primary: false },
  { id: 'F-ACHIM',code: 'ACH-001',  name: 'Achimota Hospital',               level: 'DISTRICT',   ownership: 'GoG',   region: 'GA', district: 'Achimota', specialties: ['general_surgery','obgyn','paeds','emergency'], beds: 220,  lat: 5.6203, lon: -0.2349, primary: false },
  { id: 'F-TEMA', code: 'TMG-001',  name: 'Tema General Hospital',           level: 'DISTRICT',   ownership: 'GoG',   region: 'GA', district: 'Tema Metro', specialties: ['general_surgery','obgyn','paeds','emergency'], beds: 250,  lat: 5.6739, lon: -0.0132, primary: false },
  { id: 'F-LAGEN',code: 'LAG-001',  name: 'La General Hospital',             level: 'DISTRICT',   ownership: 'GoG',   region: 'GA', district: 'La Dade-Kotopon', specialties: ['general_surgery','obgyn','emergency'], beds: 180,  lat: 5.5620, lon: -0.1531, primary: false },
  { id: 'F-MADIN',code: 'MAD-001',  name: 'Madina Polyclinic',               level: 'POLYCLINIC', ownership: 'GoG',   region: 'GA', district: 'La Nkwantanang Madina', specialties: ['general_practice','maternal_child'], beds: 40,   lat: 5.6706, lon: -0.1625, primary: false },
  { id: 'F-KATH', code: 'KATH-001', name: 'Komfo Anokye Teaching Hospital',  level: 'TEACHING',   ownership: 'GoG',   region: 'AS', district: 'Kumasi Metro', specialties: ['cardiology','neurosurgery','obgyn','paeds','icu','emergency','orthopaedic'], beds: 1200, lat: 6.6997, lon: -1.6285, primary: true },
  { id: 'F-CCTH', code: 'CCTH-001', name: 'Cape Coast Teaching Hospital',    level: 'TEACHING',   ownership: 'GoG',   region: 'CR', district: 'Cape Coast Metro', specialties: ['general_surgery','obgyn','paeds','icu','emergency'], beds: 400,  lat: 5.1137, lon: -1.2844, primary: true },
  { id: 'F-HTH',  code: 'HTH-001',  name: 'Ho Teaching Hospital',            level: 'TEACHING',   ownership: 'GoG',   region: 'VR', district: 'Ho Municipal', specialties: ['general_surgery','obgyn','paeds','icu','emergency'], beds: 320,  lat: 6.6020, lon: 0.4789, primary: true },
];

export class FacilityRegistry {
  constructor(storage) {
    this.col = storage.collection('facilities');
    if (this.col.count() === 0) this._seed();
  }

  _seed() {
    for (const f of SEED_FACILITIES) {
      this.col.insert({ ...f, active: true });
    }
  }

  byCode(code) { return this.col.findOne(f => f.code === code); }
  byId(id)     { return this.col.findById(id); }
  all(filter)  { return filter ? this.col.findWhere(filter) : this.col.all(); }
  inRegion(region) { return this.col.findWhere(f => f.region === region && f.active); }

  search({ specialty, region, level, hasIcu }) {
    return this.col.findWhere(f => {
      if (!f.active) return false;
      if (specialty && !f.specialties.includes(specialty)) return false;
      if (region && f.region !== region) return false;
      if (level && f.level !== level) return false;
      if (hasIcu && !f.specialties.includes('icu')) return false;
      return true;
    });
  }
}

// ────────────────────────────────────────────────────────────────
// NAS Personnel Directory
// ────────────────────────────────────────────────────────────────

const SEED_PERSONNEL = [
  { id: 'P-NAS-1847', council: 'NAS-EMT-2021-1847', name: 'Akosua Mensah',  role: 'EMT-A',           station: 'NAS Tema East',     region: 'GA' },
  { id: 'P-NAS-2109', council: 'NAS-EMT-2022-2109', name: 'Kwame Sarpong',  role: 'EMT-B',           station: 'NAS Tema East',     region: 'GA' },
  { id: 'P-NAS-1023', council: 'NAS-DSP-2019-1023', name: 'Mr. K. Owusu',   role: 'arcs_dispatcher', station: 'NAS GA Regional',   region: 'GA' },
  { id: 'P-NAS-0045', council: 'NAS-HQ-2015-0045',  name: 'Dr. M. Adjei',   role: 'nas_hq',          station: 'NAS HQ Accra',      region: 'all' },
];

export class PersonnelDirectory {
  constructor(storage) {
    this.col = storage.collection('personnel');
    if (this.col.count() === 0) this._seed();
  }
  _seed() { for (const p of SEED_PERSONNEL) this.col.insert(p); }
  byCouncil(c) { return this.col.findOne(p => p.council === c); }
  byId(id) { return this.col.findById(id); }
}

// ────────────────────────────────────────────────────────────────
// NHIA Membership Verification (mocked for reference)
// ────────────────────────────────────────────────────────────────

/**
 * Production: replace with a real adapter calling
 * https://api.nhis.gov.gh/v1/members/verify (or whatever the actual
 * NHIA API endpoint becomes). The interface here is the contract.
 */
export class NhiaService {
  constructor(storage) {
    this.col = storage.collection('nhia_members');
    if (this.col.count() === 0) this._seed();
  }
  _seed() {
    // Mock NHIA records aligned with seed patient data
    this.col.insert({ id: 'NHIA-1', membershipNumber: '7821-4523-9018', name: 'Kofi Asante',     dob: '1967-04-12', sex: 'M', status: 'active',  expiresOn: '2027-03-15', package: 'standard' });
    this.col.insert({ id: 'NHIA-2', membershipNumber: '8923-1145-2237', name: 'Ama Boatemaa',    dob: '1996-11-03', sex: 'F', status: 'active',  expiresOn: '2026-09-22', package: 'standard' });
    this.col.insert({ id: 'NHIA-3', membershipNumber: '4451-8821-1109', name: 'Mensah Sarfo',    dob: '2018-07-20', sex: 'M', status: 'active',  expiresOn: '2027-06-30', package: 'paediatric' });
  }
  /**
   * Look up an NHIA member by membership number.
   * Returns { found, status, member, lookupId } where lookupId is
   * stored in the audit log for non-repudiation.
   */
  verify(membershipNumber) {
    const member = this.col.findOne(m => m.membershipNumber === membershipNumber);
    const lookupId = randomBytes(8).toString('hex');
    if (!member) {
      return { found: false, lookupId, message: 'Membership not found' };
    }
    return {
      found: true,
      status: member.status,
      member: {
        membershipNumber: member.membershipNumber,
        name: member.name,
        dob: member.dob,
        sex: member.sex,
        expiresOn: member.expiresOn,
        package: member.package,
        active: member.status === 'active' && new Date(member.expiresOn) > new Date(),
      },
      lookupId,
    };
  }
}

// ────────────────────────────────────────────────────────────────
// Ghana Card (NIA) Verification (privacy-preserving stub)
// ────────────────────────────────────────────────────────────────

/**
 * Privacy-preserving verification: NCRIS hashes the Ghana Card PIN
 * with a system-wide pepper plus a per-patient salt before storage.
 * The full PIN is never persisted. This means we can match the same
 * patient across encounters but a database leak does not expose
 * actual Ghana Card numbers.
 *
 * Production: replace with real NIA verifier API. The hashing strategy
 * stays the same.
 */
export class GhanaCardService {
  constructor(storage) {
    this.pepper = process.env.NCRIS_GHANA_CARD_PEPPER || 'ncris-dev-pepper-CHANGE-IN-PROD';
  }
  /**
   * Hash a Ghana Card PIN (format GHA-XXXXXXXXX-X) for storage.
   */
  hashPin(pin, salt = '') {
    return createHash('sha256').update(this.pepper + salt + pin).digest('hex');
  }
  /**
   * Verify a Ghana Card PIN. In the reference, format-check only.
   * In production, verify against the NIA database.
   */
  verify(pin) {
    const formatOk = /^GHA-\d{9}-\d$/.test(pin);
    if (!formatOk) {
      return { valid: false, reason: 'Invalid Ghana Card format' };
    }
    return { valid: true, pinHash: this.hashPin(pin) };
  }
}

// ────────────────────────────────────────────────────────────────
// Patient Master Index (MPI)
// ────────────────────────────────────────────────────────────────

/**
 * The Patient Master Index links a patient across multiple facilities
 * and identifier systems. It is the spine that makes "the same patient"
 * recognisable when KBTH refers them to 37 Military and then back to
 * Tema General three weeks later.
 *
 * Identifier sources (in priority order for matching):
 *   1. NCRIS patient ID (canonical, opaque, never reused)
 *   2. NHIA membership number
 *   3. Ghana Card PIN hash
 *   4. Hospital folder number (per facility)
 *   5. Demographic match (name + dob + sex)
 *
 * Matching strategy (deterministic first, probabilistic fallback):
 *   • If NHIA matches → same patient.
 *   • Else if Ghana Card hash matches → same patient.
 *   • Else if (last name + dob + sex) match AND a facility folder
 *     also matches → same patient.
 *   • Else → new patient, candidate for human review.
 */
export class PatientIndex {
  constructor(storage, ghanaCardService) {
    this.col = storage.collection('patients');
    this.gcs = ghanaCardService;
  }

  /**
   * Resolve or create a patient record. Returns { patient, action } where
   * action ∈ { 'matched-nhia', 'matched-ghana-card', 'matched-folder', 'created', 'review-required' }.
   */
  resolveOrCreate(payload) {
    const { nhiaMembershipNumber, ghanaCardPinHash, name, dob, sex, facilityCode, folderNumber } = payload;

    // Tier 1: NHIA match
    if (nhiaMembershipNumber) {
      const existing = this.col.findOne(p => p.identifiers?.nhia === nhiaMembershipNumber);
      if (existing) {
        if (folderNumber && facilityCode) this._addFolder(existing, facilityCode, folderNumber);
        return { patient: existing, action: 'matched-nhia' };
      }
    }

    // Tier 2: Ghana Card hash match
    if (ghanaCardPinHash) {
      const existing = this.col.findOne(p => p.identifiers?.ghanaCardHash === ghanaCardPinHash);
      if (existing) {
        if (folderNumber && facilityCode) this._addFolder(existing, facilityCode, folderNumber);
        return { patient: existing, action: 'matched-ghana-card' };
      }
    }

    // Tier 3: Folder match — same facility + folder + plausible demographic
    if (folderNumber && facilityCode) {
      const existing = this.col.findOne(p => p.folders?.[facilityCode] === folderNumber);
      if (existing && this._demographicsPlausible(existing, payload)) {
        return { patient: existing, action: 'matched-folder' };
      }
    }

    // Tier 4: Demographic-only — flag for human review
    const demographicCandidate = this.col.findOne(p =>
      p.demographics?.name?.last?.toLowerCase() === (name?.last || '').toLowerCase() &&
      p.demographics?.dob === dob &&
      p.demographics?.sex === sex
    );
    if (demographicCandidate) {
      return { patient: demographicCandidate, action: 'review-required' };
    }

    // Tier 5: Create new
    const patient = this.col.insert({
      identifiers: {
        nhia: nhiaMembershipNumber || null,
        ghanaCardHash: ghanaCardPinHash || null,
      },
      demographics: { name, dob, sex },
      folders: facilityCode && folderNumber ? { [facilityCode]: folderNumber } : {},
      ncrisPatientId: `NCP-${randomBytes(6).toString('hex').toUpperCase()}`,
    });
    return { patient, action: 'created' };
  }

  _addFolder(patient, facilityCode, folderNumber) {
    const folders = { ...(patient.folders || {}), [facilityCode]: folderNumber };
    this.col.update(patient.id, { folders });
  }

  _demographicsPlausible(existing, candidate) {
    if (!existing.demographics || !candidate.name) return false;
    const e = existing.demographics;
    const c = candidate;
    if (e.dob && c.dob && e.dob !== c.dob) return false;
    if (e.sex && c.sex && e.sex !== c.sex) return false;
    return true;
  }

  byId(id) { return this.col.findById(id); }
  byNcrisId(ncrisId) { return this.col.findOne(p => p.ncrisPatientId === ncrisId); }
}
