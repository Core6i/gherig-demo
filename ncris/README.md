# NCRIS — National Clinical Referral & Intelligence Switch

**The integration backbone of the GhERIG (Ghana Emergency Referral & Intelligence Grid) programme.**

NCRIS is the message switch that connects the five user-facing subsystems (Pre-referral Tablet, Hospital Portal, NECC Command Centre, ARCS Dispatch, EMT Device) and exposes the GhERIG ecosystem to authorised partners. This is the **reference implementation** — a complete, runnable, integration-tested Node.js server that proves the architecture and serves as the technical specification for the production build.

---

## What you're looking at

```
ncris/
├── src/                          ← The NCRIS server (zero npm dependencies)
│   ├── index.js                    Entry point; composition root
│   ├── routes.js                   HTTP API surface (40 endpoints)
│   ├── core/
│   │   ├── storage.js              Postgres-shaped collection store (JSON-backed)
│   │   ├── clinical-engine.js      Authoritative vital-sign engine (matches subsystems exactly)
│   │   ├── router.js               Express-shaped router
│   │   └── auth.js                 JWT + scrypt + API keys (Node crypto only)
│   ├── audit/
│   │   └── audit-log.js            Hash-chained, tamper-evident audit
│   ├── events/
│   │   └── event-bus.js            WebSocket pub/sub (RFC 6455 from scratch)
│   ├── identity/
│   │   └── identity-services.js    NHIA, Ghana Card (privacy-preserving), MoH facility registry, NAS personnel, MPI
│   ├── fhir/
│   │   └── resources.js            FHIR R4 resources + CapabilityStatement
│   └── domain/
│       └── services.js             Referrals, BedSearch, Dispatch, Brokerage, Capacity, Escalation, Observation
│
├── test/
│   └── run.js                    ← End-to-end integration tests · 69/69 green
│
├── adapters/                     ← Wire-up examples for each subsystem
│   ├── ncris-client.js             Shared base client
│   ├── tablet-adapter.js           How gherig-tablet.jsx talks to NCRIS
│   ├── portal-adapter.js           How GherigHospitalPortal.jsx talks to NCRIS
│   ├── necc-adapter.js             How NeccCommandCentre.jsx talks to NCRIS
│   ├── arcs-adapter.js             How ArcsPortal.jsx talks to NCRIS
│   └── emt-adapter.js              How EmtDevice.jsx talks to NCRIS
│
├── docs/
│   ├── INTEGRATION_GUIDE.md      ← For subsystem teams + partner integrators
│   ├── RUNBOOK.md                ← For ops / SRE running NCRIS in production
│   ├── THREAT_MODEL.md           ← STRIDE-organised security analysis
│   └── openapi.json              ← OpenAPI 3.1 spec (40 endpoints, 8 schemas, 13 tags)
│
└── package.json                  ← Zero npm dependencies; Node ≥ 20 only
```

**6,361 lines** of source, tests, adapters, and documentation. **Zero external dependencies** — everything runs on Node.js built-ins (`http`, `crypto`, `fs`, `net`).

---

## Running it

```bash
cd ncris
node src/index.js
```

That's it. NCRIS boots on `http://0.0.0.0:4000`, seeds 8 default users (one for each role × subsystem), and starts accepting requests. Storage is JSON files under `./.data/`.

To run the integration tests:

```bash
node test/run.js
```

You should see **69 tests passing** across 14 sections covering authentication, the 8-case clinical engine regression suite, NHIA/Ghana Card identity, the full end-to-end referral lifecycle, bed-search, brokerage, FHIR conformance, audit chain integrity, WebSocket pub/sub, and subsystem extensibility.

---

## What's actually in here

### A working server

Boots in ~300ms. Listens on HTTP and WebSocket on the same port. Handles graceful shutdown with audit chain verification on exit.

### Authoritative clinical engine

The same Ghana STG + WHO IMCI thresholds that live in all five subsystems, this time on the server. Every vital sign that flows through NCRIS is re-assessed server-side. Client/server divergence is logged as a clinical safety event.

### Hash-chained audit log

Every clinically significant event writes a SHA-256-chained AuditEvent. ~30 distinct event types covering authentication, referrals, dispatches, brokerage, capacity, observations, and admin actions. Chain verification runs in O(n).

### WebSocket event bus

Real-time pub/sub. Topics are scoped (a Greater Accra dispatcher cannot subscribe to Ashanti dispatches). Implements RFC 6455 frames directly using Node's crypto module. No `ws` package.

### FHIR R4 conformance

Patient, Practitioner, Organization, Encounter, ServiceRequest (referrals), Observation (vitals), MedicationAdministration, Procedure, AuditEvent, plus a custom CapacityStatement extension. CapabilityStatement at `/fhir/r4/metadata` (no auth).

### Identity services

NHIA membership lookup (mocked, drop-in replaceable with the real NHIA verifier API). Ghana Card verification with privacy-preserving SHA-256 hashing — the full PIN is never stored. MoH facility registry with 11 real Ghana facilities seeded. NAS personnel directory. Patient Master Index with five-tier deterministic + probabilistic matching.

### Three extension surfaces

1. **Subsystem registration** — admin endpoint to register a new subsystem (a "Private Hospital Portal", a "MoH Inspector App", a "School Telehealth client") without touching core code.
2. **Partner API gateway** — separate `/api/v1/partner/*` routes with API key auth and scope checks. NHIS, GHS, donor M&E, telcos — each gets a scoped key.
3. **Event bus** — partners with `event:subscribe:*` scope can connect to the WebSocket and receive scoped event streams.

### Operational hardening

Health endpoint, Prometheus metrics, structured JSON logging, request ID tracing, graceful shutdown, configuration via environment variables only. Default JWT secret warns at boot if not changed.

---

## What it isn't

This is a **reference implementation**. It is honest about what it is and what it is not.

It is **not**:
- A production-hardened deployment ready for 100 facilities (storage is JSON files; production needs Postgres)
- Horizontally scalable (event bus is in-process; production needs Redis pub/sub)
- Penetration-tested (an independent firm needs to do that before pilot)
- Wrapped in a CI/CD pipeline (one needs to be set up by the production team)
- Anchored to immutable storage (production should anchor the audit chain to S3 Object Lock every hour)

What it **is**:
- A complete, runnable, integration-tested implementation of every interface the production system will need
- A spec for the production team — every line is auditable, every contract is documented
- A proof that the architecture works end-to-end
- A demo that ministers, donors, and integration partners can actually run on a laptop

The transition from reference to production is a multi-month engineering effort by a team of 8–12 engineers. The 10 specific gaps that must be closed before pilot are listed in `docs/THREAT_MODEL.md`.

---

## Default users (development only)

| Username                 | Password              | Role               | Use case                          |
|--------------------------|-----------------------|--------------------|-----------------------------------|
| `admin`                  | `ncris-admin-2026`    | admin              | Subsystem and partner registration |
| `kbth.tablet`            | `tablet-demo-2026`    | doctor             | Pre-referral Tablet                |
| `kbth.portal`            | `portal-demo-2026`    | doctor             | Hospital Portal                    |
| `necc.operator`          | `necc-demo-2026`      | necc_operator      | NECC Command Centre                |
| `arcs.ga.dispatcher`     | `arcs-demo-2026`      | arcs_dispatcher    | ARCS Greater Accra dispatcher      |
| `nas.hq`                 | `nashq-demo-2026`     | nas_hq             | NAS HQ (brokerage approval)        |
| `emt.gr002`              | `emt-demo-2026`       | emt                | EMT Device (vehicle AMB-GR-002)    |
| `auditor.general`        | `audit-demo-2026`     | auditor            | Auditor-General read-only          |

**These default passwords must be removed before any non-reference deployment.** See `docs/RUNBOOK.md` SOP-001.

---

## A 30-second tour

1. Read this README. (Done.)
2. Read `docs/INTEGRATION_GUIDE.md` for the conceptual model and how each subsystem wires up.
3. Boot the server: `node src/index.js`
4. Hit it: `curl http://localhost:4000/`
5. Run the tests: `node test/run.js` — watch 69 green ticks scroll past.
6. Open `docs/openapi.json` in Swagger UI to browse the full API surface.
7. Read `docs/THREAT_MODEL.md` to understand the security posture.
8. Read `docs/RUNBOOK.md` to understand what production needs.

---

*Every wheel. Every minute. Every patient.*

— Dr. Ing. Jacob Kwabena Amponsah · GhERIG Programme · May 2026
