# PREVIA CMS

Google Apps Script based Content Management System for the PREVIA Vintage boutique.

Documentation revision: 2026-10-06
Status: Production

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

Media refresh:

~~~text
Google Drive → MediaSync → GitHub
~~~

## Testing

Node tests live under tests/.

Customer concurrency suite:
8 tests, 8 passed, 0 failed.

tests/ is excluded from Apps Script upload by .claspignore.

## Development workflow

~~~text
Understand
 ↓
Implement
 ↓
Test
 ↓
Review diff
 ↓
Git commit
 ↓
Git push
 ↓
clasp push
 ↓
Update intended deployment
 ↓
Production smoke test
~~~

GitHub commits and Apps Script deployment versions are separate.

## Current checkpoint

As of 2026-10-06:
- GitHub main: 2cf815f;
- Customer concurrency fix: complete;
- Customer tests: 8/8;
- production Apps Script deployment: @68;
- real Telegram smoke tests passed;
- working tree was clean after the fix.

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
