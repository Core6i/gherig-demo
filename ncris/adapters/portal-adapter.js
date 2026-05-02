/**
 * Hospital Portal · NCRIS wire-up
 * ────────────────────────────────────────────────────────────────────
 * Wire-up for GherigHospitalPortal.jsx. The Portal needs:
 *   • Live clinical inbox driven by referral.{facility} events
 *   • One-click accept/decline that hits NCRIS
 *   • Capacity board that publishes capacity.{facility} events
 *   • Outgoing referrals (when this facility refers onward)
 */

import { NcrisClient } from './ncris-client.js';

export async function portalDemo() {
  const client = new NcrisClient({ baseUrl: 'http://127.0.0.1:4000' });
  await client.login('kbth.portal', 'portal-demo-2026', 'portal');

  // 1. Initial inbox load — pull all incoming referrals targeted here
  const { referrals: incoming } = await client.listReferrals({
    targetFacility: 'KBTH-001',
    state: 'routed',
  });
  console.log(`Inbox: ${incoming.length} routed referrals`);

  // 2. Live updates — the Portal stays open all day; new referrals
  //    flash in via WebSocket without polling.
  client.connectEvents();
  client.subscribe(['referral.KBTH-001'], (evt) => {
    if (evt.payload.event === 'incoming') {
      console.log(`NEW: ${evt.payload.referral.referralNumber} (${evt.payload.referral.priority})`);
    }
  });

  // 3. Accept a referral — single endpoint, audit-logged
  if (incoming.length > 0) {
    const accepted = await client.acceptReferral(incoming[0].id, {
      acceptedNote: 'Cath lab Bay 2 prepared. ETA 12 min.',
    });
    console.log(`Accepted ${accepted.referralNumber}, state=${accepted.state}`);
  }

  // 4. Capacity board — Portal updates its own capacity throughout the day
  await client.updateCapacity('KBTH-001', {
    bedsAvailable: 45,
    icuAvailable: 3,
    status: 'open',
  });

  // 5. Outgoing referral — KBTH refers to KATH for neurosurgery
  const outgoing = await client.createReferral({
    fromFacilityCode: 'KBTH-001',
    condition: 'Subdural haematoma',
    reasonCode: 'I62.0',
    priority: 'high',
    stability: 'stable',
    summary: 'Awaiting decompressive surgery; KBTH neurosurg theatre booked',
    patient: {
      name: { first: 'Adwoa', last: 'Frimpong' },
      dob: '1958-03-14', sex: 'F', ageYears: 67, category: 'Adult',
    },
    vitals: { sbp: 152, dbp: 92, hr: 84, rr: 18, spo2: 96, gcs: 13 },
  });
  console.log(`Outgoing: ${outgoing.referral.referralNumber}`);

  return { incoming: incoming.length, outgoing: outgoing.referral.referralNumber };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  portalDemo().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
