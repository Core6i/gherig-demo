/**
 * NCRIS React Bridge
 * ────────────────────────────────────────────────────────────────────
 * React-side integration layer over the NCRIS client.
 *
 * Provides:
 *   • <NcrisProvider> — wraps the app, exposes the client + auth state
 *   • useNcris()      — gives access to the client and current user
 *   • useNcrisAuth()  — auth state, login/logout helpers
 *   • useReferrals(), useDispatches(), useEscalations(), useCapacity(),
 *     useVehicles() — live-data hooks that refetch + WebSocket-update
 *   • useEvent(topic, handler) — subscribe to a single topic
 *
 * The hooks follow a consistent shape:
 *   const { data, loading, error, refresh } = useReferrals(filter);
 *
 * Each hook auto-refetches when the relevant WebSocket topic fires so
 * the UI stays live without polling.
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { ncris } from './ncris-client.js';

const NcrisContext = createContext(null);

export function NcrisProvider({ children }) {
  const [authed, setAuthed] = useState(ncris.isAuthenticated());
  const [user, setUser] = useState(ncris.user);

  useEffect(() => {
    return ncris.onAuthChange(() => {
      setAuthed(ncris.isAuthenticated());
      setUser(ncris.user);
    });
  }, []);

  // Auto-connect WebSocket whenever authenticated
  useEffect(() => {
    if (authed) {
      ncris.connectEvents();
      return () => ncris.disconnect();
    }
  }, [authed]);

  const value = useMemo(() => ({ ncris, authed, user }), [authed, user]);
  return <NcrisContext.Provider value={value}>{children}</NcrisContext.Provider>;
}

export function useNcris() {
  const ctx = useContext(NcrisContext);
  if (!ctx) throw new Error('useNcris must be used inside <NcrisProvider>');
  return ctx;
}

export function useNcrisAuth() {
  const { authed, user } = useNcris();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const login = useCallback(async (username, password, subsystem) => {
    setBusy(true); setError(null);
    try {
      const r = await ncris.login(username, password, subsystem);
      return r;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setBusy(true);
    try { await ncris.logout(); } finally { setBusy(false); }
  }, []);

  return { authed, user, login, logout, busy, error };
}

/**
 * Generic resource hook — fetches data, listens for events, refetches
 * automatically when relevant events fire.
 */
function useResource({ key, fetcher, topic, deps = [] }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetcher();
      if (aliveRef.current) { setData(result); setError(null); }
    } catch (err) {
      if (aliveRef.current) setError(err);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, deps);                                  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    aliveRef.current = true;
    refresh();
    let unsub = null;
    if (topic) {
      unsub = ncris.subscribe(topic, () => refresh());
    }
    return () => {
      aliveRef.current = false;
      if (unsub) unsub();
    };
  }, [refresh, topic]);

  return { data, loading, error, refresh };
}

// ─── Specific hooks ──────────────────────────────────────────────

export function useReferrals(filter = {}) {
  const filterKey = JSON.stringify(filter);
  const facilityTopic = filter.fromFacility || filter.targetFacility;
  const topic = facilityTopic ? `referral.${facilityTopic}` : 'necc.national';
  return useResource({
    key: `referrals:${filterKey}`,
    fetcher: () => ncris.listReferrals(filter),
    topic,
    deps: [filterKey],
  });
}

export function useReferral(id) {
  return useResource({
    key: `referral:${id}`,
    fetcher: () => id ? ncris.getReferral(id) : null,
    topic: null,
    deps: [id],
  });
}

export function useDispatches(filter = {}) {
  const filterKey = JSON.stringify(filter);
  const topic = filter.region ? `dispatch.${filter.region}` : 'necc.national';
  return useResource({
    key: `dispatches:${filterKey}`,
    fetcher: () => ncris.listDispatches(filter),
    topic,
    deps: [filterKey],
  });
}

export function useVehicles(filter = {}) {
  const filterKey = JSON.stringify(filter);
  return useResource({
    key: `vehicles:${filterKey}`,
    fetcher: () => ncris.listVehicles(filter),
    topic: filter.region ? `dispatch.${filter.region}` : 'necc.national',
    deps: [filterKey],
  });
}

export function useEscalations(filter = {}) {
  const filterKey = JSON.stringify(filter);
  return useResource({
    key: `escalations:${filterKey}`,
    fetcher: () => ncris.listEscalations(filter),
    topic: 'escalation.national',
    deps: [filterKey],
  });
}

export function useCapacity(facilityCode) {
  return useResource({
    key: `capacity:${facilityCode || 'all'}`,
    fetcher: () => ncris.getCapacity(facilityCode),
    topic: facilityCode ? `capacity.${facilityCode}` : 'necc.national',
    deps: [facilityCode],
  });
}

export function useFacilities(filter = {}) {
  const filterKey = JSON.stringify(filter);
  return useResource({
    key: `facilities:${filterKey}`,
    fetcher: () => ncris.listFacilities(filter),
    topic: null,
    deps: [filterKey],
  });
}

export function useBrokerage(filter = {}) {
  const filterKey = JSON.stringify(filter);
  return useResource({
    key: `brokerage:${filterKey}`,
    fetcher: () => ncris.listBrokerage(filter),
    topic: 'brokerage.hq',
    deps: [filterKey],
  });
}

/**
 * Subscribe to a WebSocket topic for the lifetime of the component.
 *
 *   useEvent('referral.KBTH-001', (msg) => {
 *     console.log('new event', msg.payload);
 *   });
 */
export function useEvent(topic, handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const wrapped = (msg) => handlerRef.current(msg);
    return ncris.subscribe(topic, wrapped);
  }, [topic]);
}

/**
 * Verify NCRIS is reachable. Used by the splash screen.
 */
export function useNcrisHealth() {
  const [status, setStatus] = useState({ ok: null, banner: null });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/healthz');
        const NCRIS_BASE = import.meta.env.VITE_NCRIS_URL || '';

const banner = await fetch(`${NCRIS_BASE}/`)
  .then(r => r.json())
  .catch(() => null);
        if (alive) setStatus({ ok: res.ok, banner });
      } catch (err) {
        if (alive) setStatus({ ok: false, error: err.message });
      }
    })();
    return () => { alive = false; };
  }, []);
  return status;
}
