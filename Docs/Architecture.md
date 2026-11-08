# PREVIA CMS Architecture

Documentation revision: 2026-11-08
System status: Production
Repository checkpoint: `fa347b0ff3c3bf8a06d3cbb8a85ae27bbb9a0551`

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

If there are no new products, the implementation can publish `data.js` without the new-product preparation stages. `validateImages()` checks Drive image filenames and duplicate image numbers; it does not start MediaSync, hash files or call GitHub. `publishDataJS()` reads Drive inventory and the published manifest to preserve image paths, but does not start MediaSync.

The catalog pipeline stops on errors, but it is not a database transaction. It spans Google Sheets, Google Drive and GitHub, so a failure does not automatically roll back every earlier external operation. Photo synchronization is a separate operation.

## Media synchronization

Google Drive is the source of product images.

~~~text
Google Drive
    ↓
MediaSync
    ↓
GitHub published media
~~~

MediaSync V3 inventories Drive for catalog SKUs, reads the GitHub branch/tree and `media-manifest.json`, then plans file and manifest changes. A missing SKU folder is recorded separately and its previous manifest entry is retained; other Drive read failures stop planning. Invalid or truncated GitHub trees stop before destructive planning.

Normal mode uses a metadata fast path only when Drive ID, size and update timestamp match the prior manifest and the manifest GitHub blob SHA matches the current tree SHA. Otherwise it reads Drive bytes and calculates the Git blob SHA-1 (`SHA1("blob " + byteLength + NUL + bytes)`). A legacy manifest without `githubSha` requires hashing but does not itself force a photo upload. Audit mode bypasses the metadata fast path for matching names and re-hashes their Drive bytes. The planner can upload new/changed files, delete extra files within inventoried SKUs with successfully read folders, and update the manifest. It is not image decoding or a repository-wide cleanup of unknown paths.

GitHub publication stages blobs, creates one tree and one commit for image/manifest changes, then updates the branch ref with `force:false` after rechecking HEAD. No-op plans create no commit. Conflict, checkpoint, continuation and failure details are in [Backup & Recovery](Backup%20%26%20Recovery.md).

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

Dashboard.html is presentation/interaction UI. Server-side modules perform the actual operations. It has a Refresh Images action, but no Media Audit setup/run control. The spreadsheet menu provides **Setup Media Audit Worker**; `startMediaSyncAudit()` is also callable from the Apps Script function selector.

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

Repository checkpoint: `fa347b0ff3c3bf8a06d3cbb8a85ae27bbb9a0551` (2026-11-06). The owner reports Apps Script deployment version 71, `Previa CMS V3 - Hardened Media Sync`; GitHub cannot verify the live deployment or installed triggers.

Media Audit code uses a time-driven `everyDays(30)` trigger after deleting existing triggers with handler `startMediaSyncAudit`. Setup errors propagate; simultaneous setup calls are not lock-protected and could race. The actual trigger, its next run and execution history require a check in Apps Script. The audit recomputes Git blob SHA for same-name current files and can publish differences; it is not read-only. The automated MediaSync suite tests audit hashing but does not test trigger installation or live schedule behavior.

CMS is not bound to a GCP project for Execution API use.
