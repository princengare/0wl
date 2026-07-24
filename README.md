# 0wl

0wl is a standalone, local-first browser extension for tracking active website usage and blocking distracting sites.

The public stable release is currently Firefox-first and Mozilla-approved. The codebase now uses WXT so Firefox, Chrome, Microsoft Edge, Opera, and Safari web-extension assets can be produced from one shared React/TypeScript source tree.

Project site: https://princengare.github.io/0wl/

Firefox Add-ons listing: https://addons.mozilla.org/addon/7e6f3c1073eb4e24a37d/

Current codebase release: `0.1.9`

Current Mozilla-approved listing: `0.1.9`

Documentation maintenance note: after each user-facing edit, update this README, the public project site, and the privacy policy when the edit affects privacy behavior. Edits made on the same day should be grouped under the next incrementing version number.

0wl aesthetic note:

- Bundled JetBrains Mono is used across extension pages with the `ss01` and slashed-zero OpenType features.
- Dashboard checkboxes now use the 0wl `[ ]` and `[✓]` terminal style with underline hover/focus feedback.
- Dashboard dropdowns now use custom black-and-white terminal menus instead of native browser select controls.
- Dashboard header tabs stay on one horizontal line, with Settings shown as the bracketed gear control.
- Vision section headings are smaller and denser to match the rest of the dashboard.
- The History average line alignment was tightened so it sits at the computed chart value.
- Settings and interstitial pages now include the `0wl · icon` footer, with the icon opening the dashboard Today view.
- The dashboard `[0wl]` title can toggle into the 0wl icon, preview the alternate state on hover, pause that hover preview briefly after a click, and remember that local UI choice.
- Data Control actions use terminal-style confirmation popups with `[x]` close controls, inverted action-button hover states, and short-lived status messages.
- Vision pathways now compress repeated domains and research/dev loops into short behavioral summaries instead of long raw domain chains.
- Picture-in-Picture and background media are tracked as separate history modes where the browser exposes PiP state, and live media sessions appear in History before playback stops.
- Privacy-policy links are available from private browsing tracking and Data Control, and the public 0wl documentation/privacy site is treated as app surface rather than browsing time.
- Version `0.1.8` hardens zero-limit/private tracking repair, cleans impossible overlapping History buckets, keeps regular-window live tracking visible in History and Today, and makes blocked/time-limit interstitial pages fit inside one viewport with their footer.
- Version `0.1.9` adds local export/import browser sync diagnostics, configurable scheduled browser-usage breaks, early break resume after five minutes, Time Limits break setup mode, and a smaller popup crescent-moon Do Not Disturb for scheduled breaks.
- The popup Do Not Disturb control stays right-aligned with `Today` without increasing the spacing above total browsing time.
- Break setup labels are plain text while the duration dropdowns keep the terminal underline/input treatment.
- The break setup `[Set]` action aligns with the regular `[Limit]` action, while `Take a break after` and `, lasting for` read as two spaced blocks.
- Vision reports exclude private-window browsing, blocked attempts, and private block rules from the normal Vision views.
- These changes make the UI more consistent with the 0wl aesthetic.

## Open Source and Repository Safety

0wl is intended to be an open source extension that users can clone, build, inspect, and run for themselves.

Commit source code, tests, documentation, public extension assets, `package.json`, and `package-lock.json`.

Do not commit local runtime data or secrets, including:

- Firefox profile folders
- IndexedDB snapshots
- `browser.storage.local` exports
- browsing history exports
- blocked-domain or time-limit exports
- `.env` files
- extension signing keys
- `web-ext` API credentials
- packaged `.xpi` files

The repo includes:

- [PRIVACY.md](./PRIVACY.md) for the local-first privacy model.
- [SECURITY.md](./SECURITY.md) for sensitive-file and reporting guidance.
- [LICENSE](./LICENSE) with the MIT license.

Before pushing, run:

```sh
git status --short --ignored
```

Ignored entries such as `node_modules/`, `dist/`, `.output/`, `.wxt/`, `.DS_Store`, Firefox profiles, local exports, and browser storage data should stay out of commits.

## Quick Start

Install the stable Mozilla-approved release from Firefox Add-ons:

https://addons.mozilla.org/addon/7e6f3c1073eb4e24a37d/

For local development, install dependencies:

```sh
npm install
```

Build the Firefox extension:

```sh
npm run build:firefox
```

Run it in Firefox with WXT:

```sh
npm run dev:firefox
```

Run it in Chrome with WXT:

```sh
npm run dev:chrome
```

Build Safari web-extension assets:

```sh
npm run build:safari
```

Or load it manually:

1. Run `npm run build:firefox`.
2. Open Firefox.
3. Go to `about:debugging#/runtime/this-firefox`.
4. Click `Load Temporary Add-on`.
5. Select `/Users/ngare/Documents/0wl/.output/firefox-mv3/manifest.json`.

For Chromium-family browsers, run the matching build command and load the generated folder as an unpacked extension:

- Chrome: `.output/chrome-mv3/`
- Microsoft Edge: `.output/edge-mv3/`
- Opera: `.output/opera-mv3/`

Safari uses a different packaging flow. Build `.output/safari-mv2/`, then generate the Xcode Safari Web Extension wrapper:

```sh
npm run safari:convert
npm run safari:open
```

Safari setup details live in [platforms/safari/README.md](./platforms/safari/README.md).

## Development and Release Workflow

Detailed guides:

- [Development workflow](./docs/development.md)
- [Firefox installation](./docs/firefox-installation.md)
- [Automatic updates](./docs/release/automatic-updates.md)
- [Data migration](./docs/data-migration.md)
- [Safari wrapper](./platforms/safari/README.md)
- [Release process](./docs/release/process.md)

Useful commands:

| Command                    | Purpose                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run dev:firefox`      | Run the WXT Firefox development build with extension reload.                                 |
| `npm run dev:chrome`       | Run the WXT Chrome development build with extension reload.                                  |
| `npm run dev:safari`       | Run WXT's Safari MV2 compatibility dev build. Final Safari testing still needs Xcode/Safari. |
| `npm run typecheck`        | Generate WXT types and run TypeScript without emitting files.                                |
| `npm run typecheck:watch`  | Watch TypeScript and surface type errors.                                                    |
| `npm run build`            | Alias for the Firefox production build.                                                      |
| `npm run build:firefox`    | Type-check and build `.output/firefox-mv3/`.                                                 |
| `npm run build:chrome`     | Type-check and build `.output/chrome-mv3/`.                                                  |
| `npm run build:edge`       | Type-check and build `.output/edge-mv3/`.                                                    |
| `npm run build:opera`      | Type-check and build `.output/opera-mv3/`.                                                   |
| `npm run build:safari`     | Type-check and build `.output/safari-mv2/`.                                                  |
| `npm run build:all`        | Build Firefox, Chrome, Edge, and Opera targets.                                              |
| `npm run zip:firefox`      | Package the Firefox build with WXT.                                                          |
| `npm run zip:chrome`       | Package the Chrome build with WXT.                                                           |
| `npm run zip:edge`         | Package the Edge build with WXT.                                                             |
| `npm run zip:opera`        | Package the Opera build with WXT.                                                            |
| `npm run zip:safari`       | Package the Safari WXT output as a zip artifact.                                             |
| `npm run safari:convert`   | Build Safari assets and run Apple's Safari Web Extension converter.                          |
| `npm run safari:rebuild`   | Regenerate an existing Safari Xcode wrapper from current assets.                             |
| `npm run safari:open`      | Open the generated Safari Xcode project.                                                     |
| `npm run firefox`          | Alias for `npm run dev:firefox`.                                                             |
| `npm run firefox:dev`      | Compatibility alias for `npm run dev:firefox`.                                               |
| `npm run test`             | Run all Vitest tests.                                                                        |
| `npm run lint`             | Run ESLint.                                                                                  |
| `npm run web-ext:lint`     | Validate `.output/firefox-mv3/` with Mozilla `web-ext lint`.                                 |
| `npm run release:check`    | Inspect the Firefox manifest and referenced output files.                                    |
| `npm run release:prepare`  | Run lint, tests, Firefox build, release verification, lint, and package.                     |
| `npm run package`          | Alias for `npm run zip:firefox`.                                                             |
| `npm run sign:firefox`     | Sign `.output/firefox-mv3/` through Mozilla Add-ons credentials.                             |
| `npm run updates:manifest` | Generate a self-hosted Firefox update manifest from `UPDATE_BASE_URL`.                       |

The public stable release is listed on Mozilla Add-ons. Persistent self-distributed Firefox installs still require a signed `.xpi`, and self-hosted automatic updates require a real HTTPS update manifest URL.

Safari support now has a WXT MV2 compatibility build path and documented Xcode wrapper flow. Safari distribution still requires Apple's Safari Web Extension app wrapper, Xcode signing/archive steps, and manual Safari testing.

## How To Use It

### Automatic Tracking

Tracking starts automatically when the extension starts. You do not need to press a start button.

0wl only counts usage when all of these are true:

- Tracking is enabled.
- The browser has a focused window.
- The active tab is an `http:` or `https:` page.
- The system is active, not idle or locked.
- The active page has a valid normalized website domain.

0wl stops or switches tracking when:

- You switch active tabs.
- The active tab navigates to another domain.
- The browser loses focus.
- The browser regains focus.
- The system becomes idle or active again.
- A tab closes.
- Tracking is disabled.

### Toolbar Popup

Click the extension toolbar icon to open the popup.

The popup shows:

- Total tracked time today.
- Current tracked domain, or `inactive`.
- Current-session elapsed time.
- Top domains today.
- `Open Dashboard`, which opens the full dashboard/options page.

### Dashboard

Open the dashboard from the popup with `Open Dashboard`, or through the browser's extension options.

The dashboard has six sections:

- `Today`
- `History`
- `blocked sites`
- `time limits`
- `vision`
- `Settings`

The dashboard uses terminal-style controls throughout:

- Checkboxes render as `[ ]` when off and `[✓]` when on.
- Checkbox rows underline on hover or keyboard focus.
- Dropdowns open as black terminal menus underneath the field.
- Dropdown options invert to black text on a white background on hover, focus, or selection.
- Selecting a dropdown option closes the menu and updates the displayed value.

### Today

Use `Today` to see:

- Total tracked browsing time for the current local day.
- Ranked domains by duration.
- A simple terminal-style usage bar.

Live active-session time is included in the displayed total without prematurely writing an incomplete session to history.

### History

Use `History` to review completed browsing sessions and terminal-style usage charts.

Available tabs:

- `Today`
- `Yesterday`
- `this week`

Today and Yesterday show a 24-hour bar graph:

- One bar per hour.
- Bars are scaled against a full hour.
- Grey dotted markers label `6 AM`, `12 PM`, and `6 PM`.
- Empty hours are not clickable.
- Clicking a non-empty hour replaces the timestamp list with a ranked per-site breakdown for that hour.

Today keeps the individual timestamp/session list when no bar is selected.

Yesterday shows the hourly chart and only shows per-site details after an hour is selected.

The `this week` tab shows the current local calendar week:

- One bar per day.
- Bars are scaled against 24 hours.
- Empty days are not clickable.
- The dotted average line excludes days with no tracked usage.
- Previous/next week controls appear when previous-week data exists.

History durations under one minute are shown in seconds.

Timestamp rows show:

- Start and end time.
- Normalized domain.
- Session duration.

### blocked sites

Use `blocked sites` to manage domain blocking.

To block a site:

1. Enter a website, such as `instagram.com`, `www.instagram.com`, or `https://instagram.com/reels/`.
2. Click `Block`.
3. Choose whether the block is `Always` active or uses a custom schedule.

0wl normalizes valid input to the registrable domain. Examples:

- `www.instagram.com` becomes `instagram.com`
- `m.instagram.com` becomes `instagram.com`
- `https://instagram.com/reels/` becomes `instagram.com`
- `news.bbc.co.uk` becomes `bbc.co.uk`

Blocked domains are enforced immediately through Manifest V3 `declarativeNetRequest` dynamic rules where the browser supports them.

Blocked-site schedules support:

- Always-active blocking.
- Custom selected days.
- All-days, weekdays, and weekends shortcuts.
- Local start and end times.
- Overnight windows such as `10:00 PM-7:00 AM`.

For each blocked site, you can:

- See whether it is `Active` or `Paused`.
- Toggle it on or off.
- Change the schedule.
- Remove it.

Blocking applies to top-level navigations only. It blocks the configured domain and normal subdomains without blocking subresources embedded on unrelated websites.

### time limits

Use `time limits` to set daily time limits for specific website domains.

Use the private-window icon on the page to switch between regular-window limits and private/incognito-window limits. Private/incognito limits require enabling `Private browsing tracking enabled` in Settings and allowing 0wl in private/incognito windows through the browser's own extension settings.

To add a time limit:

1. Enter a website, such as `youtube.com`, `www.youtube.com`, or `https://youtube.com/watch?v=123`.
2. Choose a daily limit.
3. Choose whether the limit is `Always` active or uses a custom schedule.
4. Click `Limit`.

Supported daily limits:

- `1 min`
- `5 min`
- `10 min`
- `15 min`
- `30 min`
- `45 min`
- `1 hr`
- `1 hr 30 min`
- `2 hr`
- `2 hr 30 min`
- `3 hr`
- `3 hr 30 min`
- `4 hr`
- `4 hr 30 min`
- `5 hr`

Private/incognito limits also support `0 min`. A `0 min` private limit is useful when you want to block a private/incognito domain, or leave the website field blank and block all active private/incognito browsing.

Time-limit schedules support:

- Always-active limits.
- Custom selected days.
- All-days, weekdays, and weekends shortcuts.
- Local start and end times.
- Overnight windows such as `10:00 PM-2:00 AM`.

For each time-limited site, you can:

- See whether it is `Active` or `Paused`.
- Toggle it on or off.
- Change the daily limit.
- Change the schedule.
- Remove it.

0wl enforces time limits using today’s tracked usage for the normalized domain. When the active site reaches its limit, the background schedules and responds through `browser.alarms` instead of a forever-running timer. Once a domain is over its limit, 0wl also installs a dynamic main-frame redirect rule so new navigations to that domain land on the limit page.

### Scheduled Browser Breaks

Use the coffee/break icon on `Time Limits` to switch into scheduled break setup mode.

In break setup mode:

- The website field becomes `Take a break after: [duration], lasting for: [break duration]`.
- The action button changes from `Limit` to `Set`.
- The same schedule editor remains available.
- Regular and private window scopes stay separate through the incognito/private toggle.

Scheduled breaks are browser-wide. Example:

```text
Take a break after: 45 min, lasting for: 10 min
Schedule: Weekdays · 9:00 AM-5:00 PM
```

`Take a break after:` uses the same duration choices as normal time limits. Break duration is configurable from `1 min` through `1 hr`, with existing rules migrating to the default `5 min` duration.

When the active-browsing threshold is reached, 0wl redirects eligible HTTP/HTTPS browser tabs to the time-limit interstitial in break mode. Idle time, browser-unfocused time, extension pages, internal browser pages, and non-HTTP(S) pages do not count toward the break threshold. Break rules are disabled by default and only start after the user creates one.

The toolbar popup shows a boxed crescent-moon Do Not Disturb icon right-aligned with `Today` when an enabled scheduled break rule is currently relevant. Do Not Disturb pauses scheduled break counting and enforcement for that window scope until it is turned off. It does not disable normal blocked sites or daily time limits.

### Time Limit Page

When a daily time limit is reached, the browser redirects to the extension-owned time limit page where redirect rules are supported.

The time limit page shows:

- `TIME LIMIT REACHED`
- The normalized limited domain.
- The amount used today.
- `Go Back`
- `Continue Anyway`

Click `Continue Anyway` to bypass the limit for 15 minutes and return to the site. The background validates that the domain currently has an active time limit before granting the bypass. Return URLs are validated before use.

When a scheduled break is active, the same interstitial shows:

- `BREAK ACTIVE`
- The affected browser scope.
- Remaining break time when available.
- `Go Back`
- `Resume Browsing` after the first five minutes of a longer break.

When the break timer ends, or when the user resumes after the first five minutes of a longer break, 0wl clears the active break state and returns to the original HTTP/HTTPS page when that return URL is safe. Ending one active break does not disable the scheduled break rule.

### Vision

Use `vision` to review local behavioral patterns and tune site categories.

Version `0.1.3` added the first local intelligence layer:

- Seed domain categories for focus, coding, school, research, communication, neutral, mixed, entertainment, social, and distraction sites.
- User category overrides stored locally in `browser.storage.local`.
- Domain transition summaries recorded from completed sessions.
- Distraction pathway detection.
- Pre-distraction context summaries.
- Recovery-time estimates.
- Blocked-attempt heatmap data.
- Block outcome summaries and bounce-back rate.
- Substitution and net-time-reclaimed estimates.
- Attempt-chain and block-evasion summaries.
- Personalized local insights.
- Local behavior-based recommendations.
- Scheduled friction rules.
- Intent prompt records for friction pages.

Version `0.1.4` improves Vision summaries:

- Repeated same-domain runs are collapsed.
- Research/dev/search/docs/AI-tool loops are grouped before the first distraction.
- Recurring pathways are shown only after meaningful occurrence thresholds.
- Long raw chains are kept out of the main UI and moved into expandable details.
- Drift is shown as compressed context-to-distraction movement.
- Evasion is tied to actual block or intervention events rather than ordinary browsing alone.

Version `0.1.6` adds privacy and media-bucket refinements:

- Private browsing tracking links directly to the 0wl privacy policy for what is tracked inside the enable-confirmation popup.
- Data Control includes a Privacy Policy link under local Site Categories.
- Privacy-policy links now keep the terminal-style black-and-white interaction instead of browser-default link colors, and the Data Control Privacy Policy button is left aligned.
- The public 0wl documentation/privacy site is excluded from active browsing and media tracking because it is part of using the app.
- Picture-in-Picture and background media tracking are kept separate when PiP is detectable; ordinary non-active video records as background media, and live media sessions appear in History before playback stops.
- Zero-minute private browsing limits now stop tracking before redirect, reject stale live sessions in History, refuse to persist 24-hour-plus active sessions, repair impossible local usage rows without clearing valid data, and treat legacy missing runtime scope as regular so normal-window tracking recovers correctly.

Version `0.1.8` hardens update and reload safety:

- Today and History reads run usage-data repair before returning totals or chart/session rows, so impossible local rows do not keep polluting Today, Yesterday, or This Week graphs.
- Repair removes completed active-session rows that make a one-hour bucket exceed one hour, then rebuilds `daily_usage` from the remaining valid completed sessions.
- Stale `daily_usage` rows are rebuilt even when each individual row is under 24 hours, preventing old aggregate totals such as phantom all-day or multi-day usage from lingering.
- Active sessions at or above 24 hours are treated as stale recovery artifacts, not valid browsing time.
- Legacy runtime states without a window scope recover as regular-window tracking instead of making regular History look inactive.
- Time-limit redirects stop the active session before navigating to the extension interstitial, preventing zero-minute limits from producing phantom long sessions.
- Blocked-site and time-limit interstitial pages now fit inside one viewport including the footer.
- Vision reports use regular-window sessions, transitions, blocked attempts, and block rules only, so private-window blocked sites do not appear in normal Vision block outcomes.
- Vision Insights now explicitly surfaces recovery time, blocked-attempt heatmap buckets, transition analytics, focus interruptions, session drift, attempt chains, substitutions, and local block outcomes.
- Recovery-time domains are shown as boxed rows, and blocked-attempt heatmap labels use full weekday names so Tuesday and Thursday are distinct.
- Blocked-attempt heatmap recommendations use 12-hour AM/PM time labels, include the dominant domain, and apply as a scheduled block/update instead of a no-op recommendation.

The `vision` page has four tabs:

- `patterns`: common transitions, distraction pathways, focus interruptions, drift, and evasion.
- `insights`: trends, recovery, blocked-attempt heatmaps, transition analytics, focus interruption analysis, session drift, attempt chains, pre-distraction context, block outcomes, substitutions, bounce-back, and net reclaimed time.
- `recommendations`: local recommendations plus adaptive settings and friction rules.
- `site categories`: seeded and user-edited domain classifications.

All `vision` features are deterministic and local. They do not call external APIs, cloud services, LLMs, or telemetry endpoints.

Friction levels:

- `Off`: no intervention.
- `Pause`: short delay before continuing.
- `Intent`: asks why the site is being opened.
- `Delay`: longer wait before continuing.
- `Hard stop`: prevents continuation.

Friction rules support the same schedule editor used by blocks and time limits, including weekdays, weekends, custom days, and overnight windows.

### Blocked Page

When a blocked top-level navigation is attempted, the browser redirects to the extension-owned blocked page where redirect rules are supported.

The blocked page shows:

- `SITE BLOCKED`
- The normalized blocked domain.
- `You chose to block this website.`
- `Go Back`
- Today’s blocked-attempt count, when enabled in settings.

Blocked attempts are recorded locally. Repeated attempts are bucketed by normalized domain and local minute so refresh loops do not create uncontrolled rows.

### Settings

Use `Settings` to control:

- `Tracking enabled`: turns tracking on or off.
- `Private browsing tracking enabled`: allows 0wl to track and enforce rules in private/incognito windows when the browser permits it. The enable-confirmation popup links to the privacy policy for what is tracked.
- `Idle threshold`: controls how long the system must be inactive before tracking stops.
- `Show blocked attempt counts`: controls whether the blocked page shows today’s attempt count.
- `History retention`: controls how long local history is retained, with `Forever` as the default.
- `Reset Settings`: resets only 0wl settings after typed confirmation.

Idle threshold options:

- `30 seconds`
- `60 seconds`
- `2 minutes`
- `5 minutes`

Changing the idle threshold updates browser idle detection immediately where the API is supported.

Settings also includes `Data Control`.

Local Data Status shows what is stored locally:

- Storage used.
- Oldest record.
- Session count.
- Daily usage record count.
- Blocked attempt count.
- Vision event count.
- Seed and custom site category counts.
- A `Privacy Policy` link opens the public 0wl privacy policy.

Viewing the public 0wl documentation and privacy-policy pages at `https://princengare.github.io/0wl/` is treated as using 0wl, so those pages are excluded from active browsing and media tracking.

Backup actions:

- `Export All Data`: downloads a local JSON backup such as `0wl-backup-2026-07-15.json`.
- `Import Backup`: restores a local backup.
- Import defaults to `Merge with existing data`.
- `Replace existing data` requires confirmation before import.

Local Device Sync actions:

- `Export Sync Bundle`: downloads a local JSON sync bundle for another browser on the same device.
- `Preview Import`: reads a selected sync bundle and shows what would be added, skipped, updated, or conflicted before anything is applied.
- `Apply Sync Merge`: applies the previewed merge only after typed confirmation.
- `Check Local Sync`: reports the current browser, extension ID, export/import sync method, recent import/export metadata, duplicate-session prevention, conflict-review support, and known limitations.
- `Include private aggregate data`: optionally includes private aggregate usage and private rules, but private raw browsing sessions are not exported.
- `Conflict handling`: choose whether conflicts keep current local values, use imported values, or skip conflicts.

Local Device Sync in `0.1.9` is export/import based. Browser extension storage is sandboxed separately for Firefox, Chrome, Edge, Opera, and Safari, so 0wl does not pretend it can directly read another browser’s extension storage. Automatic same-device sync would require a local Native Messaging companion in a future version.

Delete Specific Data actions:

- Choose the local data category from a dropdown.
- Press `Confirm`.
- Type `confirm` in the confirmation popup before the action runs.
- Confirmation popups include `[x]` and can also be dismissed by clicking outside the popup.
- Success messages clear after four seconds.

Available specific delete targets:

- `Delete Browsing History`
- `Delete Blocked Attempts`
- `Delete Vision Analytics`
- `Reset Custom Site Categories`

Danger Zone:

- `Export Data First`
- `Reset All Local Data`

Danger Zone actions require typing:

```text
confirm
```

Data-control actions operate only on local extension storage in the current browser. They do not add accounts, cloud sync, telemetry, or remote backup.

### Footer

The Settings page and extension-owned interstitial pages include:

```text
0wl · (icon)
```

The footer sits outside the bordered frame in the black margin. The footer icon opens the dashboard Today page.

Interstitial pages with the footer:

- Blocked-site page
- Time-limit page
- Friction/intervention page

In the dashboard header, clicking `[0wl]` toggles the title into the 0wl icon. Clicking the icon toggles it back to `[0wl]`. Hovering shows the other option without a highlight. The choice is remembered locally when returning to the dashboard.

## Function Reference

### User-Facing Functions

| Function                               | Where                    | What it does                                                                                                      |
| -------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Automatic usage tracking               | Background               | Starts tracking eligible active website time when the browser starts or the background wakes.                     |
| Domain session switching               | Background               | Closes the previous domain session and starts a new one when the active normalized domain changes.                |
| Same-domain continuity                 | Background               | Keeps one continuous session when navigation stays within the same normalized domain.                             |
| Browser focus exclusion                | Background               | Stops timing when the browser loses focus and starts a new eligible session when focus returns.                   |
| Idle exclusion                         | Background               | Stops timing when the system becomes idle or locked and resumes from the active timestamp.                        |
| Startup recovery                       | Background               | Invalidates stale runtime tracking state without counting browser downtime.                                       |
| Today summary                          | Popup, Dashboard         | Shows total tracked time today and ranked domains.                                                                |
| Current session display                | Popup                    | Shows the current tracked domain and current-session elapsed time.                                                |
| History display                        | Dashboard                | Shows session history plus hourly and calendar-week bar charts built from raw sessions.                           |
| History bar selection                  | Dashboard                | Shows per-site totals for selected non-empty hours or days.                                                       |
| Calendar-week average                  | Dashboard                | Shows average usage for the displayed calendar week, excluding zero-usage days.                                   |
| Terminal checkbox controls             | Dashboard                | Uses bracket-style `[ ]` and `[✓]` controls with underline hover/focus feedback.                                  |
| Terminal dropdown controls             | Dashboard                | Uses custom black-and-white dropdown menus that close after selection.                                            |
| Bundled terminal font                  | Extension UI, Docs       | Uses bundled JetBrains Mono with `ss01` and slashed-zero OpenType features.                                       |
| Dashboard brand toggle                 | Dashboard                | Toggles `[0wl]` into the 0wl icon and remembers the local UI choice.                                              |
| Settings/interstitial footer           | Dashboard, Pages         | Shows `0wl · icon`; the icon opens the dashboard Today view.                                                      |
| Local data status                      | Dashboard                | Shows local counts, oldest record, storage used, and site-category totals.                                        |
| Export all data                        | Dashboard                | Downloads a local JSON backup of 0wl data.                                                                        |
| Import backup                          | Dashboard, Background    | Imports a local 0wl backup by merge or confirmed replace.                                                         |
| Export local sync bundle               | Dashboard                | Downloads a local-first sync bundle for importing into another browser on the same device.                        |
| Preview local sync import              | Dashboard, Background    | Validates a sync bundle and shows duplicates, adds, updates, and conflicts before applying data.                  |
| Apply local sync merge                 | Dashboard, Background    | Merges a previewed sync bundle after confirmation, skips duplicate sessions, and rebuilds daily usage.            |
| History retention setting              | Dashboard, Background    | Stores the user's retention window and prunes older local history after confirmation.                             |
| Delete specific data                   | Dashboard, Background    | Deletes selected local categories after confirmation.                                                             |
| Reset all local data                   | Dashboard, Background    | Requires typed `confirm` in the dashboard before deleting all local 0wl data in this browser.                     |
| Vision pathway compression             | Dashboard                | Shows concise behavioral summaries with raw domains and metadata in expandable details.                           |
| Add blocked domain                     | Dashboard                | Normalizes input, rejects duplicates, saves settings, and installs an active dynamic DNR redirect rule.           |
| Schedule blocked domain                | Dashboard                | Applies blocking always or only during selected local days and times.                                             |
| Pause/resume blocked domain            | Dashboard                | Enables or disables a saved blocked domain and syncs DNR rules.                                                   |
| Remove blocked domain                  | Dashboard                | Removes the domain from settings and removes its dynamic DNR rule.                                                |
| Blocked navigation redirect            | Browser/DNR              | Redirects blocked main-frame navigations to `blocked.html`.                                                       |
| Block attempt recording                | Blocked page, Background | Validates the blocked domain and records a minute-bucketed local attempt.                                         |
| Block attempt count                    | Blocked page             | Shows today’s count when the setting is enabled.                                                                  |
| Add time-limited domain                | Dashboard                | Normalizes input, rejects duplicates, saves a daily limit, and refreshes enforcement.                             |
| Schedule time-limited domain           | Dashboard                | Applies limits always or only during selected local days and times.                                               |
| Pause/resume time-limited domain       | Dashboard                | Enables or disables a saved time limit and refreshes enforcement.                                                 |
| Update time limit                      | Dashboard                | Changes a saved domain’s daily limit and clears any active bypass.                                                |
| Remove time-limited domain             | Dashboard                | Removes the saved limit and removes any corresponding DNR rule.                                                   |
| Time-limit redirect                    | Browser/DNR, Background  | Redirects an over-limit main-frame navigation or active tab to `limit.html`.                                      |
| Time-limit bypass                      | Limit page, Background   | Validates the domain and bypasses the daily limit for 15 minutes.                                                 |
| Scheduled browser break setup          | Dashboard                | Creates browser-wide active-browsing break rules from the Time Limits page.                                       |
| Scheduled break enforcement            | Background               | Counts eligible active browsing toward a break threshold and redirects tabs during the configured break.          |
| Scheduled break early resume           | Limit page, Background   | Lets longer breaks be ended after the first five minutes without disabling the saved break rule.                  |
| Scheduled break Do Not Disturb         | Popup, Background        | Pauses scheduled break counting and enforcement with the popup crescent-moon control.                             |
| Local sync diagnostics                 | Dashboard, Background    | Reports the export/import sync method, browser, extension ID, duplicate checks, conflict review, and limitations. |
| Vision report                          | Dashboard                | Builds local transition, pathway, context, recovery, substitution, and recommendation summaries.                  |
| Site categorization                    | Dashboard                | Uses seed classifications and user overrides to classify visited domains locally.                                 |
| Distraction pathway detection          | Dashboard                | Identifies recurring paths from focus activity into distracting sites.                                            |
| Behavior-based recommendations         | Dashboard                | Suggests local blocks or friction based on repeated patterns.                                                     |
| Scheduled friction rules               | Dashboard, Background    | Applies pause, intent, delay, or hard-stop interventions during selected local schedule windows.                  |
| Intent prompt recording                | Friction page            | Stores local browsing intent outcomes for friction prompts.                                                       |
| Alarm-based schedule enforcement       | Background               | Schedules one-shot wakeups for block transitions, limit windows, bypass expiry, or local midnight.                |
| Install/update lifecycle recording     | Background               | Records non-sensitive extension version, previous version, install reason, and temporary-install status.          |
| Settings migration                     | Background               | Repairs legacy or malformed local settings before syncing blocking, time-limit, and idle behavior.                |
| Update-safe recovery                   | Background               | Invalidates stale active sessions on install/update without counting unknown browser downtime.                    |
| Release verification                   | Developer tooling        | Checks version alignment, Firefox ID, extension name, and manifest-referenced build outputs.                      |
| Automatic development reload           | Developer tooling        | Builds, watches, launches Firefox, and reloads the extension with one command.                                    |
| Self-hosted update manifest generation | Developer tooling        | Creates `web-ext-artifacts/updates.json` for signed self-hosted Firefox releases.                                 |
| Tracking enabled toggle                | Dashboard                | Enables or disables all tracking.                                                                                 |
| Idle threshold selector                | Dashboard                | Updates the browser idle detection interval where supported.                                                      |
| Attempt-count visibility toggle        | Dashboard                | Shows or hides blocked-attempt counts on the blocked page.                                                        |

### Runtime Messages

The React pages communicate with the background through typed `browser.runtime.sendMessage` requests.

| Message                            | Caller                  | Response                 | Purpose                                                                                       |
| ---------------------------------- | ----------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `GET_TODAY_SUMMARY`                | Popup, Dashboard        | `TodaySummary`           | Returns today’s aggregate usage plus live current-session time.                               |
| `GET_HISTORY`                      | Dashboard               | `HistorySessionView[]`   | Returns completed sessions for `today`, `yesterday`, or the active history range.             |
| `GET_HISTORY_INTERVAL`             | Dashboard               | `HistorySessionView[]`   | Returns raw sessions overlapping an exact local-time interval, used for calendar weeks.       |
| `GET_SETTINGS`                     | Dashboard, Blocked page | `ExtensionSettings`      | Returns extension settings from `browser.storage.local`.                                      |
| `UPDATE_SETTINGS`                  | Dashboard               | `ExtensionSettings`      | Updates tracking, idle threshold, attempt-count visibility, or history retention.             |
| `ADD_BLOCKED_DOMAIN`               | Dashboard               | `ExtensionSettings`      | Normalizes and adds a blocked domain with an optional schedule, then syncs DNR rules.         |
| `REMOVE_BLOCKED_DOMAIN`            | Dashboard               | `ExtensionSettings`      | Removes a blocked domain and syncs DNR rules.                                                 |
| `SET_BLOCKED_DOMAIN_ENABLED`       | Dashboard               | `ExtensionSettings`      | Enables or pauses a blocked domain and syncs DNR rules.                                       |
| `UPDATE_BLOCKED_DOMAIN_SCHEDULE`   | Dashboard               | `ExtensionSettings`      | Updates a blocked domain schedule and resyncs active DNR rules.                               |
| `ADD_TIME_LIMITED_DOMAIN`          | Dashboard               | `ExtensionSettings`      | Normalizes and adds a daily time limit with an optional schedule, then refreshes enforcement. |
| `REMOVE_TIME_LIMITED_DOMAIN`       | Dashboard               | `ExtensionSettings`      | Removes a daily time limit and refreshes enforcement.                                         |
| `SET_TIME_LIMITED_DOMAIN_ENABLED`  | Dashboard               | `ExtensionSettings`      | Enables or pauses a daily time limit and refreshes enforcement.                               |
| `UPDATE_TIME_LIMITED_DOMAIN`       | Dashboard               | `ExtensionSettings`      | Updates the daily limit or schedule for a saved domain.                                       |
| `ADD_SCHEDULED_BREAK_RULE`         | Dashboard               | `ExtensionSettings`      | Adds a browser-wide scheduled break rule for the selected window scope.                       |
| `REMOVE_SCHEDULED_BREAK_RULE`      | Dashboard               | `ExtensionSettings`      | Removes a scheduled break rule and refreshes break enforcement.                               |
| `SET_SCHEDULED_BREAK_RULE_ENABLED` | Dashboard               | `ExtensionSettings`      | Enables or pauses a scheduled break rule.                                                     |
| `UPDATE_SCHEDULED_BREAK_RULE`      | Dashboard               | `ExtensionSettings`      | Updates the scheduled break threshold, break duration, or schedule.                           |
| `GET_SCHEDULED_BREAK_STATUS`       | Popup, Break page       | `ScheduledBreakStatus`   | Returns DND, break-active, and remaining-time status for scheduled breaks.                    |
| `SET_SCHEDULED_BREAK_DND`          | Popup                   | `ScheduledBreakStatus`   | Toggles Do Not Disturb for scheduled break counting and enforcement.                          |
| `END_SCHEDULED_BREAK`              | Break page              | `ScheduledBreakStatus`   | Ends the current active break after the five-minute early-resume window has elapsed.          |
| `GET_TIME_LIMIT_STATUS`            | Limit page              | `TimeLimitStatus`        | Returns used time, remaining time, exceeded status, and bypass state.                         |
| `BYPASS_TIME_LIMIT`                | Limit page              | `TimeLimitStatus`        | Grants a validated 15-minute bypass for an active time-limited domain.                        |
| `GET_VISION_REPORT`                | Dashboard               | `VisionReport`           | Returns local classification, pattern, insight, recommendation, and friction summaries.       |
| `SET_DOMAIN_CLASSIFICATION`        | Dashboard               | `VisionReport`           | Saves a local user category override for a normalized domain.                                 |
| `RESET_DOMAIN_CLASSIFICATION`      | Dashboard               | `VisionReport`           | Removes a user override and falls back to the seed classification when available.             |
| `UPDATE_VISION_SETTINGS`           | Dashboard               | `VisionSettings`         | Updates adaptive recommendation/enforcement settings.                                         |
| `DISMISS_VISION_RECOMMENDATION`    | Dashboard               | `VisionReport`           | Locally hides a recommendation.                                                               |
| `APPLY_VISION_RECOMMENDATION`      | Dashboard               | `VisionReport`           | Applies a local recommended block or friction rule.                                           |
| `UPSERT_FRICTION_RULE`             | Dashboard               | `VisionReport`           | Creates or updates a scheduled friction rule.                                                 |
| `REMOVE_FRICTION_RULE`             | Dashboard               | `VisionReport`           | Removes a scheduled friction rule.                                                            |
| `RECORD_BROWSING_INTENT`           | Friction page           | `BrowsingIntent`         | Records a validated local browsing-intent outcome.                                            |
| `GET_RUNTIME_STATE`                | Internal/debug use      | `PersistedTrackingState` | Returns current persisted runtime tracking state.                                             |
| `GET_DATA_CONTROL_STATUS`          | Dashboard               | `DataControlStatus`      | Returns local data counts, oldest record, storage estimate, and retention setting.            |
| `EXPORT_ALL_DATA`                  | Dashboard               | `DataExportResult`       | Returns a JSON backup payload and backup filename for local download.                         |
| `IMPORT_DATA_BACKUP`               | Dashboard               | `DataControlStatus`      | Imports a valid 0wl backup by merge or confirmed replace.                                     |
| `EXPORT_LOCAL_SYNC_BUNDLE`         | Dashboard               | `SyncExportResult`       | Creates a local cross-browser sync bundle.                                                    |
| `PREVIEW_LOCAL_SYNC_IMPORT`        | Dashboard               | `SyncImportPreview`      | Previews sync changes and conflicts without applying them.                                    |
| `GET_LOCAL_SYNC_DIAGNOSTICS`       | Dashboard               | `SyncDiagnostics`        | Reports local export/import sync checks and limitations.                                      |
| `APPLY_LOCAL_SYNC_IMPORT`          | Dashboard               | `SyncImportResult`       | Applies a confirmed local sync merge and rebuilds derived daily usage.                        |
| `SET_HISTORY_RETENTION`            | Dashboard               | `DataControlStatus`      | Saves the retention window and prunes older local history after confirmation.                 |
| `DELETE_LOCAL_DATA`                | Dashboard               | `DataControlStatus`      | Deletes one confirmed local data category and refreshes enforcement.                          |
| `RESET_ALL_LOCAL_DATA`             | Dashboard               | `DataControlStatus`      | Resets all local 0wl data through a typed dashboard confirmation flow.                        |
| `GET_BLOCKED_ATTEMPT_COUNT`        | Blocked page            | `number`                 | Returns today’s blocked-attempt count for a validated domain.                                 |
| `RECORD_BLOCK_ATTEMPT`             | Blocked page            | `BlockAttempt`           | Validates the domain is currently blocked and records a local attempt.                        |

### Tracking States

0wl persists one runtime tracking state in `browser.storage.local`.

| State               | Meaning                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `tracking`          | A valid active website session is currently open.                  |
| `inactive`          | Tracking is enabled, but no eligible HTTP/HTTPS website is active. |
| `idle`              | The system is idle or locked.                                      |
| `browser-unfocused` | The browser does not have focus.                                   |
| `disabled`          | Tracking is turned off in settings.                                |

### Session End Reasons

Completed sessions record why they ended:

- `tab-switched`
- `navigation`
- `window-blurred`
- `idle`
- `tab-closed`
- `browser-recovery`
- `tracking-disabled`

### Session Start Reasons

Sessions record why they started:

- `startup`
- `tab-activated`
- `navigation`
- `window-focused`
- `idle-resumed`

## Data Storage

IndexedDB database:

- Name: `focus_tracker`
- Version: `3`

Object stores:

- `sessions`: completed usage sessions and the historical source of truth.
- `daily_usage`: materialized date/domain aggregates for fast dashboard reads.
- `block_attempts`: local blocked-navigation attempts bucketed by domain and minute.
- `domain_transitions`: local transitions between completed sessions, used by the `vision` page.
- `browsing_intents`: local friction/intent prompt records.

On startup and before Today/History reads, 0wl can repair impossible local usage data caused by stale runtime state. It removes invalid active sessions that are 24 hours or longer, mathematically inconsistent, or part of an impossible overlapping one-hour active bucket, resets stale live runtime state without awarding phantom time, and rebuilds the derived `daily_usage` aggregate from remaining valid sessions. New session writes also refuse to persist 24-hour-plus active sessions.

`browser.storage.local` stores:

- Extension settings.
- Persisted runtime tracking state.
- Current session start metadata.
- Extension lifecycle metadata.
- Time-limit bypass expiration timestamps.
- Scheduled break rules and scheduled break runtime state.
- Local sync device ID and local sync diagnostics metadata for export/import bundles.
- Vision settings and scheduled friction rules.
- User domain category overrides.

## Privacy

0wl stores normalized domains only.

It does not store:

- Full visited URLs.
- URL paths.
- Query strings.
- Page titles.
- Page content.
- User accounts.
- Cloud data.

All data stays local to the extension.

The manifest declares:

```json
{
  "browser_specific_settings": {
    "gecko": {
      "data_collection_permissions": {
        "required": ["none"]
      }
    }
  }
}
```

## Features to Be Added

### Automatic Local Device Sync

Support automatic same-device syncing across installed browsers without accounts or cloud sync.

Current `0.1.9` sync is local export/import. A future automatic version would require a local Native Messaging companion or another browser-approved local mechanism.

Planned capabilities:

- shared local sync store on the user's device
- browser-specific extension ID mapping
- Native Messaging host installation and health checks
- conflict-safe merge behavior
- no cloud account
- no telemetry
- no remote sync service

The goal is to keep all synced data local to the user's own machine while avoiding manual export/import steps.

## Development Commands

Install dependencies:

```sh
npm install
```

Start the Firefox WXT dev build:

```sh
npm run dev:firefox
```

Start the Chrome WXT dev build:

```sh
npm run dev:chrome
```

Start the Safari WXT dev build:

```sh
npm run dev:safari
```

Build production targets:

```sh
npm run build:firefox
npm run build:chrome
npm run build:edge
npm run build:opera
npm run build:safari
```

Run tests:

```sh
npm run test
```

Run tests in watch mode:

```sh
npm run test:watch
```

Run ESLint:

```sh
npm run lint
```

Format files:

```sh
npm run format
```

Run in Firefox:

```sh
npm run dev:firefox
```

Validate the built extension:

```sh
npm run web-ext:lint
```

Package browser-specific builds:

```sh
npm run zip:firefox
npm run zip:chrome
npm run zip:edge
npm run zip:opera
npm run zip:safari
```

Generate or open the Safari Xcode wrapper:

```sh
npm run safari:convert
npm run safari:open
```

## Firefox MV3 Note

Firefox Manifest V3 uses non-persistent background scripts/event pages for this extension. The tracker is event-driven and does not use a permanent loop or assume in-memory state survives.

When the background starts or wakes, 0wl:

1. Initializes IndexedDB.
2. Initializes default settings if needed.
3. Syncs blocked-site dynamic rules.
4. Invalidates stale tracking state conservatively.
5. Resolves the actual current browser state.
6. Starts a fresh eligible session from the current timestamp.

It never calculates usage as `startup time - old sessionStartedAt` after Firefox has been closed, suspended, crashed, or unavailable.

## Firefox Documentation Checked

- Manifest background scripts: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
- `declarativeNetRequest`: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest
- DNR rule conditions: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest/RuleCondition
- DNR redirects: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest/Redirect
- MV3 web-accessible resources: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/web_accessible_resources
- Idle API: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/idle
- Alarms API: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/alarms
