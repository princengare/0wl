# 0wl

0wl is a standalone, local-first browser extension for tracking active website usage and blocking distracting sites.

The public stable release is currently Firefox-first and Mozilla-approved. The codebase now uses WXT so Firefox, Chrome, Microsoft Edge, Opera, and Safari web-extension assets can be produced from one shared React/TypeScript source tree.

Project site: https://princengare.github.io/0wl/

Firefox Add-ons listing: https://addons.mozilla.org/addon/7e6f3c1073eb4e24a37d/

Current codebase release: `0.1.3`

Latest Mozilla-approved listing before the 0.1.3 submission: `0.1.2`

0wl aesthetic note:

- Bundled JetBrains Mono is used across extension pages with the `ss01` and slashed-zero OpenType features.
- Dashboard checkboxes now use the 0wl `[ ]` and `[✓]` terminal style with underline hover/focus feedback.
- Dashboard dropdowns now use custom black-and-white terminal menus instead of native browser select controls.
- Dashboard header tabs stay on one horizontal line, with Settings shown as the bracketed gear control.
- Vision section headings are smaller and denser to match the rest of the dashboard.
- The History average line alignment was tightened so it sits at the computed chart value.
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

Version `0.1.3` adds the first local intelligence layer:

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
- `Idle threshold`: controls how long the system must be inactive before tracking stops.
- `Show blocked attempt counts`: controls whether the blocked page shows today’s attempt count.

Idle threshold options:

- `30 seconds`
- `60 seconds`
- `2 minutes`
- `5 minutes`

Changing the idle threshold updates browser idle detection immediately where the API is supported.

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
| `UPDATE_SETTINGS`                 | Dashboard               | `ExtensionSettings`      | Updates tracking, idle threshold, or attempt-count visibility.                                |
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

Note: version `0.1.3` implements the first deterministic, local-only version of the behavioral intelligence features below inside the new `vision` dashboard tab. The roadmap remains here to track future refinement, richer UI, and deeper analysis.

### Attention Bucket Differentiation

0wl should not treat every kind of browser activity as the same kind of browsing time.

The better tracking model is to split browser activity into different attention buckets so the dashboard can distinguish main browser attention from media exposure, idle visibility, and unfocused browser state.

Recommended buckets:

- `active_browsing_time`: main browser attention on the active HTTP/HTTPS tab while the browser is focused and the user is not idle.
- `pip_media_time`: media playing in Picture-in-Picture while the user is focused somewhere else.
- `background_media_time`: audio or video playing from a non-active tab.
- `idle_visible_time`: a page is visible but the user/system is idle.
- `browser_unfocused_time`: the browser has a page open but the user is working in another app.

Example:

```text
Active tab: github.com
Picture-in-Picture: youtube.com
Duration: 40 min

github.com active browsing time = 40 min
youtube.com PiP media time = 40 min
```

Another example:

```text
Active tab: docs.google.com
Background audio: spotify.com
Duration: 50 min

docs.google.com active browsing time = 50 min
spotify.com background media time = 50 min
```

Idle behavior should remain separate:

```text
Visible page: instagram.com
User idle for: 30 min

instagram.com idle-visible time = 30 min
instagram.com active browsing time = 0 min
```

Browser-unfocused behavior should also remain separate:

```text
Browser page: youtube.com
Foreground app: VS Code

youtube.com active browsing time = 0 min
```

If media is playing while the browser is unfocused, 0wl can record that as `background_media_time` instead of normal active browsing.

Dashboard direction:

```text
Today

Active browsing:        3h 12m
PiP media:              48m
Background media:       1h 05m
Idle visible time:      22m
```

Domain detail direction:

```text
youtube.com

Active browsing:        24m
PiP media:              48m
Background media:       35m
Total media exposure:   1h 47m
```

Why this matters:

```text
GitHub active browsing: 1h
YouTube PiP media:      1h
```

That is more honest than assigning the whole hour to only GitHub or only YouTube.

For time limits, PiP and background media should be configurable:

```text
Count PiP toward site limits?
[ ] No, track separately
[✓] Yes, count it toward limits
```

Default behavior should be:

- Track PiP and background media separately.
- Do not count PiP or background media toward active browsing time by default.
- Let users opt into counting PiP/background media toward time limits.

For 0wl's goals, active browsing time should mean where the user's main browser attention is. PiP and background media still matter, but they should remain separate metrics.

### Settings and Interstitial Footers

Add a small terminal-style footer to the Settings page and extension-owned interstitial pages.

Planned locations:

- Settings page
- Blocked-site page
- Time-limit page
- Friction/intervention pages

The footer should stay minimal, local-first, and consistent with the 0wl aesthetic. It can link to privacy, data control, project information, or local help pages without adding telemetry, accounts, or cloud features.

### Recommended Data Control

Add a Settings data-control section that helps users understand, export, import, retain, and delete local 0wl data.

#### Data Status

Show what is stored locally so users can see what 0wl keeps in their browser.

Example:

```text
Data stored locally:
Sessions: 1,284
Daily usage records: 93
Blocked attempts: 47
Vision events: 112
Site categories: 846 seed / 12 custom
Oldest record: Jan 12, 2026
Storage used: 8.4 MB
```

This should build trust by making local storage visible and understandable.

#### Export Data

Make export prominent.

```text
Export Data
Download a local backup of your 0wl data.
```

Initial action:

```text
[ Export All Data ]
```

Future export options:

- Export everything
- Export browsing sessions only
- Export settings only
- Export Vision analytics only
- CSV export for history

Initial backup filename format:

```text
0wl-backup-2026-07-14.json
```

#### Import Data

Support restoring data when reinstalling 0wl or moving browsers.

```text
Import Data
Restore 0wl data from a backup file.
```

Import modes:

- Merge with existing data
- Replace existing data

Default behavior should be:

- Merge with existing data
- Require confirmation before replacing existing data

#### Retention Settings

Let users decide how long 0wl keeps history.

```text
Keep browsing history for:
[ 30 days ]
[ 90 days ]
[ 6 months ]
[ 1 year ]
[ Forever ]
```

Recommended default:

- `1 year`

Vision and pattern features need enough history to be useful, so the default should not be too short.

#### Delete Specific Data

Offer precise deletion controls instead of only one full reset.

Recommended actions:

```text
[ Delete Browsing History ]
[ Delete Blocked Attempt History ]
[ Delete Vision Analytics ]
[ Reset Custom Site Categories ]
[ Reset Settings ]
```

These actions should sit behind confirmation modals.

#### Danger Zone

Keep full reset separate and explicit.

```text
Danger Zone

Reset All Local Data
This permanently deletes all 0wl data stored in this browser.
This cannot be undone.

[ Export Data First ]
[ Reset All Local Data ]
```

Require the user to type:

```text
RESET 0WL
```

before enabling the final reset button.

#### Ideal Settings Layout

```text
Data Control

Local Data Status
- Storage used: 8.4 MB
- Oldest record: Jan 12, 2026
- Sessions: 1,284
- Blocked attempts: 47
- Vision events: 112

Backup
[ Export All Data ]
[ Import Backup ]

History Retention
Keep history for: [ 1 year v ]

Delete Specific Data
[ Delete Browsing History ]
[ Delete Blocked Attempts ]
[ Delete Vision Analytics ]
[ Reset Custom Site Categories ]
[ Reset Settings ]

Danger Zone
[ Export Data First ]
[ Reset All Local Data ]
```

Avoid for now:

- cloud sync
- account backup
- automatic remote backup
- share data
- telemetry toggle

0wl's privacy pitch is local-first, so these controls should keep everything local.

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
