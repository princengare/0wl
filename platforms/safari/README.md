# 0wl Safari Support

0wl supports Safari as the same local-first product, not as a separate app. Safari distribution uses a Safari Web Extension app wrapper, so the WXT build is only the first step.

## Prerequisites

- macOS
- Xcode with command line tools
- Safari
- Apple Developer account for signing, App Store distribution, or notarized distribution

## Build Safari Web Extension Assets

From the repository root:

```sh
npm run build:safari
```

WXT writes Safari-compatible extension assets to:

```text
.output/safari-mv2/
```

## Generate The Xcode Wrapper

Use Apple tooling through the project script:

```sh
npm run safari:convert
```

This runs:

```sh
xcrun safari-web-extension-converter .output/safari-mv2 \
  --project-location platforms/safari/xcode \
  --app-name 0wl \
  --bundle-identifier io.github.princengare.0wl \
  --swift \
  --macos-only \
  --copy-resources \
  --no-open \
  --no-prompt \
  --force
```

Override the bundle identifier when needed:

```sh
SAFARI_BUNDLE_IDENTIFIER="com.yourname.0wl" npm run safari:convert
```

If the wrapper already exists and you need to regenerate it from the latest `.output/safari-mv2` assets:

```sh
npm run safari:rebuild
```

The regeneration flow overwrites the generated Xcode wrapper resources. Re-check any local Xcode signing/team settings after regenerating.

## Open In Xcode

```sh
npm run safari:open
```

Or open the generated `.xcodeproj` under:

```text
platforms/safari/xcode/
```

## Run Locally In Safari

1. Build and convert:

   ```sh
   npm run safari:convert
   ```

2. Open the generated Xcode project.
3. Select the macOS app scheme.
4. Run the app from Xcode.
5. Open Safari.
6. Enable unsigned extensions if needed from Safari developer settings.
7. Enable 0wl in Safari Extensions settings.
8. Test active website tracking, dashboard loading, blocked-site redirects, time limits, and Vision.

## Signing And Distribution

Safari extensions are distributed through the generated app wrapper.

Typical release flow:

1. Build `.output/safari-mv2`.
2. Rebuild the Xcode wrapper.
3. Configure signing in Xcode.
4. Archive the app.
5. Distribute through the Mac App Store or another Apple-supported signed/notarized path.

App Store distribution requires Apple review. WXT builds the web-extension assets but does not replace the Xcode signing/archive flow.

## Local Data

Safari extension data is platform-specific. Firefox, Chrome, Edge, Opera, and Safari do not share IndexedDB or `browser.storage.local` data automatically.

0wl does not add cloud sync, accounts, telemetry, or backend services for Safari.

## Known Safari Caveats

0wl uses runtime feature detection for Safari-sensitive APIs:

- `idle`: Safari builds omit the `idle` permission and treat missing idle support as active. This means idle exclusion is partial until manually verified in Safari.
- `alarms`: scheduled block, time-limit, and friction windows use alarms when Safari exposes the API; otherwise rules refresh on startup, settings changes, and other background wakeups.
- `declarativeNetRequest`: blocking, time-limit redirects, and friction redirects use dynamic DNR rules when Safari exposes them. If Safari does not support the required DNR behavior, saved rules remain local but enforcement is partial.
- background lifecycle: 0wl remains event-driven and never counts browser downtime from stale runtime timestamps.

Manual Safari testing is required before claiming full Safari support.
