import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, ArrowDownRight, ArrowLeft,
  Bell, Building2, Calendar, Check, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  Circle, Clock, FileText, Filter, Gauge, GitBranch, Heart, Hospital, Info,
  LayoutDashboard, Layers, MapPin, Maximize2, Menu, MessageSquare, Minus, Monitor,
  MoreHorizontal, Phone, Plus, Radio, Search, Send, Settings, Share2, Shield,
  ShieldCheck, Siren, Slash, Tablet, Truck, User, Users, UserRound, Volume2, VolumeX,
  X, Zap, ChevronsRight, ArrowRightLeft, Inbox, Award, BookOpen, Eye, Command,
  Sparkles, BedDouble, Stethoscope, FlaskConical, Microscope, Beaker, Pill as PillIcon,
  Crosshair, RefreshCw, ExternalLink, Lock, Unlock, Power, Wifi, WifiOff,
  ChevronsUpDown, Minimize2, BarChart3, TrendingUp, TrendingDown, FileSearch,
  Printer, Download, Copy, Mic, MicOff, Pause, Play, Hash, AtSign, Star,
} from "lucide-react";

/* ════════════════════════════════════════════════════════════════════════════
   GhERIG · ED TRIAGE TABLET · v2.1
   Korle-Bu Teaching Hospital · Bedside Referral Triage Surface
   National Pilot Build · Greater Accra · Wk 4 of 8
   ────────────────────────────────────────────────────────────────────────────
   v2.1 CHANGES vs v3 (initial)
   • Clinical vitals engine (Ghana STG primary + WHO IMCI/IMAI), age-aware,
     4-tier severity. Replaces binary abnormal flagging.
   • WizVitals: live engine assessment, per-input tier shading,
     stability ↔ vitals mismatch warning.
   • submit() emits engine-suggested priority and takes the worse of
     stability-derived vs engine-derived priority.
   • submit() dual-emits LEGACY (chiefComplaint, primaryCategory, subCategory,
     serviceNeeded, reasonForReferral, oxygen/inotropes/bleeding) AND CANONICAL
     (primaryCondition, subCondition, services, reasons, spo2_modifier,
     sbp_modifier, hr_modifier, gcs_alertness) field names — matches the
     hospital portal v2.0 / NCRIS message envelope schema.
   • ReferralDrawer: vitals grid uses engine tier coloring + engine
     assessment summary panel.
   • TabletReferralCard: VitalsStrip now age-aware via referral.age + category.
   • toCanonicalReferral() helper added for normalising any legacy referral.
   ════════════════════════════════════════════════════════════════════════════ */

// ────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ────────────────────────────────────────────────────────────────────────────
const c = {
  // Surfaces (warm paper)
  bg:        "#FAFAF7",
  bgDeep:    "#F4F3EE",
  surface:   "#FFFFFF",
  surface2:  "#F6F5F0",
  surface3:  "#EFEEE8",
  surface4:  "#E8E6DD",

  // Ink
  ink:       "#1A1815",
  ink2:      "#4A4641",
  ink3:      "#8A857E",
  ink4:      "#B8B3AB",
  ink5:      "#D8D4CC",

  // Borders
  border:    "#E5E3DC",
  borderMid: "#D4D1C8",
  borderStrong: "#B8B3AB",

  // Brand (deep forest)
  primary:    "#0A4D3C",
  primaryDeep:"#063929",
  primaryMid: "#10785F",
  primaryLight: "#34A985",
  primarySoft:"#E8F5EF",
  primaryWash:"#F1F9F5",

  // Semantic
  critical:    "#9B1F1F",
  criticalMid: "#C73030",
  criticalSoft:"#FCEAEA",
  criticalWash:"#FEF5F5",

  warning:     "#A6630C",
  warningMid:  "#D08410",
  warningSoft: "#FBEED4",
  warningWash: "#FEF8E8",

  info:        "#1B3F8F",
  infoMid:     "#3158B8",
  infoSoft:    "#E2EAF8",
  infoWash:    "#EFF3FB",

  // Premium accent (used very sparingly — top-tier signals)
  copper:      "#8A4D1F",
  copperSoft:  "#F5E8DA",
};

const fontDisplay = "'Fraunces', serif";
const fontBody    = "'Inter Tight', system-ui, sans-serif";
const fontMono    = "'JetBrains Mono', ui-monospace, monospace";

// Eyebrow style — used everywhere for category labels
const eyebrow = {
  fontFamily: fontMono,
  fontSize: "9.5px",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  fontWeight: 500,
  color: c.ink3,
};

// ────────────────────────────────────────────────────────────────────────────
// FACILITIES with full service profiles + RQI
// ────────────────────────────────────────────────────────────────────────────
const FACILITIES = {
  KBU: {
    code: "GA-KBU-001", name: "Korle-Bu Teaching Hospital", short: "Korle-Bu",
    tier: "Teaching", region: "Greater Accra", city: "Accra",
    services: ["Cardiology","Cardiac Cath Lab","Neurosurgery","ICU","HDU","NICU","Dialysis","MRI","CT Scan","Ultrasound","Endoscopy","Burns Care","Trauma Care","Obstetrics","Paediatrics","Neonatology","General Surgery","Orthopaedics","Internal Medicine","ENT","Ophthalmology","Urology","Plastic Surgery","Psychiatry","Anaesthesia/ICU","Blood Bank"],
    rqi: 92, rqiBand: "Q1", uptime: 23.6, acceptMedian: 1.8, acceptRate: 78, turnaround: 38,
    bedCapacity: { ed: 18, icu: 12, hdu: 16 }, beds: { ed: 14, icu: 12, hdu: 14 },
    distance: 0,
  },
  M37: { code: "GA-MIL-007", name: "37 Military Hospital", short: "37 Military", tier: "Tertiary", region: "Greater Accra", city: "Accra",
    services: ["Cardiology","Cardiac Cath Lab","ICU","HDU","Dialysis","MRI","CT Scan","Trauma Care","Orthopaedics","Internal Medicine","General Surgery","Anaesthesia/ICU","Blood Bank","Ultrasound","Endoscopy"],
    rqi: 86, rqiBand: "Q1", uptime: 23.1, acceptMedian: 2.4, acceptRate: 71, turnaround: 44, distance: 6.0 },
  RID: { code: "GA-RID-014", name: "Ridge Hospital", short: "Ridge", tier: "Regional", region: "Greater Accra", city: "Accra",
    services: ["ICU","HDU","CT Scan","Obstetrics","Paediatrics","General Surgery","Internal Medicine","Anaesthesia/ICU","Blood Bank","Ultrasound"],
    rqi: 78, rqiBand: "Q2", uptime: 22.4, acceptMedian: 3.1, acceptRate: 68, turnaround: 51, distance: 5.2 },
  TEM: { code: "GA-TEM-019", name: "Tema General Hospital", short: "Tema General", tier: "Regional", region: "Greater Accra", city: "Tema",
    services: ["ICU","HDU","CT Scan","Obstetrics","Paediatrics","General Surgery","Orthopaedics","Internal Medicine","Anaesthesia/ICU","Ultrasound"],
    rqi: 71, rqiBand: "Q2", uptime: 21.8, acceptMedian: 3.4, acceptRate: 64, turnaround: 58, distance: 25.0 },
  LEK: { code: "GA-LEK-022", name: "LEKMA Hospital", short: "LEKMA", tier: "District", region: "Greater Accra", city: "Teshie",
    services: ["HDU","Obstetrics","Paediatrics","General Surgery","Internal Medicine","Ultrasound"],
    rqi: 62, rqiBand: "Q3", uptime: 20.6, acceptMedian: 4.2, acceptRate: 58, turnaround: 67, distance: 14.0 },
  MAM: { code: "GA-MAM-031", name: "Mamprobi Hospital", short: "Mamprobi", tier: "District", region: "Greater Accra", city: "Mamprobi",
    services: ["Obstetrics","Paediatrics","Internal Medicine","Ultrasound"],
    rqi: 58, rqiBand: "Q3", uptime: 19.4, acceptMedian: 5.1, acceptRate: 54, turnaround: 71, distance: 3.1 },
  ACH: { code: "GA-ACH-008", name: "Achimota Hospital", short: "Achimota", tier: "District", region: "Greater Accra", city: "Achimota",
    services: ["HDU","Obstetrics","Paediatrics","General Surgery","Internal Medicine","Ultrasound"],
    rqi: 67, rqiBand: "Q2", uptime: 21.0, acceptMedian: 3.8, acceptRate: 61, turnaround: 62, distance: 9.4 },
  MAD: { code: "GA-MAD-045", name: "Madina Polyclinic", short: "Madina", tier: "Polyclinic", region: "Greater Accra", city: "Madina",
    services: ["Obstetrics","Paediatrics","Internal Medicine"],
    rqi: 49, rqiBand: "Q4", uptime: 17.2, acceptMedian: 6.4, acceptRate: 47, turnaround: 84, distance: 22.0 },
  KAS: { code: "GA-KAS-058", name: "Kaneshie Polyclinic", short: "Kaneshie", tier: "Polyclinic", region: "Greater Accra", city: "Kaneshie",
    services: ["Obstetrics","Paediatrics","Internal Medicine"],
    rqi: 54, rqiBand: "Q3", uptime: 18.8, acceptMedian: 5.6, acceptRate: 52, turnaround: 76, distance: 4.3 },
  PAN: { code: "GA-PAN-072", name: "Pantang Hospital", short: "Pantang", tier: "Specialist", region: "Greater Accra", city: "Pantang",
    services: ["Psychiatry","Internal Medicine"],
    rqi: 73, rqiBand: "Q2", uptime: 22.6, acceptMedian: 3.0, acceptRate: 66, turnaround: 49, distance: 28.0 },
  GBA: { code: "GA-GBA-018", name: "Greater Accra Regional Hospital", short: "GAR Hospital", tier: "Regional", region: "Greater Accra", city: "Accra",
    services: ["ICU","HDU","CT Scan","Obstetrics","Paediatrics","General Surgery","Orthopaedics","Internal Medicine","Anaesthesia/ICU","Blood Bank","Ultrasound","Endoscopy"],
    rqi: 81, rqiBand: "Q1", uptime: 23.0, acceptMedian: 2.6, acceptRate: 73, turnaround: 46, distance: 5.5 },
  LEG: { code: "GA-LEG-029", name: "Legon Hospital", short: "Legon", tier: "District", region: "Greater Accra", city: "Legon",
    services: ["HDU","Obstetrics","Paediatrics","General Surgery","Internal Medicine","Ultrasound"],
    rqi: 64, rqiBand: "Q3", uptime: 20.9, acceptMedian: 3.9, acceptRate: 60, turnaround: 64, distance: 17.0 },
};
const FACILITY_KEYS = Object.keys(FACILITIES);
const ALL_SERVICES = ["Cardiology","Cardiac Cath Lab","Neurosurgery","ICU","HDU","NICU","Dialysis","MRI","CT Scan","Ultrasound","Endoscopy","Burns Care","Trauma Care","Obstetrics","Paediatrics","Neonatology","General Surgery","Orthopaedics","Internal Medicine","ENT","Ophthalmology","Urology","Plastic Surgery","Psychiatry","Anaesthesia/ICU","Blood Bank"];

// Live operational service availability (distinct from declared services)
// These are the runtime toggles — equipment status, theatre staffing, blood stock, etc.
const SERVICE_AVAILABILITY_INITIAL = {
  ct_scanner_1: { name: "CT Scanner · Main", group: "Imaging", status: "online", since: "today 06:00", note: "" },
  ct_scanner_2: { name: "CT Scanner · ED", group: "Imaging", status: "online", since: "today 06:00", note: "" },
  mri_1:        { name: "MRI · 1.5T", group: "Imaging", status: "online", since: "today 07:30", note: "" },
  mri_2:        { name: "MRI · 3T", group: "Imaging", status: "maintenance", since: "yesterday 18:00", note: "Coil replacement" },
  cath_lab_1:   { name: "Cath Lab 1", group: "Procedural", status: "in_use", since: "10:42", note: "PCI in progress" },
  cath_lab_2:   { name: "Cath Lab 2", group: "Procedural", status: "available", since: "today 06:00", note: "" },
  theatre_1:    { name: "Main Theatre 1", group: "Theatre", status: "in_use", since: "09:15", note: "Lap chole" },
  theatre_2:    { name: "Main Theatre 2", group: "Theatre", status: "available", since: "today 06:00", note: "" },
  theatre_3:    { name: "Main Theatre 3", group: "Theatre", status: "available", since: "today 06:00", note: "" },
  theatre_em:   { name: "Emergency Theatre", group: "Theatre", status: "available", since: "today 06:00", note: "" },
  obs_theatre:  { name: "Obstetric Theatre", group: "Theatre", status: "available", since: "today 06:00", note: "" },
  blood_bank:   { name: "Blood Bank", group: "Diagnostic", status: "online", since: "today 06:00", note: "All groups stocked" },
  blood_oneg:   { name: "O-negative · stock", group: "Diagnostic", status: "low", since: "today 04:20", note: "3 units remaining" },
  dialysis:     { name: "Dialysis · 8 stations", group: "Procedural", status: "online", since: "today 06:00", note: "5 of 8 in use" },
  endoscopy:    { name: "Endoscopy Suite", group: "Procedural", status: "online", since: "today 06:00", note: "" },
  ed_lock:      { name: "ED admissions", group: "Operational", status: "open", since: "today 06:00", note: "Accepting" },
  helipad:      { name: "Helipad", group: "Operational", status: "active", since: "today 06:00", note: "" },
  oxygen_main:  { name: "Oxygen · main supply", group: "Operational", status: "online", since: "today 06:00", note: "" },
};

// ────────────────────────────────────────────────────────────────────────────
// CONDITION TAXONOMY (per user's spec)
// ────────────────────────────────────────────────────────────────────────────
const CONDITIONS = {
  Trauma:    ["Head injury","Polytrauma","Chest trauma","Abdominal trauma","Fracture","Spine injury","Burns trauma"],
  Medical:   ["Stroke","Seizure","DKA","Severe asthma","Heart failure","Sepsis","Shock","GI bleed","Altered consciousness","Severe anaemia","Renal failure","Acute MI","Acute coronary syndrome"],
  Surgical:  ["Acute abdomen","Intestinal obstruction","Appendicitis","Peritonitis","GI bleeding","Obstructed hernia","Testicular torsion","Soft tissue infection","Necrotizing infection","Post-op complication","Urological emergency"],
  Obstetric: ["PPH","Eclampsia","Severe preeclampsia","Obstructed labour","APH","Retained products","Sepsis in pregnancy","Fetal distress","Uterine rupture suspected"],
  Paediatric:["Severe malaria","Status epilepticus","Severe pneumonia","Severe dehydration","Sepsis","Severe anaemia","Meningitis suspected","Acute abdomen","Trauma","Poisoning","Burns"],
  Neonatal:  ["Birth asphyxia / HIE","Neonatal sepsis","Respiratory distress","Prematurity complications","Severe jaundice","Neonatal seizures","Congenital anomaly","Feeding difficulty","Hypoglycemia","Temperature instability"],
  Poisoning: ["Acute poisoning","Overdose","Foreign body ingestion","Snake envenomation","Organophosphate poisoning"],
  Psychiatric:["Acute psychosis","Suicidal ideation","Aggressive behaviour","Severe agitation","Catatonia"],
};
const REASONS = ["Specialist review","Imaging unavailable","Surgery needed","ICU/HDU bed needed","NICU bed needed","Dialysis needed","Blood unavailable","Higher level care","No bed capacity","Theatre unavailable","Consultant request"];

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────
function minutesAgo(m) { return new Date(Date.now() - m * 60 * 1000); }
function elapsedFromNow(date) {
  const totalSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const m = Math.floor(totalSec / 60), s = totalSec % 60;
  return { m, s, totalSec, formatted: `${m}m ${String(s).padStart(2,"0")}s` };
}
function shortTime(d) { return d.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" }); }
function priorityToColor(p) {
  if (p === "CRITICAL") return { fg: c.critical, bg: c.criticalSoft, wash: c.criticalWash, label: "Critical", strong: c.criticalMid };
  if (p === "HIGH")     return { fg: c.warning,  bg: c.warningSoft,  wash: c.warningWash,  label: "High",     strong: c.warningMid };
  return                       { fg: c.primary,  bg: c.primarySoft,  wash: c.primaryWash,  label: "Routine",  strong: c.primaryMid };
}
function stateToColor(s) {
  switch (s) {
    case "INITIATED":  return { fg: c.warning,  bg: c.warningSoft,  label: "Awaiting decision" };
    case "ACCEPTED":   return { fg: c.info,     bg: c.infoSoft,     label: "Accepted" };
    case "EN_ROUTE":   return { fg: c.primary,  bg: c.primarySoft,  label: "En route" };
    case "ARRIVED":    return { fg: c.primary,  bg: c.primarySoft,  label: "Arrived" };
    case "ADMITTED":   return { fg: c.ink2,     bg: c.surface3,     label: "Admitted" };
    case "DECLINED":   return { fg: c.critical, bg: c.criticalSoft, label: "Declined" };
    case "REDIRECTED": return { fg: c.copper,   bg: c.copperSoft,   label: "Redirected" };
    default: return { fg: c.ink2, bg: c.surface3, label: s };
  }
}
function slaTargetSec(p) { return p === "CRITICAL" ? 180 : p === "HIGH" ? 300 : 600; }
function rqiBandColor(b) {
  if (b === "Q1") return { fg: c.primary, bg: c.primarySoft, label: "Excellent" };
  if (b === "Q2") return { fg: c.info,    bg: c.infoSoft,    label: "Good" };
  if (b === "Q3") return { fg: c.warning, bg: c.warningSoft, label: "Slow" };
  return                { fg: c.critical, bg: c.criticalSoft, label: "Failing" };
}

// ────────────────────────────────────────────────────────────────────────────
// CLINICAL VITALS ENGINE · v2 (ported from hospital portal v2.0)
// Ghana STG (Standard Treatment Guidelines, 7th ed.) primary
// WHO IMCI / IMAI as backup standard for paediatrics & neonates
// 4-tier severity per parameter: normal / borderline / abnormal / critical
// ────────────────────────────────────────────────────────────────────────────
const VE_TIER_SCORE = { normal: 0, borderline: 1, abnormal: 2, critical: 3 };

function veAgeBand(ageYears, category) {
  if (category === "Neonate") return "neonate";
  if (category === "Paediatric" || (ageYears != null && ageYears < 13)) {
    if (ageYears == null) return "child";
    if (ageYears < 1) return "infant";
    if (ageYears < 5) return "child_under5";
    return "child";
  }
  if (ageYears != null && ageYears < 18) return "adolescent";
  if (ageYears != null && ageYears >= 65) return "elderly";
  return "adult";
}

const VE_RANGES = {
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
  temp: {
    all:     { critical: [null, 35.0], abnormal: [35.0, 36.0], borderline: [36.0, 36.5], normal: [36.5, 37.5], borderlineHi: 37.5, abnormalHi: 38.5, criticalHi: 40.0 },
    neonate: { critical: [null, 35.5], abnormal: [35.5, 36.5], borderline: [36.5, 36.7], normal: [36.7, 37.5], borderlineHi: 37.5, abnormalHi: 38.0, criticalHi: 39.0 },
  },
  spo2: {
    all:     { critical: 90, abnormal: 92, borderline: 94, normal: 100 },
    neonate: { critical: 88, abnormal: 90, borderline: 93, normal: 100 },
  },
  gcs: { critical: 8, abnormal: 12, borderline: 14, normal: 15 },
  rbs: {
    adult:   { critical: [null, 2.5], abnormal: [2.5, 3.5], borderline: [3.5, 4.0], normal: [4.0, 7.8], borderlineHi: 7.8, abnormalHi: 11.1, criticalHi: 16.7 },
    paeds:   { critical: [null, 2.2], abnormal: [2.2, 3.0], borderline: [3.0, 3.5], normal: [3.5, 7.0], borderlineHi: 7.0, abnormalHi: 11.1, criticalHi: 16.7 },
    neonate: { critical: [null, 2.0], abnormal: [2.0, 2.6], borderline: [2.6, 3.0], normal: [3.0, 6.0], borderlineHi: 6.0, abnormalHi: 8.5,  criticalHi: 12.0 },
  },
};

function veTierFromBand(val, band) {
  if (val == null || isNaN(val)) return null;
  if (band.critical && band.critical[1] != null && val < band.critical[1]) return "critical";
  if (band.abnormal && val >= band.abnormal[0] && val < band.abnormal[1]) return "abnormal";
  if (band.borderline && val >= band.borderline[0] && val < band.borderline[1]) return "borderline";
  if (band.normal && val >= band.normal[0] && val <= band.normal[1]) return "normal";
  if (band.criticalHi != null && val >= band.criticalHi) return "critical";
  if (band.abnormalHi != null && val >= band.abnormalHi) return "abnormal";
  if (band.borderlineHi != null && val > band.borderlineHi) return "borderline";
  return "normal";
}

function veAssessSBP(val, age, category) {
  if (val == null || isNaN(val)) return null;
  const ab = veAgeBand(age, category);
  const band = VE_RANGES.sbp[ab];
  let tier = "normal", reason = "";
  if (val < band.critical[1])              { tier = "critical";   reason = `SBP ${val}: severe hypotension (<${band.critical[1]} for ${ab})`; }
  else if (val < band.abnormal[1])         { tier = "abnormal";   reason = `SBP ${val}: hypotensive`; }
  else if (val < band.borderline[1])       { tier = "borderline"; reason = `SBP ${val}: low-borderline`; }
  else if (val >= VE_RANGES.sbp.highCritical)   { tier = "critical";   reason = `SBP ${val}: hypertensive emergency `; }
  else if (val >= VE_RANGES.sbp.highAbnormal)   { tier = "abnormal";   reason = `SBP ${val}: severe hypertension`; }
  else if (val >= VE_RANGES.sbp.highBorderline) { tier = "borderline"; reason = `SBP ${val}: stage-2 HTN`; }
  else                                          { reason = `SBP ${val}: within normal`; }
  return { tier, score: VE_TIER_SCORE[tier], reason };
}
function veAssessDBP(val) {
  if (val == null || isNaN(val)) return null;
  let tier = "normal", reason = "";
  if (val < 50)        { tier = "critical"; reason = `DBP ${val}: severe diastolic hypotension`; }
  else if (val < 60)   { tier = "abnormal"; reason = `DBP ${val}: low diastolic`; }
  else if (val >= 120) { tier = "critical"; reason = `DBP ${val}: hypertensive emergency`; }
  else if (val >= 110) { tier = "abnormal"; reason = `DBP ${val}: severe diastolic HTN`; }
  else if (val >= 90)  { tier = "borderline"; reason = `DBP ${val}: elevated`; }
  else                 { reason = `DBP ${val}: within normal`; }
  return { tier, score: VE_TIER_SCORE[tier], reason };
}
function veAssessHR(val, age, category) {
  if (val == null || isNaN(val)) return null;
  const ab = veAgeBand(age, category);
  const tier = veTierFromBand(val, VE_RANGES.hr[ab]) || "normal";
  return { tier, score: VE_TIER_SCORE[tier], reason: `HR ${val}: ${tier === "normal" ? "normal" : tier} for ${ab}` };
}
function veAssessRR(val, age, category) {
  if (val == null || isNaN(val)) return null;
  const ab = veAgeBand(age, category);
  const tier = veTierFromBand(val, VE_RANGES.rr[ab]) || "normal";
  return { tier, score: VE_TIER_SCORE[tier], reason: `RR ${val}: ${tier === "normal" ? "normal" : tier} (WHO IMCI for ${ab})` };
}
function veAssessTemp(val, category) {
  if (val == null || isNaN(val)) return null;
  const band = category === "Neonate" ? VE_RANGES.temp.neonate : VE_RANGES.temp.all;
  const tier = veTierFromBand(val, band) || "normal";
  let reason = "";
  if (tier === "critical")        reason = val < 35.5 ? `Temp ${val}°C: severe hypothermia` : `Temp ${val}°C: hyperpyrexia ≥40°C`;
  else if (tier === "abnormal")   reason = val < 36   ? `Temp ${val}°C: hypothermic`        : `Temp ${val}°C: high fever`;
  else if (tier === "borderline") reason = val < 36.5 ? `Temp ${val}°C: low-borderline`     : `Temp ${val}°C: febrile`;
  else                            reason = `Temp ${val}°C: afebrile`;
  return { tier, score: VE_TIER_SCORE[tier], reason };
}
function veAssessSpO2(val, category, modifier) {
  if (val == null || isNaN(val)) return null;
  const t = category === "Neonate" ? VE_RANGES.spo2.neonate : VE_RANGES.spo2.all;
  let tier = "normal", reason = "";
  if (val < t.critical)        { tier = "critical";   reason = `SpO₂ ${val}%: severe hypoxia ( <${t.critical}%)`; }
  else if (val < t.abnormal)   { tier = "abnormal";   reason = `SpO₂ ${val}%: hypoxic`; }
  else if (val < t.borderline) { tier = "borderline"; reason = `SpO₂ ${val}%: low-borderline`; }
  else                         { reason = `SpO₂ ${val}%: normal`; }
  if (modifier === "INTUBATED" && val < 95) reason += " · INTUBATED, escalate";
  if (modifier === "OXYGEN"    && val < 94) reason += " · on O₂";
  return { tier, score: VE_TIER_SCORE[tier], reason };
}
function veAssessGCS(val) {
  if (val == null || isNaN(val)) return null;
  let tier = "normal", reason = "";
  if (val <= VE_RANGES.gcs.critical)        { tier = "critical";   reason = `GCS ${val}/15: severe impairment, airway risk`; }
  else if (val <= VE_RANGES.gcs.abnormal)   { tier = "abnormal";   reason = `GCS ${val}/15: moderately impaired`; }
  else if (val <= VE_RANGES.gcs.borderline) { tier = "borderline"; reason = `GCS ${val}/15: mildly reduced`; }
  else                                      { reason = `GCS ${val}/15: alert and oriented`; }
  return { tier, score: VE_TIER_SCORE[tier], reason };
}
function veAssessRBS(val, category) {
  if (val == null || isNaN(val)) return null;
  const band = category === "Neonate" ? VE_RANGES.rbs.neonate
            : (category === "Paediatric" ? VE_RANGES.rbs.paeds : VE_RANGES.rbs.adult);
  const tier = veTierFromBand(val, band) || "normal";
  let reason = "";
  if (tier === "critical")        reason = val < 3 ? `RBS ${val} mmol/L: severe hypoglycaemia` : `RBS ${val} mmol/L: severe hyperglycaemia (DKA range)`;
  else if (tier === "abnormal")   reason = val < band.normal[0] ? `RBS ${val} mmol/L: hypoglycaemic` : `RBS ${val} mmol/L: hyperglycaemic`;
  else if (tier === "borderline") reason = `RBS ${val} mmol/L: borderline`;
  else                            reason = `RBS ${val} mmol/L: euglycaemic`;
  return { tier, score: VE_TIER_SCORE[tier], reason };
}

// Master assessment — accepts vitals in tablet's native shape and translates
// internally. Returns per-vital + composite score + suggested priority + reason.
function assessVitals(vitals, age, category) {
  // Normalize tablet's modifier shape to engine's expected uppercase strings
  const spo2_mod = vitals.spo2_modifier
    || (vitals.oxygen === "intubated" ? "INTUBATED"
      : vitals.oxygen === "oxygen"    ? "OXYGEN"
      : vitals.oxygen === "ORA"       ? "ORA" : "");
  const sbp_mod = vitals.sbp_modifier || (vitals.inotropes ? "INOTROPES" : "");
  const hr_mod  = vitals.hr_modifier  || (vitals.bleeding  ? "BLEEDING"  : "");

  const v = {
    sbp:  parseFloat(vitals.sbp),  dbp: parseFloat(vitals.dbp),  hr: parseFloat(vitals.hr),
    rr:   parseFloat(vitals.rr),   temp: parseFloat(vitals.temp),
    spo2: parseFloat(vitals.spo2), gcs: parseFloat(vitals.gcs),  rbs: parseFloat(vitals.rbs),
  };
  const checks = {
    sbp:  veAssessSBP(v.sbp, age, category),
    dbp:  veAssessDBP(v.dbp),
    hr:   veAssessHR(v.hr, age, category),
    rr:   veAssessRR(v.rr, age, category),
    temp: veAssessTemp(v.temp, category),
    spo2: veAssessSpO2(v.spo2, category, spo2_mod),
    gcs:  veAssessGCS(v.gcs),
    rbs:  veAssessRBS(v.rbs, category),
  };
  let totalScore = 0, criticalCount = 0, abnormalCount = 0;
  Object.values(checks).forEach(ck => {
    if (!ck) return;
    totalScore += ck.score;
    if (ck.tier === "critical") criticalCount++;
    if (ck.tier === "abnormal") abnormalCount++;
  });
  if (sbp_mod === "INOTROPES") totalScore += 2;
  if (hr_mod  === "BLEEDING")  totalScore += 2;
  if (spo2_mod === "INTUBATED") totalScore += 2;

  let suggestedPriority = "ROUTINE";
  let suggestedReason = "Vitals within acceptable range";
  if (criticalCount >= 1) {
    suggestedPriority = "CRITICAL";
    suggestedReason = `${criticalCount} critical vital${criticalCount > 1 ? "s" : ""} detected`;
  } else if (totalScore >= 6) {
    suggestedPriority = "CRITICAL";
    suggestedReason = `Composite severity score ${totalScore} (multiple abnormal vitals)`;
  } else if (abnormalCount >= 2 || totalScore >= 3) {
    suggestedPriority = "HIGH";
    suggestedReason = `${abnormalCount} abnormal vital${abnormalCount > 1 ? "s" : ""}, score ${totalScore}`;
  }
  if (hr_mod === "BLEEDING" && suggestedPriority === "ROUTINE") {
    suggestedPriority = "HIGH";
    suggestedReason += " · active bleeding";
  }
  if (sbp_mod === "INOTROPES") {
    suggestedPriority = "CRITICAL";
    suggestedReason = "Patient on inotropes — critical by definition";
  }
  if (spo2_mod === "INTUBATED") {
    suggestedPriority = "CRITICAL";
    suggestedReason = "Intubated patient — critical by definition";
  }
  return { perVital: checks, totalScore, criticalCount, abnormalCount, suggestedPriority, suggestedReason };
}

// Stability-vs-vitals mismatch detector
// Returns null if consistent, or { severity, message } if mismatch
function detectStabilityMismatch(stability, suggestedPriority) {
  const stabRank = { "Stable": 0, "Potentially unstable": 1, "Unstable": 2, "Critical": 3 };
  const priRank  = { "ROUTINE": 0, "HIGH": 2, "CRITICAL": 3 };
  const sR = stabRank[stability], pR = priRank[suggestedPriority];
  if (sR == null || pR == null) return null;
  // Engine sees danger but clinician marked stable — the dangerous direction
  if (pR - sR >= 2) {
    return {
      severity: "warn",
      message: `You marked patient "${stability}" but vital-engine assessment is ${suggestedPriority}. Please confirm — review vitals or upgrade stability.`,
    };
  }
  // Clinician marked critical but engine sees nothing — gestalt over-call (fine, no warning)
  return null;
}

// Map tier to color (uses existing color tokens c.*)
function veTierToColor(tier) {
  if (tier === "critical")   return c.critical;
  if (tier === "abnormal")   return c.warning;
  if (tier === "borderline") return c.copper || c.warning;
  return c.ink;
}

// ────────────────────────────────────────────────────────────────────────────
// CANONICAL FIELD ALIASES
// Tablet's legacy field names are kept in seed/internal for back-compat,
// but outbound submit() emits BOTH the legacy names AND the canonical names
// expected by the hospital portal v2.0 / NCRIS message schema.
//   legacy           →  canonical
//   primaryCategory  →  primaryCondition
//   subCategory      →  subCondition
//   reasonForReferral→  reasons
//   serviceNeeded    →  services
//   oxygen           →  spo2_modifier (uppercased)
//   inotropes (bool) →  sbp_modifier ("INOTROPES" | "")
//   bleeding (bool)  →  hr_modifier  ("BLEEDING"  | "")
//   avpu             →  gcs_alertness
// ────────────────────────────────────────────────────────────────────────────
function toCanonicalReferral(legacy) {
  const v = legacy.vitals || {};
  return {
    ...legacy,
    primaryCondition: legacy.primaryCondition || legacy.primaryCategory,
    subCondition:     legacy.subCondition     || legacy.subCategory,
    reasons:          legacy.reasons          || legacy.reasonForReferral,
    services:         legacy.services         || legacy.serviceNeeded,
    vitals: {
      ...v,
      spo2_modifier: v.spo2_modifier || (v.oxygen === "intubated" ? "INTUBATED" : v.oxygen === "oxygen" ? "OXYGEN" : v.oxygen === "ORA" ? "ORA" : ""),
      sbp_modifier:  v.sbp_modifier  || (v.inotropes ? "INOTROPES" : ""),
      hr_modifier:   v.hr_modifier   || (v.bleeding  ? "BLEEDING"  : ""),
      gcs_alertness: v.gcs_alertness || v.avpu,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// INITIAL REFERRALS (live-feeling demo state)
// ────────────────────────────────────────────────────────────────────────────

const INITIAL_REFERRALS = [
  {
    id: "KBU-26-0501-I001", direction: "incoming", state: "PENDING", priority: "CRITICAL",
    patientId: "RID-248913", name: "K. A.", age: 55, sex: "F", patientCategory: "Adult",
    chiefComplaint: "Acute chest pain with severe respiratory distress", primaryCategory: "Medical", subCategory: "Acute coronary syndrome",
    primaryCondition: "Medical", subCondition: "Acute coronary syndrome",
    serviceNeeded: ["Cardiology", "ICU", "Cardiac Cath Lab"], reasonForReferral: ["Higher level care", "ICU/HDU bed needed", "Specialist review"],
    services: ["Cardiology", "ICU", "Cardiac Cath Lab"], reasons: ["Higher level care", "ICU/HDU bed needed", "Specialist review"],
    fromFacility: "RID", toFacility: "KBU", referringClinician: "Dr. A. Mensah", referringRole: "Medical Officer", referringPhone: "024 000 0001",
    distance: 5.2, eta: "≈12m", initiatedAt: minutesAgo(2),
    vitals: { sbp: 222, dbp: 174, hr: 135, rr: 36, spo2: 89, temp: 36.8, gcs: 10, rbs: 10.4, oxygen: "oxygen", avpu: "Responds to voice", bleeding: false, inotropes: false, spo2_modifier: "OXYGEN", sbp_modifier: "", hr_modifier: "", gcs_alertness: "Responds to voice" },
    stability: "Critical", interventions: "Oxygen commenced; ECG requested",
    summary: "Sudden chest/back discomfort, vomiting, collapse and severe dyspnoea. Needs urgent cardiology/ICU review.",
    audit: [{ t: minutesAgo(2), actor: "Ridge Hospital", action: "Incoming referral initiated" }],
  },
  {
    id: "KBU-26-0501-I002", direction: "incoming", state: "PENDING", priority: "HIGH",
    patientId: "TEM-774201", name: "M. T.", age: 29, sex: "F", patientCategory: "Obstetric",
    chiefComplaint: "Severe preeclampsia at 37 weeks", primaryCategory: "Obstetric", subCategory: "Severe preeclampsia",
    primaryCondition: "Obstetric", subCondition: "Severe preeclampsia",
    serviceNeeded: ["Obstetrics", "Blood Bank", "Anaesthesia/ICU"], reasonForReferral: ["Specialist review", "Higher level care"],
    services: ["Obstetrics", "Blood Bank", "Anaesthesia/ICU"], reasons: ["Specialist review", "Higher level care"],
    fromFacility: "TEM", toFacility: "KBU", referringClinician: "Dr. E. Tetteh", referringRole: "MO", referringPhone: "024 000 0002",
    distance: 18.4, eta: "≈25m", initiatedAt: minutesAgo(6),
    vitals: { sbp: 171, dbp: 112, hr: 104, rr: 24, spo2: 97, temp: 36.6, gcs: 15, rbs: 5.8, oxygen: "ORA", avpu: "Alert", bleeding: false, inotropes: false, spo2_modifier: "ORA", sbp_modifier: "", hr_modifier: "", gcs_alertness: "Alert" },
    stability: "Potentially unstable", interventions: "IV access secured; magnesium sulphate commenced.",
    summary: "Primigravida, severe-range BP with headache. Requires specialist obstetric review and delivery planning.",
    audit: [{ t: minutesAgo(6), actor: "Tema General", action: "Incoming referral initiated" }],
  },
  {
    id: "KBU-26-0501-I003", direction: "incoming", state: "EN_ROUTE", priority: "HIGH",
    patientId: "LEK-102488", name: "Y. B.", age: 14, sex: "F", patientCategory: "Paediatric",
    chiefComplaint: "Sickle cell crisis with suspected acute complication", primaryCategory: "Paediatric", subCategory: "Severe anaemia",
    primaryCondition: "Paediatric", subCondition: "Severe anaemia",
    serviceNeeded: ["Paediatrics", "Blood Bank", "ICU"], reasonForReferral: ["Blood unavailable", "Higher level care"],
    services: ["Paediatrics", "Blood Bank", "ICU"], reasons: ["Blood unavailable", "Higher level care"],
    fromFacility: "LEK", toFacility: "KBU", referringClinician: "Dr. N. Ofori", referringRole: "MO", referringPhone: "024 000 0003",
    distance: 11.3, eta: "≈8m", initiatedAt: minutesAgo(18), dispatchedAt: minutesAgo(5),
    vitals: { sbp: 96, dbp: 58, hr: 135, rr: 32, spo2: 94, temp: 38.7, gcs: 15, rbs: 6.1, oxygen: "oxygen", avpu: "Alert", bleeding: false, inotropes: false, spo2_modifier: "OXYGEN", sbp_modifier: "", hr_modifier: "", gcs_alertness: "Alert" },
    stability: "Potentially unstable", interventions: "Oxygen and IV fluids commenced. Analgesia given.",
    summary: "Known SCD-SS with fever, jaundice and severe pain. Needs paediatric review and blood bank support.",
    audit: [{ t: minutesAgo(18), actor: "LEKMA", action: "Referral accepted and ambulance dispatched" }],
  },
];

// On-call roster
const ONCALL = [
  { dept: "ED", primary: { name: "Dr. K. Asante", role: "Consultant", phone: "0244 122 091", here: true }, backup: { name: "Dr. E. Magbin", role: "Consultant", phone: "024 555 0001" } },
  { dept: "Cardiology", primary: { name: "Dr. M. Boadi", role: "Specialist", phone: "0244 988 314", here: false }, backup: { name: "Dr. S. Owusu", role: "Senior Reg.", phone: "0244 715 882" } },
  { dept: "OBGYN", primary: { name: "Dr. F. Adjei", role: "Consultant", phone: "0244 671 209", here: true }, backup: { name: "Dr. N. Mensah", role: "Senior Reg.", phone: "0244 318 207" } },
  { dept: "Neurosurg", primary: { name: "Dr. P. Quaye", role: "Consultant", phone: "0244 449 117", here: false }, backup: { name: "Dr. J. Tetteh", role: "Senior Reg.", phone: "0244 906 558" } },
  { dept: "Anaesthesia", primary: { name: "Dr. A. Owusu", role: "Senior Reg.", phone: "0244 207 558", here: true }, backup: { name: "Dr. R. Boateng", role: "Consultant", phone: "0244 882 091" } },
  { dept: "ICU", primary: { name: "Dr. L. Frimpong", role: "Consultant", phone: "0244 555 311", here: true }, backup: null },
  { dept: "Paediatrics", primary: { name: "Dr. C. Ofori", role: "Consultant", phone: "0244 226 419", here: true }, backup: { name: "Dr. B. Kwakye", role: "Senior Reg.", phone: "0244 711 308" } },
  { dept: "Trauma/Ortho", primary: { name: "Dr. D. Nyarko", role: "Consultant", phone: "0244 612 805", here: false }, backup: { name: "Dr. T. Asare", role: "Senior Reg.", phone: "0244 199 412" } },
];

// 24-hour referral volume (for sparkline)
const VOLUME_24H = [2,1,1,3,2,3,4,5,7,9,12,14,15,13,11,10,12,14,13,11,9,7,5,4];
const ACCEPT_TIME_TREND = [2.4,2.3,2.1,2.0,1.9,1.8,1.8,1.7,1.8,1.9,1.8,1.7,1.8,1.9,1.8];

// ════════════════════════════════════════════════════════════════════════════
// PRIMITIVES — typography, badges, charts, form atoms
// ════════════════════════════════════════════════════════════════════════════

// — Typography helpers
const Eyebrow = ({ children, color, className = "" }) => (
  <div className={className} style={{ ...eyebrow, color: color || c.ink3 }}>{children}</div>
);
const DisplayNum = ({ children, color, size = 32, className = "" }) => (
  <span className={`tabular-nums ${className}`} style={{ fontFamily: fontDisplay, fontSize: size, fontWeight: 500, lineHeight: 1, letterSpacing: "-0.02em", color: color || c.ink }}>{children}</span>
);
const Mono = ({ children, color, size = 11, className = "" }) => (
  <span className={`tabular-nums ${className}`} style={{ fontFamily: fontMono, fontSize: size, color: color || c.ink2 }}>{children}</span>
);

// — Pills
const Pill = ({ children, fg, bg, icon: Icon, dot, size = "sm" }) => {
  const sizing = size === "xs" ? "px-1.5 py-0 text-[9.5px] gap-0.5" : "px-2 py-0.5 text-[10.5px] gap-1";
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizing}`} style={{ color: fg, backgroundColor: bg }}>
      {dot && <span className="w-1 h-1 rounded-full" style={{ backgroundColor: fg }} />}
      {Icon && <Icon size={size === "xs" ? 8 : 10} strokeWidth={2.5} />}
      {children}
    </span>
  );
};
const Tag = ({ children, color }) => (
  <span className="inline-block px-1.5 py-0.5 text-[10px] rounded font-mono" style={{ backgroundColor: c.surface3, color: color || c.ink2, fontFamily: fontMono }}>{children}</span>
);

// — Sparkline
function Sparkline({ data, color, height = 22, width = 60, showArea = false, showDot = true }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - ((v - min) / range) * (height - 2) - 1]);
  const linePts = pts.map(p => p.join(",")).join(" ");
  const areaPts = `0,${height} ${linePts} ${width},${height}`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      {showArea && <polygon points={areaPts} fill={color} opacity="0.08" />}
      <polyline points={linePts} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      {showDot && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="1.8" fill={color} />}
    </svg>
  );
}

// — MiniBars (for distribution)
function MiniBars({ data, color, height = 22, width = 60 }) {
  const max = Math.max(...data) || 1;
  const barWidth = width / data.length - 1;
  return (
    <svg width={width} height={height}>
      {data.map((v, i) => {
        const h = (v / max) * height;
        return <rect key={i} x={i * (barWidth + 1)} y={height - h} width={barWidth} height={h} fill={color} opacity={0.6 + (i / data.length) * 0.4} />;
      })}
    </svg>
  );
}

// — KPI tile (the workhorse)
function KPI({ label, value, sub, delta, deltaTone, sparkData, sparkColor, tone, hint }) {
  const tones = { critical: c.critical, info: c.info, primary: c.primary, neutral: c.ink, warning: c.warning, copper: c.copper };
  const valColor = tones[tone] || c.ink;
  const deltaColor = deltaTone === "up_good" ? c.primary : deltaTone === "down_bad" ? c.critical : deltaTone === "down_good" ? c.primary : deltaTone === "up_bad" ? c.critical : c.ink3;
  return (
    <div className="text-right group">
      <Eyebrow>{label}</Eyebrow>
      <div className="flex items-baseline justify-end gap-2 mt-0.5">
        <DisplayNum size={22} color={valColor}>{value}</DisplayNum>
        {sparkData && <Sparkline data={sparkData} color={sparkColor || valColor} width={48} height={16} />}
      </div>
      <div className="text-[10px] mt-1 flex items-center justify-end gap-1.5" style={{ color: c.ink3 }}>
        {delta != null && <span style={{ color: deltaColor, fontFamily: fontMono }}>{delta}</span>}
        {sub && <span>{sub}</span>}
        {hint && <span className="opacity-0 group-hover:opacity-100 transition" title={hint}><Info size={10} /></span>}
      </div>
    </div>
  );
}

// — StatTick (label/value pair)
function StatTick({ label, value, color, sparkData, mono = true }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: c.ink3, fontFamily: fontMono, letterSpacing: "0.12em" }}>{label}</div>
      <div className="flex items-center gap-2">
        {sparkData && <Sparkline data={sparkData} color={color || c.primaryMid} width={36} height={12} />}
        <div className="text-[12px] font-semibold tabular-nums" style={{ color: color || c.ink, fontFamily: mono ? fontMono : fontBody }}>{value}</div>
      </div>
    </div>
  );
}

// — Section header
function SectionHeader({ title, count, sublabel, action }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-[14px] font-semibold tracking-tight" style={{ color: c.ink, fontFamily: fontDisplay }}>{title}</h2>
        {count != null && <span className="text-[11px] tabular-nums" style={{ color: c.ink3, fontFamily: fontMono }}>{count}</span>}
      </div>
      <div className="flex items-center gap-3">
        {sublabel && <span className="text-[10.5px]" style={{ color: c.ink3 }}>{sublabel}</span>}
        {action}
      </div>
    </div>
  );
}

// — Divider with optional label
function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="h-px flex-1" style={{ backgroundColor: c.border }} />
      {label && <Eyebrow>{label}</Eyebrow>}
      <div className="h-px flex-1" style={{ backgroundColor: c.border }} />
    </div>
  );
}

// — Empty state
function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="px-6 py-12 rounded-lg border border-dashed text-center" style={{ borderColor: c.borderMid, backgroundColor: c.surface }}>
      <div className="w-10 h-10 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ backgroundColor: c.surface2 }}>
        <Icon size={18} style={{ color: c.ink3 }} />
      </div>
      {title && <div className="text-[13px] font-medium mb-1" style={{ color: c.ink, fontFamily: fontDisplay }}>{title}</div>}
      <div className="text-[11.5px] max-w-[280px] mx-auto" style={{ color: c.ink2 }}>{message}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// — Card primitive
function Card({ children, className = "", padding = "p-4", interactive = false, accent }) {
  return (
    <div
      className={`rounded-lg border bg-white ${padding} ${className} ${interactive ? "transition hover:border-[#D4D1C8] hover:shadow-sm cursor-pointer" : ""}`}
      style={{ borderColor: c.border, ...(accent && { borderLeftWidth: 3, borderLeftColor: accent }) }}
    >
      {children}
    </div>
  );
}

// — Form primitives
function FormLabel({ children, required, hint }) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <label style={eyebrow}>
        {children} {required && <span style={{ color: c.critical }}>*</span>}
      </label>
      {hint && <span className="text-[10px]" style={{ color: c.ink3 }}>{hint}</span>}
    </div>
  );
}
function FormInput({ value, onChange, placeholder, type = "text", suffix, autoFocus, prefix }) {
  const isNumberLike = type === "number";

  return (
    <div className="relative w-full">
      {prefix && (
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px]"
          style={{ color: c.ink3, pointerEvents: "none" }}
        >
          {prefix}
        </span>
      )}

      <input
        type={isNumberLike ? "text" : type}
        inputMode={isNumberLike ? "decimal" : undefined}
        value={value ?? ""}
        onChange={(e) => onChange(e.currentTarget.value)}
        onInput={(e) => onChange(e.currentTarget.value)}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full px-3 py-2 rounded-md border text-[13px] outline-none transition focus:border-[#0A4D3C] tabular-nums"
        style={{
          borderColor: c.borderMid,
          color: c.ink,
          backgroundColor: c.surface,
          fontFamily: isNumberLike ? fontMono : fontBody,
          paddingLeft: prefix ? 26 : 12,
          paddingRight: suffix ? 52 : 12,
        }}
      />

      {suffix && (
        <span
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[10.5px]"
          style={{ color: c.ink3, fontFamily: fontMono, pointerEvents: "none" }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
}
function FormChip({ label, selected, onClick, tone, dense }) {
  const tones = {
    critical: { bg: c.criticalSoft, fg: c.critical, border: "#F8C0C0" },
    warning:  { bg: c.warningSoft, fg: c.warning, border: "#F0CD7C" },
    primary:  { bg: c.primarySoft, fg: c.primary, border: c.primaryMid },
    info:     { bg: c.infoSoft, fg: c.info, border: "#A5BDE8" },
  };
  const t = tone ? tones[tone] : { bg: c.ink, fg: "#fff", border: c.ink };
  const padding = dense ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-[12px]";
  return (
    <button onClick={onClick} className={`${padding} rounded-md border transition`} style={{
      backgroundColor: selected ? t.bg : c.surface, color: selected ? t.fg : c.ink2,
      borderColor: selected ? t.border : c.border, fontWeight: selected ? 600 : 400,
    }}>{label}</button>
  );
}

// — Button
function Btn({ children, onClick, variant = "default", icon: Icon, size = "md", disabled, fullWidth }) {
  const sizes = {
    sm: "px-2.5 py-1 text-[11px] gap-1",
    md: "px-3 py-1.5 text-[12px] gap-1.5",
    lg: "px-4 py-2 text-[12.5px] gap-1.5",
  };
  const variants = {
    default:  { bg: c.surface, fg: c.ink2, border: c.borderMid },
    primary:  { bg: c.primary, fg: "#fff", border: c.primary },
    ghost:    { bg: "transparent", fg: c.ink2, border: "transparent" },
    critical: { bg: c.surface, fg: c.critical, border: "#F0C5C5" },
    accept:   { bg: c.primary, fg: "#fff", border: c.primary },
  };
  const v = variants[variant];
  return (
    <button onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center rounded-md border font-medium transition ${sizes[size]} ${fullWidth ? "w-full" : ""} ${disabled ? "opacity-40 cursor-not-allowed" : "hover:brightness-95"}`} style={{ backgroundColor: v.bg, color: v.fg, borderColor: v.border }}>
      {Icon && <Icon size={size === "sm" ? 11 : size === "lg" ? 14 : 13} strokeWidth={variant === "primary" || variant === "accept" ? 2.5 : 2} />}
      {children}
    </button>
  );
}

// — Vital signs strip (consistent display across the app)
function VitalsStrip({ vitals, dense, showFlags = true, age, patientCategory }) {
  // Engine-driven assessment — age-aware, 4-tier, Ghana STG + WHO IMCI
  const assessment = useMemo(
    () => assessVitals(vitals, age, patientCategory),
    [vitals, age, patientCategory]
  );
  const tierOf = (key) => assessment.perVital[key]?.tier || "normal";
  // BP cell takes the worst tier of SBP and DBP
  const bpTier = [tierOf("sbp"), tierOf("dbp")]
    .sort((a, b) => VE_TIER_SCORE[b] - VE_TIER_SCORE[a])[0] || "normal";

  const items = [
    { k: "BP",   v: `${vitals.sbp}/${vitals.dbp}`, tier: bpTier },
    { k: "HR",   v: vitals.hr,           tier: tierOf("hr") },
    { k: "RR",   v: vitals.rr,           tier: tierOf("rr") },
    { k: "SpO₂", v: `${vitals.spo2}%`,   tier: tierOf("spo2") },
    { k: "T°",   v: vitals.temp,         tier: tierOf("temp") },
    { k: "GCS",  v: vitals.gcs,          tier: tierOf("gcs") },
  ];
  return (
    <div className={`flex items-center ${dense ? "gap-2" : "gap-3"}`}>
      {items.map(v => (
        <div key={v.k} className="flex items-baseline gap-1">
          <span className={dense ? "text-[10px]" : "text-[10.5px]"} style={{ color: c.ink3, fontFamily: fontMono }}>{v.k}</span>
          <span className={`${dense ? "text-[11px]" : "text-[12px]"} font-semibold tabular-nums`} style={{ color: veTierToColor(v.tier), fontFamily: fontMono }}>{v.v}</span>
        </div>
      ))}
      {showFlags && (
        <div className="flex items-center gap-1 ml-1">
          {vitals.bleeding && <Pill fg={c.critical} bg={c.criticalSoft} size="xs" dot>Bleeding</Pill>}
          {vitals.inotropes && <Pill fg={c.critical} bg={c.criticalSoft} size="xs" dot>Inotropes</Pill>}
          {vitals.oxygen === "intubated" && <Pill fg={c.critical} bg={c.criticalSoft} size="xs" dot>Intubated</Pill>}
          {vitals.oxygen === "oxygen" && <Pill fg={c.warning} bg={c.warningSoft} size="xs" dot>O₂</Pill>}
        </div>
      )}
    </div>
  );
}

// — SLA timer
function SLATimer({ initiatedAt, priority }) {
  const elapsed = elapsedFromNow(initiatedAt);
  const target = slaTargetSec(priority);
  const pct = Math.min(100, (elapsed.totalSec / target) * 100);
  const breached = elapsed.totalSec > target;
  const warn = pct > 70 && !breached;
  const tone = breached ? c.critical : warn ? c.warning : c.primary;
  const bg = breached ? c.criticalSoft : warn ? c.warningSoft : c.primarySoft;
  return (
    <div className="text-right px-2.5 py-1 rounded-md" style={{ backgroundColor: bg, color: tone }}>
      <div className="text-[8.5px] uppercase tracking-wider" style={{ fontFamily: fontMono, opacity: 0.75, letterSpacing: "0.12em" }}>
        {breached ? "SLA breached" : warn ? "Approaching" : "Waiting"}
      </div>
      <div className="text-[12.5px] font-semibold tabular-nums" style={{ fontFamily: fontMono }}>{elapsed.formatted}</div>
    </div>
  );
}

// — Toast notification
function Toast({ toast, onClose }) {
  const tones = {
    success: { bg: c.primary, ring: c.primaryMid },
    primary: { bg: c.primary, ring: c.primaryMid },
    info:    { bg: c.info, ring: c.infoMid },
    warning: { bg: c.warning, ring: c.warningMid },
    critical:{ bg: c.critical, ring: c.criticalMid },
  };
  const t = tones[toast.tone || "info"] || tones.info;
  return (
    <div className="rounded-lg overflow-hidden shadow-2xl flex items-stretch min-w-[320px] max-w-[420px] animate-in slide-in-from-right-5" style={{ backgroundColor: c.surface, border: `1px solid ${c.border}` }}>
      <div className="w-1" style={{ backgroundColor: t.bg }} />
      <div className="flex-1 p-3 flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          {toast.title && <div className="text-[12.5px] font-semibold mb-0.5" style={{ color: c.ink, fontFamily: fontDisplay }}>{toast.title}</div>}
          <div className="text-[11.5px]" style={{ color: c.ink2 }}>{toast.body || toast.message}</div>
        </div>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-stone-100"><X size={13} style={{ color: c.ink3 }} /></button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LAYOUT CHROME — TopBar, StatusStrip, Sidebar
// ════════════════════════════════════════════════════════════════════════════

// — Status strip: live system telemetry, always visible

// — TopBar

// — Sidebar

// ════════════════════════════════════════════════════════════════════════════
// REFERRAL CARDS
// ════════════════════════════════════════════════════════════════════════════


// — Compact in-flight row

// — Outbound row

// ════════════════════════════════════════════════════════════════════════════
// RIGHT-RAIL PANELS
// ════════════════════════════════════════════════════════════════════════════

// — Emergency capacity (ED/ICU/HDU only)

// — Service availability (live operational toggles)

// — RQI panel (with mini 2x2 matrix preview)

// — On-call panel

// — Activity feed

// ════════════════════════════════════════════════════════════════════════════
// TRIAGE VIEW — the home of the hospital portal
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// REFERRAL WIZARD — full 6-step per spec doc
// ════════════════════════════════════════════════════════════════════════════
function ReferralWizard({ onClose, onSubmit, availability }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    age: "", sex: "", patientCategory: "", hospitalNumber: "", initials: "",
    primaryCategory: "", subCategory: "", otherCondition: "",
    reasonForReferral: [], requestedService: [],
    stability: "",
    sbp: "", dbp: "", hr: "", rr: "", temp: "", spo2: "", rbs: "", gcs: 15,
    inotropes: false, bleeding: false, oxygen: "ORA", avpu: "Alert",
    interventions: "None", summary: "", destination: "", transportMode: "",
  });
  const update = useCallback((patch) => setData(d => ({ ...d, ...patch })), []);

  // Auto-rules
  useEffect(() => {
    if (data.patientCategory === "Obstetric") update({ primaryCategory: "Obstetric" });
    if (data.patientCategory === "Paediatric") update({ primaryCategory: "Paediatric" });
    if (data.patientCategory === "Neonate") update({ primaryCategory: "Neonatal" });
  }, [data.patientCategory, update]);
  useEffect(() => {
    const g = parseInt(data.gcs);
    if (g <= 3) update({ avpu: "Unresponsive" });
    else if (g >= 15) update({ avpu: "Alert" });
  }, [data.gcs, update]);

  const steps = [
    { n: 1, label: "Patient" }, { n: 2, label: "Condition" }, { n: 3, label: "Reason · Service" },
    { n: 4, label: "Vitals" }, { n: 5, label: "Summary" }, { n: 6, label: "Destination" },
  ];

  const canAdvance = () => {
    if (step === 1) return data.age && data.sex && data.patientCategory;
    if (step === 2) return data.primaryCategory && (data.subCategory && data.subCategory !== "__other" || data.otherCondition);
    if (step === 3) return data.reasonForReferral.length && data.requestedService.length;
    if (step === 4) return data.sbp && data.hr && data.rr && data.temp && data.spo2 && data.gcs && data.stability;
    if (step === 5) return data.summary.length > 10;
    if (step === 6) return data.destination && data.transportMode;
    return false;
  };

  const submit = () => {
    // Compute engine-suggested priority + check for stability/vitals mismatch
    const ageNum = parseInt(data.age);
    const submitAssessment = assessVitals(data, isNaN(ageNum) ? null : ageNum, data.patientCategory);
    const stabilityPriority = data.stability === "Critical" || data.stability === "Unstable" ? "CRITICAL"
                            : data.stability === "Potentially unstable" ? "HIGH"
                            : "ROUTINE";
    // Take the WORSE of the two — engine catches what stability misses
    const priRank = { ROUTINE: 0, HIGH: 1, CRITICAL: 2 };
    const priority = priRank[submitAssessment.suggestedPriority] >= priRank[stabilityPriority]
      ? submitAssessment.suggestedPriority
      : stabilityPriority;

    const finalSub = data.subCategory === "__other" ? data.otherCondition : data.subCategory;
    const sbp_modifier  = data.inotropes ? "INOTROPES" : "";
    const hr_modifier   = data.bleeding  ? "BLEEDING"  : "";
    const spo2_modifier = data.oxygen === "intubated" ? "INTUBATED"
                       : data.oxygen === "oxygen"    ? "OXYGEN"
                       : data.oxygen === "ORA"       ? "ORA" : "";

    onSubmit({
      direction: "out",
      priority,
      // Engine metadata (carried alongside referral for downstream auditing)
      enginePriority: submitAssessment.suggestedPriority,
      enginePriorityReason: submitAssessment.suggestedReason,
      engineScore: submitAssessment.totalScore,
      priorityOverridden: priority !== submitAssessment.suggestedPriority,

      // ─── LEGACY field names (preserved for tablet-internal compatibility) ───
      chiefComplaint: finalSub,
      primaryCategory: data.primaryCategory,
      subCategory: finalSub,
      serviceNeeded: data.requestedService,
      reasonForReferral: data.reasonForReferral,

      // ─── CANONICAL field names (per portal v2.0 / NCRIS message schema) ───
      primaryCondition: data.primaryCategory,
      subCondition: finalSub,
      services: data.requestedService,
      reasons: data.reasonForReferral,

      // Patient
      age: parseInt(data.age),
      sex: data.sex,
      patientCategory: data.patientCategory,
      hospitalNumber: data.hospitalNumber,
      patientInitials: data.initials,

      // Routing
      toFacility: data.destination,
      destFacility: data.destination, // canonical alias
      referringClinician: "Dr. E. Magbin",
      referringRole: "ED Consultant",
      referringPhone: "024 555 0001",

      // Narrative
      notes: data.summary,
      summary: data.summary,

      // Vitals — both legacy boolean modifiers AND canonical string modifiers
      vitals: {
        sbp: parseInt(data.sbp) || 0,
        dbp: parseInt(data.dbp) || 0,
        hr: parseInt(data.hr) || 0,
        rr: parseInt(data.rr) || 0,
        spo2: parseInt(data.spo2) || 0,
        temp: parseFloat(data.temp) || 0,
        gcs: parseInt(data.gcs) || 15,
        rbs: parseFloat(data.rbs) || 0,
        // Legacy modifier shape
        inotropes: data.inotropes,
        bleeding: data.bleeding,
        oxygen: data.oxygen,
        avpu: data.avpu,
        // Canonical modifier shape (uppercase strings, used by portal)
        sbp_modifier,
        hr_modifier,
        spo2_modifier,
        gcs_alertness: data.avpu,
      },
      interventions: data.interventions,
      stability: data.stability,

      // Transport
      transport: { mode: data.transportMode, dispatchedAt: new Date() },
      distance: 4.0,
      ghimsLinked: true,
      audit: [{ t: new Date(), actor: "Dr. E. Magbin · Korle-Bu", action: "Outbound referral initiated" }],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: "rgba(20,18,15,0.55)", backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()} style={{ border: `1px solid ${c.borderMid}` }}>
        {/* Header */}
        <div className="px-6 py-4 border-b" style={{ borderColor: c.border, backgroundColor: c.surface2 }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <Eyebrow className="mb-1">Outbound referral</Eyebrow>
              <h2 className="text-[20px] font-medium tracking-tight" style={{ color: c.ink, fontFamily: fontDisplay }}>Initiate new referral</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-stone-200 transition"><X size={17} style={{ color: c.ink2 }} /></button>
          </div>
          {/* Stepper */}
          <div className="flex items-center gap-1.5">
            {steps.map((s, i) => (
              <React.Fragment key={s.n}>
                <button onClick={() => step > s.n && setStep(s.n)} className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition" style={{ backgroundColor: step > s.n ? c.primary : step === s.n ? c.primary : c.surface3, color: step >= s.n ? "#fff" : c.ink3, fontFamily: fontMono }}>
                    {step > s.n ? <Check size={11} strokeWidth={3} /> : s.n}
                  </div>
                  <span className="text-[11px]" style={{ color: step === s.n ? c.ink : c.ink3, fontWeight: step === s.n ? 600 : 400 }}>{s.label}</span>
                </button>
                {i < steps.length - 1 && <div className="flex-1 h-px" style={{ backgroundColor: step > s.n ? c.primary : c.border }} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-5">
          {step === 1 && <WizPatient data={data} update={update} />}
          {step === 2 && <WizCondition data={data} update={update} />}
          {step === 3 && <WizReason data={data} update={update} />}
          {step === 4 && <WizVitals data={data} update={update} />}
          {step === 5 && <WizSummary data={data} update={update} />}
          {step === 6 && <WizDest data={data} update={update} availability={availability} />}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex items-center justify-between" style={{ borderColor: c.border, backgroundColor: c.surface2 }}>
          <Btn size="md" onClick={() => step > 1 ? setStep(step - 1) : onClose()} icon={step > 1 ? ChevronLeft : undefined}>
            {step > 1 ? "Back" : "Cancel"}
          </Btn>
          <Mono color={c.ink3} size={10.5}>Step {step} of {steps.length}</Mono>
          {step < steps.length ? (
            <Btn variant="primary" size="md" onClick={() => canAdvance() && setStep(step + 1)} disabled={!canAdvance()}>
              Continue<ChevronRight size={13} />
            </Btn>
          ) : (
            <Btn variant="primary" size="md" icon={Send} onClick={submit} disabled={!canAdvance()}>Submit referral</Btn>
          )}
        </div>
      </div>
    </div>
  );
}

function WizPatient({ data, update }) {
  const cats = ["Adult", "Paediatric", "Neonate", "Obstetric"];
  return (
    <div className="space-y-5">
      <div>
        <FormLabel required hint="determines condition group cascade">Patient category</FormLabel>
        <div className="grid grid-cols-4 gap-2">
          {cats.map(cat => (
            <button key={cat} onClick={() => update({ patientCategory: cat })} className="px-3 py-3 rounded-md border text-[13px] transition" style={{ backgroundColor: data.patientCategory === cat ? c.primary : c.surface, color: data.patientCategory === cat ? "#fff" : c.ink, borderColor: data.patientCategory === cat ? c.primary : c.borderMid, fontWeight: data.patientCategory === cat ? 600 : 400 }}>{cat}</button>
          ))}
        </div>
        {data.patientCategory && data.patientCategory !== "Adult" && (
          <div className="mt-2 text-[11px] px-3 py-1.5 rounded-md flex items-center gap-1.5" style={{ backgroundColor: c.infoSoft, color: c.info }}>
            <Info size={11} />Condition group will lock to <b>{data.patientCategory === "Neonate" ? "Neonatal" : data.patientCategory}</b>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FormLabel required>Age</FormLabel>
          <FormInput value={data.age} onChange={v => update({ age: v })} type="number" placeholder="e.g. 34" suffix={data.patientCategory === "Neonate" ? "days" : "yrs"} autoFocus />
        </div>
        <div>
          <FormLabel required>Sex</FormLabel>
          <div className="flex gap-2">
            {["M","F"].map(s => (
              <button key={s} onClick={() => update({ sex: s })} className="flex-1 py-2 rounded-md border text-[13px]" style={{ backgroundColor: data.sex === s ? c.primary : c.surface, color: data.sex === s ? "#fff" : c.ink, borderColor: data.sex === s ? c.primary : c.borderMid }}>{s === "M" ? "Male" : "Female"}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><FormLabel hint="optional">Hospital number</FormLabel><FormInput value={data.hospitalNumber} onChange={v => update({ hospitalNumber: v })} placeholder="GHIMS / facility ID" /></div>
        <div><FormLabel hint="2-4 chars">Initials</FormLabel><FormInput value={data.initials} onChange={v => update({ initials: v })} placeholder="e.g. KAA" /></div>
      </div>
      <div className="rounded-md border px-3 py-2.5 flex items-center gap-2 text-[11px]" style={{ borderColor: c.border, backgroundColor: c.surface2, color: c.ink2 }}>
        <Wifi size={12} style={{ color: c.info }} />
        <span><b style={{ color: c.info }}>GHIMS</b> patient lookup will run on submit · matched records auto-link</span>
      </div>
    </div>
  );
}

function WizCondition({ data, update }) {
  const locked = ["Obstetric","Paediatric","Neonate"].includes(data.patientCategory);
  const lockedCat = data.patientCategory === "Neonate" ? "Neonatal" : data.patientCategory;
  const cats = locked ? [lockedCat] : Object.keys(CONDITIONS);
  const subs = data.primaryCategory ? CONDITIONS[data.primaryCategory] || [] : [];
  return (
    <div className="space-y-5">
      <div>
        <FormLabel required>Primary condition group</FormLabel>
        {locked && (
          <div className="mb-2 text-[11px] px-3 py-1.5 rounded-md flex items-center gap-1.5" style={{ backgroundColor: c.infoSoft, color: c.info }}>
            <Info size={11} />Locked to <b>{lockedCat}</b> based on patient category
          </div>
        )}
        <div className="grid grid-cols-4 gap-2">
          {cats.map(cat => (
            <button key={cat} onClick={() => update({ primaryCategory: cat, subCategory: "" })} className="px-3 py-2 rounded-md border text-[12px]" style={{ backgroundColor: data.primaryCategory === cat ? c.primary : c.surface, color: data.primaryCategory === cat ? "#fff" : c.ink, borderColor: data.primaryCategory === cat ? c.primary : c.borderMid, fontWeight: data.primaryCategory === cat ? 600 : 400 }}>{cat}</button>
          ))}
        </div>
      </div>
      {data.primaryCategory && (
        <div>
          <FormLabel required>Specific condition</FormLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {subs.map(sub => <FormChip key={sub} label={sub} selected={data.subCategory === sub} onClick={() => update({ subCategory: sub, otherCondition: "" })} />)}
            <FormChip label="Other (specify)" selected={data.subCategory === "__other"} onClick={() => update({ subCategory: "__other" })} />
          </div>
          {data.subCategory === "__other" && (
            <div className="mt-2"><FormInput value={data.otherCondition} onChange={v => update({ otherCondition: v })} placeholder="Specify condition…" autoFocus /></div>
          )}
        </div>
      )}
    </div>
  );
}

function WizReason({ data, update }) {
  const toggleR = (r) => update({ reasonForReferral: data.reasonForReferral.includes(r) ? data.reasonForReferral.filter(x => x !== r) : [...data.reasonForReferral, r] });
  const toggleS = (s) => update({ requestedService: data.requestedService.includes(s) ? data.requestedService.filter(x => x !== s) : [...data.requestedService, s] });
  return (
    <div className="space-y-5">
      <div>
        <FormLabel required hint="multi-select">Reason for referral</FormLabel>
        <div className="grid grid-cols-3 gap-1.5">{REASONS.map(r => <FormChip key={r} label={r} selected={data.reasonForReferral.includes(r)} onClick={() => toggleR(r)} />)}</div>
      </div>
      <div>
        <FormLabel required hint="filters destinations">Requested service / specialty</FormLabel>
        <p className="text-[11px] mb-2" style={{ color: c.ink3 }}>Routing recommender will filter destinations to facilities offering ALL services AND with current capacity.</p>
        <div className="grid grid-cols-3 gap-1.5">{ALL_SERVICES.map(s => <FormChip key={s} label={s} selected={data.requestedService.includes(s)} onClick={() => toggleS(s)} tone="info" />)}</div>
      </div>
    </div>
  );
}

function WizVitals({ data, update }) {
  const stabilities = ["Stable", "Potentially unstable", "Unstable", "Critical"];
  const stabilityTones = { "Stable": "primary", "Potentially unstable": "warning", "Unstable": "critical", "Critical": "critical" };
  const oxygens = ["ORA", "oxygen", "intubated"];
  const avpus = ["Alert", "Responds to voice", "Responds to pain", "Unresponsive"];

  // Live engine assessment as user types
  const assessment = useMemo(
    () => assessVitals(data, parseFloat(data.age) || null, data.patientCategory),
    [data.sbp, data.dbp, data.hr, data.rr, data.temp, data.spo2, data.gcs, data.rbs,
     data.oxygen, data.inotropes, data.bleeding, data.age, data.patientCategory]
  );
  const tierOf = (k) => assessment.perVital[k]?.tier || "normal";

  // Stability vs vitals mismatch
  const mismatch = data.stability ? detectStabilityMismatch(data.stability, assessment.suggestedPriority) : null;

  // Border color for an input based on its tier
  const inputTierBorder = (tier) => tier === "critical" ? "#E89090" : tier === "abnormal" ? "#E5B665" : tier === "borderline" ? "#D4BC8E" : null;
  const inputTierBg     = (tier) => tier === "critical" ? c.criticalWash : tier === "abnormal" ? c.warningWash : tier === "borderline" ? (c.copperWash || c.warningWash) : null;

  // Render helper, not a nested React component.
  // A nested component function gets a new identity on every keystroke/render,
  // so React unmounts/remounts the input and the cursor loses focus.
  const renderTieredField = (tier, child) => {
    const border = inputTierBorder(tier) || "transparent";
    const bg = inputTierBg(tier) || "transparent";
    return (
      <div style={{ borderRadius: 6, padding: 1, background: border, transition: "background 0.2s" }}>
        <div style={{ borderRadius: 5, background: bg }}>
          {child}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Live engine priority badge */}
      {(data.sbp || data.hr || data.rr || data.spo2 || data.gcs) && (
        <div className="px-3 py-2.5 rounded-md border" style={{
          borderColor: assessment.suggestedPriority === "CRITICAL" ? "#E89090" : assessment.suggestedPriority === "HIGH" ? "#E5B665" : c.border,
          backgroundColor: assessment.suggestedPriority === "CRITICAL" ? c.criticalWash : assessment.suggestedPriority === "HIGH" ? c.warningWash : c.surface2,
        }}>
          <div className="flex items-center justify-between mb-1">
            <Eyebrow color={c.ink3}>Engine assessment · live</Eyebrow>
            <Mono size={10.5} color={veTierToColor(assessment.suggestedPriority === "CRITICAL" ? "critical" : assessment.suggestedPriority === "HIGH" ? "abnormal" : "normal")}>
              {assessment.suggestedPriority} · score {assessment.totalScore}
            </Mono>
          </div>
          <div className="text-[11.5px]" style={{ color: c.ink2 }}>{assessment.suggestedReason}</div>
          <div className="mt-1.5 text-[10px]" style={{ color: c.ink3, fontFamily: fontMono }}> {veAgeBand(parseFloat(data.age) || null, data.patientCategory)}</div>
        </div>
      )}

      <div>
        <FormLabel required>Patient stability</FormLabel>
        <div className="grid grid-cols-4 gap-2">{stabilities.map(s => <FormChip key={s} label={s} selected={data.stability === s} onClick={() => update({ stability: s })} tone={stabilityTones[s]} />)}</div>
      </div>

      {/* Stability ↔ engine mismatch warning */}
      {mismatch && (
        <div className="px-3 py-2.5 rounded-md border flex gap-2.5" style={{ borderColor: "#E5B665", backgroundColor: c.warningWash }}>
          <AlertTriangle size={16} style={{ color: c.warning, flexShrink: 0, marginTop: 1 }} />
          <div>
            <div className="text-[12px] font-semibold mb-0.5" style={{ color: c.warning }}>Stability ↔ vitals mismatch</div>
            <div className="text-[11.5px]" style={{ color: c.ink2 }}>{mismatch.message}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <FormLabel required>Blood pressure</FormLabel>
          <div className="flex gap-2 items-center">
            {renderTieredField(tierOf("sbp"), <FormInput value={data.sbp} onChange={v => update({ sbp: v })} type="number" placeholder="SBP" suffix="mmHg" />)}
            <span style={{ color: c.ink3 }}>/</span>
            {renderTieredField(tierOf("dbp"), <FormInput value={data.dbp} onChange={v => update({ dbp: v })} type="number" placeholder="DBP" suffix="mmHg" />)}
          </div>
          <label className="mt-1.5 flex items-center gap-2 text-[11px] cursor-pointer" style={{ color: c.ink2 }}>
            <input type="checkbox" checked={data.inotropes} onChange={e => update({ inotropes: e.target.checked })} />On inotropes
          </label>
        </div>
        <div>
          <FormLabel required>Pulse</FormLabel>
          {renderTieredField(tierOf("hr"), <FormInput value={data.hr} onChange={v => update({ hr: v })} type="number" placeholder="HR" suffix="bpm" />)}
          <label className="mt-1.5 flex items-center gap-2 text-[11px] cursor-pointer" style={{ color: c.ink2 }}>
            <input type="checkbox" checked={data.bleeding} onChange={e => update({ bleeding: e.target.checked })} />Active bleeding
          </label>
        </div>
        <div>
          <FormLabel required>Respiratory rate</FormLabel>
          {renderTieredField(tierOf("rr"), <FormInput value={data.rr} onChange={v => update({ rr: v })} type="number" placeholder="RR" suffix="/min" />)}
        </div>
        <div>
          <FormLabel required>Temperature</FormLabel>
          {renderTieredField(tierOf("temp"), <FormInput value={data.temp} onChange={v => update({ temp: v })} type="number" placeholder="36.5" suffix="°C" />)}
        </div>
        <div>
          <FormLabel required>SpO₂</FormLabel>
          {renderTieredField(tierOf("spo2"), <FormInput value={data.spo2} onChange={v => update({ spo2: v })} type="number" placeholder="98" suffix="%" />)}
          <div className="mt-1.5 flex gap-1.5">{oxygens.map(o => <FormChip key={o} label={o} selected={data.oxygen === o} onClick={() => update({ oxygen: o })} dense />)}</div>
        </div>
        <div>
          <FormLabel hint="random blood sugar">RBS</FormLabel>
          {renderTieredField(tierOf("rbs"), <FormInput value={data.rbs} onChange={v => update({ rbs: v })} type="number" placeholder="5.5" suffix="mmol/L" />)}
        </div>
      </div>
      <div>
        <FormLabel required hint="3-15 · AVPU auto-set at 3 or 15">GCS · AVPU</FormLabel>
        <div className="grid grid-cols-3 gap-3">
          {renderTieredField(tierOf("gcs"), <FormInput value={data.gcs} onChange={v => update({ gcs: v })} type="number" placeholder="3-15" suffix="/15" />)}
          <div className="col-span-2">
            <div className="grid grid-cols-2 gap-1.5">{avpus.map(a => <FormChip key={a} label={a} selected={data.avpu === a} onClick={() => update({ avpu: a })} dense />)}</div>
            {(parseInt(data.gcs) <= 3 || parseInt(data.gcs) >= 15) && (
              <Mono color={c.info} size={10} className="mt-1.5">↳ AVPU auto-set from GCS</Mono>
            )}
          </div>
        </div>
      </div>
      <div>
        <FormLabel>Investigations done</FormLabel>
        <div className="grid grid-cols-4 gap-2">{["None","Basic labs done","Imaging done","Both done"].map(i => <FormChip key={i} label={i} selected={data.interventions === i} onClick={() => update({ interventions: i })} />)}</div>
      </div>
    </div>
  );
}

function WizSummary({ data, update }) {
  const stabilityCol = data.stability === "Critical" || data.stability === "Unstable" ? c.critical : data.stability === "Potentially unstable" ? c.warning : c.primary;
  const stabilityBg = data.stability === "Critical" || data.stability === "Unstable" ? c.criticalSoft : data.stability === "Potentially unstable" ? c.warningSoft : c.primarySoft;
  return (
    <div className="space-y-5">
      <div>
        <FormLabel required hint="120-150 chars · forces clinical discipline">Clinical summary</FormLabel>
        <textarea value={data.summary} onChange={e => update({ summary: e.target.value.slice(0, 160) })} placeholder="e.g. RTA, GCS 9, pupils unequal, oxygen started, needs CT/neurosurg." className="w-full px-3 py-2.5 rounded-md border text-[13.5px] outline-none transition focus:border-[#0A4D3C] resize-none" style={{ borderColor: c.borderMid, color: c.ink, minHeight: 92, fontFamily: fontDisplay, lineHeight: 1.4 }} autoFocus />
        <div className="text-right mt-1" style={{ fontFamily: fontMono }}>
          <span className="text-[10.5px]" style={{ color: data.summary.length > 150 ? c.warning : data.summary.length > 100 ? c.primary : c.ink3 }}>{data.summary.length} / 150</span>
        </div>
      </div>

      <Card padding="p-4">
        <div className="flex items-baseline justify-between mb-3">
          <Eyebrow>Receiving facility will see</Eyebrow>
          <span className="text-[10px] flex items-center gap-1" style={{ color: c.ink3, fontFamily: fontMono }}>
            <Eye size={10} />Live preview
          </span>
        </div>
        <div className="space-y-2 text-[12.5px]">
          {[
            ["FROM", "Korle-Bu Teaching Hospital · Dr. E. Magbin"],
            ["PATIENT", `${data.patientCategory || "—"} · ${data.sex === "M" ? "Male" : data.sex === "F" ? "Female" : "—"} · ${data.age || "—"}${data.patientCategory === "Neonate" ? "d" : "yrs"}`],
            ["CONDITION", `${data.primaryCategory || "—"} · ${data.subCategory === "__other" ? data.otherCondition : data.subCategory || "—"}`],
            ["NEEDS", data.requestedService.join(" · ") || "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-3">
              <Mono color={c.ink3} size={9.5} className="min-w-[80px]">{k}</Mono>
              <span style={{ color: c.ink }}>{v}</span>
            </div>
          ))}
          <div className="flex items-baseline gap-3">
            <Mono color={c.ink3} size={9.5} className="min-w-[80px]">STABILITY</Mono>
            <Pill fg={stabilityCol} bg={stabilityBg}>{data.stability || "—"}</Pill>
          </div>
          {(data.sbp || data.hr || data.spo2 || data.gcs) && (
            <div className="flex items-baseline gap-3 pt-1.5 border-t" style={{ borderColor: c.border }}>
              <Mono color={c.ink3} size={9.5} className="min-w-[80px]">VITALS</Mono>
              <span style={{ fontFamily: fontMono, fontSize: 11, color: c.ink2 }}>
                BP {data.sbp || "—"}/{data.dbp || "—"} · HR {data.hr || "—"} · SpO₂ {data.spo2 || "—"} · GCS {data.gcs || "—"}
              </span>
            </div>
          )}
          {data.summary && (
            <div className="flex items-baseline gap-3 pt-1.5 border-t" style={{ borderColor: c.border }}>
              <Mono color={c.ink3} size={9.5} className="min-w-[80px]">SUMMARY</Mono>
              <span className="italic" style={{ color: c.ink, fontFamily: fontDisplay }}>"{data.summary}"</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function WizDest({ data, update, availability }) {
  // Compute priority from stability so we can sort destinations appropriately.
  const priority = data.stability === "Critical" || data.stability === "Unstable"
    ? "CRITICAL"
    : data.stability === "Potentially unstable"
    ? "HIGH"
    : "ROUTINE";

  // Priority-aware ranking:
  //  CRITICAL → golden hour: closest facility wins, RQI is a tie-breaker
  //  HIGH     → balanced: distance and quality weighted together (lower score = better)
  //  ROUTINE  → quality first: highest RQI wins
  const eligible = useMemo(() => FACILITY_KEYS
    .filter(k => k !== "KBU")
    .map(k => ({ key: k, ...FACILITIES[k] }))
    .filter(f => data.requestedService.every(s => f.services.includes(s)))
    .sort((a, b) => {
      if (priority === "CRITICAL") {
        // Distance dominant; RQI as tie-breaker on ties
        if ((a.distance || 0) !== (b.distance || 0)) return (a.distance || 0) - (b.distance || 0);
        return b.rqi - a.rqi;
      }
      if (priority === "HIGH") {
        // Balanced score: half-weighted distance + RQI penalty (lower is better)
        const scoreA = (a.distance || 0) * 0.5 + (100 - a.rqi);
        const scoreB = (b.distance || 0) * 0.5 + (100 - b.rqi);
        return scoreA - scoreB;
      }
      // ROUTINE → RQI dominant
      return b.rqi - a.rqi;
    })
  , [data.requestedService, priority]);

  const sortLabel = priority === "CRITICAL"
    ? "Sorted by distance · golden-hour priority"
    : priority === "HIGH"
    ? "Sorted by balanced distance + RQI"
    : "Sorted by RQI";

  const transports = [
    { id: "Private",  label: "Private", icon: UserRound, sub: "Family vehicle" },
    { id: "Hospital", label: "Hospital ambulance", icon: Truck, sub: "Korle-Bu transport" },
    { id: "NAS",      label: "NAS request", icon: Siren, sub: "National Ambulance Service" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <FormLabel required>Destination facility</FormLabel>
        <p className="text-[11px] mb-3" style={{ color: c.ink3 }}>Filtered to <b>{eligible.length}</b> facilities offering all requested services. {sortLabel}.</p>
        <div className="space-y-1.5">
          {eligible.length === 0 && (
            <div className="px-4 py-6 text-center rounded-md border border-dashed" style={{ borderColor: c.borderMid }}>
              <AlertTriangle size={18} style={{ color: c.warning, margin: "0 auto 6px" }} />
              <div className="text-[12px]" style={{ color: c.ink2 }}>No facility offers all requested services. Reduce service requirements.</div>
            </div>
          )}
          {eligible.map(f => {
            const sel = data.destination === f.key;
            const band = rqiBandColor(f.rqiBand);
            return (
              <button key={f.key} onClick={() => update({ destination: f.key })} className="w-full flex items-center gap-3 px-4 py-3 rounded-md border text-left transition" style={{ backgroundColor: sel ? c.primarySoft : c.surface, borderColor: sel ? c.primary : c.borderMid, borderWidth: sel ? 2 : 1 }}>
                <div className="w-10 h-10 rounded-md flex items-center justify-center text-[12px] font-bold" style={{ backgroundColor: band.bg, color: band.fg, fontFamily: fontMono }}>{f.rqi}</div>
                <div className="flex-1">
                  <div className="text-[13px] font-medium" style={{ color: c.ink }}>{f.name}</div>
                  <Mono color={c.ink3} size={10}>{f.code} · {f.tier} · {f.city} · accept median {f.acceptMedian}m</Mono>
                </div>
                <div className="text-right mr-2">
                  <Mono color={c.ink2} size={11}>{(f.distance ?? "—")}{f.distance !== undefined ? " km" : ""}</Mono>
                </div>
                <Pill fg={band.fg} bg={band.bg}>{f.rqiBand}</Pill>
                {sel && <Check size={16} style={{ color: c.primary }} />}
              </button>
            );
          })}
        </div>
      </div>
      {data.destination && (
        <div>
          <FormLabel required>Transport mode</FormLabel>
          <div className="grid grid-cols-3 gap-2">
            {transports.map(t => {
              const Icon = t.icon;
              const sel = data.transportMode === t.id;
              return (
                <button key={t.id} onClick={() => update({ transportMode: t.id })} className="px-3 py-3 rounded-md border text-left transition" style={{ backgroundColor: sel ? c.primary : c.surface, color: sel ? "#fff" : c.ink, borderColor: sel ? c.primary : c.borderMid }}>
                  <Icon size={15} className="mb-1" />
                  <div className="text-[12.5px] font-medium">{t.label}</div>
                  <div className="text-[10.5px] mt-0.5" style={{ color: sel ? "rgba(255,255,255,0.75)" : c.ink3 }}>{t.sub}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// REFERRAL DRAWER — substantial clinical record + actions
// ════════════════════════════════════════════════════════════════════════════
function ReferralDrawer({ referral, onClose, onAccept, onDecline, onRedirect }) {
  const [mode, setMode] = useState("view"); // view | decline | redirect
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const [tab, setTab] = useState("clinical"); // clinical | timeline | comms | ghims

  const fromFac = FACILITIES[referral.fromFacility];
  const toFac = FACILITIES[referral.toFacility];
  const elapsed = elapsedFromNow(referral.initiatedAt);
  const priority = priorityToColor(referral.priority);
  const stateInfo = stateToColor(referral.state);

  const tabs = [
    { id: "clinical", label: "Clinical", icon: Stethoscope },
    { id: "timeline", label: "Timeline", icon: Clock },
    { id: "comms",    label: "Comms",    icon: MessageSquare },
    { id: "ghims",    label: "GHIMS",    icon: Wifi },
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ backgroundColor: "rgba(20,18,15,0.45)", backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="w-[600px] h-full bg-white overflow-auto shadow-2xl flex flex-col" onClick={e => e.stopPropagation()} style={{ borderLeft: `1px solid ${c.borderMid}` }}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b" style={{ borderColor: c.border }}>
          <div className="px-6 py-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Pill fg={priority.fg} bg={priority.bg} dot>{priority.label}</Pill>
                  <Pill fg={stateInfo.fg} bg={stateInfo.bg} dot>{stateInfo.label}</Pill>
                  {referral.ghimsLinked && <Pill fg={c.info} bg={c.infoSoft} size="xs"><Wifi size={8} strokeWidth={2.5} />GHIMS</Pill>}
                </div>
                <Mono color={c.ink3} size={10.5}>{referral.id}</Mono>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-1.5 rounded hover:bg-stone-100"><Printer size={14} style={{ color: c.ink2 }} /></button>
                <button className="p-1.5 rounded hover:bg-stone-100"><Share2 size={14} style={{ color: c.ink2 }} /></button>
                <button onClick={onClose} className="p-1.5 rounded hover:bg-stone-100"><X size={16} style={{ color: c.ink2 }} /></button>
              </div>
            </div>
            <h2 className="text-[20px] font-medium leading-tight tracking-tight mb-1" style={{ fontFamily: fontDisplay, color: c.ink, letterSpacing: "-0.01em" }}>{referral.chiefComplaint}</h2>
            <div className="text-[11.5px]" style={{ color: c.ink2 }}>
              {referral.age}{referral.sex.toLowerCase()} · {referral.patientCategory} ·{" "}
              {referral.direction === "incoming" ? <>from <b>{fromFac?.name}</b></> : <>to <b>{toFac?.name}</b></>}{" "}
              · {referral.distance} km
            </div>
          </div>
          {/* Tabs */}
          <div className="px-6 flex items-center gap-0.5 border-t" style={{ borderColor: c.border }}>
            {tabs.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} className="flex items-center gap-1.5 px-3 py-2.5 text-[11.5px] transition relative" style={{ color: active ? c.ink : c.ink3, fontWeight: active ? 600 : 400 }}>
                  <Icon size={12} />
                  {t.label}
                  {active && <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ backgroundColor: c.primary }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 px-6 py-4 space-y-4">
          {tab === "clinical" && (
            <>
              {/* SLA timer for pending */}
              {referral.state === "PENDING" && (
                <div className="rounded-lg border-2 border-dashed px-4 py-3 flex items-center gap-3" style={{ borderColor: priority.fg, backgroundColor: priority.wash }}>
                  <Clock size={18} style={{ color: priority.fg }} />
                  <div className="flex-1">
                    <div className="text-[12.5px] font-semibold" style={{ color: priority.fg }}>Decision pending · {elapsed.formatted}</div>
                    <div className="text-[10.5px] mt-0.5" style={{ color: priority.fg, opacity: 0.85 }}>Target ≤ {slaTargetSec(referral.priority) / 60} minutes</div>
                  </div>
                </div>
              )}

              {/* Service needs */}
              <div>
                <Eyebrow className="mb-1.5">Service requested</Eyebrow>
                <div className="flex flex-wrap gap-1.5">
                  {referral.serviceNeeded.map(s => <span key={s} className="px-2.5 py-1 rounded-md text-[11.5px] border" style={{ borderColor: c.border, backgroundColor: c.surface2, color: c.ink, fontFamily: fontBody }}>{s}</span>)}
                </div>
              </div>

              {/* Reason */}
              <div>
                <Eyebrow className="mb-1.5">Reason for referral</Eyebrow>
                <div className="flex flex-wrap gap-1.5">
                  {referral.reasonForReferral.map(r => <span key={r} className="px-2 py-0.5 rounded-md text-[11px]" style={{ backgroundColor: c.surface2, color: c.ink2 }}>{r}</span>)}
                </div>
              </div>

              {/* Vitals grid · engine-driven, 4-tier, age-aware */}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <Eyebrow>Vital signs</Eyebrow>
                  <Mono color={c.ink3} size={10}>at referral · {shortTime(referral.initiatedAt)}</Mono>
                </div>
                {(() => {
                  const drawerAssess = assessVitals(referral.vitals, referral.age, referral.patientCategory);
                  const tOf = (k) => drawerAssess.perVital[k]?.tier || "normal";
                  const bpT = [tOf("sbp"), tOf("dbp")].sort((a, b) => VE_TIER_SCORE[b] - VE_TIER_SCORE[a])[0] || "normal";
                  const tierBg = (t) => t === "critical" ? c.criticalSoft : t === "abnormal" ? c.warningSoft : t === "borderline" ? (c.copperSoft || c.warningSoft) : c.surface;
                  const tierBorder = (t) => t === "critical" ? "#F0BFBF" : t === "abnormal" ? "#F0CD7C" : t === "borderline" ? "#E3CFA8" : c.border;
                  const items = [
                    { k: "BP",   v: `${referral.vitals.sbp}/${referral.vitals.dbp}`, tier: bpT },
                    { k: "HR",   v: referral.vitals.hr,   tier: tOf("hr") },
                    { k: "RR",   v: referral.vitals.rr,   tier: tOf("rr") },
                    { k: "SpO₂", v: `${referral.vitals.spo2}%`, tier: tOf("spo2") },
                    { k: "T°",   v: referral.vitals.temp, tier: tOf("temp") },
                    { k: "GCS",  v: referral.vitals.gcs,  tier: tOf("gcs") },
                  ];
                  const flagged = Object.values(drawerAssess.perVital).filter(p => p && p.tier !== "normal");
                  return (
                    <>
                      <div className="grid grid-cols-6 gap-1.5">
                        {items.map(v => (
                          <div key={v.k} className="rounded-md border px-2 py-2 text-center" style={{ borderColor: tierBorder(v.tier), backgroundColor: tierBg(v.tier) }}>
                            <div className="text-[9.5px]" style={{ color: c.ink3, fontFamily: fontMono }}>{v.k}</div>
                            <div className="text-[14px] font-semibold tabular-nums" style={{ color: veTierToColor(v.tier), fontFamily: fontMono }}>{v.v}</div>
                          </div>
                        ))}
                      </div>
                      {/* Engine-derived assessment summary */}
                      <div className="mt-2 px-3 py-2 rounded border" style={{ borderColor: c.border, backgroundColor: c.surface2 }}>
                        <div className="flex items-center justify-between mb-1">
                          <Eyebrow color={c.ink3}>Engine assessment</Eyebrow>
                          <Mono color={veTierToColor(drawerAssess.suggestedPriority === "CRITICAL" ? "critical" : drawerAssess.suggestedPriority === "HIGH" ? "abnormal" : "normal")} size={10}>
                            {drawerAssess.suggestedPriority} · score {drawerAssess.totalScore}
                          </Mono>
                        </div>
                        <div className="text-[11px]" style={{ color: c.ink2 }}>{drawerAssess.suggestedReason}</div>
                        {flagged.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {flagged.map((p, i) => (
                              <div key={i} className="text-[10px]" style={{ color: c.ink3, fontFamily: fontMono }}>· {p.reason}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
                {(referral.vitals.bleeding || referral.vitals.inotropes || referral.vitals.oxygen === "intubated" || referral.vitals.oxygen === "oxygen") && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {referral.vitals.bleeding && <Pill fg={c.critical} bg={c.criticalSoft} dot>Active bleeding</Pill>}
                    {referral.vitals.inotropes && <Pill fg={c.critical} bg={c.criticalSoft} dot>On inotropes</Pill>}
                    {referral.vitals.oxygen === "intubated" && <Pill fg={c.critical} bg={c.criticalSoft} dot>Intubated</Pill>}
                    {referral.vitals.oxygen === "oxygen" && <Pill fg={c.warning} bg={c.warningSoft} dot>On oxygen</Pill>}
                    <Pill fg={c.ink2} bg={c.surface3}>AVPU · {referral.vitals.avpu}</Pill>
                    <Pill fg={c.ink2} bg={c.surface3}>RBS · {referral.vitals.rbs} mmol/L</Pill>
                  </div>
                )}
              </div>

              {/* Stability */}
              <div>
                <Eyebrow className="mb-1.5">Stability · investigations</Eyebrow>
                <div className="flex items-center gap-2">
                  <Pill fg={referral.stability === "Critical" || referral.stability === "Unstable" ? c.critical : referral.stability === "Potentially unstable" ? c.warning : c.primary} bg={referral.stability === "Critical" || referral.stability === "Unstable" ? c.criticalSoft : referral.stability === "Potentially unstable" ? c.warningSoft : c.primarySoft}>{referral.stability}</Pill>
                  <Pill fg={c.ink2} bg={c.surface3}>{referral.interventions}</Pill>
                </div>
              </div>

              {/* Summary */}
              <div>
                <Eyebrow className="mb-1.5">Clinical handover</Eyebrow>
                <div className="rounded-md border px-3.5 py-3 text-[13px] leading-relaxed italic" style={{ borderColor: c.border, color: c.ink, backgroundColor: c.surface, fontFamily: fontDisplay }}>"{referral.summary}"</div>
                {referral.notes && (
                  <div className="rounded-md border-l-2 mt-2 px-3 py-2 text-[11.5px] leading-relaxed" style={{ borderColor: c.primaryMid, backgroundColor: c.surface2, color: c.ink2 }}>
                    <Eyebrow className="mb-1">Detailed notes</Eyebrow>
                    {referral.notes}
                  </div>
                )}
              </div>

              {/* Referring clinician */}
              <div>
                <Eyebrow className="mb-1.5">Referring clinician</Eyebrow>
                <div className="flex items-center justify-between rounded-md border px-3 py-2.5" style={{ borderColor: c.border }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-semibold" style={{ backgroundColor: c.surface3, color: c.ink2 }}>
                      {referral.referringClinician.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-[12.5px] font-medium" style={{ color: c.ink }}>{referral.referringClinician}</div>
                      <div className="text-[10.5px]" style={{ color: c.ink3 }}>{referral.referringRole} · {fromFac?.name}</div>
                    </div>
                  </div>
                  <Btn variant="default" size="md" icon={Phone}>{referral.referringPhone}</Btn>
                </div>
              </div>
            </>
          )}

          {tab === "timeline" && (
            <div>
              <Eyebrow className="mb-3">Audit trail</Eyebrow>
              <div className="space-y-0">
                {(referral.audit || []).map((a, i, arr) => {
                  const e = elapsedFromNow(a.t);
                  return (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: i === 0 ? c.primary : c.ink4 }} />
                        {i < arr.length - 1 && <div className="w-px flex-1" style={{ backgroundColor: c.border }} />}
                      </div>
                      <div className="flex-1 pb-3">
                        <div className="text-[12px] font-medium" style={{ color: c.ink }}>{a.action}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Mono color={c.ink3} size={10}>{a.actor}</Mono>
                          <span style={{ color: c.ink5 }}>·</span>
                          <Mono color={c.ink3} size={10}>{shortTime(a.t)} · {e.m}m ago</Mono>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "comms" && (
            <div>
              <Eyebrow className="mb-3">Conversation thread</Eyebrow>
              <div className="space-y-2">
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-semibold" style={{ backgroundColor: c.surface3, color: c.ink2 }}>AM</div>
                  <div className="flex-1">
                    <div className="rounded-lg rounded-tl-sm px-3 py-2 text-[12px]" style={{ backgroundColor: c.surface2, color: c.ink }}>
                      Sending across now. Patient stable on transfer monitor. ETA per NAS dispatch.
                    </div>
                    <Mono color={c.ink3} size={9.5} className="mt-1">{referral.referringClinician} · {shortTime(minutesAgo(7))}</Mono>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input placeholder="Reply to referring team…" className="flex-1 px-3 py-2 rounded-md border text-[12px] outline-none" style={{ borderColor: c.borderMid }} />
                <Btn variant="primary" size="md" icon={Send}>Send</Btn>
              </div>
              <div className="mt-3 text-[10px] flex items-center gap-1" style={{ color: c.ink3, fontFamily: fontMono }}>
                <Info size={10} />Messages mirror to SMS for receiving facilities without internet
              </div>
            </div>
          )}

          {tab === "ghims" && (
            <div>
              {referral.ghimsLinked ? (
                <div className="space-y-3">
                  <div className="rounded-lg border px-4 py-3 flex items-center gap-3" style={{ borderColor: c.border, backgroundColor: c.infoSoft }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: c.surface }}>
                      <Wifi size={16} style={{ color: c.info }} />
                    </div>
                    <div className="flex-1">
                      <div className="text-[12.5px] font-semibold" style={{ color: c.info }}>GHIMS record linked</div>
                      <Mono color={c.ink2} size={10}>{referral.ghimsPatientId || "—"}</Mono>
                    </div>
                    <Btn variant="default" size="sm" icon={ExternalLink}>Open in GHIMS</Btn>
                  </div>
                  <div>
                    <Eyebrow className="mb-2">Available from GHIMS</Eyebrow>
                    <div className="space-y-1">
                      {[
                        { name: "Patient demographics", loaded: true },
                        { name: "Past medical history", loaded: true },
                        { name: "Current medications", loaded: true },
                        { name: "Allergies & reactions", loaded: true },
                        { name: "Lab results · last 30 days", loaded: true },
                        { name: "Imaging reports", loaded: false, note: "PACS link available" },
                        { name: "Discharge summaries", loaded: true },
                      ].map(item => (
                        <div key={item.name} className="flex items-center gap-2 px-3 py-2 rounded-md border text-[11.5px]" style={{ borderColor: c.border, backgroundColor: c.surface }}>
                          <Check size={11} style={{ color: item.loaded ? c.primary : c.ink4 }} />
                          <span style={{ color: c.ink }}>{item.name}</span>
                          {item.note && <Mono color={c.ink3} size={9.5}>· {item.note}</Mono>}
                          <ChevronRight size={11} style={{ color: c.ink3, marginLeft: "auto" }} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState icon={WifiOff} title="No GHIMS link" message="Patient not matched to GHIMS. Manual record entry only." />
              )}
            </div>
          )}
        </div>

        {/* Action bar */}
        {referral.state === "PENDING" && (
          <div className="sticky bottom-0 px-6 py-3 border-t bg-white" style={{ borderColor: c.border }}>
            {mode === "view" && (
              <div className="grid grid-cols-3 gap-2">
                <Btn variant="accept" size="lg" icon={Check} onClick={() => onAccept(referral.id)} fullWidth>Accept</Btn>
                <button onClick={() => setMode("redirect")} className="py-2.5 rounded-md font-semibold text-[12.5px] border-2 flex items-center justify-center gap-1.5 transition" style={{ borderColor: c.copper, color: c.copper, backgroundColor: c.copperSoft }}><GitBranch size={14} />Redirect</button>
                <button onClick={() => setMode("decline")} className="py-2.5 rounded-md font-medium text-[12.5px] border flex items-center justify-center gap-1.5 transition" style={{ borderColor: c.borderMid, color: c.ink2, backgroundColor: c.surface }}><X size={14} />Decline</button>
              </div>
            )}
            {mode === "decline" && (
              <div className="space-y-2">
                <FormLabel required>Reason for declining</FormLabel>
                <select value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-2 rounded-md border text-[12.5px]" style={{ borderColor: c.borderMid }}>
                  <option value="">Select reason…</option>
                  <option>No bed in required service</option>
                  <option>Specialist unavailable</option>
                  <option>Equipment unavailable / down</option>
                  <option>Insufficient clinical information</option>
                  <option>Different service tier needed</option>
                  <option>Other</option>
                </select>
                <div className="flex gap-2">
                  <Btn variant="critical" size="md" onClick={() => reason && onDecline(referral.id, reason)} disabled={!reason} fullWidth>Confirm decline</Btn>
                  <Btn size="md" onClick={() => setMode("view")}>Back</Btn>
                </div>
              </div>
            )}
            {mode === "redirect" && (
              <div className="space-y-2">
                <FormLabel required>Redirect to facility</FormLabel>
                <select value={target} onChange={e => setTarget(e.target.value)} className="w-full px-3 py-2 rounded-md border text-[12.5px]" style={{ borderColor: c.borderMid }}>
                  <option value="">Select facility…</option>
                  {FACILITY_KEYS.filter(k => k !== "KBU").map(k => <option key={k} value={k}>{FACILITIES[k].name} · {FACILITIES[k].tier} · RQI {FACILITIES[k].rqi}</option>)}
                </select>
                <FormLabel>Reason for redirect</FormLabel>
                <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Closer to patient · same capability · KBU ICU full" className="w-full px-3 py-2 rounded-md border text-[12.5px]" style={{ borderColor: c.borderMid, minHeight: 60 }} />
                <div className="flex gap-2">
                  <button onClick={() => target && onRedirect(referral.id, target, reason)} disabled={!target} className="flex-1 py-2 rounded-md font-medium text-[12.5px] transition" style={{ backgroundColor: target ? c.copper : c.ink4, color: "#fff" }}>Confirm redirect</button>
                  <Btn size="md" onClick={() => setMode("view")}>Back</Btn>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// INBOX VIEW — all incoming referrals with filters + search
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// OUTBOUND VIEW
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// CASES VIEW — historical search
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// CAPACITY VIEW — full ED/ICU/HDU editor + service availability switches
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// SERVICE PROFILE VIEW — declared capabilities
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// TEAM VIEW — on-call roster
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// HOSPITAL TABLET VIEW — ED bedside, oversized targets, audio alerts
// ════════════════════════════════════════════════════════════════════════════
function HospitalTabletView({ referrals, onAccept, onSelect, onNewReferral, audioOn, setAudioOn, now, currentUser, sessionStart, onLogout }) {
  const pending = referrals.filter(r => r.direction === "incoming" && r.state === "PENDING").sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, ROUTINE: 2 };
    return order[a.priority] - order[b.priority] || a.initiatedAt - b.initiatedAt;
  });
  const inflight = referrals.filter(r => r.direction === "incoming" && r.state === "EN_ROUTE");
  const critical = pending.filter(r => r.priority === "CRITICAL");

  return (
    <div className="min-h-screen" style={{ backgroundColor: c.bg }}>
      {/* Tablet header */}
      <div className="px-6 py-4 border-b sticky top-0 z-20 flex items-center justify-between" style={{ backgroundColor: c.surface, borderColor: c.border }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded flex items-center justify-center" style={{ backgroundColor: c.primary }}>
            <Hospital size={18} style={{ color: "#fff" }} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: c.ink3, fontFamily: fontMono, letterSpacing: "0.12em" }}>ED Triage Station</div>
            <div className="text-[16px] font-medium" style={{ fontFamily: fontDisplay, color: c.ink }}>Korle-Bu Teaching Hospital</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded" style={{ backgroundColor: c.surface2 }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: c.primaryMid }} />
            <Mono color={c.ink2} size={11}>LIVE · {now.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</Mono>
          </div>
          <button onClick={() => setAudioOn(!audioOn)} className="w-12 h-12 rounded-md flex items-center justify-center transition" style={{ backgroundColor: audioOn ? c.primary : c.surface2, color: audioOn ? "#fff" : c.ink2, border: `1px solid ${audioOn ? c.primary : c.borderMid}` }}>
            {audioOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          {currentUser && sessionStart && (
            <IdentityBar user={currentUser} sessionStart={sessionStart} onLogout={onLogout} />
          )}
        </div>
      </div>

      {/* Critical alert bar */}
      {critical.length > 0 && (
        <div className="px-6 py-4 border-b relative overflow-hidden" style={{ backgroundColor: c.criticalWash, borderColor: c.borderMid }}>
          {audioOn && (
            <div className="absolute -top-8 -left-8 w-24 h-24 rounded-full animate-ping" style={{ backgroundColor: c.critical, opacity: 0.18 }} />
          )}
          <div className="flex items-center gap-3 relative">
            <Siren size={22} style={{ color: c.critical }} />
            <div className="flex-1">
              <div className="text-[15px] font-semibold" style={{ color: c.critical, fontFamily: fontDisplay }}>{critical.length} CRITICAL referral{critical.length > 1 ? "s" : ""} awaiting decision</div>
              <div className="text-[11.5px]" style={{ color: c.ink2 }}>SLA target 3 minutes from initiation · audio alert {audioOn ? "active" : "muted"}</div>
            </div>
            {audioOn && <Pill fg={c.critical} bg="#fff" size="sm">SOUND ON</Pill>}
          </div>
        </div>
      )}

      {/* Pending list — bigger touch targets */}
      <div className="px-6 py-5 max-w-[820px] mx-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <Eyebrow>Inbound · awaiting acceptance</Eyebrow>
            <div className="text-[13px] mt-1" style={{ color: c.ink2 }}>{pending.length} referral{pending.length === 1 ? "" : "s"} pending · {inflight.length} en route</div>
          </div>
          <button onClick={onNewReferral} className="px-4 py-2.5 rounded-md text-[13px] font-medium transition flex items-center gap-2" style={{ backgroundColor: c.primary, color: "#fff" }}>
            <Plus size={14} />New referral
          </button>
        </div>

        {pending.length === 0 ? (
          <Card padding="p-10">
            <EmptyState icon={Inbox} title="Inbox clear" message="No pending referrals. New incoming will appear here automatically." />
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.map(r => (
              <TabletReferralCard key={r.id} referral={r} onSelect={onSelect} onAccept={onAccept} pulseAudio={audioOn && r.priority === "CRITICAL"} />
            ))}
          </div>
        )}

        {inflight.length > 0 && (
          <div className="mt-6">
            <Eyebrow>En route to ED</Eyebrow>
            <div className="space-y-2 mt-3">
              {inflight.map(r => {
                const initials = (r.name || "").split(/\s+/).filter(Boolean).map(p => p[0]).slice(0,3).join("").toUpperCase() || (r.patientId || "").slice(-3);
                return (
                  <Card key={r.id} padding="p-4" interactive>
                    <div onClick={() => onSelect(r)} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded flex items-center justify-center" style={{ backgroundColor: c.infoSoft }}>
                        <Truck size={16} style={{ color: c.info }} />
                      </div>
                      <div className="flex-1">
                        <div className="text-[13px] font-medium" style={{ color: c.ink }}>{initials} · {r.chiefComplaint}</div>
                        <div className="text-[11.5px] mt-0.5" style={{ color: c.ink2 }}>{r.age}y {r.sex} · From {FACILITIES[r.fromFacility]?.short || r.fromFacility} · ETA {r.eta || "≈10m"}</div>
                      </div>
                      <Pill fg={priorityToColor(r.priority).fg} bg={priorityToColor(r.priority).bg} size="sm">{r.priority}</Pill>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Tablet footer */}
      <div className="px-6 py-3 border-t mt-8 flex items-center justify-between" style={{ borderColor: c.border, backgroundColor: c.surface }}>
        <div className="flex items-center gap-3">
          <ShieldCheck size={12} style={{ color: c.primary }} />
          <Mono color={c.ink3} size={10}>GhERIG · Korle-Bu ED · encrypted session</Mono>
        </div>
        <Mono color={c.ink3} size={10}>Tap any referral to review · build v3.1</Mono>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TABLET REFERRAL CARD — initials prominent, ID secondary
// ════════════════════════════════════════════════════════════════════════════
function TabletReferralCard({ referral, onSelect, onAccept, pulseAudio }) {
  const pri = priorityToColor(referral.priority);
  const elapsed = elapsedFromNow(referral.initiatedAt);
  const initials = (referral.name || "")
    .split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 3).join("").toUpperCase()
    || (referral.patientId || "").slice(-3).toUpperCase();
  return (
    <div className="rounded-lg border relative overflow-hidden" style={{ backgroundColor: c.surface, borderColor: referral.priority === "CRITICAL" ? c.criticalMid : c.borderMid, borderLeftWidth: 4, borderLeftColor: pri.fg }}>
      {pulseAudio && <div className="absolute right-3 top-3 w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: c.critical }} />}
      <div className="p-4" onClick={() => onSelect(referral)}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Pill fg={pri.fg} bg={pri.bg} dot size="sm">{referral.priority}</Pill>
            <Mono color={c.ink3} size={10}>{elapsed.m}m ago</Mono>
          </div>
          <SLATimer initiatedAt={referral.initiatedAt} priority={referral.priority} />
        </div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-[13px] font-semibold flex-shrink-0" style={{ backgroundColor: pri.bg, color: pri.fg, fontFamily: fontMono, letterSpacing: "0.04em" }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15.5px] font-medium leading-tight" style={{ color: c.ink, fontFamily: fontDisplay, letterSpacing: "-0.005em" }}>{referral.chiefComplaint}</div>
            <div className="text-[11.5px] mt-0.5 flex items-center gap-2" style={{ color: c.ink2 }}>
              <span>{referral.age}y {referral.sex}</span>
              <span style={{ color: c.ink5 }}>·</span>
              <span>{referral.patientCategory}</span>
              <span style={{ color: c.ink5 }}>·</span>
              <span style={{ color: c.ink3 }}>from {FACILITIES[referral.fromFacility]?.short || referral.fromFacility}</span>
            </div>
            <Mono color={c.ink3} size={9.5} className="mt-0.5">{referral.patientId}</Mono>
          </div>
        </div>
        <div className="mt-3"><VitalsStrip vitals={referral.vitals} dense age={referral.age} patientCategory={referral.patientCategory} /></div>
        {referral.summary && <div className="mt-3 text-[12px] italic px-3 py-2 rounded" style={{ backgroundColor: c.surface2, color: c.ink, fontFamily: fontDisplay }}>"{referral.summary}"</div>}
      </div>
      <div className="grid grid-cols-2 border-t" style={{ borderColor: c.border }}>
        <button onClick={() => onSelect(referral)} className="py-3.5 text-[13px] font-medium border-r transition hover:bg-stone-50" style={{ color: c.ink2, borderColor: c.border }}>Review</button>
        <button onClick={() => onAccept(referral)} className="py-3.5 text-[13px] font-semibold transition" style={{ color: "#fff", backgroundColor: c.primary, fontFamily: fontDisplay }}>Accept ✓</button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TOAST STACK
// ════════════════════════════════════════════════════════════════════════════
function ToastStack({ toasts, dismissToast }) {
  if (!toasts || toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 w-[360px]">
      {toasts.map(t => <Toast key={t.id} toast={t} onClose={() => dismissToast(t.id)} />)}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// APP · ROOT WITH LIVE SIMULATION
// ════════════════════════════════════════════════════════════════════════════

// Demo users — mock the federated identity model:
// Core Admin provisions accounts (council numbers, role, facility assignment).
// The hospital roster activates them per shift.
const DEMO_USERS = [
  {
    id: "user_001",
    name: "Dr. K. Amponsah",
    role: "doctor",
    title: "ED Senior Resident",
    department: "Emergency Medicine",
    council: "MDC-7821-22",
    facility: "KBU",
    phone: "+233 24 555 0182",
    pin: "4521",
    initials: "KA",
    permissions: { accept: true, decline: true, redirect: true, outgoing: true, override: false },
  },
  {
    id: "user_002",
    name: "Dr. A. Boateng",
    role: "consultant",
    title: "Consultant Physician · Emergency Medicine",
    department: "Emergency Medicine",
    council: "MDC-2104-08",
    facility: "KBU",
    phone: "+233 24 555 0143",
    pin: "8806",
    initials: "AB",
    permissions: { accept: true, decline: true, redirect: true, outgoing: true, override: true },
  },
  {
    id: "user_003",
    name: "N. M. Nkrumah",
    role: "nurse",
    title: "Senior ED Triage Nurse",
    department: "Emergency Medicine",
    council: "NMC-44912-19",
    facility: "KBU",
    phone: "+233 24 555 0271",
    pin: "1142",
    initials: "MN",
    permissions: { accept: false, decline: false, redirect: false, outgoing: false, override: false },
  },
];

const ROLE_TONES = {
  doctor:     { fg: "#0A4D3C", bg: "#E8F5EF", label: "Doctor" },
  consultant: { fg: "#8A4D1F", bg: "#F5E8DA", label: "Consultant" },
  nurse:      { fg: "#1B3F8F", bg: "#E2EAF8", label: "Nurse" },
};

// ────────────────────────────────────────────────────────────────────────────
// LOGIN SCREEN — start of shift, full credentials
// ────────────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [selectedUser, setSelectedUser] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const attemptLogin = () => {
    if (!selectedUser) {
      setError("Select your name");
      return;
    }
    if (pin !== selectedUser.pin) {
      setError("PIN incorrect. Try again or contact IT.");
      setPin("");
      return;
    }
    onLogin(selectedUser);
  };

  const handlePinKey = (digit) => {
    setError("");
    if (digit === "back") return setPin(p => p.slice(0, -1));
    if (digit === "clear") return setPin("");
    if (pin.length < 4) setPin(p => p + digit);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: c.bg }}>
      <div className="w-full max-w-[440px] px-6 py-10">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: c.primary }} />
            <span className="text-[26px] font-medium" style={{ fontFamily: fontDisplay, color: c.primary, letterSpacing: "-0.02em" }}>GhERIG</span>
          </div>
          <Mono color={c.ink3} size={10}>ED TRIAGE STATION · KORLE-BU</Mono>
        </div>

        <Card padding="p-6">
          {!selectedUser ? (
            <>
              <Eyebrow className="mb-1">Sign in</Eyebrow>
              <h2 className="text-[18px] font-medium mb-1" style={{ fontFamily: fontDisplay, color: c.ink, letterSpacing: "-0.01em" }}>Who's on shift?</h2>
              <p className="text-[12px] mb-5" style={{ color: c.ink3 }}>Tap your name to continue. All actions on this device will be recorded under your identity.</p>
              <div className="space-y-2">
                {DEMO_USERS.map(u => {
                  const tone = ROLE_TONES[u.role];
                  return (
                    <button key={u.id} onClick={() => { setSelectedUser(u); setPin(""); setError(""); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-md border text-left transition hover:bg-stone-50" style={{ backgroundColor: c.surface, borderColor: c.borderMid }}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0" style={{ backgroundColor: tone.bg, color: tone.fg, fontFamily: fontMono, letterSpacing: "0.04em" }}>
                        {u.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-medium" style={{ color: c.ink }}>{u.name}</div>
                        <div className="text-[11px]" style={{ color: c.ink3 }}>{u.title}</div>
                      </div>
                      <Pill fg={tone.fg} bg={tone.bg} size="xs">{tone.label}</Pill>
                      <ChevronRight size={14} style={{ color: c.ink3 }} />
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 pt-5 border-t" style={{ borderColor: c.border }}>
                <p className="text-[11px] leading-relaxed" style={{ color: c.ink3 }}>
                  Don't see your name? Your account must be activated by a hospital administrator at the start of your shift. Provisioning is handled centrally — contact IT support.
                </p>
              </div>
            </>
          ) : (
            <>
              <button onClick={() => { setSelectedUser(null); setPin(""); setError(""); }} className="flex items-center gap-1.5 text-[11px] mb-4 transition hover:opacity-70" style={{ color: c.ink3 }}>
                <ChevronLeft size={12} />Back to user list
              </button>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-[14px] font-semibold" style={{ backgroundColor: ROLE_TONES[selectedUser.role].bg, color: ROLE_TONES[selectedUser.role].fg, fontFamily: fontMono }}>
                  {selectedUser.initials}
                </div>
                <div>
                  <div className="text-[14.5px] font-medium" style={{ color: c.ink }}>{selectedUser.name}</div>
                  <Mono color={c.ink3} size={10}>{selectedUser.council}</Mono>
                </div>
              </div>

              <Eyebrow className="mb-2">Enter PIN</Eyebrow>
              {/* PIN dots */}
              <div className="flex justify-center gap-3 my-4">
                {[0,1,2,3].map(i => (
                  <div key={i} className="w-3.5 h-3.5 rounded-full transition" style={{
                    backgroundColor: i < pin.length ? c.primary : "transparent",
                    border: `1.5px solid ${i < pin.length ? c.primary : c.borderMid}`,
                  }} />
                ))}
              </div>

              {error && <div className="text-center text-[11.5px] mb-3" style={{ color: c.critical, fontFamily: fontMono }}>{error}</div>}

              {/* PIN keypad */}
              <div className="grid grid-cols-3 gap-2">
                {["1","2","3","4","5","6","7","8","9"].map(d => (
                  <button key={d} onClick={() => handlePinKey(d)} className="py-3.5 rounded-md text-[18px] font-medium transition hover:bg-stone-100" style={{ backgroundColor: c.surface2, color: c.ink, fontFamily: fontMono, border: `1px solid ${c.border}` }}>
                    {d}
                  </button>
                ))}
                <button onClick={() => handlePinKey("clear")} className="py-3.5 rounded-md text-[11px] font-medium transition hover:bg-stone-100" style={{ backgroundColor: c.surface2, color: c.ink2, fontFamily: fontMono, border: `1px solid ${c.border}` }}>
                  CLEAR
                </button>
                <button onClick={() => handlePinKey("0")} className="py-3.5 rounded-md text-[18px] font-medium transition hover:bg-stone-100" style={{ backgroundColor: c.surface2, color: c.ink, fontFamily: fontMono, border: `1px solid ${c.border}` }}>
                  0
                </button>
                <button onClick={() => handlePinKey("back")} className="py-3.5 rounded-md transition hover:bg-stone-100 flex items-center justify-center" style={{ backgroundColor: c.surface2, color: c.ink2, border: `1px solid ${c.border}` }}>
                  <ChevronLeft size={16} />
                </button>
              </div>

              <button onClick={attemptLogin} disabled={pin.length !== 4} className="w-full mt-4 py-3 rounded-md text-[13px] font-semibold transition" style={{ backgroundColor: pin.length === 4 ? c.primary : c.ink5, color: "#fff", fontFamily: fontDisplay }}>
                Sign in
              </button>

              <div className="mt-4 px-3 py-2 rounded text-[10.5px] flex items-start gap-2" style={{ backgroundColor: c.infoWash, color: c.ink2 }}>
                <Info size={11} style={{ color: c.info, marginTop: 1, flexShrink: 0 }} />
                <span><b>Demo PIN:</b> {selectedUser.pin} — in production, PINs are user-set and never displayed.</span>
              </div>
            </>
          )}
        </Card>

        <div className="text-center mt-5">
          <Mono color={c.ink3} size={10}>{time.toLocaleString("en-GH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Mono>
        </div>
        <div className="text-center mt-2">
          <Mono color={c.ink5} size={9}>SHIFT-BASED SESSION · MAX 12 HOURS · AUTO-LOCK 30 MIN</Mono>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PIN PROMPT — re-auth for sensitive actions
// ────────────────────────────────────────────────────────────────────────────
function PinPrompt({ user, action, actionLabel, onConfirm, onCancel }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (pin !== user.pin) {
      setError("PIN incorrect");
      setPin("");
      return;
    }
    onConfirm();
  };

  const handleKey = (d) => {
    setError("");
    if (d === "back") return setPin(p => p.slice(0, -1));
    if (d === "clear") return setPin("");
    if (pin.length < 4) setPin(p => p + d);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(26, 24, 21, 0.5)" }}>
      <div className="w-full max-w-[380px] rounded-lg" style={{ backgroundColor: c.surface, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div className="px-6 pt-5 pb-4 border-b" style={{ borderColor: c.border }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: c.warningSoft }}>
              <Shield size={16} style={{ color: c.warning }} />
            </div>
            <div className="flex-1">
              <Eyebrow>Confirm with PIN</Eyebrow>
              <div className="text-[14px] font-medium mt-0.5" style={{ fontFamily: fontDisplay, color: c.ink, letterSpacing: "-0.005em" }}>{actionLabel}</div>
              <Mono color={c.ink3} size={10} className="mt-0.5">acting as {user.name}</Mono>
            </div>
            <button onClick={onCancel} className="p-1 rounded hover:bg-stone-100"><X size={14} style={{ color: c.ink3 }} /></button>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="flex justify-center gap-3 mb-4">
            {[0,1,2,3].map(i => (
              <div key={i} className="w-3.5 h-3.5 rounded-full transition" style={{
                backgroundColor: i < pin.length ? c.primary : "transparent",
                border: `1.5px solid ${i < pin.length ? c.primary : c.borderMid}`,
              }} />
            ))}
          </div>

          {error && <div className="text-center text-[11px] mb-3" style={{ color: c.critical, fontFamily: fontMono }}>{error}</div>}

          <div className="grid grid-cols-3 gap-1.5">
            {["1","2","3","4","5","6","7","8","9"].map(d => (
              <button key={d} onClick={() => handleKey(d)} className="py-3 rounded-md text-[16px] font-medium transition hover:bg-stone-100" style={{ backgroundColor: c.surface2, color: c.ink, fontFamily: fontMono, border: `1px solid ${c.border}` }}>{d}</button>
            ))}
            <button onClick={() => handleKey("clear")} className="py-3 rounded-md text-[10px] font-medium transition hover:bg-stone-100" style={{ backgroundColor: c.surface2, color: c.ink2, fontFamily: fontMono, border: `1px solid ${c.border}` }}>CLEAR</button>
            <button onClick={() => handleKey("0")} className="py-3 rounded-md text-[16px] font-medium transition hover:bg-stone-100" style={{ backgroundColor: c.surface2, color: c.ink, fontFamily: fontMono, border: `1px solid ${c.border}` }}>0</button>
            <button onClick={() => handleKey("back")} className="py-3 rounded-md transition hover:bg-stone-100 flex items-center justify-center" style={{ backgroundColor: c.surface2, color: c.ink2, border: `1px solid ${c.border}` }}>
              <ChevronLeft size={14} />
            </button>
          </div>

          <button onClick={submit} disabled={pin.length !== 4} className="w-full mt-4 py-2.5 rounded-md text-[13px] font-semibold transition" style={{ backgroundColor: pin.length === 4 ? c.primary : c.ink5, color: "#fff", fontFamily: fontDisplay }}>
            Confirm
          </button>
          <button onClick={onCancel} className="w-full mt-2 py-2 rounded-md text-[12px] transition hover:bg-stone-50" style={{ color: c.ink2 }}>
            Cancel
          </button>

          <div className="mt-4 px-3 py-2 rounded text-[10px] flex items-start gap-1.5" style={{ backgroundColor: c.surface2, color: c.ink3 }}>
            <Info size={10} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>Demo PIN <b>{user.pin}</b> · in production, PIN is user-set and audited per attempt.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// AUTO-LOCK SCREEN — 30 min idle → quick PIN unlock (no full re-login)
// ────────────────────────────────────────────────────────────────────────────
function AutoLockScreen({ user, onUnlock, onLogout }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (pin !== user.pin) {
      setError("PIN incorrect");
      setPin("");
      return;
    }
    onUnlock();
  };

  const handleKey = (d) => {
    setError("");
    if (d === "back") return setPin(p => p.slice(0, -1));
    if (d === "clear") return setPin("");
    if (pin.length < 4) setPin(p => p + d);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ backgroundColor: "rgba(10, 77, 60, 0.94)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-[380px] px-6">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-3" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
            <Shield size={22} style={{ color: "#fff" }} />
          </div>
          <div className="text-[20px] font-medium" style={{ fontFamily: fontDisplay, color: "#fff", letterSpacing: "-0.01em" }}>Session locked</div>
          <div className="text-[12px] mt-1" style={{ color: "rgba(255,255,255,0.7)" }}>30 minutes of inactivity · {user.name} still on shift</div>
        </div>

        <div className="rounded-lg p-5" style={{ backgroundColor: c.surface }}>
          <Eyebrow className="text-center mb-3">Enter PIN to resume</Eyebrow>

          <div className="flex justify-center gap-3 mb-4">
            {[0,1,2,3].map(i => (
              <div key={i} className="w-3.5 h-3.5 rounded-full transition" style={{
                backgroundColor: i < pin.length ? c.primary : "transparent",
                border: `1.5px solid ${i < pin.length ? c.primary : c.borderMid}`,
              }} />
            ))}
          </div>

          {error && <div className="text-center text-[11px] mb-3" style={{ color: c.critical, fontFamily: fontMono }}>{error}</div>}

          <div className="grid grid-cols-3 gap-1.5">
            {["1","2","3","4","5","6","7","8","9"].map(d => (
              <button key={d} onClick={() => handleKey(d)} className="py-3 rounded-md text-[16px] font-medium transition hover:bg-stone-100" style={{ backgroundColor: c.surface2, color: c.ink, fontFamily: fontMono, border: `1px solid ${c.border}` }}>{d}</button>
            ))}
            <button onClick={() => handleKey("clear")} className="py-3 rounded-md text-[10px] font-medium transition hover:bg-stone-100" style={{ backgroundColor: c.surface2, color: c.ink2, fontFamily: fontMono, border: `1px solid ${c.border}` }}>CLEAR</button>
            <button onClick={() => handleKey("0")} className="py-3 rounded-md text-[16px] font-medium transition hover:bg-stone-100" style={{ backgroundColor: c.surface2, color: c.ink, fontFamily: fontMono, border: `1px solid ${c.border}` }}>0</button>
            <button onClick={() => handleKey("back")} className="py-3 rounded-md transition hover:bg-stone-100 flex items-center justify-center" style={{ backgroundColor: c.surface2, color: c.ink2, border: `1px solid ${c.border}` }}>
              <ChevronLeft size={14} />
            </button>
          </div>

          <button onClick={submit} disabled={pin.length !== 4} className="w-full mt-4 py-2.5 rounded-md text-[13px] font-semibold transition" style={{ backgroundColor: pin.length === 4 ? c.primary : c.ink5, color: "#fff", fontFamily: fontDisplay }}>
            Resume session
          </button>
          <button onClick={onLogout} className="w-full mt-2 py-2 rounded-md text-[12px] transition hover:bg-stone-50" style={{ color: c.ink2 }}>
            Log out instead
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// IDENTITY BAR — top-right corner showing who is signed in
// ────────────────────────────────────────────────────────────────────────────
function IdentityBar({ user, sessionStart, onLogout }) {
  const [open, setOpen] = useState(false);
  const tone = ROLE_TONES[user.role];
  const sessionMins = Math.floor((Date.now() - sessionStart.getTime()) / 60000);
  const sessionH = Math.floor(sessionMins / 60);
  const sessionM = sessionMins % 60;
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md transition hover:bg-stone-100" style={{ border: `1px solid ${c.border}` }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10.5px] font-semibold flex-shrink-0" style={{ backgroundColor: tone.bg, color: tone.fg, fontFamily: fontMono }}>
          {user.initials}
        </div>
        <div className="text-left">
          <div className="text-[11.5px] font-medium leading-tight" style={{ color: c.ink }}>{user.name}</div>
          <Mono color={c.ink3} size={9}>{tone.label.toUpperCase()} · {sessionH}H{String(sessionM).padStart(2,"0")}</Mono>
        </div>
        <ChevronDown size={11} style={{ color: c.ink3 }} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-[280px] rounded-lg z-50" style={{ backgroundColor: c.surface, border: `1px solid ${c.border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: c.border }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-semibold" style={{ backgroundColor: tone.bg, color: tone.fg, fontFamily: fontMono }}>{user.initials}</div>
                <div className="flex-1">
                  <div className="text-[13px] font-medium" style={{ color: c.ink }}>{user.name}</div>
                  <Mono color={c.ink3} size={9.5}>{user.title}</Mono>
                </div>
              </div>
              <div className="space-y-1 mt-2">
                <div className="flex justify-between"><Mono color={c.ink3} size={9.5}>COUNCIL</Mono><Mono color={c.ink2} size={9.5}>{user.council}</Mono></div>
                <div className="flex justify-between"><Mono color={c.ink3} size={9.5}>FACILITY</Mono><Mono color={c.ink2} size={9.5}>{user.facility} · {user.department}</Mono></div>
                <div className="flex justify-between"><Mono color={c.ink3} size={9.5}>PHONE</Mono><Mono color={c.ink2} size={9.5}>{user.phone}</Mono></div>
                <div className="flex justify-between"><Mono color={c.ink3} size={9.5}>SHIFT</Mono><Mono color={c.ink2} size={9.5}>{sessionH}h {sessionM}m active</Mono></div>
              </div>
            </div>

            <div className="px-4 py-2.5 border-b" style={{ borderColor: c.border }}>
              <Eyebrow className="mb-1.5">Permissions on this device</Eyebrow>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  ["accept", "Accept"],
                  ["decline", "Decline"],
                  ["redirect", "Redirect"],
                  ["outgoing", "Outgoing"],
                  ["override", "Override"],
                ].map(([k, label]) => (
                  <div key={k} className="flex items-center gap-1.5 text-[10.5px]">
                    {user.permissions[k] ? <Check size={10} style={{ color: c.primary }} /> : <X size={10} style={{ color: c.ink4 }} />}
                    <span style={{ color: user.permissions[k] ? c.ink : c.ink4 }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={onLogout} className="w-full px-4 py-2.5 text-left text-[12px] flex items-center gap-2 transition hover:bg-stone-50" style={{ color: c.critical }}>
              <ArrowLeft size={12} />End shift &amp; log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PERMISSION-DENIED TOAST INSERTION HELPER (for nurse trying to accept etc.)
// ────────────────────────────────────────────────────────────────────────────
const cannotPerformMsg = (action) => `Your role doesn't permit ${action}. Ask a doctor or consultant on shift.`;

function App() {
  const [now, setNow] = useState(new Date());
  const [referrals, setReferrals] = useState(INITIAL_REFERRALS);
  const [availability] = useState(SERVICE_AVAILABILITY_INITIAL);
  const [selectedReferral, setSelectedReferral] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [audioOn, setAudioOn] = useState(true);
  const [toasts, setToasts] = useState([]);

  // ── Auth state ──
  const [currentUser, setCurrentUser] = useState(null);     // null = logged out
  const [sessionStart, setSessionStart] = useState(null);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [locked, setLocked] = useState(false);
  const [pinPrompt, setPinPrompt] = useState(null);          // { actionLabel, onConfirm }

  const pushToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { ...toast, id }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
  }, []);
  const dismissToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  // Inject Google Fonts
  useEffect(() => {
    if (document.getElementById("gherig-fonts")) return;
    const link = document.createElement("link");
    link.id = "gherig-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
    document.body.style.fontFamily = fontBody;
    document.body.style.backgroundColor = c.bg;
    document.body.style.color = c.ink;
    document.body.style.webkitFontSmoothing = "antialiased";
    document.body.style.MozOsxFontSmoothing = "grayscale";
  }, []);

  // Real-time clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-lock after 30 min idle (for demo: 5 min — feels real but not punishing during demos)
  useEffect(() => {
    if (!currentUser || locked) return;
    const id = setInterval(() => {
      if (Date.now() - lastActivity > 5 * 60 * 1000) {
        setLocked(true);
      }
    }, 10000);
    return () => clearInterval(id);
  }, [currentUser, locked, lastActivity]);

  // Track activity
  useEffect(() => {
    const tick = () => setLastActivity(Date.now());
    window.addEventListener("mousemove", tick);
    window.addEventListener("keydown", tick);
    window.addEventListener("touchstart", tick);
    window.addEventListener("click", tick);
    return () => {
      window.removeEventListener("mousemove", tick);
      window.removeEventListener("keydown", tick);
      window.removeEventListener("touchstart", tick);
      window.removeEventListener("click", tick);
    };
  }, []);

  // Vitals drift simulation
  useEffect(() => {
    if (!currentUser || locked) return;
    const id = setInterval(() => {
      setReferrals(prev => {
        const pendingIds = prev.filter(r => r.state === "PENDING" && r.direction === "incoming").map(r => r.id);
        if (pendingIds.length === 0) return prev;
        const targetId = pendingIds[Math.floor(Math.random() * pendingIds.length)];
        return prev.map(r => {
          if (r.id !== targetId) return r;
          const drift = (b, range, min, max) => Math.max(min, Math.min(max, b + Math.round((Math.random() - 0.5) * range)));
          return {
            ...r,
            vitals: {
              ...r.vitals,
              hr: drift(r.vitals.hr, 6, 35, 200),
              spo2: drift(r.vitals.spo2, 2, 60, 100),
              bpSys: drift(r.vitals.bpSys || r.vitals.sbp, 8, 50, 220),
              bpDia: drift(r.vitals.bpDia || r.vitals.dbp, 5, 30, 130),
            },
          };
        });
      });
    }, 12000);
    return () => clearInterval(id);
  }, [currentUser, locked]);

  // State auto-advancement: ACCEPTED → EN_ROUTE after 45s
  useEffect(() => {
    if (!currentUser || locked) return;
    const id = setInterval(() => {
      setReferrals(prev => prev.map(r => {
        if (r.state === "ACCEPTED" && r.acceptedAt) {
          const elapsed = (Date.now() - r.acceptedAt.getTime()) / 1000;
          if (elapsed > 45) {
            return {
              ...r,
              state: "EN_ROUTE",
              dispatchedAt: new Date(),
              eta: "≈8m",
              audit: [...(r.audit || []), { t: new Date(), actor: "NAS Dispatch", action: "Ambulance NAS-GA-014 dispatched · ETA 8m" }],
            };
          }
        }
        return r;
      }));
    }, 5000);
    return () => clearInterval(id);
  }, [currentUser, locked]);

  // ── Action handlers — gated by permissions and PIN re-auth where appropriate ──

  const acceptReferral = (referral) => {
    if (!currentUser.permissions.accept) {
      pushToast({ tone: "warning", title: "Action not permitted", message: cannotPerformMsg("accepting referrals") });
      return;
    }
    setReferrals(prev => prev.map(r => r.id === referral.id ? {
      ...r,
      state: "ACCEPTED",
      acceptedAt: new Date(),
      acceptedBy: currentUser.name,
      audit: [...(r.audit || []), { t: new Date(), actor: `${currentUser.name} (${ROLE_TONES[currentUser.role].label})`, action: "Accepted at ED triage station" }],
    } : r));
    if (selectedReferral?.id === referral.id) setSelectedReferral(null);
    pushToast({ tone: "primary", title: "Referral accepted", message: `${referral.chiefComplaint} — bed reserved` });
  };

  const declineReferral = (referralId, reason) => {
    if (!currentUser.permissions.decline) {
      pushToast({ tone: "warning", title: "Action not permitted", message: cannotPerformMsg("declining referrals") });
      return;
    }
    // Sensitive: PIN re-auth required
    setPinPrompt({
      actionLabel: "Decline referral",
      onConfirm: () => {
        setReferrals(prev => prev.map(r => r.id === referralId ? {
          ...r, state: "DECLINED", declinedAt: new Date(), declineReason: reason,
          audit: [...(r.audit || []), { t: new Date(), actor: `${currentUser.name} (${ROLE_TONES[currentUser.role].label})`, action: `Declined · ${reason}` }],
        } : r));
        setSelectedReferral(null);
        setPinPrompt(null);
        pushToast({ tone: "warning", title: "Referral declined", message: reason });
      },
    });
  };

  const redirectReferral = (referralId, target, reason) => {
    if (!currentUser.permissions.redirect) {
      pushToast({ tone: "warning", title: "Action not permitted", message: cannotPerformMsg("redirecting referrals") });
      return;
    }
    setPinPrompt({
      actionLabel: `Redirect to ${FACILITIES[target]?.short || target}`,
      onConfirm: () => {
        setReferrals(prev => prev.map(r => r.id === referralId ? {
          ...r, state: "REDIRECTED", redirectedTo: target, redirectReason: reason,
          audit: [...(r.audit || []), { t: new Date(), actor: `${currentUser.name} (${ROLE_TONES[currentUser.role].label})`, action: `Redirected to ${FACILITIES[target]?.name || target} · ${reason}` }],
        } : r));
        setSelectedReferral(null);
        setPinPrompt(null);
        pushToast({ tone: "info", title: "Referral redirected", message: `Sent to ${FACILITIES[target]?.short || target}` });
      },
    });
  };

  const submitOutgoingReferral = (data) => {
    if (!currentUser.permissions.outgoing) {
      pushToast({ tone: "warning", title: "Action not permitted", message: cannotPerformMsg("initiating outgoing referrals") });
      return;
    }
    setPinPrompt({
      actionLabel: "Initiate outgoing referral",
      onConfirm: () => {
        const newRef = {
          id: `KBU-${new Date().getFullYear().toString().slice(-2)}-${String(new Date().getMonth()+1).padStart(2,"0")}${String(new Date().getDate()).padStart(2,"0")}-O${Math.floor(Math.random()*900+100)}`,
          direction: "outgoing",
          state: "PENDING",
          priority: data.priority || "ROUTINE",
          patientId: data.hospitalNumber || `KBU-${Math.floor(100000 + Math.random() * 900000)}`,
          name: data.name || "",
          age: data.age, sex: data.sex, patientCategory: data.patientCategory,
          chiefComplaint: data.subCategory === "__other" ? data.otherCondition : (data.subCategory || data.primaryCategory),
          serviceNeeded: data.requestedService,
          reasonForReferral: data.reasonForReferral,
          vitals: { hr: data.hr, spo2: data.spo2, bpSys: data.sbp, bpDia: data.dbp, rr: data.rr, temp: data.temp, gcs: data.gcs, avpu: data.avpu },
          stability: data.stability,
          interventions: data.interventions,
          summary: data.summary,
          notes: data.notes || "",
          fromFacility: "KBU", toFacility: data.destination,
          referringClinician: currentUser.name,
          referringRole: currentUser.title,
          referringPhone: currentUser.phone,
          distance: data.distance || 0,
          initiatedAt: new Date(),
          audit: [{ t: new Date(), actor: `${currentUser.name} (${ROLE_TONES[currentUser.role].label})`, action: `Outbound referral initiated from tablet · KBU → ${data.destination}` }],
        };
        setReferrals(prev => [newRef, ...prev]);
        setWizardOpen(false);
        setPinPrompt(null);
        pushToast({ tone: "primary", title: "Referral sent", message: `To ${FACILITIES[data.destination]?.short || data.destination}` });
      },
    });
  };

  // ── Render decision tree ──

  if (!currentUser) {
    return <LoginScreen onLogin={(u) => {
      setCurrentUser(u);
      setSessionStart(new Date());
      setLastActivity(Date.now());
      setLocked(false);
      pushToast({ tone: "primary", title: `Welcome, ${u.name.split(" ").slice(-1)[0]}`, message: `Signed in as ${ROLE_TONES[u.role].label} · session 12h` });
    }} />;
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: c.bg, fontFamily: fontBody, color: c.ink }}>
      <HospitalTabletView
        referrals={referrals}
        onAccept={acceptReferral}
        onSelect={setSelectedReferral}
        onNewReferral={() => setWizardOpen(true)}
        audioOn={audioOn}
        setAudioOn={setAudioOn}
        now={now}
        currentUser={currentUser}
        sessionStart={sessionStart}
        onLogout={() => { setCurrentUser(null); setSessionStart(null); setLocked(false); }}
      />
      {selectedReferral && (
        <ReferralDrawer
          referral={selectedReferral}
          onClose={() => setSelectedReferral(null)}
          onAccept={acceptReferral}
          onDecline={declineReferral}
          onRedirect={redirectReferral}
          currentUser={currentUser}
        />
      )}
      {wizardOpen && (
        <ReferralWizard
          onClose={() => setWizardOpen(false)}
          onSubmit={submitOutgoingReferral}
          availability={availability}
        />
      )}
      {pinPrompt && (
        <PinPrompt
          user={currentUser}
          actionLabel={pinPrompt.actionLabel}
          onConfirm={pinPrompt.onConfirm}
          onCancel={() => setPinPrompt(null)}
        />
      )}
      {locked && (
        <AutoLockScreen
          user={currentUser}
          onUnlock={() => { setLocked(false); setLastActivity(Date.now()); }}
          onLogout={() => { setCurrentUser(null); setSessionStart(null); setLocked(false); }}
        />
      )}
      <ToastStack toasts={toasts} dismissToast={dismissToast} />
    </div>
  );
}

export default App;
