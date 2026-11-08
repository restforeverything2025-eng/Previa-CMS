# PREVIA CMS Architecture

Documentation revision: 2026-11-08  
Repository checkpoint: `fa347b0ff3c3bf8a06d3cbb8a85ae27bbb9a0551`

## Purpose and system boundary

PREVIA CMS is the infrastructure and persistence layer between PREVIA Core and Google Sheets, Google Drive and GitHub. Core owns shared domain/business rules; CMS owns persistence, storage, publication and Apps Script infrastructure.

```text
PREVIA Vintage App → PREVIA Core → authenticated CMS API → PREVIA CMS
                                                              ↙       ↘
                                                           Sheets     Drive
                                                              ↘       ↙
                                                               GitHub → public site
```

## Data ownership

| Data | Authoritative store |
|---|---|
| Products and configuration | Google Sheets |
| Product images | Google Drive |
| Customers, Favorites, Orders and OrderItems | Google Sheets |
| Publication history | Google Sheets / PublicationJournal |
| Public catalog | GitHub / `data.js` |
| Published media | GitHub / `images/{sku}/...` and `media-manifest.json` |
| Core → CMS HMAC secret | Apps Script Script Properties |

GitHub is a publication target, not the business-data source of truth.

## Core principles

- One module = one responsibility; avoid circular dependencies.
- Keep one authoritative owner for each kind of data.
- Do not duplicate Core business rules in CMS.
- Put persistence atomicity at the storage boundary where required.
- Verify HTTP authentication before request dispatch.
- Keep `WebApp.js` as the only production `doGet`/`doPost` entry point.
- Prefer small, reviewable changes.

## HTTP and customer concurrency

`WebApp.js` is the single HTTP entry point for the CMS UI and API dispatch. Customer and Favorites requests require authenticated Core envelopes. Order requests use centralized authentication in `Api/OrderAuthentication.js`; the HMAC secret is read from Script Properties and must not reach the browser.

Customer get-or-create uses Apps Script Script Lock around lookup, maximum-existing-ID generation and row creation. Customer IDs use the `C000001` sequence. This protects persistence from duplicate creation races.

## Independent publication processes

### Catalog: Publish Boutique

`Publish.js:publishBoutique()` handles new-product IDs/SKUs, normalization, catalog and incoming validation, folder preparation, image-name validation, `data.js` generation, generated sheet fields and incoming cleanup. With no new products it can publish `data.js` directly.

`Validation.js:validateImages()` checks Drive image filenames and duplicate image numbers. It does not call MediaSync or GitHub. `publishDataJS()` reads Drive inventory and the published manifest to build image paths, but does not run a photo synchronization.

### Photos: Refresh Images

The menu and Dashboard refresh action lead to `refreshMedia()`/`refreshImages()`, which call `syncMedia()`. MediaSync publishes Drive images and `media-manifest.json` to GitHub independently of catalog publication.

See [Publish Pipeline](Publish%20Pipeline.md) for exact flows.

## MediaSync V3 and Media Audit

MediaSync inventories Drive for the catalog SKUs and reads the current GitHub branch/tree plus `media-manifest.json`. Missing SKU folders are recorded separately and retain their previous manifest entries; other Drive read failures stop planning. A missing or invalid/truncated GitHub tree cannot authorize destructive work.

In normal mode, an existing same-name image avoids downloading bytes only when the old manifest has matching Drive ID, size, update timestamp **and** GitHub blob SHA. Otherwise the Drive bytes are read and compared by Git blob SHA-1 (`SHA1("blob " + byteLength + NUL + bytes)`). A legacy manifest without `githubSha` therefore requires a hash read for the matching image, but does not itself require uploading that image.

The audit mode disables that metadata fast path for same-name Drive/GitHub pairs, reads their bytes and recalculates Git blob SHA-1. The planner can then upload new or changed content, delete extra image files for inventoried SKUs whose Drive folders were successfully read, and update manifest metadata. This is a Git-content comparison, not image decoding or visual/format validation. A full audit can publish changes; it is not read-only.

Plan safety:
- missing Drive SKU folders preserve previous published entries rather than being interpreted as empty;
- Drive/API errors and truncated GitHub trees stop planning;
- the plan only considers the inventoried catalog SKU scope; it is not a repository-wide cleanup of every unknown path;
- no-op plans finish without creating a commit.

For GitHub publication, MediaSync creates image/manifest blobs, then one tree and one commit with the base commit as parent, then updates the configured branch ref with `force: false`. Immediately before PATCH it rechecks the branch head. A branch race becomes a conflict and is not force-overwritten. See [Backup & Recovery](Backup%20%26%20Recovery.md).

## Media Audit scheduling and launch

`setupMediaSyncAuditWorker()` removes existing project triggers whose handler is exactly `startMediaSyncAudit`, then creates a time-driven trigger with `everyDays(30)`. The Sheets menu exposes **Setup Media Audit Worker**. This installs/replaces the trigger; it does not run the audit immediately. `startMediaSyncAudit()` can be run manually from the Apps Script function selector and is also the trigger handler. It refuses to start while MediaSync state is already pending.

The Dashboard has **Refresh Images**, but no Media Audit setup or run control. MediaSync exposes phase/status, run/generation/retry information and bounded aggregate request/hash/upload/delete diagnostics; it does not store media payloads in diagnostic summaries. The automated MediaSync test suite contains an audit-mode test proving that unchanged metadata does not skip reading bytes and recomputing the SHA; it does not test trigger installation, the actual 30-day scheduler, live trigger state, or audit-mode deletion end to end. Trigger creation errors propagate from setup; the function does not report a verified live trigger state. Google chooses the actual execution time for a time-driven trigger.

Setup deletes only old project triggers whose handler is exactly `startMediaSyncAudit`, then creates the replacement. Sequential setup runs replace rather than accumulate those triggers, but the setup function is not lock-protected, so simultaneous setup calls could race and create duplicates. If creation throws after deletion, the error propagates and no audit trigger may remain. The repository and tests cannot prove whether a trigger exists in the live Apps Script project, its creation date, next execution time, run history or duplicate state. See the owner check in [Backup & Recovery](Backup%20%26%20Recovery.md#checking-the-live-media-audit-trigger).

## Dashboard

Dashboard is an administrative workspace. It displays product/media statistics and publication/media-sync status and launches Publish, Archive, Restore and Refresh Images. Server-side modules perform the operations.

## Orders and documents

Core owns order business rules. CMS handles storage-side validation, concurrency and persistence. `Orders.js` validates payload/schema, checks duplicate IDs and product availability, reserves products and persists Orders/OrderItems. PDF generation is asynchronous; a later document failure does not undo an already persisted order.

## Documentation rule

Code and tests are the implementation source of truth. If documentation disagrees with them, inspect current code first and correct the documentation.
