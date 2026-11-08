# PREVIA CMS Roadmap

Documentation revision: 2026-11-08

## Completed

### Dashboard v2.0

COMPLETED.

Current Dashboard provides:
- statistics;
- publication information;
- Publish;
- Archive;
- Restore;
- Refresh Images.

### Customer Concurrency Fix

COMPLETED — 2026-10-06.

Implemented:
- script lock around Customer get-or-create;
- provider lookup inside lock;
- maximum-existing-ID generation;
- Customer tests;
- real Telegram smoke tests.

Validation:
8/8 automated tests passed.
Two real concurrency scenarios passed.

Historical Git commit:
2cf815f fix: make customer creation atomic

The owner now reports Apps Script deployment version 71; GitHub cannot verify the live deployment.

### MediaSync V3 — Hardened Media Sync

Implemented in repository checkpoint `fa347b0ff3c3bf8a06d3cbb8a85ae27bbb9a0551`:
- Git Data API publication with one commit for image and manifest changes;
- checkpoint/continuation, ownership and bounded recovery;
- missing-folder, incomplete-inventory and branch-conflict safeguards;
- independent catalog and media pipelines;
- audit mode and code for a 30-day time-driven trigger.

The repository confirms trigger setup code, not the live trigger installation or schedule.

## Next milestones

### Validation v2.0

Improve diagnostics and make validation errors clearer.

### Settings

Create a controlled administrative workflow around Config.

### Security v2

Review remaining sensitive values in Config.

Core → CMS HMAC secret already uses Script Properties.

### Core ↔ CMS boundary review

Ensure:
Core → business/domain rules
CMS → persistence/infrastructure

Avoid duplicated rules.

### Authentication review

Review long-term Telegram authentication while preserving provider identity, Customer ID, sessions, Favorites and Order ownership.

### Integration and concurrency testing

Expand testing for:
- Core → CMS authenticated requests;
- repeated Customer requests;
- Favorites ownership;
- Order concurrency;
- reservation concurrency;
- document queue;
- publication queue.

Do not add GCP/Execution API infrastructure solely for one-off testing.

### Mobile CMS UX

Improve Dashboard usability on smaller screens.

## Roadmap rule

Future items are not implemented functionality. Move completed work to Completed.
