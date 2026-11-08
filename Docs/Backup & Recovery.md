# PREVIA Backup & Recovery

Documentation revision: 2026-11-08
Status: Production
Repository checkpoint: `fa347b0ff3c3bf8a06d3cbb8a85ae27bbb9a0551`

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
commit fa347b0ff3c3bf8a06d3cbb8a85ae27bbb9a0551

Apps Script project
   ↓
owner-reported deployment version 71
   ↓
Previa CMS V3 - Hardened Media Sync
~~~

The deployment information is owner-reported and cannot be verified through GitHub. A Git commit does not update Apps Script; clasp push updates project content and deployment update is separate.

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

Before pushing, compare local source with GitHub and inspect `clasp status` and the source diff. Preserve the existing production deployment ID and settings. Do not create a new production deployment merely because the local environment was recreated.

Do not push or deploy during a documentation-only GitHub change.

## MediaSync recovery

MediaSync stores checkpoint data as a GitHub blob and the confirmed blob SHA plus run state in Script Properties. State tracks phase, base commit/tree, plan, staged objects, target commit, RunId, generation, lease, retry count and `retryNotBeforeAt`.

- Execution yields before the four-minute work budget, with time reserved for commit work; the checkpoint is continued through a one-shot trigger.
- Script Lock serializes state and trigger updates. RunId, generation and lease prevent stale/concurrent work from taking ownership.
- After continuation, Drive inventory is verified again before later phases resume; a changed inventory causes replanning.
- Missing SKU folders preserve old manifest entries. Other Drive errors and invalid/truncated Git trees stop planning before deletion.
- GitHub publication uses blobs → one tree → one commit → non-force ref update. Ref update rechecks branch HEAD; an external change causes a conflict and the next recovery rebuilds from current branch state.
- Safe transient GitHub requests have bounded retries. GitHub Retry-After is carried into `retryNotBeforeAt`; ref updates are not retried.
- If trigger creation fails, state becomes explicitly failed for manual recovery, while the confirmed checkpoint and run/generation identity are retained. It does not loop creating triggers.
- A no-op creates no commit.

Do not clear state or triggers while a run is active. If state is terminally failed, inspect Dashboard status and Apps Script executions, identify/fix the cause, then use the authorized manual recovery path. Checkpoint scheduling failure requires owner intervention.

## Checking the live Media Audit trigger

`setupMediaSyncAuditWorker()` deletes existing project triggers whose handler is exactly `startMediaSyncAudit`, then creates an every-30-days time-driven trigger. A sequential setup replaces the old one; the function is not lock-protected, so simultaneous setup calls can race. If creation fails after deletion, the call throws and no audit trigger may remain. The Sheets menu exposes **Setup Media Audit Worker**; the Dashboard does not expose audit controls. Run `startMediaSyncAudit()` manually from the Apps Script function selector for an immediate audit; it refuses if MediaSync state already exists.

GitHub code/tests cannot verify live trigger existence, creation date, next run, execution history or duplicates. The owner should open Apps Script **Triggers**, confirm one `startMediaSyncAudit` time-driven trigger, and check **Executions** for `startMediaSyncAudit`/`continueMediaSync`. Apps Script chooses the actual next execution time. If absent/duplicated, run the menu setup once and verify the trigger list again.

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
