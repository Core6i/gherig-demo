/**
 * NCRIS · Clinical Engine
 * ────────────────────────────────────────────────────────────────────
 * THE source of truth for vital sign assessment in the GhERIG network.
 *
 * This engine is implemented identically in all five user-facing
 * subsystems (Tablet, Portal, NECC, ARCS, EMT Device) — but those are
 * client-side copies for offline operation. NCRIS holds the authoritative
 * thresholds. Every Observation that flows through NCRIS is re-assessed
 * server-side. Discrepancies are flagged in the audit log.
 *
 * Source of clinical thresholds:
 *   • Ghana Standard Treatment Guidelines (7th edition)
 *   • WHO IMCI (Integrated Management of Childhood Illness)
 *   • Resuscitation Council UK PEWS for paediatric thresholds
 *   • NICE NEWS2 for adult thresholds where Ghana STG is silent
 *
 * Updates to clinical thresholds require:
 *   1. Approval from the GhERIG Clinical Governance Committee
 *   2. Threshold change PR with citations
 *   3. 8/8 regression test pass
 *   4. Synchronised release to all five subsystems
 *
 * The version string is published at GET /api/v1/clinical/engine-version.
 * Any subsystem on a mismatched version is warned and audited.
 */

export const ENGINE_VERSION = '1.0.0-2026-05-02';

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
    all:     { critical: 90, abnormal: 92, borderline: 94, normal: 100 },
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

export function assessSBP(val, age, category) {
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
}

export function assessHR(val, age, category) {
  if (val == null || isNaN(val)) return null;
  const ab = ageBand(age, category);
  const tier = tierFromBand(val, VITAL_RANGES.hr[ab]) || 'normal';
  return { tier, score: TIER_SCORE[tier] };
}

export function assessRR(val, age, category) {
  if (val == null || isNaN(val)) return null;
  const ab = ageBand(age, category);
  const tier = tierFromBand(val, VITAL_RANGES.rr[ab]) || 'normal';
  return { tier, score: TIER_SCORE[tier] };
}

export function assessSpO2(val, category) {
  if (val == null || isNaN(val)) return null;
  const t = category === 'Neonate' ? VITAL_RANGES.spo2.neonate : VITAL_RANGES.spo2.all;
  let tier = 'normal';
  if (val < t.critical) tier = 'critical';
  else if (val < t.abnormal) tier = 'abnormal';
  else if (val < t.borderline) tier = 'borderline';
  return { tier, score: TIER_SCORE[tier] };
}

export function assessGCS(val) {
  if (val == null || isNaN(val)) return null;
  let tier = 'normal';
  if (val <= VITAL_RANGES.gcs.critical) tier = 'critical';
  else if (val <= VITAL_RANGES.gcs.abnormal) tier = 'abnormal';
  else if (val <= VITAL_RANGES.gcs.borderline) tier = 'borderline';
  return { tier, score: TIER_SCORE[tier] };
}

export function assessVitals(vitals, age, category) {
  const checks = {
    sbp:  assessSBP(parseFloat(vitals.sbp), age, category),
    hr:   assessHR(parseFloat(vitals.hr), age, category),
    rr:   assessRR(parseFloat(vitals.rr), age, category),
    spo2: assessSpO2(parseFloat(vitals.spo2), category),
    gcs:  assessGCS(parseFloat(vitals.gcs)),
  };
  let totalScore = 0, criticalCount = 0;
  Object.values(checks).forEach(c => { if (!c) return; totalScore += c.score; if (c.tier === 'critical') criticalCount++; });

  let recommendedPriority = 'routine';
  if (criticalCount >= 1 || totalScore >= 7) recommendedPriority = 'critical';
  else if (totalScore >= 4) recommendedPriority = 'high';

  return { perVital: checks, totalScore, criticalCount, recommendedPriority, engineVersion: ENGINE_VERSION };
}

/**
 * Verify a client subsystem's engine output matches NCRIS authoritative
 * assessment. Any divergence is a clinical safety event.
 */
export function verifyClientAssessment(serverAssessment, clientAssessment) {
  if (!clientAssessment || !clientAssessment.perVital) {
    return { match: false, reason: 'no client assessment provided' };
  }
  const divergences = [];
  for (const key of Object.keys(serverAssessment.perVital)) {
    const s = serverAssessment.perVital[key];
    const c = clientAssessment.perVital[key];
    if (!s && !c) continue;
    if (!s || !c) {
      divergences.push({ vital: key, server: s?.tier ?? null, client: c?.tier ?? null });
      continue;
    }
    if (s.tier !== c.tier) {
      divergences.push({ vital: key, server: s.tier, client: c.tier });
    }
  }
  return {
    match: divergences.length === 0,
    divergences,
    serverEngineVersion: ENGINE_VERSION,
    clientEngineVersion: clientAssessment.engineVersion || 'unknown',
  };
}
