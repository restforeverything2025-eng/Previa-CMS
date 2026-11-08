# PREVIA CMS Folder Structure

Documentation revision: 2026-11-08  
Status: Active

## Purpose

Repository responsibility map. Use the Git tree for the exact current file list.

## Main structure

```text
Previa-CMS/
├── Api/
├── Customer/
├── Favorites/
├── Docs/
├── tests/
├── appsscript.json
├── WebApp.js
├── Code.js
├── Config.js
├── Products.js
├── Orders.js
├── OrderSchemaValidator.js
├── OrderRepositoryAdapter.js
├── ProductRepositoryAdapter.js
├── OrderDocumentQueue.js
├── OrderDocumentService.js
├── Dashboard.html
├── DashboardService.js
├── Publish.js
├── PublishReport.js
├── PublicationJournal.js
├── RefreshService.js
├── MediaSync.js
├── ImagePublisher.js
├── IncomingPublisher.js
├── IncomingValidator.js
├── Validation.js
├── Normalizer.js
├── IdGenerator.js
├── SkuGenerator.js
├── DataGenerator.js
├── SpreadsheetWriter.js
├── ArchiveService.js
├── RestoreService.js
├── LookupService.js
├── Drive.js
├── GitHub.js
├── ExchangeRate.js
└── Migration.js
```

## Main directories

### Api/
HTTP-facing Customer, Favorites, Order and Product endpoints plus centralized Order authentication. `WebApp.js` remains the single `doGet`/`doPost` entry point.

### Customer/ and Favorites/
Models, repositories, services and API helpers for their respective Sheets-backed data.

### Docs/ and tests/
Architecture, operations and development documentation; Node-based automated tests. Tests are excluded from Apps Script upload by `.claspignore`.

## Publication modules

`Publish.js`, `PublishReport.js`, `PublicationJournal.js`, `DataGenerator.js` and `SpreadsheetWriter.js` implement the catalog publication flow. `IncomingValidator.js` and `IncomingPublisher.js` validate and process new product folders.

## Media modules

- `Drive.js`: product image inventory and byte reads.
- `MediaSync.js`: current Drive → GitHub V3 synchronizer, including `media-manifest.json`, audit mode and recovery.
- `GitHub.js`: GitHub Git Data API and compatible file helpers.
- `RefreshService.js`: Dashboard refresh wrapper.
- `ImagePublisher.js`: older per-file publication helpers; not called by the current Dashboard or Publish Boutique pipeline.

Published target paths are `images/{sku}/{filename}` and `media-manifest.json`. This repository tree lists source files; those public media paths are generated/published GitHub content.

Catalog publication and media synchronization remain independent. See [Publish Pipeline](Publish%20Pipeline.md).

## Administration and runtime data

`Dashboard.html`, `DashboardService.js`, `Code.js`, `ArchiveService.js`, `RestoreService.js`, `LookupService.js` and `RefreshService.js` provide administrative UI and actions. The Sheets menu includes a Media Audit trigger setup item; the Dashboard does not.

Runtime Sheets include Products, Config, Customers, Favorites, Orders, OrderItems and PublicationJournal. Drive stores product images, Incoming data and order documents.

CMS owns persistence and infrastructure; PREVIA Core remains a separate repository for shared business/domain rules.
