# Development Workflow

## One-Command Firefox Development

Run:

```sh
npm run firefox:dev
```

This command:

- runs an initial production build if `dist/manifest.json` is missing
- starts TypeScript type checking in watch mode
- starts Vite extension builds in watch mode
- launches Firefox through Mozilla `web-ext`
- loads the built extension from `dist/`
- reloads the extension when files in `dist/` change
- uses `.web-ext-profile/` as a dedicated development Firefox profile

The `.web-ext-profile/` folder is ignored by git because it can contain extension runtime data.

## Manual Development Loop

Use this when you want separate terminals:

```sh
npm run build:watch
npm run typecheck:watch
npm run firefox
```

`npm run firefox` loads `dist/` with `web-ext run`.

## Development Data Safety

Development builds should use the dedicated `.web-ext-profile/` profile. Do not point development runs at your everyday Firefox profile if you care about preserving stable browsing history and tracking data.
