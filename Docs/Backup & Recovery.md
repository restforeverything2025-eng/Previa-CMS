# PREVIA Backup & Recovery

Documentation revision: 2026-10-06
Status: Production

## Purpose

Restore PREVIA after hardware failure, computer replacement, accidental data loss or loss of the local development environment.

## Components

1. Google Sheets
   - Products
   - Config
   - Customers
   - Favorites
   - Orders
   - OrderItems
   - PublicationJournal
   - other runtime sheets used by CMS

2. Google Drive
   - Products images
   - Incoming
   - PREVIA/ORDERS documents

3. Google Apps Script
   - CMS source
   - Script Properties
   - triggers
   - deployments

4. GitHub
   - PREVIA source repositories
   - documentation
   - tests

5. Documentation
   - architecture
   - development rules
   - recovery
   - roadmap

## Important versioning rule

GitHub and Apps Script deployments are separate versioning systems.

~~~text
GitHub main
   ↓
commit 2cf815f

Apps Script project
   ↓
production deployment
   ↓
@68
~~~

A Git commit does not update an Apps Script deployment. clasp push updates project content. Deployment update is a separate operation.

## Recovery order

~~~text
Google Account access
 ↓
GitHub repositories
 ↓
local environment
 ↓
Apps Script source
 ↓
Script Properties / triggers / deployment
 ↓
Google Sheets
 ↓
Google Drive
 ↓
frontend
 ↓
functional verification
~~~

## GitHub recovery

Clone the repository and verify:

~~~text
git status
git log -1 --oneline
~~~

The Customer concurrency rollback checkpoint created before the fix is:

~~~text
pre-customer-concurrency-fix-2026-10-05
~~~

Do not delete or rewrite it without an explicit recovery reason.

## Apps Script recovery

Install Node.js, npm and clasp.

~~~text
clasp login
clasp status
clasp push
~~~

Before pushing, compare local source with GitHub.

Preserve the existing production deployment ID and its settings. Do not create a new production deployment merely because the local environment was recreated.

## Secrets

The Core → CMS HMAC secret is stored in Script Properties under PREVIA_CORE_HMAC_SECRET.

It must never be committed to GitHub or placed in frontend code.

## Google Sheets

Verify at minimum:

- Products;
- Config;
- Customers;
- Favorites;
- Orders;
- OrderItems;
- PublicationJournal.

Do not recreate production sheets blindly.

## Google Drive

Verify:

- Products;
- Incoming;
- product SKU folders;
- PREVIA/ORDERS.

## Functional recovery test

Open CMS → Dashboard → verify statistics → verify Customer/Favorites data → verify Orders → run a safe publication/media test → open public website.

Customer recovery should include a repeated authentication check to ensure the same provider identity does not create a duplicate Customer.

## Success criteria

Recovery is complete when CMS, Sheets, Drive, authentication, Dashboard, publication, media synchronization, Customer records, Orders and the public website are working.

## Disaster recovery rule

Source code is recoverable from GitHub. Runtime business data is recovered from Google services. Secrets are restored through secure configuration, not source control.
