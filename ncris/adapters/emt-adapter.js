/**
 * EMT Device · NCRIS wire-up
 * ────────────────────────────────────────────────────────────────────
 * Wire-up for EmtDevice.jsx. The EMT Device has the most demanding
 * connectivity story:
 *   • GPS pings every 15s (battery-aware: throttle to 60s when stationary)
 *   • Network drops are normal — interventions are queued offline and
 *     synced when signal returns
 *   • The 6-state lifecycle stepper is the primary touchpoint
 */

import { NcrisClient } from './ncris-client.js';

export async function emtDemo() {
  const client = new NcrisClient({ baseUrl: 'http://127.0.0.1:4000' });
  await client.login('emt.gr002', 'emt-demo-2026', 'emt');

  // 1. EMT receives the dispatch envelope via WebSocket
  client.connectEvents();
  client.subscribe(['dispatch.AMB-GR-002'], (evt) => {
    if (evt.payload.event === 'assigned') {
      console.log(`NEW JOB: ${evt.payload.dispatch.condition}`);
    }
  });

  // 2. Pull current active job (in case device restarted mid-shift)
  const { dispatches } = await client.listDispatches({ vehicle: 'AMB-GR-002' });
  const active = dispatches.find(d => !['cleared'].includes(d.state));
  if (!active) { console.log('No active job'); return; }

  // 3. Walk the lifecycle. Each tap on the stepper hits one endpoint.
  //    Last GPS coords are sent with each transition for non-repudiation.
  const transitions = ['en_route_pickup', 'on_scene', 'en_route_dest', 'arrived', 'cleared'];
  for (const toState of transitions) {
    if (active.state === toState) continue;     // skip if we're already past this state
    const updated = await client.transitionDispatch(active.id, {
      toState,
      gpsLat: 5.55 + Math.random() * 0.05,
      gpsLon: -0.20 + Math.random() * 0.05,
    });
    console.log(`Lifecycle: ${updated.state}`);
    if (toState === 'cleared') break;
  }

  // 4. GPS pings during transit — fire and forget, no audit per ping
  setInterval(async () => {
    try {
      await client.sendGps(active.id, 5.55 + Math.random() * 0.05, -0.20 + Math.random() * 0.05);
    } catch (_) { /* offline ok — drop ping */ }
  }, 15000);

  // 5. Vital sign capture during transit — server re-runs engine
  await client.recordObservation({
    patientId: active.patientId || 'unknown',
    patientAge: 59,
    patientCategory: 'Adult',
    vitals: { sbp: 198, dbp: 142, hr: 128, rr: 28, spo2: 91, gcs: 14 },
    source: 'emt-device',
    vehicleCode: 'AMB-GR-002',
    targetFacilityCode: active.toFacilityCode,
    dispatchId: active.id,
  });

  // 6. Offline tolerance — if network drops, queue and retry on reconnect
  if (typeof navigator !== 'undefined') {
    window.addEventListener('online', () => client.flushDraftQueue());
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  emtDemo().then(() => { setTimeout(() => process.exit(0), 1000); }).catch(err => { console.error(err); process.exit(1); });
}
