# Security and Privacy

0wl is designed as a local-first Firefox extension. It should not send browsing history, blocked domains, time limits, or behavioral data to a server.

## Do Not Commit Sensitive Data

Before pushing to GitHub, keep these out of commits:

- Firefox profile folders
- IndexedDB snapshots
- `browser.storage.local` exports
- browsing history exports
- blocked-site or time-limit exports
- extension signing keys
- `.env` files
- `web-ext` API credentials
- packaged `.xpi` files

The project `.gitignore` already excludes common local-data paths and secret file types, but still review `git status` before every push.

## Recommended Pre-Push Check

Run:

```sh
git status --short --ignored
```

Sensitive local files should either be ignored or absent. Source files, tests, public manifest assets, and documentation are the intended files to commit.

## Reporting Issues

If you find a security or privacy issue, open a private advisory if the repository supports it, or contact the maintainer privately before publishing exploit details.
