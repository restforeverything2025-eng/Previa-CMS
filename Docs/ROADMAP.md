# PREVIA CMS Roadmap

Documentation revision: 2026-11-08

## Completed

### Dashboard v2.0
Completed. Dashboard provides statistics, publication information and Publish, Archive, Restore and Refresh Images actions.

### Customer Concurrency Fix
Completed 2026-10-06:
- Script Lock around get-or-create;
- provider lookup inside lock;
- maximum-existing-ID generation;
- automated Customer tests and owner-reported Telegram smoke tests.

Historical source checkpoint: `2cf815f` (the current repository checkpoint is later).

### MediaSync V3 — Hardened Media Sync
Implemented in the repository checkpoint `fa347b0ff3c3bf8a06d3cbb8a85ae27bbb9a0551`:
- Git Data API publication of media and manifest through one commit;
- checkpoint, continuation, ownership and bounded recovery;
- safe handling of missing folders, incomplete inventories and GitHub branch conflicts;
- catalog/media publication independence;
- optional audit mode and code for a 30-day time-driven audit trigger.

The GitHub source confirms the trigger setup implementation, not that it is installed in the live Apps Script project. Deployment version 71 is owner-reported and not verifiable from this repository.

## Next milestones

### Validation diagnostics
Improve validation messages where a concrete usability need is identified.

### Settings and security
Create a controlled administrative workflow around Config and review remaining sensitive legacy values. The Core → CMS HMAC secret already uses Script Properties.

### Core ↔ CMS boundary
Keep shared domain/business rules in PREVIA Core and persistence/infrastructure in CMS.

### Authentication review
Review the long-term Telegram authentication path while preserving provider identity, Customer ID, sessions, Favorites and Order ownership.

### Integration and concurrency testing
Continue targeted coverage for authenticated Core requests, Favorites ownership, order/reservation concurrency, document queue and publication queue.

### Mobile CMS UX
Improve Dashboard usability on smaller screens.

## Roadmap rule

Future items are not implemented functionality. Move completed work to Completed only when supported by code/tests or explicitly label owner-reported operational facts.
