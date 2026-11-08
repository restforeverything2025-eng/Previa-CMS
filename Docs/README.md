# PREVIA CMS

Google Apps Script based Content Management System for the PREVIA Vintage boutique.

Documentation revision: 2026-11-08  
Repository checkpoint: `main` at `fa347b0ff3c3bf8a06d3cbb8a85ae27bbb9a0551` (2026-11-06)  
Apps Script version: owner-reported deployment 71, `Previa CMS V3 - Hardened Media Sync` (deployment state is not verifiable through this GitHub repository)

## Overview

PREVIA CMS is the infrastructure and persistence layer of the PREVIA ecosystem. It connects Google Sheets, Google Drive, PREVIA Core, GitHub and the public PREVIA website.

Core principles:
- Google Sheets is authoritative for business data.
- Google Drive is authoritative for product images.
- GitHub contains published `data.js`, images and `media-manifest.json`; it is a publication target, not the business-data source of truth.
- Secrets stay outside frontend code.
- Catalog publication and media synchronization are independent operations.

## Main responsibilities

- **Catalog:** product management, IDs, SKUs, normalization, validation and publication.
- **Media:** Drive inventory, GitHub publication, MediaSync V3 recovery and periodic content audit.
- **Customer and Favorites:** persistence and customer identity operations.
- **Orders:** order persistence, product reservation, document queue and catalog publication queue.
- **Administration:** Dashboard, Publish, Archive, Restore, Refresh Images and publication journal.

## Technology

Google Apps Script, Google Sheets, Google Drive, GitHub Git Data API, Git, clasp, Node.js tests and VS Code.

## Architecture and operations

```text
Publish Boutique ──> validate and publish catalog ──> GitHub data.js
Refresh Images ────> MediaSync V3 ──────────────────> GitHub images + media-manifest.json
```

Publish Boutique may read the Drive inventory and current published media manifest to keep image paths in `data.js` valid. It does not start MediaSync. See [Publish Pipeline](Publish%20Pipeline.md) and [Architecture](Architecture.md).

MediaSync V3 uses Git blobs, a Git tree, one Git commit and a non-force branch update. Checkpoint/recovery, ownership and continuation details are in [Backup & Recovery](Backup%20%26%20Recovery.md). The full media audit and its limits are described in [Architecture](Architecture.md#mediasync-v3-and-media-audit).

## API and services

`WebApp.js` is the single HTTP entry point. API areas include Customer, Favorites, Orders and Product lookup. Customer and Favorites requests require authenticated Core envelopes; order requests use centralized Core HMAC authentication.

See [Services](Services.md) for module ownership and [Folder Structure](Folder%20Structure.md) for repository layout.

## Tests

Node tests live in `tests/`. Relevant media suites are:

- `tests/media-sync.test.js`
- `tests/github-git-data.test.js`
- `tests/catalog-media-independence.test.js`

Other suites cover Customer, Orders, order documents and product reservation. Run the desired suites with Node's test runner; tests are excluded from Apps Script upload by `.claspignore`.

## Development workflow

```text
Understand → implement → test → review diff → commit on a topic branch
→ push branch → open Pull Request → review/merge separately
```

Apps Script source and deployment versions are separate from Git commits. Follow [Development Guide](Development%20Guide.md) before a controlled Apps Script update.

## Operational checkpoint

The repository checkpoint above is confirmed by GitHub. Deployment version 71 and the deployment title are supplied by the project owner and cannot be verified from GitHub. The repository does not show whether the monthly Media Audit trigger is installed in the live Apps Script project.
