# PREVIA CMS Services

Documentation revision: 2026-10-06
Status: Production

## Purpose

Current responsibility map for the CMS modules.

## Configuration

### Config.js

Reads project configuration from the Config sheet.

### ExchangeRate.js

Provides exchange-rate support.

## Catalog

### Products.js
Product catalog access and persistence.

### IdGenerator.js
Sequential product IDs.

### SkuGenerator.js
Category-based SKUs.

### Normalizer.js
Safe text/format normalization.

### Validation.js
Catalog and image validation.

## Incoming

### IncomingValidator.js
Validates new products and Incoming folders.

### IncomingPublisher.js
Creates permanent product folders, processes incoming images and cleans successful Incoming data.

## Storage

### Drive.js
Google Drive operations.

### GitHub.js
GitHub API integration and published-file operations.

## Publication

### Publish.js
Central publication orchestrator.

### PublishReport.js
Publication report.

### PublicationJournal.js
Publication history.

### DataGenerator.js
Generates public data.js.

### SpreadsheetWriter.js
Writes generated catalog fields.

## Media

### MediaSync.js
Synchronizes Google Drive media to the published GitHub media state.

### ImagePublisher.js
Publishes product images.

## Customer

### CustomerModel.js
Immutable Customer representation.

### CustomerRepository.js
Customers-sheet persistence.

Columns:
customerId, provider, providerId, displayName, username, createdAt, updatedAt, status.

### CustomerService.js
Customer lookup and get-or-create.

Concurrency:
getScriptLock → findByProvider → generate ID → create → releaseLock.

Customer IDs use the maximum existing numeric ID.

### CustomerAPI.js
Customer domain operations for the endpoint layer.

## Favorites

### FavoritesModel.js
Immutable Favorite representation.

### FavoritesRepository.js
Favorites-sheet persistence.

### FavoritesService.js
Favorites operations and duplicate prevention.

### FavoritesAPI.js
Favorites domain operations.

## API and authentication

### WebApp.js
Single doGet/doPost entry point and API dispatcher.

### CustomerEndpoint.js
Customer request validation/delegation.

### FavoritesEndpoint.js
Favorites request validation/delegation.

### ProductEndpoint.js
Product lookup.

### OrderEndpoint.js
Order request validation/delegation.

### OrderAuthentication.js
Central Core HMAC verification.

Current values:
- version: v1;
- key id: core-v1;
- timestamp tolerance: 5 minutes;
- secret property: PREVIA_CORE_HMAC_SECRET.

## Orders

### Orders.js
Storage-side order persistence and concurrency coordination.

It validates schema/payload, checks duplicate order IDs, checks product availability, reserves products, persists Orders/OrderItems with Sheets batchUpdate, assigns public order numbers and initializes asynchronous queue state.

Order domain rules remain in Core.

### OrderSchemaValidator.js
Orders and OrderItems schema/payload validation.

### OrderRepositoryAdapter.js
Adapter between OrderEndpoint and persistence.

## Order documents

### OrderDocumentQueue.js
Marks persisted orders for asynchronous document processing.

### OrderDocumentService.js
Generates order documents and updates document state.

## Administration

### DashboardService.js
Dashboard statistics.

### Dashboard.html
Administrative UI.

Current actions:
Publish, Archive, Restore, Refresh Images.

### ArchiveService.js
Archive workflow.

### RestoreService.js
Restore workflow.

### LookupService.js
Product lookup helpers.

### RefreshService.js
Dashboard wrapper around MediaSync.

## Other infrastructure

### Migration.js
Migration utilities.

### Code.js
Spreadsheet menu and administrative entry points.

## Tests

tests/ contains Node tests for Customer, Orders, document contracts/services and product reservation.

The tests directory is excluded from Apps Script upload.

## Responsibility rule

If a change is shared domain/business logic, evaluate PREVIA Core first.

If a change is persistence, storage, publishing or Apps Script infrastructure, it belongs in CMS.
