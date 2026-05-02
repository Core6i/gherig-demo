/**
 * Pre-referral Tablet · NCRIS wire-up
 * ────────────────────────────────────────────────────────────────────
 * Paste-able example showing exactly how the existing Tablet JSX
 * (gherig-tablet.jsx) integrates with NCRIS. The five state-machine
 * touchpoints map cleanly to NCRIS endpoints.
 *
 * Touchpoints in the existing UI:
 *   Step 1 (Patient ID)        → NHIA verify → MPI resolve
 *   Step 2 (Presenting)        → local
 *   Step 3 (Vitals)            → server-side engine assessment for safety
 *   Step 4 (Investigations)    → local
 *   Step 5 (Diagnosis)         → local
 *   Step 6 (Submit)            → POST /referrals (server re-asserts engine output)
 */

import { NcrisClient } from './ncris-client.js';

export async function tabletDemo() {
  const client = new NcrisClient({ baseUrl: 'http://127.0.0.1:4000' });

  // 1. Login at start of shift — token cached locally for 8h
  await client.login('kbth.tablet', 'tablet-demo-2026', 'tablet');

  // 2. Patient identification — NHIA first, then Ghana Card if needed
  const nhia = await client.verifyNhia('7821-4523-9018');
  if (!nhia.found) {
    // Fallback to Ghana Card
    const gc = await client.verifyGhanaCard('GHA-123456789-0');
    if (!gc.valid) throw new Error('Cannot identify patient');
  }

  // 3. Resolve to MPI (Patient Master Index)
  const { patient, action } = await client.resolvePatient({
    nhiaMembershipNumber: nhia.member?.membershipNumber,
    name: { first: 'Kofi', last: 'Asante' },
    dob: '1967-04-12', sex: 'M',
    facilityCode: 'KBTH-001',
  });
  console.log(`Patient: ${patient.ncrisPatientId} (${action})`);

  // 4. (Optional) Pre-validate vitals against the server engine. The
  //    Tablet UI runs its own client-side engine for instant feedback;
  //    this round-trip catches version drift.
  const assessment = await client.assessVitals(
    { sbp: 222, dbp: 174, hr: 135, rr: 36, spo2: 89, gcs: 14 },
    59, 'Adult'
  );
  console.log(`Engine recommends: ${assessment.serverAssessment.recommendedPriority}`);

  // 5. Submit the referral — NCRIS re-runs the engine authoritatively
  //    and routes the envelope to the receiving Portal.
  const { referral, mpiAction, engineDivergence } = await client.createReferral({
    fromFacilityCode: 'KBTH-001',
    condition: 'Acute coronary syndrome',
    reasonCode: 'I21.9',
    priority: 'critical',
    stability: 'unstable',
    summary: 'STEMI on ECG, BP 222/174, urgent PCI required',
    patient: {
      nhiaMembershipNumber: '7821-4523-9018',
      name: { first: 'Kofi', last: 'Asante' },
      dob: '1967-04-12', sex: 'M', ageYears: 59, category: 'Adult',
    },
    vitals: { sbp: 222, dbp: 174, hr: 135, rr: 36, spo2: 89, gcs: 14 },
    clientAssessment: assessment.serverAssessment, // for divergence detection
  });

  if (engineDivergence) {
    console.warn('CLINICAL SAFETY: client/server engine disagreement', engineDivergence);
  }

  console.log(`Referral ${referral.referralNumber} submitted, state=${referral.state}`);

  // 6. Subscribe to lifecycle updates — the Tablet shows the doctor
  //    when the receiving facility accepts/declines the referral.
  client.connectEvents();
  client.subscribe([`referral.KBTH-001`], (evt) => {
    if (evt.payload.referral?.id === referral.id) {
      console.log(`Update: referral ${evt.payload.event} by receiving facility`);
    }
  });

  return referral;
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  tabletDemo().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
