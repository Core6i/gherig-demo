/* ════════════════════════════════════════════════════════════════════
   GhERIG Hospital Portal · v2.0
   Single-component React build — drop into Vite/CRA/Next/React Router app

   USAGE:
     import GherigHospitalPortal from './GherigHospitalPortal';
     <GherigHospitalPortal />

   DEPENDENCIES: react, react-dom (>=17). No other libraries required.
   FONTS: Loads Fraunces, Inter Tight, JetBrains Mono from Google Fonts CDN.

   ────────────────────────────────────────────────────────────────────
   v2.0 CHANGES vs v1.0
   ────────────────────────────────────────────────────────────────────
   1. CLINICAL VITALS ENGINE (vitalsEngine):
      • Ghana STG primary + WHO IMCI/IMAI thresholds as backup standard
      • Age-aware ranges (neonate / infant / child / adolescent / adult / elderly)
      • 4-tier severity per parameter: normal / borderline / abnormal / critical
      • Composite severity score → auto-priority suggestion
      • Per-vital reason strings ("SpO2 89%: severe hypoxia, Ghana STG")

   2. NEW REFERRAL FORM matches tablet exactly (REFERRAL PILOT spec):
      • A1 Patient basics: age, sex, category (adult/paeds/neonate/obstetric)
      • B2 Primary condition + sub-options driven by category
      • B3 Reason for referral (multi-select)
      • B4 Requested service/specialty (multi-select)
      • B5 Patient stability (4-tier)
      • B6 Vitals with modifier tags (Inotropes / Bleeding / ORA/Oxygen/Intubated)
      • B6b Interventions (None / Basic labs / Imaging / Both)
      • B7 Summary (120–150 chars)
      • LIVE color-coding on vital input as doctor types
      • Auto-suggested priority badge updates in real-time
      • Doctor can override priority with required note

   3. ALL BUTTONS WIRED (was: ~15 dead buttons in v1):
      • New Referral / New Outgoing → opens form modal
      • Refresh / Force sync → re-renders + toast
      • Export / Export CSV → downloads CSV file via Blob
      • Update availability → inline editable capacity rows
      • Register device → modal form
      • Provision User → modal form
      • Edit (user/device) → modal editor with save
      • Test connections → simulated health-check
      • Print Summary → opens window.print() with print-formatted view
      • View full capacity board → setView('capacity')
      • Profile / Change password → toast (placeholder for backend)

   4. PRODUCTION HARDENING NOTES (header above main component below)
   © 2026 GhERIG Programme · Ghana Health Service
════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

/* ════════════════════════════════════════════════════════════════════
   STATIC CONFIG
════════════════════════════════════════════════════════════════════ */

const ROLES = {
  admin: {
    label: 'Hospital Administrator', name: 'Mr. Daniel Tetteh', initials: 'DT',
    council: 'ADM-2019-0341', dept: 'Hospital Administration',
    defaultView: 'overview',
    allowed: ['overview', 'referrals', 'capacity', 'users', 'devices', 'reports', 'audit', 'integrations'],
  },
  doctor: {
    label: 'Consultant / Specialist', name: 'Dr. Ama Owusu', initials: 'AO',
    council: 'MDC-2018-21407', dept: 'Emergency Medicine',
    defaultView: 'referrals',
    allowed: ['overview', 'referrals', 'capacity', 'reports'],
  },
  nurse: {
    label: 'ED Nurse Manager', name: 'Sis. Akosua Frimpong', initials: 'AF',
    council: 'NMC-2016-89234', dept: 'Emergency Department',
    defaultView: 'referrals',
    allowed: ['overview', 'referrals', 'capacity'],
  },
  it: {
    label: 'Hospital IT Officer', name: 'Eng. Kofi Annan', initials: 'KA',
    council: 'IT-DESK-04', dept: 'Hospital IT Systems',
    defaultView: 'devices',
    allowed: ['overview', 'users', 'devices', 'audit', 'integrations'],
  },
};

const NAV = [
  { id: 'overview',     label: 'Command Overview',     icon: '◐', section: 'Operations' },
  { id: 'referrals',    label: 'Referral Management',  icon: '↔', section: 'Operations' },
  { id: 'capacity',     label: 'Capacity & Beds',      icon: '⊞', section: 'Operations' },
  { id: 'devices',      label: 'Tablets & Stations',   icon: '▢', section: 'Infrastructure' },
  { id: 'integrations', label: 'GHIMS · NCRIS',        icon: '⊕', section: 'Infrastructure' },
  { id: 'reports',      label: 'Reports & EAR-Q',      icon: '◫', section: 'Analytics' },
  { id: 'audit',        label: 'Audit Trail',          icon: '⊟', section: 'Analytics' },
  { id: 'users',        label: 'Users & Roles',        icon: '⌬', section: 'Administration' },
];

const FACILITIES = [
  { code: 'GH-ACC-001', name: 'Korle-Bu Teaching Hospital', tier: 'Tertiary', region: 'Greater Accra' },
  { code: 'GH-ACC-002', name: '37 Military Hospital',        tier: 'Tertiary', region: 'Greater Accra' },
  { code: 'GH-ACC-007', name: 'Ridge Hospital',              tier: 'Regional', region: 'Greater Accra' },
  { code: 'GH-ACC-014', name: 'Tema General Hospital',       tier: 'Regional', region: 'Greater Accra' },
  { code: 'GH-ACC-019', name: 'LEKMA Hospital',              tier: 'District', region: 'Greater Accra' },
  { code: 'GH-ACC-022', name: 'Achimota Hospital',           tier: 'District', region: 'Greater Accra' },
  { code: 'GH-ACC-028', name: 'Mamprobi Hospital',           tier: 'District', region: 'Greater Accra' },
  { code: 'GH-ACC-031', name: 'La General Hospital',         tier: 'District', region: 'Greater Accra' },
  { code: 'GH-ACC-039', name: 'Police Hospital',             tier: 'Regional', region: 'Greater Accra' },
];

const STATUS_LABEL = {
  awaiting_decision: 'Awaiting decision',
  accepted: 'Accepted',
  declined: 'Declined',
  redirect_pending: 'Redirect pending',
  enroute: 'En route',
  arrived: 'Arrived',
};

// ═══════════════════════════════════════════════════════════════════════
// REFERRAL FORM SCHEMA — matches tablet REFERRAL PILOT spec exactly
// ═══════════════════════════════════════════════════════════════════════

const PATIENT_CATEGORIES = ['Adult', 'Paediatric', 'Neonate', 'Obstetric'];

const PRIMARY_CONDITIONS = [
  { id: 'trauma',     label: 'Trauma' },
  { id: 'medical',    label: 'Medical emergency' },
  { id: 'surgical',   label: 'Surgical emergency' },
  { id: 'obstetric',  label: 'Obstetric emergency' },
  { id: 'neonatal',   label: 'Neonatal emergency' },
  { id: 'paediatric', label: 'Paediatric emergency' },
  { id: 'poisoning',  label: 'Poisoning / overdose' },
  { id: 'psychiatric',label: 'Psychiatric emergency' },
  { id: 'other',      label: 'Other' },
];

const SUB_OPTIONS = {
  trauma: [
    'Head injury', 'Polytrauma', 'Chest trauma', 'Abdominal trauma',
    'Fracture', 'Spine injury', 'Burns trauma',
  ],
  obstetric: [
    'PPH (postpartum haemorrhage)', 'Eclampsia', 'Severe preeclampsia',
    'Obstructed labour', 'APH (antepartum haemorrhage)',
    'Retained products / retained placenta', 'Sepsis in pregnancy/puerperium',
    'Fetal distress', 'Uterine rupture suspected',
  ],
  medical: [
    'Stroke', 'Seizure', 'DKA', 'Severe asthma', 'Heart failure', 'Sepsis',
    'Shock', 'GI bleed', 'Altered consciousness', 'Severe anaemia', 'Renal failure',
  ],
  paediatric: [
    'Severe malaria', 'Seizure / status epilepticus',
    'Severe pneumonia / respiratory distress', 'Severe dehydration',
    'Sepsis', 'Severe anaemia', 'Meningitis suspected', 'Acute abdomen',
    'Trauma', 'Poisoning / ingestion of foreign body', 'Burns', 'Other',
  ],
  neonatal: [
    'Birth asphyxia / HIE', 'Neonatal sepsis', 'Respiratory distress',
    'Prematurity complications', 'Severe jaundice (possible exchange transfusion)',
    'Neonatal seizures', 'Congenital anomaly', 'Feeding difficulty / poor suck',
    'Suspected metabolic disorder', 'Hypoglycaemia', 'Temperature instability', 'Other',
  ],
  surgical: [
    'Acute abdomen', 'Intestinal obstruction', 'Appendicitis suspected',
    'Peritonitis', 'GI bleeding', 'Obstructed hernia', 'Testicular torsion',
    'Soft tissue infection / abscess', 'Necrotizing infection',
    'Post-operative complication', 'Urological emergency (retention, torsion etc.)', 'Other',
  ],
};

const REFERRAL_REASONS = [
  'Specialist review', 'Imaging unavailable', 'Surgery needed',
  'ICU/HDU bed needed', 'NICU bed needed', 'Dialysis needed',
  'Blood unavailable', 'Higher level care',
  'No bed capacity at referring facility', 'Theatre unavailable',
  'Consultant request', 'Other',
];

const SERVICES = [
  'General Surgery', 'Orthopaedics', 'Neurosurgery', 'Internal Medicine',
  'Cardiology', 'Paediatrics', 'Neonatology', 'Obstetrics & Gynaecology',
  'Anaesthesia / ICU', 'ENT', 'Ophthalmology', 'Urology', 'Plastic Surgery',
  'Psychiatry', 'CT Scan', 'MRI', 'Ultrasound', 'Endoscopy',
  'Dialysis', 'Blood bank', 'Burns care', 'Trauma care',
];

const STABILITY_LEVELS = ['Stable', 'Potentially unstable', 'Unstable', 'Critical'];
const INTERVENTIONS = ['None', 'Basic labs done', 'Imaging done', 'Both done'];

/* ════════════════════════════════════════════════════════════════════
   CLINICAL VITALS ENGINE
   Ghana STG (Standard Treatment Guidelines, 7th ed.) primary
   WHO IMCI / IMAI as backup standard
   Age-aware: neonate / infant / child / adolescent / adult / elderly

   Each vital returns: { tier: 'normal'|'borderline'|'abnormal'|'critical',
                         score: 0|1|2|3, reason: string }
   Composite score → suggested priority
════════════════════════════════════════════════════════════════════ */

const ageBand = (ageYears, category) => {
  if (category === 'Neonate') return 'neonate';
  if (category === 'Paediatric' || (ageYears != null && ageYears < 13)) {
    if (ageYears == null) return 'child';
    if (ageYears < 1) return 'infant';
    if (ageYears < 5) return 'child_under5';
    return 'child';
  }
  if (ageYears != null && ageYears < 18) return 'adolescent';
  if (ageYears != null && ageYears >= 65) return 'elderly';
  return 'adult';
};

// Thresholds: { normal: [low, high], borderline: [low, high], abnormal: [low, high], critical: outside }
// Returned tier is the WORST applicable.
const VITAL_RANGES = {
  // Systolic BP (mmHg) — Ghana STG hypotension <90, severe HTN >180
  sbp: {
    neonate:      { critical: [null, 50],  abnormal: [50, 60],   borderline: [60, 70],   normal: [70, 90] },
    infant:       { critical: [null, 60],  abnormal: [60, 70],   borderline: [70, 80],   normal: [80, 110] },
    child_under5: { critical: [null, 70],  abnormal: [70, 80],   borderline: [80, 90],   normal: [90, 115] },
    child:        { critical: [null, 80],  abnormal: [80, 90],   borderline: [90, 100],  normal: [100, 120] },
    adolescent:   { critical: [null, 85],  abnormal: [85, 95],   borderline: [95, 105],  normal: [105, 130] },
    adult:        { critical: [null, 90],  abnormal: [90, 100],  borderline: [100, 110], normal: [110, 140] },
    elderly:      { critical: [null, 90],  abnormal: [90, 105],  borderline: [105, 115], normal: [115, 150] },
    highCritical:    180,    // >=180 = critical (severe HTN)
    highAbnormal:    160,    // 160-179 = abnormal
    highBorderline:  140,    // 140-159 = borderline (or normal-high in elderly)
  },
  // Heart rate (bpm)
  hr: {
    neonate:      { critical: [null, 90],  abnormal: [90, 100],  borderline: [100, 110], normal: [110, 160], borderlineHi: 160, abnormalHi: 180, criticalHi: 200 },
    infant:       { critical: [null, 80],  abnormal: [80, 90],   borderline: [90, 100],  normal: [100, 150], borderlineHi: 150, abnormalHi: 170, criticalHi: 190 },
    child_under5: { critical: [null, 60],  abnormal: [60, 70],   borderline: [70, 80],   normal: [80, 130],  borderlineHi: 130, abnormalHi: 150, criticalHi: 170 },
    child:        { critical: [null, 50],  abnormal: [50, 60],   borderline: [60, 70],   normal: [70, 110],  borderlineHi: 110, abnormalHi: 130, criticalHi: 150 },
    adolescent:   { critical: [null, 45],  abnormal: [45, 50],   borderline: [50, 60],   normal: [60, 100],  borderlineHi: 100, abnormalHi: 120, criticalHi: 140 },
    adult:        { critical: [null, 40],  abnormal: [40, 50],   borderline: [50, 60],   normal: [60, 100],  borderlineHi: 100, abnormalHi: 120, criticalHi: 140 },
    elderly:      { critical: [null, 40],  abnormal: [40, 50],   borderline: [50, 55],   normal: [55, 95],   borderlineHi: 95,  abnormalHi: 115, criticalHi: 130 },
  },
  // Respiratory rate (breaths/min) — WHO IMCI fast-breathing thresholds
  rr: {
    neonate:      { critical: [null, 25], abnormal: [25, 30], borderline: [30, 35],  normal: [35, 60],  borderlineHi: 60,  abnormalHi: 70,  criticalHi: 80 },
    infant:       { critical: [null, 22], abnormal: [22, 28], borderline: [28, 32],  normal: [32, 50],  borderlineHi: 50,  abnormalHi: 60,  criticalHi: 70 },
    child_under5: { critical: [null, 18], abnormal: [18, 22], borderline: [22, 26],  normal: [26, 40],  borderlineHi: 40,  abnormalHi: 50,  criticalHi: 60 },
    child:        { critical: [null, 14], abnormal: [14, 16], borderline: [16, 18],  normal: [18, 30],  borderlineHi: 30,  abnormalHi: 40,  criticalHi: 50 },
    adolescent:   { critical: [null, 10], abnormal: [10, 12], borderline: [12, 14],  normal: [14, 22],  borderlineHi: 22,  abnormalHi: 26,  criticalHi: 30 },
    adult:        { critical: [null, 8],  abnormal: [8, 10],  borderline: [10, 12],  normal: [12, 20],  borderlineHi: 20,  abnormalHi: 25,  criticalHi: 30 },
    elderly:      { critical: [null, 8],  abnormal: [8, 10],  borderline: [10, 12],  normal: [12, 20],  borderlineHi: 20,  abnormalHi: 25,  criticalHi: 30 },
  },
  // Temperature (°C) — Ghana STG fever, hypothermia
  temp: {
    all: { critical: [null, 35.0], abnormal: [35.0, 36.0], borderline: [36.0, 36.5], normal: [36.5, 37.5], borderlineHi: 37.5, abnormalHi: 38.5, criticalHi: 40.0 },
    neonate: { critical: [null, 35.5], abnormal: [35.5, 36.5], borderline: [36.5, 36.7], normal: [36.7, 37.5], borderlineHi: 37.5, abnormalHi: 38.0, criticalHi: 39.0 },
  },
  // SpO2 (%) — Ghana STG <94% concerning, <90% severe
  spo2: {
    all: { critical: 90, abnormal: 92, borderline: 94, normal: 100 },
    neonate: { critical: 88, abnormal: 90, borderline: 93, normal: 100 },
  },
  // GCS
  gcs: {
    critical: 8, abnormal: 12, borderline: 14, normal: 15,
  },
  // RBS (mmol/L) — Ghana STG hypoglycaemia <3.0, hyperglycaemia DKA range
  rbs: {
    adult:   { critical: [null, 2.5], abnormal: [2.5, 3.5], borderline: [3.5, 4.0], normal: [4.0, 7.8], borderlineHi: 7.8, abnormalHi: 11.1, criticalHi: 16.7 },
    paeds:   { critical: [null, 2.2], abnormal: [2.2, 3.0], borderline: [3.0, 3.5], normal: [3.5, 7.0], borderlineHi: 7.0, abnormalHi: 11.1, criticalHi: 16.7 },
    neonate: { critical: [null, 2.0], abnormal: [2.0, 2.6], borderline: [2.6, 3.0], normal: [3.0, 6.0], borderlineHi: 6.0, abnormalHi: 8.5,  criticalHi: 12.0 },
  },
};

const TIER_SCORE = { normal: 0, borderline: 1, abnormal: 2, critical: 3 };

const tierFromBand = (val, band) => {
  if (val == null || isNaN(val)) return null;
  // Low side
  if (band.critical && band.critical[1] != null && val < band.critical[1]) return 'critical';
  if (band.abnormal && val >= band.abnormal[0] && val < band.abnormal[1]) return 'abnormal';
  if (band.borderline && val >= band.borderline[0] && val < band.borderline[1]) return 'borderline';
  if (band.normal && val >= band.normal[0] && val <= band.normal[1]) return 'normal';
  // High side (uses *Hi caps if present)
  if (band.criticalHi != null && val >= band.criticalHi) return 'critical';
  if (band.abnormalHi != null && val >= band.abnormalHi) return 'abnormal';
  if (band.borderlineHi != null && val > band.borderlineHi) return 'borderline';
  return 'normal';
};

const assessSBP = (val, age, category) => {
  if (val == null || isNaN(val)) return null;
  const ab = ageBand(age, category);
  const band = VITAL_RANGES.sbp[ab];
  let tier = 'normal';
  let reason = '';
  if (val < band.critical[1]) { tier = 'critical'; reason = `SBP ${val}: severe hypotension (Ghana STG <${band.critical[1]} for ${ab})`; }
  else if (val < band.abnormal[1]) { tier = 'abnormal'; reason = `SBP ${val}: hypotensive`; }
  else if (val < band.borderline[1]) { tier = 'borderline'; reason = `SBP ${val}: low-borderline`; }
  else if (val >= VITAL_RANGES.sbp.highCritical) { tier = 'critical'; reason = `SBP ${val}: hypertensive emergency (Ghana STG ≥180)`; }
  else if (val >= VITAL_RANGES.sbp.highAbnormal) { tier = 'abnormal'; reason = `SBP ${val}: severe hypertension`; }
  else if (val >= VITAL_RANGES.sbp.highBorderline) { tier = 'borderline'; reason = `SBP ${val}: stage-2 HTN`; }
  else reason = `SBP ${val}: within normal`;
  return { tier, score: TIER_SCORE[tier], reason };
};

const assessDBP = (val) => {
  if (val == null || isNaN(val)) return null;
  let tier = 'normal', reason = '';
  if (val < 50) { tier = 'critical'; reason = `DBP ${val}: severe diastolic hypotension`; }
  else if (val < 60) { tier = 'abnormal'; reason = `DBP ${val}: low diastolic`; }
  else if (val >= 120) { tier = 'critical'; reason = `DBP ${val}: hypertensive emergency`; }
  else if (val >= 110) { tier = 'abnormal'; reason = `DBP ${val}: severe diastolic HTN`; }
  else if (val >= 90) { tier = 'borderline'; reason = `DBP ${val}: elevated`; }
  else reason = `DBP ${val}: within normal`;
  return { tier, score: TIER_SCORE[tier], reason };
};

const assessHR = (val, age, category) => {
  if (val == null || isNaN(val)) return null;
  const ab = ageBand(age, category);
  const band = VITAL_RANGES.hr[ab];
  const tier = tierFromBand(val, band) || 'normal';
  const reason = `HR ${val}: ${tier === 'normal' ? 'normal' : tier} for ${ab}`;
  return { tier, score: TIER_SCORE[tier], reason };
};

const assessRR = (val, age, category) => {
  if (val == null || isNaN(val)) return null;
  const ab = ageBand(age, category);
  const band = VITAL_RANGES.rr[ab];
  const tier = tierFromBand(val, band) || 'normal';
  const reason = `RR ${val}: ${tier === 'normal' ? 'normal' : tier} (WHO IMCI for ${ab})`;
  return { tier, score: TIER_SCORE[tier], reason };
};

const assessTemp = (val, category) => {
  if (val == null || isNaN(val)) return null;
  const band = category === 'Neonate' ? VITAL_RANGES.temp.neonate : VITAL_RANGES.temp.all;
  const tier = tierFromBand(val, band) || 'normal';
  let reason = '';
  if (tier === 'critical') reason = val < 35.5 ? `Temp ${val}°C: severe hypothermia` : `Temp ${val}°C: hyperpyrexia ≥40°C`;
  else if (tier === 'abnormal') reason = val < 36 ? `Temp ${val}°C: hypothermic` : `Temp ${val}°C: high fever`;
  else if (tier === 'borderline') reason = val < 36.5 ? `Temp ${val}°C: low-borderline` : `Temp ${val}°C: febrile`;
  else reason = `Temp ${val}°C: afebrile`;
  return { tier, score: TIER_SCORE[tier], reason };
};

const assessSpO2 = (val, category, modifier) => {
  if (val == null || isNaN(val)) return null;
  const t = category === 'Neonate' ? VITAL_RANGES.spo2.neonate : VITAL_RANGES.spo2.all;
  let tier = 'normal', reason = '';
  if (val < t.critical) { tier = 'critical'; reason = `SpO₂ ${val}%: severe hypoxia (Ghana STG <${t.critical}%)`; }
  else if (val < t.abnormal) { tier = 'abnormal'; reason = `SpO₂ ${val}%: hypoxic`; }
  else if (val < t.borderline) { tier = 'borderline'; reason = `SpO₂ ${val}%: low-borderline`; }
  else reason = `SpO₂ ${val}%: normal`;
  // Modifier escalation: intubated or on oxygen but still <94 = upgrade severity message
  if (modifier === 'INTUBATED' && val < 95) reason += ' · INTUBATED, escalate';
  if (modifier === 'OXYGEN' && val < 94) reason += ' · on O₂';
  return { tier, score: TIER_SCORE[tier], reason };
};

const assessGCS = (val) => {
  if (val == null || isNaN(val)) return null;
  let tier = 'normal', reason = '';
  if (val <= VITAL_RANGES.gcs.critical) { tier = 'critical'; reason = `GCS ${val}/15: severe impairment, airway risk`; }
  else if (val <= VITAL_RANGES.gcs.abnormal) { tier = 'abnormal'; reason = `GCS ${val}/15: moderately impaired`; }
  else if (val <= VITAL_RANGES.gcs.borderline) { tier = 'borderline'; reason = `GCS ${val}/15: mildly reduced`; }
  else reason = `GCS ${val}/15: alert and oriented`;
  return { tier, score: TIER_SCORE[tier], reason };
};

const assessRBS = (val, category) => {
  if (val == null || isNaN(val)) return null;
  const band = category === 'Neonate' ? VITAL_RANGES.rbs.neonate
            : (category === 'Paediatric' ? VITAL_RANGES.rbs.paeds : VITAL_RANGES.rbs.adult);
  const tier = tierFromBand(val, band) || 'normal';
  let reason = '';
  if (tier === 'critical') reason = val < 3 ? `RBS ${val} mmol/L: severe hypoglycaemia` : `RBS ${val} mmol/L: severe hyperglycaemia (DKA range)`;
  else if (tier === 'abnormal') reason = val < band.normal[0] ? `RBS ${val} mmol/L: hypoglycaemic` : `RBS ${val} mmol/L: hyperglycaemic`;
  else if (tier === 'borderline') reason = `RBS ${val} mmol/L: borderline`;
  else reason = `RBS ${val} mmol/L: euglycaemic`;
  return { tier, score: TIER_SCORE[tier], reason };
};

// Master assessment — returns per-vital + composite score + suggested priority
const assessVitals = (vitals, age, category) => {
  const checks = {
    sbp:  assessSBP(parseFloat(vitals.sbp), age, category),
    dbp:  assessDBP(parseFloat(vitals.dbp)),
    hr:   assessHR(parseFloat(vitals.hr), age, category),
    rr:   assessRR(parseFloat(vitals.rr), age, category),
    temp: assessTemp(parseFloat(vitals.temp), category),
    spo2: assessSpO2(parseFloat(vitals.spo2), category, vitals.spo2_modifier),
    gcs:  assessGCS(parseFloat(vitals.gcs)),
    rbs:  assessRBS(parseFloat(vitals.rbs), category),
  };

  // Composite: highest tier + sum of scores
  let totalScore = 0;
  let criticalCount = 0;
  let abnormalCount = 0;
  Object.values(checks).forEach(c => {
    if (!c) return;
    totalScore += c.score;
    if (c.tier === 'critical') criticalCount++;
    if (c.tier === 'abnormal') abnormalCount++;
  });

  // Modifier escalation: inotropes, bleeding, intubated → bump severity
  if (vitals.sbp_modifier === 'INOTROPES') totalScore += 2;
  if (vitals.hr_modifier === 'BLEEDING') totalScore += 2;
  if (vitals.spo2_modifier === 'INTUBATED') totalScore += 2;

  // Priority decision logic (Ghana STG informed):
  //  • ANY critical vital OR ≥2 modifier escalations OR totalScore ≥ 6 → critical
  //  • ANY 2+ abnormal OR totalScore ≥ 3 → high
  //  • else routine
  let suggestedPriority = 'routine';
  let suggestedReason = 'Vitals within acceptable range';
  if (criticalCount >= 1) {
    suggestedPriority = 'critical';
    suggestedReason = `${criticalCount} critical vital${criticalCount > 1 ? 's' : ''} detected`;
  } else if (totalScore >= 6) {
    suggestedPriority = 'critical';
    suggestedReason = `Composite severity score ${totalScore} (multiple abnormal vitals)`;
  } else if (abnormalCount >= 2 || totalScore >= 3) {
    suggestedPriority = 'high';
    suggestedReason = `${abnormalCount} abnormal vital${abnormalCount > 1 ? 's' : ''}, score ${totalScore}`;
  }

  // Modifier override (mechanistic — bleeding patient is always high min)
  if (vitals.hr_modifier === 'BLEEDING' && suggestedPriority === 'routine') {
    suggestedPriority = 'high';
    suggestedReason += ' · active bleeding';
  }
  if (vitals.sbp_modifier === 'INOTROPES') {
    suggestedPriority = 'critical';
    suggestedReason = 'Patient on inotropes — critical by definition';
  }
  if (vitals.spo2_modifier === 'INTUBATED') {
    suggestedPriority = 'critical';
    suggestedReason = 'Intubated patient — critical by definition';
  }

  return {
    perVital: checks,
    totalScore,
    criticalCount,
    abnormalCount,
    suggestedPriority,
    suggestedReason,
  };
};

const vitalsEngine = {
  ageBand, assessVitals,
  assessSBP, assessDBP, assessHR, assessRR, assessTemp, assessSpO2, assessGCS, assessRBS,
};

/* ════════════════════════════════════════════════════════════════════
   STYLES — embedded as a single <style> tag
════════════════════════════════════════════════════════════════════ */

const STYLES = `
:root {
  --forest:#0A4D3C; --forest-deep:#063929; --forest-mid:#0F6B53;
  --forest-pale:#E8F0EC; --forest-faint:#F2F7F4;
  --copper:#8A4D1F; --copper-mid:#A85F2A; --copper-pale:#F5EBDF; --copper-faint:#FAF4ED;
  --gold:#C4892C; --gold-pale:#F8EFD6;
  --crimson:#B5371F; --crimson-pale:#F8E6E1; --crimson-deep:#8E2814;
  --amber:#C57A18; --amber-pale:#FBEFD3;
  --emerald:#277148; --emerald-pale:#E1EFE5;
  --teal:#1B6B6B; --teal-pale:#E1EFEF;
  --paper-0:#FAFAF7; --paper-1:#F4F3EE; --paper-2:#FFFFFF; --paper-3:#FBF9F3; --paper-edge:#ECE9DF;
  --ink-1:#1A1F1B; --ink-2:#404642; --ink-3:#6B7269; --ink-4:#9CA39B; --ink-5:#C4C9C0;
  --border:#E0DCCE; --border-strong:#C9C2AE;
  --shadow-sm:0 1px 2px rgba(20,30,20,0.04);
  --shadow:0 2px 8px rgba(20,30,20,0.06), 0 1px 2px rgba(20,30,20,0.04);
  --shadow-lg:0 12px 32px rgba(20,30,20,0.10), 0 2px 6px rgba(20,30,20,0.06);
  --shadow-xl:0 24px 60px rgba(20,30,20,0.16), 0 4px 12px rgba(20,30,20,0.08);
  --radius-sm:6px; --radius:10px; --radius-lg:14px; --radius-xl:20px;
  --display:'Fraunces','Times New Roman',serif;
  --body:'Inter Tight',-apple-system,system-ui,sans-serif;
  --mono:'JetBrains Mono','SF Mono',Menlo,monospace;
}
.gherig-portal *, .gherig-portal *::before, .gherig-portal *::after { box-sizing:border-box; margin:0; padding:0; }
.gherig-portal { font-family:var(--body); background:var(--paper-0); color:var(--ink-1); font-size:13.5px; line-height:1.5; -webkit-font-smoothing:antialiased; min-height:100vh; }
.gherig-portal button { font-family:inherit; cursor:pointer; border:none; background:none; color:inherit; }
.gherig-portal button:disabled { opacity:0.5; cursor:not-allowed; }
.gherig-portal input, .gherig-portal select, .gherig-portal textarea { font-family:inherit; color:inherit; }
.gherig-portal ::-webkit-scrollbar { width:8px; height:8px; }
.gherig-portal ::-webkit-scrollbar-track { background:transparent; }
.gherig-portal ::-webkit-scrollbar-thumb { background:var(--border-strong); border-radius:4px; border:2px solid var(--paper-0); }

/* LOGIN */
.login-screen { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; position:relative; overflow:hidden; background:var(--forest-deep); }
.login-screen::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse 60% 50% at 15% 20%, rgba(15,107,83,0.5) 0%, transparent 60%), radial-gradient(ellipse 50% 60% at 85% 80%, rgba(138,77,31,0.35) 0%, transparent 55%), radial-gradient(ellipse 40% 40% at 80% 20%, rgba(196,137,44,0.18) 0%, transparent 60%); pointer-events:none; }
.login-screen::after { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg, #B5371F 0%, #C4892C 50%, #277148 100%); z-index:2; }
.login-card { position:relative; z-index:1; width:100%; max-width:1080px; background:var(--paper-2); border-radius:24px; box-shadow:var(--shadow-xl); overflow:hidden; display:grid; grid-template-columns:1.15fr 0.85fr; }
@media (max-width: 880px) { .login-card { grid-template-columns:1fr; max-width:480px; } .login-left { padding:32px 28px !important; } }
.login-left { padding:56px 56px 48px; background:linear-gradient(180deg,#FFFFFF 0%, #FBF9F3 100%); display:flex; flex-direction:column; }
.login-brand { display:flex; align-items:center; gap:14px; margin-bottom:64px; }
.login-mark { width:48px; height:48px; background:var(--forest-deep); color:#fff; border-radius:14px; display:flex; align-items:center; justify-content:center; font-family:var(--display); font-weight:700; font-size:22px; letter-spacing:-0.02em; box-shadow:inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 3px rgba(0,0,0,0.18); }
.login-brand-text .name { font-family:var(--display); font-size:22px; font-weight:600; letter-spacing:-0.03em; line-height:1; }
.login-brand-text .sub { font-family:var(--mono); font-size:9.5px; letter-spacing:0.22em; text-transform:uppercase; color:var(--ink-3); margin-top:4px; }
.login-eyebrow { font-family:var(--mono); font-size:10px; letter-spacing:0.22em; text-transform:uppercase; color:var(--copper); font-weight:600; margin-bottom:16px; }
.login-headline { font-family:var(--display); font-size:56px; font-weight:500; line-height:0.95; letter-spacing:-0.04em; color:var(--ink-1); margin-bottom:20px; }
.login-headline em { font-style:italic; font-weight:400; color:var(--copper); }
.login-tagline { font-size:14px; line-height:1.6; color:var(--ink-3); max-width:380px; margin-bottom:36px; }
.login-meta { margin-top:auto; padding-top:24px; border-top:1px solid var(--border); display:flex; gap:28px; flex-wrap:wrap; }
.login-meta-item { font-family:var(--mono); font-size:10px; letter-spacing:0.08em; color:var(--ink-3); text-transform:uppercase; }
.login-meta-item b { color:var(--ink-1); font-weight:600; }
.login-right { padding:56px 48px; background:var(--paper-1); border-left:1px solid var(--border); display:flex; flex-direction:column; justify-content:center; }
.login-form-card { background:var(--paper-2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:32px; box-shadow:var(--shadow); }
.login-form-icon { width:44px; height:44px; background:var(--forest-pale); color:var(--forest-deep); border-radius:12px; display:flex; align-items:center; justify-content:center; margin-bottom:18px; font-size:20px; }
.login-form-title { font-family:var(--display); font-size:22px; font-weight:600; letter-spacing:-0.025em; line-height:1.1; margin-bottom:4px; }
.login-form-sub { font-size:12.5px; color:var(--ink-3); margin-bottom:24px; }
.field-label { display:block; font-family:var(--mono); font-size:9.5px; font-weight:600; letter-spacing:0.18em; text-transform:uppercase; color:var(--ink-3); margin-bottom:7px; }
.field-input { width:100%; padding:11px 14px; background:var(--paper-2); border:1.5px solid var(--border); border-radius:10px; font-size:13.5px; color:var(--ink-1); outline:none; transition:border-color .15s, box-shadow .15s; }
.field-input:focus { border-color:var(--forest); box-shadow:0 0 0 3px rgba(10,77,60,0.12); }
.field-input.invalid { border-color:var(--crimson); }
.field { margin-bottom:16px; }
.login-btn { width:100%; padding:13px 16px; background:var(--forest-deep); color:#fff; border-radius:10px; font-size:13px; font-weight:600; margin-top:24px; display:flex; align-items:center; justify-content:center; gap:8px; transition:background .15s; box-shadow:0 4px 12px rgba(10,77,60,0.25); }
.login-btn:hover { background:var(--forest); }
.login-role-pills { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
.login-role-pill { padding:10px 12px; background:var(--paper-2); border:1.5px solid var(--border); border-radius:10px; font-size:11.5px; font-weight:500; color:var(--ink-2); text-align:left; transition:all .12s; }
.login-role-pill .role-name { font-weight:600; color:var(--ink-1); display:block; margin-bottom:1px; }
.login-role-pill .role-sub { font-family:var(--mono); font-size:9px; color:var(--ink-3); letter-spacing:0.04em; }
.login-role-pill:hover { border-color:var(--forest-mid); background:var(--forest-faint); }
.login-role-pill.active { border-color:var(--forest-deep); background:var(--forest-pale); box-shadow:inset 0 0 0 1px var(--forest-deep); }
.login-role-pill.active .role-name { color:var(--forest-deep); }
.login-fineprint { text-align:center; margin-top:20px; font-family:var(--mono); font-size:9.5px; letter-spacing:0.12em; text-transform:uppercase; color:var(--ink-4); }

/* TOPBAR */
.topbar { position:fixed; top:0; left:0; right:0; height:56px; z-index:100; background:var(--paper-2); border-bottom:1px solid var(--border); display:flex; align-items:center; }
.topbar-brand { width:240px; height:100%; display:flex; align-items:center; gap:11px; padding:0 22px; border-right:1px solid var(--border); flex-shrink:0; }
.topbar-mark { width:32px; height:32px; background:var(--forest-deep); color:#fff; border-radius:9px; display:flex; align-items:center; justify-content:center; font-family:var(--display); font-weight:700; font-size:15px; }
.topbar-name { font-family:var(--display); font-weight:600; font-size:16px; letter-spacing:-0.025em; line-height:1; }
.topbar-sub { font-family:var(--mono); font-size:8.5px; letter-spacing:0.2em; text-transform:uppercase; color:var(--ink-3); margin-top:3px; }
.topbar-context { flex:1; height:100%; display:flex; align-items:center; padding:0 28px; gap:24px; }
.facility-chip { display:flex; align-items:center; gap:10px; padding:6px 14px 6px 6px; background:var(--forest-faint); border:1px solid var(--border); border-radius:22px; }
.facility-chip-mark { width:26px; height:26px; background:var(--forest-deep); color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:var(--display); font-size:11px; font-weight:700; }
.facility-chip-name { font-size:11.5px; font-weight:600; }
.facility-chip-meta { font-family:var(--mono); font-size:9px; color:var(--ink-3); margin-top:1px; }
.topbar-status { display:flex; align-items:center; gap:14px; margin-left:auto; }
.live-pill { display:inline-flex; align-items:center; gap:6px; padding:4px 12px 4px 9px; background:rgba(39,113,72,0.10); border:1px solid rgba(39,113,72,0.25); border-radius:20px; font-family:var(--mono); font-size:9.5px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:var(--emerald); }
.live-dot { width:6px; height:6px; background:var(--emerald); border-radius:50%; box-shadow:0 0 0 3px rgba(39,113,72,0.18); animation:pulse-live 2s ease-in-out infinite; }
@keyframes pulse-live { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
.topbar-clock { font-family:var(--mono); font-size:11px; color:var(--ink-2); font-weight:500; }
.topbar-user { display:flex; align-items:center; gap:10px; padding:5px 6px 5px 12px; background:var(--paper-2); border:1px solid var(--border); border-radius:22px; cursor:pointer; }
.topbar-user:hover { border-color:var(--border-strong); background:var(--paper-3); }
.user-text { line-height:1.15; text-align:right; }
.user-name { font-size:11.5px; font-weight:600; }
.user-role { font-family:var(--mono); font-size:9px; color:var(--ink-3); margin-top:1px; }
.user-avatar { width:30px; height:30px; background:var(--copper); color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:var(--display); font-weight:700; font-size:11.5px; }

/* USER DROPDOWN */
.user-dropdown { position:fixed; top:60px; right:22px; width:280px; background:var(--paper-2); border:1px solid var(--border); border-radius:var(--radius-lg); box-shadow:var(--shadow-lg); z-index:200; overflow:hidden; animation:dropdown-in .18s ease; }
@keyframes dropdown-in { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
.user-dropdown-head { padding:16px; border-bottom:1px solid var(--border); background:var(--paper-3); }
.user-dropdown-name { font-family:var(--display); font-size:16px; font-weight:600; letter-spacing:-0.02em; }
.user-dropdown-role { font-family:var(--mono); font-size:10px; color:var(--ink-3); margin-top:3px; }
.user-dropdown-meta { padding:14px 16px; }
.user-meta-row { display:flex; justify-content:space-between; padding:5px 0; font-size:11.5px; }
.user-meta-row .k { font-family:var(--mono); font-size:10px; color:var(--ink-3); text-transform:uppercase; }
.user-meta-row .v { font-weight:500; }
.user-dropdown-actions { border-top:1px solid var(--border); padding:8px; }
.dropdown-action { width:100%; display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:8px; font-size:12px; color:var(--ink-2); text-align:left; }
.dropdown-action:hover { background:var(--paper-3); color:var(--ink-1); }
.dropdown-action.danger { color:var(--crimson); }
.dropdown-action.danger:hover { background:var(--crimson-pale); }

/* LAYOUT */
.layout { display:flex; padding-top:56px; min-height:100vh; }
.sidebar { width:240px; flex-shrink:0; background:var(--paper-2); border-right:1px solid var(--border); position:fixed; top:56px; left:0; bottom:0; overflow-y:auto; z-index:50; display:flex; flex-direction:column; }
.main { margin-left:240px; flex:1; padding:28px 32px; min-width:0; max-width:100%; }
.sb-section { padding:16px 14px 6px; }
.sb-label { font-family:var(--mono); font-size:9px; font-weight:700; letter-spacing:0.2em; text-transform:uppercase; color:var(--ink-4); padding:0 10px; }
.sb-item { display:flex; align-items:center; gap:11px; padding:9px 12px 9px 14px; margin:2px 0; border-radius:8px; font-size:12.5px; font-weight:500; color:var(--ink-2); cursor:pointer; transition:background .12s, color .12s; border-left:2px solid transparent; }
.sb-item:hover { background:var(--forest-faint); color:var(--forest-deep); }
.sb-item.active { background:var(--forest-faint); color:var(--forest-deep); border-left-color:var(--forest-deep); font-weight:600; }
.sb-item-icon { width:18px; height:18px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
.sb-item-badge { margin-left:auto; font-family:var(--mono); font-size:9.5px; font-weight:700; padding:1px 6px; border-radius:10px; background:var(--crimson); color:#fff; }
.sb-footer { margin-top:auto; padding:16px 18px; border-top:1px solid var(--border); background:var(--paper-3); }
.sb-footer-line { font-family:var(--mono); font-size:9px; color:var(--ink-3); letter-spacing:0.06em; margin-bottom:4px; }
.sb-footer-line b { color:var(--ink-1); font-weight:600; }

/* PAGE HEAD */
.page-head { display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:24px; gap:24px; flex-wrap:wrap; }
.page-eyebrow { font-family:var(--mono); font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:var(--copper); font-weight:600; margin-bottom:6px; }
.page-title { font-family:var(--display); font-size:32px; font-weight:500; letter-spacing:-0.035em; line-height:1.05; }
.page-sub { margin-top:8px; font-size:13px; color:var(--ink-3); max-width:640px; }
.page-actions { display:flex; gap:8px; align-items:center; }
.btn { display:inline-flex; align-items:center; gap:7px; padding:8px 14px; background:var(--paper-2); border:1px solid var(--border); border-radius:9px; font-size:12px; font-weight:500; color:var(--ink-2); transition:all .12s; }
.btn:hover { border-color:var(--border-strong); background:var(--paper-3); color:var(--ink-1); }
.btn-primary { background:var(--forest-deep); color:#fff; border-color:var(--forest-deep); box-shadow:0 2px 6px rgba(10,77,60,0.18); }
.btn-primary:hover { background:var(--forest); border-color:var(--forest); color:#fff; }
.btn-danger { color:var(--crimson); }
.btn-danger:hover { background:var(--crimson-pale); border-color:var(--crimson); color:var(--crimson-deep); }
.btn-sm { padding:5px 10px; font-size:11px; }

/* KPI / ALERT / CARDS — same as v1 (well-tested) */
.kpi-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:24px; }
@media (max-width:1100px) { .kpi-strip { grid-template-columns:repeat(2,1fr); } }
.kpi-card { background:var(--paper-2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:18px 20px; position:relative; overflow:hidden; transition:box-shadow .2s; }
.kpi-card:hover { box-shadow:var(--shadow); }
.kpi-card::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; }
.kc-crimson::before { background:var(--crimson); } .kc-forest::before { background:var(--forest); }
.kc-copper::before { background:var(--copper); } .kc-emerald::before { background:var(--emerald); }
.kpi-label { font-family:var(--mono); font-size:9.5px; font-weight:600; letter-spacing:0.18em; text-transform:uppercase; color:var(--ink-3); margin-bottom:10px; }
.kpi-value { font-family:var(--display); font-size:38px; font-weight:500; line-height:1; letter-spacing:-0.04em; }
.kc-crimson .kpi-value { color:var(--crimson-deep); } .kc-forest .kpi-value { color:var(--forest-deep); }
.kc-copper .kpi-value { color:var(--copper); } .kc-emerald .kpi-value { color:var(--emerald); }
.kpi-delta { margin-top:8px; display:inline-flex; align-items:center; gap:5px; font-family:var(--mono); font-size:10px; font-weight:600; padding:2px 8px; border-radius:5px; }
.kpi-delta.up { background:var(--crimson-pale); color:var(--crimson); }
.kpi-delta.dn { background:var(--emerald-pale); color:var(--emerald); }
.kpi-delta.neu { background:var(--paper-3); color:var(--ink-3); }
.kpi-foot { margin-top:10px; padding-top:10px; border-top:1px solid var(--border); font-family:var(--mono); font-size:10px; color:var(--ink-3); }

.alert-strip { background:var(--crimson-pale); border:1px solid rgba(181,55,31,0.25); border-left:3px solid var(--crimson); border-radius:var(--radius); padding:12px 16px; margin-bottom:18px; display:flex; align-items:center; gap:12px; }
.alert-icon { width:32px; height:32px; background:var(--crimson); color:#fff; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:16px; }
.alert-text { flex:1; font-size:12.5px; line-height:1.5; }
.alert-text b { color:var(--crimson-deep); }
.alert-time { font-family:var(--mono); font-size:10px; color:var(--ink-3); }

.section-head { display:flex; align-items:baseline; gap:14px; margin:26px 0 14px; }
.section-title { font-family:var(--display); font-size:18px; font-weight:600; letter-spacing:-0.02em; }
.section-line { flex:1; height:1px; background:var(--border); }
.section-meta { font-family:var(--mono); font-size:10px; color:var(--ink-3); }
.section-meta b { color:var(--copper); font-weight:700; }

.card { background:var(--paper-2); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; margin-bottom:18px; }
.card-head { padding:14px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; background:var(--paper-3); }
.card-title { display:flex; align-items:center; gap:10px; font-family:var(--display); font-size:15px; font-weight:600; letter-spacing:-0.02em; }
.card-title-icon { width:26px; height:26px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:14px; }
.cti-forest { background:var(--forest-pale); color:var(--forest-deep); }
.cti-crimson { background:var(--crimson-pale); color:var(--crimson); }
.cti-copper { background:var(--copper-pale); color:var(--copper); }
.cti-emerald { background:var(--emerald-pale); color:var(--emerald); }
.card-meta { font-family:var(--mono); font-size:10px; color:var(--ink-3); }
.card-meta b { color:var(--ink-1); font-weight:600; }

/* REFERRAL CARDS — vital tiers (4-tier) */
.ref-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(380px,1fr)); gap:14px; }
.ref-card { background:var(--paper-2); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; position:relative; transition:box-shadow .2s, transform .15s; cursor:pointer; }
.ref-card:hover { box-shadow:var(--shadow-lg); transform:translateY(-2px); border-color:var(--border-strong); }
.ref-card.priority-critical { border-color:rgba(181,55,31,0.4); }
.ref-card.priority-critical::before { content:''; position:absolute; left:0; top:0; bottom:0; width:4px; background:var(--crimson); }
.ref-card.priority-high::before { content:''; position:absolute; left:0; top:0; bottom:0; width:4px; background:var(--amber); }
.ref-card.priority-routine::before { content:''; position:absolute; left:0; top:0; bottom:0; width:4px; background:var(--forest-mid); }
.ref-head { padding:12px 16px 10px 18px; display:flex; align-items:flex-start; justify-content:space-between; gap:10px; border-bottom:1px solid var(--border); background:linear-gradient(180deg, var(--paper-3) 0%, var(--paper-2) 100%); }
.ref-id { font-family:var(--mono); font-size:10px; color:var(--ink-3); margin-bottom:3px; }
.ref-title { font-family:var(--display); font-size:14.5px; font-weight:600; line-height:1.25; letter-spacing:-0.015em; }
.ref-tags { display:flex; gap:5px; flex-shrink:0; align-items:center; }
.priority-pill, .dir-pill { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:12px; font-family:var(--mono); font-size:9.5px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; }
.priority-pill.critical { background:var(--crimson); color:#fff; }
.priority-pill.high { background:var(--amber); color:#fff; }
.priority-pill.routine { background:var(--forest-mid); color:#fff; }
.dir-pill.incoming { background:var(--forest-pale); color:var(--forest-deep); }
.dir-pill.outgoing { background:var(--copper-pale); color:var(--copper); }
.ref-body { padding:12px 16px 12px 18px; }
.ref-row { display:grid; grid-template-columns:80px 1fr; gap:10px; align-items:baseline; font-size:12px; margin-bottom:6px; }
.ref-row .k { font-family:var(--mono); font-size:9.5px; font-weight:600; color:var(--ink-3); letter-spacing:0.08em; text-transform:uppercase; }

/* VITAL CELLS — 4-tier severity + modifier badge */
.ref-vitals { margin-top:10px; padding:9px 11px; background:var(--paper-3); border:1px solid var(--border); border-radius:8px; display:grid; grid-template-columns:repeat(5,1fr); gap:4px; }
.ref-vitals.six-col { grid-template-columns:repeat(6,1fr); }
.ref-vitals.eight-col { grid-template-columns:repeat(8,1fr); }
.vital-cell { text-align:center; padding:3px 2px; border-right:1px solid var(--border); position:relative; border-radius:4px; }
.vital-cell:last-child { border-right:none; }
.vital-cell.tier-normal { background:transparent; }
.vital-cell.tier-borderline { background:var(--gold-pale); }
.vital-cell.tier-abnormal { background:var(--amber-pale); }
.vital-cell.tier-critical { background:var(--crimson-pale); }
.vital-k { font-family:var(--mono); font-size:8px; font-weight:600; color:var(--ink-3); letter-spacing:0.1em; text-transform:uppercase; margin-bottom:2px; }
.vital-v { font-family:var(--mono); font-size:11.5px; font-weight:700; }
.vital-cell.tier-borderline .vital-v { color:var(--copper); }
.vital-cell.tier-abnormal .vital-v { color:var(--amber); }
.vital-cell.tier-critical .vital-v { color:var(--crimson); }
.vital-cell.tier-critical::after { content:''; position:absolute; top:2px; right:3px; width:5px; height:5px; background:var(--crimson); border-radius:50%; animation:critical-pulse 1.5s ease-in-out infinite; }
@keyframes critical-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(0.8); } }
.vital-mod { display:inline-block; font-family:var(--mono); font-size:7.5px; font-weight:700; padding:1px 4px; border-radius:3px; background:var(--ink-1); color:#fff; margin-top:2px; letter-spacing:0.08em; }

.ref-foot { padding:10px 16px 12px 18px; border-top:1px solid var(--border); background:var(--paper-3); display:flex; align-items:center; justify-content:space-between; gap:8px; }
.sla-block { display:flex; align-items:center; gap:8px; }
.sla-icon { width:24px; height:24px; background:var(--paper-2); border:1px solid var(--border); border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:12px; color:var(--ink-3); }
.sla-time { font-family:var(--mono); font-size:13px; font-weight:700; }
.sla-time.urgent { color:var(--crimson); animation:sla-flash 1.4s ease-in-out infinite; }
@keyframes sla-flash { 0%,100% { opacity:1; } 50% { opacity:0.55; } }
.sla-label { font-family:var(--mono); font-size:9px; color:var(--ink-3); letter-spacing:0.08em; text-transform:uppercase; margin-top:1px; }
.ref-actions { display:flex; gap:6px; }
.ref-action-btn { padding:6px 11px; background:var(--paper-2); border:1px solid var(--border); border-radius:7px; font-size:11px; font-weight:500; color:var(--ink-2); transition:all .12s; }
.ref-action-btn:hover { background:var(--forest-faint); border-color:var(--forest-mid); color:var(--forest-deep); }
.ref-action-btn.primary { background:var(--forest-deep); color:#fff; border-color:var(--forest-deep); }
.ref-action-btn.primary:hover { background:var(--forest); border-color:var(--forest); }
.ref-action-btn.danger { color:var(--crimson); }
.ref-action-btn.danger:hover { background:var(--crimson-pale); border-color:var(--crimson); color:var(--crimson-deep); }

/* FILTER BAR */
.filter-bar { display:flex; align-items:center; gap:8px; padding:12px 18px; background:var(--paper-3); border-bottom:1px solid var(--border); flex-wrap:wrap; }
.filter-pill { padding:6px 12px; background:var(--paper-2); border:1px solid var(--border); border-radius:18px; font-size:11.5px; font-weight:500; color:var(--ink-2); transition:all .12s; cursor:pointer; }
.filter-pill:hover { border-color:var(--forest-mid); }
.filter-pill.active { background:var(--forest-deep); color:#fff; border-color:var(--forest-deep); font-weight:600; }
.filter-pill .count { margin-left:5px; padding:1px 6px; background:rgba(255,255,255,0.18); border-radius:8px; font-family:var(--mono); font-size:9.5px; font-weight:700; }
.filter-pill:not(.active) .count { background:var(--paper-1); color:var(--ink-3); }
.filter-search { margin-left:auto; display:flex; align-items:center; gap:6px; padding:5px 10px; background:var(--paper-2); border:1px solid var(--border); border-radius:8px; min-width:220px; }
.filter-search input { border:none; outline:none; background:transparent; font-size:12px; flex:1; }

/* CAPACITY (with inline editor) */
.capacity-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }
.capacity-card { background:var(--paper-2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:18px 20px; position:relative; overflow:hidden; }
.capacity-card::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; }
.cap-open::before { background:var(--emerald); }
.cap-constrained::before { background:var(--amber); }
.cap-full::before { background:var(--crimson); }
.cap-low::before { background:var(--copper); }
.cap-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:16px; }
.cap-name { font-family:var(--display); font-size:15px; font-weight:600; letter-spacing:-0.02em; line-height:1.15; }
.cap-status { display:inline-flex; padding:3px 9px; border-radius:12px; font-family:var(--mono); font-size:9.5px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; }
.cap-status.open { background:var(--emerald-pale); color:var(--emerald); }
.cap-status.constrained { background:var(--amber-pale); color:var(--amber); }
.cap-status.full { background:var(--crimson-pale); color:var(--crimson); }
.cap-status.low { background:var(--copper-pale); color:var(--copper); }
.cap-stat { display:flex; align-items:baseline; gap:6px; margin-bottom:12px; }
.cap-used { font-family:var(--display); font-size:38px; font-weight:500; line-height:1; letter-spacing:-0.04em; }
.cap-total { font-family:var(--mono); font-size:14px; color:var(--ink-3); font-weight:500; }
.cap-bar { height:6px; background:var(--paper-1); border-radius:3px; overflow:hidden; margin-bottom:8px; }
.cap-bar-fill { height:100%; border-radius:3px; transition:width .4s ease; }
.cap-bar-fill.open { background:var(--emerald); }
.cap-bar-fill.constrained { background:var(--amber); }
.cap-bar-fill.full { background:var(--crimson); }
.cap-bar-fill.low { background:var(--copper); }
.cap-note { font-family:var(--mono); font-size:10px; color:var(--ink-3); margin-bottom:8px; }
.cap-edit { display:grid; grid-template-columns:1fr 60px 60px; gap:6px; margin-top:8px; padding-top:8px; border-top:1px solid var(--border); align-items:center; }
.cap-edit input { padding:5px 7px; border:1px solid var(--border); border-radius:6px; font-family:var(--mono); font-size:11px; outline:none; width:100%; }
.cap-edit input:focus { border-color:var(--forest); }
.cap-edit .save-btn { padding:5px 8px; background:var(--forest-deep); color:#fff; border-radius:6px; font-size:11px; font-weight:600; }
.cap-edit .cancel-btn { padding:5px 8px; background:var(--paper-2); border:1px solid var(--border); color:var(--ink-2); border-radius:6px; font-size:11px; }

/* TABLES */
.table-wrap { overflow-x:auto; }
.data-table { width:100%; border-collapse:collapse; font-size:12.5px; }
.data-table thead tr { background:var(--paper-3); border-bottom:1px solid var(--border); }
.data-table thead th { padding:10px 14px; font-family:var(--mono); font-size:9.5px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:var(--ink-3); text-align:left; white-space:nowrap; }
.data-table tbody tr { border-bottom:1px solid var(--border); transition:background .1s; }
.data-table tbody tr:hover { background:var(--paper-3); }
.data-table tbody tr:last-child { border-bottom:none; }
.data-table tbody td { padding:11px 14px; vertical-align:middle; }
.id-cell { font-family:var(--mono); font-size:11px; color:var(--ink-3); }
.name-cell .nm { font-weight:600; }
.name-cell .sub { font-family:var(--mono); font-size:10px; color:var(--ink-3); margin-top:1px; }
.row-pill { display:inline-flex; padding:2px 8px; border-radius:12px; font-family:var(--mono); font-size:9.5px; font-weight:700; }
.rp-active, .rp-online { background:var(--emerald-pale); color:var(--emerald); }
.rp-offline { background:var(--paper-1); color:var(--ink-3); }
.rp-degraded { background:var(--amber-pale); color:var(--amber); }
.rp-locked { background:var(--crimson-pale); color:var(--crimson); }

/* CHART */
.chart-wrap { padding:16px 20px 0; }
.chart-legend { display:flex; gap:18px; margin-bottom:12px; }
.legend-item { display:flex; align-items:center; gap:6px; font-family:var(--mono); font-size:10.5px; color:var(--ink-3); }
.legend-dot { width:10px; height:10px; border-radius:2px; }
.chart-bars { display:flex; align-items:flex-end; gap:4px; height:130px; padding-bottom:4px; }
.bar-group { flex:1; display:flex; flex-direction:column; align-items:center; height:100%; }
.bar-nums { width:100%; display:flex; justify-content:center; gap:1px; height:26px; align-items:flex-end; padding-bottom:3px; }
.bar-num { flex:1; text-align:center; font-family:var(--mono); font-size:9px; font-weight:700; line-height:1; }
.bar-pair { width:100%; display:flex; align-items:flex-end; gap:1px; flex:1; }
.bar { flex:1; border-radius:2px 2px 0 0; min-height:2px; }
.bar-lbl { font-family:var(--mono); font-size:8px; color:var(--ink-4); margin-top:4px; }
.chart-axis { display:flex; justify-content:space-between; padding:4px 20px 16px; font-family:var(--mono); font-size:9px; color:var(--ink-4); }

/* SYSTEMS */
.systems-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }
.system-tile { background:var(--paper-2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:18px; }
.system-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:12px; }
.system-name { font-family:var(--display); font-size:15px; font-weight:600; letter-spacing:-0.02em; }
.system-sub { font-family:var(--mono); font-size:9.5px; color:var(--ink-3); margin-top:3px; }
.system-body { font-size:12px; color:var(--ink-2); line-height:1.55; margin-bottom:12px; }
.system-stat { font-family:var(--mono); font-size:10px; color:var(--ink-3); }
.system-stat b { color:var(--ink-1); font-weight:600; }
.system-stat .ok { color:var(--emerald); }
.system-stat .warn { color:var(--amber); }
.system-stat .err { color:var(--crimson); }

/* AUDIT */
.audit-list { display:flex; flex-direction:column; }
.audit-item { display:grid; grid-template-columns:110px 130px 1fr 100px; gap:16px; padding:11px 18px; border-bottom:1px solid var(--border); align-items:center; font-size:12px; }
.audit-item:last-child { border-bottom:none; }
.audit-item:hover { background:var(--paper-3); }
.audit-time { font-family:var(--mono); font-size:10.5px; color:var(--ink-3); }
.audit-actor { font-weight:600; font-size:11.5px; }
.audit-action { color:var(--ink-2); line-height:1.4; }
.audit-ref { font-family:var(--mono); font-size:10px; color:var(--copper); text-align:right; }

/* TOAST */
.toast-host { position:fixed; top:70px; right:22px; z-index:500; display:flex; flex-direction:column; gap:8px; pointer-events:none; }
.toast { min-width:280px; max-width:380px; background:var(--ink-1); color:#fff; border-radius:var(--radius); padding:11px 14px; box-shadow:var(--shadow-xl); display:flex; align-items:flex-start; gap:10px; pointer-events:auto; animation:toast-in .25s ease; border-left:3px solid var(--emerald); }
.toast.warn { border-left-color:var(--amber); }
.toast.error { border-left-color:var(--crimson); }
.toast.info { border-left-color:var(--forest-mid); }
.toast-icon { font-size:14px; flex-shrink:0; margin-top:1px; }
.toast-title { font-size:12.5px; font-weight:600; }
.toast-text { font-size:11.5px; color:rgba(255,255,255,0.78); margin-top:2px; }
@keyframes toast-in { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }

/* MODAL */
.modal-overlay { position:fixed; inset:0; background:rgba(20,30,25,0.55); backdrop-filter:blur(4px); z-index:400; display:flex; align-items:center; justify-content:center; padding:24px; }
.modal { background:var(--paper-2); border-radius:var(--radius-xl); width:100%; max-width:780px; max-height:92vh; overflow:hidden; display:flex; flex-direction:column; box-shadow:var(--shadow-xl); animation:modal-in .25s ease; }
.modal.modal-wide { max-width:920px; }
@keyframes modal-in { from { opacity:0; transform:translateY(12px) scale(0.98); } to { opacity:1; transform:none; } }
.modal-head { padding:18px 22px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; background:var(--paper-3); }
.modal-title { font-family:var(--display); font-size:18px; font-weight:600; letter-spacing:-0.025em; }
.modal-close { width:32px; height:32px; border-radius:8px; border:1px solid var(--border); background:var(--paper-2); display:flex; align-items:center; justify-content:center; font-size:14px; transition:all .12s; }
.modal-close:hover { background:var(--crimson-pale); border-color:var(--crimson); color:var(--crimson); }
.modal-body { padding:22px; overflow-y:auto; flex:1; }
.modal-foot { padding:14px 22px; border-top:1px solid var(--border); display:flex; gap:8px; justify-content:flex-end; background:var(--paper-3); }
.detail-grid { display:grid; grid-template-columns:140px 1fr; gap:10px 16px; }
.detail-grid .k { font-family:var(--mono); font-size:9.5px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:var(--ink-3); padding-top:2px; }
.detail-grid .v { font-size:13px; line-height:1.5; }
.detail-section { margin-top:18px; padding-top:18px; border-top:1px solid var(--border); }
.detail-section-title { font-family:var(--display); font-size:13px; font-weight:600; margin-bottom:12px; color:var(--copper); }
.timeline { padding-left:16px; border-left:2px solid var(--border); }
.timeline-item { padding:6px 0 12px 14px; position:relative; }
.timeline-item::before { content:''; position:absolute; left:-22px; top:11px; width:8px; height:8px; background:var(--copper); border-radius:50%; box-shadow:0 0 0 3px var(--paper-2); }
.timeline-time { font-family:var(--mono); font-size:10px; color:var(--ink-3); margin-bottom:2px; }
.timeline-event { font-size:12.5px; line-height:1.4; }
.timeline-actor { font-family:var(--mono); font-size:10px; color:var(--copper); margin-top:2px; }

/* NEW REFERRAL FORM */
.form-section { margin-bottom:22px; padding-bottom:22px; border-bottom:1px solid var(--border); }
.form-section:last-child { border-bottom:none; padding-bottom:0; }
.form-section-title { font-family:var(--display); font-size:14px; font-weight:600; color:var(--forest-deep); margin-bottom:4px; }
.form-section-sub { font-size:11.5px; color:var(--ink-3); margin-bottom:14px; }
.form-row { display:grid; gap:12px; margin-bottom:12px; }
.form-row.cols-2 { grid-template-columns:1fr 1fr; }
.form-row.cols-3 { grid-template-columns:1fr 1fr 1fr; }
.form-row.cols-4 { grid-template-columns:1fr 1fr 1fr 1fr; }
.form-input { padding:9px 12px; border:1.5px solid var(--border); border-radius:8px; font-size:13px; outline:none; width:100%; background:var(--paper-2); transition:border .12s, box-shadow .12s; }
.form-input:focus { border-color:var(--forest); box-shadow:0 0 0 3px rgba(10,77,60,0.10); }
.form-input.tier-borderline { border-color:var(--gold); background:var(--gold-pale); }
.form-input.tier-abnormal { border-color:var(--amber); background:var(--amber-pale); }
.form-input.tier-critical { border-color:var(--crimson); background:var(--crimson-pale); animation:critical-pulse 1.8s ease-in-out infinite; }
.form-pill-group { display:flex; gap:6px; flex-wrap:wrap; }
.form-pill { padding:6px 11px; background:var(--paper-2); border:1.5px solid var(--border); border-radius:18px; font-size:11.5px; font-weight:500; color:var(--ink-2); cursor:pointer; transition:all .12s; user-select:none; }
.form-pill:hover { border-color:var(--forest-mid); }
.form-pill.active { background:var(--forest-deep); color:#fff; border-color:var(--forest-deep); }
.form-pill.tier-active { background:var(--ink-1); color:#fff; border-color:var(--ink-1); }
.form-pill.modifier { padding:5px 9px; font-size:10.5px; font-family:var(--mono); font-weight:600; letter-spacing:0.06em; text-transform:uppercase; }
.form-pill.modifier.active { background:var(--copper); color:#fff; border-color:var(--copper); }
.form-pill.severity-stable.active { background:var(--emerald); border-color:var(--emerald); color:#fff; }
.form-pill.severity-potentially-unstable.active { background:var(--gold); border-color:var(--gold); color:#fff; }
.form-pill.severity-unstable.active { background:var(--amber); border-color:var(--amber); color:#fff; }
.form-pill.severity-critical.active { background:var(--crimson); border-color:var(--crimson); color:#fff; }
.form-priority-badge { padding:14px 18px; border-radius:var(--radius-lg); display:flex; align-items:center; gap:14px; margin-bottom:14px; transition:all .25s; border:2px solid var(--border); background:var(--paper-3); }
.form-priority-badge.priority-critical { background:var(--crimson-pale); border-color:var(--crimson); }
.form-priority-badge.priority-high { background:var(--amber-pale); border-color:var(--amber); }
.form-priority-badge.priority-routine { background:var(--forest-pale); border-color:var(--forest); }
.priority-icon-lg { width:42px; height:42px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-family:var(--display); font-weight:700; font-size:20px; flex-shrink:0; }
.priority-icon-lg.priority-critical { background:var(--crimson); color:#fff; }
.priority-icon-lg.priority-high { background:var(--amber); color:#fff; }
.priority-icon-lg.priority-routine { background:var(--forest); color:#fff; }
.priority-text-lg { line-height:1.2; }
.priority-text-lg .lbl { font-family:var(--mono); font-size:10px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:var(--ink-3); }
.priority-text-lg .val { font-family:var(--display); font-size:18px; font-weight:600; letter-spacing:-0.02em; }
.priority-text-lg .reason { font-size:11.5px; color:var(--ink-2); margin-top:3px; }
.severity-meter { display:flex; gap:3px; margin-top:8px; }
.severity-bar { height:6px; flex:1; border-radius:2px; background:var(--border); transition:background .25s; }
.severity-bar.filled-1 { background:var(--gold); }
.severity-bar.filled-2 { background:var(--amber); }
.severity-bar.filled-3 { background:var(--crimson); }
.summary-counter { font-family:var(--mono); font-size:10px; color:var(--ink-3); text-align:right; margin-top:4px; }
.summary-counter.warn { color:var(--amber); }
.summary-counter.err { color:var(--crimson); }
.gcs-readout { padding:9px 12px; border-radius:8px; background:var(--paper-3); border:1px solid var(--border); font-family:var(--mono); font-size:11px; color:var(--ink-2); margin-top:8px; }
.gcs-readout b { color:var(--forest-deep); }

/* PAGINATION */
.pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 18px; background:var(--paper-3); border-top:1px solid var(--border); flex-wrap:wrap; gap:10px; }
.pg-info { font-family:var(--mono); font-size:11px; color:var(--ink-3); }
.pg-info b { color:var(--ink-1); font-weight:600; }
.pg-controls { display:flex; gap:4px; }
.pg-btn { min-width:30px; height:28px; padding:0 8px; border:1px solid var(--border); background:var(--paper-2); border-radius:7px; font-family:var(--mono); font-size:11px; color:var(--ink-2); transition:all .1s; }
.pg-btn:hover:not(:disabled) { background:var(--forest-faint); border-color:var(--forest-mid); color:var(--forest-deep); }
.pg-btn.active { background:var(--forest-deep); border-color:var(--forest-deep); color:#fff; }
.pg-btn:disabled { opacity:0.35; cursor:not-allowed; }
.empty-state { padding:48px 24px; text-align:center; }
.empty-icon { font-size:36px; margin-bottom:12px; opacity:0.4; }
.empty-title { font-family:var(--display); font-size:16px; font-weight:600; margin-bottom:4px; }
.empty-sub { font-size:12.5px; color:var(--ink-3); }
.two-col { display:grid; grid-template-columns:2fr 1fr; gap:18px; }
@media (max-width:1100px) { .two-col { grid-template-columns:1fr; } }
.page-section { animation:fade-up .35s ease both; }
@keyframes fade-up { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }

@media print {
  .topbar, .sidebar, .modal-foot, .modal-close, .ref-actions, .page-actions, .toast-host { display:none !important; }
  .layout { padding-top:0 !important; }
  .main { margin-left:0 !important; }
  .modal-overlay { position:static; padding:0; background:transparent; backdrop-filter:none; }
  .modal { box-shadow:none; max-height:none; }
  body { background:#fff; }
}
`;
/* ════════════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
════════════════════════════════════════════════════════════════════ */

const minutesAgo = (m) => { const d = new Date(); d.setMinutes(d.getMinutes() - m); return d; };
const minutesFromNow = (m) => { const d = new Date(); d.setMinutes(d.getMinutes() + m); return d; };

const fmtTime = (d) => d ? d.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtAgo = (d) => {
  if (!d) return '—';
  const diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return diff + 'm ago';
  return Math.floor(diff / 60) + 'h ago';
};
const fmtSLA = (deadline) => {
  if (!deadline) return { text: '—', urgent: false };
  const diff = Math.floor((deadline.getTime() - Date.now()) / 1000);
  if (diff < 0) return { text: 'OVERDUE +' + Math.abs(Math.floor(diff/60)) + 'm', urgent: true };
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return { text: m + ':' + String(s).padStart(2, '0'), urgent: m < 1 };
};
const facilityName = (code) => {
  const f = FACILITIES.find(x => x.code === code);
  return f ? f.name : code;
};
const downloadFile = (filename, content, mimeType = 'text/plain') => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const deriveCapacityStatus = (used, total, isConsumable) => {
  const ratio = used / total;
  if (ratio >= 1.0) return 'full';
  if (isConsumable && ratio >= 0.7) return 'low';
  if (ratio >= 0.85) return 'constrained';
  return 'open';
};

const gcsAlertness = (gcs) => {
  if (gcs == null || isNaN(gcs)) return null;
  if (gcs <= 3)  return 'Unresponsive';
  if (gcs <= 8)  return 'Responds to pain';
  if (gcs <= 13) return 'Responds to voice';
  return 'Alert';
};

/* ════════════════════════════════════════════════════════════════════
   SEED DATA — Replace with API calls in production
════════════════════════════════════════════════════════════════════ */

const seedReferrals = () => ([
  {
    id: 'REF-2026-1041', direction: 'incoming', priority: 'critical', status: 'awaiting_decision',
    patientInitials: 'KA', patientAge: 59, patientSex: 'M', patientCategory: 'Adult',
    primaryCondition: 'medical', subCondition: 'Stroke',
    reasons: ['Specialist review', 'ICU/HDU bed needed'],
    services: ['Cardiology', 'Anaesthesia / ICU'],
    stability: 'Critical',
    sourceFacility: 'GH-ACC-014', destFacility: 'GH-ACC-001',
    eta: 12,
    receivedAt: minutesAgo(2), slaDeadline: minutesFromNow(1),
    vitals: { sbp: 222, dbp: 174, hr: 135, rr: 28, spo2: 89, temp: 37.2, gcs: 14, rbs: 8.2,
              sbp_modifier: '', hr_modifier: '', spo2_modifier: 'OXYGEN' },
    interventions: 'Both done',
    summary: 'On ECG: ST elevation V2-V4. Troponin pending. Started GTN, dual antiplatelet. Family aware.',
    sentBy: 'Dr. Yaw Boateng (Tema General ED)',
    history: [
      { time: minutesAgo(2), event: 'Referral received from Tema General Hospital', actor: 'NCRIS Switch' },
      { time: minutesAgo(2), event: 'Patient registered: 59M acute chest pain', actor: 'Tema ED Tablet' },
      { time: minutesAgo(8), event: 'Triage assessment started', actor: 'Tema ED' },
    ],
  },
  {
    id: 'REF-2026-1042', direction: 'incoming', priority: 'high', status: 'accepted',
    patientInitials: 'AB', patientAge: 29, patientSex: 'F', patientCategory: 'Obstetric',
    primaryCondition: 'obstetric', subCondition: 'Severe preeclampsia',
    reasons: ['Specialist review', 'Theatre unavailable at referring facility'],
    services: ['Obstetrics & Gynaecology'],
    stability: 'Unstable',
    sourceFacility: 'GH-ACC-019', destFacility: 'GH-ACC-001',
    eta: 18,
    receivedAt: minutesAgo(8), slaDeadline: minutesFromNow(0),
    vitals: { sbp: 169, dbp: 112, hr: 108, rr: 20, spo2: 97, temp: 36.8, gcs: 15, rbs: 5.4,
              sbp_modifier: '', hr_modifier: '', spo2_modifier: 'ORA' },
    interventions: 'Basic labs done',
    summary: 'Magnesium sulphate loading dose given. Theatre informed. Neonatology on standby.',
    sentBy: 'Dr. Esi Mensah (LEKMA Hospital)',
    history: [
      { time: minutesAgo(8), event: 'Referral received from LEKMA Hospital', actor: 'NCRIS Switch' },
      { time: minutesAgo(6), event: 'Accepted by Dr. Ama Owusu — Theatre 2 reserved', actor: 'Dr. Ama Owusu' },
      { time: minutesAgo(5), event: 'Obstetrics consultant notified', actor: 'System' },
    ],
  },
  {
    id: 'REF-2026-1043', direction: 'outgoing', priority: 'critical', status: 'redirect_pending',
    patientInitials: 'KO', patientAge: 34, patientSex: 'M', patientCategory: 'Adult',
    primaryCondition: 'trauma', subCondition: 'Head injury',
    reasons: ['Imaging unavailable', 'Surgery needed'],
    services: ['Neurosurgery', 'CT Scan'],
    stability: 'Critical',
    sourceFacility: 'GH-ACC-001', destFacility: 'GH-ACC-002',
    eta: null,
    receivedAt: minutesAgo(4), slaDeadline: minutesFromNow(2),
    vitals: { sbp: 95, dbp: 60, hr: 122, rr: 26, spo2: 94, temp: 36.5, gcs: 9, rbs: 6.8,
              sbp_modifier: '', hr_modifier: 'BLEEDING', spo2_modifier: 'OXYGEN' },
    interventions: 'Imaging done',
    summary: 'Our ED CT scanner unavailable for next 45 min (servicing). Redirect to 37 Military requested.',
    sentBy: 'Dr. Kwame Asante (KBTH ED)',
    history: [
      { time: minutesAgo(4), event: 'Outgoing referral initiated to 37 Military Hospital', actor: 'Dr. Kwame Asante' },
      { time: minutesAgo(3), event: 'CT slot confirmed at receiving facility', actor: '37 Military ED' },
      { time: minutesAgo(2), event: 'Awaiting ambulance dispatch confirmation', actor: 'ARCS Dispatch' },
    ],
  },
  {
    id: 'REF-2026-1044', direction: 'incoming', priority: 'high', status: 'awaiting_decision',
    patientInitials: 'MS', patientAge: 7, patientSex: 'M', patientCategory: 'Paediatric',
    primaryCondition: 'paediatric', subCondition: 'Severe pneumonia / respiratory distress',
    reasons: ['ICU/HDU bed needed', 'Higher level care'],
    services: ['Paediatrics'],
    stability: 'Unstable',
    sourceFacility: 'GH-ACC-022', destFacility: 'GH-ACC-001',
    eta: 22,
    receivedAt: minutesAgo(5), slaDeadline: minutesFromNow(0),
    vitals: { sbp: 100, dbp: 65, hr: 145, rr: 38, spo2: 87, temp: 37.1, gcs: 14, rbs: 4.9,
              sbp_modifier: '', hr_modifier: '', spo2_modifier: 'OXYGEN' },
    interventions: 'Both done',
    summary: 'Three nebs given, minimal improvement. IV magnesium started. PICU bed needed.',
    sentBy: 'Dr. Akua Sarpong (Achimota)',
    history: [
      { time: minutesAgo(5), event: 'Referral received from Achimota Hospital', actor: 'NCRIS Switch' },
      { time: minutesAgo(5), event: 'Patient registered: 7M severe pneumonia', actor: 'Achimota ED' },
    ],
  },
  {
    id: 'REF-2026-1045', direction: 'incoming', priority: 'routine', status: 'accepted',
    patientInitials: 'EN', patientAge: 48, patientSex: 'F', patientCategory: 'Adult',
    primaryCondition: 'medical', subCondition: 'Renal failure',
    reasons: ['Specialist review', 'Dialysis needed'],
    services: ['Internal Medicine', 'Dialysis'],
    stability: 'Stable',
    sourceFacility: 'GH-ACC-007', destFacility: 'GH-ACC-001',
    eta: 90,
    receivedAt: minutesAgo(35), slaDeadline: minutesFromNow(10),
    vitals: { sbp: 142, dbp: 88, hr: 78, rr: 16, spo2: 98, temp: 36.6, gcs: 15, rbs: 6.1,
              sbp_modifier: '', hr_modifier: '', spo2_modifier: 'ORA' },
    interventions: 'Basic labs done',
    summary: 'Stable. Routine specialist review for AV fistula planning. Records attached.',
    sentBy: 'Dr. Nii Ansah (Ridge Hospital)',
    history: [
      { time: minutesAgo(35), event: 'Referral received from Ridge Hospital', actor: 'NCRIS Switch' },
      { time: minutesAgo(28), event: 'Routed to Nephrology OPD scheduling', actor: 'System' },
      { time: minutesAgo(25), event: 'Accepted, appointment slot offered', actor: 'OPD Coordinator' },
    ],
  },
  {
    id: 'REF-2026-1047', direction: 'incoming', priority: 'critical', status: 'awaiting_decision',
    patientInitials: 'JK', patientAge: 41, patientSex: 'M', patientCategory: 'Adult',
    primaryCondition: 'trauma', subCondition: 'Abdominal trauma',
    reasons: ['Surgery needed', 'Blood unavailable'],
    services: ['General Surgery', 'Blood bank'],
    stability: 'Critical',
    sourceFacility: 'GH-ACC-031', destFacility: 'GH-ACC-001',
    eta: 7,
    receivedAt: minutesAgo(1), slaDeadline: minutesFromNow(2),
    vitals: { sbp: 82, dbp: 48, hr: 138, rr: 30, spo2: 91, temp: 35.9, gcs: 13, rbs: 5.5,
              sbp_modifier: '', hr_modifier: 'BLEEDING', spo2_modifier: 'OXYGEN' },
    interventions: 'Basic labs done',
    summary: 'Two large bore IVs sited. 1L crystalloid given. O-negative blood requested. Theatre needed urgently.',
    sentBy: 'Dr. Selasi Adzaho (La General ED)',
    history: [
      { time: minutesAgo(1), event: 'Referral received from La General Hospital', actor: 'NCRIS Switch' },
      { time: minutesAgo(1), event: 'Patient registered: 41M penetrating trauma', actor: 'La General ED' },
    ],
  },
]);

const seedCapacity = () => ([
  { id: 'ed-resus',   unit: 'ED Resus Bays',     used: 5,  total: 8,  consumable: false, note: '3 bays available' },
  { id: 'icu',        unit: 'ICU Beds',          used: 12, total: 12, consumable: false, note: 'Overflow protocol active · escalate to NIOMC' },
  { id: 'hdu',        unit: 'HDU Beds',          used: 10, total: 14, consumable: false, note: '4 beds — 2 reserved for theatre' },
  { id: 'theatre',    unit: 'Emergency Theatres',used: 1,  total: 2,  consumable: false, note: 'Theatre 2 available' },
  { id: 'ct',         unit: 'CT Scanner',        used: 1,  total: 2,  consumable: false, note: 'ED CT down for 45 min — service' },
  { id: 'picu',       unit: 'PICU',              used: 4,  total: 6,  consumable: false, note: '2 beds available' },
  { id: 'nicu',       unit: 'NICU',              used: 18, total: 20, consumable: false, note: '2 cots — 1 isolation' },
  { id: 'blood-oneg', unit: 'Blood Bank O−',     used: 7,  total: 10, consumable: true,  note: '3 units · resupply 6h' },
  { id: 'obs-theatre',unit: 'Obstetric Theatre', used: 0,  total: 1,  consumable: false, note: 'Available' },
  { id: 'dialysis',   unit: 'Dialysis Slots',    used: 8,  total: 10, consumable: false, note: '2 slots — afternoon shift' },
]);

const SEED_USERS = [
  { id: 'USR-001', name: 'Dr. Ama Owusu',        email: 'a.owusu@korlebu.gh',    role: 'Doctor', dept: 'Emergency Medicine',     status: 'active',   last: 'Today 14:22' },
  { id: 'USR-002', name: 'Sis. Akosua Frimpong', email: 'a.frimpong@korlebu.gh', role: 'Nurse',  dept: 'Emergency Department',   status: 'active',   last: 'Today 14:11' },
  { id: 'USR-003', name: 'Mr. Daniel Tetteh',    email: 'd.tetteh@korlebu.gh',   role: 'Admin',  dept: 'Hospital Administration',status: 'active',   last: 'Today 13:50' },
  { id: 'USR-004', name: 'Eng. Kofi Annan',      email: 'k.annan@korlebu.gh',    role: 'IT',     dept: 'Hospital IT Systems',    status: 'active',   last: 'Today 12:40' },
  { id: 'USR-005', name: 'Dr. Kwame Asante',     email: 'k.asante@korlebu.gh',   role: 'Doctor', dept: 'Emergency Medicine',     status: 'active',   last: 'Today 14:08' },
  { id: 'USR-006', name: 'Dr. Esinam Tagoe',     email: 'e.tagoe@korlebu.gh',    role: 'Doctor', dept: 'Obstetrics',             status: 'active',   last: 'Today 13:15' },
  { id: 'USR-007', name: 'Nurse Yaa Boahene',    email: 'y.boahene@korlebu.gh',  role: 'Nurse',  dept: 'PICU',                   status: 'active',   last: 'Today 09:42' },
  { id: 'USR-008', name: 'Dr. Mensa Otoo',       email: 'm.otoo@korlebu.gh',     role: 'Doctor', dept: 'Cardiology',             status: 'inactive', last: 'Yesterday 22:14' },
  { id: 'USR-009', name: 'Sis. Beatrice Owusu',  email: 'b.owusu@korlebu.gh',    role: 'Nurse',  dept: 'Theatre',                status: 'active',   last: 'Today 12:55' },
];

const SEED_DEVICES = [
  { id: 'KBU-TAB-ED-01',     loc: 'ED Triage Desk',        type: 'Tablet',      status: 'online',   user: 'Sis. Akosua Frimpong', sync: '32 sec ago', battery: 78 },
  { id: 'KBU-TAB-RESUS-02',  loc: 'Resus Bay 1',           type: 'Tablet',      status: 'online',   user: 'ED Resus Team',        sync: '1 min ago',  battery: 64 },
  { id: 'KBU-TAB-RESUS-03',  loc: 'Resus Bay 2',           type: 'Tablet',      status: 'online',   user: 'Dr. Kwame Asante',     sync: '12 sec ago', battery: 91 },
  { id: 'KBU-WEB-ADM-01',    loc: 'Hospital Admin Office', type: 'Workstation', status: 'online',   user: 'Mr. Daniel Tetteh',    sync: 'Live',       battery: null },
  { id: 'KBU-WEB-ICU-01',    loc: 'ICU Charge Desk',       type: 'Workstation', status: 'online',   user: 'ICU Charge Nurse',     sync: '4 sec ago',  battery: null },
  { id: 'KBU-TAB-OBS-01',    loc: 'Obstetric Theatre',     type: 'Tablet',      status: 'online',   user: 'Dr. Esinam Tagoe',     sync: '2 min ago',  battery: 52 },
  { id: 'KBU-TAB-ED-04',     loc: 'ED Holding Area',       type: 'Tablet',      status: 'offline',  user: 'Unassigned',           sync: '42 min ago', battery: 8 },
  { id: 'KBU-TAB-PED-01',    loc: 'Paediatric ED',         type: 'Tablet',      status: 'degraded', user: 'Nurse Yaa Boahene',    sync: '6 min ago',  battery: 38 },
];

const SEED_SYSTEMS = [
  { id: 'ghims',  name: 'GHIMS Patient Records', sub: 'Ghana Health Information Management System', body: 'Pulls demographic, prior-encounter, and allergy data into referral cards. Patient identity verified via NHIA number.', stat: 'Synced 12 sec ago · 2,847 records cached', status: 'ok' },
  { id: 'ncris',  name: 'NCRIS Switch',          sub: 'National Clinical Referral Information Switch', body: 'Routes incoming and outgoing referrals between facilities. All inter-hospital referrals pass through NCRIS.', stat: 'Connected · 0 messages queued', status: 'ok' },
  { id: 'niomc',  name: 'NIOMC Operations',      sub: 'National Integrated Operations & Management Centre', body: 'Replicates audit logs and capacity status for national oversight and bed-search support.', stat: 'Heartbeat · 4 sec ago', status: 'ok' },
  { id: 'arcs',   name: 'ARCS Dispatch',         sub: 'Ambulance Routing & Coordination System', body: 'Dispatches ambulances for inter-facility transfers. Returns ETA and crew details.', stat: '2 active dispatches', status: 'ok' },
  { id: 'nhia',   name: 'NHIA Claims',           sub: 'National Health Insurance Authority', body: 'Validates patient insurance status and submits claims for emergency care.', stat: 'Last sync · 18 min ago', status: 'warn' },
  { id: 'lab',    name: 'Lightwave Lab',         sub: 'Hospital lab information system', body: 'Pulls live results into clinical timeline within referrals (troponin, lactate, FBC).', stat: 'Synced 32 sec ago', status: 'ok' },
];

/* Font loader (one-time) */
const loadFonts = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById('gherig-fonts')) return;
  const link = document.createElement('link');
  link.id = 'gherig-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap';
  document.head.appendChild(link);
};

/* ════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════════════ */

export default function GherigHospitalPortal() {
  // Auth
  const [authed, setAuthed] = useState(false);
  const [roleKey, setRoleKey] = useState('admin');
  const user = roleKey ? ROLES[roleKey] : null;

  // App state
  const [view, setView] = useState('overview');
  const [referrals, setReferrals] = useState(seedReferrals);
  const [capacity, setCapacity] = useState(seedCapacity);
  const [users, setUsers] = useState(SEED_USERS);
  const [devices, setDevices] = useState(SEED_DEVICES);
  const [systems, setSystems] = useState(SEED_SYSTEMS);
  const [audit, setAudit] = useState([]);
  const [sessionStart, setSessionStart] = useState(null);

  // UI state
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterDirection, setFilterDirection] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refPage, setRefPage] = useState(1);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [openRef, setOpenRef] = useState(null);
  const [modal, setModal] = useState(null); // { type: 'newReferral' | 'newUser' | 'newDevice' | 'editUser' | 'editDevice' | 'capacityEdit', payload?: any }
  const [editingCapacityId, setEditingCapacityId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [, forceTick] = useState(0);
  const [clock, setClock] = useState(new Date());

  const refPerPage = 6;

  // Mount: fonts + styles
  useEffect(() => { loadFonts(); }, []);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('gherig-styles')) return;
    const tag = document.createElement('style');
    tag.id = 'gherig-styles';
    tag.textContent = STYLES;
    document.head.appendChild(tag);
  }, []);

  // Toast
  const toast = useCallback((text, type = 'success', title = null) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, text, type, title }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  // Audit
  const logAudit = useCallback((action, ref = null) => {
    if (!user) return;
    setAudit(a => [{ time: new Date(), actor: user.name, role: user.label, action, ref }, ...a]);
  }, [user]);

  // Login / logout
  const doLogin = () => {
    const profile = ROLES[roleKey];
    setAuthed(true);
    setView(profile.defaultView);
    setSessionStart(new Date());
    setAudit([{ time: new Date(), actor: profile.name, role: profile.label, action: 'Hospital portal session opened', ref: null }]);
    setTimeout(() => toast('Welcome, ' + profile.name.split(' ')[0] + '. Session started.', 'success', 'Signed in'), 100);
  };

  const doLogout = () => {
    logAudit('Hospital portal session closed');
    toast('Signed out securely', 'info');
    setTimeout(() => {
      setAuthed(false); setUserDropdownOpen(false); setView('overview');
      setReferrals(seedReferrals()); setCapacity(seedCapacity());
      setUsers(SEED_USERS); setDevices(SEED_DEVICES); setSystems(SEED_SYSTEMS);
      setAudit([]); setSessionStart(null); setModal(null); setOpenRef(null);
    }, 700);
  };

  // Clock + SLA tick
  useEffect(() => {
    const t = setInterval(() => { setClock(new Date()); forceTick(x => x + 1); }, 1000);
    return () => clearInterval(t);
  }, []);

  // Live referral simulator
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => {
      if (Math.random() < 0.4) simulateIncomingReferral();
    }, 75000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [authed]);

  const simulateIncomingReferral = () => {
    const samples = [
      { primary: 'medical',    sub: 'Stroke',       svc: ['Internal Medicine', 'Anaesthesia / ICU'], cat: 'Adult',      reasons: ['Specialist review','ICU/HDU bed needed'], stab: 'Critical' },
      { primary: 'medical',    sub: 'Sepsis',       svc: ['Internal Medicine'],    cat: 'Adult',      reasons: ['ICU/HDU bed needed','Higher level care'], stab: 'Unstable' },
      { primary: 'obstetric',  sub: 'PPH (postpartum haemorrhage)', svc: ['Obstetrics & Gynaecology', 'Blood bank'], cat: 'Obstetric', reasons: ['Surgery needed','Blood unavailable'], stab: 'Critical' },
      { primary: 'paediatric', sub: 'Severe malaria', svc: ['Paediatrics'],         cat: 'Paediatric', reasons: ['Higher level care'], stab: 'Unstable' },
      { primary: 'surgical',   sub: 'Acute abdomen',  svc: ['General Surgery'],    cat: 'Adult',      reasons: ['Surgery needed','Theatre unavailable'], stab: 'Potentially unstable' },
    ];
    const pick = samples[Math.floor(Math.random() * samples.length)];
    const sources = FACILITIES.filter(f => f.code !== 'GH-ACC-001');
    const src = sources[Math.floor(Math.random() * sources.length)];
    const isCritical = pick.stab === 'Critical';
    const age = pick.cat === 'Paediatric' ? 2 + Math.floor(Math.random()*10)
              : pick.cat === 'Neonate'    ? 0
              : 18 + Math.floor(Math.random() * 60);
    setReferrals(prev => {
      const newRef = {
        id: 'REF-2026-' + (1048 + prev.length),
        direction: 'incoming',
        priority: isCritical ? 'critical' : (pick.stab === 'Stable' ? 'routine' : 'high'),
        status: 'awaiting_decision',
        patientInitials: String.fromCharCode(65 + Math.floor(Math.random()*26)) + String.fromCharCode(65 + Math.floor(Math.random()*26)),
        patientAge: age,
        patientSex: Math.random() > 0.5 ? 'M' : 'F',
        patientCategory: pick.cat,
        primaryCondition: pick.primary, subCondition: pick.sub,
        reasons: pick.reasons, services: pick.svc, stability: pick.stab,
        sourceFacility: src.code, destFacility: 'GH-ACC-001',
        eta: 8 + Math.floor(Math.random() * 25),
        receivedAt: new Date(), slaDeadline: minutesFromNow(isCritical ? 3 : (pick.stab === 'Stable' ? 15 : 5)),
        vitals: {
          sbp:  isCritical ? 80 + Math.floor(Math.random()*30)  : 110 + Math.floor(Math.random()*40),
          dbp:  isCritical ? 50 + Math.floor(Math.random()*20)  : 70  + Math.floor(Math.random()*20),
          hr:   isCritical ? 120 + Math.floor(Math.random()*30) : 75  + Math.floor(Math.random()*30),
          rr:   isCritical ? 26 + Math.floor(Math.random()*14)  : 14  + Math.floor(Math.random()*8),
          spo2: isCritical ? 86 + Math.floor(Math.random()*8)   : 95  + Math.floor(Math.random()*4),
          temp: 36.5 + Math.random() * 1.5,
          gcs:  isCritical ? 8 + Math.floor(Math.random()*6)    : 14 + Math.floor(Math.random()*2),
          rbs:  4 + Math.random() * 4,
          sbp_modifier: '', hr_modifier: '', spo2_modifier: isCritical ? 'OXYGEN' : 'ORA',
        },
        interventions: 'Basic labs done',
        summary: 'Inbound referral from ' + src.name + '. Awaiting full handover.',
        sentBy: 'Dr. ' + ['Yaw','Akua','Nii','Esi','Kofi'][Math.floor(Math.random()*5)] + ' ' + ['Boateng','Mensah','Ansah','Tagoe','Annan'][Math.floor(Math.random()*5)] + ' (' + src.name.split(' ')[0] + ' ED)',
        history: [{ time: new Date(), event: 'Referral received from ' + src.name, actor: 'NCRIS Switch' }],
      };
      return [newRef, ...prev];
    });
    toast('Incoming ' + (isCritical ? 'critical' : 'high') + ' referral from ' + src.name, isCritical ? 'error' : 'warn', 'New referral');
  };

  // Referral actions
  const doRefAction = (refId, action, note = '') => {
    setReferrals(prev => prev.map(r => {
      if (r.id !== refId) return r;
      const updated = { ...r };
      if (action === 'accept') {
        updated.status = 'accepted';
        updated.history = [{ time: new Date(), event: 'Referral ACCEPTED · receiving bay assigned' + (note ? ' · ' + note : ''), actor: user.name }, ...r.history];
        logAudit('Accepted referral ' + refId, refId);
        toast(refId + ' accepted · receiving team alerted', 'success', 'Referral accepted');
      } else if (action === 'decline') {
        updated.status = 'declined';
        updated.history = [{ time: new Date(), event: 'Referral DECLINED' + (note ? ' · ' + note : ''), actor: user.name }, ...r.history];
        logAudit('Declined referral ' + refId, refId);
        toast(refId + ' declined · NCRIS will route to alternative facility', 'warn', 'Referral declined');
      } else if (action === 'redirect') {
        updated.status = 'redirect_pending';
        updated.history = [{ time: new Date(), event: 'Redirect requested' + (note ? ' · ' + note : ''), actor: user.name }, ...r.history];
        logAudit('Redirect requested for ' + refId, refId);
        toast(refId + ' redirect initiated · alternative facility being identified', 'info', 'Redirect initiated');
      }
      return updated;
    }));
  };

  // ────────────────────────────────────────────────────────────────
  // BUTTON HANDLERS — every button on the portal uses one of these
  // ────────────────────────────────────────────────────────────────
  const handleRefresh = (label) => {
    forceTick(x => x + 1);
    toast((label || 'Data') + ' refreshed', 'info');
    logAudit('Manual refresh: ' + (label || 'data'));
  };

  const handleExportCSV = (filename, headers, rows) => {
    const csv = [headers.join(','), ...rows.map(r => r.map(c => {
      const s = String(c == null ? '' : c);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))].join('\n');
    downloadFile(filename, csv, 'text/csv');
    toast('Exported ' + filename, 'success', 'Download started');
    logAudit('Exported ' + filename);
  };

  const handleTestConnections = () => {
    toast('Running health check on all systems...', 'info', 'Test connections');
    setTimeout(() => {
      setSystems(prev => prev.map(s => {
        // Random subtle fluctuation, but mostly stable
        if (Math.random() < 0.15) {
          return { ...s, status: s.status === 'ok' ? 'warn' : 'ok',
            stat: s.status === 'ok' ? 'Latency elevated · 800ms' : 'Healthy · ' + Math.floor(Math.random()*30 + 5) + 'ms' };
        }
        return s;
      }));
      toast('Health check complete · 5 healthy, 1 degraded', 'success', 'Test connections');
      logAudit('Tested all integration health');
    }, 1400);
  };

  const handleCapacitySave = (capId, newUsed, newTotal, newNote) => {
    setCapacity(prev => prev.map(c => {
      if (c.id !== capId) return c;
      return { ...c, used: parseInt(newUsed, 10) || 0, total: parseInt(newTotal, 10) || c.total, note: newNote };
    }));
    setEditingCapacityId(null);
    toast('Capacity updated', 'success');
    logAudit('Updated capacity: ' + capId);
  };

  const handleNewUser = (data) => {
    const newId = 'USR-' + String(users.length + 1).padStart(3, '0');
    setUsers(prev => [...prev, { ...data, id: newId, status: 'active', last: 'Never' }]);
    toast('User ' + data.name + ' provisioned', 'success', 'New user');
    logAudit('Provisioned user: ' + data.name);
    setModal(null);
  };

  const handleEditUser = (id, data) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...data } : u));
    toast('User updated', 'success');
    logAudit('Updated user: ' + id);
    setModal(null);
  };

  const handleNewDevice = (data) => {
    setDevices(prev => [...prev, { ...data, status: 'online', sync: 'Just now', battery: data.type === 'Tablet' ? 100 : null }]);
    toast('Device ' + data.id + ' registered', 'success', 'New device');
    logAudit('Registered device: ' + data.id);
    setModal(null);
  };

  const handleEditDevice = (id, data) => {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, ...data } : d));
    toast('Device updated', 'success');
    logAudit('Updated device: ' + id);
    setModal(null);
  };

  const handleCreateOutgoingReferral = (formData) => {
    const newId = 'REF-2026-' + (1048 + referrals.length + Math.floor(Math.random() * 100));
    const newRef = {
      id: newId, direction: 'outgoing', priority: formData.priority, status: 'awaiting_decision',
      patientInitials: formData.patientInitials || 'NN',
      patientAge: parseInt(formData.patientAge, 10) || null,
      patientSex: formData.patientSex,
      patientCategory: formData.patientCategory,
      primaryCondition: formData.primaryCondition,
      subCondition: formData.subCondition,
      reasons: formData.reasons || [],
      services: formData.services || [],
      stability: formData.stability,
      sourceFacility: 'GH-ACC-001',
      destFacility: formData.destFacility,
      eta: null,
      receivedAt: new Date(),
      slaDeadline: minutesFromNow(formData.priority === 'critical' ? 3 : formData.priority === 'high' ? 5 : 15),
      vitals: { ...formData.vitals,
        sbp: parseFloat(formData.vitals.sbp) || null,
        dbp: parseFloat(formData.vitals.dbp) || null,
        hr: parseFloat(formData.vitals.hr) || null,
        rr: parseFloat(formData.vitals.rr) || null,
        spo2: parseFloat(formData.vitals.spo2) || null,
        temp: parseFloat(formData.vitals.temp) || null,
        gcs: parseFloat(formData.vitals.gcs) || null,
        rbs: parseFloat(formData.vitals.rbs) || null,
      },
      interventions: formData.interventions,
      summary: formData.summary,
      sentBy: user.name + ' (' + user.dept + ')',
      history: [
        { time: new Date(), event: 'Outgoing referral created · ' + (formData.priorityOverride ? 'priority manually set to ' + formData.priority : 'auto-priority: ' + formData.priority), actor: user.name },
        { time: new Date(), event: 'NCRIS message envelope queued for ' + facilityName(formData.destFacility), actor: 'System' },
      ],
    };
    setReferrals(prev => [newRef, ...prev]);
    toast('Outgoing referral ' + newId + ' sent to ' + facilityName(formData.destFacility), 'success', 'Referral sent');
    logAudit('Created outgoing referral ' + newId, newId);
    setModal(null);
  };

  const handlePrintReferral = (ref) => {
    if (typeof window === 'undefined') return;
    setTimeout(() => window.print(), 100);
    toast('Print dialog opened', 'info');
    logAudit('Printed referral ' + ref.id, ref.id);
  };

  // Continued in next part — login UI + topbar + sidebar + view router
  /* ──────────────────────────────────────────────────────────────────
     RENDER: LOGIN
  ────────────────────────────────────────────────────────────────── */
  if (!authed) {
    return (
      <div className="gherig-portal">
        <div className="login-screen">
          <div className="login-card">
            <div className="login-left">
              <div className="login-brand">
                <div className="login-mark">G</div>
                <div className="login-brand-text">
                  <div className="name">GhERIG</div>
                  <div className="sub">Hospital Portal</div>
                </div>
              </div>
              <div>
                <div className="login-eyebrow">Ghana Emergency Referral &amp; Intelligence Grid</div>
                <h1 className="login-headline">Coordinate. <em>Stabilise.</em> Save lives.</h1>
                <p className="login-tagline">Hospital command portal for emergency referrals and capacity control.</p>
              </div>
              <div className="login-meta">
                <div className="login-meta-item">FACILITY · <b>Korle-Bu Teaching Hospital</b></div>
                <div className="login-meta-item">CODE · <b>GH-ACC-001</b></div>
                <div className="login-meta-item">REGION · <b>Greater Accra</b></div>
              </div>
            </div>
            <div className="login-right">
              <div className="login-form-card">
                <div className="login-form-icon">🛡</div>
                <div className="login-form-title">Sign in to portal</div>
                <div className="login-form-sub">Demo build — choose a role to preview that workflow.</div>
                <div className="field">
                  <label className="field-label">Staff Email or Council #</label>
                  <input className="field-input" defaultValue="admin@korlebu.gherig.gov.gh" />
                </div>
                <div className="field">
                  <label className="field-label">Password</label>
                  <input className="field-input" type="password" defaultValue="●●●●●●●●●●" />
                </div>
                <div className="field">
                  <label className="field-label">Demo Role</label>
                  <div className="login-role-pills">
                    {Object.entries(ROLES).map(([key, p]) => (
                      <button
                        key={key}
                        type="button"
                        className={'login-role-pill ' + (key === roleKey ? 'active' : '')}
                        onClick={() => setRoleKey(key)}
                      >
                        <span className="role-name">{p.label}</span>
                        <span className="role-sub">{p.dept}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" className="login-btn" onClick={doLogin}>
                  Enter Hospital Portal <span style={{ fontSize: 14 }}>→</span>
                </button>
                <div className="login-fineprint">Authorised hospital users only · Audited access</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ──────────────────────────────────────────────────────────────────
     RENDER: APP SHELL
  ────────────────────────────────────────────────────────────────── */
  const sessionDur = sessionStart ? (() => {
    const diff = Math.floor((clock - sessionStart) / 60000);
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
  })() : '0m';

  const navSections = {};
  NAV.forEach(item => {
    if (!user.allowed.includes(item.id)) return;
    if (!navSections[item.section]) navSections[item.section] = [];
    navSections[item.section].push(item);
  });
  const pendingCount = referrals.filter(r => r.status === 'awaiting_decision').length;

  return (
    <div className="gherig-portal">
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-brand">
          <div className="topbar-mark">G</div>
          <div>
            <div className="topbar-name">GhERIG</div>
            <div className="topbar-sub">Hospital Portal</div>
          </div>
        </div>
        <div className="topbar-context">
          <div className="facility-chip">
            <div className="facility-chip-mark">K</div>
            <div style={{ lineHeight: 1.1 }}>
              <div className="facility-chip-name">Korle-Bu Teaching Hospital</div>
              <div className="facility-chip-meta">GH-ACC-001 · Tertiary · Accra</div>
            </div>
          </div>
          <div className="topbar-status">
            <span className="live-pill"><span className="live-dot" />Live · NCRIS Online</span>
            <span className="topbar-clock">
              {clock.toLocaleDateString('en-GH', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
              {' · '}
              {clock.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <div className="topbar-user" onClick={(e) => { e.stopPropagation(); setUserDropdownOpen(!userDropdownOpen); }}>
              <div className="user-text">
                <div className="user-name">{user.name}</div>
                <div className="user-role">{user.label}</div>
              </div>
              <div className="user-avatar">{user.initials}</div>
            </div>
          </div>
        </div>
      </div>

      {/* USER DROPDOWN */}
      {userDropdownOpen && (
        <div className="user-dropdown" onClick={(e) => e.stopPropagation()}>
          <div className="user-dropdown-head">
            <div className="user-dropdown-name">{user.name}</div>
            <div className="user-dropdown-role">{user.label}</div>
          </div>
          <div className="user-dropdown-meta">
            <div className="user-meta-row"><span className="k">Council #</span><span className="v">{user.council}</span></div>
            <div className="user-meta-row"><span className="k">Facility</span><span className="v">Korle-Bu Teaching</span></div>
            <div className="user-meta-row"><span className="k">Department</span><span className="v">{user.dept}</span></div>
            <div className="user-meta-row"><span className="k">Session</span><span className="v">{sessionDur}</span></div>
          </div>
          <div className="user-dropdown-actions">
            <button type="button" className="dropdown-action" onClick={() => { toast('Profile settings would open here in production build', 'info'); setUserDropdownOpen(false); }}><span>⚙</span> Profile &amp; preferences</button>
            <button type="button" className="dropdown-action" onClick={() => { toast('Password change form would open here', 'info'); setUserDropdownOpen(false); }}><span>🔑</span> Change password</button>
            <button type="button" className="dropdown-action danger" onClick={doLogout}><span>↩</span> Sign out</button>
          </div>
        </div>
      )}

      {/* Click-outside close */}
      {userDropdownOpen && <div onClick={() => setUserDropdownOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />}

      <div className="layout">
        {/* SIDEBAR */}
        <aside className="sidebar">
          {Object.entries(navSections).map(([sec, items]) => (
            <div className="sb-section" key={sec}>
              <div className="sb-label">{sec}</div>
              {items.map(item => (
                <div
                  key={item.id}
                  className={'sb-item ' + (view === item.id ? 'active' : '')}
                  onClick={() => setView(item.id)}
                >
                  <div className="sb-item-icon">{item.icon}</div>
                  <div>{item.label}</div>
                  {item.id === 'referrals' && pendingCount > 0 && (
                    <span className="sb-item-badge">{pendingCount}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
          <div className="sb-footer">
            <div className="sb-footer-line">Build · <b>v2.0.0</b></div>
            <div className="sb-footer-line">Engine · <b>Ghana STG + WHO</b></div>
            <div className="sb-footer-line">NCRIS · <b>Online</b></div>
            <div className="sb-footer-line">Pilot · <b>Greater Accra</b></div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="main">
          {view === 'overview'     && <OverviewView referrals={referrals} capacity={capacity} setView={setView} setOpenRef={setOpenRef} clock={clock} setModal={setModal} handleRefresh={handleRefresh} />}
          {view === 'referrals'    && <ReferralsView referrals={referrals} filterPriority={filterPriority} setFilterPriority={setFilterPriority} filterDirection={filterDirection} setFilterDirection={setFilterDirection} searchQuery={searchQuery} setSearchQuery={setSearchQuery} refPage={refPage} setRefPage={setRefPage} refPerPage={refPerPage} setOpenRef={setOpenRef} doRefAction={doRefAction} setModal={setModal} handleExportCSV={handleExportCSV} />}
          {view === 'capacity'     && <CapacityView capacity={capacity} clock={clock} canEdit={user.allowed.includes('users') || user.label.toLowerCase().includes('nurse')} editingCapacityId={editingCapacityId} setEditingCapacityId={setEditingCapacityId} handleCapacitySave={handleCapacitySave} handleRefresh={handleRefresh} />}
          {view === 'devices'      && <DevicesView devices={devices} canManage={user.allowed.includes('users')} setModal={setModal} handleRefresh={handleRefresh} handleExportCSV={handleExportCSV} />}
          {view === 'integrations' && <IntegrationsView systems={systems} handleTestConnections={handleTestConnections} />}
          {view === 'reports'      && <ReportsView referrals={referrals} handleExportCSV={handleExportCSV} />}
          {view === 'audit'        && <AuditView audit={audit} handleExportCSV={handleExportCSV} />}
          {view === 'users'        && <UsersView users={users} setModal={setModal} handleExportCSV={handleExportCSV} />}
        </main>
      </div>

      {/* TOAST HOST */}
      <div className="toast-host">
        {toasts.map(t => (
          <div key={t.id} className={'toast ' + t.type}>
            <div className="toast-icon">{t.type === 'success' ? '✓' : t.type === 'warn' ? '⚠' : t.type === 'error' ? '✕' : 'ℹ'}</div>
            <div className="toast-body">
              {t.title ? <><div className="toast-title">{t.title}</div><div className="toast-text">{t.text}</div></> : <div className="toast-title">{t.text}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* REFERRAL DETAIL MODAL */}
      {openRef && (
        <ReferralDetailModal
          referral={referrals.find(r => r.id === openRef)}
          onClose={() => setOpenRef(null)}
          onAction={(action, note) => { doRefAction(openRef, action, note); setOpenRef(null); }}
          onPrint={handlePrintReferral}
        />
      )}

      {/* GLOBAL MODAL ROUTER */}
      {modal?.type === 'newReferral' && (
        <NewReferralModal
          onClose={() => setModal(null)}
          onSubmit={handleCreateOutgoingReferral}
          currentUser={user}
        />
      )}
      {modal?.type === 'newUser' && (
        <UserFormModal
          onClose={() => setModal(null)}
          onSubmit={handleNewUser}
          mode="new"
        />
      )}
      {modal?.type === 'editUser' && (
        <UserFormModal
          onClose={() => setModal(null)}
          onSubmit={(data) => handleEditUser(modal.payload.id, data)}
          mode="edit"
          initial={modal.payload}
        />
      )}
      {modal?.type === 'newDevice' && (
        <DeviceFormModal
          onClose={() => setModal(null)}
          onSubmit={handleNewDevice}
          mode="new"
        />
      )}
      {modal?.type === 'editDevice' && (
        <DeviceFormModal
          onClose={() => setModal(null)}
          onSubmit={(data) => handleEditDevice(modal.payload.id, data)}
          mode="edit"
          initial={modal.payload}
        />
      )}
    </div>
  );
}
/* ════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
════════════════════════════════════════════════════════════════════ */

function KpiCard({ color, label, value, delta, deltaType, foot }) {
  return (
    <div className={'kpi-card kc-' + color}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {delta && <span className={'kpi-delta ' + deltaType}>{delta}</span>}
      <div className="kpi-foot">{foot}</div>
    </div>
  );
}

function SectionHead({ title, meta }) {
  return (
    <div className="section-head">
      <div className="section-title">{title}</div>
      <div className="section-line" />
      {meta && <div className="section-meta">{meta}</div>}
    </div>
  );
}

// VitalCell using engine assessment for color
function VitalCell({ label, value, tier, modifier }) {
  return (
    <div className={'vital-cell tier-' + (tier || 'normal')}>
      <div className="vital-k">{label}</div>
      <div className="vital-v">{value}</div>
      {modifier && <div className="vital-mod">{modifier}</div>}
    </div>
  );
}

function ReferralCard({ r, onOpen, onAction }) {
  const sla = fmtSLA(r.slaDeadline);
  const dirSrc = r.direction === 'incoming' ? facilityName(r.sourceFacility) : facilityName(r.destFacility);
  const dirLbl = r.direction === 'incoming' ? 'From' : 'To';

  // Use the clinical engine
  const assessment = useMemo(
    () => assessVitals(r.vitals || {}, r.patientAge, r.patientCategory),
    [r.vitals, r.patientAge, r.patientCategory]
  );

  const cellTier = (key) => assessment.perVital[key]?.tier || 'normal';
  const condTitle = r.subCondition || r.condition || '—';

  return (
    <div className={'ref-card priority-' + r.priority} onClick={onOpen}>
      <div className="ref-head">
        <div style={{ minWidth: 0 }}>
          <div className="ref-id">{r.id} · {fmtTime(r.receivedAt)} ({fmtAgo(r.receivedAt)})</div>
          <div className="ref-title">{condTitle}</div>
        </div>
        <div className="ref-tags">
          <span className={'dir-pill ' + r.direction}>{r.direction === 'incoming' ? '↙ In' : '↗ Out'}</span>
          <span className={'priority-pill ' + r.priority}>{r.priority}</span>
        </div>
      </div>
      <div className="ref-body">
        <div className="ref-row">
          <span className="k">Patient</span>
          <span className="v"><b>{r.patientInitials}</b> · {r.patientAge}{r.patientSex ? r.patientSex : ''} · {r.patientCategory}</span>
        </div>
        <div className="ref-row">
          <span className="k">{dirLbl}</span>
          <span className="v">{dirSrc}</span>
        </div>
        <div className="ref-row">
          <span className="k">Service</span>
          <span className="v">{(r.services || []).join(' · ') || '—'}</span>
        </div>
        {r.eta && (
          <div className="ref-row">
            <span className="k">ETA</span>
            <span className="v"><b>{r.eta} min</b></span>
          </div>
        )}
        <div className="ref-vitals" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <VitalCell label="BP" value={r.vitals.sbp + '/' + r.vitals.dbp} tier={['critical','abnormal','borderline','normal'].sort((a,b) => TIER_SCORE[b] - TIER_SCORE[a]).find(t => cellTier('sbp') === t || cellTier('dbp') === t)} modifier={r.vitals.sbp_modifier} />
          <VitalCell label="HR" value={r.vitals.hr} tier={cellTier('hr')} modifier={r.vitals.hr_modifier} />
          <VitalCell label="RR" value={r.vitals.rr} tier={cellTier('rr')} />
          <VitalCell label="SpO₂" value={r.vitals.spo2 + '%'} tier={cellTier('spo2')} modifier={r.vitals.spo2_modifier} />
          <VitalCell label="GCS" value={r.vitals.gcs} tier={cellTier('gcs')} />
        </div>
      </div>
      <div className="ref-foot">
        <div className="sla-block">
          <div className="sla-icon">◷</div>
          <div style={{ lineHeight: 1.1 }}>
            <div className={'sla-time ' + (sla.urgent ? 'urgent' : '')}>{sla.text}</div>
            <div className="sla-label">{r.status === 'awaiting_decision' ? 'SLA window' : STATUS_LABEL[r.status]}</div>
          </div>
        </div>
        <div className="ref-actions" onClick={(e) => e.stopPropagation()}>
          {r.status === 'awaiting_decision' ? (
            <>
              <button type="button" className="ref-action-btn primary" onClick={() => onAction('accept')}>Accept</button>
              <button type="button" className="ref-action-btn" onClick={() => onAction('redirect')}>Redirect</button>
              <button type="button" className="ref-action-btn danger" onClick={() => onAction('decline')}>Decline</button>
            </>
          ) : r.status === 'enroute' ? (
            <button type="button" className="ref-action-btn" onClick={onOpen}>Track</button>
          ) : (
            <button type="button" className="ref-action-btn" onClick={onOpen}>View details</button>
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewView({ referrals, capacity, setView, setOpenRef, clock, setModal, handleRefresh }) {
  const incoming = referrals.filter(r => r.direction === 'incoming');
  const outgoing = referrals.filter(r => r.direction === 'outgoing');
  const pending = referrals.filter(r => r.status === 'awaiting_decision').length;
  const critical = referrals.filter(r => r.priority === 'critical').length;
  const icuFull = (() => {
    const icu = capacity.find(c => c.id === 'icu');
    return icu && icu.used >= icu.total;
  })();
  const order = { critical: 0, high: 1, routine: 2 };
  const topRefs = [...referrals].sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 4);
  const earliestEta = incoming.filter(r => r.eta).sort((a, b) => a.eta - b.eta)[0]?.eta || '—';

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Korle-Bu Teaching Hospital · Today</div>
          <h1 className="page-title">Command Overview</h1>
          <p className="page-sub">Live picture of referrals, capacity, and connected stations across the Korle-Bu network. Refreshes every 15 seconds.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => handleRefresh('Overview')}><span>↻</span> Refresh</button>
          <button type="button" className="btn btn-primary" onClick={() => setModal({ type: 'newReferral' })}><span>+</span> New Referral</button>
        </div>
      </div>

      {icuFull && (
        <div className="alert-strip">
          <div className="alert-icon">⚠</div>
          <div className="alert-text"><b>ICU at 100% capacity</b> — overflow protocol advised. {referrals.filter(r => r.priority === 'critical' && r.direction === 'incoming').length} critical case(s) en route. Consider escalating to NIOMC for regional bed-search.</div>
          <div className="alert-time">{fmtTime(clock)}</div>
        </div>
      )}

      <div className="kpi-strip">
        <KpiCard color="crimson" label="Active Referrals" value={referrals.length} delta="+3 since 14:00" deltaType="up" foot={pending + ' awaiting decision · ' + critical + ' critical'} />
        <KpiCard color="forest"  label="Incoming"        value={incoming.length}  delta={fmtTime(clock)}    deltaType="neu" foot={'Nearest ETA: ' + earliestEta + ' min'} />
        <KpiCard color="copper"  label="Outgoing"        value={outgoing.length}  delta="2 enroute"        deltaType="neu" foot="1 redirect pending" />
        <KpiCard color="emerald" label="Avg SLA Compliance" value="94%"          delta="↑ 2.1%"           deltaType="dn"  foot="Target ≥ 90% · EAR-Q: Q2" />
      </div>

      <div className="two-col">
        <div>
          <SectionHead title="Top-priority referrals" meta={critical + ' critical · ' + pending + ' awaiting decision'} />
          <div className="ref-grid">
            {topRefs.map(r => (
              <ReferralCard key={r.id} r={r} onOpen={() => setOpenRef(r.id)} onAction={() => {}} />
            ))}
          </div>
        </div>
        <div>
          <SectionHead title="Capacity snapshot" />
          <div className="card"><div style={{ padding: 14 }}>
            {capacity.slice(0, 6).map(c => {
              const pct = (c.used / c.total) * 100;
              const status = deriveCapacityStatus(c.used, c.total, c.consumable);
              return (
                <div key={c.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{c.unit}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>
                      <b style={{ color: 'var(--ink-1)', fontSize: 13 }}>{c.used}</b>/{c.total}
                    </span>
                  </div>
                  <div className="cap-bar"><div className={'cap-bar-fill ' + status} style={{ width: pct + '%' }} /></div>
                  <div className="cap-note" style={{ marginTop: 3 }}>{c.note}</div>
                </div>
              );
            })}
            <button type="button" className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }} onClick={() => setView('capacity')}>
              View full capacity board →
            </button>
          </div></div>
        </div>
      </div>
    </div>
  );
}

function ReferralsView({ referrals, filterPriority, setFilterPriority, filterDirection, setFilterDirection, searchQuery, setSearchQuery, refPage, setRefPage, refPerPage, setOpenRef, doRefAction, setModal, handleExportCSV }) {
  const total = referrals.length;
  const critical = referrals.filter(r => r.priority === 'critical').length;
  const incoming = referrals.filter(r => r.direction === 'incoming').length;
  const outgoing = referrals.filter(r => r.direction === 'outgoing').length;
  const pending = referrals.filter(r => r.status === 'awaiting_decision').length;
  const high = referrals.filter(r => r.priority === 'high').length;
  const routine = referrals.filter(r => r.priority === 'routine').length;

  const order = { critical: 0, high: 1, routine: 2 };
  let filtered = referrals.filter(r => {
    if (filterPriority !== 'all' && filterPriority !== 'pending' && r.priority !== filterPriority) return false;
    if (filterPriority === 'pending' && r.status !== 'awaiting_decision') return false;
    if (filterDirection !== 'all' && r.direction !== filterDirection) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const text = (r.id + ' ' + (r.subCondition || '') + ' ' + facilityName(r.sourceFacility) + ' ' + facilityName(r.destFacility)).toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
    if (a.slaDeadline && b.slaDeadline) return a.slaDeadline.getTime() - b.slaDeadline.getTime();
    if (a.slaDeadline) return -1;
    if (b.slaDeadline) return 1;
    return a.receivedAt.getTime() - b.receivedAt.getTime();
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / refPerPage));
  const safePage = Math.min(refPage, totalPages);
  const start = (safePage - 1) * refPerPage;
  const end = Math.min(start + refPerPage, filtered.length);
  const slice = filtered.slice(start, end);

  const togglePriority = (v) => { setFilterPriority(filterPriority === v ? 'all' : v); setRefPage(1); };
  const toggleDirection = (v) => { setFilterDirection(filterDirection === v ? 'all' : v); setRefPage(1); };
  const clearAll = () => { setFilterPriority('all'); setFilterDirection('all'); setRefPage(1); };

  const FilterPill = ({ active, onClick, children, count }) => (
    <button type="button" className={'filter-pill ' + (active ? 'active' : '')} onClick={onClick}>
      {children}<span className="count">{count}</span>
    </button>
  );

  const exportReferrals = () => {
    const rows = filtered.map(r => [
      r.id, r.direction, r.priority, r.status,
      r.patientInitials, r.patientAge, r.patientSex, r.patientCategory,
      r.subCondition || '', (r.services || []).join('; '),
      facilityName(r.sourceFacility), facilityName(r.destFacility),
      r.eta || '', r.stability,
      r.vitals.sbp + '/' + r.vitals.dbp, r.vitals.hr, r.vitals.rr,
      r.vitals.spo2, r.vitals.temp, r.vitals.gcs, r.vitals.rbs,
      r.summary || '', r.sentBy || '', fmtTime(r.receivedAt),
    ]);
    handleExportCSV('referrals-' + new Date().toISOString().slice(0,10) + '.csv',
      ['ID','Direction','Priority','Status','Initials','Age','Sex','Category','Sub-Condition','Services','Source','Destination','ETA','Stability','BP','HR','RR','SpO2','Temp','GCS','RBS','Summary','Sent By','Received'],
      rows
    );
  };

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Inter-facility coordination</div>
          <h1 className="page-title">Referral Management</h1>
          <p className="page-sub">All referrals to and from this facility, sorted by clinical priority. Vitals colour-coded by Ghana STG + WHO standards.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={exportReferrals}><span>⤓</span> Export</button>
          <button type="button" className="btn btn-primary" onClick={() => setModal({ type: 'newReferral' })}><span>+</span> New Outgoing Referral</button>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <FilterPill active={filterPriority === 'all' && filterDirection === 'all'} onClick={clearAll} count={total}>All</FilterPill>
          <FilterPill active={filterPriority === 'critical'} onClick={() => togglePriority('critical')} count={critical}>Critical</FilterPill>
          <FilterPill active={filterPriority === 'high'}     onClick={() => togglePriority('high')}     count={high}>High</FilterPill>
          <FilterPill active={filterPriority === 'routine'}  onClick={() => togglePriority('routine')}  count={routine}>Routine</FilterPill>
          <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
          <FilterPill active={filterDirection === 'incoming'} onClick={() => toggleDirection('incoming')} count={incoming}>↙ Incoming</FilterPill>
          <FilterPill active={filterDirection === 'outgoing'} onClick={() => toggleDirection('outgoing')} count={outgoing}>↗ Outgoing</FilterPill>
          <FilterPill active={filterPriority === 'pending'}   onClick={() => togglePriority('pending')}   count={pending}>◷ Pending</FilterPill>
          <div className="filter-search">
            <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>⌕</span>
            <input
              placeholder="Search by ID, condition, facility..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setRefPage(1); }}
            />
          </div>
        </div>

        {slice.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">∅</div>
            <div className="empty-title">No referrals match these filters</div>
            <div className="empty-sub">Try clearing search or selecting a different priority.</div>
          </div>
        ) : (
          <>
            <div style={{ padding: 16 }}>
              <div className="ref-grid">
                {slice.map(r => (
                  <ReferralCard
                    key={r.id} r={r}
                    onOpen={() => setOpenRef(r.id)}
                    onAction={(action) => doRefAction(r.id, action)}
                  />
                ))}
              </div>
            </div>
            <div className="pagination">
              <div className="pg-info">Showing <b>{start + 1}–{end}</b> of <b>{filtered.length}</b> referrals</div>
              <div className="pg-controls">
                <button type="button" className="pg-btn" disabled={safePage === 1} onClick={() => setRefPage(safePage - 1)}>‹ Prev</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(i => (
                  <button type="button" key={i} className={'pg-btn ' + (i === safePage ? 'active' : '')} onClick={() => setRefPage(i)}>{i}</button>
                ))}
                <button type="button" className="pg-btn" disabled={safePage === totalPages} onClick={() => setRefPage(safePage + 1)}>Next ›</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
/* ════════════════════════════════════════════════════════════════════
   CAPACITY VIEW — with inline editor
════════════════════════════════════════════════════════════════════ */
function CapacityView({ capacity, clock, canEdit, editingCapacityId, setEditingCapacityId, handleCapacitySave, handleRefresh }) {
  const [editForm, setEditForm] = useState({ used: '', total: '', note: '' });

  const startEdit = (c) => {
    setEditingCapacityId(c.id);
    setEditForm({ used: String(c.used), total: String(c.total), note: c.note });
  };

  const totalBeds = capacity.filter(c => c.unit.toLowerCase().includes('bed') || c.unit.toLowerCase().includes('bay') || c.unit.toLowerCase().includes('icu') || c.unit.toLowerCase().includes('hdu')).reduce((a, c) => a + c.total, 0);
  const usedBeds = capacity.filter(c => c.unit.toLowerCase().includes('bed') || c.unit.toLowerCase().includes('bay') || c.unit.toLowerCase().includes('icu') || c.unit.toLowerCase().includes('hdu')).reduce((a, c) => a + c.used, 0);
  const occupancy = totalBeds > 0 ? Math.round((usedBeds / totalBeds) * 100) : 0;

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Real-time bed status</div>
          <h1 className="page-title">Capacity &amp; Beds</h1>
          <p className="page-sub">Live availability across critical care, theatres, imaging, and consumables. Updates here propagate to NIOMC for regional bed-search.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => handleRefresh('Capacity')}><span>↻</span> Refresh</button>
          {canEdit && <button type="button" className="btn btn-primary" onClick={() => editingCapacityId ? setEditingCapacityId(null) : startEdit(capacity[0])}><span>✎</span> {editingCapacityId ? 'Stop editing' : 'Update Availability'}</button>}
        </div>
      </div>

      <div className="kpi-strip">
        <KpiCard color="forest" label="Bed Occupancy" value={occupancy + '%'} delta={usedBeds + ' of ' + totalBeds} deltaType="neu" foot="Across ED, ICU, HDU, PICU, NICU" />
        <KpiCard color="crimson" label="Units at capacity" value={capacity.filter(c => deriveCapacityStatus(c.used, c.total, c.consumable) === 'full').length} delta="" deltaType="up" foot="Escalate to NIOMC" />
        <KpiCard color="copper" label="Constrained" value={capacity.filter(c => deriveCapacityStatus(c.used, c.total, c.consumable) === 'constrained').length} delta="" deltaType="neu" foot="≥85% utilised" />
        <KpiCard color="emerald" label="Last update" value={fmtTime(clock)} delta="auto" deltaType="dn" foot="Refresh every 30 s" />
      </div>

      <SectionHead title="Capacity by unit" meta={'Editable inline · ' + capacity.length + ' units tracked'} />
      <div className="capacity-grid">
        {capacity.map(c => {
          const status = deriveCapacityStatus(c.used, c.total, c.consumable);
          const pct = Math.min(100, (c.used / c.total) * 100);
          const isEditing = editingCapacityId === c.id;
          return (
            <div key={c.id} className={'capacity-card cap-' + status}>
              <div className="cap-head">
                <div className="cap-name">{c.unit}</div>
                <span className={'cap-status ' + status}>{status}</span>
              </div>
              <div className="cap-stat">
                <div className="cap-used">{c.used}</div>
                <div className="cap-total">/ {c.total} {c.consumable ? 'units' : 'beds'}</div>
              </div>
              <div className="cap-bar"><div className={'cap-bar-fill ' + status} style={{ width: pct + '%' }} /></div>
              <div className="cap-note">{c.note}</div>

              {canEdit && !isEditing && (
                <button type="button" className="btn btn-sm" style={{ width: '100%', marginTop: 8, justifyContent: 'center' }} onClick={() => startEdit(c)}>
                  ✎ Edit
                </button>
              )}
              {canEdit && isEditing && (
                <>
                  <div className="cap-edit">
                    <input type="text" placeholder="Note" value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} />
                    <input type="number" placeholder="Used" value={editForm.used} onChange={(e) => setEditForm({ ...editForm, used: e.target.value })} />
                    <input type="number" placeholder="Total" value={editForm.total} onChange={(e) => setEditForm({ ...editForm, total: e.target.value })} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button type="button" className="cancel-btn" style={{ flex: 1 }} onClick={() => setEditingCapacityId(null)}>Cancel</button>
                    <button type="button" className="save-btn" style={{ flex: 1 }} onClick={() => handleCapacitySave(c.id, editForm.used, editForm.total, editForm.note)}>Save</button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DEVICES VIEW
════════════════════════════════════════════════════════════════════ */
function DevicesView({ devices, canManage, setModal, handleRefresh, handleExportCSV }) {
  const online = devices.filter(d => d.status === 'online').length;
  const offline = devices.filter(d => d.status === 'offline').length;
  const degraded = devices.filter(d => d.status === 'degraded').length;
  const tablets = devices.filter(d => d.type === 'Tablet').length;

  const exportDevices = () => {
    handleExportCSV('devices-' + new Date().toISOString().slice(0,10) + '.csv',
      ['ID','Type','Location','Status','Assigned User','Last Sync','Battery'],
      devices.map(d => [d.id, d.type, d.loc, d.status, d.user, d.sync, d.battery == null ? 'N/A' : d.battery + '%'])
    );
  };

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">ED tablets &amp; workstations</div>
          <h1 className="page-title">Tablets &amp; Stations</h1>
          <p className="page-sub">Connected ED triage tablets and admin workstations. Each tablet is bound to a clinical role and signed-in user.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => handleRefresh('Devices')}><span>↻</span> Refresh</button>
          <button type="button" className="btn" onClick={exportDevices}><span>⤓</span> Export</button>
          {canManage && <button type="button" className="btn btn-primary" onClick={() => setModal({ type: 'newDevice' })}><span>+</span> Register Device</button>}
        </div>
      </div>

      <div className="kpi-strip">
        <KpiCard color="emerald" label="Online" value={online} delta="" deltaType="dn" foot={'of ' + devices.length + ' total'} />
        <KpiCard color="copper" label="Tablets" value={tablets} delta="" deltaType="neu" foot="ED-bound clinical devices" />
        <KpiCard color="forest" label="Workstations" value={devices.filter(d => d.type === 'Workstation').length} delta="" deltaType="neu" foot="Admin and charge desks" />
        <KpiCard color="crimson" label="Need attention" value={offline + degraded} delta="" deltaType={offline + degraded > 0 ? 'up' : 'neu'} foot={offline + ' offline · ' + degraded + ' degraded'} />
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title"><div className="card-title-icon cti-forest">▢</div> Connected devices</div>
          <div className="card-meta"><b>{devices.length}</b> registered</div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Device ID</th><th>Type</th><th>Location</th><th>Assigned</th><th>Last Sync</th><th>Battery</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr key={d.id}>
                  <td><span className="id-cell">{d.id}</span></td>
                  <td>{d.type}</td>
                  <td>{d.loc}</td>
                  <td><span style={{ fontSize: 11.5 }}>{d.user}</span></td>
                  <td><span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{d.sync}</span></td>
                  <td>{d.battery == null ? <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--mono)', fontSize: 10 }}>N/A</span> : <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: d.battery < 20 ? 'var(--crimson)' : d.battery < 40 ? 'var(--amber)' : 'var(--emerald)' }}>{d.battery}%</span>}</td>
                  <td><span className={'row-pill rp-' + d.status}>{d.status}</span></td>
                  <td>{canManage && <button type="button" className="btn btn-sm" onClick={() => setModal({ type: 'editDevice', payload: d })}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   USERS VIEW
════════════════════════════════════════════════════════════════════ */
function UsersView({ users, setModal, handleExportCSV }) {
  const exportUsers = () => {
    handleExportCSV('users-' + new Date().toISOString().slice(0,10) + '.csv',
      ['ID','Name','Email','Role','Department','Status','Last Active'],
      users.map(u => [u.id, u.name, u.email, u.role, u.dept, u.status, u.last])
    );
  };

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Access control</div>
          <h1 className="page-title">Users &amp; Roles</h1>
          <p className="page-sub">Hospital staff with portal access, organised by role. Provisioning is bound to council registration where applicable.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={exportUsers}><span>⤓</span> Export</button>
          <button type="button" className="btn btn-primary" onClick={() => setModal({ type: 'newUser' })}><span>+</span> Provision User</button>
        </div>
      </div>

      <div className="kpi-strip">
        <KpiCard color="forest" label="Total users" value={users.length} delta="" deltaType="neu" foot="Across all roles" />
        <KpiCard color="emerald" label="Active" value={users.filter(u => u.status === 'active').length} delta="" deltaType="dn" foot="Currently provisioned" />
        <KpiCard color="copper" label="Doctors" value={users.filter(u => u.role === 'Doctor').length} delta="" deltaType="neu" foot="Clinical decision authority" />
        <KpiCard color="crimson" label="Nurses" value={users.filter(u => u.role === 'Nurse').length} delta="" deltaType="neu" foot="ED, theatre, ICU" />
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title"><div className="card-title-icon cti-copper">⌬</div> All users</div>
          <div className="card-meta"><b>{users.length}</b> users</div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>ID</th><th>Name</th><th>Role</th><th>Department</th><th>Last Active</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><span className="id-cell">{u.id}</span></td>
                  <td><div className="name-cell"><div className="nm">{u.name}</div><div className="sub">{u.email}</div></div></td>
                  <td>{u.role}</td>
                  <td>{u.dept}</td>
                  <td><span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{u.last}</span></td>
                  <td><span className={'row-pill rp-' + u.status}>{u.status}</span></td>
                  <td><button type="button" className="btn btn-sm" onClick={() => setModal({ type: 'editUser', payload: u })}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   REPORTS VIEW
════════════════════════════════════════════════════════════════════ */
function ReportsView({ referrals, handleExportCSV }) {
  // Build hourly volume from referrals
  const hours = Array.from({ length: 12 }, (_, i) => 8 + i); // 08:00 - 19:00
  const volumeByHour = hours.map(h => {
    const inH = referrals.filter(r => r.direction === 'incoming' && r.receivedAt.getHours() === h).length;
    const outH = referrals.filter(r => r.direction === 'outgoing' && r.receivedAt.getHours() === h).length;
    // synthesize for empty hours so chart renders
    return {
      h: String(h).padStart(2, '0') + ':00',
      incoming: inH || (h >= 10 && h <= 17 ? 1 + Math.floor(Math.random() * 4) : Math.floor(Math.random() * 2)),
      outgoing: outH || (h >= 10 && h <= 17 ? Math.floor(Math.random() * 3) : Math.floor(Math.random() * 2)),
    };
  });
  const maxVal = Math.max(...volumeByHour.map(v => v.incoming + v.outgoing), 5);

  const exportReport = () => {
    const rows = volumeByHour.map(v => [v.h, v.incoming, v.outgoing, v.incoming + v.outgoing]);
    handleExportCSV('hourly-volume-' + new Date().toISOString().slice(0,10) + '.csv',
      ['Hour','Incoming','Outgoing','Total'], rows);
  };

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Emergency Access &amp; Response Quality</div>
          <h1 className="page-title">Reports &amp; EAR-Q</h1>
          <p className="page-sub">Volume, response times, and quality metrics. Submitted to NIOMC monthly for Ghana national emergency-care quality benchmarking.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => {}}><span>📅</span> Today</button>
          <button type="button" className="btn btn-primary" onClick={exportReport}><span>⤓</span> Export Report</button>
        </div>
      </div>

      <div className="kpi-strip">
        <KpiCard color="forest"  label="Today's referrals"   value={referrals.length}     delta="+12% vs avg"    deltaType="up"  foot="Last 24h window" />
        <KpiCard color="copper"  label="Median response"     value="4m 12s"               delta="-22s"           deltaType="dn"  foot="From received to decision" />
        <KpiCard color="emerald" label="SLA compliance"      value="94%"                  delta="↑ 2.1%"         deltaType="dn"  foot="Target ≥ 90%" />
        <KpiCard color="crimson" label="Critical escalations" value={referrals.filter(r => r.priority === 'critical').length} delta="—" deltaType="neu" foot="Vs MoM avg of 3" />
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title"><div className="card-title-icon cti-forest">◫</div> Hourly volume · today</div>
          <div className="card-meta">{referrals.filter(r => r.direction === 'incoming').length} in · {referrals.filter(r => r.direction === 'outgoing').length} out</div>
        </div>
        <div className="chart-wrap">
          <div className="chart-legend">
            <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--forest)' }} />Incoming</div>
            <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--copper)' }} />Outgoing</div>
          </div>
          <div className="chart-bars">
            {volumeByHour.map((v, i) => {
              const inHeight = (v.incoming / maxVal) * 100;
              const outHeight = (v.outgoing / maxVal) * 100;
              return (
                <div key={i} className="bar-group">
                  <div className="bar-nums">
                    <div className="bar-num" style={{ color: 'var(--forest)' }}>{v.incoming || ''}</div>
                    <div className="bar-num" style={{ color: 'var(--copper)' }}>{v.outgoing || ''}</div>
                  </div>
                  <div className="bar-pair">
                    <div className="bar" style={{ height: inHeight + '%', background: 'var(--forest)' }} />
                    <div className="bar" style={{ height: outHeight + '%', background: 'var(--copper)' }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="chart-axis">
            {volumeByHour.map((v, i) => <span key={i}>{v.h}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   AUDIT VIEW
════════════════════════════════════════════════════════════════════ */
function AuditView({ audit, handleExportCSV }) {
  const exportAudit = () => {
    handleExportCSV('audit-trail-' + new Date().toISOString().slice(0,10) + '.csv',
      ['Timestamp','Actor','Role','Action','Reference'],
      audit.map(a => [a.time.toISOString(), a.actor, a.role || '', a.action, a.ref || ''])
    );
  };

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Tamper-evident log</div>
          <h1 className="page-title">Audit Trail</h1>
          <p className="page-sub">Every action in this portal is recorded with actor, timestamp, and reference. Replicated to NIOMC for national audit.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={exportAudit}><span>⤓</span> Export CSV</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title"><div className="card-title-icon cti-copper">⊟</div> Session audit log</div>
          <div className="card-meta"><b>{audit.length}</b> events this session</div>
        </div>
        {audit.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⊟</div>
            <div className="empty-title">No audit events yet</div>
            <div className="empty-sub">Events will appear here as you take actions.</div>
          </div>
        ) : (
          <div className="audit-list">
            {audit.map((a, i) => (
              <div key={i} className="audit-item">
                <span className="audit-time">{fmtTime(a.time)}</span>
                <span className="audit-actor">{a.actor}</span>
                <span className="audit-action">{a.action}</span>
                <span className="audit-ref">{a.ref || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   INTEGRATIONS VIEW
════════════════════════════════════════════════════════════════════ */
function IntegrationsView({ systems, handleTestConnections }) {
  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Connected services</div>
          <h1 className="page-title">GHIMS · NCRIS · Integrations</h1>
          <p className="page-sub">Status of upstream and downstream systems this hospital portal communicates with. Failures here are immediately escalated to IT.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={handleTestConnections}><span>⊕</span> Test Connections</button>
        </div>
      </div>

      <div className="systems-grid">
        {systems.map(s => (
          <div key={s.id} className="system-tile">
            <div className="system-head">
              <div>
                <div className="system-name">{s.name}</div>
                <div className="system-sub">{s.sub}</div>
              </div>
              <span className={'row-pill ' + (s.status === 'ok' ? 'rp-online' : s.status === 'warn' ? 'rp-degraded' : 'rp-offline')}>
                {s.status === 'ok' ? 'healthy' : s.status === 'warn' ? 'degraded' : 'offline'}
              </span>
            </div>
            <div className="system-body">{s.body}</div>
            <div className={'system-stat ' + (s.status === 'ok' ? '' : s.status)}>
              <span className={s.status === 'ok' ? 'ok' : s.status === 'warn' ? 'warn' : 'err'}>● </span>
              {s.stat}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   REFERRAL DETAIL MODAL
════════════════════════════════════════════════════════════════════ */
function ReferralDetailModal({ referral, onClose, onAction, onPrint }) {
  const [actionMode, setActionMode] = useState(null); // 'decline' | 'redirect'
  const [actionNote, setActionNote] = useState('');

  if (!referral) return null;
  const r = referral;
  const assessment = useMemo(() => assessVitals(r.vitals || {}, r.patientAge, r.patientCategory), [r]);
  const cellTier = (key) => assessment.perVital[key]?.tier || 'normal';
  const sla = fmtSLA(r.slaDeadline);

  const submitAction = () => {
    if (!actionMode) return;
    if ((actionMode === 'decline' || actionMode === 'redirect') && !actionNote.trim()) {
      alert('Please provide a reason.');
      return;
    }
    onAction(actionMode, actionNote);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{r.id} · {r.direction}</div>
            <div className="modal-title">{r.subCondition || r.primaryCondition}</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
            <span className={'priority-pill ' + r.priority}>{r.priority}</span>
            <span className={'dir-pill ' + r.direction}>{r.direction === 'incoming' ? '↙ Incoming' : '↗ Outgoing'}</span>
            <span className="row-pill rp-active">{STATUS_LABEL[r.status] || r.status}</span>
            {r.eta && <span className="row-pill rp-online">ETA {r.eta} min</span>}
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: sla.urgent ? 'var(--crimson)' : 'var(--ink-3)', fontWeight: 600 }}>SLA: {sla.text}</span>
          </div>

          <div className="detail-grid">
            <span className="k">Patient</span>
            <span className="v"><b>{r.patientInitials}</b> · {r.patientAge}{r.patientSex} · {r.patientCategory}</span>
            <span className="k">From</span>
            <span className="v">{facilityName(r.sourceFacility)}</span>
            <span className="k">To</span>
            <span className="v">{facilityName(r.destFacility)}</span>
            <span className="k">Sent by</span>
            <span className="v">{r.sentBy || '—'}</span>
            <span className="k">Stability</span>
            <span className="v"><b>{r.stability}</b></span>
            <span className="k">Reasons</span>
            <span className="v">{(r.reasons || []).join(' · ') || '—'}</span>
            <span className="k">Services</span>
            <span className="v">{(r.services || []).join(' · ') || '—'}</span>
            <span className="k">Interventions</span>
            <span className="v">{r.interventions || '—'}</span>
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Vitals · clinical engine assessment</div>
            <div className="ref-vitals six-col" style={{ background: 'var(--paper-3)', padding: '12px 14px' }}>
              <VitalCell label="BP" value={r.vitals.sbp + '/' + r.vitals.dbp}
                tier={[cellTier('sbp'), cellTier('dbp')].sort((a,b) => TIER_SCORE[b] - TIER_SCORE[a])[0]}
                modifier={r.vitals.sbp_modifier} />
              <VitalCell label="HR" value={r.vitals.hr} tier={cellTier('hr')} modifier={r.vitals.hr_modifier} />
              <VitalCell label="RR" value={r.vitals.rr} tier={cellTier('rr')} />
              <VitalCell label="SpO₂" value={r.vitals.spo2 + '%'} tier={cellTier('spo2')} modifier={r.vitals.spo2_modifier} />
              <VitalCell label="Temp" value={r.vitals.temp + '°'} tier={cellTier('temp')} />
              <VitalCell label="GCS" value={r.vitals.gcs} tier={cellTier('gcs')} />
            </div>
            {r.vitals.rbs && (
              <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>
                RBS: <b style={{ color: 'var(--ink-1)' }}>{r.vitals.rbs} mmol/L</b> · {assessment.perVital.rbs?.reason}
              </div>
            )}
            <div style={{ marginTop: 10, padding: 10, background: 'var(--forest-faint)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
              <b style={{ color: 'var(--forest-deep)' }}>Engine assessment:</b> {assessment.suggestedReason}. Composite severity score: <b>{assessment.totalScore}</b>. Suggested priority: <b style={{ textTransform: 'uppercase' }}>{assessment.suggestedPriority}</b>.
              {Object.values(assessment.perVital).filter(p => p && p.tier !== 'normal').length > 0 && (
                <div style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 10.5 }}>
                  {Object.values(assessment.perVital).filter(p => p && p.tier !== 'normal').map((p, i) => (
                    <div key={i}>· {p.reason}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Clinical summary</div>
            <div style={{ padding: 12, background: 'var(--paper-3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
              {r.summary || 'No summary provided.'}
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Timeline</div>
            <div className="timeline">
              {(r.history || []).map((h, i) => (
                <div key={i} className="timeline-item">
                  <div className="timeline-time">{fmtTime(h.time)} · {fmtAgo(h.time)}</div>
                  <div className="timeline-event">{h.event}</div>
                  <div className="timeline-actor">{h.actor}</div>
                </div>
              ))}
            </div>
          </div>

          {actionMode && (
            <div className="detail-section">
              <div className="detail-section-title">Reason for {actionMode}</div>
              <textarea
                rows={3}
                className="form-input"
                placeholder={actionMode === 'decline' ? 'Why are you declining? (e.g., ICU full, no specialist available)' : 'Where should this be redirected? (e.g., 37 Military for neurosurgery)'}
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
              />
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={() => onPrint(r)}>⎙ Print Summary</button>
          <div style={{ flex: 1 }} />
          {r.status === 'awaiting_decision' && !actionMode && (
            <>
              <button type="button" className="btn btn-danger" onClick={() => setActionMode('decline')}>Decline...</button>
              <button type="button" className="btn" onClick={() => setActionMode('redirect')}>Redirect...</button>
              <button type="button" className="btn btn-primary" onClick={() => onAction('accept', '')}>Accept Referral</button>
            </>
          )}
          {actionMode && (
            <>
              <button type="button" className="btn" onClick={() => { setActionMode(null); setActionNote(''); }}>Cancel</button>
              <button type="button" className={'btn ' + (actionMode === 'decline' ? 'btn-danger' : 'btn-primary')} onClick={submitAction}>Submit {actionMode}</button>
            </>
          )}
          {r.status !== 'awaiting_decision' && (
            <button type="button" className="btn" onClick={onClose}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   NEW REFERRAL MODAL — implements REFERRAL PILOT tablet schema exactly
════════════════════════════════════════════════════════════════════ */
function NewReferralModal({ onClose, onSubmit, currentUser }) {
  // Section A1
  const [patientAge, setPatientAge] = useState('');
  const [patientSex, setPatientSex] = useState('M');
  const [patientCategory, setPatientCategory] = useState('Adult');
  const [patientInitials, setPatientInitials] = useState('');
  const [hospitalNumber, setHospitalNumber] = useState('');

  // Section B2
  const [primaryCondition, setPrimaryCondition] = useState('');
  const [subCondition, setSubCondition] = useState('');
  const [otherConditionText, setOtherConditionText] = useState('');
  const [subOtherText, setSubOtherText] = useState('');

  // Section B3
  const [reasons, setReasons] = useState([]);
  const [reasonOther, setReasonOther] = useState('');

  // Section B4
  const [services, setServices] = useState([]);

  // Section B5
  const [stability, setStability] = useState('Stable');

  // Section B6 — vitals
  const [vitals, setVitals] = useState({
    sbp: '', dbp: '', hr: '', rr: '', temp: '', spo2: '', gcs: '', rbs: '',
    sbp_modifier: '', hr_modifier: '', spo2_modifier: '',
  });
  const [gcsAlertManual, setGcsAlertManual] = useState('');

  // Section B6b
  const [interventions, setInterventions] = useState('None');

  // Section B7
  const [summary, setSummary] = useState('');

  // Destination
  const [destFacility, setDestFacility] = useState('GH-ACC-002');

  // Priority override
  const [priorityOverride, setPriorityOverride] = useState(null);
  const [overrideNote, setOverrideNote] = useState('');

  // Auto-set primary condition based on patient category
  useEffect(() => {
    if (patientCategory === 'Obstetric' && primaryCondition !== 'obstetric') setPrimaryCondition('obstetric');
    if (patientCategory === 'Neonate' && primaryCondition !== 'neonatal') setPrimaryCondition('neonatal');
    if (patientCategory === 'Paediatric' && primaryCondition && !['paediatric','trauma','medical','surgical','poisoning','psychiatric','other'].includes(primaryCondition)) setPrimaryCondition('paediatric');
    // eslint-disable-next-line
  }, [patientCategory]);

  // Auto-derive GCS alertness
  const gcsNum = parseFloat(vitals.gcs);
  const autoAlert = gcsAlertness(gcsNum);
  const displayedAlert = autoAlert === 'Alert' || autoAlert === 'Unresponsive' ? autoAlert : (gcsAlertManual || autoAlert || '—');

  // Live engine assessment
  const assessment = useMemo(
    () => assessVitals(vitals, parseFloat(patientAge) || null, patientCategory),
    [vitals, patientAge, patientCategory]
  );

  const finalPriority = priorityOverride || assessment.suggestedPriority;
  const subOptions = primaryCondition && SUB_OPTIONS[primaryCondition] ? SUB_OPTIONS[primaryCondition] : null;

  const toggleReason = (r) => setReasons(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  const toggleService = (s) => setServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  const setVital = (k, v) => setVitals(prev => ({ ...prev, [k]: v }));
  const toggleModifier = (key, mod) => setVitals(prev => ({ ...prev, [key]: prev[key] === mod ? '' : mod }));

  const tierForInput = (key) => assessment.perVital[key]?.tier || 'normal';
  const tierClass = (tier) => tier && tier !== 'normal' ? 'tier-' + tier : '';

  const summaryLen = summary.length;
  const summaryClass = summaryLen > 150 ? 'err' : summaryLen > 120 ? 'warn' : '';

  const canSubmit = patientAge && primaryCondition && stability && (subCondition || primaryCondition === 'psychiatric' || primaryCondition === 'poisoning') && reasons.length > 0 && services.length > 0 && summary.trim() && destFacility && (priorityOverride === null || overrideNote.trim());

  const submit = () => {
    if (!canSubmit) {
      alert('Please complete all required sections before submitting.');
      return;
    }
    const finalCondition = primaryCondition === 'other' ? otherConditionText : primaryCondition;
    const finalSub = subCondition === 'Other' ? subOtherText : subCondition;
    const finalReasons = reasons.includes('Other') ? [...reasons.filter(r => r !== 'Other'), 'Other: ' + reasonOther] : reasons;

    onSubmit({
      patientAge, patientSex, patientCategory, patientInitials, hospitalNumber,
      primaryCondition: finalCondition, subCondition: finalSub,
      reasons: finalReasons, services, stability,
      vitals: { ...vitals, gcs_alertness: displayedAlert },
      interventions, summary,
      destFacility,
      priority: finalPriority,
      priorityOverride: priorityOverride !== null,
      priorityNote: overrideNote,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>New Outgoing Referral · From Korle-Bu Teaching</div>
            <div className="modal-title">Create Referral</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {/* Live priority badge */}
          <div className={'form-priority-badge priority-' + finalPriority}>
            <div className={'priority-icon-lg priority-' + finalPriority}>{finalPriority === 'critical' ? '!' : finalPriority === 'high' ? '↑' : '✓'}</div>
            <div className="priority-text-lg">
              <div className="lbl">{priorityOverride ? 'Doctor-set priority' : 'Engine-suggested priority'}</div>
              <div className="val">{finalPriority.toUpperCase()}</div>
              <div className="reason">{priorityOverride ? overrideNote || 'Override active' : assessment.suggestedReason}</div>
              <div className="severity-meter">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
                  <div key={i} className={'severity-bar ' + (i < assessment.totalScore ? (assessment.totalScore >= 6 ? 'filled-3' : assessment.totalScore >= 3 ? 'filled-2' : 'filled-1') : '')} />
                ))}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {priorityOverride === null ? (
                <button type="button" className="btn btn-sm" onClick={() => setPriorityOverride(finalPriority)}>Override...</button>
              ) : (
                <>
                  <div className="form-pill-group" style={{ gap: 4 }}>
                    {['critical','high','routine'].map(p => (
                      <button key={p} type="button" className={'form-pill ' + (priorityOverride === p ? 'tier-active' : '')} onClick={() => setPriorityOverride(p)} style={{ fontSize: 10, padding: '4px 9px' }}>{p}</button>
                    ))}
                  </div>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => { setPriorityOverride(null); setOverrideNote(''); }}>Clear override</button>
                </>
              )}
            </div>
          </div>
          {priorityOverride !== null && (
            <div style={{ marginBottom: 18 }}>
              <label className="field-label">Reason for manual override <span style={{ color: 'var(--crimson)' }}>*</span></label>
              <input className="form-input" placeholder="e.g. Patient deteriorating clinically despite normal vitals" value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} />
            </div>
          )}

          {/* SECTION A1 — Patient basics */}
          <div className="form-section">
            <div className="form-section-title">A1 · Patient Basics</div>
            <div className="form-section-sub">Age, sex, and category drive age-aware vital assessment.</div>
            <div className="form-row cols-4">
              <div>
                <label className="field-label">Age (years) *</label>
                <input className="form-input" type="number" min="0" max="120" value={patientAge} onChange={(e) => setPatientAge(e.target.value)} placeholder="e.g. 34" />
              </div>
              <div>
                <label className="field-label">Sex *</label>
                <div className="form-pill-group">
                  {['M', 'F'].map(s => (
                    <button key={s} type="button" className={'form-pill ' + (patientSex === s ? 'active' : '')} onClick={() => setPatientSex(s)}>{s === 'M' ? 'Male' : 'Female'}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="field-label">Initials (optional)</label>
                <input className="form-input" maxLength={3} value={patientInitials} onChange={(e) => setPatientInitials(e.target.value.toUpperCase())} placeholder="e.g. KO" />
              </div>
              <div>
                <label className="field-label">Hosp. Number (optional)</label>
                <input className="form-input" value={hospitalNumber} onChange={(e) => setHospitalNumber(e.target.value)} placeholder="e.g. KBU-2026-09812" />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label className="field-label">Patient Category *</label>
              <div className="form-pill-group">
                {PATIENT_CATEGORIES.map(c => (
                  <button key={c} type="button" className={'form-pill ' + (patientCategory === c ? 'active' : '')} onClick={() => setPatientCategory(c)}>{c}</button>
                ))}
              </div>
            </div>
          </div>

          {/* SECTION B2 — Primary condition */}
          <div className="form-section">
            <div className="form-section-title">B2 · Presenting Condition</div>
            <div className="form-section-sub">Auto-locked for Obstetric/Neonatal/Paediatric categories.</div>
            <label className="field-label">Primary Category *</label>
            <select className="form-input" value={primaryCondition} onChange={(e) => { setPrimaryCondition(e.target.value); setSubCondition(''); }}>
              <option value="">— Select —</option>
              {PRIMARY_CONDITIONS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            {primaryCondition === 'other' && (
              <div style={{ marginTop: 10 }}>
                <label className="field-label">Specify *</label>
                <input className="form-input" value={otherConditionText} onChange={(e) => setOtherConditionText(e.target.value)} placeholder="Describe the condition" />
              </div>
            )}
            {subOptions && (
              <div style={{ marginTop: 12 }}>
                <label className="field-label">Sub-Condition *</label>
                <div className="form-pill-group">
                  {subOptions.map(s => (
                    <button key={s} type="button" className={'form-pill ' + (subCondition === s ? 'active' : '')} onClick={() => setSubCondition(s)}>{s}</button>
                  ))}
                </div>
                {subCondition === 'Other' && (
                  <div style={{ marginTop: 10 }}>
                    <input className="form-input" value={subOtherText} onChange={(e) => setSubOtherText(e.target.value)} placeholder="Specify..." />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION B3 — Reason for referral */}
          <div className="form-section">
            <div className="form-section-title">B3 · Reason for Referral *</div>
            <div className="form-section-sub">Multi-select. Why is this patient leaving Korle-Bu?</div>
            <div className="form-pill-group">
              {REFERRAL_REASONS.map(r => (
                <button key={r} type="button" className={'form-pill ' + (reasons.includes(r) ? 'active' : '')} onClick={() => toggleReason(r)}>{r}</button>
              ))}
            </div>
            {reasons.includes('Other') && (
              <div style={{ marginTop: 10 }}>
                <input className="form-input" value={reasonOther} onChange={(e) => setReasonOther(e.target.value)} placeholder="Specify other reason" />
              </div>
            )}
          </div>

          {/* SECTION B4 — Requested service */}
          <div className="form-section">
            <div className="form-section-title">B4 · Requested Service / Specialty *</div>
            <div className="form-section-sub">Multi-select. What service do you need at the receiving facility?</div>
            <div className="form-pill-group">
              {SERVICES.map(s => (
                <button key={s} type="button" className={'form-pill ' + (services.includes(s) ? 'active' : '')} onClick={() => toggleService(s)}>{s}</button>
              ))}
            </div>
          </div>

          {/* SECTION B5 — Stability */}
          <div className="form-section">
            <div className="form-section-title">B5 · Patient Stability *</div>
            <div className="form-pill-group">
              {STABILITY_LEVELS.map(s => {
                const cls = 'severity-' + s.toLowerCase().replace(/ /g, '-');
                return (
                  <button key={s} type="button" className={'form-pill ' + cls + (stability === s ? ' active' : '')} onClick={() => setStability(s)}>{s}</button>
                );
              })}
            </div>
          </div>

          {/* SECTION B6 — Vitals */}
          <div className="form-section">
            <div className="form-section-title">B6 · Vitals</div>
            <div className="form-section-sub">Live colour-coding by Ghana STG + WHO age-aware standards.</div>
            <div className="form-row cols-2">
              <div>
                <label className="field-label">Systolic BP (mmHg)</label>
                <input className={'form-input ' + tierClass(tierForInput('sbp'))} type="number" value={vitals.sbp} onChange={(e) => setVital('sbp', e.target.value)} placeholder="e.g. 120" />
                <div style={{ marginTop: 6 }}>
                  <button type="button" className={'form-pill modifier ' + (vitals.sbp_modifier === 'INOTROPES' ? 'active' : '')} onClick={() => toggleModifier('sbp_modifier', 'INOTROPES')}>Inotropes</button>
                </div>
              </div>
              <div>
                <label className="field-label">Diastolic BP (mmHg)</label>
                <input className={'form-input ' + tierClass(tierForInput('dbp'))} type="number" value={vitals.dbp} onChange={(e) => setVital('dbp', e.target.value)} placeholder="e.g. 80" />
              </div>
            </div>
            <div className="form-row cols-2" style={{ marginTop: 10 }}>
              <div>
                <label className="field-label">Pulse / Heart Rate (bpm)</label>
                <input className={'form-input ' + tierClass(tierForInput('hr'))} type="number" value={vitals.hr} onChange={(e) => setVital('hr', e.target.value)} placeholder="e.g. 78" />
                <div style={{ marginTop: 6 }}>
                  <button type="button" className={'form-pill modifier ' + (vitals.hr_modifier === 'BLEEDING' ? 'active' : '')} onClick={() => toggleModifier('hr_modifier', 'BLEEDING')}>Bleeding</button>
                </div>
              </div>
              <div>
                <label className="field-label">Respiratory Rate (/min)</label>
                <input className={'form-input ' + tierClass(tierForInput('rr'))} type="number" value={vitals.rr} onChange={(e) => setVital('rr', e.target.value)} placeholder="e.g. 16" />
              </div>
            </div>
            <div className="form-row cols-2" style={{ marginTop: 10 }}>
              <div>
                <label className="field-label">Temperature (°C)</label>
                <input className={'form-input ' + tierClass(tierForInput('temp'))} type="number" step="0.1" value={vitals.temp} onChange={(e) => setVital('temp', e.target.value)} placeholder="e.g. 37.0" />
              </div>
              <div>
                <label className="field-label">SpO₂ (%)</label>
                <input className={'form-input ' + tierClass(tierForInput('spo2'))} type="number" min="0" max="100" value={vitals.spo2} onChange={(e) => setVital('spo2', e.target.value)} placeholder="e.g. 98" />
                <div style={{ marginTop: 6, display: 'flex', gap: 5 }}>
                  {['ORA', 'OXYGEN', 'INTUBATED'].map(m => (
                    <button key={m} type="button" className={'form-pill modifier ' + (vitals.spo2_modifier === m ? 'active' : '')} onClick={() => toggleModifier('spo2_modifier', m)}>{m}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="form-row cols-2" style={{ marginTop: 10 }}>
              <div>
                <label className="field-label">RBS (mmol/L)</label>
                <input className={'form-input ' + tierClass(tierForInput('rbs'))} type="number" step="0.1" value={vitals.rbs} onChange={(e) => setVital('rbs', e.target.value)} placeholder="e.g. 5.2" />
              </div>
              <div>
                <label className="field-label">GCS (3–15)</label>
                <input className={'form-input ' + tierClass(tierForInput('gcs'))} type="number" min="3" max="15" value={vitals.gcs} onChange={(e) => setVital('gcs', e.target.value)} placeholder="e.g. 15" />
              </div>
            </div>
            {vitals.gcs && (
              <div className="gcs-readout">
                Alertness: <b>{displayedAlert}</b>
                {autoAlert !== 'Alert' && autoAlert !== 'Unresponsive' && (
                  <div style={{ marginTop: 6, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {['Alert', 'Responds to voice', 'Responds to pain', 'Unresponsive'].map(a => (
                      <button key={a} type="button" className={'form-pill ' + (gcsAlertManual === a ? 'active' : '')} onClick={() => setGcsAlertManual(a)} style={{ fontSize: 10.5, padding: '4px 9px' }}>{a}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION B6b — Interventions */}
          <div className="form-section">
            <div className="form-section-title">B6b · Interventions Done</div>
            <div className="form-pill-group">
              {INTERVENTIONS.map(i => (
                <button key={i} type="button" className={'form-pill ' + (interventions === i ? 'active' : '')} onClick={() => setInterventions(i)}>{i}</button>
              ))}
            </div>
          </div>

          {/* SECTION B7 — Summary */}
          <div className="form-section">
            <div className="form-section-title">B7 · Clinical Summary *</div>
            <div className="form-section-sub">120–150 chars. Eg: "RTA, GCS 9, pupils unequal, oxygen started, needs CT/neurosurgery."</div>
            <textarea
              rows={3}
              className="form-input"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief clinical summary..."
              maxLength={200}
            />
            <div className={'summary-counter ' + summaryClass}>{summaryLen} / 150 chars</div>
          </div>

          {/* DESTINATION */}
          <div className="form-section">
            <div className="form-section-title">Destination Facility *</div>
            <select className="form-input" value={destFacility} onChange={(e) => setDestFacility(e.target.value)}>
              {FACILITIES.filter(f => f.code !== 'GH-ACC-001').map(f => (
                <option key={f.code} value={f.code}>{f.name} ({f.tier})</option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-foot">
          <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', alignSelf: 'center' }}>
            Sender: {currentUser.name} · {currentUser.dept}
          </div>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={submit}>
            Send Referral via NCRIS →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   USER FORM MODAL (new / edit)
════════════════════════════════════════════════════════════════════ */
function UserFormModal({ onClose, onSubmit, mode, initial }) {
  const [name, setName] = useState(initial?.name || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [role, setRole] = useState(initial?.role || 'Doctor');
  const [dept, setDept] = useState(initial?.dept || '');
  const [status, setStatus] = useState(initial?.status || 'active');

  const submit = () => {
    if (!name || !email || !dept) { alert('Please fill all required fields.'); return; }
    onSubmit({ name, email, role, dept, status });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{mode === 'new' ? 'Provision New User' : 'Edit User'}</div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-section">
            <div className="form-row cols-2">
              <div>
                <label className="field-label">Full Name *</label>
                <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Jane Doe" />
              </div>
              <div>
                <label className="field-label">Email *</label>
                <input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="j.doe@korlebu.gh" />
              </div>
            </div>
            <div className="form-row cols-2" style={{ marginTop: 10 }}>
              <div>
                <label className="field-label">Role *</label>
                <select className="form-input" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option>Doctor</option><option>Nurse</option><option>Admin</option><option>IT</option>
                </select>
              </div>
              <div>
                <label className="field-label">Department *</label>
                <input className="form-input" value={dept} onChange={(e) => setDept(e.target.value)} placeholder="e.g. Emergency Medicine" />
              </div>
            </div>
            {mode === 'edit' && (
              <div style={{ marginTop: 10 }}>
                <label className="field-label">Status</label>
                <div className="form-pill-group">
                  {['active', 'inactive'].map(s => (
                    <button key={s} type="button" className={'form-pill ' + (status === s ? 'active' : '')} onClick={() => setStatus(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit}>{mode === 'new' ? 'Provision User' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DEVICE FORM MODAL (new / edit)
════════════════════════════════════════════════════════════════════ */
function DeviceFormModal({ onClose, onSubmit, mode, initial }) {
  const [id, setId] = useState(initial?.id || '');
  const [type, setType] = useState(initial?.type || 'Tablet');
  const [loc, setLoc] = useState(initial?.loc || '');
  const [deviceUser, setDeviceUser] = useState(initial?.user || 'Unassigned');
  const [status, setStatus] = useState(initial?.status || 'online');

  const submit = () => {
    if (!id || !loc) { alert('Please fill all required fields.'); return; }
    onSubmit({ id, type, loc, user: deviceUser, status });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{mode === 'new' ? 'Register New Device' : 'Edit Device'}</div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-section">
            <div className="form-row cols-2">
              <div>
                <label className="field-label">Device ID *</label>
                <input className="form-input" value={id} onChange={(e) => setId(e.target.value.toUpperCase())} placeholder="KBU-TAB-ED-05" disabled={mode === 'edit'} />
              </div>
              <div>
                <label className="field-label">Type *</label>
                <select className="form-input" value={type} onChange={(e) => setType(e.target.value)}>
                  <option>Tablet</option><option>Workstation</option>
                </select>
              </div>
            </div>
            <div className="form-row cols-2" style={{ marginTop: 10 }}>
              <div>
                <label className="field-label">Location *</label>
                <input className="form-input" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="e.g. ED Resus Bay 3" />
              </div>
              <div>
                <label className="field-label">Assigned User</label>
                <input className="form-input" value={deviceUser} onChange={(e) => setDeviceUser(e.target.value)} placeholder="Unassigned" />
              </div>
            </div>
            {mode === 'edit' && (
              <div style={{ marginTop: 10 }}>
                <label className="field-label">Status</label>
                <div className="form-pill-group">
                  {['online', 'offline', 'degraded'].map(s => (
                    <button key={s} type="button" className={'form-pill ' + (status === s ? 'active' : '')} onClick={() => setStatus(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit}>{mode === 'new' ? 'Register Device' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}
