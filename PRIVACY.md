# Privacy

0wl is local-first.

## What Stays Local

The extension stores data locally in Firefox extension storage:

- normalized domains
- completed usage sessions
- daily usage aggregates
- blocked domains
- time-limited domains
- blocked-attempt counts
- runtime tracking state

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
