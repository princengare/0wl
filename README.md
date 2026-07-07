# 0wl

0wl is a standalone, local-first Firefox WebExtension for tracking active website usage and blocking distracting sites.

It does not use a backend, authentication, analytics, telemetry, cloud storage, external APIs, OpenAI APIs, localhost services, or any integration with another app.

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

Ignored entries such as `node_modules/`, `dist/`, `.DS_Store`, Firefox profiles, local exports, and browser storage data should stay out of commits.

## Quick Start

Install dependencies:

```sh
npm install
```

Build the extension:

```sh
npm run build
```

Run it in Firefox with Mozilla `web-ext`:

```sh
npm run firefox
```

For automatic rebuild and Firefox extension reload during development:

```sh
npm run firefox:dev
```

Or load it manually:

1. Run `npm run build`.
2. Open Firefox.
3. Go to `about:debugging#/runtime/this-firefox`.
4. Click `Load Temporary Add-on`.
5. Select `/Users/ngare/Documents/0wl/dist/manifest.json`.

## Development and Release Workflow

Detailed guides:

- [Development workflow](./docs/development.md)
- [Firefox installation](./docs/firefox-installation.md)
- [Automatic updates](./docs/release/automatic-updates.md)
- [Data migration](./docs/data-migration.md)
- [Release process](./docs/release/process.md)

Useful commands:

| Command                    | Purpose                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| `npm run typecheck`        | Run TypeScript without emitting files.                                       |
| `npm run typecheck:watch`  | Watch TypeScript and surface type errors.                                    |
| `npm run build`            | Type-check and build the production extension into `dist/`.                  |
| `npm run build:watch`      | Rebuild extension assets when source files change.                           |
| `npm run firefox`          | Launch Firefox with the built extension from `dist/`.                        |
| `npm run firefox:dev`      | Build, watch, launch Firefox, and reload the extension after source changes. |
| `npm run test`             | Run all Vitest tests.                                                        |
| `npm run lint`             | Run ESLint.                                                                  |
| `npm run web-ext:lint`     | Validate the built extension with Mozilla `web-ext lint`.                    |
| `npm run release:check`    | Inspect the built manifest and referenced output files.                      |
| `npm run release:prepare`  | Run lint, tests, build, release verification, web-ext lint, and package.     |
| `npm run package`          | Build an unsigned package artifact in `web-ext-artifacts/`.                  |
| `npm run sign:firefox`     | Sign the built extension through Mozilla Add-ons credentials.                |
| `npm run updates:manifest` | Generate a self-hosted Firefox update manifest from `UPDATE_BASE_URL`.       |

Persistent installation in regular Firefox requires a signed `.xpi`. Automatic updates require either AMO distribution or a real HTTPS self-hosted update manifest URL.

## How To Use It

### Automatic Tracking

Tracking starts automatically when the extension starts. You do not need to press a start button.

0wl only counts usage when all of these are true:

- Tracking is enabled.
- Firefox has a focused browser window.
- The active tab is an `http:` or `https:` page.
- The system is active, not idle or locked.
- The active page has a valid normalized website domain.

0wl stops or switches tracking when:

- You switch active tabs.
- The active tab navigates to another domain.
- Firefox loses focus.
- Firefox regains focus.
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

Open the dashboard from the popup with `Open Dashboard`, or through Firefox extension options.

The dashboard has five sections:

- `Today`
- `History`
- `blocked sites`
- `time limits`
- `Settings`

### Today

Use `Today` to see:

- Total tracked browsing time for the current local day.
- Ranked domains by duration.
- A simple terminal-style usage bar.

Live active-session time is included in the displayed total without prematurely writing an incomplete session to history.

### History

Use `History` to review completed browsing sessions.

Available ranges:

- `Today`
- `Yesterday`
- `Last 7 days`

Each history row shows:

- Start and end time.
- Normalized domain.
- Session duration.

### blocked sites

Use `blocked sites` to manage domain blocking.

To block a site:

1. Enter a website, such as `instagram.com`, `www.instagram.com`, or `https://instagram.com/reels/`.
2. Click `Block`.

0wl normalizes valid input to the registrable domain. Examples:

- `www.instagram.com` becomes `instagram.com`
- `m.instagram.com` becomes `instagram.com`
- `https://instagram.com/reels/` becomes `instagram.com`
- `news.bbc.co.uk` becomes `bbc.co.uk`

Blocked domains are enforced immediately through Firefox Manifest V3 `declarativeNetRequest` dynamic rules.

For each blocked site, you can:

- See whether it is `Active` or `Paused`.
- Toggle it on or off.
- Remove it.

Blocking applies to top-level navigations only. It blocks the configured domain and normal subdomains without blocking subresources embedded on unrelated websites.

### time limits

Use `time limits` to set daily time limits for specific website domains.

To add a time limit:

1. Enter a website, such as `youtube.com`, `www.youtube.com`, or `https://youtube.com/watch?v=123`.
2. Choose a daily limit.
3. Click `Limit`.

Supported daily limits:

- `1 minute`
- `5 minutes`
- `10 minutes`
- `15 minutes`
- `30 minutes`
- `1 hour`
- `2 hours`

For each time-limited site, you can:

- See whether it is `Active` or `Paused`.
- Toggle it on or off.
- Change the daily limit.
- Remove it.

0wl enforces time limits using today’s tracked usage for the normalized domain. When the active site reaches its limit, the background schedules and responds through `browser.alarms` instead of a forever-running timer. Once a domain is over its limit, 0wl also installs a dynamic main-frame redirect rule so new navigations to that domain land on the limit page.

### Time Limit Page

When a daily time limit is reached, Firefox redirects to the extension-owned time limit page.

The time limit page shows:

- `TIME LIMIT REACHED`
- The normalized limited domain.
- The amount used today.
- `Go Back`
- `Continue Anyway`

Click `Continue Anyway` to bypass the limit for 15 minutes and return to the site. The background validates that the domain currently has an active time limit before granting the bypass. Return URLs are validated and only used when they belong to the same normalized domain.

### Blocked Page

When a blocked top-level navigation is attempted, Firefox redirects to the extension-owned blocked page.

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

Changing the idle threshold updates Firefox idle detection immediately.

## Function Reference

### User-Facing Functions

| Function                               | Where                    | What it does                                                                                             |
| -------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Automatic usage tracking               | Background               | Starts tracking eligible active website time when Firefox starts or the background wakes.                |
| Domain session switching               | Background               | Closes the previous domain session and starts a new one when the active normalized domain changes.       |
| Same-domain continuity                 | Background               | Keeps one continuous session when navigation stays within the same normalized domain.                    |
| Firefox focus exclusion                | Background               | Stops timing when Firefox loses focus and starts a new eligible session when Firefox regains focus.      |
| Idle exclusion                         | Background               | Stops timing when the system becomes idle or locked and resumes from the active timestamp.               |
| Startup recovery                       | Background               | Invalidates stale runtime tracking state without counting Firefox downtime.                              |
| Today summary                          | Popup, Dashboard         | Shows total tracked time today and ranked domains.                                                       |
| Current session display                | Popup                    | Shows the current tracked domain and current-session elapsed time.                                       |
| History display                        | Dashboard                | Shows completed sessions for today, yesterday, or the last 7 days.                                       |
| Add blocked domain                     | Dashboard                | Normalizes input, rejects duplicates, saves settings, and installs a dynamic DNR redirect rule.          |
| Pause/resume blocked domain            | Dashboard                | Enables or disables a saved blocked domain and syncs DNR rules.                                          |
| Remove blocked domain                  | Dashboard                | Removes the domain from settings and removes its dynamic DNR rule.                                       |
| Blocked navigation redirect            | Browser/DNR              | Redirects blocked main-frame navigations to `blocked/index.html`.                                        |
| Block attempt recording                | Blocked page, Background | Validates the blocked domain and records a minute-bucketed local attempt.                                |
| Block attempt count                    | Blocked page             | Shows today’s count when the setting is enabled.                                                         |
| Add time-limited domain                | Dashboard                | Normalizes input, rejects duplicates, saves a daily limit, and refreshes enforcement.                    |
| Pause/resume time-limited domain       | Dashboard                | Enables or disables a saved time limit and refreshes enforcement.                                        |
| Update time limit                      | Dashboard                | Changes a saved domain’s daily limit and clears any active bypass.                                       |
| Remove time-limited domain             | Dashboard                | Removes the saved limit and removes any corresponding DNR rule.                                          |
| Time-limit redirect                    | Browser/DNR, Background  | Redirects an over-limit main-frame navigation or active tab to `limit/index.html`.                       |
| Time-limit bypass                      | Limit page, Background   | Validates the domain and bypasses the daily limit for 15 minutes.                                        |
| Alarm-based limit enforcement          | Background               | Schedules one-shot wakeups for the next active limit, bypass expiry, or local midnight.                  |
| Install/update lifecycle recording     | Background               | Records non-sensitive extension version, previous version, install reason, and temporary-install status. |
| Settings migration                     | Background               | Repairs legacy or malformed local settings before syncing blocking, time-limit, and idle behavior.       |
| Update-safe recovery                   | Background               | Invalidates stale active sessions on install/update without counting unknown Firefox downtime.           |
| Release verification                   | Developer tooling        | Checks version alignment, Firefox ID, extension name, and manifest-referenced build outputs.             |
| Automatic development reload           | Developer tooling        | Builds, watches, launches Firefox, and reloads the extension with one command.                           |
| Self-hosted update manifest generation | Developer tooling        | Creates `web-ext-artifacts/updates.json` for signed self-hosted Firefox releases.                        |
| Tracking enabled toggle                | Dashboard                | Enables or disables all tracking.                                                                        |
| Idle threshold selector                | Dashboard                | Updates the Firefox idle detection interval.                                                             |
| Attempt-count visibility toggle        | Dashboard                | Shows or hides blocked-attempt counts on the blocked page.                                               |

### Runtime Messages

The React pages communicate with the background through typed `browser.runtime.sendMessage` requests.

| Message                           | Caller                  | Response                 | Purpose                                                                |
| --------------------------------- | ----------------------- | ------------------------ | ---------------------------------------------------------------------- |
| `GET_TODAY_SUMMARY`               | Popup, Dashboard        | `TodaySummary`           | Returns today’s aggregate usage plus live current-session time.        |
| `GET_HISTORY`                     | Dashboard               | `HistorySessionView[]`   | Returns completed sessions for `today`, `yesterday`, or `last-7-days`. |
| `GET_SETTINGS`                    | Dashboard, Blocked page | `ExtensionSettings`      | Returns extension settings from `browser.storage.local`.               |
| `UPDATE_SETTINGS`                 | Dashboard               | `ExtensionSettings`      | Updates tracking, idle threshold, or attempt-count visibility.         |
| `ADD_BLOCKED_DOMAIN`              | Dashboard               | `ExtensionSettings`      | Normalizes and adds a blocked domain, then syncs DNR rules.            |
| `REMOVE_BLOCKED_DOMAIN`           | Dashboard               | `ExtensionSettings`      | Removes a blocked domain and syncs DNR rules.                          |
| `SET_BLOCKED_DOMAIN_ENABLED`      | Dashboard               | `ExtensionSettings`      | Enables or pauses a blocked domain and syncs DNR rules.                |
| `ADD_TIME_LIMITED_DOMAIN`         | Dashboard               | `ExtensionSettings`      | Normalizes and adds a daily time limit, then refreshes enforcement.    |
| `REMOVE_TIME_LIMITED_DOMAIN`      | Dashboard               | `ExtensionSettings`      | Removes a daily time limit and refreshes enforcement.                  |
| `SET_TIME_LIMITED_DOMAIN_ENABLED` | Dashboard               | `ExtensionSettings`      | Enables or pauses a daily time limit and refreshes enforcement.        |
| `UPDATE_TIME_LIMITED_DOMAIN`      | Dashboard               | `ExtensionSettings`      | Updates the daily limit for a saved domain.                            |
| `GET_TIME_LIMIT_STATUS`           | Limit page              | `TimeLimitStatus`        | Returns used time, remaining time, exceeded status, and bypass state.  |
| `BYPASS_TIME_LIMIT`               | Limit page              | `TimeLimitStatus`        | Grants a validated 15-minute bypass for an active time-limited domain. |
| `GET_RUNTIME_STATE`               | Internal/debug use      | `PersistedTrackingState` | Returns current persisted runtime tracking state.                      |
| `GET_BLOCKED_ATTEMPT_COUNT`       | Blocked page            | `number`                 | Returns today’s blocked-attempt count for a validated domain.          |
| `RECORD_BLOCK_ATTEMPT`            | Blocked page            | `BlockAttempt`           | Validates the domain is currently blocked and records a local attempt. |

### Tracking States

0wl persists one runtime tracking state in `browser.storage.local`.

| State               | Meaning                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `tracking`          | A valid active website session is currently open.                  |
| `inactive`          | Tracking is enabled, but no eligible HTTP/HTTPS website is active. |
| `idle`              | The system is idle or locked.                                      |
| `browser-unfocused` | Firefox does not have focus.                                       |
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
- Version: `1`

Object stores:

- `sessions`: completed usage sessions and the historical source of truth.
- `daily_usage`: materialized date/domain aggregates for fast dashboard reads.
- `block_attempts`: local blocked-navigation attempts bucketed by domain and minute.

`browser.storage.local` stores:

- Extension settings.
- Persisted runtime tracking state.
- Current session start metadata.
- Extension lifecycle metadata.
- Time-limit bypass expiration timestamps.

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
- provide a single development command such as `npm run firefox:dev`

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
npm run firefox:dev
```

The command should:

- start the Vite build/watch process
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
0.3.0  Distraction pathways
1.0.0  Stable public release
```

## Development Commands

Install dependencies:

```sh
npm install
```

Start Vite:

```sh
npm run dev
```

Build for production:

```sh
npm run build
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

Run in Firefox with `web-ext`:

```sh
npm run build
npm run firefox
```

Validate the built extension:

```sh
npm run web-ext:lint
```

Package the built extension:

```sh
npm run package
```

## Firefox MV3 Note

Firefox Manifest V3 uses non-persistent background scripts/event pages for this extension. The tracker is event-driven and does not use a permanent loop or assume in-memory state survives.

When the background starts or wakes, 0wl:

1. Initializes IndexedDB.
2. Initializes default settings if needed.
3. Syncs blocked-site dynamic rules.
4. Invalidates stale tracking state conservatively.
5. Resolves the actual current Firefox state.
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
