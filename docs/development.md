# Development Workflow

## One-Command Firefox Development

Run:

```sh
npm run firefox:dev
```

This command:

- runs an initial production build
- starts TypeScript type checking in watch mode
- starts Vite extension builds in watch mode
- waits for the first watched build to finish
- launches Firefox through Mozilla `web-ext`
- loads the built extension from `dist/`
- reloads the extension when files in `dist/` change
- uses `.web-ext-profile/` as a dedicated development Firefox profile

Vite watch builds do not empty `dist/` while rebuilding. This prevents Firefox from reloading a half-built extension where `manifest.json` exists but `popup/index.html` or icons are temporarily missing.

The `.web-ext-profile/` folder is ignored by git because it can contain extension runtime data.

## Manual Development Loop

Use this when you want separate terminals:

```sh
npm run build:watch
npm run typecheck:watch
npm run firefox
```

`npm run firefox` loads `dist/` with `web-ext run`.

When loading manually from `about:debugging#/runtime/this-firefox`, select `dist/manifest.json`, not `public/manifest.json`.

## Development Data Safety

Development builds should use the dedicated `.web-ext-profile/` profile. Do not point development runs at your everyday Firefox profile if you care about preserving stable browsing history and tracking data.
