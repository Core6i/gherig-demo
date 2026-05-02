# NCRIS Security Threat Model

**National Clinical Referral & Intelligence Switch · GhERIG Programme**
Version 1.0 · May 2026 · Classification: Restricted

---

## Purpose

This document identifies the threats facing NCRIS, the mitigations in place, the residual risks accepted by the Programme Office, and the items deferred to Phase 2 production hardening. It is reviewed quarterly by the GhERIG Programme Office Security Working Group and the Auditor-General's IT Audit team. It will be referenced by the independent penetration testers contracted before pilot go-live.

The model uses the STRIDE framework: Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege.

---

## Assets to protect, in priority order

1. **Patient clinical data** — vitals, conditions, identifiers, demographics. Disclosure breaches Ghana Data Protection Act 843 and patient confidentiality. Tampering harms patients.
2. **Audit log integrity** — the hash-chained record is the source of truth for medico-legal review, NHIA claims dispute resolution, and Auditor-General access. Tampering destroys evidentiary value.
3. **Clinical engine thresholds** — drift in thresholds harms patients directly. The engine is hard-coded server-side specifically because it must not be configurable at runtime.
4. **Authentication credentials** — JWT signing key, password hashes, partner API keys, Ghana Card pepper.
5. **Service availability** — emergency referrals during outage flow back to paper, but minutes lost cost lives. The system is operationally critical infrastructure.
6. **Identifier mappings** — NHIA membership numbers, Ghana Card hashes. Disclosure does not directly harm a patient but enables linkage attacks.

---

## Trust boundaries

```
                           ┌──────────────── PUBLIC INTERNET ────────────────┐
                           │                                                  │
                           │  Untrusted: anyone can reach the front door.    │
                           │  Mitigations: TLS, WAF, rate limit, auth.       │
                           └──────────────────────┬───────────────────────────┘
                                                  │
                          ┌───────────────────────▼─────────────────────────┐
                          │   AUTHENTICATED SUBSYSTEM (JWT)                 │
                          │                                                  │
                          │   Trusted to act in role's authority.           │
                          │   Mitigations: scope checks, audit trail,        │
                          │   session TTL, role-scoped event subscriptions. │
                          └───────────────────────┬─────────────────────────┘
                                                  │
                          ┌───────────────────────▼─────────────────────────┐
                          │   NCRIS PROCESS                                  │
                          │                                                  │
                          │   Trusted, but minimum privilege enforced.       │
                          │   No filesystem write outside data dir.          │
                          │   Process runs as non-root.                      │
                          └───────────────────────┬─────────────────────────┘
                                                  │
                          ┌───────────────────────▼─────────────────────────┐
                          │   STORAGE (Postgres in production)               │
                          │                                                  │
                          │   Most trusted layer. Network-isolated. Only    │
                          │   NCRIS app role can connect.                    │
                          └─────────────────────────────────────────────────┘
```

---

## Threats

### S — Spoofing

| Threat                                                          | Mitigation                                                                                              | Residual risk                                |
|-----------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|---------------------------------------------|
| Attacker forges a JWT to impersonate a clinician                | HMAC-SHA-256 signed JWTs. Constant-time signature comparison. Token TTL 8h.                            | Compromised JWT secret would forge any token. Production: rotate to RS256 with KMS-held key. |
| Attacker presents a stolen partner API key                      | Keys hashed at rest with HMAC-SHA-256 + constant-time comparison. Revocation supported.                | Partner side compromise (1Password leak, etc.) is out of NCRIS control. Mitigated by scope-limited keys. |
| Attacker spoofs a subsystem identity by registering as a fake one | Subsystem registration is admin-only. New subsystems must be admin-issued credentials.                 | Compromised admin account would let an attacker register a fake subsystem. Mitigated by SOP-010 break-glass review. |
| Phishing — clinician credentials harvested by fake login page   | Subsystems must point at a single canonical NCRIS domain. TLS certificate pinning recommended for production. | User behaviour out of NCRIS control. Mitigated by training. Phase 2: WebAuthn for clinicians. |

### T — Tampering

| Threat                                                          | Mitigation                                                                                              | Residual risk                                |
|-----------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|---------------------------------------------|
| Tampering with audit log entries                                | Hash-chained entries. Each entry includes SHA-256 of previous. Tampering breaks the chain at every subsequent entry. | An attacker with database write access who tampers the entire chain (including all subsequent entries) could escape detection until the next anchor. Production: hourly anchor to S3 Object Lock + Auditor-General. |
| Tampering with referral state (e.g., changing priority)         | All state transitions go through service methods that audit the change. State machine is enforced (you cannot accept a draft referral, etc.). | Direct database access bypasses the service. Mitigated by least-privilege DB roles in production. |
| Tampering with clinical engine output                           | Engine is server-side authoritative. Client engine submissions are re-checked. Divergence is audited.   | Compromised NCRIS code itself could be modified to change thresholds. Mitigated by signed releases and reproducible builds. |
| Modification of patient identifiers post-creation               | Patients' `ncrisPatientId` is opaque and generated at creation. Identifier changes are auditable updates. | Edge case: malicious admin manually editing the database. Mitigated by DB role separation. |

### R — Repudiation

| Threat                                                          | Mitigation                                                                                              |
|-----------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| Clinician later denies they made a clinical decision            | Every login, accept, decline, route, transition, and observation writes an audit event with `actor: <userId>` and `actorRole`. The hash chain prevents post-hoc deletion. |
| Dispatcher denies they assigned a vehicle                       | Dispatch assignment audit records the dispatcher's user ID, the timestamp, the vehicle code, and the dispatch ID. |
| HQ denies they approved a brokerage                             | Brokerage approval is audited with HQ user ID and timestamp. The audit chain is independently anchored. |
| Receiving facility denies they accepted a referral              | Acceptance audit records facility code, accepting clinician's user ID, and the acceptance note (free-text justification). |

### I — Information disclosure

| Threat                                                          | Mitigation                                                                                              | Residual risk                                |
|-----------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|---------------------------------------------|
| Bulk patient data extraction by compromised subsystem           | Subsystems are scope-limited. A Tablet user cannot query other facilities' referrals. Rate limiting applies per token. | High-volume access from a single token would be flagged by anomaly detection in production. |
| Ghana Card PIN exposure via database leak                       | NCRIS never stores PINs. Only SHA-256 with system-wide pepper. Rainbow tables defeated by pepper.       | The pepper itself is a secret; leak of pepper + DB enables offline brute force of Ghana Card hashes. Mitigated by pepper rotation policy (never rotate without re-keying — separate plan required). |
| NHIA membership numbers leaked                                  | NHIA numbers are stored but accessible only to authenticated subsystem clients. They flow through TLS in transit. | NHIA numbers are not as sensitive as Ghana Card PINs but still PII. Standard DB encryption at rest applies. |
| Audit log exposure (reveals patient flow)                       | Audit endpoint requires `auditor`, `admin`, `nas_hq`, or `necc_operator` role.                          | Auditor role is privileged; mitigated by limiting account count and auditing audit-log access (yes, meta-audit). |
| WebSocket subscription leak (eavesdropping topics not authorised for the user) | Subscription authoriser checks role + facility/region + vehicle scope. Unauthorised topics silently rejected. | Defence in depth — subsystems should not request unauthorised topics in the first place. |
| Verbose error messages disclosing internal structure            | Error envelope returns `code` and `message`. Stack traces only in `NCRIS_DEBUG=true` (development only). | Mitigated by env config; production deploys must verify debug mode is off. |
| Side-channel leaks (timing attacks on credential check)         | Password verification uses scrypt with constant-time comparison. JWT signature verification uses `crypto.timingSafeEqual`. API key lookup is hash-then-find which is constant-time per query. | Network timing leaks remain possible at very large scale. Mitigated by random jitter in production. |

### D — Denial of service

| Threat                                                          | Mitigation                                                                                              | Residual risk                                |
|-----------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|---------------------------------------------|
| HTTP flood                                                      | Rate limits at gateway (Phase 2). Cloudflare WAF in front of all production traffic.                    | Distributed attacks from compromised botnets always possible. Mitigated by failover to multi-region. |
| Auth-flood (attempting password guess at scale)                 | scrypt is intentionally slow per check. Per-IP rate limit on `/api/v1/auth/login`. Account lockout after 5 failures (Phase 2). | Slow scrypt could itself be a DoS vector — mitigated by per-IP and per-account rate limits. |
| Body bomb (huge POST body)                                      | Body parser enforces 1MB limit by default.                                                              | Attackers can chunk-encode, slowly streaming. Mitigated by gateway timeouts in production. |
| WebSocket connection flood                                      | Each connection requires a valid JWT. Connection count per token can be limited at the gateway.         | High-volume valid token + many concurrent sessions could exhaust file handles. Mitigated by ulimit and instance count. |
| Slowloris attack on HTTP                                        | Node default keep-alive is permissive. Production NGINX in front terminates slow connections.           | Reference impl is vulnerable; mitigated by gateway in production. |
| Audit log fill                                                  | Every log line is a write. An attacker generating high-volume legitimate-looking activity could exhaust the audit table. | Mitigated by per-actor rate limits and partitioned audit tables. Even at 100M events/year, total volume is manageable. |
| Resource exhaustion via WebSocket subscription explosion        | Subscription set is bounded per client. Unauthorised topics rejected, not added.                       | Theoretically a malicious client could subscribe to thousands of valid topics. Mitigated by per-client subscription limit (100, configurable). |

### E — Elevation of privilege

| Threat                                                          | Mitigation                                                                                              |
|-----------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| Tablet user gains admin role                                    | Roles are encoded in the JWT and verified server-side on every request. Roles are not user-modifiable.  |
| ARCS regional dispatcher in Greater Accra accesses Ashanti dispatches | Region is encoded in the JWT. Dispatch list endpoints filter by user's region. WebSocket subscriptions enforce same. |
| Receiving Portal accepts a referral routed to a different facility | The referral state machine requires the targetFacilityCode to match the acceptor's facility (Phase 2 hardening — currently any portal user with role `doctor` can accept any routed referral; this is acceptable for the reference but must be tightened before pilot). |
| Compromise of a partner API key escalates to subsystem-equivalent access | Partner keys are scope-limited and cannot use referral, dispatch, or admin endpoints. They route through `/api/v1/partner/*` only. |
| EMT can transition a dispatch they were not assigned to         | Phase 2 hardening — dispatch transitions should verify the EMT's vehicle matches the dispatch's vehicleCode. Currently any EMT-role user can transition any dispatch in this reference. |
| SQL injection                                                   | Reference uses JSON file storage; no SQL. Production Postgres adapter must use parameterised queries exclusively. Add this to Phase 2 acceptance criteria. |
| Path traversal on data dir                                      | Reference data dir paths are constructed from constants. No user input flows into filesystem paths.     |
| Prototype pollution / object injection                          | All inputs are JSON-parsed. We do not use `Object.assign({}, untrusted)` patterns. Code review checks. |

---

## Known reference-implementation gaps to close before pilot

These are explicit deferrals from "reference implementation" to "production hardening" and must be tracked as pilot-blockers:

1. **Tighter accept-authority** — receiving portal acceptance must verify `targetFacilityCode === user.facility`. Currently any `doctor` role user can accept.
2. **Tighter EMT transitions** — dispatch transition must verify the EMT's `vehicleId` matches the dispatch's `vehicleCode`.
3. **Account lockout** — 5 failed login attempts within 15 minutes locks the account for 30 minutes; admin reset required after 10 failures.
4. **Per-IP and per-token rate limits** — at the API gateway, not in NCRIS.
5. **Replace HS256 JWT with RS256 + KMS-held key** — eliminates plaintext signing key in process memory.
6. **Replace JSON storage with Postgres** — gives ACID guarantees, foreign keys, partitioned audit table.
7. **Replace in-process EventBus with Redis Pub/Sub** — for horizontal scaling.
8. **Anchor audit chain to S3 Object Lock** — every hour, the latest chain hash is written to immutable storage.
9. **WebAuthn for clinicians** — phishing-resistant authentication for the Tablet and Portal.
10. **SMART-on-FHIR / OAuth2 for partners** — instead of static API keys.

These items are listed in priority order. Items 1–4 are non-negotiable for pilot. Items 5–8 are required by Q4 2026. Items 9–10 are required by national rollout.

---

## Independent penetration test scope

Before pilot go-live, an independent firm (TBD by Programme Office procurement) will conduct:

- Web application penetration test (OWASP Top 10 plus FHIR-specific concerns)
- API security review against the OpenAPI spec
- Authentication and session management review
- Authorisation matrix testing across all roles
- Static analysis of the Node.js codebase
- Threat modelling workshop with the Programme Office
- Social engineering test against subsystem operators (with prior consent)

Penetration test report findings are tracked as P0 (block pilot), P1 (must fix in 30 days), P2 (must fix in 90 days), P3 (nice to have).

---

## Compliance mapping

| Regulation / Standard                  | Relevant requirement                          | NCRIS mitigation                              |
|----------------------------------------|-----------------------------------------------|-----------------------------------------------|
| Ghana Data Protection Act 843          | Lawful basis for processing PII               | NHIA + treatment-of-emergency lawful basis; documented in DPIA |
|                                        | Right to access, rectification, erasure       | Patient endpoints support read; rectification via authenticated clinical update; erasure subject to medico-legal retention rules |
|                                        | Data subject notification of breach           | SEV-1 incident response triggers notification within 72h |
| HL7 FHIR R4                            | Conformance to spec                           | Server publishes CapabilityStatement; resources match R4 schemas |
| ISO 27001 (controls applicable)        | Access control, audit, encryption             | Role-based access, hash-chained audit, TLS in transit, encryption at rest in production |
| Coronial / forensic evidence handling  | Tamper-evident records                        | Hash-chained audit anchored to immutable storage |
| Auditor-General's Office               | Read-only audit access                        | Auditor role grants read access without write privileges |
| WHO Digital Health framework           | Interoperability                              | FHIR R4, HL7 codes, LOINC for vitals, ICD-10 for conditions |

---

## Document control

- **Owner:** GhERIG Programme Office Security Working Group
- **Review cadence:** Quarterly
- **Distribution:** Restricted — Programme Office, Operations team, contracted penetration testers (NDA), Auditor-General's IT Audit team
- **Classification:** Government Restricted

This document does not contain secrets. It documents the security architecture and posture of NCRIS so that the right people can challenge it before adversaries do.

---

*Trust the chain. Verify the chain. Anchor the chain.*
