# Extension Data Migration

0wl stores historical usage in IndexedDB and small settings/runtime records in `browser.storage.local`.

## IndexedDB

Database constants live in `src/shared/constants.ts`.

Current database:

- name: `focus_tracker`
- version: `2`

Stores:

- `sessions`
- `daily_usage`
- `block_attempts`
- `domain_transitions`
- `browsing_intents`

Schema creation is centralized in `src/db/database.ts`, and startup opens the database through `src/db/migrations.ts`.

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

These actions operate on local extension storage in the current browser. They do not add cloud sync, accounts, telemetry, or remote backup.

## Update Safety Rules

On update or reload:

- do not count unknown downtime
- invalidate stale active runtime sessions
- re-read current browser state
- rebuild dynamic blocking, time-limit, and friction rules
- reschedule block, time-limit, and friction alarms from saved settings
- validate settings before use
- start a new eligible session from the current timestamp only
