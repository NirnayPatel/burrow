# E2E UAT Results

**Run:** against `http://localhost:8787` over the seeded Northwind org.
**Result:** 45 PASS · 0 WARN · 0 FAIL (of 45 checks).

| Area | Check | Status | Detail |
|---|---|---|---|
| Identity | GET /api/me | ✅ | role=admin, org=29fdbe2c |
| Identity | GET /api/org | ✅ | /api/org → 200 ok |
| Identity | GET /api/onboarding | ✅ | /api/onboarding → 200 ok |
| Dashboard | GET /api/dashboard | ✅ | needsYou=1, attention=1, suggestions=0, activity=12 |
| Specs | GET /api/specs | ✅ | /api/specs → 6 rows |
| Specs | GET /api/specs/:id | ✅ | /api/specs/46ebafc5-b76a-461c-a90a-0ce0a7e7d557 → 200 ok |
| Specs | GET /api/specs/:id/breakdown | ✅ | /api/specs/46ebafc5-b76a-461c-a90a-0ce0a7e7d557/breakdown → 200 ok |
| Specs | GET /api/specs/:id/insights | ✅ | /api/specs/46ebafc5-b76a-461c-a90a-0ce0a7e7d557/insights → 200 ok |
| Specs | GET /api/specs/:id/activity | ✅ | /api/specs/46ebafc5-b76a-461c-a90a-0ce0a7e7d557/activity → 2 rows |
| Specs | GET /api/specs/:id/timeline | ✅ | /api/specs/46ebafc5-b76a-461c-a90a-0ce0a7e7d557/timeline → 200 ok |
| Specs | GET /api/specs/:id/agents | ✅ | /api/specs/46ebafc5-b76a-461c-a90a-0ce0a7e7d557/agents → 200 ok |
| Search | GET /api/search?q=billing | ✅ | 3 results |
| Search | empty q → [] | ✅ | 0 (expect 0) |
| Insights | GET /api/insights/roadmap | ✅ | insights=null (no-key degrade) |
| Insights | GET /api/insights/backlog | ✅ | insights=null (no-key degrade) |
| Teams | GET /api/teams | ✅ | /api/teams → 3 rows |
| Teams | GET /api/teams/:id/members | ✅ | /api/teams/22da61c3-bbee-4447-ba9e-075ffdf9f839/members → 2 rows |
| Teams | GET /api/teams/:id/specs | ✅ | /api/teams/22da61c3-bbee-4447-ba9e-075ffdf9f839/specs → 3 rows |
| Roadmap | GET /api/initiatives | ✅ | /api/initiatives → 5 rows |
| Roadmap | GET /api/initiatives/:id/specs | ✅ | /api/initiatives/6ffe2232-e06b-4325-895b-8ce38de8266c/specs → 0 rows |
| Goals | GET /api/goals | ✅ | /api/goals → 3 rows |
| Goals | GET /api/goals/:id/links | ✅ | /api/goals/d4144956-257b-4387-91b7-332b3e3ee3e0/links → 1 rows |
| Feedback | GET /api/feedback | ✅ | /api/feedback → 10 rows |
| Feedback | GET /api/feedback/themes | ✅ | /api/feedback/themes → 3 rows |
| Market | GET /api/competitors | ✅ | /api/competitors → 3 rows |
| Market | GET /api/market-signals | ✅ | /api/market-signals → 5 rows |
| Context | GET /api/context | ✅ | /api/context → 4 rows |
| Context | GET /api/context/:id | ✅ | /api/context/bcd2a142-05db-49d8-9fac-5c3da313e061 → 200 ok |
| Connections | GET /api/connections | ✅ | /api/connections → 2 rows |
| Automations | GET /api/routines | ✅ | /api/routines → 3 rows |
| Automations | GET /api/routines/:id/runs | ✅ | /api/routines/cf0b396a-20b6-4a19-ab0e-b83be9762b1b/runs → 0 rows |
| Library | GET /api/skills | ✅ | /api/skills → 2 rows |
| Library | GET /api/skills/:slug | ✅ | /api/skills/draft-spec-from-signal → 200 ok |
| Library | GET /api/agents | ✅ | /api/agents → 2 rows |
| Library | GET /api/agents/:slug | ✅ | /api/agents/feedback-triage → 200 ok |
| Misc | GET /api/playbook | ✅ | /api/playbook → 3 rows |
| Misc | GET /api/keys | ✅ | /api/keys → 0 rows |
| Misc | GET /api/activity | ✅ | /api/activity → 12 rows |
| Misc | GET /api/chat/threads | ✅ | /api/chat/threads → 1 rows |
| Misc | GET /api/collab-token | ✅ | token issued |
| Write | POST /api/routines | ✅ | created e374a6a6 |
| Write | DELETE /api/routines/:id | ✅ | cleanup HTTP 200 |
| Write | PATCH initiative horizon (move + revert) | ✅ | later→now→later |
| Write | POST signoff approve + clear | ✅ | SPEC-3: approve=201, clear=201 |
| Write | skill 409 conflict contract | ✅ | stale push → HTTP 409 (expect 409) |
