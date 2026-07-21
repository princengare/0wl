# Privacy Policy

Last updated: July 20, 2026

0wl is a local-first browser extension. Its core privacy promise is simple: browsing activity tracked by 0wl stays in the browser where 0wl is installed.

## What 0wl Stores Locally

0wl may store the following data in browser extension storage:

- normalized website domains, such as `github.com`
- active browsing sessions and timestamps
- daily usage aggregates
- Picture-in-Picture and background media sessions
- blocked-site rules
- time-limit rules
- schedules for blocks, limits, and friction rules
- blocked-site attempt counts
- Vision categories, events, summaries, and recommendations
- settings and runtime recovery state
- local backup/import metadata when you use Data Control

This data is stored with browser-local extension storage such as IndexedDB and `browser.storage.local`.

## What 0wl Does Not Store

0wl does not intentionally store:

- full visited URLs
- URL paths
- query strings
- page titles
- page content
- form contents
- keystrokes
- passwords
- account credentials
- payment information
- cloud account data

## What 0wl Sends

0wl does not send browsing history or usage data to a server.

0wl does not use:

- analytics SDKs
- telemetry
- advertising trackers
- user accounts
- cloud sync
- a backend database
- an AI or LLM API

## Private and Incognito Windows

Private/incognito tracking is off by default.

If you enable private/incognito tracking in 0wl and your browser separately allows 0wl to run in private/incognito windows, 0wl can track and enforce rules in that private/incognito context. Private/incognito rules and usage are stored separately where the app supports separate scopes.

0wl links to this policy from the private browsing tracking enable popup so you can review what is tracked before enabling private/incognito tracking.

Browser vendors control whether extensions may run in private/incognito windows. 0wl cannot force that access by itself.

## Permissions

0wl requests only the extension permissions it needs to work:

- `tabs`: detect active tabs, tab URLs, tab changes, and media/audible status
- `storage`: save local settings and runtime state
- `idle`: avoid counting active browsing time when the user is idle, where supported
- `alarms`: schedule rule refreshes without a forever-running background loop
- `declarativeNetRequest`: redirect blocked or over-limit top-level navigations
- host access for `http://*/*` and `https://*/*`: detect trackable domains and enforce local rules

0wl does not use host access to store full page content.

## Data Control

0wl includes local Data Control tools in Settings.

Data Control also links to this privacy policy under Site Categories so local data status and privacy details stay close together.

You can:

- view local data status
- export a local JSON backup
- import a local backup
- choose history retention
- delete specific local data categories
- reset local data after confirmation

Exported backup files may contain sensitive browsing patterns. Keep them private and do not commit them to GitHub.

0wl may also run a local repair pass for impossible usage rows caused by stale runtime state. This repair stays in your browser, removes only mathematically invalid active sessions or 24-hour-plus active sessions, refuses to write new 24-hour-plus active sessions, and rebuilds derived daily aggregates from valid completed sessions.

Normal Vision reports use regular-window sessions, transitions, blocked attempts, and block rules only. Private-window browsing and private-window blocked sites are not shown in normal Vision block outcomes or recommendations.

## Website Privacy

The 0wl project website is a static documentation site.

The site itself does not include 0wl analytics, telemetry, advertising scripts, accounts, forms, or cookies.

When 0wl opens public project pages at `https://princengare.github.io/0wl/`, those pages are treated as app/documentation surfaces and are excluded from active browsing and media tracking.

The site links to external services such as Mozilla Add-ons and GitHub, which have their own privacy practices.

## Updates and Migrations

0wl uses local migrations when the extension changes its data model. The goal is to preserve existing sessions, settings, blocked sites, time limits, schedules, and Vision data across updates whenever technically possible.

Version `0.1.7` keeps the same database name and stores while preserving the local aggregate index and keeping the usage repair described above active before History reads.

## Open Source

0wl is open source so users can inspect how local data is handled. Local browser profile data, exported backups, signing credentials, and API secrets should not be committed to the repository.
