# PREVIA Development Guide

Documentation revision: 2026-11-08  
Status: Active

## 1. Module boundaries

Examples:
- Drive.js → Google Drive operations.
- GitHub.js → GitHub API operations.
- CustomerRepository → Customer persistence.
- CustomerService → Customer registry logic.
- Publish.js → catalog publication orchestration.
- MediaSync.js → media synchronization and recovery.
- DashboardService.js → Dashboard statistics/status.

Before adding logic to CMS, decide whether it belongs to persistence/infrastructure or to shared domain rules in PREVIA Core.

## 2. Sources of truth

- Catalog and project configuration → Google Sheets.
- Product images → Google Drive.
- Customer, Favorites and Orders → their Sheets.
- Core → CMS HMAC secret → Script Properties.
- Public generated catalog and media → GitHub publication target.

Do not treat GitHub's published files as authoritative business data.

## 3. Keep catalog and media operations independent

Publish Boutique validates and publishes catalog data. Refresh Images calls MediaSync. `validateImages()` reads Drive image names and checks duplicate image numbers; it does not call GitHub or sync photos. `publishDataJS()` can read Drive inventory and the published manifest to build paths, without starting MediaSync.

Do not join the two flows or add an implicit `syncMedia()` call to catalog validation/publication. Regression coverage is in `tests/catalog-media-independence.test.js`.

## 4. MediaSync safety

Changes to media behavior require review of:
- Drive inventory errors versus missing SKU folders;
- metadata fast path and Git blob SHA-1 comparison;
- normal versus audit mode;
- plan scope and deletion guards;
- atomic blob → tree → commit → non-force ref sequence;
- branch conflicts and retry safety;
- checkpoint integrity, RunId, generation, lease, Script Lock and continuation;
- Retry-After and Apps Script execution budget;
- trigger creation failure/manual recovery.

See [Architecture](Architecture.md) and [Backup & Recovery](Backup%20%26%20Recovery.md). Do not describe the scheduled audit as installed without checking the live Apps Script project.

## 5. Concurrency and authentication

Any shared read/calculate/write flow must be checked for races. Customer creation uses Script Lock around lookup, ID generation and create. The browser must never receive the Core → CMS HMAC secret. Authentication is centralized; do not create endpoint-specific variants without review.

## 6. Publication is not a transaction

Catalog stages span Sheets, Drive and GitHub. Earlier external changes are not automatically rolled back after a later failure. Verify state before retrying a failed operation.

## 7. Tests

Tests live in `tests/` and run under Node's test runner. Relevant suites include:
- `tests/media-sync.test.js`
- `tests/github-git-data.test.js`
- `tests/catalog-media-independence.test.js`
- Customer, Orders, order document and reservation suites.

Run affected suites and the full available suite locally before proposing code changes. Tests are excluded from Apps Script upload by `.claspignore`.

## 8. Git workflow

Use an isolated topic branch and a Pull Request; do not push directly to `main`.

```text
inspect status → edit intended files → run tests → review diff and diff-check
→ commit topic branch → push branch → open PR → review and merge separately
```

Stage only intended files. Keep review notes and temporary files out of production commits.

## 9. Apps Script workflow

GitHub commit and Apps Script deployment version are separate.

Before a controlled Apps Script update:
1. verify the intended source branch/commit and local clasp project;
2. inspect `clasp status` and the source diff;
3. confirm excluded files and project settings;
4. push only after review;
5. update the intended deployment separately;
6. check triggers and executions, then run the approved smoke test.

Do not deploy as part of a Git-only documentation change. The reported deployment 71 is owner-supplied and cannot be confirmed through GitHub.

## 10. No unapproved infrastructure changes

Do not add GCP/Execution API configuration solely for a one-off test. The repository does not establish an Apps Script Execution API project binding.

## 11. Definition of done

A code change is complete when relevant tests pass, only intended files changed, the diff is reviewed, a PR is reviewed/merged through the normal workflow, and Apps Script is updated only when that change requires it. Update documentation when architecture or operations change.
