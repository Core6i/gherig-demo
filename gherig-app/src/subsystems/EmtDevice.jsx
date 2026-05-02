/* ════════════════════════════════════════════════════════════════════
   GhERIG · EMT Device · v1.0
   In-Vehicle Paramedic Tablet
   National Ambulance Service · Ghana
   ────────────────────────────────────────────────────────────────────
   USAGE:
     import EmtDevice from './EmtDevice';
     <EmtDevice />

   DEPENDENCIES: react (>=17). No external libraries.
   TARGET: 9–10" Android tablet bolted to ambulance dashboard.

   ────────────────────────────────────────────────────────────────────
   WHAT THIS IS

   The fifth and final user-facing subsystem of GhERIG. This is what
   sits in the cab of every NAS ambulance in the pilot. It receives
   dispatched jobs from ARCS, broadcasts GPS position back to ARCS,
   captures vitals + interventions during transit, and signs off the
   patient handoff at the receiving facility.

   The complete GhERIG patient journey:

     Tablet (referral capture)
        ↓
     Hospital Portal (facility coordination)
        ↓
     NCRIS Switch
        ↓
     NECC (national bed-search)
        ↓
     ARCS (regional dispatch)
        ↓
     ► EMT DEVICE (this) ◄  — in the moving vehicle
        ↓ (state, GPS, vitals back upstream)
     Receiving Hospital Portal (handoff)

   ────────────────────────────────────────────────────────────────────
   DESIGN CONSTRAINTS — these are non-negotiable

   • TOUCH-FIRST. Buttons minimum 64px tall. Gloves-compatible.
   • DARK MODE BY DEFAULT. Night driving + sunlight glare both addressed.
   • THREE-TAP RULE. Any common action ≤ 3 taps. No nested menus deeper
     than one level.
   • ONE-HAND OPERATION. Critical actions reachable with thumb while the
     other hand is on the patient.
   • HIGH-CONTRAST PALETTE. Bright crimson for action, deep emerald for
     confirmation, neon yellow for caution. Pure black background.
   • NO DRAG, NO HOVER, NO FINE MOTOR. All taps. All thumb-sized.
   • LARGE TYPE. Body text 16px+. Numerics 28px+. No 11pt anywhere.

   ────────────────────────────────────────────────────────────────────
   SCREENS (6)

   1. Login           — staff council # + station, big buttons
   2. Job Inbox       — incoming dispatch from ARCS, ACCEPT JOB
   3. Active Job      — lifecycle stepper, the spine of the device
   4. Vitals Capture  — quick-tap vital sign entry, engine-coloured
   5. Interventions   — IV/fluids/drugs/oxygen log
   6. Handoff         — pre-arrival notification, e-PCR sign-off

   ────────────────────────────────────────────────────────────────────
   GPS BROADCAST

   When `WHEELS ROLLING` is tapped, the device begins broadcasting
   position every 15 seconds back to ARCS. In this demo build we
   simulate the broadcast (since no real backend exists yet); a
   visible "📍 broadcasting" indicator confirms it's running.

   In production, this hooks into navigator.geolocation.watchPosition
   with a fallback to network-tower triangulation when GPS is weak.

   ────────────────────────────────────────────────────────────────────
   CLINICAL ENGINE — same Ghana STG + WHO IMCI as portal/tablet/NECC/ARCS.
   © 2026 GhERIG Programme · National Ambulance Service · Ghana
════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

/* ════════════════════════════════════════════════════════════════════
   STATIC CONFIG
════════════════════════════════════════════════════════════════════ */

const CREW = {
  emtA: { name: 'Akosua Mensah',  role: 'EMT-A · Lead',     council: 'NAS-EMT-2021-1847', initials: 'AM' },
  emtB: { name: 'Kwame Sarpong',  role: 'EMT-B · Driver',   council: 'NAS-EMT-2022-2109', initials: 'KS' },
};

// Vehicle the device is bolted to (configured at provisioning time)
const VEHICLE = {
  plate: 'AMB-GR-002',
  type: 'BLS',
  station: 'NAS Tema East',
  district: 'Tema East Municipal',
  region: 'Greater Accra',
};

// Lifecycle states with display labels & expected timestamps
const STATES = [
  { id: 'awaiting',         label: 'Awaiting',          short: 'WAIT',     color: 'ink' },
  { id: 'wheels_rolling',   label: 'Wheels Rolling',    short: 'GO',       color: 'amber' },
  { id: 'on_scene',         label: 'On Scene',          short: 'SCENE',    color: 'copper' },
  { id: 'patient_loaded',   label: 'Patient Loaded',    short: 'LOADED',   color: 'amber' },
  { id: 'arrived_dest',     label: 'Arrived Dest.',     short: 'ARRIVED',  color: 'emerald' },
  { id: 'cleared',          label: 'Cleared',           short: 'CLEAR',    color: 'ink' },
];

// Common interventions — one-tap entries
const INTERVENTION_PRESETS = [
  { id: 'iv_access',     label: 'IV Access',         icon: '💉', category: 'access' },
  { id: 'iv_fluid_500',  label: 'NS 500 mL bolus',   icon: '💧', category: 'fluid' },
  { id: 'iv_fluid_1l',   label: 'NS 1 L bolus',      icon: '💧', category: 'fluid' },
  { id: 'oxygen_nc',     label: 'O₂ Nasal Cannula',  icon: '🫁', category: 'oxygen' },
  { id: 'oxygen_mask',   label: 'O₂ Mask',           icon: '🫁', category: 'oxygen' },
  { id: 'oxygen_nrb',    label: 'O₂ Non-Rebreather', icon: '🫁', category: 'oxygen' },
  { id: 'splint',        label: 'Splint Applied',    icon: '🦴', category: 'trauma' },
  { id: 'c_collar',      label: 'C-Collar Applied',  icon: '🦴', category: 'trauma' },
  { id: 'pressure_dr',   label: 'Pressure Dressing', icon: '🩹', category: 'trauma' },
  { id: 'tourniquet',    label: 'Tourniquet',        icon: '🩹', category: 'trauma' },
  { id: 'drug_morphine', label: 'Morphine 5 mg IV',  icon: '💊', category: 'drug' },
  { id: 'drug_tramadol', label: 'Tramadol 100 mg IV',icon: '💊', category: 'drug' },
  { id: 'drug_adrenal',  label: 'Adrenaline 1 mg IV',icon: '💊', category: 'drug' },
  { id: 'drug_atropine', label: 'Atropine 0.5 mg IV',icon: '💊', category: 'drug' },
  { id: 'drug_dextrose', label: 'Dextrose 50% 50 mL',icon: '💊', category: 'drug' },
  { id: 'cpr',           label: 'CPR Started',       icon: '❤️', category: 'cpr' },
  { id: 'defib',         label: 'Defib Shock',       icon: '⚡', category: 'cpr' },
  { id: 'intubation',    label: 'Intubation',        icon: '🫁', category: 'airway' },
];

const INTERVENTION_CATEGORIES = [
  { id: 'access',  label: 'Access' },
  { id: 'fluid',   label: 'Fluids' },
  { id: 'oxygen',  label: 'Oxygen' },
  { id: 'trauma',  label: 'Trauma' },
  { id: 'drug',    label: 'Drugs'  },
  { id: 'cpr',     label: 'CPR'    },
  { id: 'airway',  label: 'Airway' },
];

/* ════════════════════════════════════════════════════════════════════
   CLINICAL VITALS ENGINE — same as portal/tablet/NECC/ARCS.
   FIFTH user of this engine. One source of truth across GhERIG.
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
   STYLES — touch-first, dark, big buttons, sunlight-readable.
   This is INTENTIONALLY DIFFERENT from the desktop subsystems.
   • Black bg for night-driving + glare reduction
   • Buttons minimum 64px tall (gloves-compatible)
   • Body text 16px (no 11pt anywhere)
   • High contrast everywhere
════════════════════════════════════════════════════════════════════ */

const STYLES = `
:root {
  --emt-bg:#000000;
  --emt-bg-1:#0A0A0A;
  --emt-bg-2:#141414;
  --emt-bg-3:#1F1F1F;
  --emt-line:#2C2C2C;
  --emt-line-strong:#3A3A3A;

  --emt-text:#FFFFFF;
  --emt-text-2:#D4D4D4;
  --emt-text-3:#9A9A9A;
  --emt-text-4:#6E6E6E;

  --emt-action:#E63946;       /* Bright crimson — primary action */
  --emt-action-hi:#FF4D5C;
  --emt-action-pale:#3A1216;

  --emt-go:#10B981;            /* Deep emerald — confirm / wheels-rolling */
  --emt-go-hi:#34D399;
  --emt-go-pale:#0A2E22;

  --emt-warn:#F5B800;          /* Neon yellow — caution / pending */
  --emt-warn-hi:#FFD03A;
  --emt-warn-pale:#3D2D04;

  --emt-info:#3B82F6;          /* Sky blue — info / neutral */
  --emt-info-pale:#0E2447;

  --emt-copper:#D9803A;        /* Carries copper from system — softer here */
  --emt-copper-pale:#3A1F0C;

  --tier-normal:#10B981;
  --tier-borderline:#F5B800;
  --tier-abnormal:#D9803A;
  --tier-critical:#E63946;

  --emt-radius:14px;
  --emt-radius-lg:20px;
  --emt-radius-xl:28px;
  --emt-shadow:0 6px 20px rgba(0,0,0,0.5);
  --emt-shadow-lg:0 12px 32px rgba(0,0,0,0.6);

  --emt-display:'Fraunces','Times New Roman',serif;
  --emt-body:'Inter Tight',-apple-system,system-ui,sans-serif;
  --emt-mono:'JetBrains Mono','SF Mono',Menlo,monospace;
}

.emt *, .emt *::before, .emt *::after { box-sizing:border-box; margin:0; padding:0; -webkit-tap-highlight-color:transparent; }
.emt {
  font-family:var(--emt-body);
  background:var(--emt-bg);
  color:var(--emt-text);
  font-size:16px;
  line-height:1.5;
  -webkit-font-smoothing:antialiased;
  min-height:100vh;
  user-select:none;
  -webkit-user-select:none;
  touch-action:manipulation;
}
.emt button { font-family:inherit; cursor:pointer; border:none; background:none; color:inherit; font-size:inherit; }
.emt button:disabled { opacity:0.35; }
.emt input, .emt select, .emt textarea { font-family:inherit; color:inherit; font-size:inherit; }
.emt ::-webkit-scrollbar { width:6px; height:6px; }
.emt ::-webkit-scrollbar-track { background:transparent; }
.emt ::-webkit-scrollbar-thumb { background:var(--emt-line-strong); border-radius:3px; }

/* ─── SHELL ─── */
.emt-shell { min-height:100vh; display:flex; flex-direction:column; max-width:1100px; margin:0 auto; }

/* ─── TOPBAR ─── */
.emt-topbar {
  position:sticky; top:0; z-index:50;
  height:64px; padding:0 18px;
  background:var(--emt-bg-1);
  border-bottom:1px solid var(--emt-line);
  display:flex; align-items:center; gap:14px;
}
.emt-topbar-mark {
  width:40px; height:40px; border-radius:10px;
  background:var(--emt-action); color:#fff;
  display:flex; align-items:center; justify-content:center;
  font-family:var(--emt-display); font-weight:700; font-size:20px;
  flex-shrink:0;
}
.emt-topbar-id { flex:1; min-width:0; }
.emt-topbar-plate { font-family:var(--emt-mono); font-size:15px; font-weight:700; color:var(--emt-text); letter-spacing:0.04em; }
.emt-topbar-meta { font-family:var(--emt-mono); font-size:11px; color:var(--emt-text-3); margin-top:2px; letter-spacing:0.06em; }

.emt-status-cluster { display:flex; align-items:center; gap:10px; flex-shrink:0; }
.emt-pill {
  display:inline-flex; align-items:center; gap:6px;
  padding:7px 12px; border-radius:18px;
  font-family:var(--emt-mono); font-size:11px; font-weight:700;
  letter-spacing:0.1em; text-transform:uppercase;
  background:var(--emt-bg-3); color:var(--emt-text-2);
  border:1px solid var(--emt-line);
}
.emt-pill.broadcast {
  background:var(--emt-go-pale); color:var(--emt-go); border-color:var(--emt-go);
}
.emt-pill.broadcast .dot { background:var(--emt-go); animation:emt-pulse 1.4s ease-in-out infinite; }
.emt-pill .dot { width:8px; height:8px; border-radius:50%; background:var(--emt-text-3); flex-shrink:0; }
@keyframes emt-pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }

.emt-clock { font-family:var(--emt-mono); font-size:13px; font-weight:600; color:var(--emt-text-2); flex-shrink:0; }

/* ─── BODY ─── */
.emt-body { flex:1; padding:18px; padding-bottom:90px; }
.emt-bottom-bar {
  position:fixed; bottom:0; left:0; right:0; z-index:40;
  max-width:1100px; margin:0 auto;
  background:var(--emt-bg-1); border-top:1px solid var(--emt-line);
  padding:12px 18px; display:flex; gap:10px;
}
.emt-tab {
  flex:1; height:64px;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:3px; border-radius:12px;
  font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase;
  color:var(--emt-text-3); background:transparent;
  border:1px solid transparent;
  transition:all .15s;
}
.emt-tab .icon { font-size:22px; line-height:1; }
.emt-tab:active { background:var(--emt-bg-3); }
.emt-tab.active { color:var(--emt-action); background:var(--emt-action-pale); border-color:var(--emt-action); }
.emt-tab .badge {
  position:absolute; top:8px; right:18%;
  min-width:18px; height:18px; border-radius:9px;
  background:var(--emt-action); color:#fff;
  font-family:var(--emt-mono); font-size:10px; font-weight:700;
  display:flex; align-items:center; justify-content:center;
  padding:0 5px;
}

/* ─── PAGE TITLES (bigger than desktop) ─── */
.emt-page-head { margin-bottom:18px; }
.emt-eyebrow { font-family:var(--emt-mono); font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:var(--emt-copper); margin-bottom:6px; }
.emt-title { font-family:var(--emt-display); font-size:32px; font-weight:500; letter-spacing:-0.025em; line-height:1.05; }
.emt-sub { font-size:14px; color:var(--emt-text-3); margin-top:6px; line-height:1.5; }

/* ─── BIG BUTTONS (the spine of this device) ─── */
.btn-big {
  display:flex; align-items:center; justify-content:center; gap:10px;
  width:100%; min-height:72px; padding:0 20px;
  background:var(--emt-bg-2); color:var(--emt-text);
  border:2px solid var(--emt-line);
  border-radius:var(--emt-radius);
  font-size:18px; font-weight:600;
  transition:transform .08s, background .12s, border-color .12s;
}
.btn-big:active { transform:scale(0.98); }
.btn-big:disabled { opacity:0.3; }
.btn-big.go { background:var(--emt-go); color:#fff; border-color:var(--emt-go); box-shadow:0 4px 14px rgba(16,185,129,0.35); }
.btn-big.action { background:var(--emt-action); color:#fff; border-color:var(--emt-action); box-shadow:0 4px 14px rgba(230,57,70,0.35); }
.btn-big.warn { background:var(--emt-warn); color:#000; border-color:var(--emt-warn); box-shadow:0 4px 14px rgba(245,184,0,0.35); }
.btn-big.info { background:var(--emt-info); color:#fff; border-color:var(--emt-info); }
.btn-big.copper { background:var(--emt-copper); color:#fff; border-color:var(--emt-copper); }
.btn-big.outline { background:transparent; border-color:var(--emt-line-strong); }

.btn-mid {
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  min-height:48px; padding:0 18px;
  background:var(--emt-bg-2); color:var(--emt-text);
  border:1.5px solid var(--emt-line);
  border-radius:10px;
  font-size:14px; font-weight:600;
  transition:transform .08s;
}
.btn-mid:active { transform:scale(0.97); }
.btn-mid.action { background:var(--emt-action); color:#fff; border-color:var(--emt-action); }
.btn-mid.go { background:var(--emt-go); color:#fff; border-color:var(--emt-go); }
.btn-mid.copper { background:var(--emt-copper); color:#fff; border-color:var(--emt-copper); }
.btn-mid.outline { background:transparent; }

/* ─── CARDS ─── */
.card {
  background:var(--emt-bg-1);
  border:1px solid var(--emt-line);
  border-radius:var(--emt-radius-lg);
  padding:18px;
  margin-bottom:16px;
}
.card.lift { box-shadow:var(--emt-shadow); }
.card.glow-action { border-color:var(--emt-action); box-shadow:0 0 0 1px var(--emt-action), var(--emt-shadow-lg); }
.card.glow-go { border-color:var(--emt-go); }
.card.glow-warn { border-color:var(--emt-warn); }

.card-head {
  display:flex; align-items:center; justify-content:space-between;
  padding-bottom:12px; margin-bottom:14px;
  border-bottom:1px solid var(--emt-line);
}
.card-title { font-family:var(--emt-display); font-size:18px; font-weight:600; letter-spacing:-0.015em; }
.card-meta { font-family:var(--emt-mono); font-size:11px; color:var(--emt-text-3); }

/* ─── LOGIN ─── */
.emt-login {
  min-height:100vh;
  background:radial-gradient(ellipse at 50% 30%, #1A0A0C 0%, #000 70%);
  display:flex; align-items:center; justify-content:center;
  padding:24px;
}
.emt-login-card {
  width:100%; max-width:480px;
  background:var(--emt-bg-1);
  border:1px solid var(--emt-line);
  border-radius:var(--emt-radius-xl);
  padding:36px 28px;
  box-shadow:var(--emt-shadow-lg);
}
.emt-login-mark {
  width:80px; height:80px; margin:0 auto 18px;
  background:var(--emt-action); color:#fff;
  border-radius:22px;
  display:flex; align-items:center; justify-content:center;
  font-family:var(--emt-display); font-weight:700; font-size:36px;
  box-shadow:0 8px 20px rgba(230,57,70,0.45);
}
.emt-login-title {
  text-align:center;
  font-family:var(--emt-display); font-size:30px; font-weight:500;
  letter-spacing:-0.025em; margin-bottom:6px;
}
.emt-login-sub {
  text-align:center; font-size:13px; color:var(--emt-text-3);
  margin-bottom:28px;
  font-family:var(--emt-mono); letter-spacing:0.06em;
}

.emt-field { margin-bottom:16px; }
.emt-label {
  display:block;
  font-family:var(--emt-mono); font-size:11px; font-weight:700;
  letter-spacing:0.16em; text-transform:uppercase;
  color:var(--emt-text-3);
  margin-bottom:8px;
}
.emt-input, .emt-select, .emt-textarea {
  width:100%; min-height:56px; padding:0 18px;
  background:var(--emt-bg-2);
  border:1.5px solid var(--emt-line);
  border-radius:12px;
  font-size:18px; color:var(--emt-text);
  outline:none;
  transition:border-color .12s;
}
.emt-textarea { padding:14px 18px; min-height:90px; resize:none; line-height:1.5; }
.emt-input:focus, .emt-select:focus, .emt-textarea:focus { border-color:var(--emt-action); }
.emt-select { appearance:none; background-image:linear-gradient(45deg, transparent 50%, var(--emt-text-3) 50%), linear-gradient(135deg, var(--emt-text-3) 50%, transparent 50%); background-position:calc(100% - 22px) center, calc(100% - 16px) center; background-size:6px 6px; background-repeat:no-repeat; padding-right:40px; }

.crew-pills { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.crew-pill {
  padding:14px;
  background:var(--emt-bg-2);
  border:2px solid var(--emt-line);
  border-radius:12px;
  text-align:left;
  transition:all .12s;
}
.crew-pill:active { transform:scale(0.98); }
.crew-pill.active { border-color:var(--emt-action); background:var(--emt-action-pale); }
.crew-pill .pill-name { font-size:15px; font-weight:600; color:var(--emt-text); }
.crew-pill .pill-role { font-family:var(--emt-mono); font-size:10px; color:var(--emt-text-3); margin-top:3px; letter-spacing:0.06em; }

/* ─── JOB INBOX ─── */
.job-card {
  background:var(--emt-bg-1);
  border:2px solid var(--emt-line);
  border-radius:var(--emt-radius-lg);
  padding:20px;
  margin-bottom:14px;
  position:relative; overflow:hidden;
}
.job-card.priority-critical { border-color:var(--emt-action); }
.job-card.priority-critical::before {
  content:''; position:absolute; left:0; top:0; bottom:0; width:6px;
  background:var(--emt-action);
}
.job-card.priority-high { border-color:var(--emt-warn); }
.job-card.priority-high::before {
  content:''; position:absolute; left:0; top:0; bottom:0; width:6px;
  background:var(--emt-warn);
}

.job-priority-row { display:flex; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
.job-priority-pill {
  display:inline-flex; padding:5px 12px;
  border-radius:14px;
  font-family:var(--emt-mono); font-size:11px; font-weight:800;
  letter-spacing:0.1em; text-transform:uppercase;
}
.job-priority-pill.critical { background:var(--emt-action); color:#fff; }
.job-priority-pill.high { background:var(--emt-warn); color:#000; }
.job-priority-pill.routine { background:var(--emt-go); color:#fff; }
.job-id { font-family:var(--emt-mono); font-size:12px; color:var(--emt-text-3); margin-left:auto; }

.job-condition { font-family:var(--emt-display); font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.15; margin-bottom:4px; }
.job-pat { font-size:14px; color:var(--emt-text-3); margin-bottom:14px; }

.route-block {
  background:var(--emt-bg-2);
  border-radius:12px; padding:14px;
  margin-bottom:14px;
}
.route-row { display:flex; align-items:center; gap:12px; padding:6px 0; }
.route-icon {
  width:28px; height:28px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font-size:12px; font-weight:700;
  flex-shrink:0;
}
.route-icon.from { background:var(--emt-action); color:#fff; }
.route-icon.to { background:var(--emt-go); color:#fff; }
.route-line {
  width:28px; height:24px;
  border-left:2px dashed var(--emt-line-strong);
  margin-left:13px;
}
.route-label { flex:1; min-width:0; }
.route-label .lbl { font-family:var(--emt-mono); font-size:10px; color:var(--emt-text-3); letter-spacing:0.1em; text-transform:uppercase; margin-bottom:2px; }
.route-label .val { font-size:15px; font-weight:600; line-height:1.25; }
.route-label .meta { font-family:var(--emt-mono); font-size:11px; color:var(--emt-text-3); margin-top:2px; }

.job-stats { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:14px; }
.job-stat {
  background:var(--emt-bg-2);
  border-radius:10px; padding:10px 12px;
  text-align:center;
}
.job-stat .v { font-family:var(--emt-display); font-size:20px; font-weight:600; color:var(--emt-text); line-height:1; }
.job-stat .l { font-family:var(--emt-mono); font-size:9.5px; color:var(--emt-text-3); letter-spacing:0.1em; text-transform:uppercase; margin-top:4px; }

.job-summary {
  background:var(--emt-bg-3);
  border-radius:10px; padding:12px;
  font-size:14px; color:var(--emt-text-2); line-height:1.5;
  margin-bottom:14px;
}

.job-actions { display:flex; gap:10px; }

/* ─── ACTIVE JOB / LIFECYCLE STEPPER ─── */
.lifecycle-card { padding:0; overflow:hidden; }
.lifecycle-track {
  display:flex; align-items:stretch;
  background:var(--emt-bg-2);
  padding:14px 12px;
  overflow-x:auto;
  gap:6px;
}
.lifecycle-track::-webkit-scrollbar { display:none; }
.lc-step {
  flex:1; min-width:90px;
  display:flex; flex-direction:column; align-items:center; gap:6px;
  padding:8px 6px;
  border-radius:10px;
  text-align:center;
}
.lc-dot {
  width:34px; height:34px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font-family:var(--emt-mono); font-size:14px; font-weight:700;
  flex-shrink:0;
  border:2px solid var(--emt-line);
  background:var(--emt-bg-1); color:var(--emt-text-3);
}
.lc-dot.done { background:var(--emt-go); color:#fff; border-color:var(--emt-go); }
.lc-dot.current { background:var(--emt-action); color:#fff; border-color:var(--emt-action); box-shadow:0 0 0 4px var(--emt-action-pale); }
.lc-label { font-family:var(--emt-mono); font-size:10px; font-weight:600; letter-spacing:0.06em; line-height:1.15; }
.lc-step.done .lc-label { color:var(--emt-go); }
.lc-step.current .lc-label { color:var(--emt-action); }
.lc-step.pending .lc-label { color:var(--emt-text-4); }
.lc-ts { font-family:var(--emt-mono); font-size:9.5px; color:var(--emt-text-4); margin-top:1px; }

.lifecycle-action { padding:18px; }
.next-action-prompt { font-family:var(--emt-mono); font-size:11px; color:var(--emt-text-3); letter-spacing:0.14em; text-transform:uppercase; margin-bottom:10px; text-align:center; }

/* ─── VITALS ─── */
.vitals-grid { display:grid; grid-template-columns:1fr 1fr 1fr 1fr 1fr; gap:8px; margin-bottom:18px; }
@media (max-width:780px) { .vitals-grid { grid-template-columns:1fr 1fr; } }
.vital-tile {
  background:var(--emt-bg-2);
  border:2px solid var(--emt-line);
  border-radius:14px;
  padding:12px;
  text-align:center;
  min-height:100px;
  display:flex; flex-direction:column; justify-content:center; align-items:center;
}
.vital-tile.tier-normal { border-color:var(--tier-normal); background:rgba(16,185,129,0.08); }
.vital-tile.tier-borderline { border-color:var(--tier-borderline); background:rgba(245,184,0,0.08); }
.vital-tile.tier-abnormal { border-color:var(--tier-abnormal); background:rgba(217,128,58,0.08); }
.vital-tile.tier-critical { border-color:var(--tier-critical); background:rgba(230,57,70,0.12); }
.vital-name { font-family:var(--emt-mono); font-size:10px; font-weight:700; color:var(--emt-text-3); letter-spacing:0.12em; text-transform:uppercase; }
.vital-tile.tier-normal .vital-name { color:var(--tier-normal); }
.vital-tile.tier-borderline .vital-name { color:var(--tier-borderline); }
.vital-tile.tier-abnormal .vital-name { color:var(--tier-abnormal); }
.vital-tile.tier-critical .vital-name { color:var(--tier-critical); }
.vital-val { font-family:var(--emt-display); font-size:30px; font-weight:600; line-height:1; margin-top:6px; letter-spacing:-0.02em; }
.vital-tile.tier-normal .vital-val { color:var(--tier-normal); }
.vital-tile.tier-borderline .vital-val { color:var(--tier-borderline); }
.vital-tile.tier-abnormal .vital-val { color:var(--tier-abnormal); }
.vital-tile.tier-critical .vital-val { color:var(--tier-critical); }
.vital-unit { font-family:var(--emt-mono); font-size:10px; color:var(--emt-text-3); margin-top:4px; }
.vital-empty { color:var(--emt-text-4); font-family:var(--emt-display); font-size:30px; }

.vitals-history { padding:0; overflow:hidden; }
.vitals-row {
  display:grid;
  grid-template-columns:80px 1fr 1fr 1fr 1fr 1fr;
  gap:8px;
  padding:12px 14px;
  border-bottom:1px solid var(--emt-line);
  font-family:var(--emt-mono); font-size:14px;
  align-items:center;
}
.vitals-row:last-child { border-bottom:none; }
.vitals-row.head { background:var(--emt-bg-3); font-size:10px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:var(--emt-text-3); padding:10px 14px; }
.vitals-row .ts { color:var(--emt-text-3); }
.vitals-row .v { font-weight:700; text-align:center; }
.vitals-row .v.t-normal { color:var(--tier-normal); }
.vitals-row .v.t-borderline { color:var(--tier-borderline); }
.vitals-row .v.t-abnormal { color:var(--tier-abnormal); }
.vitals-row .v.t-critical { color:var(--tier-critical); }

/* ─── INTERVENTIONS ─── */
.interv-cat-tabs { display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; margin-bottom:14px; }
.interv-cat-tabs::-webkit-scrollbar { display:none; }
.interv-cat-tab {
  flex-shrink:0;
  padding:10px 18px; min-height:42px;
  border-radius:21px;
  background:var(--emt-bg-2); border:1.5px solid var(--emt-line);
  font-size:14px; font-weight:600;
  color:var(--emt-text-2);
  white-space:nowrap;
}
.interv-cat-tab:active { transform:scale(0.96); }
.interv-cat-tab.active { background:var(--emt-action); color:#fff; border-color:var(--emt-action); }

.interv-grid { display:grid; grid-template-columns:repeat(2, 1fr); gap:10px; }
.interv-tile {
  background:var(--emt-bg-2);
  border:2px solid var(--emt-line);
  border-radius:14px;
  padding:14px;
  display:flex; align-items:center; gap:12px;
  min-height:64px;
  text-align:left;
  transition:all .12s;
}
.interv-tile:active { transform:scale(0.98); background:var(--emt-bg-3); }
.interv-tile .icon { font-size:22px; flex-shrink:0; }
.interv-tile .label { font-size:14px; font-weight:600; line-height:1.2; }

.interv-log {
  display:flex; flex-direction:column; padding:0;
}
.interv-entry {
  display:grid; grid-template-columns:80px 1fr;
  gap:14px;
  padding:14px 16px;
  border-bottom:1px solid var(--emt-line);
  align-items:center;
}
.interv-entry:last-child { border-bottom:none; }
.interv-entry .time { font-family:var(--emt-mono); font-size:12px; color:var(--emt-text-3); }
.interv-entry .what { font-size:14px; font-weight:500; }

/* ─── HANDOFF ─── */
.handoff-summary {
  background:var(--emt-bg-2);
  border-radius:14px; padding:18px;
  margin-bottom:14px;
}
.handoff-row { display:flex; justify-content:space-between; padding:6px 0; font-size:14px; gap:12px; }
.handoff-row .k { font-family:var(--emt-mono); font-size:11px; color:var(--emt-text-3); letter-spacing:0.1em; text-transform:uppercase; flex-shrink:0; }
.handoff-row .v { font-weight:600; text-align:right; }

.signature-pad {
  background:var(--emt-bg-2);
  border:2px dashed var(--emt-line-strong);
  border-radius:14px;
  padding:24px;
  text-align:center;
  margin-bottom:14px;
}
.signature-pad.signed {
  border-style:solid;
  border-color:var(--emt-go);
  background:rgba(16,185,129,0.08);
}
.signature-pad .sig-name { font-family:var(--emt-display); font-size:20px; font-style:italic; color:var(--emt-go); margin-bottom:4px; }
.signature-pad .sig-meta { font-family:var(--emt-mono); font-size:11px; color:var(--emt-text-3); }

/* ─── TOAST ─── */
.emt-toast-host {
  position:fixed; bottom:100px; left:50%; transform:translateX(-50%);
  z-index:200;
  display:flex; flex-direction:column; gap:8px;
  pointer-events:none;
  width:calc(100% - 32px); max-width:520px;
}
.emt-toast {
  background:var(--emt-bg-2);
  border:1.5px solid var(--emt-line);
  border-left-width:4px;
  border-radius:12px;
  padding:14px 18px;
  font-size:15px;
  font-weight:600;
  color:var(--emt-text);
  box-shadow:var(--emt-shadow);
  pointer-events:auto;
  animation:emt-toast-in .25s ease;
}
.emt-toast.success { border-left-color:var(--emt-go); }
.emt-toast.warn { border-left-color:var(--emt-warn); }
.emt-toast.error { border-left-color:var(--emt-action); }
.emt-toast.info { border-left-color:var(--emt-info); }
@keyframes emt-toast-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }

/* ─── MODAL ─── */
.emt-modal-overlay {
  position:fixed; inset:0; z-index:300;
  background:rgba(0,0,0,0.7);
  backdrop-filter:blur(8px);
  display:flex; align-items:flex-end; justify-content:center;
  animation:emt-fade .18s ease;
}
@media (min-width:780px) { .emt-modal-overlay { align-items:center; padding:24px; } }
@keyframes emt-fade { from { opacity:0; } to { opacity:1; } }
.emt-modal {
  width:100%; max-width:540px;
  max-height:92vh; overflow:hidden;
  background:var(--emt-bg-1);
  border:1px solid var(--emt-line);
  border-top-left-radius:24px;
  border-top-right-radius:24px;
  display:flex; flex-direction:column;
  animation:emt-slide-up .25s cubic-bezier(.34,1.4,.64,1);
}
@media (min-width:780px) { .emt-modal { border-radius:24px; } }
@keyframes emt-slide-up { from { transform:translateY(40px); } to { transform:translateY(0); } }
.emt-modal-grip {
  width:48px; height:5px; background:var(--emt-line-strong); border-radius:3px;
  margin:10px auto 0; flex-shrink:0;
}
.emt-modal-head {
  padding:14px 20px 16px;
  border-bottom:1px solid var(--emt-line);
}
.emt-modal-title { font-family:var(--emt-display); font-size:22px; font-weight:600; letter-spacing:-0.02em; }
.emt-modal-sub { font-family:var(--emt-mono); font-size:11px; color:var(--emt-text-3); margin-top:4px; }
.emt-modal-body { padding:20px; overflow-y:auto; flex:1; }
.emt-modal-foot { padding:14px 20px 18px; border-top:1px solid var(--emt-line); display:flex; gap:10px; }

.numpad { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-top:12px; }
.numpad-btn {
  min-height:64px;
  background:var(--emt-bg-2);
  border:1.5px solid var(--emt-line);
  border-radius:12px;
  font-family:var(--emt-mono); font-size:24px; font-weight:700;
  color:var(--emt-text);
}
.numpad-btn:active { background:var(--emt-bg-3); transform:scale(0.97); }
.numpad-btn.action { background:var(--emt-action); color:#fff; border-color:var(--emt-action); }
.numpad-btn.go { background:var(--emt-go); color:#fff; border-color:var(--emt-go); }

.bp-input-row { display:flex; align-items:center; gap:10px; }
.bp-input-row .emt-input { text-align:center; font-family:var(--emt-mono); font-size:28px; font-weight:700; }
.bp-input-row .sep { font-family:var(--emt-display); font-size:32px; color:var(--emt-text-3); }

/* ─── EMPTY STATES ─── */
.emt-empty {
  text-align:center;
  padding:60px 20px;
  color:var(--emt-text-3);
}
.emt-empty .em-icon { font-size:48px; margin-bottom:14px; opacity:0.4; }
.emt-empty .em-title { font-family:var(--emt-display); font-size:22px; font-weight:500; color:var(--emt-text-2); margin-bottom:6px; }
.emt-empty .em-sub { font-size:13px; color:var(--emt-text-4); }
`;
/* ════════════════════════════════════════════════════════════════════
   UTILITIES
════════════════════════════════════════════════════════════════════ */

const minutesAgo = (m) => { const d = new Date(); d.setMinutes(d.getMinutes() - m); return d; };

const fmtTime = (d) => d ? d.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtTimeSec = (d) => d ? d.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const fmtAgo = (d) => {
  if (!d) return '—';
  const diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return diff + 'm ago';
  return Math.floor(diff / 60) + 'h ago';
};

const stateById = (id) => STATES.find(s => s.id === id);
const stateIdx = (id) => STATES.findIndex(s => s.id === id);
const nextStateOf = (id) => {
  const i = stateIdx(id);
  return i >= 0 && i < STATES.length - 1 ? STATES[i + 1].id : null;
};

/* ════════════════════════════════════════════════════════════════════
   SEED — incoming dispatch from ARCS
   In production this is hydrated from the ARCS dispatch envelope.
════════════════════════════════════════════════════════════════════ */

const seedIncomingJob = () => ({
  id: 'DSP-2026-3041',
  priority: 'critical',
  type: 'NECC bed-search route',
  neccRefId: 'REF-2026-2041',
  condition: 'Acute coronary syndrome',
  patientInitials: 'KA',
  patientAge: 59,
  patientSex: 'M',
  patientCategory: 'Adult',
  stability: 'Critical',
  fromFacility: 'Tema General Hospital',
  fromAddress: 'Hospital Rd, Tema, Greater Accra',
  toFacility: 'Korle-Bu Teaching Hospital',
  toAddress: 'Guggisberg Ave, Accra, Greater Accra',
  toUnit: 'Cardiac Cath Lab · Bay 2',
  distanceKm: 26,
  etaInitial: 28,
  initialVitals: { sbp: 222, dbp: 174, hr: 135, rr: 36, spo2: 89, gcs: 14 },
  summary: 'STEMI confirmed at Tema. ECG: ST elevation V2-V4. Troponin pending. GTN started, dual antiplatelet given. Pre-alerted KBTH cath lab.',
  receivedAt: minutesAgo(2),
});

// Pre-loaded vitals history (initial vitals from referring facility transferred via ARCS)
const seedVitalsHistory = (initial) => ([
  { ts: minutesAgo(2), source: 'pre-dispatch', sbp: initial.sbp, dbp: initial.dbp, hr: initial.hr, rr: initial.rr, spo2: initial.spo2, gcs: initial.gcs },
]);

/* ════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════════════ */

const loadFonts = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById('emt-fonts')) return;
  const link = document.createElement('link');
  link.id = 'emt-fonts'; link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter+Tight:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap';
  document.head.appendChild(link);
};

export default function EmtDevice() {
  // Auth
  const [authed, setAuthed] = useState(false);
  const [crewLead, setCrewLead] = useState('emtA');
  const lead = CREW[crewLead];

  // Active job state
  const [job, setJob] = useState(seedIncomingJob);
  const [jobAccepted, setJobAccepted] = useState(false);
  const [jobState, setJobState] = useState('awaiting');
  const [stateTimestamps, setStateTimestamps] = useState({
    awaiting: new Date(),
    wheels_rolling: null,
    on_scene: null,
    patient_loaded: null,
    arrived_dest: null,
    cleared: null,
  });

  // Vitals
  const [vitalsHistory, setVitalsHistory] = useState(() => seedVitalsHistory(job.initialVitals));
  const [vitalsModal, setVitalsModal] = useState(null);  // null | which vital being edited

  // Interventions
  const [interventions, setInterventions] = useState([]);
  const [intervCategory, setIntervCategory] = useState('access');

  // Handoff
  const [handoffSigned, setHandoffSigned] = useState(false);
  const [destinationNotified, setDestinationNotified] = useState(false);

  // GPS broadcast
  const [gpsActive, setGpsActive] = useState(false);
  const [lastPing, setLastPing] = useState(null);
  const [pingCount, setPingCount] = useState(0);

  // UI
  const [tab, setTab] = useState('job');  // job | vitals | interv | handoff
  const [toasts, setToasts] = useState([]);
  const [clock, setClock] = useState(new Date());
  const [, forceTick] = useState(0);

  // Setup
  useEffect(() => { loadFonts(); }, []);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('emt-styles')) return;
    const tag = document.createElement('style');
    tag.id = 'emt-styles';
    tag.textContent = STYLES;
    document.head.appendChild(tag);
  }, []);

  // Toast
  const toast = useCallback((text, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, text, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);

  // Login
  const doLogin = () => {
    setAuthed(true);
    toast('Welcome, ' + lead.name.split(' ')[0] + '. Vehicle ready.', 'success');
  };

  const doLogout = () => {
    setAuthed(false);
    setJobAccepted(false);
    setJobState('awaiting');
    setGpsActive(false);
    setHandoffSigned(false);
    setDestinationNotified(false);
    setInterventions([]);
    setVitalsHistory(seedVitalsHistory(job.initialVitals));
    setStateTimestamps({ awaiting: new Date(), wheels_rolling: null, on_scene: null, patient_loaded: null, arrived_dest: null, cleared: null });
    setTab('job');
  };

  // Clock
  useEffect(() => {
    const t = setInterval(() => { setClock(new Date()); forceTick(x => x + 1); }, 1000);
    return () => clearInterval(t);
  }, []);

  // GPS broadcast simulation — fires every 15s while gpsActive
  useEffect(() => {
    if (!gpsActive) return;
    const broadcast = () => {
      setLastPing(new Date());
      setPingCount(c => c + 1);
    };
    broadcast();  // immediate first ping
    const t = setInterval(broadcast, 15000);
    return () => clearInterval(t);
  }, [gpsActive]);

  // ─────────────────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────────────────

  const handleAcceptJob = () => {
    setJobAccepted(true);
    toast('Job accepted. Tap WHEELS ROLLING when ready.', 'success');
  };

  const handleAdvanceState = (next) => {
    if (!next) return;
    setJobState(next);
    setStateTimestamps(prev => ({ ...prev, [next]: new Date() }));
    if (next === 'wheels_rolling') {
      setGpsActive(true);
      toast('🚑 Wheels rolling. GPS broadcasting.', 'success');
    } else if (next === 'on_scene') {
      toast('On scene. Begin patient assessment.', 'info');
    } else if (next === 'patient_loaded') {
      toast('Patient loaded. Begin transit.', 'info');
    } else if (next === 'arrived_dest') {
      toast('Arrived at destination. Hand off when ready.', 'success');
    } else if (next === 'cleared') {
      setGpsActive(false);
      toast('Job cleared. Ready for next dispatch.', 'success');
    }
  };

  const handleAddVitals = (newVitals) => {
    setVitalsHistory(prev => [...prev, { ts: new Date(), source: 'in-vehicle', ...newVitals }]);
    toast('Vitals recorded', 'success');
  };

  const handleAddIntervention = (presetId, dose) => {
    const preset = INTERVENTION_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    setInterventions(prev => [...prev, { ts: new Date(), presetId, label: preset.label, icon: preset.icon, category: preset.category, dose }]);
    toast(preset.label + ' logged', 'success');
  };

  const handleRemoveIntervention = (idx) => {
    setInterventions(prev => prev.filter((_, i) => i !== idx));
    toast('Removed from log', 'info');
  };

  const handleNotifyDestination = () => {
    setDestinationNotified(true);
    toast('📡 Pre-arrival notification sent to ' + job.toFacility, 'success');
  };

  const handleSignOff = () => {
    setHandoffSigned(true);
    toast('Handoff signed. Run record sealed.', 'success');
  };

  // Latest vitals (most recent reading)
  const latestVitals = vitalsHistory[vitalsHistory.length - 1] || {};

  // Continued in next part
  /* ──────────────────────────────────────────────────────────────────
     RENDER: LOGIN
  ────────────────────────────────────────────────────────────────── */
  if (!authed) {
    return (
      <div className="emt">
        <div className="emt-login">
          <div className="emt-login-card">
            <div className="emt-login-mark">A</div>
            <div className="emt-login-title">ARCS Crew</div>
            <div className="emt-login-sub">In-Vehicle Tablet · {VEHICLE.plate}</div>

            <div className="emt-field">
              <label className="emt-label">Crew lead on duty</label>
              <div className="crew-pills">
                {Object.entries(CREW).map(([key, c]) => (
                  <button
                    key={key}
                    type="button"
                    className={'crew-pill ' + (key === crewLead ? 'active' : '')}
                    onClick={() => setCrewLead(key)}
                  >
                    <div className="pill-name">{c.name}</div>
                    <div className="pill-role">{c.role}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="emt-field">
              <label className="emt-label">Council #</label>
              <input className="emt-input" defaultValue={lead.council} readOnly />
            </div>

            <div className="emt-field">
              <label className="emt-label">PIN</label>
              <input className="emt-input" type="password" defaultValue="●●●●" />
            </div>

            <button type="button" className="btn-big action" onClick={doLogin} style={{ marginTop: 18 }}>
              <span>🚑</span> Begin shift
            </button>

            <div style={{ textAlign: 'center', marginTop: 20, fontFamily: 'var(--emt-mono)', fontSize: 11, color: 'var(--emt-text-4)', letterSpacing: '0.1em' }}>
              {VEHICLE.station.toUpperCase()} · {VEHICLE.region.toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ──────────────────────────────────────────────────────────────────
     RENDER: APP SHELL
  ────────────────────────────────────────────────────────────────── */
  return (
    <div className="emt">
      <div className="emt-shell">
        {/* TOPBAR */}
        <div className="emt-topbar">
          <div className="emt-topbar-mark">A</div>
          <div className="emt-topbar-id">
            <div className="emt-topbar-plate">{VEHICLE.plate}</div>
            <div className="emt-topbar-meta">{lead.initials} · {VEHICLE.station} · {VEHICLE.region}</div>
          </div>
          <div className="emt-status-cluster">
            {gpsActive ? (
              <span className="emt-pill broadcast">
                <span className="dot" />
                GPS · {pingCount}
              </span>
            ) : (
              <span className="emt-pill">
                <span className="dot" />
                STANDBY
              </span>
            )}
            <span className="emt-clock">{fmtTimeSec(clock)}</span>
          </div>
        </div>

        {/* BODY */}
        <div className="emt-body">
          {tab === 'job' && (
            !jobAccepted
              ? <JobInboxView job={job} onAccept={handleAcceptJob} />
              : <ActiveJobView job={job} jobState={jobState} stateTimestamps={stateTimestamps}
                  onAdvance={(next) => handleAdvanceState(next)}
                  gpsActive={gpsActive} lastPing={lastPing} pingCount={pingCount}
                  onLogout={doLogout} onSignOff={handleSignOff} handoffSigned={handoffSigned}
                  destinationNotified={destinationNotified} onNotifyDest={handleNotifyDestination}
                  vitalsHistory={vitalsHistory}
                  interventions={interventions} setTab={setTab} />
          )}
          {tab === 'vitals' && (
            <VitalsView job={job} vitalsHistory={vitalsHistory} onCapture={() => setVitalsModal(true)} latestVitals={latestVitals} />
          )}
          {tab === 'interv' && (
            <InterventionsView interventions={interventions} category={intervCategory} setCategory={setIntervCategory}
              onAdd={handleAddIntervention} onRemove={handleRemoveIntervention} />
          )}
          {tab === 'handoff' && (
            <HandoffView job={job} jobState={jobState} stateTimestamps={stateTimestamps}
              vitalsHistory={vitalsHistory} interventions={interventions}
              destinationNotified={destinationNotified} onNotifyDest={handleNotifyDestination}
              handoffSigned={handoffSigned} onSign={handleSignOff} crewLead={lead} />
          )}
        </div>

        {/* BOTTOM TAB BAR */}
        {jobAccepted && (
          <div className="emt-bottom-bar">
            <button type="button" className={'emt-tab ' + (tab === 'job' ? 'active' : '')} onClick={() => setTab('job')} style={{ position: 'relative' }}>
              <div className="icon">🚑</div>
              <div>Job</div>
            </button>
            <button type="button" className={'emt-tab ' + (tab === 'vitals' ? 'active' : '')} onClick={() => setTab('vitals')} style={{ position: 'relative' }}>
              <div className="icon">💓</div>
              <div>Vitals</div>
              {vitalsHistory.length > 0 && <span className="badge">{vitalsHistory.length}</span>}
            </button>
            <button type="button" className={'emt-tab ' + (tab === 'interv' ? 'active' : '')} onClick={() => setTab('interv')} style={{ position: 'relative' }}>
              <div className="icon">💊</div>
              <div>Care</div>
              {interventions.length > 0 && <span className="badge">{interventions.length}</span>}
            </button>
            <button type="button" className={'emt-tab ' + (tab === 'handoff' ? 'active' : '')} onClick={() => setTab('handoff')} style={{ position: 'relative' }}>
              <div className="icon">📋</div>
              <div>Handoff</div>
            </button>
          </div>
        )}

        {/* TOAST */}
        <div className="emt-toast-host">
          {toasts.map(t => (
            <div key={t.id} className={'emt-toast ' + t.type}>{t.text}</div>
          ))}
        </div>

        {/* VITALS CAPTURE MODAL */}
        {vitalsModal && (
          <VitalsCaptureModal
            job={job}
            latestVitals={latestVitals}
            onClose={() => setVitalsModal(null)}
            onSave={(vs) => { handleAddVitals(vs); setVitalsModal(null); }}
          />
        )}
      </div>
    </div>
  );
}
/* ════════════════════════════════════════════════════════════════════
   JOB INBOX — incoming dispatch from ARCS, big ACCEPT button
════════════════════════════════════════════════════════════════════ */
function JobInboxView({ job, onAccept }) {
  return (
    <div>
      <div className="emt-page-head">
        <div className="emt-eyebrow">Incoming dispatch · From ARCS</div>
        <h1 className="emt-title">New Job</h1>
        <p className="emt-sub">Received {fmtAgo(job.receivedAt)} · {job.type}</p>
      </div>

      <div className={'job-card priority-' + job.priority}>
        <div className="job-priority-row">
          <span className={'job-priority-pill ' + job.priority}>
            {job.priority === 'critical' ? '⚠ CRITICAL' : job.priority === 'high' ? 'HIGH' : 'ROUTINE'}
          </span>
          <span style={{ fontFamily: 'var(--emt-mono)', fontSize: 11, color: 'var(--emt-text-3)' }}>
            NECC ref · {job.neccRefId}
          </span>
          <span className="job-id">{job.id}</span>
        </div>

        <div className="job-condition">{job.condition}</div>
        <div className="job-pat">{job.patientInitials} · {job.patientAge}{job.patientSex} · {job.patientCategory} · {job.stability}</div>

        <div className="route-block">
          <div className="route-row">
            <div className="route-icon from">A</div>
            <div className="route-label">
              <div className="lbl">Pickup</div>
              <div className="val">{job.fromFacility}</div>
              <div className="meta">{job.fromAddress}</div>
            </div>
          </div>
          <div className="route-line" />
          <div className="route-row">
            <div className="route-icon to">B</div>
            <div className="route-label">
              <div className="lbl">Destination</div>
              <div className="val">{job.toFacility}</div>
              <div className="meta">{job.toUnit} · {job.toAddress}</div>
            </div>
          </div>
        </div>

        <div className="job-stats">
          <div className="job-stat">
            <div className="v">{job.distanceKm}</div>
            <div className="l">km</div>
          </div>
          <div className="job-stat">
            <div className="v">{job.etaInitial}</div>
            <div className="l">min · ETA</div>
          </div>
          <div className="job-stat">
            <div className="v" style={{ fontSize: 16, color: 'var(--emt-action)' }}>STEMI</div>
            <div className="l">flag</div>
          </div>
        </div>

        <div className="job-summary">
          <div style={{ fontFamily: 'var(--emt-mono)', fontSize: 11, color: 'var(--emt-text-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Summary from referring facility</div>
          {job.summary}
        </div>

        <div className="job-actions">
          <button type="button" className="btn-big go" onClick={onAccept}>
            <span style={{ fontSize: 22 }}>✓</span>
            Accept Job
          </button>
        </div>
      </div>

      <div style={{ marginTop: 20, padding: 16, background: 'var(--emt-bg-1)', border: '1px solid var(--emt-line)', borderRadius: 14, fontSize: 12, color: 'var(--emt-text-3)', lineHeight: 1.5 }}>
        <div style={{ fontFamily: 'var(--emt-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--emt-text-3)', marginBottom: 6 }}>What happens after accept</div>
        Accepting reports back to ARCS dispatch and moves the job to your active workspace. Tap <b style={{ color: 'var(--emt-go)' }}>WHEELS ROLLING</b> when you start the engine. GPS broadcasting will begin automatically.
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ACTIVE JOB — lifecycle stepper, the spine of the device
════════════════════════════════════════════════════════════════════ */
function ActiveJobView({ job, jobState, stateTimestamps, onAdvance, gpsActive, lastPing, pingCount, onLogout, onSignOff, handoffSigned, destinationNotified, onNotifyDest, vitalsHistory, interventions, setTab }) {
  const currentIdx = stateIdx(jobState);
  const nextId = nextStateOf(jobState);
  const nextState = nextId ? stateById(nextId) : null;

  // Big action button label per current state
  const nextActionLabel = (() => {
    if (jobState === 'awaiting') return { label: 'WHEELS ROLLING', sub: 'Begin transit · GPS will activate', cls: 'go', icon: '🚑' };
    if (jobState === 'wheels_rolling') return { label: 'ON SCENE', sub: 'Arrived at pickup', cls: 'copper', icon: '📍' };
    if (jobState === 'on_scene') return { label: 'PATIENT LOADED', sub: 'Ready to depart for destination', cls: 'warn', icon: '🚑' };
    if (jobState === 'patient_loaded') return { label: 'ARRIVED DESTINATION', sub: 'At receiving facility', cls: 'go', icon: '🏥' };
    if (jobState === 'arrived_dest') return { label: 'CLEAR JOB', sub: 'Handoff complete · ready for next', cls: 'action', icon: '✓' };
    return null;
  })();

  return (
    <div>
      <div className="emt-page-head">
        <div className="emt-eyebrow">{job.priority.toUpperCase()} · {job.condition}</div>
        <h1 className="emt-title">Active Job</h1>
        <p className="emt-sub">{job.fromFacility} → {job.toFacility} · {job.distanceKm} km</p>
      </div>

      {/* PATIENT QUICK CARD */}
      <div className="card lift">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div>
            <div style={{ fontFamily: 'var(--emt-display)', fontSize: 22, fontWeight: 600 }}>
              {job.patientInitials} · {job.patientAge}{job.patientSex}
            </div>
            <div style={{ fontSize: 13, color: 'var(--emt-text-3)', marginTop: 4 }}>
              {job.patientCategory} · {job.stability}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--emt-action)', marginTop: 8 }}>
              {job.condition}
            </div>
          </div>
          <span className={'job-priority-pill ' + job.priority} style={{ flexShrink: 0 }}>
            {job.priority === 'critical' ? '⚠ CRIT' : job.priority.toUpperCase()}
          </span>
        </div>
      </div>

      {/* LIFECYCLE STEPPER */}
      <div className="card lifecycle-card">
        <div className="lifecycle-track">
          {STATES.map((s, i) => {
            const status = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'pending';
            const ts = stateTimestamps[s.id];
            return (
              <div key={s.id} className={'lc-step ' + status}>
                <div className={'lc-dot ' + status}>{i + 1}</div>
                <div className="lc-label">{s.short}</div>
                <div className="lc-ts">{ts ? fmtTime(ts) : '—'}</div>
              </div>
            );
          })}
        </div>
        {nextActionLabel && (
          <div className="lifecycle-action">
            <div className="next-action-prompt">Next step</div>
            <button type="button" className={'btn-big ' + nextActionLabel.cls} onClick={() => onAdvance(nextId)}>
              <span style={{ fontSize: 22 }}>{nextActionLabel.icon}</span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                <span style={{ fontWeight: 700, letterSpacing: '0.04em' }}>{nextActionLabel.label}</span>
                <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.85 }}>{nextActionLabel.sub}</span>
              </div>
            </button>
          </div>
        )}
        {jobState === 'cleared' && (
          <div className="lifecycle-action">
            <div className="emt-empty" style={{ padding: 20 }}>
              <div className="em-icon">✓</div>
              <div className="em-title">Job complete</div>
              <div className="em-sub">Run record sealed · Vehicle returning to station</div>
            </div>
            <button type="button" className="btn-big outline" onClick={onLogout}>End shift</button>
          </div>
        )}
      </div>

      {/* GPS STATUS CARD */}
      {gpsActive && (
        <div className="card glow-go">
          <div className="card-head" style={{ paddingBottom: 0, marginBottom: 0, borderBottom: 'none' }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 12, height: 12, background: 'var(--emt-go)', borderRadius: '50%', animation: 'emt-pulse 1.4s ease-in-out infinite' }} />
              GPS broadcasting
            </div>
            <div className="card-meta">{pingCount} ping{pingCount === 1 ? '' : 's'} · last {fmtTimeSec(lastPing)}</div>
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--emt-text-3)' }}>
            Position relayed to ARCS dispatch every 15 seconds. Receiving facility can see live ETA on their portal.
          </div>
        </div>
      )}

      {/* ROUTE CARD */}
      <div className="card">
        <div className="route-block" style={{ background: 'transparent', padding: 0 }}>
          <div className="route-row">
            <div className="route-icon from">A</div>
            <div className="route-label">
              <div className="lbl">Pickup</div>
              <div className="val">{job.fromFacility}</div>
              <div className="meta">{job.fromAddress}</div>
            </div>
          </div>
          <div className="route-line" />
          <div className="route-row">
            <div className="route-icon to">B</div>
            <div className="route-label">
              <div className="lbl">Destination · {job.toUnit}</div>
              <div className="val">{job.toFacility}</div>
              <div className="meta">{job.toAddress}</div>
            </div>
          </div>
        </div>
      </div>

      {/* PROGRESS QUICK STATS */}
      <div className="job-stats">
        <div className="job-stat">
          <div className="v">{vitalsHistory.length}</div>
          <div className="l">vitals logged</div>
        </div>
        <div className="job-stat">
          <div className="v">{interventions.length}</div>
          <div className="l">interventions</div>
        </div>
        <div className="job-stat">
          <div className="v">{handoffSigned ? '✓' : '–'}</div>
          <div className="l">handoff</div>
        </div>
      </div>

      {/* PRE-ARRIVAL NOTIFY */}
      {(jobState === 'patient_loaded' || jobState === 'en_route_dest') && !destinationNotified && (
        <div className="card glow-warn">
          <div style={{ fontFamily: 'var(--emt-mono)', fontSize: 11, color: 'var(--emt-warn)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>Pre-arrival notification</div>
          <div style={{ fontSize: 14, color: 'var(--emt-text-2)', marginBottom: 14, lineHeight: 1.5 }}>
            Send latest vitals + ETA to {job.toFacility} so the receiving team can prepare before you arrive.
          </div>
          <button type="button" className="btn-big warn" onClick={onNotifyDest}>
            <span style={{ fontSize: 20 }}>📡</span>
            Notify destination
          </button>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   VITALS — current readings + history + capture trigger
════════════════════════════════════════════════════════════════════ */
function VitalsView({ job, vitalsHistory, onCapture, latestVitals }) {
  const assess = useMemo(() => {
    if (!latestVitals.sbp) return null;
    return assessVitals(latestVitals, job.patientAge, job.patientCategory);
  }, [latestVitals, job]);

  const tier = (key) => assess && assess.perVital[key] ? assess.perVital[key].tier : null;

  const VitalTile = ({ name, val, unit, tierKey }) => {
    const t = tier(tierKey);
    return (
      <div className={'vital-tile ' + (t ? 'tier-' + t : '')}>
        <div className="vital-name">{name}</div>
        {val != null
          ? <div className="vital-val">{val}</div>
          : <div className="vital-empty">—</div>}
        <div className="vital-unit">{unit}</div>
      </div>
    );
  };

  return (
    <div>
      <div className="emt-page-head">
        <div className="emt-eyebrow">Patient · {job.patientInitials} · {job.patientAge}{job.patientSex}</div>
        <h1 className="emt-title">Vitals</h1>
        <p className="emt-sub">
          {vitalsHistory.length} reading{vitalsHistory.length === 1 ? '' : 's'} logged ·
          Last {vitalsHistory.length > 0 ? fmtAgo(vitalsHistory[vitalsHistory.length - 1].ts) : '—'}
        </p>
      </div>

      {/* CURRENT */}
      <div style={{ fontFamily: 'var(--emt-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--emt-text-3)', marginBottom: 10 }}>
        Current readings · engine-assessed
      </div>
      <div className="vitals-grid">
        <VitalTile name="BP" val={latestVitals.sbp != null ? latestVitals.sbp + '/' + latestVitals.dbp : null} unit="mmHg" tierKey="sbp" />
        <VitalTile name="HR" val={latestVitals.hr} unit="bpm" tierKey="hr" />
        <VitalTile name="RR" val={latestVitals.rr} unit="/min" tierKey="rr" />
        <VitalTile name="SpO₂" val={latestVitals.spo2} unit="%" tierKey="spo2" />
        <VitalTile name="GCS" val={latestVitals.gcs} unit="/15" tierKey="gcs" />
      </div>

      <button type="button" className="btn-big action" onClick={onCapture} style={{ marginBottom: 18 }}>
        <span style={{ fontSize: 22 }}>+</span>
        Record new vitals
      </button>

      {/* HISTORY */}
      {vitalsHistory.length > 0 && (
        <div className="card vitals-history">
          <div className="vitals-row head">
            <div>Time</div>
            <div className="v">BP</div>
            <div className="v">HR</div>
            <div className="v">RR</div>
            <div className="v">SpO₂</div>
            <div className="v">GCS</div>
          </div>
          {[...vitalsHistory].reverse().map((v, i) => {
            const a = assessVitals(v, job.patientAge, job.patientCategory);
            const tcls = (k) => a && a.perVital[k] ? 't-' + a.perVital[k].tier : '';
            return (
              <div key={i} className="vitals-row">
                <div className="ts">{fmtTime(v.ts)}</div>
                <div className={'v ' + tcls('sbp')}>{v.sbp != null ? v.sbp + '/' + v.dbp : '—'}</div>
                <div className={'v ' + tcls('hr')}>{v.hr ?? '—'}</div>
                <div className={'v ' + tcls('rr')}>{v.rr ?? '—'}</div>
                <div className={'v ' + tcls('spo2')}>{v.spo2 ?? '—'}</div>
                <div className={'v ' + tcls('gcs')}>{v.gcs ?? '—'}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
/* ════════════════════════════════════════════════════════════════════
   INTERVENTIONS — one-tap care log
════════════════════════════════════════════════════════════════════ */
function InterventionsView({ interventions, category, setCategory, onAdd, onRemove }) {
  const filteredPresets = INTERVENTION_PRESETS.filter(p => p.category === category);

  return (
    <div>
      <div className="emt-page-head">
        <div className="emt-eyebrow">In-vehicle care log</div>
        <h1 className="emt-title">Interventions</h1>
        <p className="emt-sub">Tap to add. Each entry is timestamped and signed by you. Builds the e-PCR for handoff.</p>
      </div>

      {/* CATEGORY TABS */}
      <div className="interv-cat-tabs">
        {INTERVENTION_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            type="button"
            className={'interv-cat-tab ' + (category === cat.id ? 'active' : '')}
            onClick={() => setCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* PRESET GRID */}
      <div className="interv-grid" style={{ marginBottom: 22 }}>
        {filteredPresets.map(p => (
          <button
            key={p.id}
            type="button"
            className="interv-tile"
            onClick={() => onAdd(p.id)}
          >
            <div className="icon">{p.icon}</div>
            <div className="label">{p.label}</div>
          </button>
        ))}
      </div>

      {/* LOG */}
      <div style={{ fontFamily: 'var(--emt-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--emt-text-3)', marginBottom: 10 }}>
        Care log · {interventions.length} entr{interventions.length === 1 ? 'y' : 'ies'}
      </div>
      {interventions.length === 0 ? (
        <div className="emt-empty">
          <div className="em-icon">💊</div>
          <div className="em-title">No interventions yet</div>
          <div className="em-sub">Tap any tile above to log it</div>
        </div>
      ) : (
        <div className="card interv-log">
          {[...interventions].reverse().map((iv, idx) => {
            const realIdx = interventions.length - 1 - idx;
            return (
              <div key={realIdx} className="interv-entry">
                <div className="time">{fmtTime(iv.ts)}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{iv.icon}</span>
                    <div className="what">{iv.label}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(realIdx)}
                    style={{ minWidth: 44, minHeight: 44, color: 'var(--emt-text-3)', fontSize: 16 }}
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   HANDOFF — pre-arrival + e-PCR sign-off
════════════════════════════════════════════════════════════════════ */
function HandoffView({ job, jobState, stateTimestamps, vitalsHistory, interventions, destinationNotified, onNotifyDest, handoffSigned, onSign, crewLead }) {
  const totalTime = (() => {
    const start = stateTimestamps.wheels_rolling;
    const end = stateTimestamps.arrived_dest || new Date();
    if (!start) return null;
    return Math.round((end - start) / 60000);
  })();

  const onSceneTime = (() => {
    const start = stateTimestamps.on_scene;
    const end = stateTimestamps.patient_loaded;
    if (!start || !end) return null;
    return Math.round((end - start) / 60000);
  })();

  return (
    <div>
      <div className="emt-page-head">
        <div className="emt-eyebrow">Handoff · e-PCR · MoH-grade</div>
        <h1 className="emt-title">Patient Handoff</h1>
        <p className="emt-sub">Pre-arrival notification, run summary, and signed handoff to receiving facility.</p>
      </div>

      {/* PRE-ARRIVAL NOTIFICATION */}
      {!destinationNotified ? (
        <div className="card glow-warn">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div className="card-title">📡 Pre-arrival notification</div>
            <span className="emt-pill">PENDING</span>
          </div>
          <div style={{ fontSize: 14, color: 'var(--emt-text-2)', marginBottom: 14, lineHeight: 1.5 }}>
            Send latest vitals and ETA to {job.toFacility}. The receiving team prepares the cath lab before you arrive — saves 5–10 minutes door-to-balloon.
          </div>
          <button type="button" className="btn-big warn" onClick={onNotifyDest}>
            <span style={{ fontSize: 20 }}>📡</span> Notify {job.toFacility.split(' ').slice(0, 2).join(' ')}
          </button>
        </div>
      ) : (
        <div className="card glow-go">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title" style={{ color: 'var(--emt-go)' }}>✓ Pre-arrival sent</div>
            <span className="emt-pill broadcast"><span className="dot" />DELIVERED</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--emt-text-3)', marginTop: 8 }}>
            Latest vitals + ETA shared with {job.toFacility}. Receiving team alerted.
          </div>
        </div>
      )}

      {/* RUN SUMMARY */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Run Summary</div>
          <div className="card-meta">{job.id}</div>
        </div>
        <div className="handoff-summary" style={{ background: 'transparent', padding: 0 }}>
          <div className="handoff-row"><span className="k">Patient</span><span className="v">{job.patientInitials} · {job.patientAge}{job.patientSex} · {job.patientCategory}</span></div>
          <div className="handoff-row"><span className="k">Condition</span><span className="v" style={{ color: 'var(--emt-action)' }}>{job.condition}</span></div>
          <div className="handoff-row"><span className="k">Stability</span><span className="v">{job.stability}</span></div>
          <div className="handoff-row"><span className="k">From</span><span className="v" style={{ fontSize: 13 }}>{job.fromFacility}</span></div>
          <div className="handoff-row"><span className="k">To</span><span className="v" style={{ fontSize: 13 }}>{job.toFacility}</span></div>
          <div className="handoff-row"><span className="k">Vehicle</span><span className="v">{VEHICLE.plate} · {VEHICLE.type}</span></div>
          <div className="handoff-row"><span className="k">Crew</span><span className="v">{crewLead.name}</span></div>
          {stateTimestamps.wheels_rolling && (
            <div className="handoff-row"><span className="k">Departed</span><span className="v">{fmtTime(stateTimestamps.wheels_rolling)}</span></div>
          )}
          {stateTimestamps.on_scene && (
            <div className="handoff-row"><span className="k">On scene</span><span className="v">{fmtTime(stateTimestamps.on_scene)}</span></div>
          )}
          {stateTimestamps.patient_loaded && (
            <div className="handoff-row"><span className="k">Loaded</span><span className="v">{fmtTime(stateTimestamps.patient_loaded)}</span></div>
          )}
          {stateTimestamps.arrived_dest && (
            <div className="handoff-row"><span className="k">Arrived</span><span className="v">{fmtTime(stateTimestamps.arrived_dest)}</span></div>
          )}
          {totalTime != null && (
            <div className="handoff-row"><span className="k">Total time</span><span className="v" style={{ color: 'var(--emt-go)' }}>{totalTime} min</span></div>
          )}
          {onSceneTime != null && (
            <div className="handoff-row"><span className="k">On-scene time</span><span className="v">{onSceneTime} min</span></div>
          )}
          <div className="handoff-row"><span className="k">Vitals captured</span><span className="v">{vitalsHistory.length} reading{vitalsHistory.length === 1 ? '' : 's'}</span></div>
          <div className="handoff-row"><span className="k">Interventions</span><span className="v">{interventions.length}</span></div>
        </div>
      </div>

      {/* INTERVENTIONS RECAP */}
      {interventions.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Interventions delivered</div>
            <div className="card-meta">{interventions.length} entr{interventions.length === 1 ? 'y' : 'ies'}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {interventions.map((iv, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < interventions.length - 1 ? '1px solid var(--emt-line)' : 'none', fontSize: 14 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{iv.icon}</span>
                  <span style={{ fontWeight: 500 }}>{iv.label}</span>
                </span>
                <span style={{ fontFamily: 'var(--emt-mono)', fontSize: 12, color: 'var(--emt-text-3)' }}>{fmtTime(iv.ts)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SIGN-OFF */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Crew sign-off</div>
          <div className="card-meta">{handoffSigned ? 'SEALED' : 'PENDING'}</div>
        </div>
        <div className={'signature-pad ' + (handoffSigned ? 'signed' : '')}>
          {handoffSigned ? (
            <>
              <div className="sig-name">{crewLead.name}</div>
              <div className="sig-meta">{crewLead.role} · {crewLead.council}</div>
              <div className="sig-meta" style={{ marginTop: 4 }}>Signed {fmtTimeSec(new Date())} · Vehicle {VEHICLE.plate}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, color: 'var(--emt-text-3)', marginBottom: 10 }}>Tap to sign and seal the run record.</div>
              <div style={{ fontFamily: 'var(--emt-mono)', fontSize: 11, color: 'var(--emt-text-4)', letterSpacing: '0.1em' }}>
                {crewLead.name.toUpperCase()} · {crewLead.council}
              </div>
            </>
          )}
        </div>
        {!handoffSigned && (
          <button type="button" className="btn-big go" onClick={onSign} disabled={jobState !== 'arrived_dest' && jobState !== 'cleared'}>
            <span style={{ fontSize: 22 }}>✍</span>
            {(jobState === 'arrived_dest' || jobState === 'cleared') ? 'Sign &amp; seal handoff' : 'Available after arrival'}
          </button>
        )}
        {handoffSigned && (
          <div style={{ fontSize: 13, color: 'var(--emt-go)', textAlign: 'center', marginTop: 6 }}>
            ✓ Run record replicated to NECC · Available in receiving portal
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   VITALS CAPTURE MODAL — touch-friendly inputs
════════════════════════════════════════════════════════════════════ */
function VitalsCaptureModal({ job, latestVitals, onClose, onSave }) {
  const [sbp, setSbp] = useState(latestVitals.sbp ? String(latestVitals.sbp) : '');
  const [dbp, setDbp] = useState(latestVitals.dbp ? String(latestVitals.dbp) : '');
  const [hr, setHr] = useState(latestVitals.hr ? String(latestVitals.hr) : '');
  const [rr, setRr] = useState(latestVitals.rr ? String(latestVitals.rr) : '');
  const [spo2, setSpo2] = useState(latestVitals.spo2 ? String(latestVitals.spo2) : '');
  const [gcs, setGcs] = useState(latestVitals.gcs ? String(latestVitals.gcs) : '');

  const previewVitals = {
    sbp: parseFloat(sbp), dbp: parseFloat(dbp),
    hr: parseFloat(hr), rr: parseFloat(rr),
    spo2: parseFloat(spo2), gcs: parseFloat(gcs),
  };
  const assess = useMemo(() => {
    if (!previewVitals.sbp) return null;
    return assessVitals(previewVitals, job.patientAge, job.patientCategory);
  }, [previewVitals, job]);

  const tier = (key) => assess && assess.perVital[key] ? assess.perVital[key].tier : null;

  const handleSave = () => {
    const out = {
      sbp: sbp ? parseInt(sbp) : null,
      dbp: dbp ? parseInt(dbp) : null,
      hr: hr ? parseInt(hr) : null,
      rr: rr ? parseInt(rr) : null,
      spo2: spo2 ? parseInt(spo2) : null,
      gcs: gcs ? parseInt(gcs) : null,
    };
    onSave(out);
  };

  const inputStyle = (key) => {
    const t = tier(key);
    if (!t) return {};
    const colors = {
      normal: 'var(--tier-normal)',
      borderline: 'var(--tier-borderline)',
      abnormal: 'var(--tier-abnormal)',
      critical: 'var(--tier-critical)',
    };
    return { borderColor: colors[t], color: colors[t] };
  };

  return (
    <div className="emt-modal-overlay" onClick={onClose}>
      <div className="emt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="emt-modal-grip" />
        <div className="emt-modal-head">
          <div className="emt-modal-title">Record vitals</div>
          <div className="emt-modal-sub">{job.patientInitials} · {job.patientAge}{job.patientSex} · {job.patientCategory} · live engine assessment</div>
        </div>

        <div className="emt-modal-body">
          {/* BP */}
          <div className="emt-field">
            <label className="emt-label">Blood pressure (mmHg)</label>
            <div className="bp-input-row">
              <input className="emt-input" type="number" inputMode="numeric" placeholder="120" value={sbp} onChange={(e) => setSbp(e.target.value)} style={inputStyle('sbp')} />
              <span className="sep">/</span>
              <input className="emt-input" type="number" inputMode="numeric" placeholder="80" value={dbp} onChange={(e) => setDbp(e.target.value)} />
            </div>
          </div>

          {/* HR */}
          <div className="emt-field">
            <label className="emt-label">Heart rate (bpm)</label>
            <input className="emt-input" type="number" inputMode="numeric" placeholder="80" value={hr} onChange={(e) => setHr(e.target.value)} style={{ ...inputStyle('hr'), textAlign: 'center', fontFamily: 'var(--emt-mono)', fontSize: 28, fontWeight: 700 }} />
          </div>

          {/* RR */}
          <div className="emt-field">
            <label className="emt-label">Respiratory rate (/min)</label>
            <input className="emt-input" type="number" inputMode="numeric" placeholder="16" value={rr} onChange={(e) => setRr(e.target.value)} style={{ ...inputStyle('rr'), textAlign: 'center', fontFamily: 'var(--emt-mono)', fontSize: 28, fontWeight: 700 }} />
          </div>

          {/* SpO2 */}
          <div className="emt-field">
            <label className="emt-label">SpO₂ (%)</label>
            <input className="emt-input" type="number" inputMode="numeric" placeholder="98" value={spo2} onChange={(e) => setSpo2(e.target.value)} style={{ ...inputStyle('spo2'), textAlign: 'center', fontFamily: 'var(--emt-mono)', fontSize: 28, fontWeight: 700 }} />
          </div>

          {/* GCS */}
          <div className="emt-field">
            <label className="emt-label">GCS (/15)</label>
            <input className="emt-input" type="number" inputMode="numeric" placeholder="15" value={gcs} onChange={(e) => setGcs(e.target.value)} style={{ ...inputStyle('gcs'), textAlign: 'center', fontFamily: 'var(--emt-mono)', fontSize: 28, fontWeight: 700 }} />
          </div>

          {assess && assess.criticalCount > 0 && (
            <div style={{ marginTop: 14, padding: 14, background: 'rgba(230,57,70,0.12)', border: '1.5px solid var(--tier-critical)', borderRadius: 10, fontSize: 13, color: 'var(--tier-critical)', fontWeight: 600 }}>
              ⚠ {assess.criticalCount} critical vital{assess.criticalCount > 1 ? 's' : ''} detected · score {assess.totalScore}
            </div>
          )}
        </div>

        <div className="emt-modal-foot">
          <button type="button" className="btn-mid outline" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button type="button" className="btn-mid action" onClick={handleSave} style={{ flex: 2 }}>
            <span>✓</span> Save reading
          </button>
        </div>
      </div>
    </div>
  );
}
