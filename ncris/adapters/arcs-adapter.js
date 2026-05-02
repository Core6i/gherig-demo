/**
 * ARCS Dispatch · NCRIS wire-up
 * ────────────────────────────────────────────────────────────────────
 * Wire-up for ArcsPortal.jsx. ARCS has the most complex role-scoping —
 * a Greater Accra dispatcher sees only Greater Accra dispatches, while
 * NAS HQ sees the full network.
 *
 * The NCRIS WebSocket subscription authoriser enforces this scoping:
 * if a GA dispatcher tries to subscribe to dispatch.AS, the bus refuses.
 */

import { NcrisClient } from './ncris-client.js';

export async function arcsDemo() {
  const client = new NcrisClient({ baseUrl: 'http://127.0.0.1:4000' });
  await client.login('arcs.ga.dispatcher', 'arcs-demo-2026', 'arcs');

  // 1. Pull the regional dispatch queue
  const { dispatches } = await client.listDispatches({ region: 'GA', state: 'requested' });
  console.log(`GA pending dispatches: ${dispatches.length}`);

  // 2. Available vehicles for assignment
  const { vehicles } = await client._request('GET', '/api/v1/vehicles?region=GA');
  const available = vehicles.filter(v => v.status === 'available');
  console.log(`Available vehicles: ${available.length}/${vehicles.length}`);

  // 3. Assign — single tap on the dispatcher console
  if (dispatches.length > 0 && available.length > 0) {
    const assigned = await client.assignVehicle(dispatches[0].id, {
      vehicleCode: available[0].code,
      crewIds: ['P-NAS-1847', 'P-NAS-2109'],
      etaMin: 14,
    });
    console.log(`Assigned ${assigned.vehicleCode} to dispatch ${assigned.id}`);
  }

  // 4. Inter-region brokerage — when GA is saturated, request capacity
  //    from a neighbouring region. HQ approval required.
  const broker = await client.requestBrokerage({
    requestingRegion: 'GA',
    targetRegion: 'ER',                       // Eastern Region
    condition: 'STEMI',
    fromFacility: 'KBTH-001',
    toFacility: 'KOR-RH',                     // Koforidua Regional
    reason: 'All GA tertiary cath labs booked next 2h',
  });
  console.log(`Brokerage requested: ${broker.id} (status: ${broker.status})`);

  // 5. Live updates — dispatches assigned by other dispatchers, EMT
  //    vehicles transitioning state, GPS pings, brokerage decisions.
  client.connectEvents();
  client.subscribe(['dispatch.GA'], (evt) => {
    console.log(`Dispatch event: ${evt.payload.event} (${evt.payload.dispatch?.state})`);
  });
  client.subscribe(['brokerage.hq'], (evt) => {
    if (evt.payload.broker?.requestingRegion === 'GA') {
      console.log(`HQ ${evt.payload.event} our brokerage request`);
    }
  });

  return { pending: dispatches.length, available: available.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  arcsDemo().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
