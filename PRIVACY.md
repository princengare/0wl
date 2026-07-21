# Privacy

0wl is local-first.

## What Stays Local

The extension stores data locally in browser extension storage:

- normalized domains
- completed usage sessions
- daily usage aggregates
- Picture-in-Picture and background media sessions
- blocked domains
- time-limited domains
- schedules for blocks, limits, and friction rules
- blocked-attempt counts
- Vision categories, events, summaries, and recommendations
- runtime tracking state
- settings and local Data Control metadata

## What 0wl Does Not Store in V1

0wl does not store:

- full visited URLs
- URL paths
- query strings
- page titles
- page content
- accounts
- passwords
- cloud data
- page content
- keystrokes

## Private and Incognito Windows

Private/incognito tracking is off by default. If you enable it in 0wl and your browser also allows 0wl to run in private/incognito windows, 0wl can track and enforce rules in that private/incognito context.

Private/incognito rules and usage are scope-aware where the app supports separate scopes.

## App Surface Exclusion

The public 0wl documentation and privacy-policy pages at `https://princengare.github.io/0wl/` are treated as app/documentation surfaces and are excluded from active browsing and media tracking.

0wl links to the public privacy policy from private browsing tracking settings and Data Control.

## Data Control

Settings includes local Data Control tools for viewing local data status, exporting a JSON backup, importing backups, choosing retention, deleting specific local data categories, and resetting local data after confirmation.

Exported backup files may contain sensitive browsing patterns. Keep them private and do not commit them.

0wl may run a local repair pass for impossible usage rows caused by stale runtime state. This stays in your browser, removes only mathematically invalid active sessions or 24-hour-plus active sessions, refuses to write new 24-hour-plus active sessions, and rebuilds derived daily aggregates from valid completed sessions.

Normal Vision reports use regular-window sessions, transitions, blocked attempts, and block rules only. Private-window browsing and private-window blocked sites are not shown in normal Vision block outcomes or recommendations.

## Network Policy

0wl should not:

- send browsing history anywhere
- use analytics SDKs
- use telemetry
- call external APIs
- require a backend
- require authentication
- use cloud sync

## Open Source Safety

Do not commit local Firefox profile folders, IndexedDB data, exported browsing history, `.env` files, signing keys, or `web-ext` credentials.
