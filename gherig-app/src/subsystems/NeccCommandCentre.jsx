/* ════════════════════════════════════════════════════════════════════
   GhERIG · NECC · v1.0
   National Emergency Command Centre
   Ghana Emergency Referral & Intelligence Grid
   ────────────────────────────────────────────────────────────────────
   USAGE:
     import NeccCommandCentre from './NeccCommandCentre';
     <NeccCommandCentre />

   DEPENDENCIES: react (>=17). No external libraries.

   ────────────────────────────────────────────────────────────────────
   WHAT THIS IS

   The national hub. Every hospital portal in the Greater Accra pilot
   replicates audit + capacity + referral state to NECC. NECC operators
   broker bed-search across all 100 facilities, escalate ICU-full
   crises, monitor RQI in real-time, and feed the MoH dashboard.

   System flow:
     Tablet → Hospital Portal → NCRIS Switch → NECC
                                                ↓
     Tablet ← Hospital Portal ← NCRIS Switch ←  ↓
                                ARCS Dispatch ──┘ (ambulance triggered from NECC)

   ────────────────────────────────────────────────────────────────────
   MODULES (8)

   1. National Command Overview — wall-screen dashboard, live metrics
   2. Bed-Search & Routing       — match a service spec to facilities
   3. National Referral Stream   — every referral, all 100 facilities
   4. Capacity Heatmap           — facility × unit utilisation grid
   5. RQI Live Tracking          — 2×2 quality matrix per facility
   6. ARCS Liaison               — read-only ambulance dispatch state
   7. Audit Replication          — national audit event stream
   8. Escalation Console         — ICU-full and similar broker queue
   9. National Reports & EAR-Q   — aggregated metrics for MoH

   ────────────────────────────────────────────────────────────────────
   ROLES (4)

   • NECC Operator      — 24/7 floor staff, bed-search + escalation
   • NECC Supervisor    — audit + escalation authority
   • MoH Liaison        — read-only national dashboards + exports
   • Regional Coordinator — full operational scope within one region

   ────────────────────────────────────────────────────────────────────
   CLINICAL ENGINE

   Same vitalsEngine as Hospital Portal v2.0 and Tablet v2.1 —
   Ghana STG primary + WHO IMCI/IMAI backup, age-aware, 4-tier severity.
   Single source of truth on clinical thresholds across the whole system.
   © 2026 GhERIG Programme · Ghana Health Service
════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

/* ════════════════════════════════════════════════════════════════════
   STATIC CONFIG
════════════════════════════════════════════════════════════════════ */

const ROLES = {
  operator: {
    label: 'NECC Operator',           name: 'Mrs. Adwoa Boateng',  initials: 'AB',
    council: 'NECC-OPS-2024-0089',    dept: 'Command Floor · Shift A',
    defaultView: 'overview',
    region: 'all',
    allowed: ['overview','bedsearch','referrals','capacity','rqi','arcs','escalation','audit','reports'],
  },
  supervisor: {
    label: 'NECC Supervisor',          name: 'Dr. Kwabena Ofori',  initials: 'KO',
    council: 'NECC-SUP-2023-0012',     dept: 'Command Floor · Lead',
    defaultView: 'overview',
    region: 'all',
    allowed: ['overview','bedsearch','referrals','capacity','rqi','arcs','escalation','audit','reports','users'],
  },
  liaison: {
    label: 'MoH Liaison',              name: 'Mr. Yaw Adusei',     initials: 'YA',
    council: 'MOH-LSN-2022-0034',      dept: 'Ministry of Health',
    defaultView: 'reports',
    region: 'all',
    allowed: ['overview','capacity','rqi','reports','audit'],
  },
  regional: {
    label: 'Regional Coordinator · Greater Accra', name: 'Dr. Esinam Tagoe', initials: 'ET',
    council: 'NECC-REG-GA-0021',       dept: 'Greater Accra Region',
    defaultView: 'overview',
    region: 'GA',
    allowed: ['overview','bedsearch','referrals','capacity','rqi','arcs','escalation','audit','reports'],
  },
};

const NAV = [
  { id: 'overview',    label: 'National Overview',   icon: '◎', section: 'Command' },
  { id: 'bedsearch',   label: 'Bed-Search & Routing',icon: '⌖', section: 'Command' },
  { id: 'escalation',  label: 'Escalation Console',  icon: '⚠', section: 'Command' },
  { id: 'referrals',   label: 'National Referrals',  icon: '↔', section: 'Live Operations' },
  { id: 'capacity',    label: 'Capacity Heatmap',    icon: '⊞', section: 'Live Operations' },
  { id: 'arcs',        label: 'ARCS Liaison',        icon: '⊕', section: 'Live Operations' },
  { id: 'rqi',         label: 'RQI · Quality Matrix',icon: '▦', section: 'Quality & Audit' },
  { id: 'audit',       label: 'Audit Replication',   icon: '⊟', section: 'Quality & Audit' },
  { id: 'reports',     label: 'National EAR-Q',      icon: '◫', section: 'Reporting' },
  { id: 'users',       label: 'Users & Roles',       icon: '⌬', section: 'Administration' },
];

// Pilot facilities — 24 from the 100-facility programme, weighted toward Greater Accra
const FACILITIES = [
  // Tertiary (Greater Accra)
  { code: 'GH-ACC-001', name: 'Korle-Bu Teaching Hospital', tier: 'Tertiary', region: 'GA', regionLabel: 'Greater Accra', lat:5.5363, lng:-0.2270 },
  { code: 'GH-ACC-002', name: '37 Military Hospital',        tier: 'Tertiary', region: 'GA', regionLabel: 'Greater Accra', lat:5.5848, lng:-0.1879 },
  // Regional (Greater Accra)
  { code: 'GH-ACC-007', name: 'Ridge Hospital',              tier: 'Regional', region: 'GA', regionLabel: 'Greater Accra', lat:5.5666, lng:-0.2069 },
  { code: 'GH-ACC-014', name: 'Tema General Hospital',       tier: 'Regional', region: 'GA', regionLabel: 'Greater Accra', lat:5.6691, lng:-0.0167 },
  { code: 'GH-ACC-039', name: 'Police Hospital',             tier: 'Regional', region: 'GA', regionLabel: 'Greater Accra', lat:5.5719, lng:-0.2024 },
  // District (Greater Accra)
  { code: 'GH-ACC-019', name: 'LEKMA Hospital',              tier: 'District', region: 'GA', regionLabel: 'Greater Accra', lat:5.5880, lng:-0.1470 },
  { code: 'GH-ACC-022', name: 'Achimota Hospital',           tier: 'District', region: 'GA', regionLabel: 'Greater Accra', lat:5.6210, lng:-0.2353 },
  { code: 'GH-ACC-028', name: 'Mamprobi Hospital',           tier: 'District', region: 'GA', regionLabel: 'Greater Accra', lat:5.5320, lng:-0.2390 },
  { code: 'GH-ACC-031', name: 'La General Hospital',         tier: 'District', region: 'GA', regionLabel: 'Greater Accra', lat:5.5640, lng:-0.1720 },
  { code: 'GH-ACC-034', name: 'Ashaiman Polyclinic',         tier: 'District', region: 'GA', regionLabel: 'Greater Accra', lat:5.6921, lng:-0.0410 },
  { code: 'GH-ACC-038', name: 'Madina Polyclinic',           tier: 'District', region: 'GA', regionLabel: 'Greater Accra', lat:5.6837, lng:-0.1665 },
  { code: 'GH-ACC-042', name: 'Adabraka Polyclinic',         tier: 'District', region: 'GA', regionLabel: 'Greater Accra', lat:5.5610, lng:-0.2115 },
  // Tertiary (other regions)
  { code: 'GH-ASH-001', name: 'Komfo Anokye Teaching Hospital', tier: 'Tertiary', region: 'AS', regionLabel: 'Ashanti',     lat:6.6982, lng:-1.6234 },
  { code: 'GH-NOR-001', name: 'Tamale Teaching Hospital',       tier: 'Tertiary', region: 'NO', regionLabel: 'Northern',    lat:9.4034, lng:-0.8424 },
  { code: 'GH-CEN-001', name: 'Cape Coast Teaching Hospital',   tier: 'Tertiary', region: 'CE', regionLabel: 'Central',     lat:5.1318, lng:-1.2814 },
  // Regional (other regions)
  { code: 'GH-WES-001', name: 'Effia-Nkwanta Regional',         tier: 'Regional', region: 'WE', regionLabel: 'Western',     lat:4.9192, lng:-1.7541 },
  { code: 'GH-WES-007', name: 'GPHA Hospital, Takoradi',        tier: 'Regional', region: 'WE', regionLabel: 'Western',     lat:4.9039, lng:-1.7619 },
  { code: 'GH-VOL-001', name: 'Ho Teaching Hospital',           tier: 'Regional', region: 'VO', regionLabel: 'Volta',       lat:6.6094, lng:0.4715  },
  { code: 'GH-EAS-001', name: 'Eastern Regional Hospital',      tier: 'Regional', region: 'EA', regionLabel: 'Eastern',     lat:6.0905, lng:-0.2585 },
  { code: 'GH-BAR-001', name: 'Bono Regional Hospital',         tier: 'Regional', region: 'BO', regionLabel: 'Bono',        lat:7.7340, lng:-2.3262 },
  { code: 'GH-ASH-007', name: 'KATH Maternity & Children',      tier: 'Regional', region: 'AS', regionLabel: 'Ashanti',     lat:6.6970, lng:-1.6210 },
  // District (other regions)
  { code: 'GH-CEN-019', name: 'Mfantsiman District Hospital',   tier: 'District', region: 'CE', regionLabel: 'Central',     lat:5.2144, lng:-1.0625 },
  { code: 'GH-WES-022', name: 'Sekondi District Hospital',      tier: 'District', region: 'WE', regionLabel: 'Western',     lat:4.9333, lng:-1.7050 },
  { code: 'GH-VOL-014', name: 'Hohoe Municipal Hospital',       tier: 'District', region: 'VO', regionLabel: 'Volta',       lat:7.1503, lng:0.4729  },
];

const REGIONS = [
  { code: 'GA', label: 'Greater Accra' },
  { code: 'AS', label: 'Ashanti' },
  { code: 'CE', label: 'Central' },
  { code: 'WE', label: 'Western' },
  { code: 'EA', label: 'Eastern' },
  { code: 'VO', label: 'Volta' },
  { code: 'NO', label: 'Northern' },
  { code: 'BO', label: 'Bono' },
];

const SERVICES = [
  'General Surgery', 'Orthopaedics', 'Neurosurgery', 'Internal Medicine',
  'Cardiology', 'Paediatrics', 'Neonatology', 'Obstetrics & Gynaecology',
  'Anaesthesia / ICU', 'ENT', 'Ophthalmology', 'Urology', 'Plastic Surgery',
  'Psychiatry', 'CT Scan', 'MRI', 'Ultrasound', 'Endoscopy',
  'Dialysis', 'Blood bank', 'Burns care', 'Trauma care',
];

const STATUS_LABEL = {
  awaiting_decision: 'Awaiting decision',
  accepted: 'Accepted',
  declined: 'Declined',
  redirect_pending: 'Redirect pending',
  enroute: 'En route',
  arrived: 'Arrived',
};

const ESCALATION_TYPES = {
  icu_full:        { label: 'ICU at capacity',         severity: 'critical', icon: '⚕' },
  no_specialist:   { label: 'No specialist available', severity: 'high',     icon: '◑' },
  blood_critical:  { label: 'Blood bank critical',     severity: 'critical', icon: '⊘' },
  theatre_unavailable: { label: 'Theatre unavailable', severity: 'high',     icon: '⌧' },
  ct_offline:      { label: 'CT scanner offline',      severity: 'high',     icon: '◊' },
  multi_critical:  { label: 'Multiple critical cases', severity: 'critical', icon: '⚠' },
};

/* ════════════════════════════════════════════════════════════════════
   CLINICAL VITALS ENGINE — same as portal v2.0 / tablet v2.1
   Single source of truth across system. Ghana STG primary + WHO IMCI.
════════════════════════════════════════════════════════════════════ */

const TIER_SCORE = { normal: 0, borderline: 1, abnormal: 2, critical: 3 };

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

const VITAL_RANGES = {
  sbp: {
    neonate:      { critical: [null, 50],  abnormal: [50, 60],   borderline: [60, 70],   normal: [70, 90] },
    infant:       { critical: [null, 60],  abnormal: [60, 70],   borderline: [70, 80],   normal: [80, 110] },
    child_under5: { critical: [null, 70],  abnormal: [70, 80],   borderline: [80, 90],   normal: [90, 115] },
    child:        { critical: [null, 80],  abnormal: [80, 90],   borderline: [90, 100],  normal: [100, 120] },
    adolescent:   { critical: [null, 85],  abnormal: [85, 95],   borderline: [95, 105],  normal: [105, 130] },
    adult:        { critical: [null, 90],  abnormal: [90, 100],  borderline: [100, 110], normal: [110, 140] },
    elderly:      { critical: [null, 90],  abnormal: [90, 105],  borderline: [105, 115], normal: [115, 150] },
    highCritical: 180, highAbnormal: 160, highBorderline: 140,
  },
  hr: {
    neonate:      { critical: [null, 90],  abnormal: [90, 100],  borderline: [100, 110], normal: [110, 160], borderlineHi: 160, abnormalHi: 180, criticalHi: 200 },
    infant:       { critical: [null, 80],  abnormal: [80, 90],   borderline: [90, 100],  normal: [100, 150], borderlineHi: 150, abnormalHi: 170, criticalHi: 190 },
    child_under5: { critical: [null, 60],  abnormal: [60, 70],   borderline: [70, 80],   normal: [80, 130],  borderlineHi: 130, abnormalHi: 150, criticalHi: 170 },
    child:        { critical: [null, 50],  abnormal: [50, 60],   borderline: [60, 70],   normal: [70, 110],  borderlineHi: 110, abnormalHi: 130, criticalHi: 150 },
    adolescent:   { critical: [null, 45],  abnormal: [45, 50],   borderline: [50, 60],   normal: [60, 100],  borderlineHi: 100, abnormalHi: 120, criticalHi: 140 },
    adult:        { critical: [null, 40],  abnormal: [40, 50],   borderline: [50, 60],   normal: [60, 100],  borderlineHi: 100, abnormalHi: 120, criticalHi: 140 },
    elderly:      { critical: [null, 40],  abnormal: [40, 50],   borderline: [50, 55],   normal: [55, 95],   borderlineHi: 95,  abnormalHi: 115, criticalHi: 130 },
  },
  rr: {
    neonate:      { critical: [null, 25], abnormal: [25, 30], borderline: [30, 35],  normal: [35, 60],  borderlineHi: 60,  abnormalHi: 70,  criticalHi: 80 },
    infant:       { critical: [null, 22], abnormal: [22, 28], borderline: [28, 32],  normal: [32, 50],  borderlineHi: 50,  abnormalHi: 60,  criticalHi: 70 },
    child_under5: { critical: [null, 18], abnormal: [18, 22], borderline: [22, 26],  normal: [26, 40],  borderlineHi: 40,  abnormalHi: 50,  criticalHi: 60 },
    child:        { critical: [null, 14], abnormal: [14, 16], borderline: [16, 18],  normal: [18, 30],  borderlineHi: 30,  abnormalHi: 40,  criticalHi: 50 },
    adolescent:   { critical: [null, 10], abnormal: [10, 12], borderline: [12, 14],  normal: [14, 22],  borderlineHi: 22,  abnormalHi: 26,  criticalHi: 30 },
    adult:        { critical: [null, 8],  abnormal: [8, 10],  borderline: [10, 12],  normal: [12, 20],  borderlineHi: 20,  abnormalHi: 25,  criticalHi: 30 },
    elderly:      { critical: [null, 8],  abnormal: [8, 10],  borderline: [10, 12],  normal: [12, 20],  borderlineHi: 20,  abnormalHi: 25,  criticalHi: 30 },
  },
  spo2: {
    all: { critical: 90, abnormal: 92, borderline: 94, normal: 100 },
    neonate: { critical: 88, abnormal: 90, borderline: 93, normal: 100 },
  },
  gcs: { critical: 8, abnormal: 12, borderline: 14, normal: 15 },
};

const tierFromBand = (val, band) => {
  if (val == null || isNaN(val)) return null;
  if (band.critical && band.critical[1] != null && val < band.critical[1]) return 'critical';
  if (band.abnormal && val >= band.abnormal[0] && val < band.abnormal[1]) return 'abnormal';
  if (band.borderline && val >= band.borderline[0] && val < band.borderline[1]) return 'borderline';
  if (band.normal && val >= band.normal[0] && val <= band.normal[1]) return 'normal';
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
  if (val < band.critical[1]) tier = 'critical';
  else if (val < band.abnormal[1]) tier = 'abnormal';
  else if (val < band.borderline[1]) tier = 'borderline';
  else if (val >= VITAL_RANGES.sbp.highCritical) tier = 'critical';
  else if (val >= VITAL_RANGES.sbp.highAbnormal) tier = 'abnormal';
  else if (val >= VITAL_RANGES.sbp.highBorderline) tier = 'borderline';
  return { tier, score: TIER_SCORE[tier] };
};

const assessHR = (val, age, category) => {
  if (val == null || isNaN(val)) return null;
  const ab = ageBand(age, category);
  const tier = tierFromBand(val, VITAL_RANGES.hr[ab]) || 'normal';
  return { tier, score: TIER_SCORE[tier] };
};

const assessRR = (val, age, category) => {
  if (val == null || isNaN(val)) return null;
  const ab = ageBand(age, category);
  const tier = tierFromBand(val, VITAL_RANGES.rr[ab]) || 'normal';
  return { tier, score: TIER_SCORE[tier] };
};

const assessSpO2 = (val, category) => {
  if (val == null || isNaN(val)) return null;
  const t = category === 'Neonate' ? VITAL_RANGES.spo2.neonate : VITAL_RANGES.spo2.all;
  let tier = 'normal';
  if (val < t.critical) tier = 'critical';
  else if (val < t.abnormal) tier = 'abnormal';
  else if (val < t.borderline) tier = 'borderline';
  return { tier, score: TIER_SCORE[tier] };
};

const assessGCS = (val) => {
  if (val == null || isNaN(val)) return null;
  let tier = 'normal';
  if (val <= VITAL_RANGES.gcs.critical) tier = 'critical';
  else if (val <= VITAL_RANGES.gcs.abnormal) tier = 'abnormal';
  else if (val <= VITAL_RANGES.gcs.borderline) tier = 'borderline';
  return { tier, score: TIER_SCORE[tier] };
};

const assessVitals = (vitals, age, category) => {
  const checks = {
    sbp:  assessSBP(parseFloat(vitals.sbp), age, category),
    hr:   assessHR(parseFloat(vitals.hr), age, category),
    rr:   assessRR(parseFloat(vitals.rr), age, category),
    spo2: assessSpO2(parseFloat(vitals.spo2), category),
    gcs:  assessGCS(parseFloat(vitals.gcs)),
  };
  let totalScore = 0, criticalCount = 0;
  Object.values(checks).forEach(c => { if (!c) return; totalScore += c.score; if (c.tier === 'critical') criticalCount++; });
  return { perVital: checks, totalScore, criticalCount };
};

/* ════════════════════════════════════════════════════════════════════
   STYLES — Embedded as a single <style> tag on mount.
   Same design language as portal/tablet for cognitive consistency.
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
  --indigo:#274875; --indigo-pale:#E1E8F3;
  --paper-0:#FAFAF7; --paper-1:#F4F3EE; --paper-2:#FFFFFF; --paper-3:#FBF9F3;
  --paper-deep:#0A0F0C; --paper-deep-2:#141A16;
  --ink-1:#1A1F1B; --ink-2:#404642; --ink-3:#6B7269; --ink-4:#9CA39B; --ink-5:#C4C9C0;
  --ink-on-dark-1:#F5F7F3; --ink-on-dark-2:#B8C0B3; --ink-on-dark-3:#7B8378;
  --border:#E0DCCE; --border-strong:#C9C2AE; --border-on-dark:#252B27;
  --shadow:0 2px 8px rgba(20,30,20,0.06), 0 1px 2px rgba(20,30,20,0.04);
  --shadow-lg:0 12px 32px rgba(20,30,20,0.10), 0 2px 6px rgba(20,30,20,0.06);
  --shadow-xl:0 24px 60px rgba(20,30,20,0.16), 0 4px 12px rgba(20,30,20,0.08);
  --radius-sm:6px; --radius:10px; --radius-lg:14px; --radius-xl:20px;
  --display:'Fraunces','Times New Roman',serif;
  --body:'Inter Tight',-apple-system,system-ui,sans-serif;
  --mono:'JetBrains Mono','SF Mono',Menlo,monospace;
}
.necc *, .necc *::before, .necc *::after { box-sizing:border-box; margin:0; padding:0; }
.necc { font-family:var(--body); background:var(--paper-0); color:var(--ink-1); font-size:13.5px; line-height:1.5; -webkit-font-smoothing:antialiased; min-height:100vh; }
.necc button { font-family:inherit; cursor:pointer; border:none; background:none; color:inherit; }
.necc button:disabled { opacity:0.5; cursor:not-allowed; }
.necc input, .necc select, .necc textarea { font-family:inherit; color:inherit; }
.necc ::-webkit-scrollbar { width:8px; height:8px; }
.necc ::-webkit-scrollbar-track { background:transparent; }
.necc ::-webkit-scrollbar-thumb { background:var(--border-strong); border-radius:4px; border:2px solid var(--paper-0); }

/* LOGIN — darker, more "command centre" feel than the hospital portal */
.login-screen { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; position:relative; overflow:hidden; background:#06120D; }
.login-screen::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse 50% 40% at 12% 18%, rgba(15,107,83,0.45) 0%, transparent 60%), radial-gradient(ellipse 45% 55% at 88% 82%, rgba(138,77,31,0.3) 0%, transparent 55%), radial-gradient(ellipse 35% 35% at 75% 18%, rgba(196,137,44,0.16) 0%, transparent 60%); pointer-events:none; }
.login-screen::after { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg,#B5371F 0%,#C4892C 50%,#277148 100%); z-index:2; }
.login-card { position:relative; z-index:1; width:100%; max-width:1080px; background:var(--paper-2); border-radius:24px; box-shadow:var(--shadow-xl); overflow:hidden; display:grid; grid-template-columns:1.15fr 0.85fr; }
@media (max-width: 880px) { .login-card { grid-template-columns:1fr; max-width:480px; } .login-left { padding:32px 28px !important; } }
.login-left { padding:56px 56px 48px; background:linear-gradient(180deg,#FFFFFF 0%, #FBF9F3 100%); display:flex; flex-direction:column; }
.login-brand { display:flex; align-items:center; gap:14px; margin-bottom:64px; }
.login-mark { width:52px; height:52px; background:#06120D; color:#fff; border-radius:14px; display:flex; align-items:center; justify-content:center; font-family:var(--display); font-weight:700; font-size:23px; letter-spacing:-0.02em; box-shadow:inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 3px rgba(0,0,0,0.18); position:relative; }
.login-mark::after { content:''; position:absolute; inset:-3px; border:1.5px solid var(--copper); border-radius:17px; opacity:0.6; }
.login-brand-text .name { font-family:var(--display); font-size:24px; font-weight:600; letter-spacing:-0.03em; line-height:1; }
.login-brand-text .sub { font-family:var(--mono); font-size:9.5px; letter-spacing:0.22em; text-transform:uppercase; color:var(--ink-3); margin-top:4px; }
.login-eyebrow { font-family:var(--mono); font-size:10px; letter-spacing:0.22em; text-transform:uppercase; color:var(--copper); font-weight:600; margin-bottom:16px; }
.login-headline { font-family:var(--display); font-size:54px; font-weight:500; line-height:0.96; letter-spacing:-0.04em; color:var(--ink-1); margin-bottom:20px; }
.login-headline em { font-style:italic; font-weight:400; color:var(--copper); }
.login-tagline { font-size:14px; line-height:1.6; color:var(--ink-3); max-width:380px; margin-bottom:36px; }
.login-meta { margin-top:auto; padding-top:24px; border-top:1px solid var(--border); display:flex; gap:28px; flex-wrap:wrap; }
.login-meta-item { font-family:var(--mono); font-size:10px; letter-spacing:0.08em; color:var(--ink-3); text-transform:uppercase; }
.login-meta-item b { color:var(--ink-1); font-weight:600; }
.login-right { padding:56px 48px; background:var(--paper-1); border-left:1px solid var(--border); display:flex; flex-direction:column; justify-content:center; }
.login-form-card { background:var(--paper-2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:32px; box-shadow:var(--shadow); }
.login-form-icon { width:46px; height:46px; background:var(--forest-pale); color:var(--forest-deep); border-radius:12px; display:flex; align-items:center; justify-content:center; margin-bottom:18px; font-size:20px; }
.login-form-title { font-family:var(--display); font-size:22px; font-weight:600; letter-spacing:-0.025em; line-height:1.1; margin-bottom:4px; }
.login-form-sub { font-size:12.5px; color:var(--ink-3); margin-bottom:24px; }
.field-label { display:block; font-family:var(--mono); font-size:9.5px; font-weight:600; letter-spacing:0.18em; text-transform:uppercase; color:var(--ink-3); margin-bottom:7px; }
.field-input { width:100%; padding:11px 14px; background:var(--paper-2); border:1.5px solid var(--border); border-radius:10px; font-size:13.5px; color:var(--ink-1); outline:none; transition:border-color .15s, box-shadow .15s; }
.field-input:focus { border-color:var(--forest); box-shadow:0 0 0 3px rgba(10,77,60,0.12); }
.field { margin-bottom:16px; }
.login-btn { width:100%; padding:13px 16px; background:#06120D; color:#fff; border-radius:10px; font-size:13px; font-weight:600; margin-top:24px; display:flex; align-items:center; justify-content:center; gap:8px; transition:background .15s; box-shadow:0 4px 12px rgba(10,77,60,0.25); }
.login-btn:hover { background:var(--forest-deep); }
.login-role-pills { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
.login-role-pill { padding:10px 12px; background:var(--paper-2); border:1.5px solid var(--border); border-radius:10px; font-size:11.5px; font-weight:500; color:var(--ink-2); text-align:left; transition:all .12s; }
.login-role-pill .role-name { font-weight:600; color:var(--ink-1); display:block; margin-bottom:1px; }
.login-role-pill .role-sub { font-family:var(--mono); font-size:9px; color:var(--ink-3); letter-spacing:0.04em; }
.login-role-pill:hover { border-color:var(--forest-mid); background:var(--forest-faint); }
.login-role-pill.active { border-color:var(--forest-deep); background:var(--forest-pale); box-shadow:inset 0 0 0 1px var(--forest-deep); }
.login-role-pill.active .role-name { color:var(--forest-deep); }
.login-fineprint { text-align:center; margin-top:20px; font-family:var(--mono); font-size:9.5px; letter-spacing:0.12em; text-transform:uppercase; color:var(--ink-4); }

/* TOPBAR — darker for command-floor feel */
.topbar { position:fixed; top:0; left:0; right:0; height:56px; z-index:100; background:#06120D; border-bottom:1px solid #1A2520; display:flex; align-items:center; }
.topbar-brand { width:240px; height:100%; display:flex; align-items:center; gap:11px; padding:0 22px; border-right:1px solid #1A2520; flex-shrink:0; }
.topbar-mark { width:32px; height:32px; background:var(--paper-2); color:#06120D; border-radius:9px; display:flex; align-items:center; justify-content:center; font-family:var(--display); font-weight:700; font-size:15px; }
.topbar-name { font-family:var(--display); font-weight:600; font-size:16px; letter-spacing:-0.025em; line-height:1; color:#fff; }
.topbar-sub { font-family:var(--mono); font-size:8.5px; letter-spacing:0.2em; text-transform:uppercase; color:var(--ink-on-dark-3); margin-top:3px; }
.topbar-context { flex:1; height:100%; display:flex; align-items:center; padding:0 28px; gap:24px; }
.facility-chip { display:flex; align-items:center; gap:10px; padding:6px 14px 6px 6px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:22px; }
.facility-chip-mark { width:26px; height:26px; background:var(--copper); color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:var(--display); font-size:11px; font-weight:700; }
.facility-chip-name { font-size:11.5px; font-weight:600; color:#fff; }
.facility-chip-meta { font-family:var(--mono); font-size:9px; color:var(--ink-on-dark-2); margin-top:1px; }
.topbar-status { display:flex; align-items:center; gap:14px; margin-left:auto; }
.live-pill { display:inline-flex; align-items:center; gap:6px; padding:4px 12px 4px 9px; background:rgba(39,113,72,0.18); border:1px solid rgba(39,113,72,0.4); border-radius:20px; font-family:var(--mono); font-size:9.5px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#7BCEA1; }
.live-dot { width:6px; height:6px; background:#7BCEA1; border-radius:50%; box-shadow:0 0 0 3px rgba(39,113,72,0.18); animation:pulse-live 2s ease-in-out infinite; }
@keyframes pulse-live { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
.topbar-clock { font-family:var(--mono); font-size:11px; color:var(--ink-on-dark-2); font-weight:500; }
.topbar-user { display:flex; align-items:center; gap:10px; padding:5px 6px 5px 12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:22px; cursor:pointer; }
.topbar-user:hover { background:rgba(255,255,255,0.08); }
.user-text { line-height:1.15; text-align:right; }
.user-name { font-size:11.5px; font-weight:600; color:#fff; }
.user-role { font-family:var(--mono); font-size:9px; color:var(--ink-on-dark-2); margin-top:1px; }
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
.sb-item-badge.amber { background:var(--amber); }
.sb-footer { margin-top:auto; padding:16px 18px; border-top:1px solid var(--border); background:var(--paper-3); }
.sb-footer-line { font-family:var(--mono); font-size:9px; color:var(--ink-3); letter-spacing:0.06em; margin-bottom:4px; }
.sb-footer-line b { color:var(--ink-1); font-weight:600; }

/* PAGE HEAD */
.page-head { display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:24px; gap:24px; flex-wrap:wrap; }
.page-eyebrow { font-family:var(--mono); font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:var(--copper); font-weight:600; margin-bottom:6px; }
.page-title { font-family:var(--display); font-size:32px; font-weight:500; letter-spacing:-0.035em; line-height:1.05; }
.page-sub { margin-top:8px; font-size:13px; color:var(--ink-3); max-width:680px; }
.page-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.btn { display:inline-flex; align-items:center; gap:7px; padding:8px 14px; background:var(--paper-2); border:1px solid var(--border); border-radius:9px; font-size:12px; font-weight:500; color:var(--ink-2); transition:all .12s; }
.btn:hover { border-color:var(--border-strong); background:var(--paper-3); color:var(--ink-1); }
.btn-primary { background:var(--forest-deep); color:#fff; border-color:var(--forest-deep); box-shadow:0 2px 6px rgba(10,77,60,0.18); }
.btn-primary:hover { background:var(--forest); border-color:var(--forest); color:#fff; }
.btn-danger { color:var(--crimson); }
.btn-danger:hover { background:var(--crimson-pale); border-color:var(--crimson); color:var(--crimson-deep); }
.btn-warn { background:var(--amber); color:#fff; border-color:var(--amber); }
.btn-warn:hover { background:#B06814; border-color:#B06814; color:#fff; }
.btn-sm { padding:5px 10px; font-size:11px; }

/* KPI / CARDS */
.kpi-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:24px; }
@media (max-width:1100px) { .kpi-strip { grid-template-columns:repeat(2,1fr); } }
.kpi-card { background:var(--paper-2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:18px 20px; position:relative; overflow:hidden; transition:box-shadow .2s; }
.kpi-card:hover { box-shadow:var(--shadow); }
.kpi-card::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; }
.kc-crimson::before { background:var(--crimson); } .kc-forest::before { background:var(--forest); }
.kc-copper::before { background:var(--copper); } .kc-emerald::before { background:var(--emerald); }
.kc-amber::before { background:var(--amber); } .kc-indigo::before { background:var(--indigo); }
.kpi-label { font-family:var(--mono); font-size:9.5px; font-weight:600; letter-spacing:0.18em; text-transform:uppercase; color:var(--ink-3); margin-bottom:10px; }
.kpi-value { font-family:var(--display); font-size:38px; font-weight:500; line-height:1; letter-spacing:-0.04em; }
.kc-crimson .kpi-value { color:var(--crimson-deep); } .kc-forest .kpi-value { color:var(--forest-deep); }
.kc-copper .kpi-value { color:var(--copper); } .kc-emerald .kpi-value { color:var(--emerald); }
.kc-amber .kpi-value { color:var(--amber); } .kc-indigo .kpi-value { color:var(--indigo); }
.kpi-delta { margin-top:8px; display:inline-flex; align-items:center; gap:5px; font-family:var(--mono); font-size:10px; font-weight:600; padding:2px 8px; border-radius:5px; }
.kpi-delta.up { background:var(--crimson-pale); color:var(--crimson); }
.kpi-delta.dn { background:var(--emerald-pale); color:var(--emerald); }
.kpi-delta.neu { background:var(--paper-3); color:var(--ink-3); }
.kpi-foot { margin-top:10px; padding-top:10px; border-top:1px solid var(--border); font-family:var(--mono); font-size:10px; color:var(--ink-3); }

.section-head { display:flex; align-items:baseline; gap:14px; margin:26px 0 14px; }
.section-title { font-family:var(--display); font-size:18px; font-weight:600; letter-spacing:-0.02em; }
.section-line { flex:1; height:1px; background:var(--border); }
.section-meta { font-family:var(--mono); font-size:10px; color:var(--ink-3); }
.section-meta b { color:var(--copper); font-weight:700; }

.card { background:var(--paper-2); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; margin-bottom:18px; }
.card-head { padding:14px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; background:var(--paper-3); flex-wrap:wrap; gap:8px; }
.card-title { display:flex; align-items:center; gap:10px; font-family:var(--display); font-size:15px; font-weight:600; letter-spacing:-0.02em; }
.card-title-icon { width:26px; height:26px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:14px; }
.cti-forest { background:var(--forest-pale); color:var(--forest-deep); }
.cti-crimson { background:var(--crimson-pale); color:var(--crimson); }
.cti-copper { background:var(--copper-pale); color:var(--copper); }
.cti-emerald { background:var(--emerald-pale); color:var(--emerald); }
.cti-amber { background:var(--amber-pale); color:var(--amber); }
.cti-indigo { background:var(--indigo-pale); color:var(--indigo); }
.card-meta { font-family:var(--mono); font-size:10px; color:var(--ink-3); }
.card-meta b { color:var(--ink-1); font-weight:600; }

.two-col { display:grid; grid-template-columns:2fr 1fr; gap:18px; }
@media (max-width:1100px) { .two-col { grid-template-columns:1fr; } }
.three-col { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; }
@media (max-width:1100px) { .three-col { grid-template-columns:1fr; } }

.page-section { animation:fade-up .35s ease both; }
@keyframes fade-up { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }

/* GHANA MAP — simple SVG-based national outline view */
.map-frame { background:linear-gradient(180deg, #FBF9F3 0%, #F4F3EE 100%); border:1px solid var(--border); border-radius:var(--radius-lg); padding:14px; position:relative; overflow:hidden; }
.map-svg { width:100%; height:auto; }
.map-region-outline { fill:none; stroke:var(--border-strong); stroke-width:1.2; stroke-linejoin:round; }
.map-region-fill { fill:var(--paper-3); stroke:var(--border-strong); stroke-width:1; transition:fill .2s; }
.map-region-fill:hover { fill:var(--forest-faint); cursor:pointer; }
.map-facility-dot { transition:r .2s, opacity .2s; cursor:pointer; }
.map-facility-dot:hover { r:6.5; }
.map-facility-dot.status-open { fill:var(--emerald); }
.map-facility-dot.status-constrained { fill:var(--amber); }
.map-facility-dot.status-full { fill:var(--crimson); }
.map-facility-dot.status-offline { fill:var(--ink-4); }
.map-facility-label { font-family:var(--mono); font-size:8px; fill:var(--ink-3); pointer-events:none; }
.map-legend { display:flex; gap:14px; flex-wrap:wrap; margin-top:8px; padding:8px 12px; background:var(--paper-2); border:1px solid var(--border); border-radius:8px; }
.map-legend-item { display:flex; align-items:center; gap:5px; font-family:var(--mono); font-size:10px; color:var(--ink-3); }
.map-legend-dot { width:9px; height:9px; border-radius:50%; }

/* BED-SEARCH */
.bedsearch-form { padding:18px; }
.bedsearch-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:14px; }
@media (max-width:1100px) { .bedsearch-grid { grid-template-columns:repeat(2,1fr); } }
.search-result-row { display:grid; grid-template-columns:auto 1fr auto auto auto auto auto; gap:14px; padding:12px 16px; border-bottom:1px solid var(--border); align-items:center; transition:background .12s; }
.search-result-row:hover { background:var(--forest-faint); }
.search-result-row:last-child { border-bottom:none; }
.search-rank { font-family:var(--display); font-size:18px; font-weight:600; color:var(--copper); width:24px; }
.search-fac-name { font-weight:600; font-size:13px; }
.search-fac-meta { font-family:var(--mono); font-size:10px; color:var(--ink-3); margin-top:2px; }
.search-stat { text-align:center; }
.search-stat-val { font-family:var(--mono); font-size:13px; font-weight:700; }
.search-stat-lbl { font-family:var(--mono); font-size:9px; color:var(--ink-3); text-transform:uppercase; letter-spacing:0.08em; }
.search-stat.score-high .search-stat-val { color:var(--emerald); }
.search-stat.score-med .search-stat-val { color:var(--amber); }
.search-stat.score-low .search-stat-val { color:var(--crimson); }
.search-empty { padding:48px; text-align:center; color:var(--ink-3); }
.svc-pill { display:inline-flex; padding:3px 9px; margin:2px; border-radius:14px; background:var(--forest-faint); border:1px solid var(--forest-pale); font-family:var(--mono); font-size:9.5px; color:var(--forest-deep); font-weight:600; cursor:pointer; }
.svc-pill.active { background:var(--forest-deep); color:#fff; border-color:var(--forest-deep); }

/* NATIONAL REFERRAL STREAM */
.stream-row { display:grid; grid-template-columns:90px 80px 1fr 1fr 70px 110px 110px 90px; gap:10px; padding:10px 16px; border-bottom:1px solid var(--border); align-items:center; font-size:12px; transition:background .12s; cursor:pointer; }
.stream-row:hover { background:var(--paper-3); }
.stream-row.priority-critical { border-left:3px solid var(--crimson); padding-left:13px; }
.stream-row.priority-high { border-left:3px solid var(--amber); padding-left:13px; }
.stream-row.priority-routine { border-left:3px solid var(--forest-mid); padding-left:13px; }
.stream-pill { display:inline-flex; padding:2px 8px; border-radius:10px; font-family:var(--mono); font-size:9px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
.stream-id { font-family:var(--mono); font-size:10.5px; color:var(--ink-3); }
.stream-cond { font-weight:600; line-height:1.3; }
.stream-cond-sub { font-family:var(--mono); font-size:9.5px; color:var(--ink-3); margin-top:1px; }
.stream-pat { font-family:var(--mono); font-size:11px; }
.stream-fac { font-size:11px; }
.stream-fac-sub { font-family:var(--mono); font-size:9px; color:var(--ink-3); }
.stream-time { font-family:var(--mono); font-size:10.5px; color:var(--ink-3); }

/* HEATMAP */
.heatmap-wrap { overflow-x:auto; padding-bottom:12px; }
.heatmap-table { border-collapse:separate; border-spacing:0; font-size:11px; min-width:100%; }
.heatmap-table th, .heatmap-table td { padding:0; }
.heatmap-table th { background:var(--paper-3); border-bottom:1px solid var(--border); }
.heatmap-table th.row-head, .heatmap-table th.col-head { font-family:var(--mono); font-size:9px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:var(--ink-3); }
.heatmap-table th.col-head { padding:8px 6px; text-align:center; min-width:60px; }
.heatmap-table th.row-head { padding:8px 14px; text-align:left; min-width:220px; position:sticky; left:0; background:var(--paper-3); z-index:2; border-right:1px solid var(--border); }
.heatmap-table tbody tr:hover td { background:var(--forest-faint); }
.heatmap-table tbody tr:hover th.row-head { background:var(--forest-faint); }
.heatmap-table td.row-head-cell { padding:8px 14px; font-size:11.5px; font-weight:500; min-width:220px; position:sticky; left:0; background:var(--paper-2); z-index:1; border-right:1px solid var(--border); border-bottom:1px solid var(--border); }
.heatmap-table td.row-head-cell .name { font-weight:600; }
.heatmap-table td.row-head-cell .meta { font-family:var(--mono); font-size:9px; color:var(--ink-3); margin-top:1px; }
.heatmap-table td.cell { text-align:center; padding:6px 4px; border-bottom:1px solid var(--border); border-right:1px solid var(--border); min-width:60px; cursor:default; transition:transform .1s; }
.heatmap-table td.cell:hover { transform:scale(1.05); z-index:3; }
.heatmap-cell-val { font-family:var(--mono); font-size:11px; font-weight:700; line-height:1.1; }
.heatmap-cell-tot { font-family:var(--mono); font-size:9px; opacity:0.7; }
.cell-empty { background:var(--paper-3); color:var(--ink-4); }
.cell-low { background:#E6F1EA; color:var(--emerald); }
.cell-mid { background:#F1ECDF; color:#8E6F1F; }
.cell-high { background:#F4DECF; color:var(--copper); }
.cell-full { background:var(--crimson-pale); color:var(--crimson); }

/* RQI MATRIX */
.rqi-matrix { background:var(--paper-2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:24px 28px; position:relative; }
.rqi-svg { width:100%; height:auto; }
.rqi-axis-label { font-family:var(--mono); font-size:10px; fill:var(--ink-3); text-transform:uppercase; letter-spacing:0.1em; }
.rqi-quadrant-label { font-family:var(--display); font-size:13px; font-weight:600; }
.rqi-q-q1 { fill:var(--emerald); }
.rqi-q-q2 { fill:var(--amber); }
.rqi-q-q3 { fill:var(--copper); }
.rqi-q-q4 { fill:var(--crimson); }
.rqi-dot { transition:r .15s; cursor:pointer; }
.rqi-dot:hover { r:7; }
.rqi-dot-label { font-family:var(--mono); font-size:8px; fill:var(--ink-2); pointer-events:none; }
.rqi-grid-line { stroke:var(--border); stroke-width:1; stroke-dasharray:3,4; }
.rqi-axis { stroke:var(--ink-2); stroke-width:1.5; }
.rqi-quadrant-fill { opacity:0.06; }
.rqi-tooltip { position:absolute; padding:8px 12px; background:var(--ink-1); color:#fff; border-radius:8px; font-size:11px; pointer-events:none; transform:translate(-50%, -110%); z-index:10; box-shadow:var(--shadow); }
.rqi-tooltip-name { font-weight:600; margin-bottom:2px; }
.rqi-tooltip-stat { font-family:var(--mono); font-size:10px; color:rgba(255,255,255,0.78); }

/* ESCALATION CONSOLE */
.esc-card { background:var(--paper-2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:14px 18px; margin-bottom:10px; position:relative; transition:transform .12s, box-shadow .12s; }
.esc-card.severity-critical { border-left:4px solid var(--crimson); }
.esc-card.severity-high { border-left:4px solid var(--amber); }
.esc-card:hover { box-shadow:var(--shadow); transform:translateX(2px); }
.esc-card-row { display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; }
.esc-icon { width:36px; height:36px; border-radius:9px; background:var(--crimson-pale); color:var(--crimson); display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
.esc-icon.amber { background:var(--amber-pale); color:var(--amber); }
.esc-info-block { flex:1; min-width:280px; }
.esc-title { font-family:var(--display); font-size:14.5px; font-weight:600; line-height:1.2; }
.esc-fac { font-size:11.5px; color:var(--ink-2); margin-top:2px; }
.esc-time { font-family:var(--mono); font-size:10px; color:var(--ink-3); margin-top:3px; }
.esc-actions { display:flex; gap:6px; }

/* ARCS LIAISON */
.arcs-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; }
.arcs-tile { background:var(--paper-2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:14px 16px; position:relative; overflow:hidden; }
.arcs-tile::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; }
.arcs-state-dispatched::before { background:var(--copper); }
.arcs-state-enroute::before { background:var(--amber); }
.arcs-state-arrived::before { background:var(--emerald); }
.arcs-state-cleared::before { background:var(--ink-4); }
.arcs-tile-head { display:flex; justify-content:space-between; margin-bottom:8px; }
.arcs-vehicle { font-family:var(--mono); font-size:11px; font-weight:700; color:var(--ink-1); }
.arcs-state-pill { display:inline-flex; padding:2px 8px; border-radius:10px; font-family:var(--mono); font-size:9px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
.arcs-state-pill.dispatched { background:var(--copper-pale); color:var(--copper); }
.arcs-state-pill.enroute    { background:var(--amber-pale); color:var(--amber); }
.arcs-state-pill.arrived    { background:var(--emerald-pale); color:var(--emerald); }
.arcs-state-pill.cleared    { background:var(--paper-3); color:var(--ink-3); }
.arcs-tile-body { font-size:12px; line-height:1.5; }
.arcs-row { display:grid; grid-template-columns:60px 1fr; gap:8px; align-items:baseline; margin-bottom:4px; }
.arcs-row .k { font-family:var(--mono); font-size:9px; font-weight:600; color:var(--ink-3); letter-spacing:0.08em; text-transform:uppercase; }
.arcs-row .v { font-size:11.5px; }

/* AUDIT */
.audit-list { display:flex; flex-direction:column; }
.audit-item { display:grid; grid-template-columns:90px 140px 130px 1fr 100px; gap:14px; padding:11px 18px; border-bottom:1px solid var(--border); align-items:center; font-size:11.5px; }
.audit-item:hover { background:var(--paper-3); }
.audit-item:last-child { border-bottom:none; }
.audit-time { font-family:var(--mono); font-size:10px; color:var(--ink-3); }
.audit-fac { font-family:var(--mono); font-size:10.5px; color:var(--copper); font-weight:600; }
.audit-actor { font-weight:600; font-size:11px; }
.audit-action { color:var(--ink-2); line-height:1.4; }
.audit-ref { font-family:var(--mono); font-size:9.5px; color:var(--ink-3); text-align:right; }

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
.row-pill { display:inline-flex; padding:2px 8px; border-radius:12px; font-family:var(--mono); font-size:9.5px; font-weight:700; }
.rp-active, .rp-online { background:var(--emerald-pale); color:var(--emerald); }
.rp-offline { background:var(--paper-1); color:var(--ink-3); }
.rp-degraded { background:var(--amber-pale); color:var(--amber); }
.rp-locked { background:var(--crimson-pale); color:var(--crimson); }

/* FILTER BAR */
.filter-bar { display:flex; align-items:center; gap:8px; padding:12px 18px; background:var(--paper-3); border-bottom:1px solid var(--border); flex-wrap:wrap; }
.filter-pill { padding:6px 12px; background:var(--paper-2); border:1px solid var(--border); border-radius:18px; font-size:11.5px; font-weight:500; color:var(--ink-2); transition:all .12s; cursor:pointer; }
.filter-pill:hover { border-color:var(--forest-mid); }
.filter-pill.active { background:var(--forest-deep); color:#fff; border-color:var(--forest-deep); font-weight:600; }
.filter-pill .count { margin-left:5px; padding:1px 6px; background:rgba(255,255,255,0.18); border-radius:8px; font-family:var(--mono); font-size:9.5px; font-weight:700; }
.filter-pill:not(.active) .count { background:var(--paper-1); color:var(--ink-3); }
.filter-search { margin-left:auto; display:flex; align-items:center; gap:6px; padding:5px 10px; background:var(--paper-2); border:1px solid var(--border); border-radius:8px; min-width:220px; }
.filter-search input { border:none; outline:none; background:transparent; font-size:12px; flex:1; }

/* CHART */
.chart-wrap { padding:16px 20px 0; }
.chart-bars { display:flex; align-items:flex-end; gap:4px; height:130px; padding-bottom:4px; }
.bar-group { flex:1; display:flex; flex-direction:column; align-items:center; height:100%; }
.bar-pair { width:100%; display:flex; align-items:flex-end; gap:1px; flex:1; }
.bar { flex:1; border-radius:2px 2px 0 0; min-height:2px; }
.chart-axis { display:flex; justify-content:space-between; padding:4px 20px 16px; font-family:var(--mono); font-size:9px; color:var(--ink-4); }

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

/* PAGINATION */
.pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 18px; background:var(--paper-3); border-top:1px solid var(--border); flex-wrap:wrap; gap:10px; }
.pg-info { font-family:var(--mono); font-size:11px; color:var(--ink-3); }
.pg-info b { color:var(--ink-1); font-weight:600; }
.pg-controls { display:flex; gap:4px; }
.pg-btn { min-width:30px; height:28px; padding:0 8px; border:1px solid var(--border); background:var(--paper-2); border-radius:7px; font-family:var(--mono); font-size:11px; color:var(--ink-2); transition:all .1s; }
.pg-btn:hover:not(:disabled) { background:var(--forest-faint); border-color:var(--forest-mid); color:var(--forest-deep); }
.pg-btn.active { background:var(--forest-deep); border-color:var(--forest-deep); color:#fff; }
.pg-btn:disabled { opacity:0.35; cursor:not-allowed; }
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
const facilityName = (code) => { const f = FACILITIES.find(x => x.code === code); return f ? f.name : code; };
const facilityShort = (code) => { const f = FACILITIES.find(x => x.code === code); return f ? f.name.split(' ')[0] : code; };
const downloadFile = (filename, content, mimeType = 'text/plain') => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Distance between two facility codes (km, haversine)
const distanceKm = (codeA, codeB) => {
  const a = FACILITIES.find(x => x.code === codeA);
  const b = FACILITIES.find(x => x.code === codeB);
  if (!a || !b) return null;
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2)**2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
};

// Capacity status — same logic as portal for consistency
const deriveCapacityStatus = (used, total, isConsumable) => {
  if (total === 0) return 'offline';
  const ratio = used / total;
  if (ratio >= 1.0) return 'full';
  if (isConsumable && ratio >= 0.7) return 'low';
  if (ratio >= 0.85) return 'constrained';
  return 'open';
};

// Facility overall status — worst of its critical units
const deriveFacilityStatus = (capByUnit) => {
  const statuses = Object.values(capByUnit || {}).map(c => deriveCapacityStatus(c.used, c.total, c.consumable));
  if (statuses.includes('full')) return 'full';
  if (statuses.includes('constrained')) return 'constrained';
  if (statuses.length === 0) return 'offline';
  return 'open';
};

/* ════════════════════════════════════════════════════════════════════
   SEED DATA — NATIONAL SCOPE
   Replace with API calls in production. Carefully crafted to look
   like a real busy national emergency response operation.
════════════════════════════════════════════════════════════════════ */

// Capacity by facility, by unit. Modelled across all 24 demo facilities.
// Pattern: tertiary facilities have full unit set; regional & district have subsets.
const seedCapacityByFacility = () => {
  const baseUnits = ['icu', 'hdu', 'ed_resus', 'theatre', 'ct', 'mri', 'picu', 'nicu', 'blood_oneg', 'dialysis'];
  const config = {};
  FACILITIES.forEach(f => {
    const unitSet = {};
    if (f.tier === 'Tertiary') {
      unitSet.icu        = { unit: 'ICU Beds',        used: f.code === 'GH-ACC-001' ? 12 : 8 + Math.floor(Math.random()*4), total: f.code === 'GH-ACC-001' ? 12 : 12, consumable: false };
      unitSet.hdu        = { unit: 'HDU Beds',        used: 8 + Math.floor(Math.random()*5), total: 14, consumable: false };
      unitSet.ed_resus   = { unit: 'ED Resus Bays',   used: 4 + Math.floor(Math.random()*4), total: 8,  consumable: false };
      unitSet.theatre    = { unit: 'Emergency Theatre', used: Math.floor(Math.random()*2),    total: 2,  consumable: false };
      unitSet.ct         = { unit: 'CT Scanner',      used: Math.floor(Math.random()*2),    total: 2,  consumable: false };
      unitSet.mri        = { unit: 'MRI',             used: Math.floor(Math.random()*1)+1,  total: 2,  consumable: false };
      unitSet.picu       = { unit: 'PICU',            used: 3 + Math.floor(Math.random()*3), total: 6,  consumable: false };
      unitSet.nicu       = { unit: 'NICU',            used: 14 + Math.floor(Math.random()*7), total: 20, consumable: false };
      unitSet.blood_oneg = { unit: 'Blood Bank O−',   used: 4 + Math.floor(Math.random()*5), total: 10, consumable: true };
      unitSet.dialysis   = { unit: 'Dialysis Slots',  used: 6 + Math.floor(Math.random()*4), total: 10, consumable: false };
    } else if (f.tier === 'Regional') {
      unitSet.icu        = { unit: 'ICU Beds',        used: 4 + Math.floor(Math.random()*3), total: 6,  consumable: false };
      unitSet.hdu        = { unit: 'HDU Beds',        used: 5 + Math.floor(Math.random()*3), total: 8,  consumable: false };
      unitSet.ed_resus   = { unit: 'ED Resus Bays',   used: 2 + Math.floor(Math.random()*3), total: 5,  consumable: false };
      unitSet.theatre    = { unit: 'Emergency Theatre', used: Math.floor(Math.random()*2),  total: 1,  consumable: false };
      unitSet.ct         = { unit: 'CT Scanner',      used: Math.floor(Math.random()*2),    total: 1,  consumable: false };
      unitSet.blood_oneg = { unit: 'Blood Bank O−',   used: 2 + Math.floor(Math.random()*4), total: 6,  consumable: true };
    } else { // District
      unitSet.ed_resus   = { unit: 'ED Resus Bays',   used: 1 + Math.floor(Math.random()*2), total: 3,  consumable: false };
      unitSet.hdu        = { unit: 'HDU Beds',        used: 2 + Math.floor(Math.random()*2), total: 4,  consumable: false };
      unitSet.blood_oneg = { unit: 'Blood Bank O−',   used: Math.floor(Math.random()*3),     total: 3,  consumable: true };
    }
    config[f.code] = unitSet;
  });
  return config;
};

// 18 active referrals modelling national stream — varied facilities, priorities, services
const seedNationalReferrals = () => ([
  {
    id: 'REF-2026-2041', priority: 'critical', status: 'awaiting_decision',
    patientInitials: 'KA', patientAge: 59, patientSex: 'M', patientCategory: 'Adult',
    primaryCondition: 'medical', subCondition: 'Acute coronary syndrome',
    services: ['Cardiology', 'Anaesthesia / ICU'], reasons: ['Specialist review', 'ICU/HDU bed needed'],
    sourceFacility: 'GH-ACC-014', destFacility: 'GH-ACC-001', stability: 'Critical',
    receivedAt: minutesAgo(2), slaDeadline: minutesFromNow(1),
    vitals: { sbp: 222, dbp: 174, hr: 135, rr: 36, spo2: 89, gcs: 14 },
    summary: 'ECG: ST elevation V2-V4. Troponin pending. Started GTN, dual antiplatelet.',
  },
  {
    id: 'REF-2026-2042', priority: 'high', status: 'accepted',
    patientInitials: 'AB', patientAge: 29, patientSex: 'F', patientCategory: 'Obstetric',
    primaryCondition: 'obstetric', subCondition: 'Severe preeclampsia',
    services: ['Obstetrics & Gynaecology'], reasons: ['Specialist review', 'Theatre unavailable at referring facility'],
    sourceFacility: 'GH-ACC-019', destFacility: 'GH-ACC-001', stability: 'Unstable',
    receivedAt: minutesAgo(8), slaDeadline: minutesFromNow(0),
    vitals: { sbp: 169, dbp: 112, hr: 108, rr: 20, spo2: 97, gcs: 15 },
    summary: 'Magnesium sulphate loading dose given. Theatre informed.',
  },
  {
    id: 'REF-2026-2043', priority: 'critical', status: 'redirect_pending',
    patientInitials: 'KO', patientAge: 34, patientSex: 'M', patientCategory: 'Adult',
    primaryCondition: 'trauma', subCondition: 'Head injury',
    services: ['Neurosurgery', 'CT Scan'], reasons: ['Imaging unavailable', 'Surgery needed'],
    sourceFacility: 'GH-ACC-001', destFacility: 'GH-ACC-002', stability: 'Critical',
    receivedAt: minutesAgo(4), slaDeadline: minutesFromNow(2),
    vitals: { sbp: 95, dbp: 60, hr: 122, rr: 26, spo2: 94, gcs: 9 },
    summary: 'KBTH ED CT unavailable 45 min. Redirect to 37 Military requested.',
  },
  {
    id: 'REF-2026-2044', priority: 'high', status: 'awaiting_decision',
    patientInitials: 'MS', patientAge: 7, patientSex: 'M', patientCategory: 'Paediatric',
    primaryCondition: 'paediatric', subCondition: 'Severe pneumonia / respiratory distress',
    services: ['Paediatrics'], reasons: ['ICU/HDU bed needed', 'Higher level care'],
    sourceFacility: 'GH-ACC-022', destFacility: 'GH-ACC-001', stability: 'Unstable',
    receivedAt: minutesAgo(5), slaDeadline: minutesFromNow(0),
    vitals: { sbp: 100, dbp: 65, hr: 145, rr: 38, spo2: 87, gcs: 14 },
    summary: 'Three nebs, minimal improvement. IV magnesium started. PICU bed needed.',
  },
  {
    id: 'REF-2026-2045', priority: 'routine', status: 'accepted',
    patientInitials: 'EN', patientAge: 48, patientSex: 'F', patientCategory: 'Adult',
    primaryCondition: 'medical', subCondition: 'Renal failure',
    services: ['Internal Medicine', 'Dialysis'], reasons: ['Specialist review', 'Dialysis needed'],
    sourceFacility: 'GH-ACC-007', destFacility: 'GH-ACC-001', stability: 'Stable',
    receivedAt: minutesAgo(35), slaDeadline: minutesFromNow(10),
    vitals: { sbp: 142, dbp: 88, hr: 78, rr: 16, spo2: 98, gcs: 15 },
    summary: 'Stable. Routine specialist review for AV fistula planning.',
  },
  {
    id: 'REF-2026-2047', priority: 'critical', status: 'awaiting_decision',
    patientInitials: 'JK', patientAge: 41, patientSex: 'M', patientCategory: 'Adult',
    primaryCondition: 'trauma', subCondition: 'Abdominal trauma',
    services: ['General Surgery', 'Blood bank'], reasons: ['Surgery needed', 'Blood unavailable'],
    sourceFacility: 'GH-ACC-031', destFacility: 'GH-ACC-001', stability: 'Critical',
    receivedAt: minutesAgo(1), slaDeadline: minutesFromNow(2),
    vitals: { sbp: 82, dbp: 48, hr: 138, rr: 30, spo2: 91, gcs: 13 },
    summary: 'Two large bore IVs sited. 1L crystalloid given. O-negative blood requested.',
  },
  {
    id: 'REF-2026-2048', priority: 'critical', status: 'enroute',
    patientInitials: 'AS', patientAge: 0, patientSex: 'M', patientCategory: 'Neonate',
    primaryCondition: 'neonatal', subCondition: 'Birth asphyxia / HIE',
    services: ['Neonatology'], reasons: ['NICU bed needed', 'Higher level care'],
    sourceFacility: 'GH-ACC-034', destFacility: 'GH-ACC-001', stability: 'Critical',
    receivedAt: minutesAgo(15), slaDeadline: minutesFromNow(-3),
    vitals: { sbp: 65, dbp: 40, hr: 95, rr: 32, spo2: 89, gcs: 14 },
    summary: 'Term neonate, APGAR 3 at 1min, 5 at 5min. Cooling protocol started.',
  },
  {
    id: 'REF-2026-2049', priority: 'high', status: 'awaiting_decision',
    patientInitials: 'RM', patientAge: 67, patientSex: 'F', patientCategory: 'Adult',
    primaryCondition: 'medical', subCondition: 'Stroke',
    services: ['Internal Medicine', 'CT Scan'], reasons: ['Imaging unavailable', 'Specialist review'],
    sourceFacility: 'GH-ASH-001', destFacility: 'GH-ASH-001', stability: 'Unstable',
    receivedAt: minutesAgo(12), slaDeadline: minutesFromNow(3),
    vitals: { sbp: 178, dbp: 102, hr: 88, rr: 18, spo2: 95, gcs: 12 },
    summary: 'Right facial droop, dysphasia. Within thrombolysis window. CT booked.',
  },
  {
    id: 'REF-2026-2050', priority: 'critical', status: 'awaiting_decision',
    patientInitials: 'PT', patientAge: 38, patientSex: 'F', patientCategory: 'Obstetric',
    primaryCondition: 'obstetric', subCondition: 'PPH (postpartum haemorrhage)',
    services: ['Obstetrics & Gynaecology', 'Blood bank'], reasons: ['Blood unavailable', 'Surgery needed'],
    sourceFacility: 'GH-CEN-019', destFacility: 'GH-CEN-001', stability: 'Critical',
    receivedAt: minutesAgo(3), slaDeadline: minutesFromNow(1),
    vitals: { sbp: 78, dbp: 45, hr: 142, rr: 28, spo2: 93, gcs: 14 },
    summary: 'Post-SVD 2h ago. Estimated 1.5L blood loss. Bimanual compression in progress.',
  },
  {
    id: 'REF-2026-2051', priority: 'high', status: 'enroute',
    patientInitials: 'KB', patientAge: 52, patientSex: 'M', patientCategory: 'Adult',
    primaryCondition: 'surgical', subCondition: 'Acute abdomen',
    services: ['General Surgery'], reasons: ['Surgery needed'],
    sourceFacility: 'GH-WES-022', destFacility: 'GH-WES-001', stability: 'Potentially unstable',
    receivedAt: minutesAgo(28), slaDeadline: minutesFromNow(0),
    vitals: { sbp: 110, dbp: 70, hr: 102, rr: 22, spo2: 96, gcs: 15 },
    summary: 'Severe RIF tenderness, guarding. Suspected perforated appendix.',
  },
  {
    id: 'REF-2026-2052', priority: 'high', status: 'awaiting_decision',
    patientInitials: 'YA', patientAge: 4, patientSex: 'F', patientCategory: 'Paediatric',
    primaryCondition: 'paediatric', subCondition: 'Severe malaria',
    services: ['Paediatrics'], reasons: ['Higher level care', 'Specialist review'],
    sourceFacility: 'GH-VOL-014', destFacility: 'GH-VOL-001', stability: 'Unstable',
    receivedAt: minutesAgo(7), slaDeadline: minutesFromNow(1),
    vitals: { sbp: 88, dbp: 55, hr: 156, rr: 42, spo2: 92, gcs: 13 },
    summary: 'Cerebral malaria suspected. Artesunate started. Convulsions controlled.',
  },
  {
    id: 'REF-2026-2053', priority: 'routine', status: 'accepted',
    patientInitials: 'CO', patientAge: 24, patientSex: 'M', patientCategory: 'Adult',
    primaryCondition: 'trauma', subCondition: 'Fracture',
    services: ['Orthopaedics'], reasons: ['Specialist review'],
    sourceFacility: 'GH-EAS-001', destFacility: 'GH-ACC-001', stability: 'Stable',
    receivedAt: minutesAgo(48), slaDeadline: minutesFromNow(20),
    vitals: { sbp: 128, dbp: 76, hr: 82, rr: 16, spo2: 99, gcs: 15 },
    summary: 'Closed left tibia fracture. Splinted. For ORIF planning.',
  },
  {
    id: 'REF-2026-2054', priority: 'critical', status: 'awaiting_decision',
    patientInitials: 'MN', patientAge: 71, patientSex: 'M', patientCategory: 'Adult',
    primaryCondition: 'medical', subCondition: 'Heart failure',
    services: ['Cardiology', 'Anaesthesia / ICU'], reasons: ['ICU/HDU bed needed', 'Specialist review'],
    sourceFacility: 'GH-ACC-038', destFacility: 'GH-ACC-001', stability: 'Critical',
    receivedAt: minutesAgo(6), slaDeadline: minutesFromNow(0),
    vitals: { sbp: 88, dbp: 58, hr: 128, rr: 32, spo2: 84, gcs: 13 },
    summary: 'Acute decompensated HF. On NIV. ETT may be required.',
  },
  {
    id: 'REF-2026-2055', priority: 'high', status: 'awaiting_decision',
    patientInitials: 'OP', patientAge: 14, patientSex: 'F', patientCategory: 'Paediatric',
    primaryCondition: 'medical', subCondition: 'Severe anaemia',
    services: ['Paediatrics', 'Blood bank'], reasons: ['Blood unavailable', 'Higher level care'],
    sourceFacility: 'GH-NOR-001', destFacility: 'GH-NOR-001', stability: 'Potentially unstable',
    receivedAt: minutesAgo(20), slaDeadline: minutesFromNow(2),
    vitals: { sbp: 102, dbp: 60, hr: 124, rr: 24, spo2: 95, gcs: 15 },
    summary: 'Sickle cell crisis. Hb 4.2 g/dL. Cross-match in progress.',
  },
  {
    id: 'REF-2026-2056', priority: 'routine', status: 'accepted',
    patientInitials: 'IT', patientAge: 33, patientSex: 'F', patientCategory: 'Adult',
    primaryCondition: 'medical', subCondition: 'DKA',
    services: ['Internal Medicine'], reasons: ['Specialist review', 'ICU/HDU bed needed'],
    sourceFacility: 'GH-ACC-042', destFacility: 'GH-ACC-001', stability: 'Stable',
    receivedAt: minutesAgo(55), slaDeadline: minutesFromNow(25),
    vitals: { sbp: 124, dbp: 76, hr: 96, rr: 20, spo2: 98, gcs: 15 },
    summary: 'New diagnosis T1DM. RBS 28 mmol/L. Insulin infusion started.',
  },
  {
    id: 'REF-2026-2057', priority: 'critical', status: 'enroute',
    patientInitials: 'BG', patientAge: 23, patientSex: 'M', patientCategory: 'Adult',
    primaryCondition: 'trauma', subCondition: 'Polytrauma',
    services: ['Trauma care', 'Neurosurgery', 'General Surgery'], reasons: ['Surgery needed', 'Higher level care'],
    sourceFacility: 'GH-ACC-002', destFacility: 'GH-ACC-002', stability: 'Critical',
    receivedAt: minutesAgo(32), slaDeadline: minutesFromNow(-5),
    vitals: { sbp: 90, dbp: 55, hr: 130, rr: 24, spo2: 92, gcs: 10 },
    summary: 'RTA on N1. Multiple injuries. Theatre booked. Blood ready.',
  },
  {
    id: 'REF-2026-2058', priority: 'high', status: 'awaiting_decision',
    patientInitials: 'DK', patientAge: 56, patientSex: 'M', patientCategory: 'Adult',
    primaryCondition: 'surgical', subCondition: 'Urological emergency (retention, torsion etc.)',
    services: ['Urology'], reasons: ['Specialist review', 'Surgery needed'],
    sourceFacility: 'GH-BAR-001', destFacility: 'GH-ASH-001', stability: 'Stable',
    receivedAt: minutesAgo(18), slaDeadline: minutesFromNow(7),
    vitals: { sbp: 138, dbp: 82, hr: 88, rr: 18, spo2: 97, gcs: 15 },
    summary: 'Acute urinary retention. Catheterisation failed. For SPC consideration.',
  },
  {
    id: 'REF-2026-2059', priority: 'routine', status: 'accepted',
    patientInitials: 'WN', patientAge: 0, patientSex: 'F', patientCategory: 'Neonate',
    primaryCondition: 'neonatal', subCondition: 'Severe jaundice (possible exchange transfusion)',
    services: ['Neonatology'], reasons: ['Specialist review', 'Higher level care'],
    sourceFacility: 'GH-WES-001', destFacility: 'GH-WES-001', stability: 'Stable',
    receivedAt: minutesAgo(72), slaDeadline: minutesFromNow(45),
    vitals: { sbp: 75, dbp: 45, hr: 145, rr: 48, spo2: 98, gcs: 15 },
    summary: 'D4 of life. SBR 380. Phototherapy started. Exchange transfusion may be needed.',
  },
]);

const seedDispatches = () => ([
  { id: 'AMB-2026-0312', vehicle: 'AMB-GR-014', state: 'enroute', referral: 'REF-2026-2042', from: 'GH-ACC-019', to: 'GH-ACC-001', dispatchedAt: minutesAgo(8), eta: 12, crew: 'Paramedic + EMT', priority: 'high' },
  { id: 'AMB-2026-0313', vehicle: 'AMB-GR-007', state: 'arrived',  referral: 'REF-2026-2048', from: 'GH-ACC-034', to: 'GH-ACC-001', dispatchedAt: minutesAgo(20), eta: 0, crew: 'Paramedic + EMT', priority: 'critical' },
  { id: 'AMB-2026-0314', vehicle: 'AMB-GR-022', state: 'dispatched', referral: 'REF-2026-2047', from: 'GH-ACC-031', to: 'GH-ACC-001', dispatchedAt: minutesAgo(1), eta: 9, crew: 'Paramedic + EMT', priority: 'critical' },
  { id: 'AMB-2026-0315', vehicle: 'AMB-WE-002', state: 'enroute', referral: 'REF-2026-2051', from: 'GH-WES-022', to: 'GH-WES-001', dispatchedAt: minutesAgo(28), eta: 6, crew: 'EMT', priority: 'high' },
  { id: 'AMB-2026-0316', vehicle: 'AMB-AS-008', state: 'cleared', referral: 'REF-2026-2057', from: 'GH-ACC-002', to: 'GH-ACC-002', dispatchedAt: minutesAgo(45), eta: 0, crew: 'Paramedic + EMT', priority: 'critical' },
  { id: 'AMB-2026-0317', vehicle: 'AMB-CE-003', state: 'dispatched', referral: 'REF-2026-2050', from: 'GH-CEN-019', to: 'GH-CEN-001', dispatchedAt: minutesAgo(2), eta: 18, crew: 'Paramedic + EMT', priority: 'critical' },
]);

const seedEscalations = () => ([
  { id: 'ESC-2026-0091', type: 'icu_full',     facility: 'GH-ACC-001', raisedAt: minutesAgo(6),  detail: 'ICU at 12/12. 2 critical referrals inbound. Cardiology + neuro requested.', status: 'open' },
  { id: 'ESC-2026-0092', type: 'blood_critical', facility: 'GH-ACC-031', raisedAt: minutesAgo(3), detail: 'O-negative stock down to 3 units. Active trauma case using 2.', status: 'open' },
  { id: 'ESC-2026-0093', type: 'ct_offline',    facility: 'GH-ACC-001', raisedAt: minutesAgo(40), detail: 'ED CT scanner servicing. Estimated 45 min downtime.', status: 'in_progress' },
  { id: 'ESC-2026-0094', type: 'no_specialist', facility: 'GH-ACC-039', raisedAt: minutesAgo(15), detail: 'On-call neurosurgeon at 37 unavailable. Seeking alternative.', status: 'open' },
  { id: 'ESC-2026-0095', type: 'multi_critical', facility: 'GH-ACC-001', raisedAt: minutesAgo(1), detail: '4 critical cases simultaneously inbound. Theatre backup needed.', status: 'open' },
]);

// Synthetic RQI data — facility, time-to-decision (min), SLA compliance (%)
const seedRQI = () => {
  const data = [];
  FACILITIES.forEach(f => {
    // Tertiary tend to be fast + compliant; districts more variable
    const tertiary = f.tier === 'Tertiary';
    const ttd = tertiary ? 2.5 + Math.random() * 2 : f.tier === 'Regional' ? 3.5 + Math.random() * 3.5 : 4.5 + Math.random() * 5.5;
    const sla = tertiary ? 88 + Math.random() * 11 : f.tier === 'Regional' ? 78 + Math.random() * 17 : 65 + Math.random() * 25;
    data.push({ code: f.code, name: f.name, region: f.region, tier: f.tier, ttd: parseFloat(ttd.toFixed(1)), sla: Math.round(sla) });
  });
  return data;
};

// Audit replication — events from across the network
const seedAudit = () => ([
  { time: minutesAgo(0),  facility: 'GH-ACC-001', actor: 'Dr. Ama Owusu',     role: 'Doctor',  action: 'Accepted referral · receiving bay 2 assigned',           ref: 'REF-2026-2042' },
  { time: minutesAgo(1),  facility: 'GH-ACC-031', actor: 'Dr. Selasi Adzaho', role: 'Doctor',  action: 'Outgoing referral created · destination GH-ACC-001',    ref: 'REF-2026-2047' },
  { time: minutesAgo(2),  facility: 'GH-ACC-014', actor: 'Dr. Yaw Boateng',   role: 'Doctor',  action: 'Outgoing referral created · destination GH-ACC-001',    ref: 'REF-2026-2041' },
  { time: minutesAgo(3),  facility: 'GH-CEN-019', actor: 'Dr. Akua Bonsu',    role: 'Doctor',  action: 'Outgoing referral created · destination GH-CEN-001',    ref: 'REF-2026-2050' },
  { time: minutesAgo(4),  facility: 'GH-ACC-001', actor: 'Dr. Kwame Asante',  role: 'Doctor',  action: 'Redirect requested · CT scanner offline',                 ref: 'REF-2026-2043' },
  { time: minutesAgo(5),  facility: 'GH-ACC-022', actor: 'Dr. Akua Sarpong',  role: 'Doctor',  action: 'Outgoing referral created · destination GH-ACC-001',    ref: 'REF-2026-2044' },
  { time: minutesAgo(6),  facility: 'GH-ACC-001', actor: 'NCRIS Switch',      role: 'System',  action: 'Capacity update replicated to NECC',                      ref: null },
  { time: minutesAgo(6),  facility: 'GH-ACC-038', actor: 'Dr. Mawuli Edzii',  role: 'Doctor',  action: 'Outgoing referral created · destination GH-ACC-001',    ref: 'REF-2026-2054' },
  { time: minutesAgo(7),  facility: 'GH-VOL-014', actor: 'Dr. Edem Tay',      role: 'Doctor',  action: 'Outgoing referral created · destination GH-VOL-001',    ref: 'REF-2026-2052' },
  { time: minutesAgo(8),  facility: 'GH-ACC-019', actor: 'Dr. Esi Mensah',    role: 'Doctor',  action: 'Outgoing referral created · destination GH-ACC-001',    ref: 'REF-2026-2042' },
  { time: minutesAgo(10), facility: 'GH-ACC-001', actor: 'Mr. Daniel Tetteh', role: 'Admin',   action: 'Capacity edited · ICU 11→12',                              ref: null },
  { time: minutesAgo(12), facility: 'GH-ASH-001', actor: 'Dr. Kojo Pieterson',role: 'Doctor',  action: 'Outgoing referral created · destination GH-ASH-001',    ref: 'REF-2026-2049' },
  { time: minutesAgo(14), facility: 'GH-ACC-002', actor: 'Dr. Pearl Quaye',   role: 'Doctor',  action: 'Polytrauma — internal triage initiated',                  ref: 'REF-2026-2057' },
  { time: minutesAgo(15), facility: 'NECC',       actor: 'Mrs. Adwoa Boateng',role: 'Operator',action: 'Escalation raised: no neurosurgeon at GH-ACC-039',         ref: 'ESC-2026-0094' },
  { time: minutesAgo(15), facility: 'GH-ACC-034', actor: 'Dr. Gifty Pinaman', role: 'Doctor',  action: 'Outgoing referral created · destination GH-ACC-001',    ref: 'REF-2026-2048' },
  { time: minutesAgo(18), facility: 'GH-BAR-001', actor: 'Dr. Maxwell Yeboah',role: 'Doctor',  action: 'Outgoing referral created · destination GH-ASH-001',    ref: 'REF-2026-2058' },
  { time: minutesAgo(20), facility: 'GH-NOR-001', actor: 'Dr. Patience Mahama',role: 'Doctor', action: 'Internal referral · paediatric blood',                    ref: 'REF-2026-2055' },
  { time: minutesAgo(28), facility: 'GH-WES-022', actor: 'Dr. Joseph Awoyemi',role: 'Doctor',  action: 'Outgoing referral created · destination GH-WES-001',    ref: 'REF-2026-2051' },
  { time: minutesAgo(35), facility: 'GH-ACC-007', actor: 'Dr. Nii Ansah',     role: 'Doctor',  action: 'Outgoing referral created · destination GH-ACC-001',    ref: 'REF-2026-2045' },
  { time: minutesAgo(40), facility: 'NECC',       actor: 'System',            role: 'System',  action: 'Escalation raised: CT offline at GH-ACC-001',              ref: 'ESC-2026-0093' },
  { time: minutesAgo(45), facility: 'GH-ACC-002', actor: 'ARCS Dispatch',     role: 'System',  action: 'Ambulance AMB-AS-008 cleared receiving bay',              ref: 'AMB-2026-0316' },
  { time: minutesAgo(48), facility: 'GH-EAS-001', actor: 'Dr. Comfort Asare', role: 'Doctor',  action: 'Outgoing referral created · destination GH-ACC-001',    ref: 'REF-2026-2053' },
]);

/* Font loader */
const loadFonts = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById('necc-fonts')) return;
  const link = document.createElement('link');
  link.id = 'necc-fonts'; link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap';
  document.head.appendChild(link);
};

/* ════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════════════ */

export default function NeccCommandCentre() {
  // Auth
  const [authed, setAuthed] = useState(false);
  const [roleKey, setRoleKey] = useState('operator');
  const user = roleKey ? ROLES[roleKey] : null;

  // App state
  const [view, setView] = useState('overview');
  const [referrals, setReferrals] = useState(seedNationalReferrals);
  const [capacityByFacility, setCapacityByFacility] = useState(seedCapacityByFacility);
  const [dispatches, setDispatches] = useState(seedDispatches);
  const [escalations, setEscalations] = useState(seedEscalations);
  const [rqiData, setRqiData] = useState(seedRQI);
  const [audit, setAudit] = useState(seedAudit);
  const [sessionStart, setSessionStart] = useState(null);

  // UI state
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refPage, setRefPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [openRef, setOpenRef] = useState(null);
  const [openEsc, setOpenEsc] = useState(null);
  const [modal, setModal] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [, forceTick] = useState(0);
  const [clock, setClock] = useState(new Date());

  // Bed-search state
  const [bsServices, setBsServices] = useState([]);
  const [bsRegion, setBsRegion] = useState('any');
  const [bsTier, setBsTier] = useState('any');
  const [bsResults, setBsResults] = useState([]);
  const [bsSearched, setBsSearched] = useState(false);

  // Fonts + styles on mount
  useEffect(() => { loadFonts(); }, []);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('necc-styles')) return;
    const tag = document.createElement('style');
    tag.id = 'necc-styles';
    tag.textContent = STYLES;
    document.head.appendChild(tag);
  }, []);

  // Toasts
  const toast = useCallback((text, type = 'success', title = null) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, text, type, title }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  // Audit
  const logAudit = useCallback((action, ref = null) => {
    if (!user) return;
    setAudit(a => [{ time: new Date(), facility: 'NECC', actor: user.name, role: user.label, action, ref }, ...a]);
  }, [user]);

  // Login / logout
  const doLogin = () => {
    const profile = ROLES[roleKey];
    setAuthed(true);
    setView(profile.defaultView);
    setSessionStart(new Date());
    setAudit(a => [{ time: new Date(), facility: 'NECC', actor: profile.name, role: profile.label, action: 'NECC session opened', ref: null }, ...a]);
    setTimeout(() => toast('Welcome, ' + profile.name.split(' ').slice(-1)[0] + '. National picture loaded.', 'success', 'Signed in'), 100);
  };

  const doLogout = () => {
    logAudit('NECC session closed');
    toast('Signed out securely', 'info');
    setTimeout(() => {
      setAuthed(false); setUserDropdownOpen(false); setView('overview');
      setReferrals(seedNationalReferrals()); setCapacityByFacility(seedCapacityByFacility());
      setDispatches(seedDispatches()); setEscalations(seedEscalations());
      setRqiData(seedRQI()); setAudit(seedAudit()); setSessionStart(null);
      setModal(null); setOpenRef(null); setOpenEsc(null);
    }, 700);
  };

  // Clock + SLA tick
  useEffect(() => {
    const t = setInterval(() => { setClock(new Date()); forceTick(x => x + 1); }, 1000);
    return () => clearInterval(t);
  }, []);

  // Live referral simulator — incoming flows from random facilities
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => {
      if (Math.random() < 0.35) simulateIncomingReferral();
    }, 65000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [authed]);

  const simulateIncomingReferral = () => {
    const samples = [
      { primary: 'medical', sub: 'Stroke', svc: ['Internal Medicine'], cat: 'Adult', stab: 'Critical' },
      { primary: 'obstetric', sub: 'PPH (postpartum haemorrhage)', svc: ['Obstetrics & Gynaecology', 'Blood bank'], cat: 'Obstetric', stab: 'Critical' },
      { primary: 'paediatric', sub: 'Severe pneumonia / respiratory distress', svc: ['Paediatrics'], cat: 'Paediatric', stab: 'Unstable' },
      { primary: 'trauma', sub: 'Polytrauma', svc: ['Trauma care', 'General Surgery'], cat: 'Adult', stab: 'Critical' },
      { primary: 'medical', sub: 'Sepsis', svc: ['Internal Medicine'], cat: 'Adult', stab: 'Unstable' },
    ];
    const pick = samples[Math.floor(Math.random() * samples.length)];
    const sources = FACILITIES.filter(f => f.tier === 'District');
    const src = sources[Math.floor(Math.random() * sources.length)];
    const possibleDests = FACILITIES.filter(f => f.region === src.region && (f.tier === 'Tertiary' || f.tier === 'Regional'));
    const dst = possibleDests[Math.floor(Math.random() * possibleDests.length)] || FACILITIES[0];
    const isCritical = pick.stab === 'Critical';
    const age = pick.cat === 'Paediatric' ? 2 + Math.floor(Math.random()*10)
              : pick.cat === 'Neonate'    ? 0
              : 18 + Math.floor(Math.random() * 60);

    setReferrals(prev => {
      const newRef = {
        id: 'REF-2026-' + (2060 + prev.length),
        priority: isCritical ? 'critical' : (pick.stab === 'Stable' ? 'routine' : 'high'),
        status: 'awaiting_decision',
        patientInitials: String.fromCharCode(65 + Math.floor(Math.random()*26)) + String.fromCharCode(65 + Math.floor(Math.random()*26)),
        patientAge: age, patientSex: Math.random() > 0.5 ? 'M' : 'F', patientCategory: pick.cat,
        primaryCondition: pick.primary, subCondition: pick.sub,
        services: pick.svc, reasons: ['Higher level care', 'Specialist review'], stability: pick.stab,
        sourceFacility: src.code, destFacility: dst.code,
        receivedAt: new Date(), slaDeadline: minutesFromNow(isCritical ? 3 : 5),
        vitals: {
          sbp:  isCritical ? 80 + Math.floor(Math.random()*30)  : 110 + Math.floor(Math.random()*40),
          dbp:  isCritical ? 50 + Math.floor(Math.random()*20)  : 70  + Math.floor(Math.random()*20),
          hr:   isCritical ? 120 + Math.floor(Math.random()*30) : 75  + Math.floor(Math.random()*30),
          rr:   isCritical ? 26 + Math.floor(Math.random()*14)  : 14  + Math.floor(Math.random()*8),
          spo2: isCritical ? 86 + Math.floor(Math.random()*8)   : 95  + Math.floor(Math.random()*4),
          gcs:  isCritical ? 8 + Math.floor(Math.random()*6)    : 14 + Math.floor(Math.random()*2),
        },
        summary: 'Inbound referral from ' + src.name + ' to ' + dst.name + '.',
      };
      return [newRef, ...prev];
    });
    setAudit(a => [{ time: new Date(), facility: src.code, actor: 'NCRIS Switch', role: 'System', action: 'Referral routed via NCRIS', ref: null }, ...a]);
    toast(pick.sub + ' from ' + facilityShort(src.code) + ' → ' + facilityShort(dst.code), isCritical ? 'error' : 'warn', 'New referral');
  };

  // ─────────────────────────────────────────────────────────
  // BUTTON HANDLERS — every NECC action wired through one of these
  // ─────────────────────────────────────────────────────────
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

  // Bed-search execution
  const handleBedSearch = () => {
    if (bsServices.length === 0) {
      toast('Select at least one service', 'warn', 'Bed-search');
      return;
    }
    const results = FACILITIES
      .filter(f => bsRegion === 'any' || f.region === bsRegion)
      .filter(f => bsTier === 'any' || f.tier === bsTier)
      .map(f => {
        const cap = capacityByFacility[f.code] || {};
        const status = deriveFacilityStatus(cap);
        const rqi = rqiData.find(r => r.code === f.code);
        // Score: capacity availability * service match * SLA compliance
        const availUnits = Object.values(cap).filter(c => deriveCapacityStatus(c.used, c.total, c.consumable) === 'open').length;
        const totalUnits = Object.keys(cap).length || 1;
        const availRatio = availUnits / totalUnits;
        const slaScore = rqi ? rqi.sla / 100 : 0.7;
        const score = Math.round((availRatio * 0.6 + slaScore * 0.4) * 100);
        return { facility: f, status, capacity: cap, rqi, score, availUnits, totalUnits };
      })
      .filter(r => r.status !== 'full' && r.status !== 'offline')
      .sort((a, b) => b.score - a.score);
    setBsResults(results);
    setBsSearched(true);
    toast('Found ' + results.length + ' candidate facilities', 'success', 'Bed-search');
    logAudit('Bed-search · services=' + bsServices.join('+') + ' · region=' + bsRegion);
  };

  const handleBedSearchRoute = (facCode) => {
    const f = FACILITIES.find(x => x.code === facCode);
    toast('Routing intent sent to ' + f.name + ' via NCRIS', 'success', 'Routed');
    logAudit('Bed-search route initiated to ' + facCode);
    setAudit(a => [{ time: new Date(), facility: facCode, actor: user.name, role: user.label, action: 'Bed-search routing intent received from NECC', ref: null }, ...a]);
  };

  // Escalation actions
  const handleEscalationAction = (escId, action, note = '') => {
    setEscalations(prev => prev.map(e => {
      if (e.id !== escId) return e;
      if (action === 'broker')   { logAudit('Brokered escalation ' + escId, escId); toast('Broker activity logged · ' + escId, 'success', 'Brokered'); return { ...e, status: 'in_progress' }; }
      if (action === 'resolve')  { logAudit('Resolved escalation ' + escId, escId); toast('Escalation resolved · ' + escId, 'success'); return { ...e, status: 'resolved' }; }
      if (action === 'escalate') { logAudit('Escalated to MoH ' + escId, escId); toast('Forwarded to Ministry · ' + escId, 'warn', 'Escalated'); return { ...e, status: 'moh_escalated' }; }
      return e;
    }));
    setOpenEsc(null);
  };

  const toggleService = (s) => setBsServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  // Continued in next part — login render + topbar + sidebar + view router
  /* ──────────────────────────────────────────────────────────────────
     RENDER: LOGIN
  ────────────────────────────────────────────────────────────────── */
  if (!authed) {
    return (
      <div className="necc">
        <div className="login-screen">
          <div className="login-card">
            <div className="login-left">
              <div className="login-brand">
                <div className="login-mark">G</div>
                <div className="login-brand-text">
                  <div className="name">NECC</div>
                  <div className="sub">Command Centre</div>
                </div>
              </div>
              <div>
                <div className="login-eyebrow">National Emergency Command Centre · GhERIG</div>
                <h1 className="login-headline">One picture. <em>One country.</em> One response.</h1>
                <p className="login-tagline">National hub for the Ghana Emergency Referral &amp; Intelligence Grid. Live coordination across all facilities.</p>
              </div>
              <div className="login-meta">
                <div className="login-meta-item">FACILITIES · <b>{FACILITIES.length} live · 100 in pilot</b></div>
                <div className="login-meta-item">REGIONS · <b>{REGIONS.length}</b></div>
                <div className="login-meta-item">SHIFT · <b>Day · Sat 02 May</b></div>
              </div>
            </div>
            <div className="login-right">
              <div className="login-form-card">
                <div className="login-form-icon">⛬</div>
                <div className="login-form-title">Command floor sign-in</div>
                <div className="login-form-sub">Demo build — choose a role to preview that workflow.</div>
                <div className="field">
                  <label className="field-label">Staff Email or Council #</label>
                  <input className="field-input" defaultValue="ops.boateng@necc.gherig.gov.gh" />
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
                  Enter Command Centre <span style={{ fontSize: 14 }}>→</span>
                </button>
                <div className="login-fineprint">Authorised NECC staff only · Audited access</div>
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
  const openEscCount = escalations.filter(e => e.status === 'open').length;

  return (
    <div className="necc">
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-brand">
          <div className="topbar-mark">G</div>
          <div>
            <div className="topbar-name">NECC</div>
            <div className="topbar-sub">Command Centre</div>
          </div>
        </div>
        <div className="topbar-context">
          <div className="facility-chip">
            <div className="facility-chip-mark">N</div>
            <div style={{ lineHeight: 1.1 }}>
              <div className="facility-chip-name">National Emergency Command Centre</div>
              <div className="facility-chip-meta">Accra HQ · {user.region === 'all' ? 'national scope' : user.region + ' scope'}</div>
            </div>
          </div>
          <div className="topbar-status">
            <span className="live-pill"><span className="live-dot" />Live · {FACILITIES.length} facilities online</span>
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

      {userDropdownOpen && (
        <div className="user-dropdown" onClick={(e) => e.stopPropagation()}>
          <div className="user-dropdown-head">
            <div className="user-dropdown-name">{user.name}</div>
            <div className="user-dropdown-role">{user.label}</div>
          </div>
          <div className="user-dropdown-meta">
            <div className="user-meta-row"><span className="k">Council #</span><span className="v">{user.council}</span></div>
            <div className="user-meta-row"><span className="k">Scope</span><span className="v">{user.region === 'all' ? 'National' : 'Regional · ' + user.region}</span></div>
            <div className="user-meta-row"><span className="k">Department</span><span className="v">{user.dept}</span></div>
            <div className="user-meta-row"><span className="k">Session</span><span className="v">{sessionDur}</span></div>
          </div>
          <div className="user-dropdown-actions">
            <button type="button" className="dropdown-action" onClick={() => { toast('Profile settings would open here', 'info'); setUserDropdownOpen(false); }}><span>⚙</span> Profile &amp; preferences</button>
            <button type="button" className="dropdown-action" onClick={() => { toast('Password change form would open here', 'info'); setUserDropdownOpen(false); }}><span>🔑</span> Change password</button>
            <button type="button" className="dropdown-action danger" onClick={doLogout}><span>↩</span> Sign out</button>
          </div>
        </div>
      )}

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
                  {item.id === 'escalation' && openEscCount > 0 && (
                    <span className="sb-item-badge">{openEscCount}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
          <div className="sb-footer">
            <div className="sb-footer-line">Build · <b>v1.0.0</b></div>
            <div className="sb-footer-line">Engine · <b>Ghana STG + WHO</b></div>
            <div className="sb-footer-line">NCRIS · <b>Online</b></div>
            <div className="sb-footer-line">Pilot · <b>Greater Accra</b></div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="main">
          {view === 'overview'   && <OverviewView referrals={referrals} capacityByFacility={capacityByFacility} dispatches={dispatches} escalations={escalations} setView={setView} setOpenRef={setOpenRef} setOpenEsc={setOpenEsc} clock={clock} handleRefresh={handleRefresh} />}
          {view === 'bedsearch'  && <BedSearchView services={bsServices} toggleService={toggleService} region={bsRegion} setRegion={setBsRegion} tier={bsTier} setTier={setBsTier} results={bsResults} searched={bsSearched} onSearch={handleBedSearch} onClear={() => { setBsResults([]); setBsSearched(false); setBsServices([]); setBsRegion('any'); setBsTier('any'); }} onRoute={handleBedSearchRoute} capacityByFacility={capacityByFacility} />}
          {view === 'escalation' && <EscalationView escalations={escalations} onAction={handleEscalationAction} onOpen={setOpenEsc} />}
          {view === 'referrals'  && <ReferralsView referrals={referrals} filterPriority={filterPriority} setFilterPriority={setFilterPriority} filterRegion={filterRegion} setFilterRegion={setFilterRegion} searchQuery={searchQuery} setSearchQuery={setSearchQuery} refPage={refPage} setRefPage={setRefPage} setOpenRef={setOpenRef} handleExportCSV={handleExportCSV} userScope={user.region} />}
          {view === 'capacity'   && <CapacityHeatmapView capacityByFacility={capacityByFacility} userScope={user.region} handleRefresh={handleRefresh} handleExportCSV={handleExportCSV} />}
          {view === 'arcs'       && <ArcsLiaisonView dispatches={dispatches} handleRefresh={handleRefresh} />}
          {view === 'rqi'        && <RqiView rqiData={rqiData} userScope={user.region} handleExportCSV={handleExportCSV} />}
          {view === 'audit'      && <AuditView audit={audit} auditPage={auditPage} setAuditPage={setAuditPage} handleExportCSV={handleExportCSV} />}
          {view === 'reports'    && <ReportsView referrals={referrals} rqiData={rqiData} handleExportCSV={handleExportCSV} />}
          {view === 'users'      && <UsersAdminView />}
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
          dispatch={dispatches.find(d => d.referral === openRef)}
          onClose={() => setOpenRef(null)}
        />
      )}

      {/* ESCALATION DETAIL MODAL */}
      {openEsc && (
        <EscalationDetailModal
          escalation={escalations.find(e => e.id === openEsc)}
          onClose={() => setOpenEsc(null)}
          onAction={(action, note) => handleEscalationAction(openEsc, action, note)}
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

/* ════════════════════════════════════════════════════════════════════
   GHANA MAP — simplified SVG outline, facilities as dots
   Ghana is roughly 4.5°N–11.2°N latitude, 3.3°W–1.2°E longitude.
   We use a flat projection with manual scaling.
════════════════════════════════════════════════════════════════════ */
function GhanaMap({ capacityByFacility, onClickFacility }) {
  // Map bounds chosen so all facilities + Ghana outline fit
  const bounds = { minLat: 4.5, maxLat: 11.3, minLng: -3.4, maxLng: 1.3 };
  const W = 400, H = 540;
  const project = (lat, lng) => ({
    x: ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * W,
    y: H - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * H,
  });

  // Simplified Ghana outline polygon (lat/lng pairs, traced from public outline)
  const ghanaOutline = [
    [11.05, -2.93], [11.13, -2.05], [10.94, -1.04], [10.85, -0.16], [10.95, 0.32],
    [10.46, 0.56], [9.55,  0.61], [9.05,  0.36], [8.51,  0.55], [7.80,  0.83],
    [7.06,  0.51], [6.62,  0.78], [6.10,  1.20], [5.93,  1.21], [5.85,  1.06],
    [6.10,  0.30], [5.30, -0.47], [5.10, -0.70], [4.83, -1.85], [4.95, -2.34],
    [5.40, -2.99], [5.93, -3.24], [6.45, -3.39], [7.51, -3.05], [8.34, -2.62],
    [9.43, -2.79], [10.39, -2.85], [11.05, -2.93]
  ];
  const outlinePoints = ghanaOutline.map(([lat, lng]) => { const p = project(lat, lng); return p.x + ',' + p.y; }).join(' ');

  return (
    <div className="map-frame">
      <svg className="map-svg" viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="xMidYMid meet">
        {/* Ghana outline */}
        <polygon points={outlinePoints} className="map-region-fill" />
        {/* Region grid lines (simplified — lat/lng grid) */}
        {[6, 7, 8, 9, 10].map(lat => {
          const p1 = project(lat, bounds.minLng), p2 = project(lat, bounds.maxLng);
          return <line key={'lat'+lat} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#E0DCCE" strokeWidth="0.5" strokeDasharray="2,3" />;
        })}
        {[-2, -1, 0].map(lng => {
          const p1 = project(bounds.minLat, lng), p2 = project(bounds.maxLat, lng);
          return <line key={'lng'+lng} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#E0DCCE" strokeWidth="0.5" strokeDasharray="2,3" />;
        })}
        {/* Facility dots */}
        {FACILITIES.map(f => {
          const p = project(f.lat, f.lng);
          const cap = capacityByFacility[f.code] || {};
          const status = deriveFacilityStatus(cap);
          const r = f.tier === 'Tertiary' ? 6 : f.tier === 'Regional' ? 4.5 : 3.5;
          return (
            <g key={f.code} onClick={() => onClickFacility && onClickFacility(f.code)} style={{ cursor: 'pointer' }}>
              <circle cx={p.x} cy={p.y} r={r} className={'map-facility-dot status-' + status}
                stroke="#fff" strokeWidth="1.5">
                <title>{f.name} · {f.tier} · {status}</title>
              </circle>
              {f.tier === 'Tertiary' && (
                <text x={p.x + 8} y={p.y + 3} className="map-facility-label">{facilityShort(f.code)}</text>
              )}
            </g>
          );
        })}
        {/* Region labels */}
        <text x={20} y={120} className="map-facility-label" style={{ fontSize: 10, fontWeight: 600, fill: 'var(--ink-3)' }}>NORTHERN</text>
        <text x={120} y={250} className="map-facility-label" style={{ fontSize: 10, fontWeight: 600, fill: 'var(--ink-3)' }}>BONO</text>
        <text x={210} y={290} className="map-facility-label" style={{ fontSize: 10, fontWeight: 600, fill: 'var(--ink-3)' }}>ASHANTI</text>
        <text x={300} y={355} className="map-facility-label" style={{ fontSize: 10, fontWeight: 600, fill: 'var(--ink-3)' }}>EASTERN</text>
        <text x={325} y={335} className="map-facility-label" style={{ fontSize: 10, fontWeight: 600, fill: 'var(--ink-3)' }}>VOLTA</text>
        <text x={120} y={420} className="map-facility-label" style={{ fontSize: 10, fontWeight: 600, fill: 'var(--ink-3)' }}>WESTERN</text>
        <text x={210} y={460} className="map-facility-label" style={{ fontSize: 10, fontWeight: 600, fill: 'var(--ink-3)' }}>CENTRAL</text>
        <text x={300} y={490} className="map-facility-label" style={{ fontSize: 10, fontWeight: 600, fill: 'var(--ink-3)' }}>GREATER ACCRA</text>
      </svg>
      <div className="map-legend">
        <div className="map-legend-item"><span className="map-legend-dot" style={{ background: 'var(--emerald)' }} /> Open</div>
        <div className="map-legend-item"><span className="map-legend-dot" style={{ background: 'var(--amber)' }} /> Constrained</div>
        <div className="map-legend-item"><span className="map-legend-dot" style={{ background: 'var(--crimson)' }} /> Full</div>
        <div className="map-legend-item"><span className="map-legend-dot" style={{ background: 'var(--ink-4)' }} /> Offline</div>
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>{FACILITIES.length} facilities · click for details</div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   OVERVIEW
════════════════════════════════════════════════════════════════════ */
function OverviewView({ referrals, capacityByFacility, dispatches, escalations, setView, setOpenRef, setOpenEsc, clock, handleRefresh }) {
  const critical = referrals.filter(r => r.priority === 'critical').length;
  const pending = referrals.filter(r => r.status === 'awaiting_decision').length;
  const enroute = dispatches.filter(d => d.state === 'enroute' || d.state === 'dispatched').length;
  const openEscCount = escalations.filter(e => e.status === 'open').length;

  // Facility status counts
  const facStatuses = FACILITIES.map(f => deriveFacilityStatus(capacityByFacility[f.code] || {}));
  const fullCount = facStatuses.filter(s => s === 'full').length;
  const constrainedCount = facStatuses.filter(s => s === 'constrained').length;
  const openCount = facStatuses.filter(s => s === 'open').length;

  // Top critical referrals
  const topCritical = referrals.filter(r => r.priority === 'critical').slice(0, 5);
  // Top open escalations
  const openEscs = escalations.filter(e => e.status === 'open').slice(0, 4);

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">National picture · live</div>
          <h1 className="page-title">Command Overview</h1>
          <p className="page-sub">Real-time view across the Ghana Emergency Referral grid. Pilot facilities, ambulance dispatches, escalations, and audit replication. Auto-refreshes every 60 seconds.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => handleRefresh('Overview')}><span>↻</span> Refresh</button>
          <button type="button" className="btn btn-primary" onClick={() => setView('bedsearch')}><span>⌖</span> Open Bed-Search</button>
        </div>
      </div>

      <div className="kpi-strip">
        <KpiCard color="crimson" label="Active Critical" value={critical}
          delta={pending + ' pending'} deltaType="up"
          foot={'across all ' + FACILITIES.length + ' facilities'} />
        <KpiCard color="forest" label="Facilities Online" value={openCount + '/' + FACILITIES.length}
          delta="all NCRIS-connected" deltaType="dn"
          foot={fullCount + ' full · ' + constrainedCount + ' constrained'} />
        <KpiCard color="copper" label="Ambulances Active" value={enroute}
          delta="2 critical priority" deltaType="neu"
          foot={dispatches.filter(d => d.state === 'arrived').length + ' arrived this hour'} />
        <KpiCard color="amber" label="Open Escalations" value={openEscCount}
          delta="ICU + blood + CT" deltaType={openEscCount > 2 ? 'up' : 'neu'}
          foot="Ministry pre-notified" />
      </div>

      <div className="two-col">
        <div>
          <SectionHead title="National facility map" meta={openCount + ' open · ' + constrainedCount + ' constrained · ' + fullCount + ' full'} />
          <GhanaMap capacityByFacility={capacityByFacility} onClickFacility={(code) => { setView('capacity'); }} />
        </div>
        <div>
          <SectionHead title="Top critical referrals" meta={critical + ' active'} />
          <div className="card">
            {topCritical.length === 0 ? (
              <div className="search-empty">No active critical referrals</div>
            ) : (
              topCritical.map(r => (
                <div key={r.id} className={'stream-row priority-' + r.priority} onClick={() => setOpenRef(r.id)}>
                  <span className={'stream-pill priority-pill critical'} style={{ background: 'var(--crimson)', color: '#fff' }}>CRIT</span>
                  <span className="stream-id">{r.id.slice(-4)}</span>
                  <div>
                    <div className="stream-cond">{r.subCondition}</div>
                    <div className="stream-cond-sub">{r.patientAge}{r.patientSex} · {r.patientCategory}</div>
                  </div>
                  <div>
                    <div className="stream-fac">{facilityShort(r.sourceFacility)} → {facilityShort(r.destFacility)}</div>
                    <div className="stream-fac-sub">{r.services[0]}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <SectionHead title="Open escalations" meta={openEscCount + ' open'} />
          <div className="card" style={{ padding: 8 }}>
            {openEscs.length === 0 ? (
              <div className="search-empty" style={{ padding: 24 }}>No open escalations · system green</div>
            ) : (
              openEscs.map(e => {
                const t = ESCALATION_TYPES[e.type];
                return (
                  <div key={e.id} className={'esc-card severity-' + t.severity} onClick={() => setOpenEsc(e.id)} style={{ marginBottom: 6 }}>
                    <div className="esc-card-row">
                      <div className={'esc-icon ' + (t.severity === 'high' ? 'amber' : '')}>{t.icon}</div>
                      <div className="esc-info-block">
                        <div className="esc-title">{t.label}</div>
                        <div className="esc-fac">{facilityName(e.facility)}</div>
                        <div className="esc-time">{fmtTime(e.raisedAt)} · {fmtAgo(e.raisedAt)}</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   BED-SEARCH
════════════════════════════════════════════════════════════════════ */
function BedSearchView({ services, toggleService, region, setRegion, tier, setTier, results, searched, onSearch, onClear, onRoute, capacityByFacility }) {
  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Brokerage tool · operator only</div>
          <h1 className="page-title">Bed-Search &amp; Routing</h1>
          <p className="page-sub">Match a referral's service requirements to facilities with available capacity. Ranks by composite score: capacity availability × SLA compliance × distance.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title"><div className="card-title-icon cti-forest">⌖</div>Search criteria</div>
        </div>
        <div className="bedsearch-form">
          <div className="bedsearch-grid">
            <div>
              <label className="field-label">Region</label>
              <select className="field-input" value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="any">Any region</option>
                {REGIONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Facility tier</label>
              <select className="field-input" value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="any">Any tier</option>
                <option value="Tertiary">Tertiary</option>
                <option value="Regional">Regional</option>
                <option value="District">District</option>
              </select>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="field-label">Required services / capacity</label>
              <div style={{ padding: '6px 0', display: 'flex', flexWrap: 'wrap', minHeight: 36, alignItems: 'center', gap: 4 }}>
                {SERVICES.map(s => (
                  <span key={s} className={'svc-pill ' + (services.includes(s) ? 'active' : '')} onClick={() => toggleService(s)}>{s}</span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={onClear}>Clear</button>
            <button type="button" className="btn btn-primary" onClick={onSearch}><span>⌖</span> Search</button>
          </div>
        </div>
      </div>

      {searched && (
        <div className="card">
          <div className="card-head">
            <div className="card-title"><div className="card-title-icon cti-forest">▦</div>Candidate facilities</div>
            <div className="card-meta">{results.length} match{results.length === 1 ? '' : 'es'} · ranked by composite score</div>
          </div>
          {results.length === 0 ? (
            <div className="search-empty">No facilities match these criteria.<br /><span style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 6, display: 'block' }}>Try broadening region or removing tier filter.</span></div>
          ) : (
            <div>
              {results.slice(0, 12).map((r, i) => {
                const cap = r.capacity || {};
                const icuCap = cap.icu;
                const ctCap = cap.ct;
                const scoreClass = r.score >= 75 ? 'score-high' : r.score >= 50 ? 'score-med' : 'score-low';
                return (
                  <div key={r.facility.code} className="search-result-row">
                    <div className="search-rank">{i + 1}</div>
                    <div>
                      <div className="search-fac-name">{r.facility.name}</div>
                      <div className="search-fac-meta">{r.facility.code} · {r.facility.tier} · {r.facility.regionLabel}</div>
                    </div>
                    <div className={'search-stat ' + scoreClass}>
                      <div className="search-stat-val">{r.score}</div>
                      <div className="search-stat-lbl">Score</div>
                    </div>
                    <div className="search-stat">
                      <div className="search-stat-val">{r.availUnits}/{r.totalUnits}</div>
                      <div className="search-stat-lbl">Open units</div>
                    </div>
                    <div className="search-stat">
                      <div className="search-stat-val">{icuCap ? (icuCap.total - icuCap.used) : '—'}</div>
                      <div className="search-stat-lbl">ICU free</div>
                    </div>
                    <div className="search-stat">
                      <div className="search-stat-val">{r.rqi ? r.rqi.sla + '%' : '—'}</div>
                      <div className="search-stat-lbl">SLA</div>
                    </div>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => onRoute(r.facility.code)}>Route →</button>
                  </div>
                );
              })}
              {results.length > 12 && (
                <div style={{ padding: 12, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>
                  Showing top 12 of {results.length} — refine filters for better match
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ESCALATION CONSOLE
════════════════════════════════════════════════════════════════════ */
function EscalationView({ escalations, onAction, onOpen }) {
  const open = escalations.filter(e => e.status === 'open');
  const inProgress = escalations.filter(e => e.status === 'in_progress');
  const resolved = escalations.filter(e => e.status === 'resolved' || e.status === 'moh_escalated');

  const renderEscList = (list, emptyMsg) => list.length === 0 ? (
    <div className="search-empty" style={{ padding: 24 }}>{emptyMsg}</div>
  ) : (
    list.map(e => {
      const t = ESCALATION_TYPES[e.type];
      return (
        <div key={e.id} className={'esc-card severity-' + t.severity} onClick={() => onOpen(e.id)}>
          <div className="esc-card-row">
            <div className={'esc-icon ' + (t.severity === 'high' ? 'amber' : '')}>{t.icon}</div>
            <div className="esc-info-block">
              <div className="esc-title">{t.label}</div>
              <div className="esc-fac">{facilityName(e.facility)}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 4 }}>{e.detail}</div>
              <div className="esc-time">{fmtTime(e.raisedAt)} · {fmtAgo(e.raisedAt)}</div>
            </div>
            <div className="esc-actions" onClick={(ev) => ev.stopPropagation()}>
              {e.status === 'open' && (
                <>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => onAction(e.id, 'broker')}>Broker</button>
                  <button type="button" className="btn btn-sm btn-warn" onClick={() => onAction(e.id, 'escalate')}>To MoH</button>
                  <button type="button" className="btn btn-sm" onClick={() => onAction(e.id, 'resolve')}>Resolve</button>
                </>
              )}
              {e.status === 'in_progress' && (
                <button type="button" className="btn btn-sm" onClick={() => onAction(e.id, 'resolve')}>Mark resolved</button>
              )}
            </div>
          </div>
        </div>
      );
    })
  );

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Operator broker queue</div>
          <h1 className="page-title">Escalation Console</h1>
          <p className="page-sub">When a hospital portal triggers an escalation — ICU full, no specialist, blood critical, theatre unavailable — it lands here. Brokered to alternative facilities, escalated to MoH, or resolved.</p>
        </div>
      </div>

      <div className="kpi-strip">
        <KpiCard color="crimson" label="Open" value={open.length} delta="" deltaType="up" foot="Need broker action" />
        <KpiCard color="amber" label="In progress" value={inProgress.length} delta="" deltaType="neu" foot="Operator working" />
        <KpiCard color="emerald" label="Resolved · today" value={resolved.length} delta="" deltaType="dn" foot="Closed within SLA" />
        <KpiCard color="indigo" label="MoH escalations · today" value={escalations.filter(e => e.status === 'moh_escalated').length} delta="" deltaType="neu" foot="Forwarded upstream" />
      </div>

      <SectionHead title="Open · awaiting broker" meta={open.length + ' to action'} />
      {renderEscList(open, 'No open escalations · system green')}

      {inProgress.length > 0 && (<>
        <SectionHead title="In progress" meta={inProgress.length} />
        {renderEscList(inProgress, '')}
      </>)}

      {resolved.length > 0 && (<>
        <SectionHead title="Closed today" meta={resolved.length} />
        {renderEscList(resolved, '')}
      </>)}
    </div>
  );
}
/* ════════════════════════════════════════════════════════════════════
   NATIONAL REFERRAL STREAM
════════════════════════════════════════════════════════════════════ */
function ReferralsView({ referrals, filterPriority, setFilterPriority, filterRegion, setFilterRegion, searchQuery, setSearchQuery, refPage, setRefPage, setOpenRef, handleExportCSV, userScope }) {
  const PAGE_SIZE = 12;

  // Apply user scope first (regional coordinator restricted to their region)
  let scoped = referrals;
  if (userScope !== 'all') {
    scoped = referrals.filter(r => {
      const src = FACILITIES.find(f => f.code === r.sourceFacility);
      const dst = FACILITIES.find(f => f.code === r.destFacility);
      return (src && src.region === userScope) || (dst && dst.region === userScope);
    });
  }

  // Apply filters
  let filtered = scoped;
  if (filterPriority !== 'all') filtered = filtered.filter(r => r.priority === filterPriority);
  if (filterRegion !== 'all') {
    filtered = filtered.filter(r => {
      const src = FACILITIES.find(f => f.code === r.sourceFacility);
      const dst = FACILITIES.find(f => f.code === r.destFacility);
      return (src && src.region === filterRegion) || (dst && dst.region === filterRegion);
    });
  }
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(r =>
      r.id.toLowerCase().includes(q) ||
      r.subCondition.toLowerCase().includes(q) ||
      r.patientInitials.toLowerCase().includes(q) ||
      facilityName(r.sourceFacility).toLowerCase().includes(q) ||
      facilityName(r.destFacility).toLowerCase().includes(q)
    );
  }

  // Sort by priority then time (newest first)
  const priorityRank = { critical: 0, high: 1, routine: 2 };
  filtered = [...filtered].sort((a, b) => {
    const pa = priorityRank[a.priority] ?? 3;
    const pb = priorityRank[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    return b.receivedAt.getTime() - a.receivedAt.getTime();
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(refPage, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const counts = {
    all: scoped.length,
    critical: scoped.filter(r => r.priority === 'critical').length,
    high: scoped.filter(r => r.priority === 'high').length,
    routine: scoped.filter(r => r.priority === 'routine').length,
  };

  const exportRows = filtered.map(r => [
    r.id, r.priority, r.status, r.subCondition, r.patientInitials + ' ' + r.patientAge + r.patientSex,
    r.patientCategory, r.stability, facilityName(r.sourceFacility), facilityName(r.destFacility),
    r.services.join('; '), fmtTime(r.receivedAt),
    r.vitals.sbp, r.vitals.hr, r.vitals.rr, r.vitals.spo2, r.vitals.gcs
  ]);

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">All facilities · live stream</div>
          <h1 className="page-title">National Referrals</h1>
          <p className="page-sub">Every referral across the GhERIG pilot, sorted by priority and time. Engine-coloured vitals match the hospital portal and tablet for cross-system consistency.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => handleExportCSV(
            'necc_referrals_' + new Date().toISOString().slice(0,10) + '.csv',
            ['ID','Priority','Status','Condition','Patient','Category','Stability','From','To','Services','Received','SBP','HR','RR','SpO2','GCS'],
            exportRows
          )}><span>↓</span> Export CSV</button>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <span className={'filter-pill ' + (filterPriority === 'all' ? 'active' : '')} onClick={() => { setFilterPriority('all'); setRefPage(1); }}>All <span className="count">{counts.all}</span></span>
          <span className={'filter-pill ' + (filterPriority === 'critical' ? 'active' : '')} onClick={() => { setFilterPriority('critical'); setRefPage(1); }}>Critical <span className="count">{counts.critical}</span></span>
          <span className={'filter-pill ' + (filterPriority === 'high' ? 'active' : '')} onClick={() => { setFilterPriority('high'); setRefPage(1); }}>High <span className="count">{counts.high}</span></span>
          <span className={'filter-pill ' + (filterPriority === 'routine' ? 'active' : '')} onClick={() => { setFilterPriority('routine'); setRefPage(1); }}>Routine <span className="count">{counts.routine}</span></span>
          <select className="field-input" style={{ width: 'auto', padding: '6px 10px', fontSize: 11.5 }} value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setRefPage(1); }}>
            <option value="all">All regions</option>
            {REGIONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
          <div className="filter-search">
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>⌕</span>
            <input placeholder="Search by ID, condition, patient, or facility..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setRefPage(1); }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '90px 80px 1fr 1fr 70px 110px 110px 90px', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--paper-3)', fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
          <div>Priority</div><div>ID</div><div>Condition</div><div>Route</div><div>Pat.</div><div>Service</div><div>Status</div><div>Time</div>
        </div>

        {paged.length === 0 ? (
          <div className="search-empty">No referrals match these filters</div>
        ) : (
          paged.map(r => {
            const priorityColor = r.priority === 'critical' ? 'var(--crimson)' : r.priority === 'high' ? 'var(--amber)' : 'var(--forest-mid)';
            return (
              <div key={r.id} className={'stream-row priority-' + r.priority} onClick={() => setOpenRef(r.id)}>
                <span className={'stream-pill'} style={{ background: priorityColor, color: '#fff' }}>{r.priority.slice(0,4).toUpperCase()}</span>
                <span className="stream-id">{r.id.slice(-8)}</span>
                <div>
                  <div className="stream-cond">{r.subCondition}</div>
                  <div className="stream-cond-sub">{r.patientCategory} · {r.stability}</div>
                </div>
                <div>
                  <div className="stream-fac">{facilityShort(r.sourceFacility)} → {facilityShort(r.destFacility)}</div>
                  <div className="stream-fac-sub">{(FACILITIES.find(f => f.code === r.destFacility) || {}).regionLabel}</div>
                </div>
                <div className="stream-pat">{r.patientInitials} · {r.patientAge}{r.patientSex}</div>
                <div className="stream-fac-sub">{r.services[0]}</div>
                <div>
                  <span className="stream-pill" style={{
                    background: r.status === 'accepted' ? 'var(--emerald-pale)'
                              : r.status === 'awaiting_decision' ? 'var(--amber-pale)'
                              : r.status === 'declined' ? 'var(--crimson-pale)'
                              : 'var(--paper-3)',
                    color: r.status === 'accepted' ? 'var(--emerald)'
                         : r.status === 'awaiting_decision' ? 'var(--amber)'
                         : r.status === 'declined' ? 'var(--crimson)'
                         : 'var(--ink-3)'
                  }}>{STATUS_LABEL[r.status] || r.status}</span>
                </div>
                <span className="stream-time">{fmtAgo(r.receivedAt)}</span>
              </div>
            );
          })
        )}

        <div className="pagination">
          <div className="pg-info">Showing <b>{paged.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–{(safePage - 1) * PAGE_SIZE + paged.length}</b> of <b>{filtered.length}</b></div>
          <div className="pg-controls">
            <button type="button" className="pg-btn" disabled={safePage === 1} onClick={() => setRefPage(1)}>«</button>
            <button type="button" className="pg-btn" disabled={safePage === 1} onClick={() => setRefPage(safePage - 1)}>‹</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(totalPages - 4, safePage - 2)) + i;
              if (p > totalPages) return null;
              return <button key={p} type="button" className={'pg-btn ' + (p === safePage ? 'active' : '')} onClick={() => setRefPage(p)}>{p}</button>;
            })}
            <button type="button" className="pg-btn" disabled={safePage === totalPages} onClick={() => setRefPage(safePage + 1)}>›</button>
            <button type="button" className="pg-btn" disabled={safePage === totalPages} onClick={() => setRefPage(totalPages)}>»</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CAPACITY HEATMAP
════════════════════════════════════════════════════════════════════ */
function CapacityHeatmapView({ capacityByFacility, userScope, handleRefresh, handleExportCSV }) {
  const facList = userScope === 'all' ? FACILITIES : FACILITIES.filter(f => f.region === userScope);

  // Union of all unit ids across facilities, in canonical order
  const unitOrder = ['ed_resus', 'icu', 'hdu', 'theatre', 'ct', 'mri', 'picu', 'nicu', 'blood_oneg', 'dialysis'];
  const unitLabels = {
    ed_resus: 'ED Resus', icu: 'ICU', hdu: 'HDU', theatre: 'Theatre', ct: 'CT', mri: 'MRI',
    picu: 'PICU', nicu: 'NICU', blood_oneg: 'Blood O−', dialysis: 'Dialysis',
  };

  const cellClass = (cap) => {
    if (!cap) return 'cell-empty';
    const ratio = cap.used / cap.total;
    if (ratio >= 1.0) return 'cell-full';
    if (cap.consumable && ratio >= 0.7) return 'cell-high';
    if (ratio >= 0.85) return 'cell-high';
    if (ratio >= 0.6) return 'cell-mid';
    return 'cell-low';
  };

  const exportRows = facList.map(f => {
    const cap = capacityByFacility[f.code] || {};
    return [f.code, f.name, f.tier, f.regionLabel, ...unitOrder.map(u => cap[u] ? cap[u].used + '/' + cap[u].total : '—')];
  });

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">All facilities × all units</div>
          <h1 className="page-title">Capacity Heatmap</h1>
          <p className="page-sub">National capacity grid. Cells coloured by utilisation. Constraint hotspots — where multiple critical units saturate at once — jump out instantly. Updates every 60 seconds via NCRIS replication.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => handleRefresh('Capacity heatmap')}><span>↻</span> Refresh</button>
          <button type="button" className="btn" onClick={() => handleExportCSV(
            'necc_capacity_' + new Date().toISOString().slice(0,10) + '.csv',
            ['Code','Facility','Tier','Region', ...unitOrder.map(u => unitLabels[u])],
            exportRows
          )}><span>↓</span> Export CSV</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title"><div className="card-title-icon cti-indigo">⊞</div>Utilisation grid · {facList.length} facilities</div>
          <div className="card-meta">scroll horizontally for full view</div>
        </div>
        <div className="heatmap-wrap">
          <table className="heatmap-table">
            <thead>
              <tr>
                <th className="row-head" style={{ position: 'sticky', left: 0, zIndex: 3 }}>Facility</th>
                {unitOrder.map(u => <th key={u} className="col-head">{unitLabels[u]}</th>)}
              </tr>
            </thead>
            <tbody>
              {facList.map(f => {
                const cap = capacityByFacility[f.code] || {};
                return (
                  <tr key={f.code}>
                    <td className="row-head-cell">
                      <div className="name">{f.name}</div>
                      <div className="meta">{f.code} · {f.tier}</div>
                    </td>
                    {unitOrder.map(u => {
                      const c = cap[u];
                      return (
                        <td key={u} className={'cell ' + cellClass(c)}>
                          {c ? (
                            <>
                              <div className="heatmap-cell-val">{c.used}/{c.total}</div>
                              <div className="heatmap-cell-tot">{Math.round((c.used / c.total) * 100)}%</div>
                            </>
                          ) : <div className="heatmap-cell-val">—</div>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', background: 'var(--paper-3)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div className="map-legend-item"><span className="map-legend-dot" style={{ background: '#E6F1EA' }} /> &lt; 60% (low)</div>
          <div className="map-legend-item"><span className="map-legend-dot" style={{ background: '#F1ECDF' }} /> 60–85% (mid)</div>
          <div className="map-legend-item"><span className="map-legend-dot" style={{ background: '#F4DECF' }} /> ≥ 85% (high)</div>
          <div className="map-legend-item"><span className="map-legend-dot" style={{ background: 'var(--crimson-pale)' }} /> 100% (full)</div>
          <div className="map-legend-item"><span className="map-legend-dot" style={{ background: 'var(--paper-3)' }} /> not available at facility</div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ARCS LIAISON · read-only ambulance dispatch state from NECC view
════════════════════════════════════════════════════════════════════ */
function ArcsLiaisonView({ dispatches, handleRefresh }) {
  const grouped = {
    dispatched: dispatches.filter(d => d.state === 'dispatched'),
    enroute:    dispatches.filter(d => d.state === 'enroute'),
    arrived:    dispatches.filter(d => d.state === 'arrived'),
    cleared:    dispatches.filter(d => d.state === 'cleared'),
  };

  const renderTile = (d) => (
    <div key={d.id} className={'arcs-tile arcs-state-' + d.state}>
      <div className="arcs-tile-head">
        <div className="arcs-vehicle">{d.vehicle}</div>
        <span className={'arcs-state-pill ' + d.state}>{d.state}</span>
      </div>
      <div className="arcs-tile-body">
        <div className="arcs-row"><div className="k">From</div><div className="v">{facilityName(d.from)}</div></div>
        <div className="arcs-row"><div className="k">To</div><div className="v">{facilityName(d.to)}</div></div>
        <div className="arcs-row"><div className="k">Ref</div><div className="v" style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}>{d.referral}</div></div>
        <div className="arcs-row"><div className="k">Crew</div><div className="v">{d.crew}</div></div>
        <div className="arcs-row"><div className="k">Disp.</div><div className="v">{fmtTime(d.dispatchedAt)} · {fmtAgo(d.dispatchedAt)}</div></div>
        {d.state !== 'arrived' && d.state !== 'cleared' && (
          <div className="arcs-row"><div className="k">ETA</div><div className="v" style={{ fontWeight: 600, color: 'var(--copper)' }}>{d.eta} min</div></div>
        )}
      </div>
    </div>
  );

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Read-only · ARCS-fed</div>
          <h1 className="page-title">ARCS Liaison</h1>
          <p className="page-sub">Live ambulance dispatch state from the National Ambulance Service (or partner) — feeds into NECC for situational awareness. Full dispatch authority lives in the ARCS portal.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => handleRefresh('ARCS state')}><span>↻</span> Refresh</button>
        </div>
      </div>

      <div className="kpi-strip">
        <KpiCard color="copper" label="Dispatched" value={grouped.dispatched.length} delta="" deltaType="neu" foot="Just sent · awaiting wheels" />
        <KpiCard color="amber" label="En route" value={grouped.enroute.length} delta="" deltaType="up" foot="Currently moving" />
        <KpiCard color="emerald" label="Arrived" value={grouped.arrived.length} delta="" deltaType="dn" foot="At receiving facility" />
        <KpiCard color="indigo" label="Cleared today" value={grouped.cleared.length + 14} delta="" deltaType="neu" foot="Run completed" />
      </div>

      {Object.entries(grouped).map(([state, list]) => list.length === 0 ? null : (
        <div key={state}>
          <SectionHead title={state.charAt(0).toUpperCase() + state.slice(1)} meta={list.length + ' vehicle' + (list.length === 1 ? '' : 's')} />
          <div className="arcs-grid">
            {list.map(renderTile)}
          </div>
        </div>
      ))}

      {dispatches.length === 0 && (
        <div className="card">
          <div className="search-empty">No active dispatches</div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   RQI · 2x2 QUALITY MATRIX
════════════════════════════════════════════════════════════════════ */
function RqiView({ rqiData, userScope, handleExportCSV }) {
  const [hover, setHover] = useState(null);
  const data = userScope === 'all' ? rqiData : rqiData.filter(d => d.region === userScope);

  // 2x2 matrix:
  //   x-axis: time-to-decision (minutes), 0 (left, fast) → 12 (right, slow)
  //   y-axis: SLA-compliance (%), 100 (top, compliant) → 50 (bottom, non-compliant)
  // Quadrants:
  //   Q1 (top-left)  = fast + compliant   → emerald (best)
  //   Q2 (top-right) = slow + compliant   → amber
  //   Q3 (bot-left)  = fast + non-compl   → copper
  //   Q4 (bot-right) = slow + non-compl   → crimson (worst)
  const W = 720, H = 460;
  const PAD_L = 60, PAD_R = 30, PAD_T = 30, PAD_B = 60;
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const xMax = 12, xMin = 0;
  const yMax = 100, yMin = 50;
  const xMid = 5; // 5 min decision target
  const yMid = 90; // 90% SLA compliance target

  const xPos = (v) => PAD_L + ((v - xMin) / (xMax - xMin)) * plotW;
  const yPos = (v) => PAD_T + ((yMax - v) / (yMax - yMin)) * plotH;

  const counts = {
    q1: data.filter(d => d.ttd <= xMid && d.sla >= yMid).length,
    q2: data.filter(d => d.ttd > xMid  && d.sla >= yMid).length,
    q3: data.filter(d => d.ttd <= xMid && d.sla < yMid).length,
    q4: data.filter(d => d.ttd > xMid  && d.sla < yMid).length,
  };

  const dotColor = (d) => {
    if (d.ttd <= xMid && d.sla >= yMid) return 'var(--emerald)';
    if (d.ttd > xMid  && d.sla >= yMid) return 'var(--amber)';
    if (d.ttd <= xMid && d.sla < yMid)  return 'var(--copper)';
    return 'var(--crimson)';
  };

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Live · refreshes every 60 seconds</div>
          <h1 className="page-title">RQI · Quality Matrix</h1>
          <p className="page-sub">Referral Quality Index per facility. X-axis: time-to-decision (minutes). Y-axis: SLA compliance over last 24h (%). Top-left is best. Used for both real-time intervention and monthly EAR-Q submission to MoH.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => handleExportCSV(
            'necc_rqi_' + new Date().toISOString().slice(0,10) + '.csv',
            ['Code','Facility','Region','Tier','Time-to-decision (min)','SLA-compliance (%)','Quadrant'],
            data.map(d => {
              const q = d.ttd <= xMid && d.sla >= yMid ? 'Q1 best' : d.ttd > xMid && d.sla >= yMid ? 'Q2 slow-compliant' : d.ttd <= xMid && d.sla < yMid ? 'Q3 fast-noncompliant' : 'Q4 worst';
              return [d.code, d.name, d.region, d.tier, d.ttd, d.sla, q];
            })
          )}><span>↓</span> Export CSV</button>
        </div>
      </div>

      <div className="kpi-strip">
        <KpiCard color="emerald" label="Q1 · best" value={counts.q1} delta={Math.round(counts.q1 / Math.max(1, data.length) * 100) + '%'} deltaType="dn" foot="Fast · compliant" />
        <KpiCard color="amber" label="Q2 · slow-compliant" value={counts.q2} delta="" deltaType="neu" foot="Decisions take time but SLAs hit" />
        <KpiCard color="copper" label="Q3 · fast-noncompliant" value={counts.q3} delta="" deltaType="neu" foot="Quick decisions but SLAs missed" />
        <KpiCard color="crimson" label="Q4 · worst" value={counts.q4} delta={counts.q4 > 0 ? 'intervention' : 'none'} deltaType={counts.q4 > 0 ? 'up' : 'dn'} foot="Slow + non-compliant" />
      </div>

      <div className="rqi-matrix" style={{ position: 'relative' }}>
        <svg className="rqi-svg" viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="xMidYMid meet">
          {/* Quadrant fills */}
          <rect x={PAD_L} y={PAD_T} width={xPos(xMid) - PAD_L} height={yPos(yMid) - PAD_T} className="rqi-q-q1 rqi-quadrant-fill" />
          <rect x={xPos(xMid)} y={PAD_T} width={(W - PAD_R) - xPos(xMid)} height={yPos(yMid) - PAD_T} className="rqi-q-q2 rqi-quadrant-fill" />
          <rect x={PAD_L} y={yPos(yMid)} width={xPos(xMid) - PAD_L} height={(H - PAD_B) - yPos(yMid)} className="rqi-q-q3 rqi-quadrant-fill" />
          <rect x={xPos(xMid)} y={yPos(yMid)} width={(W - PAD_R) - xPos(xMid)} height={(H - PAD_B) - yPos(yMid)} className="rqi-q-q4 rqi-quadrant-fill" />

          {/* Quadrant labels */}
          <text x={PAD_L + 12} y={PAD_T + 22} className="rqi-quadrant-label rqi-q-q1">Q1 · BEST</text>
          <text x={W - PAD_R - 12} y={PAD_T + 22} textAnchor="end" className="rqi-quadrant-label rqi-q-q2">Q2 · SLOW-COMPLIANT</text>
          <text x={PAD_L + 12} y={H - PAD_B - 12} className="rqi-quadrant-label rqi-q-q3">Q3 · FAST-NONCOMPLIANT</text>
          <text x={W - PAD_R - 12} y={H - PAD_B - 12} textAnchor="end" className="rqi-quadrant-label rqi-q-q4">Q4 · WORST</text>

          {/* Grid lines */}
          {[2, 4, 6, 8, 10].map(v => (
            <g key={'gx'+v}>
              <line x1={xPos(v)} y1={PAD_T} x2={xPos(v)} y2={H - PAD_B} className="rqi-grid-line" />
              <text x={xPos(v)} y={H - PAD_B + 16} textAnchor="middle" className="rqi-axis-label">{v}</text>
            </g>
          ))}
          {[60, 70, 80, 90].map(v => (
            <g key={'gy'+v}>
              <line x1={PAD_L} y1={yPos(v)} x2={W - PAD_R} y2={yPos(v)} className="rqi-grid-line" />
              <text x={PAD_L - 8} y={yPos(v) + 4} textAnchor="end" className="rqi-axis-label">{v}%</text>
            </g>
          ))}

          {/* Mid lines (target) */}
          <line x1={xPos(xMid)} y1={PAD_T} x2={xPos(xMid)} y2={H - PAD_B} stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="5,4" />
          <line x1={PAD_L} y1={yPos(yMid)} x2={W - PAD_R} y2={yPos(yMid)} stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="5,4" />

          {/* Axes */}
          <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="rqi-axis" />
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="rqi-axis" />

          {/* Axis titles */}
          <text x={PAD_L + plotW/2} y={H - 14} textAnchor="middle" className="rqi-axis-label" style={{ fontWeight: 700 }}>TIME-TO-DECISION (min) →</text>
          <text x={18} y={PAD_T + plotH/2} textAnchor="middle" transform={'rotate(-90 18 ' + (PAD_T + plotH/2) + ')'} className="rqi-axis-label" style={{ fontWeight: 700 }}>← SLA COMPLIANCE (%)</text>

          {/* Dots */}
          {data.map(d => {
            const cx = xPos(Math.min(xMax, Math.max(xMin, d.ttd)));
            const cy = yPos(Math.min(yMax, Math.max(yMin, d.sla)));
            return (
              <g key={d.code}>
                <circle
                  cx={cx} cy={cy} r={5}
                  className="rqi-dot"
                  fill={dotColor(d)}
                  stroke="#fff" strokeWidth="1.5"
                  onMouseEnter={() => setHover({ d, x: cx, y: cy })}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>

        {hover && (
          <div className="rqi-tooltip" style={{ left: (hover.x / W * 100) + '%', top: (hover.y / H * 100) + '%' }}>
            <div className="rqi-tooltip-name">{hover.d.name}</div>
            <div className="rqi-tooltip-stat">TTD {hover.d.ttd} min · SLA {hover.d.sla}%</div>
            <div className="rqi-tooltip-stat">{hover.d.tier} · {hover.d.region}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   AUDIT REPLICATION
════════════════════════════════════════════════════════════════════ */
function AuditView({ audit, auditPage, setAuditPage, handleExportCSV }) {
  const PAGE_SIZE = 25;
  const totalPages = Math.max(1, Math.ceil(audit.length / PAGE_SIZE));
  const safePage = Math.min(auditPage, totalPages);
  const paged = audit.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">National event stream · all facilities</div>
          <h1 className="page-title">Audit Replication</h1>
          <p className="page-sub">Every audited action across the GhERIG pilot network — referrals, capacity edits, brokerage decisions, escalations — replicated from facility portals through NCRIS to the national audit log. Held for forensic review and Auditor-General access.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => handleExportCSV(
            'necc_audit_' + new Date().toISOString().slice(0,10) + '.csv',
            ['Time','Facility','Actor','Role','Action','Reference'],
            audit.map(e => [e.time.toISOString(), e.facility, e.actor, e.role, e.action, e.ref || ''])
          )}><span>↓</span> Export CSV</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title"><div className="card-title-icon cti-indigo">⊟</div>Event log</div>
          <div className="card-meta">{audit.length} event{audit.length === 1 ? '' : 's'} · forensic-grade · MoH-replicated</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '90px 140px 130px 1fr 100px', gap: 14, padding: '8px 18px', borderBottom: '1px solid var(--border)', background: 'var(--paper-3)', fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
          <div>Time</div><div>Facility</div><div>Actor</div><div>Action</div><div style={{ textAlign: 'right' }}>Ref</div>
        </div>

        <div className="audit-list">
          {paged.map((e, i) => (
            <div key={i} className="audit-item">
              <span className="audit-time">{fmtTime(e.time)}</span>
              <span className="audit-fac">{e.facility === 'NECC' ? 'NECC' : facilityShort(e.facility)}</span>
              <div>
                <div className="audit-actor">{e.actor}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-4)' }}>{e.role}</div>
              </div>
              <span className="audit-action">{e.action}</span>
              <span className="audit-ref">{e.ref || '—'}</span>
            </div>
          ))}
        </div>

        <div className="pagination">
          <div className="pg-info">Showing <b>{paged.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–{(safePage - 1) * PAGE_SIZE + paged.length}</b> of <b>{audit.length}</b></div>
          <div className="pg-controls">
            <button type="button" className="pg-btn" disabled={safePage === 1} onClick={() => setAuditPage(1)}>«</button>
            <button type="button" className="pg-btn" disabled={safePage === 1} onClick={() => setAuditPage(safePage - 1)}>‹</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(totalPages - 4, safePage - 2)) + i;
              if (p > totalPages) return null;
              return <button key={p} type="button" className={'pg-btn ' + (p === safePage ? 'active' : '')} onClick={() => setAuditPage(p)}>{p}</button>;
            })}
            <button type="button" className="pg-btn" disabled={safePage === totalPages} onClick={() => setAuditPage(safePage + 1)}>›</button>
            <button type="button" className="pg-btn" disabled={safePage === totalPages} onClick={() => setAuditPage(totalPages)}>»</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   NATIONAL REPORTS / EAR-Q
════════════════════════════════════════════════════════════════════ */
function ReportsView({ referrals, rqiData, handleExportCSV }) {
  // Hourly volume — simulate last 12 hours
  const hourlyVolume = useMemo(() => {
    const buckets = Array.from({ length: 12 }, (_, i) => ({ hour: i, accepted: 0, declined: 0 }));
    referrals.forEach(r => {
      const hoursAgo = Math.floor((Date.now() - r.receivedAt.getTime()) / (3600 * 1000));
      const idx = Math.min(11, 11 - hoursAgo);
      if (idx >= 0) {
        if (r.status === 'accepted' || r.status === 'enroute' || r.status === 'arrived') buckets[idx].accepted++;
        else if (r.status === 'declined') buckets[idx].declined++;
        else buckets[idx].accepted++;
      }
    });
    // pad earlier hours with synthetic data
    for (let i = 0; i < 8; i++) {
      buckets[i].accepted += 12 + Math.floor(Math.random() * 18);
      buckets[i].declined += Math.floor(Math.random() * 4);
    }
    return buckets;
  }, [referrals]);

  const maxBar = Math.max(...hourlyVolume.map(b => b.accepted + b.declined), 1);

  // Facility league — top by SLA compliance
  const league = [...rqiData].sort((a, b) => b.sla - a.sla).slice(0, 10);

  // Aggregate metrics
  const totalReferrals = referrals.length + 240; // include synthetic 24h
  const acceptedToday = referrals.filter(r => r.status === 'accepted' || r.status === 'enroute' || r.status === 'arrived').length + 198;
  const declinedToday = referrals.filter(r => r.status === 'declined').length + 14;
  const avgSLA = Math.round(rqiData.reduce((s, d) => s + d.sla, 0) / Math.max(1, rqiData.length));
  const avgTTD = (rqiData.reduce((s, d) => s + d.ttd, 0) / Math.max(1, rqiData.length)).toFixed(1);

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">EAR-Q · MoH dashboard · live aggregates</div>
          <h1 className="page-title">National Reports</h1>
          <p className="page-sub">Aggregated emergency referral metrics for ministerial briefing and monthly Emergency Activity Report (EAR-Q) submission. Drill-down by region available on request.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => handleExportCSV(
            'necc_ear_q_' + new Date().toISOString().slice(0,10) + '.csv',
            ['Metric', 'Value', 'Period'],
            [
              ['Total referrals', totalReferrals, 'Last 24h'],
              ['Accepted', acceptedToday, 'Last 24h'],
              ['Declined', declinedToday, 'Last 24h'],
              ['Avg SLA compliance %', avgSLA, 'Network-wide'],
              ['Avg time-to-decision (min)', avgTTD, 'Network-wide'],
            ]
          )}><span>↓</span> Download EAR-Q (CSV)</button>
        </div>
      </div>

      <div className="kpi-strip">
        <KpiCard color="forest" label="Referrals · 24h" value={totalReferrals} delta="+8.2% vs yesterday" deltaType="up" foot="All facilities" />
        <KpiCard color="emerald" label="Accept rate" value={Math.round(acceptedToday / totalReferrals * 100) + '%'} delta="" deltaType="dn" foot={acceptedToday + ' accepted / ' + declinedToday + ' declined'} />
        <KpiCard color="indigo" label="Avg SLA" value={avgSLA + '%'} delta={avgSLA >= 90 ? 'on target' : 'below target'} deltaType={avgSLA >= 90 ? 'dn' : 'up'} foot="Target: 90%" />
        <KpiCard color="copper" label="Avg time-to-decision" value={avgTTD + ' min'} delta={parseFloat(avgTTD) <= 5 ? 'on target' : 'over target'} deltaType={parseFloat(avgTTD) <= 5 ? 'dn' : 'up'} foot="Target: ≤ 5 min" />
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-head">
            <div className="card-title"><div className="card-title-icon cti-forest">▤</div>Hourly volume · last 12h</div>
            <div className="card-meta">accepted vs declined</div>
          </div>
          <div className="chart-wrap">
            <div className="chart-bars">
              {hourlyVolume.map((b, i) => (
                <div key={i} className="bar-group">
                  <div className="bar-pair" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    <div className="bar" style={{ height: ((b.accepted / maxBar) * 100) + '%', background: 'var(--forest-mid)' }} />
                    {b.declined > 0 && <div className="bar" style={{ height: ((b.declined / maxBar) * 100) + '%', background: 'var(--crimson)' }} />}
                  </div>
                </div>
              ))}
            </div>
            <div className="chart-axis">
              {hourlyVolume.map((b, i) => <span key={i}>{i % 2 === 0 ? '−' + (12 - i) + 'h' : ''}</span>)}
            </div>
          </div>
          <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', background: 'var(--paper-3)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <div className="map-legend-item"><span className="map-legend-dot" style={{ background: 'var(--forest-mid)' }} /> Accepted</div>
            <div className="map-legend-item"><span className="map-legend-dot" style={{ background: 'var(--crimson)' }} /> Declined</div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title"><div className="card-title-icon cti-emerald">★</div>Facility league · top 10 SLA</div>
            <div className="card-meta">last 24h compliance</div>
          </div>
          <div>
            {league.map((d, i) => (
              <div key={d.code} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 60px 50px', gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--border)', alignItems: 'center', fontSize: 12 }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 600, color: 'var(--copper)' }}>{i + 1}</div>
                <div>
                  <div style={{ fontWeight: 600 }}>{d.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-3)' }}>{d.code} · {d.tier}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: d.sla >= 90 ? 'var(--emerald)' : d.sla >= 80 ? 'var(--amber)' : 'var(--crimson)' }}>{d.sla}%</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)' }}>SLA</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{d.ttd}m</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)' }}>TTD</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   USERS & ROLES (placeholder — admin/supervisor only)
════════════════════════════════════════════════════════════════════ */
function UsersAdminView() {
  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Administration</div>
          <h1 className="page-title">Users &amp; Roles</h1>
          <p className="page-sub">NECC user provisioning, role assignment, and audit access. Full admin workflow available in v1.1 — this is a preview placeholder for the demo.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title"><div className="card-title-icon cti-copper">⌬</div>NECC personnel</div>
          <div className="card-meta">{Object.keys(ROLES).length} active accounts</div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Role</th><th>Department</th><th>Council #</th><th>Scope</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(ROLES).map(([key, r]) => (
                <tr key={key}>
                  <td><b>{r.name}</b></td>
                  <td>{r.label}</td>
                  <td>{r.dept}</td>
                  <td className="id-cell">{r.council}</td>
                  <td>{r.region === 'all' ? 'National' : r.region}</td>
                  <td><span className="row-pill rp-active">Active</span></td>
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
   REFERRAL DETAIL MODAL — engine-coloured vitals same as portal/tablet
════════════════════════════════════════════════════════════════════ */
function ReferralDetailModal({ referral, dispatch, onClose }) {
  if (!referral) return null;
  const r = referral;
  const assess = useMemo(() => assessVitals(r.vitals, r.patientAge, r.patientCategory), [r]);

  const vitalCell = (key, val, unit) => {
    const v = assess.perVital[key];
    const tier = v ? v.tier : 'normal';
    const colorMap = {
      normal: { bg: 'var(--emerald-pale)', fg: 'var(--emerald)' },
      borderline: { bg: 'var(--amber-pale)', fg: 'var(--amber)' },
      abnormal: { bg: 'var(--copper-pale)', fg: 'var(--copper)' },
      critical: { bg: 'var(--crimson-pale)', fg: 'var(--crimson)' },
    };
    const c = colorMap[tier] || colorMap.normal;
    return (
      <div style={{ background: c.bg, border: '1px solid ' + c.fg, padding: '10px 12px', borderRadius: 8, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: c.fg, letterSpacing: 0.1, textTransform: 'uppercase' }}>{key === 'spo2' ? 'SpO₂' : key.toUpperCase()}</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 600, color: c.fg, lineHeight: 1.1, marginTop: 4 }}>{val}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: c.fg }}>{unit} · {tier}</div>
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{r.subCondition}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 4 }}>
              {r.id} · {r.priority.toUpperCase()} · {STATUS_LABEL[r.status] || r.status}
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="detail-grid">
            <div className="k">Patient</div><div className="v">{r.patientInitials} · {r.patientAge}{r.patientSex} · {r.patientCategory}</div>
            <div className="k">Stability</div><div className="v">{r.stability}</div>
            <div className="k">From</div><div className="v">{facilityName(r.sourceFacility)} <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>· {r.sourceFacility}</span></div>
            <div className="k">To</div><div className="v">{facilityName(r.destFacility)} <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>· {r.destFacility} · {distanceKm(r.sourceFacility, r.destFacility) || '—'} km</span></div>
            <div className="k">Services</div><div className="v">{r.services.join(' · ')}</div>
            <div className="k">Reasons</div><div className="v">{r.reasons.join(' · ')}</div>
            <div className="k">Received</div><div className="v">{fmtTime(r.receivedAt)} · {fmtAgo(r.receivedAt)}</div>
            <div className="k">Summary</div><div className="v">{r.summary}</div>
          </div>

          <div style={{ marginTop: 22, marginBottom: 14, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: 0.14, textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            Vitals · engine-assessed · {assess.criticalCount} critical, total score {assess.totalScore}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {vitalCell('sbp', r.vitals.sbp + '/' + r.vitals.dbp, 'mmHg')}
            {vitalCell('hr', r.vitals.hr, 'bpm')}
            {vitalCell('rr', r.vitals.rr, '/min')}
            {vitalCell('spo2', r.vitals.spo2, '%')}
            {vitalCell('gcs', r.vitals.gcs, '/15')}
          </div>

          {dispatch && (
            <>
              <div style={{ marginTop: 22, marginBottom: 10, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: 0.14, textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                Linked ambulance dispatch
              </div>
              <div style={{ background: 'var(--paper-3)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                <div className="detail-grid">
                  <div className="k">Vehicle</div><div className="v" style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{dispatch.vehicle}</div>
                  <div className="k">State</div><div className="v"><span className={'arcs-state-pill ' + dispatch.state}>{dispatch.state}</span></div>
                  <div className="k">Crew</div><div className="v">{dispatch.crew}</div>
                  <div className="k">Dispatched</div><div className="v">{fmtTime(dispatch.dispatchedAt)} · {fmtAgo(dispatch.dispatchedAt)}</div>
                  {dispatch.state !== 'arrived' && dispatch.state !== 'cleared' && (
                    <><div className="k">ETA</div><div className="v" style={{ color: 'var(--copper)', fontWeight: 600 }}>{dispatch.eta} min</div></>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ESCALATION DETAIL MODAL
════════════════════════════════════════════════════════════════════ */
function EscalationDetailModal({ escalation, onClose, onAction }) {
  if (!escalation) return null;
  const e = escalation;
  const t = ESCALATION_TYPES[e.type];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{t.label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 4 }}>
              {e.id} · severity: {t.severity} · status: {e.status}
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', gap: 14, marginBottom: 16, padding: 14, background: t.severity === 'critical' ? 'var(--crimson-pale)' : 'var(--amber-pale)', border: '1px solid ' + (t.severity === 'critical' ? 'var(--crimson)' : 'var(--amber)'), borderRadius: 10 }}>
            <div style={{ fontSize: 28 }}>{t.icon}</div>
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600 }}>{t.label}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 4 }}>{e.detail}</div>
            </div>
          </div>

          <div className="detail-grid">
            <div className="k">Facility</div><div className="v">{facilityName(e.facility)} <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>· {e.facility}</span></div>
            <div className="k">Raised at</div><div className="v">{fmtTime(e.raisedAt)} · {fmtAgo(e.raisedAt)}</div>
            <div className="k">Type</div><div className="v">{e.type}</div>
            <div className="k">Severity</div><div className="v" style={{ textTransform: 'capitalize' }}>{t.severity}</div>
            <div className="k">Status</div><div className="v" style={{ textTransform: 'capitalize' }}>{e.status.replace('_', ' ')}</div>
          </div>

          <div style={{ marginTop: 18, padding: 12, background: 'var(--paper-3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.14, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}>Recommended actions</div>
            {e.type === 'icu_full' && <span>Broker to nearest tertiary with ICU availability. Use bed-search to find candidates. If none available within 30 km radius, escalate to MoH for inter-region transfer authorisation.</span>}
            {e.type === 'blood_critical' && <span>Coordinate with National Blood Service for emergency restock. Identify nearby facility with adequate stock for redirect. Active cases needing blood must be flagged on referral stream.</span>}
            {e.type === 'ct_offline' && <span>Redirect imaging-dependent cases to nearest facility with operational CT. Notify all currently in-flight referrals. Engineering ETA must be communicated to facility.</span>}
            {e.type === 'no_specialist' && <span>Contact other tertiary on-call rotas. If single point of failure, escalate to MoH for emergency locum or telemedicine consultation.</span>}
            {e.type === 'multi_critical' && <span>Activate facility surge protocol. Pre-alert ARCS for ambulance staging. Consider redirecting some inbound cases to alternative tertiary facility.</span>}
            {e.type === 'theatre_unavailable' && <span>Identify nearest facility with operational emergency theatre. For time-critical surgical cases, redirect immediately. Notify ARCS for ambulance re-routing.</span>}
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Close</button>
          {e.status === 'open' && (
            <>
              <button type="button" className="btn btn-warn" onClick={() => onAction('escalate')}>Forward to MoH</button>
              <button type="button" className="btn" onClick={() => onAction('resolve')}>Resolve</button>
              <button type="button" className="btn btn-primary" onClick={() => onAction('broker')}>Broker</button>
            </>
          )}
          {e.status === 'in_progress' && (
            <button type="button" className="btn btn-primary" onClick={() => onAction('resolve')}>Mark resolved</button>
          )}
        </div>
      </div>
    </div>
  );
}
