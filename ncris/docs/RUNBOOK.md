# NCRIS Deployment Runbook

**For: Operations, SRE, Programme Office**
Version 1.0 · May 2026

---

## What this document is

A practical guide for deploying, operating, and recovering NCRIS in production. Written for the engineers and operators who will keep the system running 24/7 once it goes live. If you are an integrator, see `INTEGRATION_GUIDE.md` instead.

This document does not cover Phase 1 reference deployment (which is `node src/index.js`). It covers what production needs to look like and the standard operating procedures.

---

## Production architecture

```
                                      ┌────────────────────┐
                                      │  Cloudflare / WAF  │
                                      │  DDoS · TLS · Bot  │
                                      └─────────┬──────────┘
                                                │
                                ┌───────────────┴────────────────┐
                                │       Load Balancer (HA)       │
                                │   (NGINX / AWS ALB / GCP LB)   │
                                └───────────────┬────────────────┘
                                                │
                  ┌───────────────┬─────────────┼─────────────┬───────────────┐
                  │               │             │             │               │
            ┌─────▼─────┐   ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐  ┌─────▼─────┐
            │ NCRIS-1   │   │ NCRIS-2   │ │ NCRIS-3   │ │ NCRIS-4   │  │ NCRIS-N   │
            │ (active)  │   │ (active)  │ │ (active)  │ │ (active)  │  │ (active)  │
            └─────┬─────┘   └─────┬─────┘ └─────┬─────┘ └─────┬─────┘  └─────┬─────┘
                  │               │             │             │               │
                  └───────────────┴──────┬──────┴─────────────┴───────────────┘
                                         │
                  ┌──────────────────────┼─────────────────────────┐
                  │                      │                         │
            ┌─────▼─────┐         ┌──────▼──────┐          ┌───────▼───────┐
            │ Postgres  │         │   Redis     │          │  Object Store │
            │ Primary   │         │   Pub/Sub   │          │  (audit anchor│
            │  + 2 RR   │         │   + Cache   │          │   + e-PCR PDF)│
            └───────────┘         └─────────────┘          └───────────────┘
```

**Key swap-ins from the reference implementation:**

| Reference                      | Production                                              |
|--------------------------------|---------------------------------------------------------|
| JSON file storage              | Postgres 15+ with foreign keys, partitioned audit table |
| In-process EventBus            | Redis Pub/Sub (or NATS JetStream for stronger semantics)|
| Single-process Node            | 4+ instance fleet behind LB                             |
| HS256 JWT                      | RS256 JWT with KMS-backed signing key                   |
| `console`-style logger         | `pino` → Loki / ELK / Datadog                           |
| Local audit chain only         | Hourly anchor to S3 Object Lock + Auditor-General       |
| Static API key check           | API gateway with rate limiting (Kong / Apigee)          |

---

## Pre-deployment checklist

Before any non-reference deployment:

- [ ] Generated a **strong** JWT signing secret (≥ 32 random bytes, base64-encoded). Set `NCRIS_JWT_SECRET`.
- [ ] Generated a strong Ghana Card pepper. Set `NCRIS_GHANA_CARD_PEPPER`.
- [ ] All default seed user passwords have been **changed**. Default users are listed in `src/index.js` `seedDefaultUsers()` — they are dev convenience and must not exist in production.
- [ ] TLS certificate provisioned for the production domain (`ncris.gov.gh`) and the staging domain.
- [ ] Postgres provisioned with:
  - Hot standby with synchronous replication
  - Daily encrypted backups to off-site object storage
  - Point-in-time recovery enabled
  - Connection pool (PgBouncer recommended) sized for 4× node count
- [ ] Redis cluster provisioned (3-node minimum for HA pub/sub).
- [ ] Object storage bucket configured with Object Lock for audit anchoring.
- [ ] SMTP relay configured for operator alerts.
- [ ] PagerDuty / OpsGenie integration tested with a fake alert.
- [ ] Penetration test conducted by an independent firm; report reviewed and findings closed.
- [ ] Clinical Safety Case approved and signed off by the GhERIG Clinical Governance Committee.
- [ ] Data Protection Impact Assessment completed and signed off.
- [ ] DR runbook tested with an actual region failover drill.

---

## Configuration reference

NCRIS is configured exclusively through environment variables. No config files.

| Variable                        | Required | Default                  | Notes                                         |
|---------------------------------|----------|--------------------------|-----------------------------------------------|
| `PORT`                          | no       | `4000`                   | HTTP listen port                              |
| `HOST`                          | no       | `0.0.0.0`                | HTTP bind address                             |
| `NCRIS_JWT_SECRET`              | **yes**  | dev secret               | ≥ 32 bytes random; rotate annually            |
| `NCRIS_JWT_TTL_SEC`             | no       | `28800` (8h)             | Access token TTL in seconds                   |
| `NCRIS_GHANA_CARD_PEPPER`       | **yes**  | dev pepper               | ≥ 32 bytes; **never rotate** without re-keying|
| `NCRIS_DATA_DIR`                | no       | `./.data`                | Reference only; production uses Postgres     |
| `NCRIS_LOG_LEVEL`               | no       | `info`                   | trace, debug, info, warn, error, fatal        |
| `NCRIS_ENV`                     | no       | `reference`              | `reference`, `dev`, `staging`, `production`   |

In production replace the storage layer (`src/core/storage.js`) with a Postgres adapter. The `Collection` interface contract is documented in that file.

---

## Standard operating procedures

### SOP-001 · Deploy a new version

1. Tag the release in git: `git tag -s v1.x.y -m "Release v1.x.y"`.
2. Run the integration test suite: `node test/run.js`. **All 69 tests must pass.** A single regression blocks the deploy.
3. Build the container image: `docker build -t ncris:v1.x.y .`
4. Push to the registry.
5. Deploy to staging. Smoke-test for at least one full hour, including an end-to-end referral cycle.
6. Run database migrations on production (`npm run migrate`). **Migrations must be backward-compatible** — old NCRIS instances and new ones must both run against the same schema during the rolling deploy.
7. Roll instances one at a time. Monitor `/metrics` for error rate spikes after each instance.
8. Verify audit chain integrity post-deploy: `GET /api/v1/admin/audit/verify` must return `{ valid: true }`.
9. Tag the deployment in PagerDuty for context if anything breaks in the next 24h.

### SOP-002 · Verify audit chain integrity

```bash
curl -s -H "Authorization: Bearer $AUDITOR_TOKEN" \
  https://ncris.gov.gh/api/v1/admin/audit/verify | jq
```

Expected:
```json
{ "valid": true, "count": 12482937 }
```

If `valid: false`, **escalate immediately** to the Programme Office and Auditor-General. Do not write further audit events until the chain is investigated. The `brokenAt` field tells you the seq number at which integrity broke. Pull the surrounding 100 entries from the database and compare against the most recent chain anchor in object storage.

### SOP-003 · Rotate JWT signing secret

JWT secrets rotate annually, or immediately on suspicion of compromise.

1. Generate new secret: `openssl rand -base64 64`.
2. Add the new secret as `NCRIS_JWT_SECRET_NEXT` to all instances. NCRIS validates against both during the rotation window.
3. Wait 9 hours (max token TTL plus margin). All issued tokens are now signed with the old secret and will expire naturally.
4. Promote `NCRIS_JWT_SECRET_NEXT` to `NCRIS_JWT_SECRET`. Remove the next-slot.
5. Restart instances one at a time.
6. Monitor login error rate for 30 minutes. Spike indicates clients caching old tokens — they will recover on next login.

### SOP-004 · Issue a new partner API key

```http
POST /api/v1/admin/partners
Authorization: Bearer <admin-token>

{
  "name": "Donor M&E Platform",
  "contactEmail": "integrations@example.org",
  "scopes": ["referral:read:aggregate", "dispatch:read:aggregate"]
}
```

The response includes the API key **once**. Send it to the partner via an out-of-band secure channel (e.g., 1Password share link with 24-hour expiry, never email). NCRIS stores only the hash. Lost keys cannot be recovered — only revoked and re-issued.

### SOP-005 · Revoke a compromised partner API key

```http
DELETE /api/v1/admin/partners/{id}
Authorization: Bearer <admin-token>
```

This sets `active: false`. The next request from that key returns 401. The audit log captures the revocation.

### SOP-006 · Onboard a new facility

1. Add the facility to the registry via admin endpoint (or seed script if bulk).
2. Provision Portal user accounts for the facility's clinicians.
3. Initialise the capacity record with sensible defaults (zero ICU if no ICU, etc.).
4. Notify NECC operators that the new facility is online.
5. Audit event `facility.online` appears automatically on first capacity update.

### SOP-007 · Take a facility offline (for maintenance)

```http
PUT /api/v1/capacity/{code}
Authorization: Bearer <admin or facility coordinator token>

{ "status": "offline" }
```

NECC bed-search automatically excludes facilities with `status: offline`. Audit event `facility.offline` written. When maintenance ends, set status back to `open`.

### SOP-008 · Investigate a clinical safety incident

When a poor outcome is reported:

1. Pull all audit events for the patient: `GET /api/v1/admin/audit?targetId={patientId}` (or by facility + date range).
2. Check for `VITALS_DIVERGENCE` events in the timeline — these indicate a client engine running stale thresholds.
3. Pull the full referral envelope including `engineAssessment` for server-side authoritative assessment.
4. Verify the audit chain is intact for the period in question.
5. Generate the FHIR Bundle for the patient: `GET /fhir/r4/Patient/{id}` plus search-set bundles for ServiceRequest, Observation, AuditEvent.
6. Hand off to the Clinical Governance Committee.

### SOP-009 · Disaster recovery

**RTO target:** 30 minutes.
**RPO target:** 5 minutes (synchronous Postgres replication minimises data loss).

In a region-wide outage:

1. Confirm primary region is down (check from outside the region).
2. Promote standby region's Postgres replica.
3. Update DNS to point traffic to standby region (CNAME flip; TTL pre-set to 60s).
4. Restart NCRIS instances in standby region with `NCRIS_DATA_DIR` pointing at promoted replica.
5. Verify `/healthz` returns 200 from at least three instances.
6. Verify audit chain integrity.
7. Notify all subsystem owners that NCRIS endpoint has not changed (DNS) but they may need to re-establish WebSocket connections.

If audit chain is broken at the failover boundary, anchor the last known good chain hash to object storage immediately and start a new chain from a new genesis. Document the gap in the Auditor-General log.

### SOP-010 · Scale-out

NCRIS instances are stateless except for in-memory WebSocket subscriptions. To scale:

1. Add a new instance behind the load balancer.
2. Verify it joins the Redis pub/sub.
3. Verify it shows up in `/metrics` aggregation.
4. Smoke-test by routing 10% of traffic.
5. Ramp to full rotation.

The bottleneck at scale is Postgres write throughput. The audit table grows fastest. Production deployments partition the audit table by month and archive partitions older than 7 years to cold storage.

---

## Monitoring and alerts

### Critical alerts (page immediately)

| Alert                                    | Threshold                                | Action                                 |
|------------------------------------------|------------------------------------------|----------------------------------------|
| Service down                             | `/healthz` non-200 for 60 seconds        | Page on-call SRE                       |
| Audit chain invalid                      | `/api/v1/admin/audit/verify` returns invalid | Page Programme Office + Auditor-General |
| Postgres primary down                    | Connection failures > 30/min             | Page on-call DBA                       |
| Login failure rate spike                 | > 10× baseline for 5 min                 | Page security on-call (possible attack)|
| Engine version drift                     | Any `VITALS_DIVERGENCE` audit events     | Page clinical governance lead          |
| Storage latency P99                      | > 500ms for 5 min                        | Page on-call SRE                       |

### Warning alerts (notify, don't page)

| Alert                                    | Threshold                                |
|------------------------------------------|------------------------------------------|
| Token issuance rate spike                | > 3× baseline                            |
| WebSocket connection count drop          | > 30% drop in 5 min                      |
| 5xx response rate                        | > 1% for 5 min                           |
| Audit table partition approaching size limit | partition > 50 GB                    |

### Dashboards (Grafana)

- **National Picture** — referral volume by region, dispatch state distribution, escalation count
- **Engine Performance** — engine assessments per minute, divergence count, version distribution
- **Subsystem Health** — login rate per subsystem, WebSocket connection counts per subsystem
- **Postgres Health** — connection count, replication lag, slow query log
- **Audit** — audit events per minute, chain depth, last anchor age

---

## Security operations

### Incident classification

| Severity | Definition                                                | Examples                              |
|----------|-----------------------------------------------------------|---------------------------------------|
| SEV-0    | National service degradation or active data exposure      | Service down, audit chain broken      |
| SEV-1    | Confidentiality breach                                    | Partner key leaked, DB credentials exposed |
| SEV-2    | Authentication or authorisation flaw                      | Privilege escalation found in pen-test |
| SEV-3    | Suspicious activity warranting investigation              | Login spike from unexpected geography |
| SEV-4    | Information disclosure with no clinical/PII impact        | Verbose error response in production  |

SEV-0 and SEV-1 incidents page immediately and notify Auditor-General within 24 hours.

### Out-of-band access (break-glass)

In an emergency where the primary admin path is unavailable, a single break-glass admin account exists with credentials sealed in a physical safe at MoH HQ. Use of this account is automatically audited and triggers a SEV-0 incident review regardless of whether anything was wrong.

---

## Backup and retention

| Data                | Retention   | Location              | Notes                                |
|---------------------|-------------|-----------------------|--------------------------------------|
| Postgres backups    | 90 days     | S3 + Glacier (off-site) | Encrypted at rest                  |
| Audit chain anchors | Indefinite  | S3 Object Lock        | Cannot be deleted within retention   |
| Application logs    | 365 days    | Loki / ELK            | Then archived to cold storage        |
| Patient FHIR data   | Indefinite  | Postgres              | Subject to right-to-be-forgotten requests under DPA |
| WebSocket session logs | 30 days  | Loki                  | High volume, low retention           |

---

## Sunset and decommissioning

If GhERIG is decommissioned or replaced, NCRIS shutdown procedure:

1. 90 days notice to all subsystem owners and partners.
2. Read-only mode: all write endpoints return 410 Gone.
3. Final audit chain verification and anchor to immutable storage.
4. Export of all clinical data to the successor system in FHIR R4 Bundles.
5. 7-year retention of cold-storage backups for medico-legal access.
6. Final Auditor-General attestation of chain integrity.

---

*This runbook is reviewed quarterly by the GhERIG Programme Office and Operations team.*
