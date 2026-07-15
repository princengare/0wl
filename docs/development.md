# Development Workflow

## One-Command Browser Development

Run Firefox development:

```sh
npm run dev:firefox
```

Run Chrome development:

```sh
npm run dev:chrome
```

Run Safari-targeted WXT development:

```sh
npm run dev:safari
```

These WXT commands:

- build the selected browser target
- launch the browser development runner
- load the extension automatically
- reload the extension when source files change
- use WXT output under `.output/`

WXT owns the browser-specific development output so the Firefox, Chrome, Edge, Opera, and Safari web-extension asset builds can come from the same source tree.

Generated folders such as `.output/`, `.wxt/`, and `.web-ext-profile/` are ignored by git because they can contain build output or browser runtime data.

## UI Style System

0wl uses a terminal-style black-and-white interface across extension pages and docs.

Current UI conventions:

- Use bundled JetBrains Mono with `ss01` and slashed-zero OpenType features.
- Use bracket checkboxes: `[ ]` for off and `[✓]` for on.
- Underline checkbox rows on hover or keyboard focus.
- Use custom terminal dropdowns instead of native `<select>` controls in the dashboard.
- Dropdown menus open underneath the field, invert colors on hover/focus/selection, then close after selection.
- Keep dashboard header tabs on one horizontal line where practical.

## Manual Development Loop

Use this when you want separate terminals:

```sh
npm run build:firefox
npm run build:chrome
npm run build:edge
npm run build:opera
npm run build:safari
npm run typecheck:watch
```

When loading manually from `about:debugging#/runtime/this-firefox`, select `.output/firefox-mv3/manifest.json`.

For Chromium-family browsers, load the generated unpacked folder:

- Chrome: `.output/chrome-mv3/`
- Microsoft Edge: `.output/edge-mv3/`
- Opera: `.output/opera-mv3/`
- Safari assets: `.output/safari-mv2/`

Safari local testing also needs the Xcode wrapper:

```sh
npm run safari:convert
npm run safari:open
```

Regenerating the Safari wrapper can overwrite generated Xcode resources, so re-check local Xcode signing/team settings afterward.

See `platforms/safari/README.md` for the full Safari flow.

## Development Data Safety

Development builds should use dedicated development profiles. Do not point development runs at your everyday browser profile if you care about preserving stable browsing history and tracking data.

Safari builds use WXT's Safari MV2 compatibility output. Full Safari distribution still requires Safari Web Extension conversion, Xcode signing/archive steps, and browser-specific manual testing.
