# 0wl

0wl is a standalone, local-first browser extension for tracking active website usage and blocking distracting sites.

The public stable release is currently Firefox-first and Mozilla-approved. The codebase now uses WXT so Firefox, Chrome, Microsoft Edge, Opera, and Safari web-extension assets can be produced from one shared React/TypeScript source tree.

Project site: https://princengare.github.io/0wl/

Firefox Add-ons listing: https://addons.mozilla.org/addon/7e6f3c1073eb4e24a37d/

Current codebase release: `0.1.6`

Current Mozilla-approved listing: `0.1.5`

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

### Time Limit Page

When a daily time limit is reached, the browser redirects to the extension-owned time limit page where redirect rules are supported.

The time limit page shows:

- `TIME LIMIT REACHED`
- The normalized limited domain.
- The amount used today.
- `Go Back`
- `Continue Anyway`

Click `Continue Anyway` to bypass the limit for 15 minutes and return to the site. The background validates that the domain currently has an active time limit before granting the bypass. Return URLs are validated and only used when they belong to the same normalized domain.

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

The `vision` page has four tabs:

- `patterns`: common transitions, distraction pathways, focus interruptions, drift, and evasion.
- `insights`: trends, pre-distraction context, block outcomes, substitutions, bounce-back, and net reclaimed time.
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

| Function                               | Where                    | What it does                                                                                             |
| -------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Automatic usage tracking               | Background               | Starts tracking eligible active website time when the browser starts or the background wakes.            |
| Domain session switching               | Background               | Closes the previous domain session and starts a new one when the active normalized domain changes.       |
| Same-domain continuity                 | Background               | Keeps one continuous session when navigation stays within the same normalized domain.                    |
| Browser focus exclusion                | Background               | Stops timing when the browser loses focus and starts a new eligible session when focus returns.          |
| Idle exclusion                         | Background               | Stops timing when the system becomes idle or locked and resumes from the active timestamp.               |
| Startup recovery                       | Background               | Invalidates stale runtime tracking state without counting browser downtime.                              |
| Today summary                          | Popup, Dashboard         | Shows total tracked time today and ranked domains.                                                       |
| Current session display                | Popup                    | Shows the current tracked domain and current-session elapsed time.                                       |
| History display                        | Dashboard                | Shows session history plus hourly and calendar-week bar charts built from raw sessions.                  |
| History bar selection                  | Dashboard                | Shows per-site totals for selected non-empty hours or days.                                              |
| Calendar-week average                  | Dashboard                | Shows average usage for the displayed calendar week, excluding zero-usage days.                          |
| Terminal checkbox controls             | Dashboard                | Uses bracket-style `[ ]` and `[✓]` controls with underline hover/focus feedback.                         |
| Terminal dropdown controls             | Dashboard                | Uses custom black-and-white dropdown menus that close after selection.                                   |
| Bundled terminal font                  | Extension UI, Docs       | Uses bundled JetBrains Mono with `ss01` and slashed-zero OpenType features.                              |
| Dashboard brand toggle                 | Dashboard                | Toggles `[0wl]` into the 0wl icon and remembers the local UI choice.                                     |
| Settings/interstitial footer           | Dashboard, Pages         | Shows `0wl · icon`; the icon opens the dashboard Today view.                                             |
| Local data status                      | Dashboard                | Shows local counts, oldest record, storage used, and site-category totals.                               |
| Export all data                        | Dashboard                | Downloads a local JSON backup of 0wl data.                                                               |
| Import backup                          | Dashboard, Background    | Imports a local 0wl backup by merge or confirmed replace.                                                |
| History retention setting              | Dashboard, Background    | Stores the user's retention window and prunes older local history after confirmation.                    |
| Delete specific data                   | Dashboard, Background    | Deletes selected local categories after confirmation.                                                    |
| Reset all local data                   | Dashboard, Background    | Requires typed `confirm` in the dashboard before deleting all local 0wl data in this browser.            |
| Vision pathway compression             | Dashboard                | Shows concise behavioral summaries with raw domains and metadata in expandable details.                  |
| Add blocked domain                     | Dashboard                | Normalizes input, rejects duplicates, saves settings, and installs an active dynamic DNR redirect rule.  |
| Schedule blocked domain                | Dashboard                | Applies blocking always or only during selected local days and times.                                    |
| Pause/resume blocked domain            | Dashboard                | Enables or disables a saved blocked domain and syncs DNR rules.                                          |
| Remove blocked domain                  | Dashboard                | Removes the domain from settings and removes its dynamic DNR rule.                                       |
| Blocked navigation redirect            | Browser/DNR              | Redirects blocked main-frame navigations to `blocked.html`.                                              |
| Block attempt recording                | Blocked page, Background | Validates the blocked domain and records a minute-bucketed local attempt.                                |
| Block attempt count                    | Blocked page             | Shows today’s count when the setting is enabled.                                                         |
| Add time-limited domain                | Dashboard                | Normalizes input, rejects duplicates, saves a daily limit, and refreshes enforcement.                    |
| Schedule time-limited domain           | Dashboard                | Applies limits always or only during selected local days and times.                                      |
| Pause/resume time-limited domain       | Dashboard                | Enables or disables a saved time limit and refreshes enforcement.                                        |
| Update time limit                      | Dashboard                | Changes a saved domain’s daily limit and clears any active bypass.                                       |
| Remove time-limited domain             | Dashboard                | Removes the saved limit and removes any corresponding DNR rule.                                          |
| Time-limit redirect                    | Browser/DNR, Background  | Redirects an over-limit main-frame navigation or active tab to `limit.html`.                             |
| Time-limit bypass                      | Limit page, Background   | Validates the domain and bypasses the daily limit for 15 minutes.                                        |
| Vision report                          | Dashboard                | Builds local transition, pathway, context, recovery, substitution, and recommendation summaries.         |
| Site categorization                    | Dashboard                | Uses seed classifications and user overrides to classify visited domains locally.                        |
| Distraction pathway detection          | Dashboard                | Identifies recurring paths from focus activity into distracting sites.                                   |
| Behavior-based recommendations         | Dashboard                | Suggests local blocks or friction based on repeated patterns.                                            |
| Scheduled friction rules               | Dashboard, Background    | Applies pause, intent, delay, or hard-stop interventions during selected local schedule windows.         |
| Intent prompt recording                | Friction page            | Stores local browsing intent outcomes for friction prompts.                                              |
| Alarm-based schedule enforcement       | Background               | Schedules one-shot wakeups for block transitions, limit windows, bypass expiry, or local midnight.       |
| Install/update lifecycle recording     | Background               | Records non-sensitive extension version, previous version, install reason, and temporary-install status. |
| Settings migration                     | Background               | Repairs legacy or malformed local settings before syncing blocking, time-limit, and idle behavior.       |
| Update-safe recovery                   | Background               | Invalidates stale active sessions on install/update without counting unknown browser downtime.           |
| Release verification                   | Developer tooling        | Checks version alignment, Firefox ID, extension name, and manifest-referenced build outputs.             |
| Automatic development reload           | Developer tooling        | Builds, watches, launches Firefox, and reloads the extension with one command.                           |
| Self-hosted update manifest generation | Developer tooling        | Creates `web-ext-artifacts/updates.json` for signed self-hosted Firefox releases.                        |
| Tracking enabled toggle                | Dashboard                | Enables or disables all tracking.                                                                        |
| Idle threshold selector                | Dashboard                | Updates the browser idle detection interval where supported.                                             |
| Attempt-count visibility toggle        | Dashboard                | Shows or hides blocked-attempt counts on the blocked page.                                               |

### Runtime Messages

The React pages communicate with the background through typed `browser.runtime.sendMessage` requests.

| Message                           | Caller                  | Response                 | Purpose                                                                                       |
| --------------------------------- | ----------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `GET_TODAY_SUMMARY`               | Popup, Dashboard        | `TodaySummary`           | Returns today’s aggregate usage plus live current-session time.                               |
| `GET_HISTORY`                     | Dashboard               | `HistorySessionView[]`   | Returns completed sessions for `today`, `yesterday`, or the active history range.             |
| `GET_HISTORY_INTERVAL`            | Dashboard               | `HistorySessionView[]`   | Returns raw sessions overlapping an exact local-time interval, used for calendar weeks.       |
| `GET_SETTINGS`                    | Dashboard, Blocked page | `ExtensionSettings`      | Returns extension settings from `browser.storage.local`.                                      |
| `UPDATE_SETTINGS`                 | Dashboard               | `ExtensionSettings`      | Updates tracking, idle threshold, attempt-count visibility, or history retention.             |
| `ADD_BLOCKED_DOMAIN`              | Dashboard               | `ExtensionSettings`      | Normalizes and adds a blocked domain with an optional schedule, then syncs DNR rules.         |
| `REMOVE_BLOCKED_DOMAIN`           | Dashboard               | `ExtensionSettings`      | Removes a blocked domain and syncs DNR rules.                                                 |
| `SET_BLOCKED_DOMAIN_ENABLED`      | Dashboard               | `ExtensionSettings`      | Enables or pauses a blocked domain and syncs DNR rules.                                       |
| `UPDATE_BLOCKED_DOMAIN_SCHEDULE`  | Dashboard               | `ExtensionSettings`      | Updates a blocked domain schedule and resyncs active DNR rules.                               |
| `ADD_TIME_LIMITED_DOMAIN`         | Dashboard               | `ExtensionSettings`      | Normalizes and adds a daily time limit with an optional schedule, then refreshes enforcement. |
| `REMOVE_TIME_LIMITED_DOMAIN`      | Dashboard               | `ExtensionSettings`      | Removes a daily time limit and refreshes enforcement.                                         |
| `SET_TIME_LIMITED_DOMAIN_ENABLED` | Dashboard               | `ExtensionSettings`      | Enables or pauses a daily time limit and refreshes enforcement.                               |
| `UPDATE_TIME_LIMITED_DOMAIN`      | Dashboard               | `ExtensionSettings`      | Updates the daily limit or schedule for a saved domain.                                       |
| `GET_TIME_LIMIT_STATUS`           | Limit page              | `TimeLimitStatus`        | Returns used time, remaining time, exceeded status, and bypass state.                         |
| `BYPASS_TIME_LIMIT`               | Limit page              | `TimeLimitStatus`        | Grants a validated 15-minute bypass for an active time-limited domain.                        |
| `GET_VISION_REPORT`               | Dashboard               | `VisionReport`           | Returns local classification, pattern, insight, recommendation, and friction summaries.       |
| `SET_DOMAIN_CLASSIFICATION`       | Dashboard               | `VisionReport`           | Saves a local user category override for a normalized domain.                                 |
| `RESET_DOMAIN_CLASSIFICATION`     | Dashboard               | `VisionReport`           | Removes a user override and falls back to the seed classification when available.             |
| `UPDATE_VISION_SETTINGS`          | Dashboard               | `VisionSettings`         | Updates adaptive recommendation/enforcement settings.                                         |
| `DISMISS_VISION_RECOMMENDATION`   | Dashboard               | `VisionReport`           | Locally hides a recommendation.                                                               |
| `APPLY_VISION_RECOMMENDATION`     | Dashboard               | `VisionReport`           | Applies a local recommended block or friction rule.                                           |
| `UPSERT_FRICTION_RULE`            | Dashboard               | `VisionReport`           | Creates or updates a scheduled friction rule.                                                 |
| `REMOVE_FRICTION_RULE`            | Dashboard               | `VisionReport`           | Removes a scheduled friction rule.                                                            |
| `RECORD_BROWSING_INTENT`          | Friction page           | `BrowsingIntent`         | Records a validated local browsing-intent outcome.                                            |
| `GET_RUNTIME_STATE`               | Internal/debug use      | `PersistedTrackingState` | Returns current persisted runtime tracking state.                                             |
| `GET_DATA_CONTROL_STATUS`         | Dashboard               | `DataControlStatus`      | Returns local data counts, oldest record, storage estimate, and retention setting.            |
| `EXPORT_ALL_DATA`                 | Dashboard               | `DataExportResult`       | Returns a JSON backup payload and backup filename for local download.                         |
| `IMPORT_DATA_BACKUP`              | Dashboard               | `DataControlStatus`      | Imports a valid 0wl backup by merge or confirmed replace.                                     |
| `SET_HISTORY_RETENTION`           | Dashboard               | `DataControlStatus`      | Saves the retention window and prunes older local history after confirmation.                 |
| `DELETE_LOCAL_DATA`               | Dashboard               | `DataControlStatus`      | Deletes one confirmed local data category and refreshes enforcement.                          |
| `RESET_ALL_LOCAL_DATA`            | Dashboard               | `DataControlStatus`      | Resets all local 0wl data through a typed dashboard confirmation flow.                        |
| `GET_BLOCKED_ATTEMPT_COUNT`       | Blocked page            | `number`                 | Returns today’s blocked-attempt count for a validated domain.                                 |
| `RECORD_BLOCK_ATTEMPT`            | Blocked page            | `BlockAttempt`           | Validates the domain is currently blocked and records a local attempt.                        |

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
- Version: `2`

Object stores:

- `sessions`: completed usage sessions and the historical source of truth.
- `daily_usage`: materialized date/domain aggregates for fast dashboard reads.
- `block_attempts`: local blocked-navigation attempts bucketed by domain and minute.
- `domain_transitions`: local transitions between completed sessions, used by the `vision` page.
- `browsing_intents`: local friction/intent prompt records.

`browser.storage.local` stores:

- Extension settings.
- Persisted runtime tracking state.
- Current session start metadata.
- Extension lifecycle metadata.
- Time-limit bypass expiration timestamps.
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

### Distraction Pathways

Track the sequence of websites that leads from focused activity into distraction.

Example:

```text
leetcode.com
-> google.com
-> youtube.com
-> instagram.com
```

The system should identify recurring distraction paths, including:

- where the distraction started
- which websites appeared in the sequence
- how often the same pathway occurs
- average time lost during the diversion
- most common transitions into distracting sites

### Pre-Distraction Context

Analyze what the user was doing immediately before opening a distracting website.

Example insights:

- 42% of Instagram visits occur after coding websites
- 27% occur after school-related websites
- 18% occur after email
- 13% occur after other browsing

This should help determine which activities are most frequently interrupted.

### Recovery Time

Measure how long it takes the user to return to their previous focused activity after becoming distracted.

Example:

```text
2:00 PM  github.com
2:17 PM  instagram.com
2:26 PM  youtube.com
2:41 PM  github.com
```

The system should calculate:

- direct distraction duration
- time until return to the original focus context
- average recovery time by distracting website
- total weekly time lost before returning to focused activity

This metric should be presented as a product-defined behavioral estimate rather than a scientifically validated measure of cognitive recovery.

### Blocked Attempt Heatmaps

Visualize when blocked-site attempts occur most frequently.

Heatmaps should support analysis by:

- hour of day
- day of week
- website
- weekday versus weekend behavior

Example insight:

> Instagram attempts occur most frequently between 1-4 PM on weekdays and after 11 PM on weekends.

### Behavior-Based Block Recommendations

Use actual browsing and blocked-attempt patterns to suggest better blocking schedules.

Example:

> You attempted to open Instagram 38 times between 1-4 PM this week.

Suggested action:

```text
Block instagram.com
Weekdays
1:00 PM-4:00 PM
```

Recommendations should be generated from local behavioral data.

### Graduated Friction Levels

Support multiple intervention levels instead of only allowing or blocking a website.

#### Level 0: Allowed

The website opens normally.

#### Level 1: Pause

Require a short delay before entering.

Example:

```text
You have opened Instagram 8 times today.

Continue?

[ Go Back ]

Continue available in 5 seconds
```

#### Level 2: Intent Prompt

Ask why the user is opening the site.

Example:

```text
Why are you opening Instagram?

[ Post something ]
[ Reply to someone ]
[ Browse ]
[ Other ]
```

#### Level 3: Delayed Unlock

Require a longer waiting period before access.

Example:

```text
Available in 30 seconds
```

#### Level 4: Hard Block

Prevent access completely.

### Intent-Based Browsing

Allow users to declare why they are opening a potentially distracting website.

Example:

```text
What are you here to do?

[ Search for a tutorial ]
[ Watch something saved ]
[ Entertainment ]
[ Skip ]
```

The system should remember the selected intention and later check whether the user is still following it.

Example:

```text
You opened YouTube to:
"Search for a tutorial"

You have been here for:
15 minutes

Still doing that?

[ Yes ]
[ I'm off track ]
```

### Session Drift Detection

Detect when a focused browsing session gradually transitions into unrelated or distracting activity.

Example:

```text
github.com
-> stackoverflow.com
-> developer.mozilla.org
-> youtube.com
-> reddit.com
-> instagram.com
```

The system should identify:

- starting focus context
- ending distraction context
- total drift duration
- full transition path
- average time before drift occurs
- websites commonly involved in drift

Example insight:

> Your coding sessions most often begin to drift after approximately 43 minutes.

### Adaptive Interventions

Use historical drift patterns to recommend or trigger interventions before distraction usually occurs.

Example:

```text
After 35 minutes of coding,
require confirmation before opening:

reddit.com
instagram.com
youtube.com
```

Interventions should be based on the user's actual historical behavior.

### Block Effectiveness

Measure what happens after a website is blocked.

Possible outcomes:

- user returns to previous focused site
- user opens another distracting site
- user closes Firefox
- user removes or disables the block

Example:

```text
Instagram

Attempts blocked: 47

Returned to work: 68%
Opened another distraction: 21%
Disabled block: 11%
```

### Bounce-Back Rate

Calculate how often a blocked attempt successfully results in the user returning to productive or previous activity.

Example:

```text
Bounce-back rate:
68%
```

This should help determine whether a block is genuinely useful.

### Distraction Substitution Detection

Detect when blocking one website causes increased use of another distracting website.

Example:

```text
Since blocking instagram.com:

Instagram:
-74 min/day

Reddit:
+39 min/day

YouTube Shorts:
+21 min/day
```

The system should identify likely replacement behaviors rather than assuming blocked time was fully saved.

### Net Time Reclaimed

Estimate the actual amount of time recovered after accounting for replacement distractions.

Example:

```text
Estimated blocked time:
2h 14m

Replacement distraction:
1h 31m

Net time reclaimed:
43m
```

This should provide a more honest measure of whether blocking behavior is actually improving time use.

### Attempt Chains

Detect sequences where a blocked-site attempt is followed by visits to alternative distracting websites.

Example:

```text
Instagram blocked
-> Reddit
-> X
-> YouTube
```

The system should record:

- original blocked website
- substitute websites visited afterward
- total diversion duration
- recurring substitution chains
- most common fallback distraction

### Block Evasion Detection

Identify patterns where the user repeatedly attempts to bypass a block indirectly by opening alternative websites.

Example insight:

> After an Instagram block, your most common substitute is Reddit.

The system may then suggest:

```text
Block Reddit together with Instagram?
```

### Transition Analytics

Analyze website-to-website movement rather than viewing every site as an isolated time bucket.

Potential metrics:

- most common domain transitions
- most common transitions into distracting sites
- most common transitions out of focused sites
- transition frequency
- average time before switching
- recurring behavioral sequences

### Focus Interruption Analysis

Measure which productive or focused websites are interrupted most often.

Example:

```text
Instagram interruptions

From github.com:       21
From leetcode.com:     14
From docs.google.com:   9
From gmail.com:         6
```

This should help show the behavioral cost of distractions rather than only the duration spent on them.

### Personalized Behavioral Insights

Generate local insights from browsing patterns.

Examples:

- You most often open Instagram after 40-50 minutes of coding.
- Reddit is your most common substitute after Instagram is blocked.
- Your highest blocked-attempt period is between 1-4 PM.
- You return to focused work after 68% of blocked Instagram attempts.
- YouTube is involved in 47% of your distraction pathways.
- Your average diversion from GitHub lasts 31 minutes.

### Adaptive Blocking

Allow blocking behavior to change based on observed patterns.

Examples:

- increase friction after repeated attempts
- recommend new block windows
- temporarily group substitute distractions together
- trigger a pause after repeated focus interruptions
- increase intervention strength during known high-risk periods

### Long-Term Behavioral Trends

Track how distraction behavior changes over time.

Potential metrics:

- average daily distraction time
- average recovery time
- bounce-back rate
- net time reclaimed
- substitution rate
- blocked-attempt frequency
- most common distraction pathways
- average time before session drift
- focus interruption frequency

Support comparisons across:

- days
- weeks
- months

### Persistent Firefox Installation

Support permanent installation in Firefox so the extension remains installed and automatically starts whenever Firefox opens.

Planned capabilities:

- signed Firefox `.xpi` builds
- persistent installation across browser restarts
- Firefox-specific extension ID configuration
- self-distributed or AMO-distributed releases
- clear installation documentation for stable builds

### Automatic Development Reload

Add a streamlined development workflow that automatically rebuilds and reloads the extension when source files change.

Planned capabilities:

- watch TypeScript and React source files
- automatically rebuild extension assets
- automatically reload the extension in Firefox
- avoid repeatedly using `about:debugging`
- provide a single development command such as `npm run dev:firefox`

Expected workflow:

```text
Edit source code
-> Save
-> Rebuild
-> Firefox reloads extension
```

### Automatic Extension Updates

Support automatic updates for permanently installed versions of the extension.

Potential distribution methods:

- Firefox Add-ons Marketplace updates
- self-distributed signed releases
- custom HTTPS update manifest for supported self-hosted releases

Expected workflow:

```text
Version 0.1.0 installed
-> New version 0.1.1 released
-> Firefox detects update
-> Extension updates automatically
```

### Development and Stable Release Channels

Separate experimental development builds from everyday stable builds.

Development channel:

- live reload
- rapid iteration
- test data
- verbose logging
- temporary or dedicated development profile

Stable channel:

- signed installation
- persistent tracking
- production settings
- protected user data
- automatic version updates

The goal is to prevent experimental builds from corrupting real browsing history or production tracking data.

### One-Command Development Environment

Create a single command such as:

```sh
npm run dev:firefox
```

The command should:

- start the WXT build/watch process
- watch extension output files
- launch Firefox
- load the extension automatically
- reload the extension after source changes
- surface build and extension errors in the terminal

### Extension Data Migration

Support safe updates to local extension data as the application evolves.

Planned capabilities:

- IndexedDB schema versioning
- migration scripts
- backward-compatible settings updates
- preservation of historical browsing data
- preservation of blocked-site rules
- rollback-safe migrations where possible

### Update Safety

Ensure extension updates do not corrupt active tracking sessions or historical data.

Planned protections:

- safely recover or close active sessions during update/reload
- validate settings after update
- rebuild dynamic block rules after update
- preserve blocked-domain configuration
- prevent duplicate sessions after extension reload
- recover safely from interrupted updates

### Version and Release Management

Add a structured release process.

Planned capabilities:

- semantic versioning
- changelog generation
- release notes
- packaged `.xpi` artifacts
- signed Firefox releases
- reproducible production builds
- version compatibility checks

Example release progression:

```text
0.1.0  Initial tracker
0.2.0  Blocking improvements
0.1.3  Vision insights, WXT cross-browser builds, and UI consistency with the 0wl aesthetic
0.1.4  Mozilla-approved Settings data control, local backups, 0wl footers, and concise Vision summaries
0.1.5  Mozilla-approved privacy links, 0wl site tracking exclusion, and separated PiP/background media refinements
0.1.6  Source release target for popup-only privacy link placement, terminal privacy-link styling, and media-bucket refinements
0.3.0  Expanded behavioral intelligence
1.0.0  Stable public release
```

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
