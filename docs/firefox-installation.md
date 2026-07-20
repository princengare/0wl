# Firefox Installation

## Stable Firefox Add-ons Installation

0wl is approved and listed on Mozilla Add-ons.

Current approved version: `0.1.5`

Current source release target: `0.1.6`

Install from Firefox Add-ons:

https://addons.mozilla.org/addon/7e6f3c1073eb4e24a37d/

Firefox handles normal AMO-listed extension installation and updates after approved versions are published.

## Temporary Development Installation

For local development:

```sh
npm install
npm run dev:firefox
```

Or build and load `.output/firefox-mv3/manifest.json` from `about:debugging#/runtime/this-firefox`:

```sh
npm run build:firefox
```

Do not load a source manifest. WXT generates the runnable Firefox manifest, pages, and background script into `.output/firefox-mv3/`.

Temporary installations are removed when the development browser profile is reset or the add-on is unloaded.

## Persistent Installation

The recommended persistent installation path for normal users is the Mozilla Add-ons listing above.

Maintainers can also create signed release packages. Firefox release and beta builds require Mozilla signing for extensions.

Maintainer signing path:

```sh
npm run release:prepare
npm run sign:firefox
```

`npm run sign:firefox` requires Mozilla Add-ons credentials in the environment. Keep those credentials out of git.

After signing, install the signed `.xpi` in Firefox or publish it through AMO. A persistent installation keeps the extension installed across Firefox restarts and lets the background bootstrap run whenever Firefox opens.

## Extension ID

The manifest currently sets:

```json
"browser_specific_settings": {
  "gecko": {
    "id": "0wl@princengare.github.io"
  }
}
```

Keep this ID stable once real users install the extension. Changing it makes Firefox treat the add-on as a different extension, which breaks persistent updates and separates local extension data.
