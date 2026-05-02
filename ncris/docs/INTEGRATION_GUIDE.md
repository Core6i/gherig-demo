# NCRIS Integration Guide

**National Clinical Referral & Intelligence Switch · GhERIG Programme**
Version 1.0 · May 2026

---

## Audience

This guide is for two groups:

1. **Subsystem teams** wiring the five existing GhERIG subsystems (Pre-referral Tablet, Hospital Portal, NECC Command Centre, ARCS Dispatch, EMT Device) to NCRIS.
2. **Partner integrators** building integrations into the GhERIG ecosystem on behalf of NHIA, GHS, NAS HQ, donor M&E platforms, telcos, or other authorised parties.

If you are a clinician or operations user, this is not your document — see the user guides for your subsystem instead.

---

## What NCRIS is, in one paragraph

NCRIS is the message switch that connects the five GhERIG subsystems and exposes the GhERIG ecosystem to authorised external partners. Every referral envelope, every dispatch transition, every vital sign capture, every brokerage approval, every escalation, every capacity update flows through NCRIS. NCRIS holds the authoritative copy of the clinical engine, the audit log, the patient master index, the facility registry, and the personnel directory. If a subsystem cannot reach NCRIS, it operates in offline-tolerant mode with local drafts, then syncs when connectivity returns.

---

## Core concepts

### The clinical engine is authoritative on the server

Every subsystem ships with a client-side copy of the clinical engine for offline tolerance. The thresholds match exactly. But when a subsystem submits a referral or an observation, NCRIS re-runs the engine server-side and stores the server result as authoritative. If the client and server engine outputs disagree, NCRIS records a `VITALS_DIVERGENCE` audit event for clinical safety review. This is not a bug; it is the design — if a tablet is running stale code with old thresholds, the divergence audit catches it.

### Patient identity is unified through the MPI

A patient who walks into Tema General with NHIA `7821-4523-9018` and into Korle-Bu six months later with the same number is the same patient in NCRIS. The MPI matches in this priority order: NCRIS internal patient ID → NHIA membership → Ghana Card hash → facility folder → demographic-only (with human review flag).

Ghana Card storage is privacy-preserving. NCRIS never stores the full PIN. It stores a SHA-256 hash with a system-wide pepper. The same PIN from the same patient produces the same hash, but a database leak does not expose Ghana Card numbers.

### Audit is hash-chained

Every clinically significant event writes an audit entry. Each entry includes the SHA-256 hash of the previous entry. Tampering with any historical entry invalidates the hash chain at every entry that follows. The chain is verifiable in O(n) by `GET /api/v1/admin/audit/verify`. Production deployments anchor the chain to immutable storage every six hours.

### Events are pushed, not polled

The five subsystems do not poll NCRIS. They open a single WebSocket connection to `/ws/v1/events?token=<jwt>` and subscribe to topics relevant to their role. When ARCS assigns a vehicle, the EMT Device, the NECC dashboard, and the originating Hospital Portal all see it in milliseconds. Polling is reserved for the initial inbox load.

### Role-scoped access

A Greater Accra ARCS dispatcher cannot see Ashanti dispatches. A Korle-Bu Portal user cannot accept a referral routed to 37 Military. Tablet users cannot read the audit log. These are enforced at the route layer (HTTP) and at the WebSocket subscription authoriser. Trying to subscribe to an unauthorised topic is silently rejected; the client does not see those events.

---

## Authentication

### For subsystems: JWT bearer tokens

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "username": "kbth.tablet", "password": "...", "subsystem": "tablet" }

→ 200 OK
{ "accessToken": "eyJhbGc...", "tokenType": "Bearer", "expiresIn": 28800, "user": { ... } }
```

Default token TTL is 8 hours (one shift). Pass it on every subsequent HTTP request:

```http
Authorization: Bearer eyJhbGc...
```

For WebSocket, browsers cannot set headers on upgrade, so the token is passed as a query parameter:

```
ws://ncris.gov.gh/ws/v1/events?token=eyJhbGc...
```

In production, replace HS256 JWT with SMART-on-FHIR / OAuth2 backed by a hospital identity provider. The bearer-token interface stays the same.

### For partners: API keys

Partners get a long-lived API key issued once. Pass it as an `X-API-Key` header. The plaintext key is shown exactly once at issuance and never again — store it in a secret manager.

```http
GET /api/v1/partner/referrals/aggregate?since=2026-05-01
X-API-Key: partner_J3dF8h...

→ 200 OK
{ "windowStart": "2026-05-01T00:00:00Z", "windowEnd": "...", "total": 4302, "byPriority": { "critical": 384, "high": 1218, "routine": 2700 }, "byState": { ... } }
```

API keys are scoped. A key with `referral:read:aggregate` cannot read individual referrals or call dispatch endpoints — only aggregated counts.

---

## End-to-end referral lifecycle

The single most important integration to understand. This is what 67 of our 69 integration tests exercise.

```
TABLET                         NCRIS                          PORTAL                          ARCS                           EMT
   │                             │                              │                              │                              │
   │  POST /referrals            │                              │                              │                              │
   ├────────────────────────────►│                              │                              │                              │
   │  ← 201 + referral.id        │  publish referral.{from}     │                              │                              │
   │                             │  publish referral.{target}   │                              │                              │
   │                             │  publish necc.national       │                              │                              │
   │                             │                              │  ◄── WS event "incoming"      │                              │
   │                             │  POST /referrals/:id/route   │                              │                              │
   │                             │◄─────────────────────────────┤                              │                              │
   │                             │  ← 200 + state: routed       │                              │                              │
   │                             │                              │                              │                              │
   │                             │  POST /referrals/:id/accept  │                              │                              │
   │                             │◄─────────────────────────────┤                              │                              │
   │                             │  ← 200 + state: accepted     │                              │                              │
   │                             │                              │                              │                              │
   │                             │  POST /dispatches            │                              │                              │
   │                             │◄─────────────────────────────────────────────────────────── │   (NECC requests)            │
   │                             │  ← 201 + dispatch.id         │                              │                              │
   │                             │                              │                              │  ◄── WS event "requested"     │
   │                             │  POST /dispatches/:id/assign │                              │                              │
   │                             │◄─────────────────────────────────────────────────────────── │                              │
   │                             │  ← 200 + vehicleCode set     │                              │                              │
   │                             │                              │                              │  publish dispatch.{vehicle}  │
   │                             │                              │                              │                              │  ◄── WS event "assigned"
   │                             │  POST /dispatches/:id/transition (× 5: en_route_pickup → on_scene → en_route_dest → arrived → cleared)
   │                             │◄─────────────────────────────────────────────────────────────────────────────────────────── ┤
   │                             │  ← 200 each transition       │                              │                              │
   │                             │                              │                              │                              │
   │                             │  POST /observations (mid-transit vitals)                    │                              │
   │                             │◄─────────────────────────────────────────────────────────────────────────────────────────── ┤
   │                             │  ← 201 + serverAssessment    │                              │                              │
```

Total round-trips per referral: typically 11 HTTP calls. Total NCRIS audit events written: typically 20 to 30. Total wall-clock time from Tablet submit to EMT cleared: 35 to 60 minutes for a critical case.

---

## How each subsystem wires up

See `adapters/` directory:

- `tablet-adapter.js` — paste-able example for the Pre-referral Tablet
- `portal-adapter.js` — paste-able example for the Hospital Portal
- `necc-adapter.js` — paste-able example for the NECC Command Centre
- `arcs-adapter.js` — paste-able example for ARCS Dispatch
- `emt-adapter.js` — paste-able example for the EMT Device
- `ncris-client.js` — shared client used by all five

Each adapter is a runnable demo. With a local NCRIS server running, executing `node adapters/tablet-adapter.js` produces a real referral, real audit events, and real WebSocket subscriptions.

---

## Adding a new subsystem

NCRIS was designed with subsystem extensibility from day one. To add a sixth subsystem (for example a "MoH Inspector App", a "Private Hospital Portal", or a "School Telehealth client"):

1. Admin registers the subsystem:

```http
POST /api/v1/admin/subsystems
Authorization: Bearer <admin token>

{ "name": "MoH Inspector App", "kind": "inspector", "allowedScopes": ["inspection:create", "audit:read"], "contactEmail": "..." }
```

2. Admin creates user accounts for the new subsystem's users with the appropriate role.

3. The new subsystem uses the shared `NcrisClient` and calls the same endpoints as the five existing subsystems. There is no special "new subsystem" registration — the registration is purely metadata.

4. If the new subsystem needs new endpoints not covered by the existing API surface, the NCRIS API is versioned (`/api/v1/`, `/api/v2/`) and new resource families can be added without breaking existing clients.

---

## Adding a partner integration

Partner integrations are different from subsystems. Subsystems are first-class clinical clients with full authority to create, route, and act on referrals. Partners are read-mostly, scope-limited, and identified by API key rather than user JWT.

Typical partners and their scopes:

| Partner                          | Scope(s)                                                      | Use case                            |
|----------------------------------|---------------------------------------------------------------|-------------------------------------|
| NHIS Claims Processing           | `referral:read:aggregate`, `dispatch:read:aggregate`          | Cross-reference claims with referral records |
| GHS National Reporting           | `capacity:read`, `referral:read:aggregate`                    | EAR-Q quarterly reporting           |
| NAS HQ Strategic Reporting       | `dispatch:read:aggregate`, `capacity:read`                    | National response time analytics    |
| Donor M&E (e.g. World Bank)      | `referral:read:aggregate`, `dispatch:read:aggregate`          | Programme outcome reporting         |
| Telco SMS Notification           | `event:subscribe:patient_facing`                              | SMS alerts to patients/next-of-kin  |
| Research Data Warehouse          | `fhir:read:deidentified`                                      | De-identified clinical research     |

To onboard a partner:

1. Partner submits an integration request with intended use case, data minimisation plan, and contact details to `ncris-integrations@moh.gov.gh`.
2. GhERIG Programme Office reviews against data-sharing policy and Ghana DPA (Data Protection Act 843) requirements.
3. Once approved, an admin issues the API key and scopes.
4. The partner receives the key once, plus the OpenAPI spec for the partner endpoints.

Partners that need richer access — for example, a research data warehouse needing FHIR resource access — get a separate FHIR client identifier and either an API key or a SMART-on-FHIR Backend Services token (production).

---

## FHIR R4 conformance

NCRIS exposes a FHIR R4 RESTful interface at `/fhir/r4/*`. The `CapabilityStatement` is at `GET /fhir/r4/metadata` (no auth required).

Resources supported:

| FHIR resource                | NCRIS mapping                                       |
|------------------------------|-----------------------------------------------------|
| Patient                      | MPI patient record                                  |
| Practitioner                 | NAS personnel + facility clinicians                 |
| Organization                 | MoH facility registry                               |
| ServiceRequest               | Referral envelope (the referral primitive)          |
| Observation                  | Vital signs                                         |
| MedicationAdministration     | EMT medication interventions                        |
| Procedure                    | EMT non-medication interventions                    |
| AuditEvent                   | Audit log entries (auditor role only)               |
| CapabilityStatement          | This server's conformance profile                   |

Future extensions: Encounter, Condition, DocumentReference (for e-PCR PDFs), DiagnosticReport, Coverage (for NHIA membership).

---

## Versioning policy

The HTTP API is versioned at `/api/v1/`. Breaking changes require a new major version path; new endpoints can be added to existing versions. The clinical engine version (`ENGINE_VERSION`) is independently versioned and surfaces at `GET /api/v1/clinical/engine-version`. Subsystems on a mismatched engine version are warned in their session payload and audited.

Deprecation timeline: deprecated endpoints are marked in OpenAPI with `deprecated: true` and `x-sunset-date`. Minimum sunset window is 12 months from deprecation announcement.

---

## Rate limits

| Audience    | Limit                          | Burst          |
|-------------|--------------------------------|----------------|
| Subsystems  | 1,000 req/min per token        | 100 req/sec    |
| Partners    | 60 req/min per API key         | 10 req/sec     |
| FHIR (read) | 600 req/min per token          | 30 req/sec     |
| Anonymous   | 30 req/min per IP              | 5 req/sec      |

Rate limits are advisory in the reference implementation. Production deployments enforce them at the API gateway layer (Kong, Apigee, AWS API Gateway).

---

## Error envelope

All errors follow a consistent shape:

```json
{
  "error": {
    "code": "REFERRAL_NOT_FOUND",
    "message": "Referral not found",
    "details": { ... }
  },
  "timestamp": "2026-05-02T14:23:47.482Z"
}
```

Error codes are stable and machine-readable. Messages are human-readable but may evolve. Build your client logic against `code`, not `message`.

---

## Operational endpoints

| Endpoint     | Auth        | Use case                              |
|--------------|-------------|---------------------------------------|
| `/`          | none        | Service banner, links, version        |
| `/healthz`   | none        | Liveness probe (Kubernetes-ready)     |
| `/metrics`   | none        | Prometheus exposition                  |
| `/fhir/r4/metadata` | none | FHIR conformance                      |

`/metrics` exposes counters for audit events, referrals, dispatches, escalations, websocket clients, and uptime. Wire this into Prometheus and dashboards in Grafana.

---

## Getting help

- Slack channel for integrators: `#gherig-integrations` (request access from Programme Office)
- Email: `ncris-integrations@moh.gov.gh`
- Bug reports: GitHub issues at the GhERIG repo (access by invitation)
- Security issues: `security@gherig.gov.gh` — PGP key on the website

---

*Every wheel. Every minute. Every patient.*
