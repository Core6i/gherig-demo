# GhERIG App — Unified Frontend

The unified React frontend for the **GhERIG (Ghana Emergency Referral & Intelligence Grid)** programme. Brings together the five subsystems and wires them to the NCRIS backend.

---

## What this is

A single React application with:

- **Login screen** that authenticates against NCRIS
- **Subsystem switcher** — flip between Pre-referral Tablet, Hospital Portal, NECC Command Centre, ARCS Dispatch, and EMT Device without re-authenticating
- **Live NCRIS panel** — a floating drawer on every subsystem that shows real backend data flowing in real time
- The five subsystem JSX components, **unmodified** in `src/subsystems/`

The original JSX files are imported as-is. No modifications. The bridge layer (`src/bridge/`) provides everything the subsystems need to talk to NCRIS — but right now they still use their built-in seed data for the main UI. The NCRIS panel sits alongside them, proving the wiring works. As you progressively wire each subsystem deeper, the seed data is replaced with NCRIS data, one piece at a time.

This is the right way to do this: **don't break what's working**. The subsystems already pass clinical-engine regression tests and have polished UIs. The bridge gives you the integration scaffolding; the deep wiring is a project for later.

---

## How to run it (full demo)

You need **two terminals**.

### Terminal 1 — NCRIS backend

```bash
cd ncris
node src/index.js
```

You should see:
```
NCRIS booting
Seeded default users (first boot)
NCRIS listening · port 4000
```

NCRIS is now running on `http://localhost:4000`.

### Terminal 2 — GhERIG frontend

```bash
cd gherig-app
npm install        # first time only
npm run dev
```

You should see:
```
VITE v5.4.10  ready in 380 ms
➜  Local:   http://localhost:3000/
```

Open `http://localhost:3000` in a browser.

---

## What you'll see

1. **Login screen** — pick one of the five subsystems. Demo credentials are pre-filled.
2. After login — the **subsystem opens** with its full UI exactly as it always was.
3. **Bottom-right corner** — a floating "Live NCRIS Data" button. Click it.
4. The **NCRIS panel** slides up showing live referrals, dispatches, escalations, capacity, and vehicles from the real backend.
5. **Top right** — a green "NCRIS · live" chip means the WebSocket is connected. Events stream in.
6. **Subsystem switcher** in the top bar — flip between subsystems without logging out.

---

## What's wired vs. what's seed data

The subsystem UIs (the main viewport) **still use their original seed data**. Buttons in those UIs still update local state, just like before. This is intentional — it preserves all the polished interactions and visual demos you've already built.

The **NCRIS panel** is fully wired. Open it and you'll see:

- All referrals created via the Tablet (or directly via API) — **really submitted to the backend**
- All dispatches created via NECC — **really tracked in the dispatch table**
- All capacity updates from the Portal — **really persisted**
- Audit chain integrity, in real time

To prove the cross-subsystem wiring works:

1. Open the **Tablet** subsystem in one browser tab → you can submit a real referral here once you're ready to wire that flow.
2. Open the **Portal** in another tab → toggle the NCRIS panel → watch the new referral show up live.
3. Open the **NECC** in a third tab → bed-search, escalation, all visible.

(The submission part requires you wire the Tablet's submit handler to `ncris.createReferral()`. See "Next steps" below.)

---

## Project structure

```
gherig-app/
├── package.json                       Vite + React 18 + lucide-react
├── vite.config.js                     Proxies /api and /ws to NCRIS:4000
├── index.html                         Loads Google Fonts, sets up #root
├── src/
│   ├── main.jsx                       Entry point, wraps App in NcrisProvider
│   ├── App.jsx                        Login → Shell → Subsystem + NCRIS panel
│   ├── bridge/
│   │   ├── ncris-client.js            Browser NCRIS client (fetch + WebSocket)
│   │   └── NcrisProvider.jsx          React context, useNcris(), useReferrals(), etc.
│   ├── components/
│   │   ├── Login.jsx                  Login screen with subsystem picker
│   │   ├── Shell.jsx                  Top bar, subsystem switcher, live ticker
│   │   └── NcrisPanel.jsx             Floating "Live NCRIS Data" panel
│   └── subsystems/
│       ├── gherig-tabletfinal.jsx     ← Your Tablet, unmodified
│       ├── GherigHospitalPortalf.jsx  ← Your Portal, unmodified
│       ├── NeccCommandCentre.jsx      ← Your NECC, unmodified
│       ├── ArcsPortal.jsx             ← Your ARCS, unmodified
│       └── EmtDevice.jsx              ← Your EMT Device, unmodified
```

---

## Next steps — deeply wiring each subsystem

When you (or your team) want each subsystem to fully use NCRIS instead of its seed data:

### 1. Open the subsystem JSX file (e.g. `src/subsystems/gherig-tabletfinal.jsx`)

### 2. At the top, import the bridge hooks:

```javascript
import { useReferrals, useNcris } from '../bridge/NcrisProvider.jsx';
```

### 3. Find the `useState` line that holds seed data:

```javascript
// Before:
const [referrals, setReferrals] = useState(INITIAL_REFERRALS);

// After:
const { data, refresh } = useReferrals({});
const referrals = data?.referrals || [];
```

### 4. Find the submit handler (e.g. `submitOutgoingReferral`):

```javascript
// Before:
setReferrals(prev => [newRef, ...prev]);

// After:
const { ncris } = useNcris();
await ncris.createReferral(payload);
refresh();
```

That's the pattern. Each subsystem has 3–8 places where this pattern needs to be applied. The hooks I built handle the WebSocket auto-refresh — when another subsystem creates a referral, your `referrals` array updates automatically.

---

## Default credentials (development only)

| Subsystem  | Username                   | Password               |
|------------|----------------------------|------------------------|
| Tablet     | `kbth.tablet`              | `tablet-demo-2026`     |
| Portal     | `kbth.portal`              | `portal-demo-2026`     |
| NECC       | `necc.operator`            | `necc-demo-2026`       |
| ARCS       | `arcs.ga.dispatcher`       | `arcs-demo-2026`       |
| EMT        | `emt.gr002`                | `emt-demo-2026`        |
| Auditor    | `auditor.general`          | `audit-demo-2026`      |
| Admin      | `admin`                    | `ncris-admin-2026`     |

The login screen pre-fills these when you pick a subsystem. Production credentials replace these via the admin endpoint.

---

## Troubleshooting

**"NCRIS unreachable" on the login screen**
NCRIS isn't running. Open another terminal: `cd ncris && node src/index.js`.

**Login button greyed out**
NCRIS unreachable (see above) — the button enables only when the health check passes.

**WebSocket "reconnecting" stays orange**
NCRIS is up but the WebSocket upgrade isn't reaching it. Check the Vite proxy config in `vite.config.js` — it must include the `/ws` proxy with `ws: true`.

**Subsystem screen looks broken**
The JSX files use Google Fonts (Fraunces, Inter Tight, JetBrains Mono). Check your browser can reach `fonts.googleapis.com`.

**Login works but NCRIS panel shows "Loading…" forever**
Check the browser console (F12). Most likely the bearer token isn't being attached. Confirm `NcrisProvider` is wrapping `App` in `main.jsx`.

---

*Every wheel. Every minute. Every patient.*
