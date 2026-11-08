# PREVIA Publish Pipeline

Documentation revision: 2026-11-08
Status: Production

## Purpose

The pipeline is deterministic in order but spans multiple external systems. It is not a database-style atomic transaction.

## New product pipeline

~~~text
Read Products
 ↓
Reset Publication Report
 ↓
Detect New Products
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
Validate Drive image filenames
 ↓
Generate data.js
 ↓
Write Generated Fields
 ↓
Cleanup Incoming
 ↓
Publication Journal / Report
~~~

## No new products

Current implementation can publish data.js directly and record the publication when no new products require preparation.

## Services

- Products → catalog input.
- IdGenerator → product IDs.
- SkuGenerator → SKUs.
- Normalizer → safe normalization.
- IncomingValidator → incoming consistency.
- Validation → catalog/image validation.
- IncomingPublisher → product folders and incoming cleanup.
- DataGenerator → public data.js.
- SpreadsheetWriter → generated fields.
- PublishReport → report.
- PublicationJournal → publication history.

## Failure behaviour

The pipeline throws on errors and records failure in PublicationJournal.

Because operations span Sheets, Drive and GitHub, a failure does not automatically roll back all earlier external changes.

Therefore a failed publication should be verified before retrying blindly.

## Catalog and photo independence

`validateImages()` checks image filenames and duplicate image numbers in Drive. It does not hash files, call GitHub or run MediaSync. `publishDataJS()` reads Drive inventory and the published manifest to build image paths; this does not start photo synchronization. This applies to the no-new-product publication path as well.

## Media refresh

RefreshService and Publish.js expose `refreshImages()`/`refreshMedia()` entry points that call `syncMedia()` independently of Publish Boutique.

MediaSync V3 reads Drive inventory, GitHub branch/tree and the published manifest. It compares Drive image bytes using Git blob SHA-1 when metadata cannot safely take the fast path, creates image/manifest blobs, then publishes one Git tree and one commit with a non-force ref update. Missing SKU folders and incomplete inventories are protected; continuation/recovery rechecks Drive inventory and branch HEAD.

The ordinary mode can skip reading bytes when manifest metadata and GitHub SHA match. Audit mode disables that fast path for same-name files and rehashes them. It can publish changes and is not read-only. The code provides a separate every-30-days trigger setup; whether it is installed must be checked in Apps Script.

Direction:

~~~text
Google Drive → MediaSync V3 → GitHub images + media-manifest.json
~~~

See [Architecture](Architecture.md) and [Backup & Recovery](Backup%20%26%20Recovery.md) for safety and recovery details.

## Order-triggered publication

Order creation can mark catalog publication work as pending. A separate worker processes pending publication work asynchronously.

## Stability rule

Do not reorder stages without architecture review, tests, documentation and failure-path review.
