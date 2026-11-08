# PREVIA Backup & Recovery

Documentation revision: 2026-11-08  
Status: Active

## Purpose and recoverable components

Recovery may involve:
1. Google Sheets: Products, Config, Customers, Favorites, Orders, OrderItems, PublicationJournal and other runtime sheets.
2. Google Drive: Products images, Incoming and order documents.
3. Google Apps Script: source, Script Properties, triggers and deployments.
4. GitHub: source, documentation, tests and public catalog/media.
5. Local development environment and clasp configuration.

GitHub and Apps Script deployments are separate versioning systems. A Git commit does not update Apps Script; `clasp push` changes project content, while updating a deployment is a separate operation.

The project owner reports deployment version 71 (`Previa CMS V3 - Hardened Media Sync`) for the operational checkpoint. GitHub cannot verify the live deployment, Script Properties or triggers.

## MediaSync state and recovery

MediaSync persists run ownership and progress in Script Properties and stores checkpoint content as a GitHub blob referenced by its SHA. Checkpoint state includes the run/generation, phase, base commit/tree, plan, staged blob SHAs and target commit/tree as applicable.

- **Time limit:** execution yields before the configured budget (4 minutes), reserving time for commit work. The checkpoint is saved and a continuation is scheduled.
- **Ownership:** Script Lock serializes state/trigger changes; RunId, generation and a lease fence stale or concurrent executions.
- **Continuation:** retry deadline `retryNotBeforeAt` is retained in state; trigger delay respects the deadline and Apps Script minimum trigger delay. A stale trigger cannot claim work before the deadline.
- **Revalidation:** after a continuation, Drive inventory is read again before resuming a later phase. If it changed, the plan is rebuilt.
- **Retry:** bounded automatic retry count is three. Recognized transient GitHub status/network failures may retry safe GET/blob/tree/deterministic-commit requests. Ref updates are not retried. Retry-After can defer the next attempt.
- **Conflict:** branch HEAD is rechecked and the ref update uses `force:false`. A conflict does not overwrite the external update; a later recovery starts from current branch state and replans.
- **Incomplete inventories:** Drive read failures and invalid/truncated GitHub trees stop the run before destructive planning. Missing SKU folders are preserved from the prior manifest and are not treated as empty.
- **Checkpoint scheduling failure:** state is marked failed for manual recovery while the confirmed checkpoint SHA and run identity are retained. Automatic retries stop rather than loop when a continuation trigger cannot be created.
- **No-op:** if files and manifest do not change, the run finalizes without creating a Git commit.

Do not manually clear MediaSync Script Properties or remove triggers while a run is active. First inspect the Dashboard media status and Apps Script executions; preserve the checkpoint SHA and investigate the failure before recovery. If status is terminally failed, a manual `syncMedia()`/refresh may start recovery after the cause is fixed. A failed audit-trigger scheduling state may require an owner to repair/reinstall the trigger.

## Checking the live Media Audit trigger

The repository proves that `setupMediaSyncAuditWorker()` deletes existing triggers handled by `startMediaSyncAudit` before creating an every-30-days time-based trigger. Only matching handler triggers are deleted; other project triggers are left alone. Sequential setup calls replace the prior trigger. Setup has no lock, so concurrent setup calls could race. If creation fails after deletion, the setup call throws and no audit trigger may remain. The source and automated tests cannot prove the live Apps Script trigger inventory or run history; the setup function itself has no dedicated automated test.

Owner self-check in the Apps Script project:
1. Open **Triggers** (clock icon) in the Apps Script editor.
2. Find handler `startMediaSyncAudit`; confirm exactly one time-driven trigger and inspect its event source/type and schedule.
3. Check Apps Script **Executions** for completed/failed runs of `startMediaSyncAudit` and `continueMediaSync`.
4. If the trigger is absent or duplicated, use the spreadsheet menu **PREVIA CMS → Setup Media Audit Worker** once, then reopen Triggers and verify one handler entry. This setup deletes existing project triggers with that same handler before creating its replacement.
5. Apps Script chooses the actual next execution time for time-driven triggers; do not infer a precise next-run timestamp from the source's 30-day interval.

The Dashboard has no Media Audit setup/run control. To run an audit immediately, select `startMediaSyncAudit` from the Apps Script function selector and run it. It will refuse if MediaSync state already exists. This manual check/run is outside GitHub verification.

## General recovery order

```text
Google Account access → GitHub → local environment → Apps Script source
→ Script Properties/triggers/deployment → Sheets → Drive → frontend
→ functional verification
```

Clone/restore source from the intended GitHub commit. Before any Apps Script write, compare local source with the target repository/deployment and preserve the current production deployment settings. Do not push or redeploy merely because a local environment was recreated.

## Secrets and runtime data

The Core → CMS HMAC secret is stored in Script Properties under `PREVIA_CORE_HMAC_SECRET`. Never commit it or place it in frontend code. Restore secrets through secure configuration, not source control. Verify production Sheets and Drive folders before recreating anything.

## Functional recovery

After source and service access are restored, verify Dashboard status, catalog, image paths, Customer/Favorites, Orders and public site. Use a controlled media test only after reviewing the current checkpoint, inventory and intended target branch.

Source code is recoverable from GitHub; runtime data and secrets require their respective Google services and secure configuration.
