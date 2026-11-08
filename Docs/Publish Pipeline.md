# PREVIA Publish Pipeline

Documentation revision: 2026-11-08  
Status: Active

## Purpose

Catalog publication and photo synchronization are separate operations. Each spans multiple external services and is not a database-style transaction.

## Publish Boutique: catalog

When new products exist, `Publish.js:publishBoutique()` follows this flow:

```text
Read Products
 ↓
Reset report / detect new products
 ↓
Assign IDs and SKUs
 ↓
Normalize
 ↓
Validate incoming data and catalog
 ↓
Prepare product folders
 ↓
Validate image filenames in Drive
 ↓
Generate and publish data.js
 ↓
Write generated fields to Sheets
 ↓
Clean up successfully processed Incoming folders
 ↓
Publication journal / report
```

When no new products need preparation, the function can publish `data.js` directly. Failures are recorded in the publication journal/report; earlier external changes are not automatically rolled back.

Image validation reads product Drive files and checks duplicate image-number names. It does not hash or publish photos.

### Image paths in data.js

`publishDataJS()` reads the Drive inventory and published `media-manifest.json`, merges them while preserving paths for missing Drive SKU folders, then generates `data.js`. These reads support image-path generation; they do not invoke `syncMedia()`.

## Refresh Images: independent media publication

The spreadsheet menu item **Refresh Media**, Dashboard button **Refresh Images**, and `RefreshService.refreshImages()` enter the MediaSync path (`refreshMedia()`/`refreshImages()` → `syncMedia()`).

MediaSync:
1. reads Drive inventory for product SKUs;
2. reads the GitHub branch/tree and current media manifest;
3. refuses to plan destructive work from an invalid or truncated tree;
4. hashes changed or audit-selected image bytes and plans file/manifest changes;
5. creates blobs, one Git tree and one commit containing images and manifest changes;
6. advances the branch ref without force;
7. uses checkpoint and continuation when an execution must yield.

New/changed photos are staged before obsolete image files are deleted in the target tree. Missing Drive SKU folders are protected and keep prior published image paths. A successful no-op creates no commit. See [Architecture](Architecture.md#mediasync-v3-and-media-audit) and [Backup & Recovery](Backup%20%26%20Recovery.md).

## Media Audit

The optional audit mode is started by the `startMediaSyncAudit` handler, not by Publish Boutique or the ordinary Refresh Images action. It bypasses the metadata fast path for existing same-name files and recalculates their Git blob SHA-1. If the comparison finds differences, the normal safe MediaSync plan may publish them. It can also remove stale files within inventoried SKU folders; it is not a read-only check. The recurring handler is configured separately with **Setup Media Audit Worker**; installation is not verified by this repository.

## Order-triggered catalog work

Order creation can mark catalog publication work pending. A separate worker processes that queue asynchronously; this is distinct from both Publish Boutique and MediaSync.

## Failure behaviour

A failure stops the current run and records recovery state where applicable. Because Sheets, Drive and GitHub are separate systems, earlier changes may already exist; verify state before manually repeating an operation. Do not treat a catalog publication as a media sync or vice versa.
