# Release Process

0wl uses semantic versioning:

```text
0.1.0  Initial tracker
0.2.0  Blocking and limit improvements
0.3.0  Distraction pathways
1.0.0  Stable public release
```

Current public release:

- Version: `0.1.2`
- Status: approved and listed on Mozilla Add-ons
- Listing: https://addons.mozilla.org/addon/7e6f3c1073eb4e24a37d/

## Stable Release Checklist

1. Update `package.json` and `public/manifest.json` to the same version.
2. Update `CHANGELOG.md`.
3. Run `npm run release:prepare`.
4. Review the generated artifact in `web-ext-artifacts/`.
5. Sign the extension with `npm run sign:firefox`.
6. Publish through AMO or host the signed self-distributed `.xpi`.
7. If self-hosting updates, publish `updates.json` and ensure the shipped manifest uses the real HTTPS `gecko.update_url`.

## Release Commands

```sh
npm run release:check
npm run release:prepare
npm run package
npm run sign:firefox
```

`npm run release:check` verifies the built manifest, extension name, version alignment, Firefox extension ID, and manifest-referenced output files.

`npm run release:prepare` runs lint, tests, build, release verification, `web-ext lint`, and packaging.

## Stable vs Development Channels

Development channel:

- loaded through `npm run firefox:dev`
- uses `.web-ext-profile/`
- may contain test data
- can reload frequently

Stable channel:

- signed `.xpi`
- persistent Firefox installation
- production user data
- update-safe migrations
- automatic updates through AMO or a real self-hosted update manifest
