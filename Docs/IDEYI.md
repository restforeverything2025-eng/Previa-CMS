# PREVIA CMS Ideas and Future Work

Documentation revision: 2026-10-06

This file contains future work only.

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

Git commit:
2cf815f fix: make customer creation atomic

Production:
@68
