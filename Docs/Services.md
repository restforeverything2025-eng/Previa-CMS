# PREVIA CMS Services

Documentation revision: 2026-11-08  
Status: Active

## Purpose

Current module responsibility map. The repository tree remains the authoritative exact file list.

## Configuration and storage

### Config.js
Reads project configuration from the Config sheet. Secrets must not be exposed to browser code.

### Drive.js
Reads Drive folders, product image inventory and file bytes. It distinguishes a missing SKU folder from other Drive errors; callers can preserve prior published media on a missing folder.

### GitHub.js
Provides GitHub API helpers for catalog files and the Git Data API used by MediaSync V3. The V3 flow reads branch/tree/blob state, creates blobs/trees/commits and updates a ref without force. Legacy file helpers remain available to other modules.

## Catalog and incoming products

### Products.js
Catalog input and persistence.

### IdGenerator.js / SkuGenerator.js
Product ID and SKU generation.

### Normalizer.js
Product text/format normalization.

### Validation.js
Catalog validation and Drive image filename validation. `validateImages()` does not start MediaSync, hash image content or call GitHub.

### IncomingValidator.js
Validates new products and Incoming folders.

### IncomingPublisher.js
Creates permanent product folders, copies incoming images and cleans successfully processed incoming data.

## Publication

### Publish.js
Orchestrates Publish Boutique. It can publish `data.js` without running MediaSync.

### DataGenerator.js
Builds public catalog data and image paths. Given a manifest, paths use manifest filenames; otherwise the fallback reads product image names from Drive.

### SpreadsheetWriter.js
Writes generated catalog fields to Sheets.

### PublishReport.js / PublicationJournal.js
Publication report and persisted publication history.

## Media synchronization

### MediaSync.js
Owns Drive-to-GitHub media planning, manifest reconciliation, audit mode, checkpoint state, continuation, retries, locking, ownership and run status.

Public entry points:
- `refreshMedia()` in Publish.js;
- `refreshImages()` in RefreshService.js;
- `startMediaSyncAudit()` for a manual or time-triggered full audit;
- `setupMediaSyncAuditWorker()` to replace/install the recurring audit trigger.

Both ordinary media entry points call `syncMedia()`. Catalog publication and `validateImages()` do not.

### ImagePublisher.js
Contains older per-file publication helpers (`publishProductImage`, `publishProductImages`, `publishAllImages`) and test helpers. A repository-wide source scan at this checkpoint found no call sites outside ImagePublisher.js; neither the Dashboard nor Publish Boutique uses it. It is retained code, not the current Refresh Images pipeline.

### RefreshService.js
Dashboard wrapper: `refreshImages()` delegates to `syncMedia()`.

## Customer and Favorites

### CustomerModel.js / CustomerRepository.js / CustomerService.js / CustomerAPI.js
Customer representation, sheet persistence, identity lookup and get-or-create. The service protects lookup and ID creation with Script Lock.

### FavoritesModel.js / FavoritesRepository.js / FavoritesService.js / FavoritesAPI.js
Favorites representation, persistence and duplicate prevention.

## API and authentication

### WebApp.js
Single `doGet`/`doPost` entry point and API dispatcher.

### Api/*
Customer, Favorites, Product and Order endpoints plus centralized Order authentication.

## Orders and documents

### Orders.js
Storage-side order validation, concurrency and persistence for Orders/OrderItems. Core remains the owner of shared order domain rules.

### OrderSchemaValidator.js / OrderRepositoryAdapter.js
Schema validation and persistence adapter.

### OrderDocumentQueue.js / OrderDocumentService.js
Asynchronous order document processing and status updates.

## Administration and infrastructure

### Dashboard.html / DashboardService.js
Dashboard presentation and server-side statistics/status. Dashboard offers Refresh Images, not a Media Audit setup/run control.

### ArchiveService.js / RestoreService.js / LookupService.js
Administrative archive, restore and product lookup operations.

### Code.js
Spreadsheet menu entry points, including Publish Boutique, Refresh Media and Setup Media Audit Worker.

### Migration.js / ExchangeRate.js
Migration and exchange-rate helpers.

## Tests

Media-related test suites:
- `tests/media-sync.test.js`
- `tests/github-git-data.test.js`
- `tests/catalog-media-independence.test.js`

Other tests cover customer, orders, order documents and reservation behavior. The `tests/` directory is excluded from Apps Script upload.
