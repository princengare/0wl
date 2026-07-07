# Firefox Installation

## Temporary Development Installation

For local development:

```sh
npm install
npm run build
npm run firefox
```

Or load `dist/manifest.json` from `about:debugging#/runtime/this-firefox`.

Temporary installations are removed when the development browser profile is reset or the add-on is unloaded.

## Persistent Installation

Persistent installation in regular Firefox requires a signed extension package. Firefox release and beta builds require Mozilla signing for extensions.

Current stable path:

```sh
npm run release:prepare
npm run sign:firefox
```

`npm run sign:firefox` requires Mozilla Add-ons credentials in the environment. Keep those credentials out of git.

After signing, install the signed `.xpi` in Firefox. A persistent installation keeps the extension installed across Firefox restarts and lets the background bootstrap run whenever Firefox opens.

## Extension ID

The manifest currently sets:

```json
"browser_specific_settings": {
  "gecko": {
    "id": "0wl@example.local"
  }
}
```

Keep this ID stable once real users install the extension. Changing it makes Firefox treat the add-on as a different extension, which breaks persistent updates and separates local extension data.
