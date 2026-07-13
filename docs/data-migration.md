# Extension Data Migration

0wl stores historical usage in IndexedDB and small settings/runtime records in `browser.storage.local`.

## IndexedDB

Database constants live in `src/shared/constants.ts`.

Current database:

- name: `focus_tracker`
- version: `1`

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

## Update Safety Rules

On update or reload:

- do not count unknown downtime
- invalidate stale active runtime sessions
- re-read current browser state
- rebuild dynamic blocking and time-limit rules
- reschedule block and time-limit alarms from saved settings
- validate settings before use
- start a new eligible session from the current timestamp only
