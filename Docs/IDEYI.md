# PREVIA CMS Ideas and Future Work

Documentation revision: 2026-11-08

This file contains future work and selected completion history. MediaSync behavior and operations are documented in [Architecture](Architecture.md) and [Backup & Recovery](Backup%20%26%20Recovery.md).

## Validation v2.0

Improve validation diagnostics and make error messages clearer and more actionable.

## Settings

Create a safer administrative configuration workflow around the existing Config sheet.

Goals:
- clearer configuration editing;
- validation;
- safer separation of ordinary configuration and secrets.

## Security v2

The Core → CMS HMAC secret already uses Script Properties. The Config sheet still contains sensitive legacy values such as GitHub/payment-related configuration.

Future work should evaluate migration of remaining secrets to secure storage with a migration plan.

## Authentication review

Review the long-term Telegram authentication path:
- stable provider identity and Customer ID;
- no duplicate Customer creation;
- session continuity;
- Favorites continuity;
- Order ownership continuity.

## Core ↔ CMS boundary review

Continue checking new functionality against:
```text
Core → business/domain rules
CMS  → persistence/infrastructure
```

## Testing improvements

Potential future improvements:
- Core → CMS integration tests;
- stronger concurrency tests;
- Favorites ownership tests;
- Order concurrency tests;
- document queue tests;
- publication queue tests.

The repository does not establish an Apps Script Execution API project binding.

## Mobile CMS UX

Improve Dashboard usability on smaller screens.

## Recently completed

### Customer Concurrency Fix — 2026-10-06

Completed:
- Script Lock around Customer get-or-create;
- provider lookup inside the lock;
- maximum-existing-ID generation;
- automated Customer tests.

Historical repository commit: `2cf815f`. Earlier documentation reported Telegram smoke tests; those external executions cannot be verified from GitHub.

### MediaSync V3 — 2026-11

Current code includes Git Data API media publication, checkpoint/continuation recovery, safe ref updates, audit mode and catalog/media separation. The owner reports Apps Script deployment version 71 (`Previa CMS V3 - Hardened Media Sync`); GitHub cannot verify the live deployment or installed triggers.
