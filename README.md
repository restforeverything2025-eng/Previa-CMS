# PREVIA CMS

Google Apps Script based Content Management System for the PREVIA Vintage boutique.

---

# Overview

Design principles:

- Simple
- Reliable
- One Module = One Responsibility
- Google Sheets = Single Source of Truth

PREVIA CMS is the central management system of the PREVIA ecosystem.

It provides a complete publishing pipeline from Google Sheets and Google Drive to the public boutique hosted on GitHub Pages.

The project follows one simple principle:

> Google Sheets is the Single Source of Truth.

---

# Main Features

- Product management
- Automatic ID generation
- Automatic SKU generation
- Product normalization
- Validation before publishing
- Google Drive image management
- GitHub publication
- Media synchronization
- Exchange rate support
- Publish reports

---

# Technology Stack

- Google Apps Script
- Google Sheets
- Google Drive
- GitHub
- Git
- clasp
- VS Code

---

# Architecture

```text
Google Sheets
      │
      ▼
Validation
      │
      ▼
Normalizer
      │
      ▼
Incoming Processing
      │
      ▼
Image Validation
      │
      ▼
Data Generator
      │
      ▼
GitHub Publisher
      │
      ▼
Spreadsheet Update
      │
      ▼
Cleanup
```

# Repository Structure

Code.js

Config.js

Products.js

Publish.js

PublishReport.js

Validation.js

Normalizer.js

IncomingValidator.js

IncomingPublisher.js

Drive.js

MediaSync.js

ImagePublisher.js

GitHub.js

DataGenerator.js

ExchangeRate.js

SkuGenerator.js

IdGenerator.js

SpreadsheetWriter.js

Migration.js

WebApp.js

appsscript.json

---

# Development Workflow

```text
git status

↓

Develop

↓

Test

↓

git add .

↓

git commit

↓

git push

↓

clasp push
```

# Project Status

Version:
PREVIA CMS 2.0

Status:
Production

Architecture:
Stable

Repository:
Git + GitHub + clasp

Development:
Active