# PREVIA Development Guide

Documentation revision: 2026-11-08
Status: Active

## 1. One module = one responsibility

Examples:
- Drive → Google Drive operations.
- GitHub → GitHub API operations.
- CustomerRepository → Customer persistence.
- CustomerService → Customer registry logic.
- Publish → publication orchestration.
- DashboardService → Dashboard statistics.

## 2. Respect the Core → CMS boundary

Core is the shared domain/service layer.

CMS is the persistence and infrastructure layer.

Before adding logic to CMS ask:

> Is this a storage/infrastructure concern, or a shared domain rule?

Persistence-level atomicity is valid in CMS when required to protect shared storage. Customer get-or-create is an example.

## 3. Single source of truth

- Catalog → Google Sheets.
- Images → Google Drive.
- Customers → Customers sheet.
- Favorites → Favorites sheet.
- Orders → Orders and OrderItems.
- Configuration → Config sheet.
- Core → CMS HMAC secret → Script Properties.
- Public generated catalog → GitHub.

## 4. Validation before publication

Catalog publication and photo sync are independent. `validateImages()` checks Drive image filenames and duplicate numbers only; `publishDataJS()` reads Drive inventory and the published manifest to generate paths without calling `syncMedia()`. Refresh Images is the explicit photo-sync path. Preserve this boundary and the missing-folder safeguards.

Never bypass validation merely to make publication succeed.

## 5. Concurrency

Any operation that reads shared state, calculates a new value and writes it must be checked for race conditions.

Relevant CMS examples:
- Customer ID generation;
- Customer creation;
- order creation;
- product reservation;
- public order number generation.

Customer creation uses Apps Script Script Lock around lookup → ID generation → create.

Official reference:
https://developers.google.com/apps-script/reference/lock/lock-service

## 6. Authentication boundary

The browser must never receive the Core → CMS HMAC secret.

WebApp verifies the authenticated envelope before dispatch.

Authentication implementation is centralized in Api/OrderAuthentication.js.

Do not create endpoint-specific authentication variants without architectural review.

## 7. Public functions only

Services communicate through their public functions. Do not reach into another module's private implementation.

## 8. Publication stability

Do not reorder publication stages without architecture review, tests, documentation and failure-path review.

## 9. Publication is not a database transaction

The pipeline stops on errors, but it spans Sheets, Drive and GitHub. Earlier external changes are not automatically rolled back.

## 10. Test before production

Recommended cycle:

~~~text
Understand
 ↓
Design
 ↓
Implement
 ↓
Run tests
 ↓
Review diff
 ↓
Commit
 ↓
Push Git
 ↓
clasp push
 ↓
Update intended deployment
 ↓
Smoke test
~~~

## 11. Tests

Tests live in tests/.

Current groups include Customer, Orders, order documents and product reservation, plus:
- `tests/media-sync.test.js`;
- `tests/github-git-data.test.js`;
- `tests/catalog-media-independence.test.js`.

The MediaSync tests cover recovery, conflict/trigger safety, missing-folder and truncated-tree behavior, legacy manifest migration and audit hashing. The audit trigger installation/real schedule is not covered by an automated test.

tests/ is excluded from Apps Script upload by .claspignore.

## 12. Git workflow

Use:

~~~text
git status
git diff
git diff --check
git add only intended files
git diff --cached
git commit on a topic branch
git push origin <topic-branch>
open Pull Request for review
~~~

Do not blindly use git add . when unrelated local files may exist.

## 13. Apps Script workflow

Use:

~~~text
clasp status
review source diff
clasp push only after approval
verify/update intended deployment separately
controlled smoke test
~~~

GitHub commit and Apps Script deployment version are separate. The owner reports deployment 71 (`Previa CMS V3 - Hardened Media Sync`), but GitHub cannot verify the live deployment or Media Audit trigger.

## 14. No unapproved infrastructure changes

Do not introduce GCP/Execution API configuration merely to solve a one-off test.

The current CMS is not bound to a GCP project for Execution API use.

## 15. One logical change = one commit

Prefer feat:, fix:, refactor:, docs: and test: prefixes.

## 16. Documentation is part of the project

Architecture, responsibilities and workflows must evolve together with the code.

## 17. Definition of done

A change is complete when relevant tests pass, the diff is reviewed, only intended files changed, GitHub is updated, Apps Script is updated when required, the intended deployment is updated and documentation is updated when architecture changed.

## Dashboard rule

Dashboard is an administrative workspace. It may launch Publish, Archive, Restore and Refresh Images. Business logic remains server-side.

## Stability rule

Refactor only when a defect, duplication, unclear boundary, maintenance problem, security issue or concurrency issue is demonstrated.
