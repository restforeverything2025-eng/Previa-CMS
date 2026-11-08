# PREVIA CMS

Google Apps Script based Content Management System for the PREVIA Vintage boutique.

Documentation revision: 2026-11-08
Status: Production
Repository checkpoint: `fa347b0ff3c3bf8a06d3cbb8a85ae27bbb9a0551` (2026-11-06)
Apps Script deployment: owner-reported version 71, `Previa CMS V3 - Hardened Media Sync` (not verifiable through GitHub)

## Overview

PREVIA CMS is the infrastructure and persistence layer of the PREVIA ecosystem.

It connects:
- Google Sheets;
- Google Drive;
- PREVIA Core;
- GitHub;
- the public PREVIA website.

Principles:
- Simple;
- Reliable;
- One Module = One Responsibility;
- clear Core ↔ CMS boundary;
- Google Sheets as authoritative business-data storage;
- secrets outside frontend code;
- test before production.

## Main responsibilities

### Catalog
Product management, IDs, SKUs, normalization, validation and publication.

### Media
Google Drive image management, GitHub publication and media synchronization.

### Customer
Customer registry, provider identity lookup, atomic get-or-create and Customer ID generation.

### Favorites
Customer favorites persistence and duplicate prevention.

### Orders
Orders/OrderItems persistence, product reservation, public order numbers, document queue and catalog publication queue.

### Administration
Dashboard, Publish, Archive, Restore, Refresh Images and publication journal.

## Technology

- Google Apps Script;
- Google Sheets;
- Google Drive;
- GitHub;
- Git;
- clasp;
- Node.js tests;
- VS Code.

## Architecture

~~~text
PREVIA Vintage App
        ↓
    PREVIA Core
        ↓
 authenticated CMS API
        ↓
    PREVIA CMS
     ↙       ↘
 Sheets       Drive
     ↘       ↙
       GitHub
          ↓
      Public site
~~~

## API

WebApp.js is the single HTTP entry point.

Current API areas:
- Customer;
- Favorites;
- Orders;
- Product lookup.

Customer/Favorites requests require authenticated Core envelopes.

Order requests use the centralized Core HMAC implementation.

## Customer

Customers are stored in the Customers sheet.

Columns:
customerId, provider, providerId, displayName, username, createdAt, updatedAt, status.

IDs use C000001, C000002 and so on.

Creation is protected by Apps Script Script Lock.

## Favorites

Favorites are stored in Favorites and keyed by customerId.

## Orders

Orders are stored in Orders and OrderItems.

CMS provides persistence and storage-side concurrency protection. Order domain rules remain in Core.

## Order documents

Order documents are generated asynchronously after the order is persisted.

## Publication

~~~text
Products
 ↓
ID
 ↓
SKU
 ↓
Normalize
 ↓
Validate
 ↓
Prepare folders
 ↓
Validate images
 ↓
Generate data.js
 ↓
Write generated fields
 ↓
Cleanup
 ↓
Journal / report
~~~

Catalog publication and photo synchronization are independent operations. Publish Boutique may read Drive inventory and the published media manifest to preserve image paths in `data.js`, but it does not run MediaSync.

Refresh Images runs MediaSync V3:

~~~text
Google Drive → MediaSync V3 → GitHub images + media-manifest.json
~~~

See [Architecture](Architecture.md), [Publish Pipeline](Publish%20Pipeline.md) and [Backup & Recovery](Backup%20%26%20Recovery.md) for the sync, audit and recovery details.

## Testing

Node tests live under tests/.

Media-related suites include `tests/media-sync.test.js`, `tests/github-git-data.test.js` and `tests/catalog-media-independence.test.js`. Other suites cover Customer, Orders, order documents and product reservation.

tests/ is excluded from Apps Script upload by .claspignore.

## Development workflow

~~~text
Understand → implement → test → review diff → commit on a topic branch → push branch → open Pull Request → review/merge separately.
~~~

Apps Script source and deployment versions are separate from Git commits. The repository does not verify the live deployment or whether the Media Audit trigger is installed.

GitHub commits and Apps Script deployment versions are separate.

## Current checkpoint

As of 2026-11-08:
- GitHub `main`: `fa347b0ff3c3bf8a06d3cbb8a85ae27bbb9a0551`;
- MediaSync V3 implementation is present in the repository;
- the owner reports Apps Script deployment version 71 (`Previa CMS V3 - Hardened Media Sync`); GitHub cannot verify the live deployment;
- the repository does not show whether the 30-day Media Audit trigger is installed.

Architecture:
Stable

Development:
Active

## Next areas

- validation diagnostics;
- remaining secret storage review;
- Core ↔ CMS boundary review;
- integration/concurrency testing;
- long-term Telegram authentication review.
