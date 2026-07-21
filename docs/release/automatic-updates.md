# Automatic Extension Updates

Firefox supports two update paths for permanent installations:

- AMO distribution, where Firefox receives updates after a new version is published on addons.mozilla.org.
- Self-hosted distribution, where the extension manifest points to a HTTPS update manifest through `browser_specific_settings.gecko.update_url`.

0wl is currently approved and listed on Mozilla Add-ons at version `0.1.8`:

https://addons.mozilla.org/addon/7e6f3c1073eb4e24a37d/

The current source release target is `0.1.8`.

For normal users, AMO is the recommended update path.

The default development manifest does not include `gecko.update_url` because a placeholder update URL would be unsafe to ship.

## Self-Hosted Update Manifest

Generate a starter update manifest after packaging and signing:

```sh
UPDATE_BASE_URL="https://downloads.example.org/0wl" XPI_FILE="0wl-0.1.8.xpi" npm run updates:manifest
```

This writes:

```text
web-ext-artifacts/updates.json
```

Host both files on HTTPS:

```text
https://downloads.example.org/0wl/updates.json
https://downloads.example.org/0wl/0wl-0.1.8.xpi
```

For a self-hosted stable build, the shipped manifest must include:

```json
  "browser_specific_settings": {
  "gecko": {
    "id": "0wl@princengare.github.io",
    "update_url": "https://downloads.example.org/0wl/updates.json"
  }
}
```

Do not add a placeholder `update_url` to the default manifest.

## Update Safety

On install or update, 0wl records the extension lifecycle event locally, rebuilds local settings projections, syncs scheduled dynamic DNR rules, reschedules alarm-based enforcement, and bootstraps tracking through the conservative startup path. A stale active session is invalidated instead of assigning Firefox downtime to the previous site.
