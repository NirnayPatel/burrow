# UAT Pass 2 Results

**Run:** against `http://localhost:8810` over the seeded Northwind org.
**Date:** 2026-07-01
**Result:** 34 PASS · 0 WARN · 0 FAIL (of 34 checks).

| Area | Check | Status | Detail |
|---|---|---|---|
| Identity | POST /api/onboarding/complete | ✅ | HTTP 200 |
| RBAC | Cross-org: viewer and admin have different orgIds | ✅ | viewer=d9bd76f6, admin=30e0e1be |
| RBAC | Cross-org: viewer cannot see admin org's specs | ✅ | viewer=1 specs, admin=34 specs |
| RBAC | Cross-org: viewer cluster gets their own org data only | ✅ | HTTP 400: no feedback to cluster (expect: empty org) |
| RBAC | Cross-org: viewer cannot fetch Northwind spec by ID | ✅ | HTTP 404 (expect 404 — not in viewer's org) |
| Data Consistency | displayId race: 5 concurrent creates → no duplicate SPEC-N | ✅ | displayIds=SPEC-35,SPEC-38,SPEC-37,SPEC-39,SPEC-41 dupes=none |
| Data Consistency | displayId monotonic: all IDs unique and non-null | ✅ | 5/5 created with unique IDs |
| Data Consistency | theme.specId set after create-spec | ✅ | theme "Multiplayer + self-hosting dri" → specId=9c82df54 |
| Teams | POST /api/teams/:id/members | ✅ | HTTP 201 |
| Teams | DELETE /api/teams/:id/members/:userId | ✅ | HTTP 200 |
| Feedback | DELETE /api/feedback/:id (not found → 404) | ✅ | HTTP 404 (expect 404) |
| Feedback | DELETE /api/feedback/:id (real item → 200) | ✅ | HTTP 200 |
| Feedback | POST /api/feedback/cluster (no-key → 422) | ✅ | HTTP 422 (422=no key, 400=no feedback items) |
| Ingest | Feedback dedup: same externalId not inserted twice | ✅ | first={"inserted":1,"skipped":0} second={"inserted":0,"skipped":1} |
| Specs | POST /api/specs/:id/assist (no-key → 422) | ✅ | HTTP 422 (422=no key, 200=streaming) |
| Specs | POST /api/specs/:id/breakdown (no-key → 422) | ✅ | HTTP 422 (422=no key) |
| Specs | POST /api/specs/:id/evaluate (no-key → 422) | ✅ | HTTP 422 (422=no key) |
| Specs | DELETE /api/specs/:id/breakdown/latest (1 gen → 400) | ✅ | HTTP 400 (400=only 1 gen or no breakdown) |
| Specs | PATCH /api/specs/:id with invalid status | ✅ | HTTP 400 (400=validated, 200=permissive — check schema) |
| CLI | POST /api/cli/device (get code) | ✅ | HTTP 200 code=CNJU-SUOW |
| CLI | POST /api/cli/device/token (pending → 202 or token) | ✅ | HTTP 202  |
| Connections | POST /webhooks/:connectionId (callback) | ✅ | HTTP 200 (400=no mapping, 200=updated) |
| Connections | POST push without breakdown → 400 (not 500) | ✅ | HTTP 400 (expect 400 "no breakdown to push") |
| Chat | POST /api/chat/threads/:id/confirm (no call → 404) | ✅ | HTTP 404 (expect 404) |
| Library | PUT /api/agents/:slug (create) | ✅ | HTTP 200 |
| Library | DELETE /api/agents/:slug | ✅ | HTTP 200 |
| Library | PUT /api/skills/:slug (create) | ✅ | HTTP 200 |
| Library | DELETE /api/skills/:slug | ✅ | HTTP 200 |
| Search | search?q=billing returns billing-related results | ✅ | 3 results, 3 have "billing" in label |
| Insights | GET /api/insights/roadmap shape | ✅ | keys=insights |
| Insights | GET /api/insights/backlog shape | ✅ | keys=insights |
| Dashboard | dashboard has expected keys | ✅ | keys=user,counts,attention,agentsAtWork,suggestions,recentActivity |
| Dashboard | dashboard.counts.needsYou >= 0 | ✅ | needsYou=0 |
| Goals | POST /api/goals/:id/links with invalid entityType → 400 | ✅ | HTTP 400 (expect 400) |