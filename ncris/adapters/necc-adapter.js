/**
 * NECC Command Centre · NCRIS wire-up
 * ────────────────────────────────────────────────────────────────────
 * Wire-up for NeccCommandCentre.jsx. NECC is the highest-traffic
 * subsystem — operators handle ~200 bed-searches per day. The wire-up
 * leans heavily on the live event bus.
 */

import { NcrisClient } from './ncris-client.js';

export async function neccDemo() {
  const client = new NcrisClient({ baseUrl: 'http://127.0.0.1:4000' });
  await client.login('necc.operator', 'necc-demo-2026', 'necc');

  // 1. Live national picture — subscribe to everything NECC needs
  client.connectEvents();
  client.subscribe([
    'necc.national',          // every nationally significant event
    'escalation.national',    // open escalations
    'referral.*',             // all facility referral events (wildcard)
    'dispatch.*',             // all regional dispatch events
  ], (evt) => {
    console.log(`[${evt.topic}] ${evt.payload.event}`);
  });

  // 2. Bed-search — the NECC operator presses "Find Bed" on a critical
  //    referral. NCRIS ranks all candidate facilities by capacity,
  //    distance, specialty match.
  const { candidates } = await client.bedSearch({
    specialty: 'cardiology',
    requireIcu: true,
    priority: 'critical',
    originRegion: 'GA',
    originLat: 5.6739, originLon: -0.0132,    // Tema
  });
  console.log(`Bed-search: ${candidates.length} candidates`);
  console.log(`Top: ${candidates[0].facility.name} (score ${candidates[0].score.toFixed(0)}, ${candidates[0].approxDistanceKm?.toFixed(0) || '?'} km)`);

  // 3. Route the referral to the top candidate
  // (assumes a referralId from a prior step)
  // const routed = await client.routeReferral(referralId, {
  //   targetFacilityCode: candidates[0].facility.code,
  //   targetUnit: 'Cath Lab Bay 2',
  // });

  // 4. Escalation broker — when a region cannot solve a case locally
  //    (e.g., ICU full + blood bank low + no available cath lab), NECC
  //    raises an escalation that surfaces to senior medical leadership.
  const esc = await client.raiseEscalation({
    facilityCode: 'KBTH-001',
    kind: 'icu_full',
    severity: 'high',
    summary: 'KBTH ICU at 100% capacity for 4h. Three pending critical referrals awaiting bed.',
  });
  console.log(`Escalation raised: ${esc.id}`);

  // 5. List all open escalations for the dashboard
  const { escalations } = await client.listEscalations({ status: 'open' });
  console.log(`${escalations.length} open escalations nationally`);

  // 6. Capacity heatmap — live snapshot for the map view
  const { capacity } = await client.getCapacity();
  const constrained = capacity.filter(c => c.status === 'constrained' || c.status === 'full');
  console.log(`${constrained.length} facilities constrained or full`);

  return { candidates: candidates.length, escalations: escalations.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  neccDemo().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
