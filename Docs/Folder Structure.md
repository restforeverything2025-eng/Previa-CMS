# PREVIA CMS Folder Structure

Documentation revision: 2026-10-06
Status: Production

## Purpose

Current repository responsibility map.

## Main structure

~~~text
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
~~~

The Git tree is the authoritative exact file list.

## Api/

HTTP-facing modules:
- CustomerEndpoint.js
- FavoritesEndpoint.js
- OrderAuthentication.js
- OrderEndpoint.js
- ProductEndpoint.js

WebApp.js is the single doGet/doPost entry point.

## Customer/

CustomerModel, CustomerRepository, CustomerService and CustomerAPI.

CustomerRepository owns Customers-sheet persistence.

CustomerService owns Customer registry operations and atomic get-or-create.

## Favorites/

FavoritesModel, FavoritesRepository, FavoritesService and FavoritesAPI.

Favorites are keyed by customerId.

## Orders

Orders.js handles storage-side order persistence and reservation coordination.

OrderSchemaValidator validates schema and payload.

OrderRepositoryAdapter bridges the endpoint and persistence.

OrderDocumentQueue and OrderDocumentService handle asynchronous PDF work.

## Publication

Publish.js, PublishReport.js, PublicationJournal.js, DataGenerator.js and SpreadsheetWriter.js.

## Media

Drive.js, MediaSync.js and ImagePublisher.js.

Current direction:

~~~text
Google Drive → GitHub published media
~~~

## Product import and validation

Products.js, IncomingValidator.js, IncomingPublisher.js, Normalizer.js, Validation.js, IdGenerator.js and SkuGenerator.js.

## Administration

Dashboard.html, DashboardService.js, ArchiveService.js, RestoreService.js, LookupService.js and RefreshService.js.

Dashboard actions currently include Publish, Archive, Restore and Refresh Images.

## Configuration and infrastructure

Config.js, GitHub.js, ExchangeRate.js, Migration.js, Code.js and WebApp.js.

## Tests

tests/ contains Node-based tests and is excluded from Apps Script upload by .claspignore.

## Runtime data

Google Sheets:
- Products
- Config
- Customers
- Favorites
- Orders
- OrderItems
- PublicationJournal

Google Drive:
- Products/
- Incoming/
- PREVIA/ORDERS/

## Boundary

CMS contains persistence and infrastructure.

PREVIA Core remains a separate repository and owns shared domain/business rules.
