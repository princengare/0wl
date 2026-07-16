# Release Process

0wl uses semantic versioning:

```text
0.1.0  Initial tracker
0.2.0  Blocking and limit improvements
0.1.3  Vision insights, WXT cross-browser builds, and UI consistency with the 0wl aesthetic
0.1.4  Settings data control, local backups, 0wl footers, and concise Vision summaries
0.3.0  Expanded behavioral intelligence
1.0.0  Stable public release
```

Release status:

- Source target: `0.1.4`
- Approved version: `0.1.4`
- Status: 0.1.4 approved and listed on Mozilla Add-ons.
- Listing: https://addons.mozilla.org/addon/7e6f3c1073eb4e24a37d/

## Stable Release Checklist

1. Update `package.json` to the new version. WXT generates the extension manifest version from the package metadata.
2. Update `CHANGELOG.md`.
3. Run `npm run release:prepare`.
4. Review the generated WXT artifact in `.output/`.
5. Sign the extension with `npm run sign:firefox`.
6. Publish through AMO or host the signed self-distributed `.xpi`.
7. If self-hosting updates, publish `updates.json` and ensure the shipped manifest uses the real HTTPS `gecko.update_url`.
8. For Safari, run `npm run safari:convert`, then sign/archive the generated app wrapper in Xcode.

## Release Commands

```sh
npm run release:check
npm run release:prepare
npm run package
npm run sign:firefox
npm run build:safari
npm run safari:convert
```

`npm run release:check` verifies the built manifest, extension name, version alignment, Firefox extension ID, and manifest-referenced output files.

`npm run release:prepare` runs lint, tests, the Firefox WXT build, release verification, `web-ext lint`, and packaging.

## Stable vs Development Channels

Development channel:

- loaded through `npm run dev:firefox`
- uses `.web-ext-profile/`
- may contain test data
- can reload frequently

Stable channel:

- signed `.xpi`
- persistent Firefox installation
- production user data
- update-safe migrations
- automatic updates through AMO or a real self-hosted update manifest
