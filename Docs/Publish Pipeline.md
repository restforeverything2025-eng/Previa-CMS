# PREVIA Publish Pipeline

Documentation revision: 2026-10-06
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
Validate Images
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

## Media refresh

RefreshService calls MediaSync.

MediaSync:
1. reads Google Drive media;
2. reads the GitHub repository tree;
3. compares media;
4. uploads changed/new files;
5. removes orphan published files;
6. updates media-manifest.json;
7. returns a synchronization result.

Direction:

~~~text
Google Drive → GitHub
~~~

## Order-triggered publication

Order creation can mark catalog publication work as pending. A separate worker processes pending publication work asynchronously.

## Stability rule

Do not reorder stages without architecture review, tests, documentation and failure-path review.
