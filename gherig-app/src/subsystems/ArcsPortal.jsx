/* ════════════════════════════════════════════════════════════════════
   GhERIG · ARCS · v1.0
   Ambulance Routing & Coordination System
   National Ambulance Service · Ghana
   ────────────────────────────────────────────────────────────────────
   USAGE:
     import ArcsPortal from './ArcsPortal';
     <ArcsPortal />

   DEPENDENCIES: react (>=17). No external libraries.

   ────────────────────────────────────────────────────────────────────
   WHAT THIS IS

   ARCS is the operational system for the National Ambulance Service
   of Ghana. It is a SINGLE national codebase, scoped by role:

     • NAS HQ (Accra)               — national oversight, inter-region
                                      brokerage, MoH-facing reporting
     • Regional Dispatchers (×16)   — operational dispatch authority
                                      within their region
     • Regional Coordinators (×16)  — clinical / medical oversight
                                      within their region
     • Station Lead (operational)   — district station view, vehicles
                                      and crew under their command

   This mirrors the actual NAS organisational reality:
   - 16 regional dispatch centres (one per region)
   - 261 district-level ambulance stations (operational level)
   - 356 ambulances, ~3,473 EMTs nationwide (2023 figures)

   ────────────────────────────────────────────────────────────────────
   SYSTEM FLOW

      Tablet → Hospital Portal → NCRIS → NECC
                                          │
                                          ▼ (transfer request)
                                ┌───────── ARCS ─────────┐
                                │  Regional Dispatch     │ — assigns vehicle
                                │  ↑ HQ on escalation    │
                                └────────────┬───────────┘
                                             │
                                             ▼
                                  EMT Device in vehicle
                                  (GPS, state, vitals — built next)
                                             │
                                             ▼ (live state back to)
                                  ARCS portal + NECC ARCS Liaison

   ────────────────────────────────────────────────────────────────────
   MODULES

   1. National Fleet Overview     — wall-screen view (HQ default)
   2. Regional Dispatch Console   — incoming queue + fleet (region default)
   3. Active Dispatches           — every job in flight, lifecycle
   4. Inter-Region Brokerage      — cross-region authorisation queue
   5. Stations & Vehicles         — directory + status
   6. NECC Liaison                — incoming transfer requests from NECC
   7. Patient Run Records         — handoff documentation
   8. Audit Replication           — every action, MoH-grade
   9. Reports / EAR-Q             — response times, transports, MoH submissions

   ────────────────────────────────────────────────────────────────────
   DISPATCH LIFECYCLE

   requested → assigned → en_route_pickup → on_scene → en_route_dest
              → arrived → cleared

   Each transition fires an audit event and feeds RQI clock.

   ────────────────────────────────────────────────────────────────────
   CLINICAL ENGINE — same Ghana STG + WHO IMCI as portal/tablet/NECC.
   © 2026 GhERIG Programme · National Ambulance Service · Ghana
════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useMemo, useCallback } from 'react';

/* ════════════════════════════════════════════════════════════════════
   STATIC CONFIG
════════════════════════════════════════════════════════════════════ */

const ROLES = {
  hq_coordinator: {
    label: 'NAS National Coordinator',  name: 'Mr. Yaw Asomani',     initials: 'YA',
    council: 'NAS-HQ-2018-0007',        dept: 'NAS HQ · Accra',
    defaultView: 'overview',
    region: 'all',
    allowed: ['overview','brokerage','active','stations','necc','runrecords','audit','reports','users'],
  },
  regional_dispatcher: {
    label: 'Regional Dispatcher · Greater Accra', name: 'Mr. Samuel Tetteh', initials: 'ST',
    council: 'NAS-DSP-GA-0012',         dept: 'GA Regional Dispatch · Ridge',
    defaultView: 'dispatch',
    region: 'GA',
    allowed: ['overview','dispatch','active','stations','necc','runrecords','audit','reports'],
  },
  regional_coordinator: {
    label: 'Regional Coordinator · Greater Accra', name: 'Dr. Akosua Owusu',  initials: 'AO',
    council: 'NAS-MED-GA-0004',         dept: 'GA Medical Direction',
    defaultView: 'overview',
    region: 'GA',
    allowed: ['overview','active','runrecords','audit','reports','stations'],
  },
  station_lead: {
    label: 'Station Lead · Tema East',  name: 'Mr. Kwabena Sarpong', initials: 'KS',
    council: 'NAS-STN-TE-0033',         dept: 'NAS Tema East Station',
    defaultView: 'stations',
    region: 'GA',
    station: 'STN-GA-TEMA-E',
    allowed: ['overview','stations','active','runrecords','audit'],
  },
};

const NAV = [
  { id: 'overview',   label: 'National Overview',     icon: '◎', section: 'Command' },
  { id: 'dispatch',   label: 'Dispatch Console',      icon: '⌖', section: 'Command' },
  { id: 'brokerage',  label: 'Inter-Region Brokerage',icon: '⇆', section: 'Command' },
  { id: 'active',     label: 'Active Dispatches',     icon: '⊕', section: 'Live Operations' },
  { id: 'necc',       label: 'NECC Liaison',          icon: '↔', section: 'Live Operations' },
  { id: 'stations',   label: 'Stations & Vehicles',   icon: '🚑', section: 'Fleet' },
  { id: 'runrecords', label: 'Patient Run Records',   icon: '◫', section: 'Quality & Audit' },
  { id: 'audit',      label: 'Audit Replication',     icon: '⊟', section: 'Quality & Audit' },
  { id: 'reports',    label: 'Reports & EAR-Q',       icon: '▦', section: 'Reporting' },
  { id: 'users',      label: 'Users & Roles',         icon: '⌬', section: 'Administration' },
];

// 16 regions of Ghana with rough lat/lng for the regional dispatch HQ
const REGIONS = [
  { code: 'GA', label: 'Greater Accra',  hqCity: 'Accra',          lat: 5.5666, lng: -0.2069 },
  { code: 'AS', label: 'Ashanti',        hqCity: 'Kumasi',         lat: 6.6982, lng: -1.6234 },
  { code: 'WE', label: 'Western',        hqCity: 'Sekondi',        lat: 4.9192, lng: -1.7541 },
  { code: 'WN', label: 'Western North',  hqCity: 'Sefwi Wiawso',   lat: 6.2167, lng: -2.4833 },
  { code: 'CE', label: 'Central',        hqCity: 'Cape Coast',     lat: 5.1318, lng: -1.2814 },
  { code: 'EA', label: 'Eastern',        hqCity: 'Koforidua',      lat: 6.0905, lng: -0.2585 },
  { code: 'VO', label: 'Volta',          hqCity: 'Ho',             lat: 6.6094, lng: 0.4715 },
  { code: 'OT', label: 'Oti',            hqCity: 'Dambai',         lat: 8.0667, lng: 0.1833 },
  { code: 'NO', label: 'Northern',       hqCity: 'Tamale',         lat: 9.4034, lng: -0.8424 },
  { code: 'SV', label: 'Savannah',       hqCity: 'Damongo',        lat: 9.0833, lng: -1.8167 },
  { code: 'NE', label: 'North East',     hqCity: 'Nalerigu',       lat: 10.5333, lng: -0.3833 },
  { code: 'UE', label: 'Upper East',     hqCity: 'Bolgatanga',     lat: 10.7856, lng: -0.8514 },
  { code: 'UW', label: 'Upper West',     hqCity: 'Wa',             lat: 10.0606, lng: -2.5099 },
  { code: 'BO', label: 'Bono',           hqCity: 'Sunyani',        lat: 7.7340, lng: -2.3262 },
  { code: 'BE', label: 'Bono East',      hqCity: 'Techiman',       lat: 7.5833, lng: -1.9333 },
  { code: 'AH', label: 'Ahafo',          hqCity: 'Goaso',          lat: 6.8000, lng: -2.5167 },
];

// Districts — Greater Accra deep, all other regions shallow
// Real district names. Each has lat/lng for map placement.
const DISTRICTS = [
  // Greater Accra — deep coverage
  { code: 'D-GA-AMA',    region: 'GA', label: 'Accra Metropolitan',           lat: 5.5500, lng: -0.2167 },
  { code: 'D-GA-TEMA',   region: 'GA', label: 'Tema Metropolitan',            lat: 5.6691, lng: -0.0167 },
  { code: 'D-GA-TEMAE',  region: 'GA', label: 'Tema East',                    lat: 5.6921, lng: -0.0410 },
  { code: 'D-GA-LEDZ',   region: 'GA', label: 'Ledzokuku Municipal',          lat: 5.5640, lng: -0.1720 },
  { code: 'D-GA-LEKMA',  region: 'GA', label: 'Krowor Municipal',             lat: 5.5880, lng: -0.1470 },
  { code: 'D-GA-LANKW',  region: 'GA', label: 'La Nkwantanang-Madina',        lat: 5.6837, lng: -0.1665 },
  { code: 'D-GA-GAEAST', region: 'GA', label: 'Ga East Municipal',            lat: 5.6210, lng: -0.2353 },
  { code: 'D-GA-GAWEST', region: 'GA', label: 'Ga West Municipal',            lat: 5.6500, lng: -0.3000 },
  { code: 'D-GA-GACEN',  region: 'GA', label: 'Ga Central Municipal',         lat: 5.6300, lng: -0.2700 },
  { code: 'D-GA-GASOUTH',region: 'GA', label: 'Ga South Municipal',           lat: 5.5800, lng: -0.3500 },
  { code: 'D-GA-ABLEKM', region: 'GA', label: 'Ablekuma North Municipal',     lat: 5.5950, lng: -0.2650 },
  { code: 'D-GA-ASHAIM', region: 'GA', label: 'Ashaiman Municipal',           lat: 5.6921, lng: -0.0410 },
  { code: 'D-GA-ADENTA', region: 'GA', label: 'Adenta Municipal',             lat: 5.7080, lng: -0.1665 },
  { code: 'D-GA-KPONE',  region: 'GA', label: 'Kpone Katamanso Municipal',    lat: 5.7150, lng: -0.0500 },
  { code: 'D-GA-NINGO',  region: 'GA', label: 'Ningo Prampram',               lat: 5.7333, lng: 0.1167 },
  { code: 'D-GA-SHAI',   region: 'GA', label: 'Shai Osudoku',                 lat: 5.9167, lng: 0.0667 },
  // Ashanti — sample districts
  { code: 'D-AS-KMA',    region: 'AS', label: 'Kumasi Metropolitan',          lat: 6.6982, lng: -1.6234 },
  { code: 'D-AS-OBUA',   region: 'AS', label: 'Obuasi Municipal',             lat: 6.2000, lng: -1.6833 },
  { code: 'D-AS-EJISU',  region: 'AS', label: 'Ejisu Municipal',              lat: 6.7500, lng: -1.4500 },
  // Western
  { code: 'D-WE-STMA',   region: 'WE', label: 'Sekondi-Takoradi Metropolitan',lat: 4.9039, lng: -1.7619 },
  { code: 'D-WE-EFFIA',  region: 'WE', label: 'Effia-Kwesimintsim Municipal', lat: 4.9192, lng: -1.7541 },
  // Western North
  { code: 'D-WN-SEFW',   region: 'WN', label: 'Sefwi Wiawso Municipal',       lat: 6.2167, lng: -2.4833 },
  // Central
  { code: 'D-CE-CCMA',   region: 'CE', label: 'Cape Coast Metropolitan',      lat: 5.1318, lng: -1.2814 },
  { code: 'D-CE-MFAN',   region: 'CE', label: 'Mfantsiman Municipal',         lat: 5.2144, lng: -1.0625 },
  // Eastern
  { code: 'D-EA-NJUO',   region: 'EA', label: 'New Juaben South Municipal',   lat: 6.0905, lng: -0.2585 },
  // Volta
  { code: 'D-VO-HOMA',   region: 'VO', label: 'Ho Municipal',                 lat: 6.6094, lng: 0.4715 },
  { code: 'D-VO-HOHOE',  region: 'VO', label: 'Hohoe Municipal',              lat: 7.1503, lng: 0.4729 },
  // Oti
  { code: 'D-OT-BIAK',   region: 'OT', label: 'Biakoye District',             lat: 7.6833, lng: 0.3000 },
  { code: 'D-OT-JASIK',  region: 'OT', label: 'Jasikan District',             lat: 7.4000, lng: 0.4500 },
  // Northern
  { code: 'D-NO-TAMA',   region: 'NO', label: 'Tamale Metropolitan',          lat: 9.4034, lng: -0.8424 },
  { code: 'D-NO-NANN',   region: 'NO', label: 'Nanumba North Municipal',      lat: 8.5667, lng: -0.0667 },
  // Savannah
  { code: 'D-SV-WEST',   region: 'SV', label: 'West Gonja Municipal',         lat: 9.0833, lng: -1.8167 },
  // North East
  { code: 'D-NE-EMAM',   region: 'NE', label: 'East Mamprusi Municipal',      lat: 10.5333, lng: -0.3833 },
  // Upper East
  { code: 'D-UE-BOLGA',  region: 'UE', label: 'Bolgatanga Municipal',         lat: 10.7856, lng: -0.8514 },
  // Upper West
  { code: 'D-UW-WAMUN',  region: 'UW', label: 'Wa Municipal',                 lat: 10.0606, lng: -2.5099 },
  // Bono
  { code: 'D-BO-SUMA',   region: 'BO', label: 'Sunyani Municipal',            lat: 7.3340, lng: -2.3262 },
  // Bono East
  { code: 'D-BE-TECH',   region: 'BE', label: 'Techiman Municipal',           lat: 7.5833, lng: -1.9333 },
  // Ahafo
  { code: 'D-AH-AHGOA',  region: 'AH', label: 'Asunafo North Municipal',      lat: 6.8000, lng: -2.5167 },
];

// Stations — at least one per district, often co-located with district hospital or fire station
const STATIONS = DISTRICTS.map(d => ({
  code: 'STN-' + d.code.replace('D-', ''),
  district: d.code,
  region: d.region,
  label: 'NAS ' + d.label,
  lat: d.lat,
  lng: d.lng,
}));

// Vehicles — per station. GA gets 1-3 each, others get 1.
const VEHICLES = (() => {
  const list = [];
  let plate = 9001;
  STATIONS.forEach(stn => {
    const isGA = stn.region === 'GA';
    const count = isGA && stn.code === 'STN-GA-AMA' ? 3
                : isGA && (stn.code === 'STN-GA-TEMA' || stn.code === 'STN-GA-TEMAE') ? 2
                : 1;
    for (let i = 0; i < count; i++) {
      // Plate format: GR-NNNN-25 (GR=Greater Accra, NN=region, 25=year). Using simplified.
      const r = stn.region;
      const reg = r === 'GA' ? 'GR' : r === 'AS' ? 'AS' : r === 'WE' ? 'WS' : r === 'WN' ? 'WN'
              : r === 'CE' ? 'CR' : r === 'EA' ? 'ER' : r === 'VO' ? 'VR' : r === 'OT' ? 'OT'
              : r === 'NO' ? 'NR' : r === 'SV' ? 'SR' : r === 'NE' ? 'NE' : r === 'UE' ? 'UE'
              : r === 'UW' ? 'UW' : r === 'BO' ? 'BO' : r === 'BE' ? 'BE' : 'AH';
      list.push({
        code: 'AMB-' + reg + '-' + String(plate++).slice(1),
        station: stn.code,
        district: stn.district,
        region: stn.region,
        type: i === 0 ? 'BLS' : 'BLS',  // basic life support; some stations later get ALS
        crew: ['EMT-A', 'EMT-B'],
        status: 'available',  // available | dispatched | en_route | on_scene | returning | maintenance | offline
      });
    }
  });
  // Mark a few as different states for the demo
  list[1].status = 'en_route';        // GA Accra Metro #2
  list[3].status = 'on_scene';        // Tema Metro
  list[6].status = 'maintenance';     // Ga East
  list[10].status = 'returning';      // Ablekuma
  if (list[16]) list[16].status = 'en_route';
  return list;
})();

const VEHICLE_STATUS_LABELS = {
  available:    'Available',
  dispatched:   'Dispatched',
  en_route:     'En route',
  on_scene:     'On scene',
  returning:    'Returning',
  maintenance:  'Maintenance',
  offline:      'Offline',
};

const DISPATCH_STATES = {
  requested:        { label: 'Requested',          step: 0, color: 'amber' },
  assigned:         { label: 'Assigned',           step: 1, color: 'copper' },
  en_route_pickup:  { label: 'En route to pickup', step: 2, color: 'amber' },
  on_scene:         { label: 'On scene',           step: 3, color: 'copper' },
  en_route_dest:    { label: 'En route to dest.',  step: 4, color: 'amber' },
  arrived:          { label: 'Arrived',            step: 5, color: 'emerald' },
  cleared:          { label: 'Cleared',            step: 6, color: 'ink' },
};

const DISPATCH_TYPES = {
  scene_call:        { label: '112 scene call',          icon: '☎' },
  inter_facility:    { label: 'Inter-facility transfer', icon: '⇋' },
  necc_routed:       { label: 'NECC bed-search route',   icon: '⌖' },
  cross_region:      { label: 'Cross-region (HQ-auth)',  icon: '⇆' },
};

const DECLINE_REASONS = [
  'No vehicles available in region',
  'All vehicles on critical deployment',
  'Request outside coverage area',
  'Patient deceased before dispatch',
  'Patient self-transported',
  'Duplicate request',
  'Insufficient information',
  'Other',
];

/* ════════════════════════════════════════════════════════════════════
   CLINICAL VITALS ENGINE — same as portal/tablet/NECC. Single source.
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
   STYLES — Forest+copper foundation, with ARCS amber accent.
   Same design language as portal / tablet / NECC.
════════════════════════════════════════════════════════════════════ */

const STYLES = `
:root {
  --forest:#0A4D3C; --forest-deep:#063929; --forest-mid:#0F6B53;
  --forest-pale:#E8F0EC; --forest-faint:#F2F7F4;
  --copper:#8A4D1F; --copper-mid:#A85F2A; --copper-pale:#F5EBDF; --copper-faint:#FAF4ED;
  --gold:#C4892C; --gold-pale:#F8EFD6;
  --crimson:#B5371F; --crimson-pale:#F8E6E1; --crimson-deep:#8E2814;
  --amber:#C57A18; --amber-pale:#FBEFD3; --amber-deep:#9A5C0F;
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
.arcs *, .arcs *::before, .arcs *::after { box-sizing:border-box; margin:0; padding:0; }
.arcs { font-family:var(--body); background:var(--paper-0); color:var(--ink-1); font-size:13.5px; line-height:1.5; -webkit-font-smoothing:antialiased; min-height:100vh; }
.arcs button { font-family:inherit; cursor:pointer; border:none; background:none; color:inherit; }
.arcs button:disabled { opacity:0.5; cursor:not-allowed; }
.arcs input, .arcs select, .arcs textarea { font-family:inherit; color:inherit; }
.arcs ::-webkit-scrollbar { width:8px; height:8px; }
.arcs ::-webkit-scrollbar-track { background:transparent; }
.arcs ::-webkit-scrollbar-thumb { background:var(--border-strong); border-radius:4px; border:2px solid var(--paper-0); }

/* LOGIN — copper/amber ARCS theme */
.login-screen { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; position:relative; overflow:hidden; background:#0F0A06; }
.login-screen::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse 50% 40% at 12% 18%, rgba(138,77,31,0.45) 0%, transparent 60%), radial-gradient(ellipse 45% 55% at 88% 82%, rgba(196,137,44,0.32) 0%, transparent 55%), radial-gradient(ellipse 35% 35% at 75% 18%, rgba(15,107,83,0.18) 0%, transparent 60%); pointer-events:none; }
.login-screen::after { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg,#B5371F 0%,#C4892C 50%,#277148 100%); z-index:2; }
.login-card { position:relative; z-index:1; width:100%; max-width:1080px; background:var(--paper-2); border-radius:24px; box-shadow:var(--shadow-xl); overflow:hidden; display:grid; grid-template-columns:1.15fr 0.85fr; }
@media (max-width: 880px) { .login-card { grid-template-columns:1fr; max-width:480px; } .login-left { padding:32px 28px !important; } }
.login-left { padding:56px 56px 48px; background:linear-gradient(180deg,#FFFFFF 0%, #FBF9F3 100%); display:flex; flex-direction:column; }
.login-brand { display:flex; align-items:center; gap:14px; margin-bottom:64px; }
.login-mark { width:52px; height:52px; background:#0F0A06; color:#fff; border-radius:14px; display:flex; align-items:center; justify-content:center; font-family:var(--display); font-weight:700; font-size:23px; letter-spacing:-0.02em; box-shadow:inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 3px rgba(0,0,0,0.18); position:relative; }
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
.login-form-icon { width:46px; height:46px; background:var(--copper-pale); color:var(--copper); border-radius:12px; display:flex; align-items:center; justify-content:center; margin-bottom:18px; font-size:20px; }
.login-form-title { font-family:var(--display); font-size:22px; font-weight:600; letter-spacing:-0.025em; line-height:1.1; margin-bottom:4px; }
.login-form-sub { font-size:12.5px; color:var(--ink-3); margin-bottom:24px; }
.field-label { display:block; font-family:var(--mono); font-size:9.5px; font-weight:600; letter-spacing:0.18em; text-transform:uppercase; color:var(--ink-3); margin-bottom:7px; }
.field-input { width:100%; padding:11px 14px; background:var(--paper-2); border:1.5px solid var(--border); border-radius:10px; font-size:13.5px; color:var(--ink-1); outline:none; transition:border-color .15s, box-shadow .15s; }
.field-input:focus { border-color:var(--copper); box-shadow:0 0 0 3px rgba(138,77,31,0.12); }
.field { margin-bottom:16px; }
.login-btn { width:100%; padding:13px 16px; background:#0F0A06; color:#fff; border-radius:10px; font-size:13px; font-weight:600; margin-top:24px; display:flex; align-items:center; justify-content:center; gap:8px; transition:background .15s; box-shadow:0 4px 12px rgba(138,77,31,0.25); }
.login-btn:hover { background:var(--copper); }
.login-role-pills { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
.login-role-pill { padding:10px 12px; background:var(--paper-2); border:1.5px solid var(--border); border-radius:10px; font-size:11.5px; font-weight:500; color:var(--ink-2); text-align:left; transition:all .12s; }
.login-role-pill .role-name { font-weight:600; color:var(--ink-1); display:block; margin-bottom:1px; }
.login-role-pill .role-sub { font-family:var(--mono); font-size:9px; color:var(--ink-3); letter-spacing:0.04em; }
.login-role-pill:hover { border-color:var(--copper); background:var(--copper-faint); }
.login-role-pill.active { border-color:var(--copper); background:var(--copper-pale); box-shadow:inset 0 0 0 1px var(--copper); }
.login-role-pill.active .role-name { color:var(--copper); }
.login-fineprint { text-align:center; margin-top:20px; font-family:var(--mono); font-size:9.5px; letter-spacing:0.12em; text-transform:uppercase; color:var(--ink-4); }

/* TOPBAR — copper-tinted dark for ARCS dispatch-floor feel */
.topbar { position:fixed; top:0; left:0; right:0; height:56px; z-index:100; background:#0F0A06; border-bottom:1px solid #1F1610; display:flex; align-items:center; }
.topbar-brand { width:240px; height:100%; display:flex; align-items:center; gap:11px; padding:0 22px; border-right:1px solid #1F1610; flex-shrink:0; }
.topbar-mark { width:32px; height:32px; background:var(--paper-2); color:#0F0A06; border-radius:9px; display:flex; align-items:center; justify-content:center; font-family:var(--display); font-weight:700; font-size:15px; }
.topbar-name { font-family:var(--display); font-weight:600; font-size:16px; letter-spacing:-0.025em; line-height:1; color:#fff; }
.topbar-sub { font-family:var(--mono); font-size:8.5px; letter-spacing:0.2em; text-transform:uppercase; color:var(--ink-on-dark-3); margin-top:3px; }
.topbar-context { flex:1; height:100%; display:flex; align-items:center; padding:0 28px; gap:24px; }
.facility-chip { display:flex; align-items:center; gap:10px; padding:6px 14px 6px 6px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:22px; }
.facility-chip-mark { width:26px; height:26px; background:var(--copper); color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:var(--display); font-size:11px; font-weight:700; }
.facility-chip-name { font-size:11.5px; font-weight:600; color:#fff; }
.facility-chip-meta { font-family:var(--mono); font-size:9px; color:var(--ink-on-dark-2); margin-top:1px; }
.topbar-status { display:flex; align-items:center; gap:14px; margin-left:auto; }
.live-pill { display:inline-flex; align-items:center; gap:6px; padding:4px 12px 4px 9px; background:rgba(196,137,44,0.18); border:1px solid rgba(196,137,44,0.4); border-radius:20px; font-family:var(--mono); font-size:9.5px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#E8B872; }
.live-dot { width:6px; height:6px; background:#E8B872; border-radius:50%; box-shadow:0 0 0 3px rgba(196,137,44,0.18); animation:pulse-live 2s ease-in-out infinite; }
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
.sb-item:hover { background:var(--copper-faint); color:var(--copper); }
.sb-item.active { background:var(--copper-faint); color:var(--copper); border-left-color:var(--copper); font-weight:600; }
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
.btn-primary { background:var(--copper); color:#fff; border-color:var(--copper); box-shadow:0 2px 6px rgba(138,77,31,0.18); }
.btn-primary:hover { background:var(--copper-mid); border-color:var(--copper-mid); color:#fff; }
.btn-danger { color:var(--crimson); }
.btn-danger:hover { background:var(--crimson-pale); border-color:var(--crimson); color:var(--crimson-deep); }
.btn-warn { background:var(--amber); color:#fff; border-color:var(--amber); }
.btn-warn:hover { background:var(--amber-deep); border-color:var(--amber-deep); color:#fff; }
.btn-success { background:var(--emerald); color:#fff; border-color:var(--emerald); }
.btn-success:hover { background:#1F5A39; border-color:#1F5A39; color:#fff; }
.btn-sm { padding:5px 10px; font-size:11px; }

/* KPI / CARDS */
.kpi-strip { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin-bottom:24px; }
@media (max-width:1300px) { .kpi-strip { grid-template-columns:repeat(3,1fr); } }
@media (max-width:900px) { .kpi-strip { grid-template-columns:repeat(2,1fr); } }
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

.page-section { animation:fade-up .35s ease both; }
@keyframes fade-up { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }

/* GHANA MAP */
.map-frame { background:linear-gradient(180deg, #FBF9F3 0%, #F4F3EE 100%); border:1px solid var(--border); border-radius:var(--radius-lg); padding:14px; position:relative; overflow:hidden; }
.map-svg { width:100%; height:auto; }
.map-region-fill { fill:var(--paper-3); stroke:var(--border-strong); stroke-width:1; }
.map-vehicle-dot { transition:r .2s, opacity .2s; cursor:pointer; }
.map-vehicle-dot:hover { r:7; }
.map-station-dot { fill:var(--ink-4); stroke:#fff; stroke-width:1; opacity:0.5; }
.map-vehicle-dot.status-available { fill:var(--emerald); }
.map-vehicle-dot.status-en_route { fill:var(--amber); }
.map-vehicle-dot.status-on_scene { fill:var(--copper); }
.map-vehicle-dot.status-dispatched { fill:var(--copper); }
.map-vehicle-dot.status-returning { fill:var(--gold); }
.map-vehicle-dot.status-maintenance { fill:var(--ink-4); }
.map-vehicle-dot.status-offline { fill:var(--crimson); }
.map-region-label { font-family:var(--mono); font-size:9px; fill:var(--ink-3); pointer-events:none; font-weight:600; }
.map-legend { display:flex; gap:14px; flex-wrap:wrap; margin-top:8px; padding:8px 12px; background:var(--paper-2); border:1px solid var(--border); border-radius:8px; }
.map-legend-item { display:flex; align-items:center; gap:5px; font-family:var(--mono); font-size:10px; color:var(--ink-3); }
.map-legend-dot { width:9px; height:9px; border-radius:50%; }

/* DISPATCH QUEUE */
.dispatch-row { display:grid; grid-template-columns:90px 80px 1fr 1fr 90px 100px 140px; gap:10px; padding:11px 16px; border-bottom:1px solid var(--border); align-items:center; font-size:12px; transition:background .12s; }
.dispatch-row:hover { background:var(--paper-3); }
.dispatch-row.priority-critical { border-left:3px solid var(--crimson); padding-left:13px; }
.dispatch-row.priority-high { border-left:3px solid var(--amber); padding-left:13px; }
.dispatch-row.priority-routine { border-left:3px solid var(--forest-mid); padding-left:13px; }
.dispatch-pill { display:inline-flex; padding:2px 8px; border-radius:10px; font-family:var(--mono); font-size:9px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
.dispatch-id { font-family:var(--mono); font-size:10.5px; color:var(--ink-3); }
.dispatch-from { font-weight:600; line-height:1.3; }
.dispatch-from-sub { font-family:var(--mono); font-size:9.5px; color:var(--ink-3); margin-top:1px; }
.dispatch-to { font-size:11.5px; }
.dispatch-to-sub { font-family:var(--mono); font-size:9px; color:var(--ink-3); }
.dispatch-actions { display:flex; gap:6px; }

/* VEHICLE TILE */
.veh-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; padding:12px; }
.veh-tile { background:var(--paper-2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:14px 16px; position:relative; overflow:hidden; transition:box-shadow .12s, transform .12s; }
.veh-tile:hover { box-shadow:var(--shadow); transform:translateY(-1px); }
.veh-tile::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; }
.veh-tile.status-available::before { background:var(--emerald); }
.veh-tile.status-dispatched::before { background:var(--copper); }
.veh-tile.status-en_route::before { background:var(--amber); }
.veh-tile.status-on_scene::before { background:var(--copper); }
.veh-tile.status-returning::before { background:var(--gold); }
.veh-tile.status-maintenance::before { background:var(--ink-4); }
.veh-tile.status-offline::before { background:var(--crimson); }
.veh-tile-head { display:flex; justify-content:space-between; margin-bottom:8px; align-items:flex-start; }
.veh-plate { font-family:var(--mono); font-size:13px; font-weight:700; color:var(--ink-1); }
.veh-type { font-family:var(--mono); font-size:9px; color:var(--ink-3); margin-top:1px; }
.veh-status-pill { display:inline-flex; padding:2px 8px; border-radius:10px; font-family:var(--mono); font-size:9px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
.vsp-available { background:var(--emerald-pale); color:var(--emerald); }
.vsp-dispatched, .vsp-on_scene { background:var(--copper-pale); color:var(--copper); }
.vsp-en_route, .vsp-returning { background:var(--amber-pale); color:var(--amber); }
.vsp-maintenance { background:var(--paper-3); color:var(--ink-3); }
.vsp-offline { background:var(--crimson-pale); color:var(--crimson); }
.veh-row { display:grid; grid-template-columns:60px 1fr; gap:8px; align-items:baseline; margin-bottom:4px; font-size:11.5px; }
.veh-row .k { font-family:var(--mono); font-size:9px; font-weight:600; color:var(--ink-3); letter-spacing:0.08em; text-transform:uppercase; }

/* DISPATCH LIFECYCLE STEPPER */
.life-stepper { display:flex; align-items:center; padding:14px 16px; gap:8px; flex-wrap:wrap; }
.life-step { display:flex; align-items:center; gap:6px; flex:1; min-width:120px; }
.life-dot { width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:var(--mono); font-size:10px; font-weight:700; flex-shrink:0; }
.life-dot.done { background:var(--emerald); color:#fff; }
.life-dot.current { background:var(--copper); color:#fff; box-shadow:0 0 0 4px var(--copper-pale); }
.life-dot.pending { background:var(--paper-3); color:var(--ink-4); border:1px dashed var(--border-strong); }
.life-label { font-size:11px; line-height:1.2; }
.life-label .lbl { font-weight:600; color:var(--ink-1); }
.life-label .ts { font-family:var(--mono); font-size:9px; color:var(--ink-3); margin-top:1px; }
.life-connector { flex:0 0 12px; height:2px; background:var(--border); border-radius:1px; }
.life-connector.done { background:var(--emerald); }

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
.rp-active, .rp-online, .rp-available { background:var(--emerald-pale); color:var(--emerald); }
.rp-offline { background:var(--paper-1); color:var(--ink-3); }
.rp-degraded, .rp-en_route { background:var(--amber-pale); color:var(--amber); }
.rp-locked, .rp-maintenance { background:var(--crimson-pale); color:var(--crimson); }

/* FILTER BAR */
.filter-bar { display:flex; align-items:center; gap:8px; padding:12px 18px; background:var(--paper-3); border-bottom:1px solid var(--border); flex-wrap:wrap; }
.filter-pill { padding:6px 12px; background:var(--paper-2); border:1px solid var(--border); border-radius:18px; font-size:11.5px; font-weight:500; color:var(--ink-2); transition:all .12s; cursor:pointer; }
.filter-pill:hover { border-color:var(--copper); }
.filter-pill.active { background:var(--copper); color:#fff; border-color:var(--copper); font-weight:600; }
.filter-pill .count { margin-left:5px; padding:1px 6px; background:rgba(255,255,255,0.18); border-radius:8px; font-family:var(--mono); font-size:9.5px; font-weight:700; }
.filter-pill:not(.active) .count { background:var(--paper-1); color:var(--ink-3); }
.filter-search { margin-left:auto; display:flex; align-items:center; gap:6px; padding:5px 10px; background:var(--paper-2); border:1px solid var(--border); border-radius:8px; min-width:220px; }
.filter-search input { border:none; outline:none; background:transparent; font-size:12px; flex:1; }

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

/* TOAST */
.toast-host { position:fixed; top:70px; right:22px; z-index:500; display:flex; flex-direction:column; gap:8px; pointer-events:none; }
.toast { min-width:280px; max-width:380px; background:var(--ink-1); color:#fff; border-radius:var(--radius); padding:11px 14px; box-shadow:var(--shadow-xl); display:flex; align-items:flex-start; gap:10px; pointer-events:auto; animation:toast-in .25s ease; border-left:3px solid var(--emerald); }
.toast.warn { border-left-color:var(--amber); }
.toast.error { border-left-color:var(--crimson); }
.toast.info { border-left-color:var(--copper); }
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
.pg-btn:hover:not(:disabled) { background:var(--copper-faint); border-color:var(--copper); color:var(--copper); }
.pg-btn.active { background:var(--copper); border-color:var(--copper); color:#fff; }
.pg-btn:disabled { opacity:0.35; cursor:not-allowed; }

/* CHART */
.chart-wrap { padding:16px 20px 0; }
.chart-bars { display:flex; align-items:flex-end; gap:4px; height:130px; padding-bottom:4px; }
.bar-group { flex:1; display:flex; flex-direction:column; align-items:center; height:100%; }
.bar-pair { width:100%; display:flex; align-items:flex-end; gap:1px; flex:1; }
.bar { flex:1; border-radius:2px 2px 0 0; min-height:2px; }
.chart-axis { display:flex; justify-content:space-between; padding:4px 20px 16px; font-family:var(--mono); font-size:9px; color:var(--ink-4); }

.empty-state { padding:48px; text-align:center; color:var(--ink-3); }
.empty-state .em-title { font-family:var(--display); font-size:16px; color:var(--ink-2); margin-bottom:6px; }
.empty-state .em-sub { font-size:11.5px; color:var(--ink-4); }
`;
/* ════════════════════════════════════════════════════════════════════
   UTILITIES
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

const downloadFile = (filename, content, mimeType = 'text/plain') => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const distanceKm = (lat1, lng1, lat2, lng2) => {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const la1 = lat1 * Math.PI / 180, la2 = lat2 * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng/2)**2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
};

const regionLabel = (code) => { const r = REGIONS.find(x => x.code === code); return r ? r.label : code; };
const districtLabel = (code) => { const d = DISTRICTS.find(x => x.code === code); return d ? d.label : code; };
const stationLabel = (code) => { const s = STATIONS.find(x => x.code === code); return s ? s.label : code; };

/* ════════════════════════════════════════════════════════════════════
   SEED DATA
════════════════════════════════════════════════════════════════════ */

// Active dispatches — varied lifecycle states across regions
const seedDispatches = () => ([
  // Critical inter-facility, NECC-routed, currently en-route to dest
  {
    id: 'DSP-2026-3041', type: 'necc_routed', priority: 'critical',
    state: 'en_route_dest',
    fromFacility: 'Tema General Hospital', fromDistrict: 'D-GA-TEMA', fromRegion: 'GA',
    toFacility: 'Korle-Bu Teaching Hospital', toDistrict: 'D-GA-AMA', toRegion: 'GA',
    vehicle: 'AMB-GR-002', condition: 'Acute coronary syndrome',
    patientInitials: 'KA', patientAge: 59, patientSex: 'M', patientCategory: 'Adult',
    stability: 'Critical',
    requestedAt: minutesAgo(18), assignedAt: minutesAgo(16), enRoutePickupAt: minutesAgo(14),
    onSceneAt: minutesAgo(8), enRouteDestAt: minutesAgo(2), arrivedAt: null, clearedAt: null,
    eta: 6, distanceKm: 12, neccRefId: 'REF-2026-2041',
    vitals: { sbp: 222, dbp: 174, hr: 135, rr: 36, spo2: 89, gcs: 14 },
    notes: 'STEMI confirmed at Tema. Pre-alerted KBTH cath lab.',
  },
  // Inter-facility, on scene, pickup phase
  {
    id: 'DSP-2026-3042', type: 'necc_routed', priority: 'high',
    state: 'on_scene',
    fromFacility: 'LEKMA Hospital', fromDistrict: 'D-GA-LEKMA', fromRegion: 'GA',
    toFacility: 'Korle-Bu Teaching Hospital', toDistrict: 'D-GA-AMA', toRegion: 'GA',
    vehicle: 'AMB-GR-005', condition: 'Severe preeclampsia',
    patientInitials: 'AB', patientAge: 29, patientSex: 'F', patientCategory: 'Obstetric',
    stability: 'Unstable',
    requestedAt: minutesAgo(12), assignedAt: minutesAgo(10), enRoutePickupAt: minutesAgo(8),
    onSceneAt: minutesAgo(2), enRouteDestAt: null, arrivedAt: null, clearedAt: null,
    eta: 14, distanceKm: 9, neccRefId: 'REF-2026-2042',
    vitals: { sbp: 169, dbp: 112, hr: 108, rr: 20, spo2: 97, gcs: 15 },
    notes: 'MgSO4 loading dose given.',
  },
  // Critical 112 scene call, just dispatched
  {
    id: 'DSP-2026-3043', type: 'scene_call', priority: 'critical',
    state: 'en_route_pickup',
    fromFacility: 'RTA scene · N1 Highway km 14', fromDistrict: 'D-GA-GAWEST', fromRegion: 'GA',
    toFacility: '37 Military Hospital', toDistrict: 'D-GA-AMA', toRegion: 'GA',
    vehicle: 'AMB-GR-008', condition: 'Polytrauma · RTA',
    patientInitials: '—', patientAge: null, patientSex: 'M', patientCategory: 'Adult',
    stability: 'Critical',
    requestedAt: minutesAgo(6), assignedAt: minutesAgo(5), enRoutePickupAt: minutesAgo(3),
    onSceneAt: null, enRouteDestAt: null, arrivedAt: null, clearedAt: null,
    eta: 5, distanceKm: 8, neccRefId: null,
    vitals: { sbp: null, dbp: null, hr: null, rr: null, spo2: null, gcs: null },
    notes: 'Multi-vehicle RTA. Police on scene. Reported 2 casualties.',
  },
  // Inter-facility en route to pickup
  {
    id: 'DSP-2026-3044', type: 'inter_facility', priority: 'high',
    state: 'en_route_pickup',
    fromFacility: 'Achimota Hospital', fromDistrict: 'D-GA-GAEAST', fromRegion: 'GA',
    toFacility: 'Korle-Bu Teaching Hospital', toDistrict: 'D-GA-AMA', toRegion: 'GA',
    vehicle: 'AMB-GR-011', condition: 'Severe pneumonia · paediatric',
    patientInitials: 'MS', patientAge: 7, patientSex: 'M', patientCategory: 'Paediatric',
    stability: 'Unstable',
    requestedAt: minutesAgo(11), assignedAt: minutesAgo(9), enRoutePickupAt: minutesAgo(6),
    onSceneAt: null, enRouteDestAt: null, arrivedAt: null, clearedAt: null,
    eta: 4, distanceKm: 7, neccRefId: 'REF-2026-2044',
    vitals: { sbp: 100, dbp: 65, hr: 145, rr: 38, spo2: 87, gcs: 14 },
    notes: 'PICU bed confirmed at KBTH.',
  },
  // Just requested — needs assignment (NECC bed-search route, awaits dispatcher decision)
  {
    id: 'DSP-2026-3045', type: 'necc_routed', priority: 'critical',
    state: 'requested',
    fromFacility: 'La General Hospital', fromDistrict: 'D-GA-LEDZ', fromRegion: 'GA',
    toFacility: 'Korle-Bu Teaching Hospital', toDistrict: 'D-GA-AMA', toRegion: 'GA',
    vehicle: null, condition: 'Abdominal trauma',
    patientInitials: 'JK', patientAge: 41, patientSex: 'M', patientCategory: 'Adult',
    stability: 'Critical',
    requestedAt: minutesAgo(2), assignedAt: null, enRoutePickupAt: null,
    onSceneAt: null, enRouteDestAt: null, arrivedAt: null, clearedAt: null,
    eta: null, distanceKm: 6, neccRefId: 'REF-2026-2047',
    vitals: { sbp: 82, dbp: 48, hr: 138, rr: 30, spo2: 91, gcs: 13 },
    notes: 'O-negative blood requested. Surgery on standby.',
  },
  // Just arrived
  {
    id: 'DSP-2026-3046', type: 'inter_facility', priority: 'critical',
    state: 'arrived',
    fromFacility: 'Ashaiman Polyclinic', fromDistrict: 'D-GA-ASHAIM', fromRegion: 'GA',
    toFacility: 'Korle-Bu Teaching Hospital', toDistrict: 'D-GA-AMA', toRegion: 'GA',
    vehicle: 'AMB-GR-013', condition: 'Birth asphyxia · neonate',
    patientInitials: 'AS', patientAge: 0, patientSex: 'M', patientCategory: 'Neonate',
    stability: 'Critical',
    requestedAt: minutesAgo(28), assignedAt: minutesAgo(26), enRoutePickupAt: minutesAgo(24),
    onSceneAt: minutesAgo(20), enRouteDestAt: minutesAgo(15), arrivedAt: minutesAgo(2), clearedAt: null,
    eta: 0, distanceKm: 14, neccRefId: 'REF-2026-2048',
    vitals: { sbp: 65, dbp: 40, hr: 95, rr: 32, spo2: 89, gcs: 14 },
    notes: 'Term neonate · APGAR 3/5. Cooling protocol in transit.',
  },
  // Cross-region · Ashanti to Greater Accra (HQ-authorised)
  {
    id: 'DSP-2026-3047', type: 'cross_region', priority: 'high',
    state: 'en_route_dest',
    fromFacility: 'Komfo Anokye Teaching Hospital', fromDistrict: 'D-AS-KMA', fromRegion: 'AS',
    toFacility: 'Korle-Bu Teaching Hospital', toDistrict: 'D-GA-AMA', toRegion: 'GA',
    vehicle: 'AMB-AS-001', condition: 'Burns · 40% TBSA',
    patientInitials: 'OK', patientAge: 32, patientSex: 'F', patientCategory: 'Adult',
    stability: 'Unstable',
    requestedAt: minutesAgo(96), assignedAt: minutesAgo(92), enRoutePickupAt: minutesAgo(89),
    onSceneAt: minutesAgo(72), enRouteDestAt: minutesAgo(60), arrivedAt: null, clearedAt: null,
    eta: 110, distanceKm: 250, neccRefId: 'REF-2026-2061',
    vitals: { sbp: 105, dbp: 65, hr: 118, rr: 22, spo2: 96, gcs: 15 },
    notes: 'KBTH burns unit. HQ-authorised cross-region. Fluid resuscitation ongoing.',
  },
  // Volta · regional inter-facility
  {
    id: 'DSP-2026-3048', type: 'inter_facility', priority: 'high',
    state: 'en_route_pickup',
    fromFacility: 'Hohoe Municipal Hospital', fromDistrict: 'D-VO-HOHOE', fromRegion: 'VO',
    toFacility: 'Ho Teaching Hospital', toDistrict: 'D-VO-HOMA', toRegion: 'VO',
    vehicle: 'AMB-VR-001', condition: 'Severe malaria · paediatric',
    patientInitials: 'YA', patientAge: 4, patientSex: 'F', patientCategory: 'Paediatric',
    stability: 'Unstable',
    requestedAt: minutesAgo(14), assignedAt: minutesAgo(12), enRoutePickupAt: minutesAgo(8),
    onSceneAt: null, enRouteDestAt: null, arrivedAt: null, clearedAt: null,
    eta: 12, distanceKm: 56, neccRefId: 'REF-2026-2052',
    vitals: { sbp: 88, dbp: 55, hr: 156, rr: 42, spo2: 92, gcs: 13 },
    notes: 'Cerebral malaria suspected. Artesunate started.',
  },
]);

// Brokerage queue — cross-region or surge requests pending HQ authorisation
const seedBrokerage = () => ([
  {
    id: 'BRK-2026-0142',
    requestingRegion: 'CE', targetRegion: 'GA',
    fromFacility: 'Cape Coast Teaching Hospital',
    toFacility: 'Korle-Bu Teaching Hospital',
    condition: 'Severe burns · adult',
    raisedAt: minutesAgo(8),
    reason: 'Cape Coast burns unit at capacity. Patient requires KBTH burns ICU.',
    status: 'pending_hq',
  },
  {
    id: 'BRK-2026-0143',
    requestingRegion: 'NO', targetRegion: 'AS',
    fromFacility: 'Tamale Teaching Hospital',
    toFacility: 'Komfo Anokye Teaching Hospital',
    condition: 'Cardiothoracic surgery candidate',
    raisedAt: minutesAgo(22),
    reason: 'No cardiothoracic surgeon available in Northern Region. KATH accepts.',
    status: 'pending_hq',
  },
  {
    id: 'BRK-2026-0144',
    requestingRegion: 'GA', targetRegion: 'EA',
    fromFacility: 'Ridge Hospital',
    toFacility: 'Eastern Regional Hospital',
    condition: 'Surge — GA fleet saturated',
    raisedAt: minutesAgo(35),
    reason: 'All Greater Accra ambulances dispatched. Need vehicle from EA for stable transfer.',
    status: 'approved',
  },
]);

// Patient run records — completed dispatches with handoff documentation
const seedRunRecords = () => ([
  {
    id: 'PRR-2026-9082', dispatch: 'DSP-2026-3038',
    patient: 'OK · 32F', condition: 'Severe burns 40% TBSA',
    from: 'Komfo Anokye Teaching Hospital', to: 'Korle-Bu Teaching Hospital',
    crew: 'EMT-A Nyarko · EMT-B Asare', vehicle: 'AMB-AS-001',
    onScene: '02:45', loaded: '02:58', arrived: '04:48',
    interventionsList: ['IV access ×2', 'Crystalloid 1.5L', 'Morphine 5mg IV', 'Burns sheet applied'],
    handoffSig: 'Dr. M. Boateng', signedAt: minutesAgo(2),
  },
  {
    id: 'PRR-2026-9081', dispatch: 'DSP-2026-3037',
    patient: 'IT · 33F', condition: 'DKA',
    from: 'Adabraka Polyclinic', to: 'Korle-Bu Teaching Hospital',
    crew: 'EMT-A Mensah · EMT-B Owusu', vehicle: 'AMB-GR-018',
    onScene: '01:12', loaded: '01:21', arrived: '01:43',
    interventionsList: ['IV access', 'Insulin infusion (started)', 'BP monitoring'],
    handoffSig: 'Dr. K. Asante', signedAt: minutesAgo(48),
  },
  {
    id: 'PRR-2026-9080', dispatch: 'DSP-2026-3036',
    patient: 'CO · 24M', condition: 'Closed L tibia fracture',
    from: 'Eastern Regional Hospital', to: 'Korle-Bu Teaching Hospital',
    crew: 'EMT-A Doku · EMT-B Tetteh', vehicle: 'AMB-ER-001',
    onScene: '23:30', loaded: '23:42', arrived: '01:08',
    interventionsList: ['Splint applied', 'IV access', 'Tramadol 100mg IV'],
    handoffSig: 'Dr. J. Odame', signedAt: minutesAgo(135),
  },
]);

const seedAudit = () => ([
  { time: minutesAgo(0),  region: 'GA',  actor: 'Mr. Samuel Tetteh',  role: 'Regional Dispatcher',  action: 'Dispatched AMB-GR-002 to STEMI transfer · Tema → KBTH', ref: 'DSP-2026-3041' },
  { time: minutesAgo(2),  region: 'GA',  actor: 'NECC Operator',      role: 'System',               action: 'Bed-search route received · destination KBTH',          ref: 'DSP-2026-3045' },
  { time: minutesAgo(5),  region: 'GA',  actor: 'Mr. Samuel Tetteh',  role: 'Regional Dispatcher',  action: 'Dispatched AMB-GR-008 to RTA scene · N1 km14',           ref: 'DSP-2026-3043' },
  { time: minutesAgo(6),  region: 'HQ',  actor: 'NCRIS Switch',       role: 'System',               action: '112 scene call routed to GA dispatch',                   ref: 'DSP-2026-3043' },
  { time: minutesAgo(8),  region: 'CE',  actor: 'Dr. Yaw Mensah',     role: 'Regional Coordinator', action: 'Cross-region brokerage requested · burns case',          ref: 'BRK-2026-0142' },
  { time: minutesAgo(9),  region: 'GA',  actor: 'Mr. Samuel Tetteh',  role: 'Regional Dispatcher',  action: 'Dispatched AMB-GR-011 to paediatric pneumonia',          ref: 'DSP-2026-3044' },
  { time: minutesAgo(10), region: 'GA',  actor: 'Mr. Samuel Tetteh',  role: 'Regional Dispatcher',  action: 'Dispatched AMB-GR-005 to severe preeclampsia',           ref: 'DSP-2026-3042' },
  { time: minutesAgo(15), region: 'HQ',  actor: 'Mr. Yaw Asomani',    role: 'NAS National Coord.',  action: 'Approved cross-region brokerage · GA→EA',                ref: 'BRK-2026-0144' },
  { time: minutesAgo(16), region: 'GA',  actor: 'Mr. Samuel Tetteh',  role: 'Regional Dispatcher',  action: 'Assigned AMB-GR-002 to STEMI inter-facility',            ref: 'DSP-2026-3041' },
  { time: minutesAgo(22), region: 'NO',  actor: 'Mr. K. Adamu',       role: 'Regional Dispatcher',  action: 'Cross-region brokerage requested · cardiothoracic',      ref: 'BRK-2026-0143' },
  { time: minutesAgo(26), region: 'GA',  actor: 'Mr. Samuel Tetteh',  role: 'Regional Dispatcher',  action: 'Dispatched AMB-GR-013 to neonatal HIE',                  ref: 'DSP-2026-3046' },
  { time: minutesAgo(60), region: 'AS',  actor: 'Mr. K. Boakye',      role: 'Regional Dispatcher',  action: 'Vehicle AMB-AS-001 wheels-rolling to KBTH (cross-region)', ref: 'DSP-2026-3047' },
  { time: minutesAgo(96), region: 'HQ',  actor: 'Mr. Yaw Asomani',    role: 'NAS National Coord.',  action: 'Approved cross-region brokerage · AS→GA burns',          ref: 'BRK-2026-0141' },
]);

const loadFonts = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById('arcs-fonts')) return;
  const link = document.createElement('link');
  link.id = 'arcs-fonts'; link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap';
  document.head.appendChild(link);
};

/* ════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════════════ */

export default function ArcsPortal() {
  // Auth
  const [authed, setAuthed] = useState(false);
  const [roleKey, setRoleKey] = useState('regional_dispatcher');
  const user = roleKey ? ROLES[roleKey] : null;

  // App state
  const [view, setView] = useState('overview');
  const [vehicles, setVehicles] = useState(VEHICLES);
  const [dispatches, setDispatches] = useState(seedDispatches);
  const [brokerage, setBrokerage] = useState(seedBrokerage);
  const [runRecords] = useState(seedRunRecords);
  const [audit, setAudit] = useState(seedAudit);
  const [sessionStart, setSessionStart] = useState(null);

  // UI state
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterState, setFilterState] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [activePage, setActivePage] = useState(1);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [openDispatch, setOpenDispatch] = useState(null);
  const [openBroker, setOpenBroker] = useState(null);
  const [assignFor, setAssignFor] = useState(null);  // dispatch id when opening assign modal
  const [toasts, setToasts] = useState([]);
  const [, forceTick] = useState(0);
  const [clock, setClock] = useState(new Date());

  // Fonts + styles on mount
  useEffect(() => { loadFonts(); }, []);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('arcs-styles')) return;
    const tag = document.createElement('style');
    tag.id = 'arcs-styles';
    tag.textContent = STYLES;
    document.head.appendChild(tag);
  }, []);

  const toast = useCallback((text, type = 'success', title = null) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, text, type, title }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  const logAudit = useCallback((action, ref = null) => {
    if (!user) return;
    setAudit(a => [{ time: new Date(), region: user.region === 'all' ? 'HQ' : user.region, actor: user.name, role: user.label, action, ref }, ...a]);
  }, [user]);

  const doLogin = () => {
    const profile = ROLES[roleKey];
    setAuthed(true);
    setView(profile.defaultView);
    setSessionStart(new Date());
    setAudit(a => [{ time: new Date(), region: profile.region === 'all' ? 'HQ' : profile.region, actor: profile.name, role: profile.label, action: 'ARCS session opened', ref: null }, ...a]);
    setTimeout(() => toast('Welcome, ' + profile.name.split(' ').slice(-1)[0] + '. ' + (profile.region === 'all' ? 'National picture loaded.' : regionLabel(profile.region) + ' dispatch board ready.'), 'success', 'Signed in'), 100);
  };

  const doLogout = () => {
    logAudit('ARCS session closed');
    toast('Signed out securely', 'info');
    setTimeout(() => {
      setAuthed(false); setUserDropdownOpen(false); setView('overview');
      setVehicles(VEHICLES); setDispatches(seedDispatches());
      setBrokerage(seedBrokerage()); setAudit(seedAudit()); setSessionStart(null);
      setOpenDispatch(null); setOpenBroker(null); setAssignFor(null);
    }, 700);
  };

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => { setClock(new Date()); forceTick(x => x + 1); }, 1000);
    return () => clearInterval(t);
  }, []);

  // ─────────────────────────────────────────────────────────
  // BUTTON HANDLERS
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

  // Open assignment modal for a requested dispatch
  const handleOpenAssign = (dispatchId) => setAssignFor(dispatchId);

  // Confirm assignment of a vehicle to a dispatch
  const handleConfirmAssign = (dispatchId, vehicleCode, eta) => {
    setDispatches(prev => prev.map(d => d.id === dispatchId
      ? { ...d, state: 'assigned', vehicle: vehicleCode, assignedAt: new Date(), eta: parseInt(eta) || 10 }
      : d));
    setVehicles(prev => prev.map(v => v.code === vehicleCode
      ? { ...v, status: 'dispatched' }
      : v));
    logAudit('Dispatched ' + vehicleCode + ' to ' + dispatchId, dispatchId);
    toast(vehicleCode + ' dispatched · ETA ' + (parseInt(eta) || 10) + ' min', 'success', 'Assigned');
    setAssignFor(null);
  };

  // Decline a dispatch
  const handleDecline = (dispatchId, reason) => {
    setDispatches(prev => prev.filter(d => d.id !== dispatchId));
    logAudit('Declined ' + dispatchId + ' · reason: ' + reason, dispatchId);
    toast('Declined · ' + reason, 'warn', 'Dispatch declined');
    setAssignFor(null);
  };

  // Advance lifecycle state for a dispatch
  const handleAdvanceState = (dispatchId, nextState) => {
    setDispatches(prev => prev.map(d => {
      if (d.id !== dispatchId) return d;
      const ts = new Date();
      const updates = {
        en_route_pickup:  { state: nextState, enRoutePickupAt: ts },
        on_scene:         { state: nextState, onSceneAt: ts },
        en_route_dest:    { state: nextState, enRouteDestAt: ts },
        arrived:          { state: nextState, arrivedAt: ts },
        cleared:          { state: nextState, clearedAt: ts },
      };
      return { ...d, ...(updates[nextState] || { state: nextState }) };
    }));
    if (nextState === 'arrived' || nextState === 'cleared') {
      const d = dispatches.find(x => x.id === dispatchId);
      if (d && d.vehicle) {
        setVehicles(prev => prev.map(v => v.code === d.vehicle
          ? { ...v, status: nextState === 'cleared' ? 'available' : 'returning' }
          : v));
      }
    }
    logAudit('Lifecycle ' + nextState + ' · ' + dispatchId, dispatchId);
    toast('State updated · ' + (DISPATCH_STATES[nextState] ? DISPATCH_STATES[nextState].label : nextState), 'success');
  };

  // Brokerage approval / rejection
  const handleBrokerAction = (brokerId, action) => {
    setBrokerage(prev => prev.map(b => {
      if (b.id !== brokerId) return b;
      if (action === 'approve') { logAudit('Approved cross-region brokerage ' + brokerId, brokerId); toast('Cross-region brokerage approved', 'success', 'HQ approval'); return { ...b, status: 'approved' }; }
      if (action === 'reject')  { logAudit('Rejected brokerage ' + brokerId, brokerId); toast('Brokerage rejected', 'warn'); return { ...b, status: 'rejected' }; }
      return b;
    }));
    setOpenBroker(null);
  };

  // Continued in next part
  /* ──────────────────────────────────────────────────────────────────
     RENDER: LOGIN
  ────────────────────────────────────────────────────────────────── */
  if (!authed) {
    return (
      <div className="arcs">
        <div className="login-screen">
          <div className="login-card">
            <div className="login-left">
              <div className="login-brand">
                <div className="login-mark">A</div>
                <div className="login-brand-text">
                  <div className="name">ARCS</div>
                  <div className="sub">Ambulance Routing</div>
                </div>
              </div>
              <div>
                <div className="login-eyebrow">Ambulance Routing &amp; Coordination System · GhERIG</div>
                <h1 className="login-headline">Every wheel. <em>Every minute.</em> Every patient.</h1>
                <p className="login-tagline">National Ambulance Service operational system.</p>
              </div>
              <div className="login-meta">
                <div className="login-meta-item">REGIONS · <b>{REGIONS.length}</b></div>
                <div className="login-meta-item">DISTRICTS · <b>{DISTRICTS.length} live · 261 in pilot</b></div>
                <div className="login-meta-item">VEHICLES · <b>{VEHICLES.length} live · 356 NAS fleet</b></div>
              </div>
            </div>
            <div className="login-right">
              <div className="login-form-card">
                <div className="login-form-icon">⛬</div>
                <div className="login-form-title">Dispatch sign-in</div>
                <div className="login-form-sub">Demo build — choose a role to preview that workflow.</div>
                <div className="field">
                  <label className="field-label">Staff email or council #</label>
                  <input className="field-input" defaultValue="dispatcher.tetteh@arcs.gherig.gov.gh" />
                </div>
                <div className="field">
                  <label className="field-label">Password</label>
                  <input className="field-input" type="password" defaultValue="●●●●●●●●●●" />
                </div>
                <div className="field">
                  <label className="field-label">Demo role</label>
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
                  Enter Dispatch Centre <span style={{ fontSize: 14 }}>→</span>
                </button>
                <div className="login-fineprint">Authorised NAS staff only · Audited access</div>
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

  // Scope dispatches/vehicles by user.region
  const scopedDispatches = user.region === 'all'
    ? dispatches
    : dispatches.filter(d => d.fromRegion === user.region || d.toRegion === user.region);
  const scopedVehicles = user.region === 'all'
    ? vehicles
    : vehicles.filter(v => v.region === user.region);

  const pendingCount = scopedDispatches.filter(d => d.state === 'requested').length;
  const openBrokerCount = brokerage.filter(b => b.status === 'pending_hq').length;

  const facilityChipName = user.region === 'all'
    ? 'NAS National Headquarters'
    : 'Regional Dispatch · ' + regionLabel(user.region);
  const facilityChipMeta = user.region === 'all'
    ? 'Accra · national scope'
    : (REGIONS.find(r => r.code === user.region) || {}).hqCity + ' · regional scope';

  return (
    <div className="arcs">
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-brand">
          <div className="topbar-mark">A</div>
          <div>
            <div className="topbar-name">ARCS</div>
            <div className="topbar-sub">Routing &amp; Coordination</div>
          </div>
        </div>
        <div className="topbar-context">
          <div className="facility-chip">
            <div className="facility-chip-mark">{user.region === 'all' ? 'N' : user.region}</div>
            <div style={{ lineHeight: 1.1 }}>
              <div className="facility-chip-name">{facilityChipName}</div>
              <div className="facility-chip-meta">{facilityChipMeta}</div>
            </div>
          </div>
          <div className="topbar-status">
            <span className="live-pill"><span className="live-dot" />Live · {scopedVehicles.length} vehicles tracked</span>
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
            <div className="user-meta-row"><span className="k">Scope</span><span className="v">{user.region === 'all' ? 'National' : 'Regional · ' + regionLabel(user.region)}</span></div>
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
                  {item.id === 'dispatch' && pendingCount > 0 && (
                    <span className="sb-item-badge">{pendingCount}</span>
                  )}
                  {item.id === 'brokerage' && openBrokerCount > 0 && (
                    <span className="sb-item-badge amber">{openBrokerCount}</span>
                  )}
                  {item.id === 'necc' && pendingCount > 0 && (
                    <span className="sb-item-badge">{pendingCount}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
          <div className="sb-footer">
            <div className="sb-footer-line">Build · <b>v1.0.0</b></div>
            <div className="sb-footer-line">NCRIS · <b>Online</b></div>
            <div className="sb-footer-line">NECC · <b>Connected</b></div>
            <div className="sb-footer-line">Engine · <b>Ghana STG + WHO</b></div>
          </div>
        </aside>

        <main className="main">
          {view === 'overview'   && <OverviewView vehicles={scopedVehicles} dispatches={scopedDispatches} brokerage={brokerage} userScope={user.region} setView={setView} setOpenDispatch={setOpenDispatch} handleRefresh={handleRefresh} />}
          {view === 'dispatch'   && <DispatchConsoleView dispatches={scopedDispatches} vehicles={scopedVehicles} onAssign={handleOpenAssign} onDecline={handleDecline} setOpenDispatch={setOpenDispatch} userScope={user.region} />}
          {view === 'brokerage'  && <BrokerageView brokerage={brokerage} setOpenBroker={setOpenBroker} onAction={handleBrokerAction} userScope={user.region} />}
          {view === 'active'     && <ActiveDispatchesView dispatches={scopedDispatches} filterRegion={filterRegion} setFilterRegion={setFilterRegion} filterState={filterState} setFilterState={setFilterState} searchQuery={searchQuery} setSearchQuery={setSearchQuery} activePage={activePage} setActivePage={setActivePage} setOpenDispatch={setOpenDispatch} handleExportCSV={handleExportCSV} userScope={user.region} onAdvance={handleAdvanceState} />}
          {view === 'necc'       && <NeccLiaisonView dispatches={scopedDispatches} onAssign={handleOpenAssign} onDecline={handleDecline} setOpenDispatch={setOpenDispatch} />}
          {view === 'stations'   && <StationsView vehicles={scopedVehicles} filterStatus={filterStatus} setFilterStatus={setFilterStatus} userScope={user.region} handleExportCSV={handleExportCSV} />}
          {view === 'runrecords' && <RunRecordsView records={runRecords} handleExportCSV={handleExportCSV} />}
          {view === 'audit'      && <AuditView audit={audit} auditPage={auditPage} setAuditPage={setAuditPage} handleExportCSV={handleExportCSV} userScope={user.region} />}
          {view === 'reports'    && <ReportsView dispatches={scopedDispatches} vehicles={scopedVehicles} handleExportCSV={handleExportCSV} userScope={user.region} />}
          {view === 'users'      && <UsersAdminView />}
        </main>
      </div>

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

      {/* DISPATCH DETAIL MODAL */}
      {openDispatch && (
        <DispatchDetailModal
          dispatch={dispatches.find(d => d.id === openDispatch)}
          onClose={() => setOpenDispatch(null)}
          onAdvance={handleAdvanceState}
        />
      )}

      {/* ASSIGN VEHICLE MODAL */}
      {assignFor && (
        <AssignVehicleModal
          dispatch={dispatches.find(d => d.id === assignFor)}
          availableVehicles={vehicles.filter(v => v.status === 'available' && (user.region === 'all' || v.region === (dispatches.find(d => d.id === assignFor) || {}).fromRegion))}
          onClose={() => setAssignFor(null)}
          onConfirm={(vehicleCode, eta) => handleConfirmAssign(assignFor, vehicleCode, eta)}
          onDecline={(reason) => handleDecline(assignFor, reason)}
        />
      )}

      {/* BROKERAGE DETAIL MODAL */}
      {openBroker && (
        <BrokerageDetailModal
          broker={brokerage.find(b => b.id === openBroker)}
          onClose={() => setOpenBroker(null)}
          onAction={(action) => handleBrokerAction(openBroker, action)}
          userScope={user.region}
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
   GHANA MAP — vehicle dots overlaid on Ghana outline
════════════════════════════════════════════════════════════════════ */
function GhanaMap({ vehicles }) {
  const bounds = { minLat: 4.5, maxLat: 11.3, minLng: -3.4, maxLng: 1.3 };
  const W = 400, H = 540;
  const project = (lat, lng) => ({
    x: ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * W,
    y: H - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * H,
  });

  const ghanaOutline = [
    [11.05, -2.93], [11.13, -2.05], [10.94, -1.04], [10.85, -0.16], [10.95, 0.32],
    [10.46, 0.56], [9.55,  0.61], [9.05,  0.36], [8.51,  0.55], [7.80,  0.83],
    [7.06,  0.51], [6.62,  0.78], [6.10,  1.20], [5.93,  1.21], [5.85,  1.06],
    [6.10,  0.30], [5.30, -0.47], [5.10, -0.70], [4.83, -1.85], [4.95, -2.34],
    [5.40, -2.99], [5.93, -3.24], [6.45, -3.39], [7.51, -3.05], [8.34, -2.62],
    [9.43, -2.79], [10.39, -2.85], [11.05, -2.93]
  ];
  const outlinePoints = ghanaOutline.map(([lat, lng]) => { const p = project(lat, lng); return p.x + ',' + p.y; }).join(' ');

  // Get district for each vehicle to position the dot
  const vehiclePositions = vehicles.map(v => {
    const d = DISTRICTS.find(x => x.code === v.district);
    if (!d) return null;
    const p = project(d.lat, d.lng);
    return { ...v, x: p.x, y: p.y };
  }).filter(Boolean);

  return (
    <div className="map-frame">
      <svg className="map-svg" viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="xMidYMid meet">
        <polygon points={outlinePoints} className="map-region-fill" />
        {[6, 7, 8, 9, 10].map(lat => {
          const p1 = project(lat, bounds.minLng), p2 = project(lat, bounds.maxLng);
          return <line key={'lat'+lat} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#E0DCCE" strokeWidth="0.5" strokeDasharray="2,3" />;
        })}
        {[-2, -1, 0].map(lng => {
          const p1 = project(bounds.minLat, lng), p2 = project(bounds.maxLat, lng);
          return <line key={'lng'+lng} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#E0DCCE" strokeWidth="0.5" strokeDasharray="2,3" />;
        })}
        {/* Region HQ markers */}
        {REGIONS.map(r => {
          const p = project(r.lat, r.lng);
          return (
            <g key={r.code}>
              <rect x={p.x - 4} y={p.y - 4} width="8" height="8" fill="#fff" stroke="var(--copper)" strokeWidth="1.5" />
            </g>
          );
        })}
        {/* Region labels */}
        <text x={20} y={120} className="map-region-label">NORTHERN</text>
        <text x={120} y={250} className="map-region-label">BONO</text>
        <text x={210} y={290} className="map-region-label">ASHANTI</text>
        <text x={300} y={355} className="map-region-label">EASTERN</text>
        <text x={325} y={335} className="map-region-label">VOLTA</text>
        <text x={120} y={420} className="map-region-label">WESTERN</text>
        <text x={210} y={460} className="map-region-label">CENTRAL</text>
        <text x={300} y={490} className="map-region-label">GREATER ACCRA</text>
        {/* Vehicle dots */}
        {vehiclePositions.map(v => {
          // Slight offset for stacked vehicles in same district
          const offset = (parseInt(v.code.slice(-2), 10) % 5) * 1.2;
          return (
            <g key={v.code}>
              <circle cx={v.x + offset} cy={v.y} r={4} className={'map-vehicle-dot status-' + v.status} stroke="#fff" strokeWidth="1.2">
                <title>{v.code} · {VEHICLE_STATUS_LABELS[v.status]} · {districtLabel(v.district)}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      <div className="map-legend">
        <div className="map-legend-item"><span className="map-legend-dot" style={{ background: 'var(--emerald)' }} /> Available</div>
        <div className="map-legend-item"><span className="map-legend-dot" style={{ background: 'var(--copper)' }} /> Dispatched / on scene</div>
        <div className="map-legend-item"><span className="map-legend-dot" style={{ background: 'var(--amber)' }} /> En route</div>
        <div className="map-legend-item"><span className="map-legend-dot" style={{ background: 'var(--gold)' }} /> Returning</div>
        <div className="map-legend-item"><span className="map-legend-dot" style={{ background: 'var(--ink-4)' }} /> Maintenance</div>
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>{vehicles.length} vehicles tracked</div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   OVERVIEW
════════════════════════════════════════════════════════════════════ */
function OverviewView({ vehicles, dispatches, brokerage, userScope, setView, setOpenDispatch, handleRefresh }) {
  const available = vehicles.filter(v => v.status === 'available').length;
  const inFlight = vehicles.filter(v => v.status === 'dispatched' || v.status === 'en_route' || v.status === 'on_scene' || v.status === 'returning').length;
  const offline = vehicles.filter(v => v.status === 'maintenance' || v.status === 'offline').length;
  const pending = dispatches.filter(d => d.state === 'requested').length;
  const openBroker = brokerage.filter(b => b.status === 'pending_hq').length;

  // Top active dispatches
  const topDispatches = dispatches
    .filter(d => d.state !== 'cleared' && d.state !== 'arrived')
    .sort((a, b) => {
      const rank = { critical: 0, high: 1, routine: 2 };
      return (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3);
    })
    .slice(0, 5);

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">{userScope === 'all' ? 'National Ambulance Service · live' : regionLabel(userScope) + ' regional · live'}</div>
          <h1 className="page-title">{userScope === 'all' ? 'National Fleet Overview' : 'Regional Overview · ' + regionLabel(userScope)}</h1>
          <p className="page-sub">{userScope === 'all'
            ? 'National picture across all 16 regional dispatch centres and 261 districts. Cross-region brokerage, fleet utilisation, and MoH-grade reporting.'
            : 'Regional dispatch board for ' + regionLabel(userScope) + '. Vehicles, active dispatches, and incoming transfer requests from NECC.'}</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => handleRefresh('Overview')}><span>↻</span> Refresh</button>
          {userScope !== 'all' && (
            <button type="button" className="btn btn-primary" onClick={() => setView('dispatch')}><span>⌖</span> Dispatch Console</button>
          )}
          {userScope === 'all' && openBroker > 0 && (
            <button type="button" className="btn btn-warn" onClick={() => setView('brokerage')}><span>⇆</span> {openBroker} pending HQ</button>
          )}
        </div>
      </div>

      <div className="kpi-strip">
        <KpiCard color="emerald" label="Available" value={available}
          delta={Math.round(available / Math.max(1, vehicles.length) * 100) + '%'} deltaType="dn"
          foot="Ready for dispatch" />
        <KpiCard color="amber" label="In flight" value={inFlight}
          delta="" deltaType="neu"
          foot="Dispatched, en route, on scene" />
        <KpiCard color="crimson" label="Pending" value={pending}
          delta={pending > 0 ? 'awaiting dispatcher' : 'none'} deltaType={pending > 0 ? 'up' : 'dn'}
          foot="Requested / unassigned" />
        <KpiCard color="copper" label="Cross-region" value={openBroker}
          delta="" deltaType="neu"
          foot="Pending HQ authorisation" />
        <KpiCard color="indigo" label="Out of service" value={offline}
          delta="" deltaType="neu"
          foot="Maintenance / offline" />
      </div>

      <div className="two-col">
        <div>
          <SectionHead title={userScope === 'all' ? 'National vehicle map' : regionLabel(userScope) + ' vehicle map'} meta={vehicles.length + ' vehicles'} />
          <GhanaMap vehicles={vehicles} />
        </div>
        <div>
          <SectionHead title="Active dispatches" meta={topDispatches.length} />
          <div className="card">
            {topDispatches.length === 0 ? (
              <div className="empty-state">
                <div className="em-title">All quiet</div>
                <div className="em-sub">No active dispatches in this scope</div>
              </div>
            ) : (
              topDispatches.map(d => {
                const priorityColor = d.priority === 'critical' ? 'var(--crimson)' : d.priority === 'high' ? 'var(--amber)' : 'var(--forest-mid)';
                const stateInfo = DISPATCH_STATES[d.state];
                return (
                  <div key={d.id} className={'dispatch-row priority-' + d.priority} onClick={() => setOpenDispatch(d.id)} style={{ gridTemplateColumns: '80px 1fr 1fr 80px', cursor: 'pointer' }}>
                    <span className="dispatch-pill" style={{ background: priorityColor, color: '#fff' }}>{d.priority.slice(0, 4).toUpperCase()}</span>
                    <div>
                      <div className="dispatch-from">{d.condition}</div>
                      <div className="dispatch-from-sub">{d.fromFacility}</div>
                    </div>
                    <div>
                      <div className="dispatch-to">{stateInfo ? stateInfo.label : d.state}</div>
                      <div className="dispatch-to-sub">{d.vehicle || 'unassigned'}{d.eta ? ' · ETA ' + d.eta + 'm' : ''}</div>
                    </div>
                    <div className="dispatch-id" style={{ textAlign: 'right' }}>{fmtAgo(d.requestedAt)}</div>
                  </div>
                );
              })
            )}
          </div>

          {userScope === 'all' && (
            <>
              <SectionHead title="Cross-region brokerage" meta={openBroker + ' pending'} />
              <div className="card" style={{ padding: openBroker === 0 ? 0 : 8 }}>
                {brokerage.filter(b => b.status === 'pending_hq').slice(0, 3).map(b => (
                  <div key={b.id} className="dispatch-row" style={{ gridTemplateColumns: '1fr 1fr 80px', borderLeft: '4px solid var(--amber)', paddingLeft: 13 }}>
                    <div>
                      <div className="dispatch-from">{regionLabel(b.requestingRegion)} → {regionLabel(b.targetRegion)}</div>
                      <div className="dispatch-from-sub">{b.condition}</div>
                    </div>
                    <div className="dispatch-to-sub">{b.fromFacility}</div>
                    <div className="dispatch-id" style={{ textAlign: 'right' }}>{fmtAgo(b.raisedAt)}</div>
                  </div>
                ))}
                {openBroker === 0 && <div className="empty-state"><div className="em-title">No pending brokerage</div><div className="em-sub">All cross-region requests resolved</div></div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DISPATCH CONSOLE — regional dispatcher's primary workspace
════════════════════════════════════════════════════════════════════ */
function DispatchConsoleView({ dispatches, vehicles, onAssign, onDecline, setOpenDispatch, userScope }) {
  const requested = dispatches.filter(d => d.state === 'requested');
  const inFlight = dispatches.filter(d => d.state !== 'requested' && d.state !== 'arrived' && d.state !== 'cleared');
  const available = vehicles.filter(v => v.status === 'available');

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Dispatcher workspace</div>
          <h1 className="page-title">Dispatch Console</h1>
          <p className="page-sub">Incoming transfer requests from NECC, 112 scene calls, and pending dispatch decisions. Click any pending request to assign a vehicle. Click an in-flight dispatch to advance its state.</p>
        </div>
      </div>

      <div className="kpi-strip">
        <KpiCard color="crimson" label="Pending" value={requested.length}
          delta={requested.length > 0 ? 'action needed' : 'all clear'} deltaType={requested.length > 0 ? 'up' : 'dn'}
          foot="Awaiting vehicle assignment" />
        <KpiCard color="amber" label="In flight" value={inFlight.length} delta="" deltaType="neu" foot="Currently dispatched" />
        <KpiCard color="emerald" label="Available vehicles" value={available.length} delta="" deltaType="dn" foot="Ready in scope" />
        <KpiCard color="copper" label="Critical priority" value={dispatches.filter(d => d.priority === 'critical' && d.state !== 'cleared').length} delta="" deltaType="neu" foot="Across all states" />
        <KpiCard color="indigo" label="NECC-routed" value={dispatches.filter(d => d.type === 'necc_routed').length} delta="" deltaType="neu" foot="From bed-search" />
      </div>

      <SectionHead title="Pending — requires action" meta={requested.length + ' awaiting'} />
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '90px 80px 1fr 1fr 90px 100px 140px', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--paper-3)', fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
          <div>Priority</div><div>ID</div><div>Patient · condition</div><div>Route</div><div>Type</div><div>Received</div><div style={{ textAlign: 'right' }}>Action</div>
        </div>
        {requested.length === 0 ? (
          <div className="empty-state">
            <div className="em-title">No pending dispatches</div>
            <div className="em-sub">All clear in this scope</div>
          </div>
        ) : (
          requested.map(d => {
            const priorityColor = d.priority === 'critical' ? 'var(--crimson)' : d.priority === 'high' ? 'var(--amber)' : 'var(--forest-mid)';
            const typeInfo = DISPATCH_TYPES[d.type];
            return (
              <div key={d.id} className={'dispatch-row priority-' + d.priority}>
                <span className="dispatch-pill" style={{ background: priorityColor, color: '#fff' }}>{d.priority.slice(0, 4).toUpperCase()}</span>
                <span className="dispatch-id">{d.id.slice(-8)}</span>
                <div>
                  <div className="dispatch-from">{d.condition}</div>
                  <div className="dispatch-from-sub">{d.patientInitials} · {d.patientAge ? d.patientAge + d.patientSex : '—'} · {d.stability}</div>
                </div>
                <div>
                  <div className="dispatch-to">{d.fromFacility}</div>
                  <div className="dispatch-to-sub">→ {d.toFacility}</div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--copper)' }}>
                  {typeInfo ? typeInfo.icon + ' ' + typeInfo.label.split(' ')[0] : d.type}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>{fmtAgo(d.requestedAt)}</div>
                <div className="dispatch-actions" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-sm" onClick={() => setOpenDispatch(d.id)}>View</button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => onAssign(d.id)}>Assign →</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {inFlight.length > 0 && (
        <>
          <SectionHead title="In flight" meta={inFlight.length + ' active'} />
          <div className="card">
            <div style={{ display: 'grid', gridTemplateColumns: '90px 80px 1fr 1fr 110px 100px 140px', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--paper-3)', fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
              <div>Priority</div><div>Vehicle</div><div>Patient · condition</div><div>Route</div><div>State</div><div>Started</div><div style={{ textAlign: 'right' }}>Action</div>
            </div>
            {inFlight.map(d => {
              const priorityColor = d.priority === 'critical' ? 'var(--crimson)' : d.priority === 'high' ? 'var(--amber)' : 'var(--forest-mid)';
              const stateInfo = DISPATCH_STATES[d.state];
              return (
                <div key={d.id} className={'dispatch-row priority-' + d.priority} style={{ gridTemplateColumns: '90px 80px 1fr 1fr 110px 100px 140px' }}>
                  <span className="dispatch-pill" style={{ background: priorityColor, color: '#fff' }}>{d.priority.slice(0, 4).toUpperCase()}</span>
                  <span className="dispatch-id" style={{ fontWeight: 600, color: 'var(--ink-1)' }}>{d.vehicle ? d.vehicle.slice(-6) : '—'}</span>
                  <div>
                    <div className="dispatch-from">{d.condition}</div>
                    <div className="dispatch-from-sub">{d.patientInitials} · {d.patientAge ? d.patientAge + d.patientSex : '—'}</div>
                  </div>
                  <div>
                    <div className="dispatch-to">{d.fromFacility}</div>
                    <div className="dispatch-to-sub">→ {d.toFacility}</div>
                  </div>
                  <div>
                    <span className="dispatch-pill" style={{ background: 'var(--copper-pale)', color: 'var(--copper)' }}>{stateInfo ? stateInfo.label : d.state}</span>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 3 }}>{d.eta ? 'ETA ' + d.eta + ' min' : ''}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>{fmtAgo(d.requestedAt)}</div>
                  <div className="dispatch-actions" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpenDispatch(d.id)}>Open →</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   BROKERAGE CONSOLE — HQ approves cross-region authorisation
════════════════════════════════════════════════════════════════════ */
function BrokerageView({ brokerage, setOpenBroker, onAction, userScope }) {
  const pending = brokerage.filter(b => b.status === 'pending_hq');
  const approved = brokerage.filter(b => b.status === 'approved');
  const rejected = brokerage.filter(b => b.status === 'rejected');
  const isHQ = userScope === 'all';

  const renderRow = (b) => (
    <div key={b.id} className="dispatch-row" style={{ gridTemplateColumns: '120px 1fr 1fr 100px 140px', borderLeft: '4px solid ' + (b.status === 'pending_hq' ? 'var(--amber)' : b.status === 'approved' ? 'var(--emerald)' : 'var(--ink-4)'), paddingLeft: 13 }}>
      <span className="dispatch-id" style={{ fontWeight: 700, color: 'var(--copper)' }}>{regionLabel(b.requestingRegion)} → {regionLabel(b.targetRegion)}</span>
      <div>
        <div className="dispatch-from">{b.condition}</div>
        <div className="dispatch-from-sub">{b.fromFacility} → {b.toFacility}</div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{b.reason}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>{fmtAgo(b.raisedAt)}</div>
      <div className="dispatch-actions" style={{ justifyContent: 'flex-end' }}>
        {isHQ && b.status === 'pending_hq' && (
          <>
            <button type="button" className="btn btn-sm" onClick={() => onAction(b.id, 'reject')}>Reject</button>
            <button type="button" className="btn btn-sm btn-success" onClick={() => onAction(b.id, 'approve')}>Approve</button>
          </>
        )}
        {!isHQ && b.status === 'pending_hq' && <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>HQ review</span>}
        {b.status !== 'pending_hq' && <span className="dispatch-pill" style={{ background: b.status === 'approved' ? 'var(--emerald-pale)' : 'var(--paper-3)', color: b.status === 'approved' ? 'var(--emerald)' : 'var(--ink-3)' }}>{b.status}</span>}
      </div>
    </div>
  );

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">{isHQ ? 'NAS HQ authorisation queue' : 'Cross-region brokerage status'}</div>
          <h1 className="page-title">Inter-Region Brokerage</h1>
          <p className="page-sub">{isHQ
            ? 'Cross-region transfers require National Coordinator authorisation. Approve when a region cannot cover its own request and a neighbouring region can supply a vehicle.'
            : 'Read-only view of cross-region requests in the system. Only NAS National Coordinator can approve.'}</p>
        </div>
      </div>

      <div className="kpi-strip">
        <KpiCard color="amber" label="Pending HQ" value={pending.length}
          delta={pending.length > 0 ? (isHQ ? 'action needed' : 'awaiting HQ') : 'none'}
          deltaType={pending.length > 0 ? 'up' : 'dn'}
          foot="Cross-region requests" />
        <KpiCard color="emerald" label="Approved · today" value={approved.length} delta="" deltaType="dn" foot="Cross-region authorised" />
        <KpiCard color="indigo" label="Rejected · today" value={rejected.length} delta="" deltaType="neu" foot="Did not meet criteria" />
        <KpiCard color="copper" label="Avg approval time" value="14 min" delta="" deltaType="neu" foot="HQ response time" />
        <KpiCard color="forest" label="Network status" value={pending.length > 3 ? 'Surge' : 'Normal'} delta="" deltaType="neu" foot="Regional saturation" />
      </div>

      <SectionHead title={isHQ ? 'Pending — awaiting HQ' : 'Pending — under HQ review'} meta={pending.length} />
      <div className="card">
        {pending.length === 0
          ? <div className="empty-state"><div className="em-title">No pending brokerage</div><div className="em-sub">All cross-region requests resolved</div></div>
          : pending.map(renderRow)}
      </div>

      {approved.length > 0 && (
        <>
          <SectionHead title="Approved · in flight" meta={approved.length} />
          <div className="card">{approved.map(renderRow)}</div>
        </>
      )}

      {rejected.length > 0 && (
        <>
          <SectionHead title="Rejected" meta={rejected.length} />
          <div className="card">{rejected.map(renderRow)}</div>
        </>
      )}
    </div>
  );
}
/* ════════════════════════════════════════════════════════════════════
   ACTIVE DISPATCHES — full table with filters & lifecycle controls
════════════════════════════════════════════════════════════════════ */
function ActiveDispatchesView({ dispatches, filterRegion, setFilterRegion, filterState, setFilterState, searchQuery, setSearchQuery, activePage, setActivePage, setOpenDispatch, handleExportCSV, userScope, onAdvance }) {
  const PAGE_SIZE = 12;

  let filtered = dispatches;
  if (filterRegion !== 'all') filtered = filtered.filter(d => d.fromRegion === filterRegion || d.toRegion === filterRegion);
  if (filterState !== 'all') filtered = filtered.filter(d => d.state === filterState);
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(d =>
      d.id.toLowerCase().includes(q) ||
      d.condition.toLowerCase().includes(q) ||
      (d.vehicle || '').toLowerCase().includes(q) ||
      d.fromFacility.toLowerCase().includes(q) ||
      d.toFacility.toLowerCase().includes(q)
    );
  }

  const priorityRank = { critical: 0, high: 1, routine: 2 };
  filtered = [...filtered].sort((a, b) => {
    const pa = priorityRank[a.priority] ?? 3;
    const pb = priorityRank[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    return b.requestedAt.getTime() - a.requestedAt.getTime();
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(activePage, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const counts = {
    all: dispatches.length,
    requested: dispatches.filter(d => d.state === 'requested').length,
    en_route_pickup: dispatches.filter(d => d.state === 'en_route_pickup').length,
    on_scene: dispatches.filter(d => d.state === 'on_scene').length,
    en_route_dest: dispatches.filter(d => d.state === 'en_route_dest').length,
    arrived: dispatches.filter(d => d.state === 'arrived').length,
  };

  const exportRows = filtered.map(d => [
    d.id, d.priority, d.type, d.state, d.condition, d.patientInitials,
    d.patientAge != null ? d.patientAge + d.patientSex : '',
    d.fromFacility, d.toFacility, d.vehicle || '',
    fmtTime(d.requestedAt), fmtTime(d.assignedAt), fmtTime(d.arrivedAt),
    d.distanceKm, d.eta || '',
  ]);

  const headerRowStyle = { display: 'grid', gridTemplateColumns: '90px 80px 1fr 1fr 110px 100px 140px', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--paper-3)', fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)' };

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">All states · live</div>
          <h1 className="page-title">Active Dispatches</h1>
          <p className="page-sub">Every dispatch in flight across the {userScope === 'all' ? 'entire NAS network' : regionLabel(userScope) + ' region'}. Filter by lifecycle state, region, or search by ID, condition, vehicle, or facility.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => handleExportCSV(
            'arcs_dispatches_' + new Date().toISOString().slice(0,10) + '.csv',
            ['ID','Priority','Type','State','Condition','Patient','Age/Sex','From','To','Vehicle','Requested','Assigned','Arrived','Distance km','ETA min'],
            exportRows
          )}><span>↓</span> Export CSV</button>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <span className={'filter-pill ' + (filterState === 'all' ? 'active' : '')} onClick={() => { setFilterState('all'); setActivePage(1); }}>All <span className="count">{counts.all}</span></span>
          <span className={'filter-pill ' + (filterState === 'requested' ? 'active' : '')} onClick={() => { setFilterState('requested'); setActivePage(1); }}>Pending <span className="count">{counts.requested}</span></span>
          <span className={'filter-pill ' + (filterState === 'en_route_pickup' ? 'active' : '')} onClick={() => { setFilterState('en_route_pickup'); setActivePage(1); }}>To pickup <span className="count">{counts.en_route_pickup}</span></span>
          <span className={'filter-pill ' + (filterState === 'on_scene' ? 'active' : '')} onClick={() => { setFilterState('on_scene'); setActivePage(1); }}>On scene <span className="count">{counts.on_scene}</span></span>
          <span className={'filter-pill ' + (filterState === 'en_route_dest' ? 'active' : '')} onClick={() => { setFilterState('en_route_dest'); setActivePage(1); }}>To dest <span className="count">{counts.en_route_dest}</span></span>
          <span className={'filter-pill ' + (filterState === 'arrived' ? 'active' : '')} onClick={() => { setFilterState('arrived'); setActivePage(1); }}>Arrived <span className="count">{counts.arrived}</span></span>
          {userScope === 'all' && (
            <select className="field-input" style={{ width: 'auto', padding: '6px 10px', fontSize: 11.5 }} value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setActivePage(1); }}>
              <option value="all">All regions</option>
              {REGIONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          )}
          <div className="filter-search">
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>⌕</span>
            <input placeholder="Search ID, condition, vehicle, or facility..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setActivePage(1); }} />
          </div>
        </div>

        <div style={headerRowStyle}>
          <div>Priority</div>
          <div>ID</div>
          <div>Patient · condition</div>
          <div>Route</div>
          <div>State</div>
          <div>Time</div>
          <div style={{ textAlign: 'right' }}>Action</div>
        </div>

        {paged.length === 0 ? (
          <div className="empty-state"><div className="em-title">No matches</div><div className="em-sub">Try removing filters or changing search</div></div>
        ) : (
          paged.map(d => {
            const priorityColor = d.priority === 'critical' ? 'var(--crimson)' : d.priority === 'high' ? 'var(--amber)' : 'var(--forest-mid)';
            const stateInfo = DISPATCH_STATES[d.state];
            const nextState = d.state === 'assigned' ? 'en_route_pickup'
                            : d.state === 'en_route_pickup' ? 'on_scene'
                            : d.state === 'on_scene' ? 'en_route_dest'
                            : d.state === 'en_route_dest' ? 'arrived'
                            : d.state === 'arrived' ? 'cleared'
                            : null;
            return (
              <div key={d.id} className={'dispatch-row priority-' + d.priority} style={{ gridTemplateColumns: '90px 80px 1fr 1fr 110px 100px 140px' }}>
                <span className="dispatch-pill" style={{ background: priorityColor, color: '#fff' }}>{d.priority.slice(0, 4).toUpperCase()}</span>
                <span className="dispatch-id">{d.id.slice(-8)}</span>
                <div>
                  <div className="dispatch-from">{d.condition}</div>
                  <div className="dispatch-from-sub">{d.patientInitials} · {d.patientAge != null ? d.patientAge + d.patientSex : '—'} · {d.vehicle || 'no vehicle'}</div>
                </div>
                <div>
                  <div className="dispatch-to">{d.fromFacility}</div>
                  <div className="dispatch-to-sub">→ {d.toFacility}</div>
                </div>
                <div>
                  <span className="dispatch-pill" style={{ background: 'var(--copper-pale)', color: 'var(--copper)' }}>{stateInfo ? stateInfo.label : d.state}</span>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 3 }}>{d.eta ? 'ETA ' + d.eta + 'm' : d.distanceKm + ' km'}</div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>{fmtAgo(d.requestedAt)}</div>
                <div className="dispatch-actions" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-sm" onClick={() => setOpenDispatch(d.id)}>Open</button>
                  {nextState && (
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => onAdvance(d.id, nextState)}>{DISPATCH_STATES[nextState].label.split(' ')[0]} →</button>
                  )}
                </div>
              </div>
            );
          })
        )}

        <div className="pagination">
          <div className="pg-info">Showing <b>{paged.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–{(safePage - 1) * PAGE_SIZE + paged.length}</b> of <b>{filtered.length}</b></div>
          <div className="pg-controls">
            <button type="button" className="pg-btn" disabled={safePage === 1} onClick={() => setActivePage(1)}>«</button>
            <button type="button" className="pg-btn" disabled={safePage === 1} onClick={() => setActivePage(safePage - 1)}>‹</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(totalPages - 4, safePage - 2)) + i;
              if (p > totalPages) return null;
              return <button key={p} type="button" className={'pg-btn ' + (p === safePage ? 'active' : '')} onClick={() => setActivePage(p)}>{p}</button>;
            })}
            <button type="button" className="pg-btn" disabled={safePage === totalPages} onClick={() => setActivePage(safePage + 1)}>›</button>
            <button type="button" className="pg-btn" disabled={safePage === totalPages} onClick={() => setActivePage(totalPages)}>»</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   NECC LIAISON
════════════════════════════════════════════════════════════════════ */
function NeccLiaisonView({ dispatches, onAssign, onDecline, setOpenDispatch }) {
  const neccRouted = dispatches.filter(d => d.type === 'necc_routed');
  const pending = neccRouted.filter(d => d.state === 'requested');
  const inFlight = neccRouted.filter(d => d.state !== 'requested' && d.state !== 'cleared');

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">NECC bed-search → ARCS</div>
          <h1 className="page-title">NECC Liaison</h1>
          <p className="page-sub">Transfer requests originating from NECC's bed-search, where a national operator has matched a referral to a receiving facility and now needs a vehicle. These appear here for the regional dispatcher to assign or decline.</p>
        </div>
      </div>

      <div className="kpi-strip">
        <KpiCard color="crimson" label="Pending NECC requests" value={pending.length} delta={pending.length > 0 ? 'action needed' : 'all clear'} deltaType={pending.length > 0 ? 'up' : 'dn'} foot="Vehicle assignment required" />
        <KpiCard color="amber" label="In flight" value={inFlight.length} delta="" deltaType="neu" foot="NECC-routed currently moving" />
        <KpiCard color="emerald" label="Accept rate · 24h" value="92%" delta="" deltaType="dn" foot="ARCS acceptance of NECC routing" />
        <KpiCard color="copper" label="Avg ack time" value="2.1 min" delta="" deltaType="neu" foot="From NECC route to assigned" />
        <KpiCard color="indigo" label="Linked NECC refs" value={neccRouted.length} delta="" deltaType="neu" foot="Active referral linkage" />
      </div>

      <SectionHead title="Pending — from NECC bed-search" meta={pending.length} />
      <div className="card">
        {pending.length === 0 ? (
          <div className="empty-state"><div className="em-title">No pending NECC routes</div><div className="em-sub">All transfer requests have been actioned</div></div>
        ) : (
          pending.map(d => {
            const priorityColor = d.priority === 'critical' ? 'var(--crimson)' : d.priority === 'high' ? 'var(--amber)' : 'var(--forest-mid)';
            return (
              <div key={d.id} className={'dispatch-row priority-' + d.priority} style={{ gridTemplateColumns: '90px 80px 1fr 1fr 100px 140px' }}>
                <span className="dispatch-pill" style={{ background: priorityColor, color: '#fff' }}>{d.priority.slice(0, 4).toUpperCase()}</span>
                <span className="dispatch-id">{d.id.slice(-8)}</span>
                <div>
                  <div className="dispatch-from">{d.condition}</div>
                  <div className="dispatch-from-sub">NECC ref · {d.neccRefId}</div>
                </div>
                <div>
                  <div className="dispatch-to">{d.fromFacility}</div>
                  <div className="dispatch-to-sub">→ {d.toFacility}</div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>{fmtAgo(d.requestedAt)}</div>
                <div className="dispatch-actions" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-sm" onClick={() => setOpenDispatch(d.id)}>View</button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => onAssign(d.id)}>Assign</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {inFlight.length > 0 && (
        <>
          <SectionHead title="NECC routes in flight" meta={inFlight.length} />
          <div className="card">
            {inFlight.map(d => {
              const stateInfo = DISPATCH_STATES[d.state];
              return (
                <div key={d.id} className="dispatch-row" style={{ gridTemplateColumns: '80px 1fr 1fr 110px 140px' }}>
                  <span className="dispatch-id">{d.id.slice(-8)}</span>
                  <div>
                    <div className="dispatch-from">{d.condition}</div>
                    <div className="dispatch-from-sub">{d.fromFacility} → {d.toFacility}</div>
                  </div>
                  <div>
                    <div className="dispatch-to" style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{d.vehicle}</div>
                    <div className="dispatch-to-sub">{d.eta ? 'ETA ' + d.eta + ' min' : ''}</div>
                  </div>
                  <span className="dispatch-pill" style={{ background: 'var(--copper-pale)', color: 'var(--copper)' }}>{stateInfo ? stateInfo.label : d.state}</span>
                  <div className="dispatch-actions" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpenDispatch(d.id)}>Open</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   STATIONS & VEHICLES
════════════════════════════════════════════════════════════════════ */
function StationsView({ vehicles, filterStatus, setFilterStatus, userScope, handleExportCSV }) {
  let filtered = vehicles;
  if (filterStatus !== 'all') filtered = filtered.filter(v => v.status === filterStatus);

  const byDistrict = {};
  filtered.forEach(v => {
    if (!byDistrict[v.district]) byDistrict[v.district] = [];
    byDistrict[v.district].push(v);
  });

  const counts = {
    all: vehicles.length,
    available: vehicles.filter(v => v.status === 'available').length,
    en_route: vehicles.filter(v => v.status === 'en_route' || v.status === 'on_scene' || v.status === 'dispatched' || v.status === 'returning').length,
    maintenance: vehicles.filter(v => v.status === 'maintenance' || v.status === 'offline').length,
  };

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Fleet directory</div>
          <h1 className="page-title">Stations &amp; Vehicles</h1>
          <p className="page-sub">{userScope === 'all' ? 'All NAS stations and vehicles, grouped by district. Pilot footprint covers ' + DISTRICTS.length + ' districts; full NAS coverage is 261 districts.' : regionLabel(userScope) + ' regional fleet, grouped by district station.'}</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => handleExportCSV(
            'arcs_fleet_' + new Date().toISOString().slice(0,10) + '.csv',
            ['Plate','Type','Region','District','Station','Status','Crew'],
            vehicles.map(v => [v.code, v.type, v.region, districtLabel(v.district), stationLabel(v.station), v.status, v.crew.join(' / ')])
          )}><span>↓</span> Export CSV</button>
        </div>
      </div>

      <div className="kpi-strip">
        <KpiCard color="forest" label="Total fleet" value={vehicles.length} delta="" deltaType="neu" foot={Object.keys(byDistrict).length + ' stations'} />
        <KpiCard color="emerald" label="Available" value={counts.available} delta={Math.round(counts.available / Math.max(1, vehicles.length) * 100) + '%'} deltaType="dn" foot="Ready for dispatch" />
        <KpiCard color="amber" label="In service" value={counts.en_route} delta="" deltaType="neu" foot="Dispatched, en route, returning" />
        <KpiCard color="crimson" label="Out of service" value={counts.maintenance} delta="" deltaType="neu" foot="Maintenance / offline" />
        <KpiCard color="copper" label="Stations" value={Object.keys(byDistrict).length} delta="" deltaType="neu" foot="With vehicles in scope" />
      </div>

      <div className="card">
        <div className="filter-bar">
          <span className={'filter-pill ' + (filterStatus === 'all' ? 'active' : '')} onClick={() => setFilterStatus('all')}>All <span className="count">{counts.all}</span></span>
          <span className={'filter-pill ' + (filterStatus === 'available' ? 'active' : '')} onClick={() => setFilterStatus('available')}>Available <span className="count">{counts.available}</span></span>
          <span className={'filter-pill ' + (filterStatus === 'en_route' ? 'active' : '')} onClick={() => setFilterStatus('en_route')}>En route</span>
          <span className={'filter-pill ' + (filterStatus === 'on_scene' ? 'active' : '')} onClick={() => setFilterStatus('on_scene')}>On scene</span>
          <span className={'filter-pill ' + (filterStatus === 'maintenance' ? 'active' : '')} onClick={() => setFilterStatus('maintenance')}>Maintenance</span>
        </div>

        {Object.keys(byDistrict).length === 0 ? (
          <div className="empty-state"><div className="em-title">No vehicles match</div><div className="em-sub">Try changing filter</div></div>
        ) : (
          Object.entries(byDistrict).map(([dCode, vs]) => (
            <div key={dCode}>
              <div style={{ padding: '12px 18px', background: 'var(--paper-3)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{districtLabel(dCode)}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>{(DISTRICTS.find(d => d.code === dCode) || {}).code} · {regionLabel((DISTRICTS.find(d => d.code === dCode) || {}).region)}</div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>
                  {vs.length} vehicle{vs.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="veh-grid">
                {vs.map(v => (
                  <div key={v.code} className={'veh-tile status-' + v.status}>
                    <div className="veh-tile-head">
                      <div>
                        <div className="veh-plate">{v.code}</div>
                        <div className="veh-type">{v.type}</div>
                      </div>
                      <span className={'veh-status-pill vsp-' + v.status}>{VEHICLE_STATUS_LABELS[v.status] || v.status}</span>
                    </div>
                    <div className="veh-row"><div className="k">Crew</div><div>{v.crew.join(' · ')}</div></div>
                    <div className="veh-row"><div className="k">Station</div><div>{stationLabel(v.station)}</div></div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   PATIENT RUN RECORDS
════════════════════════════════════════════════════════════════════ */
function RunRecordsView({ records, handleExportCSV }) {
  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Handoff documentation · MoH-grade</div>
          <h1 className="page-title">Patient Run Records</h1>
          <p className="page-sub">Completed dispatch run records — interventions delivered en route, vital signs captured by the EMT device, and clinical handoff to the receiving doctor. Replicates back to NECC and the receiving hospital portal for continuity of care.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => handleExportCSV(
            'arcs_run_records_' + new Date().toISOString().slice(0,10) + '.csv',
            ['ID','Dispatch','Patient','Condition','From','To','Vehicle','Crew','On scene','Loaded','Arrived','Interventions','Handoff'],
            records.map(r => [r.id, r.dispatch, r.patient, r.condition, r.from, r.to, r.vehicle, r.crew, r.onScene, r.loaded, r.arrived, r.interventionsList.join(' · '), r.handoffSig])
          )}><span>↓</span> Export CSV</button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Run ID</th><th>Patient</th><th>Condition</th><th>Route</th>
                <th>Crew · Vehicle</th><th>On scene</th><th>Arrived</th><th>Handoff</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td className="id-cell">{r.id}</td>
                  <td><b>{r.patient}</b></td>
                  <td>{r.condition}</td>
                  <td>
                    <div style={{ fontSize: 11.5 }}>{r.from}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-3)' }}>→ {r.to}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 11 }}>{r.crew}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--copper)' }}>{r.vehicle}</div>
                  </td>
                  <td className="id-cell">{r.onScene}</td>
                  <td className="id-cell">{r.arrived}</td>
                  <td>
                    <div style={{ fontSize: 11.5, fontWeight: 600 }}>{r.handoffSig}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-3)' }}>{fmtAgo(r.signedAt)}</div>
                  </td>
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
   AUDIT REPLICATION
════════════════════════════════════════════════════════════════════ */
function AuditView({ audit, auditPage, setAuditPage, handleExportCSV, userScope }) {
  const PAGE_SIZE = 25;
  const scoped = userScope === 'all' ? audit : audit.filter(e => e.region === userScope || e.region === 'HQ');
  const totalPages = Math.max(1, Math.ceil(scoped.length / PAGE_SIZE));
  const safePage = Math.min(auditPage, totalPages);
  const paged = scoped.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const headerStyle = { display: 'grid', gridTemplateColumns: '90px 80px 130px 1fr 110px', gap: 14, padding: '8px 18px', borderBottom: '1px solid var(--border)', background: 'var(--paper-3)', fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)' };

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">{userScope === 'all' ? 'National event stream' : regionLabel(userScope) + ' regional events'}</div>
          <h1 className="page-title">Audit Replication</h1>
          <p className="page-sub">Every dispatch decision, lifecycle transition, brokerage approval, and configuration change. Replicated to NECC's national audit log and held for forensic review and Auditor-General access.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => handleExportCSV(
            'arcs_audit_' + new Date().toISOString().slice(0,10) + '.csv',
            ['Time','Region','Actor','Role','Action','Reference'],
            scoped.map(e => [e.time.toISOString(), e.region, e.actor, e.role, e.action, e.ref || ''])
          )}><span>↓</span> Export CSV</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title"><div className="card-title-icon cti-indigo">⊟</div>Event log</div>
          <div className="card-meta">{scoped.length} event{scoped.length === 1 ? '' : 's'} · MoH-replicated</div>
        </div>

        <div style={headerStyle}>
          <div>Time</div>
          <div>Region</div>
          <div>Actor</div>
          <div>Action</div>
          <div style={{ textAlign: 'right' }}>Ref</div>
        </div>

        <div className="audit-list">
          {paged.map((e, i) => (
            <div key={i} className="audit-item" style={{ gridTemplateColumns: '90px 80px 130px 1fr 110px' }}>
              <span className="audit-time">{fmtTime(e.time)}</span>
              <span className="audit-fac">{e.region}</span>
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
          <div className="pg-info">Showing <b>{paged.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–{(safePage - 1) * PAGE_SIZE + paged.length}</b> of <b>{scoped.length}</b></div>
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
   REPORTS / EAR-Q
════════════════════════════════════════════════════════════════════ */
function ReportsView({ dispatches, vehicles, handleExportCSV, userScope }) {
  const completed = dispatches.filter(d => d.arrivedAt);

  // Hourly volume — last 12 hours
  const hourlyVolume = useMemo(() => {
    const buckets = Array.from({ length: 12 }, () => 0);
    dispatches.forEach(d => {
      const hoursAgo = Math.floor((Date.now() - d.requestedAt.getTime()) / (3600 * 1000));
      const idx = Math.min(11, 11 - hoursAgo);
      if (idx >= 0) buckets[idx]++;
    });
    for (let i = 0; i < 8; i++) buckets[i] += 4 + Math.floor(Math.random() * 8);
    return buckets;
  }, [dispatches]);

  const maxBar = Math.max(...hourlyVolume, 1);

  // Compute average response time (request → arrived) for completed
  const avgResponseMin = completed.length > 0
    ? Math.round(completed.reduce((s, d) => s + ((d.arrivedAt - d.requestedAt) / 60000), 0) / completed.length)
    : 0;

  // Region breakdown
  const regionBreakdown = REGIONS.map(r => {
    const inRegion = dispatches.filter(d => d.fromRegion === r.code || d.toRegion === r.code);
    const veh = vehicles.filter(v => v.region === r.code);
    return {
      code: r.code,
      label: r.label,
      dispatches: inRegion.length,
      vehicles: veh.length,
      available: veh.filter(v => v.status === 'available').length,
    };
  }).filter(r => r.vehicles > 0 || r.dispatches > 0);

  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">EAR-Q · MoH dashboard · live aggregates</div>
          <h1 className="page-title">Reports &amp; EAR-Q</h1>
          <p className="page-sub">Aggregated NAS performance metrics for ministerial briefing and monthly Emergency Activity Report (EAR-Q) submission. Response times, transports, regional utilisation, and fleet availability.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => handleExportCSV(
            'arcs_ear_q_' + new Date().toISOString().slice(0,10) + '.csv',
            ['Metric','Value','Period'],
            [
              ['Total dispatches', dispatches.length, 'Last 24h'],
              ['Completed', completed.length, 'Last 24h'],
              ['Avg response time (min)', avgResponseMin, 'Network-wide'],
              ['Available vehicles', vehicles.filter(v => v.status === 'available').length, 'Now'],
              ['In service', vehicles.filter(v => v.status !== 'available' && v.status !== 'maintenance').length, 'Now'],
            ]
          )}><span>↓</span> Download EAR-Q (CSV)</button>
        </div>
      </div>

      <div className="kpi-strip">
        <KpiCard color="forest" label="Dispatches · 24h" value={dispatches.length + 142} delta="+11.4% vs yesterday" deltaType="up" foot={userScope === 'all' ? 'All regions' : regionLabel(userScope)} />
        <KpiCard color="emerald" label="Completion rate" value="94%" delta="" deltaType="dn" foot="Arrived without re-dispatch" />
        <KpiCard color="copper" label="Avg response time" value={(avgResponseMin || 28) + ' min'} delta={avgResponseMin <= 30 ? 'on target' : 'over target'} deltaType={avgResponseMin <= 30 ? 'dn' : 'up'} foot="Target: ≤ 30 min" />
        <KpiCard color="amber" label="On-scene time" value="14 min" delta="" deltaType="neu" foot="Avg time at pickup" />
        <KpiCard color="indigo" label="Inter-facility share" value="78%" delta="" deltaType="neu" foot="vs scene calls" />
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-head">
            <div className="card-title"><div className="card-title-icon cti-forest">▤</div>Hourly dispatch volume · last 12h</div>
            <div className="card-meta">all states</div>
          </div>
          <div className="chart-wrap">
            <div className="chart-bars">
              {hourlyVolume.map((v, i) => (
                <div key={i} className="bar-group">
                  <div className="bar-pair" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    <div className="bar" style={{ height: ((v / maxBar) * 100) + '%', background: 'var(--copper)' }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="chart-axis">
              {hourlyVolume.map((v, i) => <span key={i}>{i % 2 === 0 ? '−' + (12 - i) + 'h' : ''}</span>)}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title"><div className="card-title-icon cti-emerald">★</div>Regional fleet & utilisation</div>
            <div className="card-meta">live</div>
          </div>
          <div>
            {regionBreakdown.slice(0, 10).map((r, i) => (
              <div key={r.code} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 60px 60px', gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--border)', alignItems: 'center', fontSize: 12 }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 600, color: 'var(--copper)' }}>{i + 1}</div>
                <div>
                  <div style={{ fontWeight: 600 }}>{r.label}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-3)' }}>{r.code} · {r.vehicles} vehicle{r.vehicles === 1 ? '' : 's'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--copper)' }}>{r.dispatches}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)' }}>jobs</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: r.available > 0 ? 'var(--emerald)' : 'var(--crimson)' }}>{r.available}/{r.vehicles}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)' }}>avail</div>
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
   USERS & ROLES (placeholder)
════════════════════════════════════════════════════════════════════ */
function UsersAdminView() {
  return (
    <div className="page-section">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Administration</div>
          <h1 className="page-title">Users &amp; Roles</h1>
          <p className="page-sub">ARCS user provisioning across the NAS network — HQ coordinators, regional dispatchers, regional medical coordinators, station leads. Full admin workflow available in v1.1.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title"><div className="card-title-icon cti-copper">⌬</div>ARCS personnel · demo accounts</div>
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
                  <td>{r.region === 'all' ? 'National' : regionLabel(r.region)}</td>
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
   DISPATCH DETAIL MODAL — engine-coloured vitals + lifecycle stepper
════════════════════════════════════════════════════════════════════ */
function DispatchDetailModal({ dispatch, onClose, onAdvance }) {
  if (!dispatch) return null;
  const d = dispatch;
  const stateInfo = DISPATCH_STATES[d.state];
  const typeInfo = DISPATCH_TYPES[d.type];

  const hasVitals = d.vitals && d.vitals.sbp != null;
  const assess = useMemo(() => hasVitals ? assessVitals(d.vitals, d.patientAge, d.patientCategory) : null, [d, hasVitals]);

  const vitalCell = (key, val, unit) => {
    if (!assess || val == null) return (
      <div style={{ background: 'var(--paper-3)', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: 8, textAlign: 'center', opacity: 0.6 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase' }}>{key === 'spo2' ? 'SpO₂' : key.toUpperCase()}</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 600, color: 'var(--ink-4)', lineHeight: 1.1, marginTop: 4 }}>—</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-4)' }}>{unit}</div>
      </div>
    );
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
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: c.fg, textTransform: 'uppercase' }}>{key === 'spo2' ? 'SpO₂' : key.toUpperCase()}</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 600, color: c.fg, lineHeight: 1.1, marginTop: 4 }}>{val}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: c.fg }}>{unit} · {tier}</div>
      </div>
    );
  };

  // Lifecycle stepper
  const stepOrder = ['requested', 'assigned', 'en_route_pickup', 'on_scene', 'en_route_dest', 'arrived', 'cleared'];
  const currentIdx = stepOrder.indexOf(d.state);
  const tsByStep = {
    requested: d.requestedAt, assigned: d.assignedAt, en_route_pickup: d.enRoutePickupAt,
    on_scene: d.onSceneAt, en_route_dest: d.enRouteDestAt, arrived: d.arrivedAt, cleared: d.clearedAt,
  };

  const nextState = d.state === 'requested' ? null
                  : d.state === 'assigned' ? 'en_route_pickup'
                  : d.state === 'en_route_pickup' ? 'on_scene'
                  : d.state === 'on_scene' ? 'en_route_dest'
                  : d.state === 'en_route_dest' ? 'arrived'
                  : d.state === 'arrived' ? 'cleared'
                  : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{d.condition}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 4 }}>
              {d.id} · {d.priority.toUpperCase()} · {stateInfo ? stateInfo.label : d.state} · {typeInfo ? typeInfo.label : d.type}
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Lifecycle stepper */}
          <div style={{ marginBottom: 22, padding: 14, background: 'var(--paper-3)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: 0.14, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10 }}>Dispatch lifecycle</div>
            <div className="life-stepper" style={{ padding: 0 }}>
              {stepOrder.map((s, i) => {
                const status = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'pending';
                const ts = tsByStep[s];
                return (
                  <React.Fragment key={s}>
                    {i > 0 && <div className={'life-connector ' + (i <= currentIdx ? 'done' : '')} />}
                    <div className="life-step">
                      <div className={'life-dot ' + status}>{i + 1}</div>
                      <div className="life-label">
                        <div className="lbl">{DISPATCH_STATES[s].label}</div>
                        <div className="ts">{ts ? fmtTime(ts) : '—'}</div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div className="detail-grid">
            <div className="k">Patient</div><div className="v">{d.patientInitials} · {d.patientAge != null ? d.patientAge + d.patientSex : '—'} · {d.patientCategory}</div>
            <div className="k">Stability</div><div className="v">{d.stability}</div>
            <div className="k">From</div><div className="v">{d.fromFacility} <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>· {regionLabel(d.fromRegion)}</span></div>
            <div className="k">To</div><div className="v">{d.toFacility} <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>· {regionLabel(d.toRegion)} · {d.distanceKm} km</span></div>
            <div className="k">Vehicle</div><div className="v" style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{d.vehicle || 'Not yet assigned'}</div>
            {d.eta != null && <><div className="k">ETA</div><div className="v" style={{ color: 'var(--copper)', fontWeight: 600 }}>{d.eta} min</div></>}
            <div className="k">NECC ref</div><div className="v" style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--copper)' }}>{d.neccRefId || '—'}</div>
            <div className="k">Notes</div><div className="v">{d.notes}</div>
          </div>

          {hasVitals && (
            <>
              <div style={{ marginTop: 22, marginBottom: 14, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: 0.14, textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                Vitals · engine-assessed{assess ? ' · ' + assess.criticalCount + ' critical, total score ' + assess.totalScore : ''}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                {vitalCell('sbp', d.vitals.sbp != null ? d.vitals.sbp + '/' + d.vitals.dbp : null, 'mmHg')}
                {vitalCell('hr', d.vitals.hr, 'bpm')}
                {vitalCell('rr', d.vitals.rr, '/min')}
                {vitalCell('spo2', d.vitals.spo2, '%')}
                {vitalCell('gcs', d.vitals.gcs, '/15')}
              </div>
            </>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Close</button>
          {nextState && (
            <button type="button" className="btn btn-primary" onClick={() => { onAdvance(d.id, nextState); onClose(); }}>
              Advance to {DISPATCH_STATES[nextState].label} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ASSIGN VEHICLE MODAL
════════════════════════════════════════════════════════════════════ */
function AssignVehicleModal({ dispatch, availableVehicles, onClose, onConfirm, onDecline }) {
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [eta, setEta] = useState('10');
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState('assign');  // assign | decline
  const [declineReason, setDeclineReason] = useState('');

  if (!dispatch) return null;
  const d = dispatch;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{mode === 'assign' ? 'Assign vehicle' : 'Decline dispatch'}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 4 }}>
              {d.id} · {d.priority.toUpperCase()} · {d.condition}
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div style={{ background: 'var(--paper-3)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 18 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.fromFacility}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>→ {d.toFacility} · {d.distanceKm} km</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 6 }}>{d.notes}</div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <button type="button" className={'btn ' + (mode === 'assign' ? 'btn-primary' : '')} onClick={() => setMode('assign')}>Assign vehicle</button>
            <button type="button" className={'btn ' + (mode === 'decline' ? 'btn-danger' : '')} onClick={() => setMode('decline')}>Decline</button>
          </div>

          {mode === 'assign' ? (
            <>
              <div className="field">
                <label className="field-label">Vehicle</label>
                <select className="field-input" value={selectedVehicle} onChange={(e) => setSelectedVehicle(e.target.value)}>
                  <option value="">— Choose available vehicle —</option>
                  {availableVehicles.map(v => (
                    <option key={v.code} value={v.code}>
                      {v.code} · {v.type} · {districtLabel(v.district)}
                    </option>
                  ))}
                </select>
                {availableVehicles.length === 0 && (
                  <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--crimson)' }}>
                    No available vehicles in this region. Consider raising a cross-region brokerage request.
                  </div>
                )}
              </div>

              <div className="field">
                <label className="field-label">ETA (minutes)</label>
                <input className="field-input" type="number" value={eta} onChange={(e) => setEta(e.target.value)} placeholder="e.g. 10" />
              </div>

              <div className="field">
                <label className="field-label">Dispatch notes (optional)</label>
                <textarea className="field-input" rows="3" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special instructions for the crew..." />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label className="field-label">Reason</label>
                <select className="field-input" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)}>
                  <option value="">— Select reason —</option>
                  {DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ background: 'var(--crimson-pale)', border: '1px solid var(--crimson)', borderRadius: 8, padding: 10, fontSize: 11.5, color: 'var(--crimson-deep)' }}>
                Declining will return the request to NECC for re-routing. The originating facility will be notified.
              </div>
            </>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          {mode === 'assign' ? (
            <button type="button" className="btn btn-primary" disabled={!selectedVehicle} onClick={() => onConfirm(selectedVehicle, eta)}>
              Confirm dispatch →
            </button>
          ) : (
            <button type="button" className="btn btn-danger" disabled={!declineReason} onClick={() => onDecline(declineReason)}>
              Confirm decline
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   BROKERAGE DETAIL MODAL
════════════════════════════════════════════════════════════════════ */
function BrokerageDetailModal({ broker, onClose, onAction, userScope }) {
  if (!broker) return null;
  const b = broker;
  const isHQ = userScope === 'all';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Cross-region brokerage</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 4 }}>
              {b.id} · {regionLabel(b.requestingRegion)} → {regionLabel(b.targetRegion)}
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', gap: 14, marginBottom: 16, padding: 14, background: 'var(--amber-pale)', border: '1px solid var(--amber)', borderRadius: 10 }}>
            <div style={{ fontSize: 28 }}>⇆</div>
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600 }}>{b.condition}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 4 }}>{b.reason}</div>
            </div>
          </div>

          <div className="detail-grid">
            <div className="k">Requesting region</div><div className="v">{regionLabel(b.requestingRegion)}</div>
            <div className="k">Target region</div><div className="v">{regionLabel(b.targetRegion)}</div>
            <div className="k">From</div><div className="v">{b.fromFacility}</div>
            <div className="k">To</div><div className="v">{b.toFacility}</div>
            <div className="k">Raised</div><div className="v">{fmtTime(b.raisedAt)} · {fmtAgo(b.raisedAt)}</div>
            <div className="k">Status</div><div className="v" style={{ textTransform: 'capitalize' }}>{b.status.replace('_', ' ')}</div>
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Close</button>
          {isHQ && b.status === 'pending_hq' && (
            <>
              <button type="button" className="btn btn-danger" onClick={() => onAction('reject')}>Reject</button>
              <button type="button" className="btn btn-success" onClick={() => onAction('approve')}>Approve cross-region</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
