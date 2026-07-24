# Extension Data Migration

0wl stores historical usage in IndexedDB and small settings/runtime records in `browser.storage.local`.

## IndexedDB

Database constants live in `src/shared/constants.ts`.

Current database:

- name: `focus_tracker`
- version: `3`

Stores:

- `sessions`
- `daily_usage`
- `block_attempts`
- `domain_transitions`
- `browsing_intents`

Schema creation is centralized in `src/db/database.ts`, and startup opens the database through `src/db/migrations.ts`.

Version `3` preserves all stores and records while changing the `daily_usage` date/domain index to non-unique so regular and private aggregate rows can coexist safely for the same domain and day.

Future IndexedDB changes should:

- increment `DATABASE_VERSION`
- add upgrade logic in `src/db/database.ts`
- keep completed sessions as the source of truth
- preserve `daily_usage` as a rebuildable aggregate
- add tests for old-to-new schema upgrades

## Settings

Settings migrations are handled by `SettingsStore.migrateStoredSettings()`.

Current protections:

- creates default settings when none exist
- repairs legacy schema-1 settings that predate time limits
- migrates existing blocked sites to `Always active` schedules
- migrates existing time limits to `Always active` schedules
- migrates existing scheduled break rules without a break duration to a 5-minute break
- normalizes stored domains
- removes malformed blocked-domain and time-limit rows
- clears invalid idle-threshold values back to the default
- persists repaired settings during bootstrap

## Lifecycle Metadata

`LifecycleStore` stores non-sensitive extension lifecycle metadata in `browser.storage.local`.

Stored fields include:

- extension ID
- installed version
- previous version
- install/update reason
- temporary install flag
- last settings migration timestamp
- migration revision

It does not store browsing history, visited URLs, page titles, blocked attempts, or domain usage records.

## Browser-Specific Storage

Firefox, Chrome, Edge, Opera, and Safari each keep their own extension storage. Safari data does not automatically import Firefox or Chromium data. 0wl does not add cloud sync or account-based transfer.

## Data Control

Version `0.1.4` adds a Settings Data Control section for local backup and cleanup.

Data Control can:

- show local counts and storage status
- export a local JSON backup
- import a backup by merge or confirmed replace
- set history retention, defaulting to `Forever`
- clear selected local data categories after typed confirmation
- reset settings or all local data only after confirmation

Version `0.1.8` keeps automatic usage-data repair active on startup and before Today/History reads. 0wl can remove impossible active sessions that are 24 hours or longer, mathematically inconsistent, or part of an impossible overlapping one-hour active bucket, reset stale live runtime state without awarding phantom time, and rebuild the derived `daily_usage` aggregate from remaining valid sessions. Stale aggregate rows are rebuilt even when individual rows are under 24 hours. New session writes also refuse to persist 24-hour-plus active sessions. Settings, blocked sites, time limits, Vision data, and valid sessions are preserved wherever the corrupted rows can be isolated.

Version `0.1.9` adds scheduled break settings and runtime state without changing the IndexedDB database name or object stores. Existing settings migrate forward with `scheduledBreakRules: []`, so breaks are not enabled until the user creates a rule. Existing scheduled break rules that predate configurable break duration migrate to a 5-minute break without changing their enabled state. Local Device Sync import is additive by default, previews conflicts before applying, skips duplicate sessions, records source browser/extension metadata for diagnostics, and rebuilds `daily_usage` from merged sessions instead of summing imported aggregates.

These actions operate on local extension storage in the current browser. They do not add cloud sync, accounts, telemetry, or remote backup.

## Update Safety Rules

On update or reload:

- do not count unknown downtime
- invalidate stale active runtime sessions
- treat legacy tracking runtime state without a saved window scope as regular
- repair impossible active-session rows, impossible hourly active buckets, and stale daily aggregates without clearing unrelated local data
- re-read current browser state
- rebuild dynamic blocking, time-limit, and friction rules
- reschedule block, time-limit, scheduled break, and friction alarms from saved settings
- validate settings before use
- start a new eligible session from the current timestamp only
