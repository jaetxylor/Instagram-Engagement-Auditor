# V4 Commercial Foundation Architecture

V4 is the transition from a single-purpose browser script into a reusable analytics platform that can later power the community browser auditor, a Chrome extension, a web application, agency workspaces, and a mobile companion.

The current V3 browser auditor remains the stable public implementation while V4 is developed on a separate branch.

## Product principle

The analytics engine must not depend on where Instagram data came from.

```text
                       Shared analytics core
                  metrics · coverage · scoring
                           · reports · trends
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
  Browser collector       Official API connector      Import connector
  community / local       commercial web product     CSV / JSON / future
          │                       │                       │
          └───────────────────────┼───────────────────────┘
                                  │
             ┌────────────────────┼────────────────────┐
             │                    │                    │
       Community auditor      Web application      Extension / mobile
```

A connector produces normalized audit data. The core consumes normalized audit data and must never call Instagram-specific endpoints directly.

## Non-negotiable architecture rules

1. **Source-agnostic core** — calculations, classifications, coverage, trends, and report generation do not know about Instagram endpoint paths.
2. **Versioned audit schema** — every audit run is serializable and carries a schema version so old runs can be migrated later.
3. **Raw data separate from derived data** — preserve enough normalized raw observations to recalculate metrics when algorithms improve.
4. **Resumable execution** — long browser audits can checkpoint progress and resume after a refresh or accidental close.
5. **Read-only community collector** — the open-source collector does not follow, unfollow, like, comment, or DM.
6. **Commercial product does not depend on private endpoints** — browser-session collection is useful for community/local auditing, but the future paid product should be able to operate through supported connectors without changing the analytics engine.
7. **Single-file distribution is an output, not the source architecture** — users may still receive one copyable browser file while development happens in modules.
8. **Testable analytics** — every scoring formula, coverage rule, parser contract, and migration gets deterministic tests.
9. **Explainable results** — classifications expose the evidence and confidence behind them rather than returning opaque labels.
10. **No credential harvesting** — collectors use the authentication mechanisms of their host environment; the community auditor never asks users to paste passwords or session cookies into another service.

## Repository direction

```text
/apps
  /web                 Future SaaS dashboard
  /extension           Future Chrome extension
  /landing             Public copy-code / acquisition page

/src
  /core                Platform-independent analytics
  /connectors          Source-specific normalization
  /storage             Checkpoints and audit persistence
  /reporting           CSV / JSON / PDF abstractions
  /ui                  Shared presentation primitives where practical

/test                   Deterministic core tests and response fixtures
/dist                   Generated browser artifacts in a later migration
```

V4 begins by establishing `/src/core`, `/src/storage`, tests, and a versioned audit schema without replacing V3 on `main`.

## Normalized audit run

A run should be able to survive storage, export, import, cloud sync, and future algorithm changes.

High-level shape:

```text
AuditRun
├── schemaVersion
├── id
├── source
│   ├── type            browser | official_api | import
│   └── accountId
├── status              pending | running | paused | complete | failed
├── createdAt
├── updatedAt
├── completedAt
├── configuration
├── progress
│   ├── phase
│   ├── completedItems
│   └── totalItems
├── relationships
│   ├── followers
│   └── following
├── posts
├── observations
│   ├── likes
│   └── comments
├── coverage
├── metrics
├── classifications
└── diagnostics
```

The browser collector can store this structure in IndexedDB. A SaaS backend can store the same logical structure in a database. A mobile client can consume summaries of the same structure.

## Coverage model

V3 correctly distinguishes "not observed" from "definitively inactive". V4 keeps that principle but makes the evidence more explicit.

Coverage is calculated per modality:

- like identity coverage
- comment object coverage
- unique commenter coverage where available
- post-level combined coverage
- audit-level coverage

Replies should be tracked independently from root comments so a mismatch in Instagram's displayed comment total does not silently distort identity confidence.

Each classification should expose:

```text
classification
confidence.level
confidence.percent
confidence.reasons[]
observed.likes
observed.comments
observed.postsEngaged
coverage.likes
coverage.comments
```

## Persistence and resume

Long-running local audits should checkpoint after meaningful units of work, especially after each completed post.

A resume flow can therefore show:

```text
Previous audit found
18 / 28 posts completed

[ Resume audit ]   [ Start over ]
```

Checkpoint storage must be replaceable. IndexedDB is the browser implementation; a future cloud implementation can satisfy the same logical storage contract.

## Commercial boundary

The repository remains useful as an open-source acquisition and community product.

### Community / open-source

- local browser auditor
- core engagement metrics
- relationship analysis
- confidence and coverage diagnostics
- local resume
- CSV / JSON exports

### Future proprietary SaaS

- authentication and organizations
- historical cloud storage
- agency/client workspaces
- billing and entitlements
- scheduled ingestion
- scheduled reports
- client portals and white-label reporting
- alerts and anomaly detection
- cross-account benchmarks
- team permissions and audit logs
- AI-generated summaries based on stored analytics

The commercial moat should be longitudinal data, workflow, reporting, benchmarking, and collaboration — not private endpoint access.

## Planned migration stages

### V4.0 — Foundation

- shared statistics, engagement, coverage, and classification modules
- versioned normalized audit schema
- checkpoint storage abstraction
- deterministic unit tests
- CI test enforcement

### V4.1 — Collector migration

- move Instagram web request logic behind a connector boundary
- normalize returned relationship/post/engagement data into the V4 schema
- adaptive retry/backoff and request timeouts
- resume incomplete post scans

### V4.2 — Product UI

- Quick / Deep / Custom scan modes
- simplified Overview
- progressive disclosure for technical diagnostics
- compact default results table with expandable account details
- accessible status chips and audit-quality summary

### V4.3 — Distribution

- bundle modular source into one copyable browser artifact
- preserve GitHub Pages one-click copy flow
- publish migration notes and stable versioning

### Later commercial milestones

- Chrome extension client
- account system and cloud history
- supported professional-account connector for the web product
- agency workspaces and billing
- scheduled reports and alerts
- mobile companion

## Definition of success for V4

V4 is successful when the same normalized audit data can be processed by the shared core regardless of whether it was produced by the browser collector, an import, or a future official connector — and the current community experience remains simple enough to copy, run, and understand.