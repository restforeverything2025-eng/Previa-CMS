# PREVIA CMS Architecture

Documentation revision: 2026-10-06
System status: Production

## Purpose

PREVIA CMS is the infrastructure and persistence layer of the PREVIA ecosystem. It connects PREVIA Core with Google Sheets, Google Drive and GitHub.

## System boundary

~~~text
PREVIA Vintage App
        ↓
   PREVIA Core
        ↓
 authenticated CMS API
        ↓
    PREVIA CMS
     ↙       ↘
 Google Sheets  Google Drive
        ↘     ↙
          GitHub
             ↓
        public website
~~~

Core owns shared domain/business rules. CMS owns persistence, storage, publication and Apps Script infrastructure.

## Core principles

- One module = one responsibility.
- One authoritative owner for each type of data.
- Core business rules must not be duplicated in CMS.
- Persistence-level atomicity belongs at the storage boundary when required.
- HTTP authentication is verified before request dispatch.
- Do not create competing doGet/doPost entry points.
- Avoid circular dependencies.
- Prefer small, reviewable changes.

## Data ownership

| Data | Authoritative store |
|---|---|
| Products | Google Sheets / Products |
| Product images | Google Drive |
| Customers | Google Sheets / Customers |
| Favorites | Google Sheets / Favorites |
| Orders | Google Sheets / Orders |
| Order items | Google Sheets / OrderItems |
| Publication history | Google Sheets / PublicationJournal |
| Project configuration | Google Sheets / Config |
| Public catalog | GitHub / data.js |
| Published media | GitHub / images and media-manifest.json |
| Core → CMS HMAC secret | Apps Script Script Properties |

GitHub is the publication target for public catalog/media, not the business-data source of truth.

## Customer concurrency

Customer get-or-create is atomic at the CMS persistence boundary.

~~~text
request
  ↓
CustomerEndpoint
  ↓
CustomerService.getOrCreateCustomer()
  ↓
Script Lock
  ↓
findByProvider
  ↓
existing? ── yes → return
  │
  no
  ↓
generate next Customer ID
  ↓
create row
  ↓
release lock
~~~

Customer IDs use C000001, C000002 and so on. The generator uses the maximum existing numeric Customer ID rather than row count.

The lock covers lookup, ID generation and creation. This protects the Customers sheet from concurrent creation races.

Validation completed 2026-10-06:
- Customer automated tests: 8/8 passed.
- Two different Telegram identities tested concurrently.
- One Telegram identity tested from two devices.
- No duplicate Customer was created for the same provider identity.

## Core → CMS authentication

WebApp verifies authenticated Core envelopes before dispatching Customer and Favorites requests.

Order requests use the same centralized implementation in Api/OrderAuthentication.js through the order-specific wrapper.

The secret is read from Script Properties under PREVIA_CORE_HMAC_SECRET.

The browser must never receive this secret.

## HTTP entry point

WebApp.js is the single production HTTP entry point.

It provides:
- doGet for the CMS UI;
- doPost for API dispatch;
- Customer;
- Favorites;
- Orders;
- Product lookup;
- publication/refresh helpers.

Do not add another doGet or doPost.

## Publication

Publish.js orchestrates the catalog pipeline:

~~~text
Read Products
 ↓
Detect new products
 ↓
Assign IDs
 ↓
Assign SKUs
 ↓
Normalize
 ↓
Validate Incoming
 ↓
Validate Catalog
 ↓
Prepare Product Folders
 ↓
Validate Images
 ↓
Generate data.js
 ↓
Write generated fields
 ↓
Cleanup Incoming
 ↓
Journal / Report
~~~

If there are no new products, the implementation can publish data.js without the new-product preparation stages.

The pipeline stops on errors, but it is not a database transaction. It spans Google Sheets, Google Drive and GitHub, so a failure does not automatically roll back every earlier external operation.

## Media synchronization

Google Drive is the source of product images.

~~~text
Google Drive
    ↓
MediaSync
    ↓
GitHub published media
~~~

MediaSync reads Drive state, reads the GitHub repository tree, compares media, uploads changed/new files, removes orphan published files and updates media-manifest.json.

This is Drive → GitHub synchronization, not a bidirectional media store.

## Dashboard

Dashboard is an administrative workspace, not a read-only statistics page.

It currently:
- displays product and media statistics;
- displays the last publication result;
- launches Publish;
- launches Archive;
- launches Restore;
- launches Refresh Images.

Dashboard.html is presentation/interaction UI. Server-side modules perform the actual operations.

## Orders

Core owns order business rules. CMS owns persistence and storage-side concurrency.

Orders.js currently:
- validates persistence schema and payload;
- checks duplicate order IDs;
- checks product availability;
- acquires a script lock;
- reserves products;
- persists Orders and OrderItems using Sheets batchUpdate;
- assigns public order numbers;
- initializes asynchronous document/publication state.

PDF generation is outside the critical order transaction.

## Order documents

Order creation initializes document state. A separate worker later generates the PDF and stores its URL/status.

Document generation failure must not turn an already persisted order into a failed order.

## Documentation rule

Documentation describes architecture and stable contracts. Code remains the implementation source of truth.

When documentation and code disagree, inspect the current code first and then update documentation.

## Current operational checkpoint

As of 2026-10-06:
- GitHub main: 2cf815f.
- Customer concurrency fix: complete.
- Production Apps Script deployment: @68.
- Customer tests: 8/8.
- Real Telegram smoke tests: passed.
- CMS is not bound to a GCP project for Execution API use.
