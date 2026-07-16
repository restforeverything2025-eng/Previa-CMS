# PREVIA Folder Structure

Version: 2.0

Status: Production

---

# Purpose

This document describes where every component of PREVIA is located.

The goal is that a new developer can find any file in less than one minute.

---

# Complete Architecture

```
Google Sheets
        │
        ▼
Products
Config
Exchange Rate
        │
        ▼
Google Apps Script
        │
        ▼
Google Drive
        │
        ▼
GitHub
        │
        ▼
Frontend
```

---

# Google Sheets

Acts as the Single Source of Truth.

Contains only structured business data.

Sheets:

- Products
- Config

No images are stored inside Google Sheets.

---

# Products Sheet

Contains the complete product catalog.

Typical fields:

- id
- sku
- category
- brand
- name
- currency
- price
- status
- dateAdded
- description
- notes
- featuredHome

Generated fields:

- id
- sku

Manually maintained:

- all remaining product information.

---

# Config Sheet

Stores project configuration.

Examples:

- Products Folder ID
- Incoming Folder ID
- GitHub Owner
- GitHub Repository
- GitHub Branch
- GitHub Token
- Exchange Rate API

Changing configuration never requires code changes.

---

# Google Apps Script

Contains the complete CMS.

Modules:

- Config
- Products
- Publish
- PublishReport
- Validation
- Normalizer
- IdGenerator
- SkuGenerator
- Drive
- GitHub
- ImagePublisher
- MediaSync
- IncomingValidator
- IncomingPublisher
- SpreadsheetWriter
- DataGenerator
- ExchangeRate
- Migration
- WebApp

Every module has one responsibility.

---

# Google Drive

Stores binary data only.

Contains:

Products/

Incoming/

No product metadata is stored here.

---

# Products Folder

Structure:

Products/

├── J0001/

│ ├── 1.jpg

│ ├── 2.jpg

│ └── ...

├── W0001/

│ ├── 1.jpg

│ ├── 2.jpg

│ └── ...

Folder name always equals SKU.

---

# Incoming Folder

Temporary import location.

Structure:

Incoming/

├── 1/

├── 2/

├── 3/

...

Folders are processed during publication.

After successful publishing they are deleted.

---

# GitHub Repository

Stores the public website.

Important folders:

images/

data.js

media-manifest.json

---

# images

Contains every published product image.

Structure:

images/

├── J0001/

├── J0002/

├── W0001/

...

---

# data.js

Generated automatically.

Contains:

- exchangeRate
- products

Never edited manually.

---

# media-manifest.json

Tracks synchronization state.

Used by MediaSync.

Allows uploading only changed files.

---

# Frontend

Receives data only from GitHub.

Never communicates directly with:

- Google Sheets
- Google Drive
- Apps Script

---

# Data Ownership

Google Sheets

↓

Business Data

Google Drive

↓

Images

GitHub

↓

Public Website

Every piece of information has exactly one owner.

---

# Stability Rule

Changing folder structure requires architectural review.

Folder names are part of the PREVIA architecture.