# PREVIA CMS Services

Version: 2.0

Status: Production

---

# Purpose

This document describes every service of PREVIA CMS,
its responsibilities,
dependencies,
public functions
and role inside the publishing pipeline.

The goal is that a developer can understand the entire CMS architecture
without reading the source code.

---

# Service Architecture

```text
Config
    │
    ▼
Products
    │
    ├──────────────┐
    ▼              ▼
IdGenerator    SkuGenerator
    │              │
    └──────┬───────┘
           ▼
     Normalizer
           │
           ▼
IncomingValidator
           │
           ▼
Validation
           │
           ▼
IncomingPublisher
           │
           ▼
Drive
      ┌────┴────┐
      ▼         ▼
ImagePublisher  MediaSync
      │         │
      └────┬────┘
           ▼
GitHub
           │
           ▼
SpreadsheetWriter
           │
           ▼
Publish
           │
           ▼
PublishReport
```

---

# Services

---

# Config

## Purpose

Provides centralized access to all PREVIA CMS configuration values stored in the **Config** Google Sheet.

The service acts as the single source of configuration for the entire project.

---

## Responsibilities

- Read configuration values from Google Sheets.
- Build a configuration object.
- Provide configuration to other services.

---

## Public Functions

### getConfig()

Reads the Config sheet and returns all configuration values as a single object.

---

## Dependencies

Uses:

- Google Sheets

Used by:

- Drive
- GitHub
- ExchangeRate
- any service requiring project configuration

---

## Tests

- testConfig()

---

## Status

Production

---

# Products

## Purpose

Provides centralized access to the product catalog stored in Google Sheets.

All product operations begin with this service.

---

## Responsibilities

- Read products from Google Sheets.
- Convert spreadsheet rows into product objects.
- Save new products.
- Clear catalog data for testing.
- Normalize price and currency during import.

---

## Public Functions

### getProducts()

Loads the complete catalog from Google Sheets.

### normalizeProduct()

Converts price values into structured numeric format.

### saveProduct()

Adds a new product into Google Sheets.

### clearProducts()

Clears all catalog rows except the header.

---

## Dependencies

Uses:

- Google Sheets

Used by:

- Publish
- Validation
- DataGenerator
- IncomingValidator
- MediaSync
- SpreadsheetWriter
- all catalog-related services

---

## Tests

- testConfig()
- testClearProducts()

---

## Status

Production

---

# IdGenerator

## Purpose

Generates unique sequential product IDs for all newly added products.

The service guarantees that every product receives a permanent and unique PREVIA identifier.

---

## Responsibilities

- Find the highest existing product ID.
- Generate the next available ID.
- Assign IDs only to products that do not already have one.

---

## Public Functions

### assignId()

Assigns sequential IDs to all new products.

---

## Dependencies

Uses:

- Products

Used by:

- Publish

---

## Tests

- testIdAndSkuGeneration()

---

## Status

Production

---

# SkuGenerator

## Purpose

Generates sequential SKUs based on product category.

The service guarantees unique numbering independently for Watches and Jewelry.

---

## Responsibilities

- Determine the highest SKU number for every category.
- Generate the next available SKU.
- Assign SKUs only to products without one.

---

## Public Functions

### assignSku()

Assigns sequential SKUs to new products.

### getSkuCounters()

Returns the current SKU counters for all supported categories.

---

## Dependencies

Uses:

- Products

Used by:

- Publish

---

## Tests

- testIdAndSkuGeneration()
- testSkuCounters()

---

## Status

Production

---

# Validation

## Purpose

Validates all catalog data before publication.

The service guarantees that only valid products can be published.

---

## Responsibilities

- Validate required fields.
- Validate product price.
- Validate supported currencies.
- Validate supported statuses.
- Validate product images.

---

## Public Functions

### validateProducts()

Performs complete validation of the product catalog.

### validateImages()

Verifies that every product has at least one valid image in Google Drive.

---

## Dependencies

Uses:

- Drive

Used by:

- Publish

---

## Tests

Validation is performed automatically during the publishing pipeline.

---

## Status

Production

---

# Normalizer

## Purpose

Automatically fixes safe formatting issues before validation.

The service prepares imported data without changing its meaning.

---

## Responsibilities

- Remove leading and trailing spaces.
- Replace multiple spaces with a single space.
- Replace non-breaking spaces.
- Replace tab characters.
- Normalize all text fields.

---

## Public Functions

### normalizeText()

Normalizes a single text value.

### normalizeProduct()

Normalizes every supported field of one product.

### normalizeProducts()

Normalizes the complete product catalog.

---

## Dependencies

None

Used by:

- Publish

---

## Tests

- testNormalizer()

---

## Status

Production

---

# Drive

## Purpose

Provides all interaction with Google Drive.

The service is responsible only for storage operations and does not contain any business logic related to products.

---

## Responsibilities

- Access Products and Incoming folders.
- Read product images.
- Read product files.
- Read binary file data.
- Retrieve Incoming folders.

---

## Public Functions

### getProductsFolder()

Returns the root Products folder.

### getIncomingFolder()

Returns the Incoming folder.

### getIncomingFolders()

Returns Incoming folders sorted by import order.

### getProductImages()

Returns all image filenames for a product.

### getProductFiles()

Returns complete metadata for every product image.

### getDriveFileBytes()

Returns binary file data for GitHub publishing.

---

## Dependencies

Uses:

- Google Drive
- Config

Used by:

- Validation
- DataGenerator
- MediaSync
- ImagePublisher
- IncomingPublisher

---

## Tests

- testIncomingFolders()
- testIncomingSort()
- testGetProductImages()
- testGetDriveFileBytes()

---

## Status

Production

---

# GitHub

## Purpose

Provides a single interface for publishing files to GitHub.

The service hides all GitHub API communication from the rest of the CMS.

---

## Responsibilities

- Read repository configuration.
- Read published files.
- Read SHA hashes.
- Publish new files.
- Update existing files.

---

## Public Functions

### getGitHubConfig()

Returns repository configuration.

### getFileSha()

Returns SHA hash of a published file.

### getFileContent()

Downloads and returns file contents.

### publishFile()

Publishes or updates a file in GitHub.

### publishDataJS()

Publishes the generated catalog.

---

## Dependencies

Uses:

- Config
- GitHub REST API

Used by:

- Publish
- MediaSync
- ImagePublisher

---

## Tests

- testGitHubConfig()
- testGitHubConnection()
- testGetFileSha()
- testGetFileContent()

---

## Status

Production

---

# MediaSync

## Purpose

Synchronizes product images between Google Drive and GitHub.

Only changed files are uploaded.

---

## Responsibilities

- Generate media manifest.
- Compare Drive and GitHub manifests.
- Detect changed images.
- Upload only modified files.
- Publish updated manifest.

---

## Public Functions

### syncMedia()

Synchronizes product images.

### getMediaManifest()

Builds the current media manifest.

### compareMediaManifest()

Returns required upload operations.

### publishMediaManifest()

Publishes the latest media manifest.

---

## Dependencies

Uses:

- Drive
- GitHub
- Products

Used by:

- Publish

---

## Tests

- testMediaManifest()
- testCompareMediaManifest()
- testSyncMedia()

---

## Status

Production

---

# ImagePublisher

## Purpose

Publishes product images to GitHub.

Used primarily during the initial publication of a new product.

---

## Responsibilities

- Read product images.
- Publish one image.
- Publish all images.
- Publish complete image folders.

---

## Public Functions

### publishProductImage()

Publishes a single image.

### publishProductImages()

Publishes all images of one product.

### publishAllImages()

Publishes images for the complete catalog.

---

## Dependencies

Uses:

- Drive
- GitHub

Used by:

- Publish
- Migration

---

## Tests

- testReadImage()
- testPublishProductImage()
- testPublishProductImages()

---

## Status

Production

---

# IncomingValidator

## Purpose

Validates new products waiting for publication.

Ensures every new product has a corresponding Incoming folder.

---

## Responsibilities

- Detect new products.
- Detect Incoming folders.
- Match products with folders.
- Validate import consistency.

---

## Public Functions

### validateIncoming()

Validates Incoming data.

### getNewProducts()

Returns products without assigned SKU.

### matchProductsToFolders()

Creates product-folder pairs.

### hasNewProducts()

Returns whether publication contains new products.

---

## Dependencies

Uses:

- Products
- Drive

Used by:

- Publish
- IncomingPublisher

---

## Tests

- testIncomingValidator()
- testMatchProductsToFolders()
- testHasNewProducts()

---

## Status

Production

---

# IncomingPublisher

## Purpose

Creates product folders and transfers new images from Incoming into the product storage.

---

## Responsibilities

- Create product folders.
- Copy images.
- Verify duplicate folders.
- Clean Incoming after successful publication.

---

## Public Functions

### prepareProductFolders()

Creates folders and copies images.

### cleanupIncoming()

Removes processed Incoming folders.

---

## Dependencies

Uses:

- Drive
- IncomingValidator

Used by:

- Publish

---

## Tests

- testPrepareProductFolders()

---

## Status

Production

---

# SpreadsheetWriter

## Purpose

Writes automatically generated values back into Google Sheets.

---

## Responsibilities

- Write generated IDs.
- Write generated SKUs.

---

## Public Functions

### writeGeneratedFields()

Writes generated values into Products sheet.

---

## Dependencies

Uses:

- Google Sheets

Used by:

- Publish

---

## Status

Production

---

# DataGenerator

## Purpose

Generates the public catalog consumed by the PREVIA website.

---

## Responsibilities

- Build public product objects.
- Build image paths.
- Format dates.
- Generate data.js.

---

## Public Functions

### generateDataJS()

Generates the complete public catalog.

---

## Dependencies

Uses:

- Products
- Drive
- ExchangeRate

Used by:

- Publish

---

## Tests

- testGenerateDataJS()

---

## Status

Production

---

# Publish

## Purpose

Acts as the central orchestrator of the PREVIA publishing pipeline.

Coordinates every service required for publication.

---

## Responsibilities

- Execute the publishing pipeline.
- Coordinate every core service.
- Build publication reports.
- Publish catalog updates.

---

## Public Functions

### publishBoutique()

Runs the complete publishing pipeline.

### refreshMedia()

Synchronizes product images.

---

## Dependencies

Uses:

- All core CMS services.

Used by:

- PREVIA CMS menu

---

## Status

Production

---

# PublishReport

## Purpose

Collects and displays publication progress.

Provides a single report shown to the user after publication.

---

## Responsibilities

- Reset report.
- Collect messages.
- Display report.

---

## Public Functions

### reset()

Clears the report.

### add()

Adds a report line.

### show()

Displays the report dialog.

---

## Dependencies

None

Used by:

- Publish

---

## Status

Production

---