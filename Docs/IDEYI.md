# PREVIA CMS Ideas and Future Work

Documentation revision: 2026-11-08

This file contains future work and selected completion history. MediaSync operations are documented in [Architecture](Architecture.md) and [Backup & Recovery](Backup%20%26%20Recovery.md).

## Validation v2.0

Improve validation diagnostics and make error messages clearer and more actionable.

## Settings

Create a safer administrative configuration workflow around the existing Config sheet.

Goals:
- clearer configuration editing;
- validation;
- safer separation of ordinary configuration and secrets.

## Security v2

The Core → CMS HMAC secret already uses Script Properties.

The Config sheet still contains sensitive legacy values such as GitHub/payment-related configuration.

Future work should evaluate migration of remaining secrets to secure storage with a migration plan.

## Authentication review

Review the long-term Telegram authentication path.

Requirements:
- stable provider identity;
- stable Customer ID;
- no duplicate Customer creation;
- session continuity;
- Favorites continuity;
- Order ownership continuity.

## Core ↔ CMS boundary review

Continue checking new functionality against:

~~~text
Core → business/domain rules
CMS  → persistence/infrastructure
~~~

## Testing improvements

Potential future improvements:
- Core → CMS integration tests;
- stronger concurrency tests;
- Favorites ownership tests;
- Order concurrency tests;
- document queue tests;
- publication queue tests.

The current CMS is not configured for Apps Script Execution API testing through GCP.

## Mobile CMS UX

Improve Dashboard usability on smaller screens.

## Recently completed

### Customer Concurrency Fix — 2026-10-06

Completed:
- Script Lock around Customer get-or-create;
- provider lookup inside the lock;
- maximum-existing-ID generation;
- automated Customer tests;
- real Telegram smoke tests.

Result:
8/8 automated tests passed.

Historical Git commit:
2cf815f fix: make customer creation atomic

The owner reports Apps Script deployment version 71, superseding the former @68 reference; GitHub cannot verify the live deployment.

### MediaSync V3 — 2026-11

Repository checkpoint `fa347b0ff3c3bf8a06d3cbb8a85ae27bbb9a0551` contains Git Data API publication, checkpoint/continuation recovery, safe ref updates, audit mode and catalog/media separation. The owner reports deployment 71 (`Previa CMS V3 - Hardened Media Sync`). Live deployment and trigger state are not verifiable from GitHub.
