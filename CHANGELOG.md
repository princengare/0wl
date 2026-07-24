# Changelog

All notable changes to 0wl will be documented in this file.

The project follows semantic versioning once public releases begin.

## 0.1.9 - 2026-07-23

- Bumped the source release target and package metadata to 0.1.9.
- Added Local Device Sync as a local export/import workflow with sync bundles, import previews, conflict summaries, duplicate-session skipping, daily-usage rebuilds after merge, and Settings diagnostics.
- Kept private raw browsing sessions out of sync exports by default; private aggregate data and private rules are optional.
- Added scheduled browser-usage break rules from the Time Limits page with schedule support and regular/private window scopes.
- Added Time Limits break setup mode with a coffee/break icon, a `Take a break after:` selector that shares normal time-limit options, configurable break duration from 1 minute to 1 hour, and `Set` action.
- Clarified the break setup row so it reads `Take a break after: [duration], lasting for: [break duration]`.
- Removed underlines from the break setup text labels so the dropdowns carry the terminal input styling.
- Aligned the break setup `[Set]` action with the regular time-limit `[Limit]` action and spaced the two break phrases as readable blocks.
- Added scheduled-break enforcement through the existing time-limit interstitial in `BREAK ACTIVE` mode, including automatic resume when a break ends and early resume after the first five minutes of longer breaks.
- Moved popup Do Not Disturb to the `Today` row and changed it to a crescent-moon icon so break counting/enforcement can be paused without disabling normal blocks or time limits.
- Reduced the popup Do Not Disturb crescent size again while keeping the button hit target stable.
- Kept the popup Do Not Disturb button from increasing the spacing between `Today` and total browsing time.
- Removed implemented migration, development, update, and release-process items from README future features, leaving automatic local same-device sync as future work.
- Updated README, project site, and privacy documentation for the 0.1.9 source target.

## 0.1.8

- Bumped the source release target and package metadata to 0.1.8.
- Marked 0.1.8 as the Mozilla-approved Firefox Add-ons release in documentation.
- Strengthened usage-data repair before Today and History reads so impossible overlapping hourly active buckets are removed and stale `daily_usage` rows are rebuilt from valid completed sessions.
- Kept legacy runtime tracking state without a saved window scope visible as regular-window live usage in Today and History.
- Removed Adaptive Blocking from Vision Insights because Adaptive Settings live under Recommendations.
- Improved Vision heatmap labels with full weekday names and removed duplicate per-domain `2x`/count text.
- Changed blocked-attempt heatmap recommendation copy to use 12-hour AM/PM time ranges.
- Boxed Recovery Time domain rows for easier scanning.
- Updated README and project site documentation for the 0.1.8 approved release.

## 0.1.7

- Bumped the source release target and package metadata to 0.1.7.
- Hardened zero-minute/private time-limit handling so limit redirects stop active tracking before showing the interstitial.
- Prevented stale 24-hour-plus live sessions from appearing as impossible History graph bars.
- Added usage-data repair before History reads so invalid local rows can be removed without clearing valid sessions, settings, blocked sites, time limits, or Vision data.
- Recovered legacy runtime tracking state without a saved window scope as regular-window tracking so regular History does not appear inactive.
- Tightened blocked-site and time-limit interstitial layout so the page, controls, and footer fit inside one viewport.
- Excluded private-window browsing, blocked attempts, transitions, and block rules from normal Vision reports and block outcomes.
- Surfaced the completed Vision roadmap sections in Insights, including recovery, blocked-attempt heatmaps, transition analytics, focus interruptions, drift, attempt chains, substitutions, and adaptive-blocking status.
- Made blocked-attempt heatmap recommendations include the dominant domain and apply as scheduled block creates/updates.
- Removed completed roadmap entries for persistent Firefox installation, automatic development reload, one-command development, and update safety from README future features.
- Removed completed Vision roadmap entries from README future features and added local-device browser sync as a future feature.
- Updated README and project site documentation for the 0.1.7 source target.

## 0.1.6

- Bumped the source release target and package metadata to 0.1.6.
- Added privacy-policy links from the private browsing enable-confirmation popup and Settings Data Control.
- Moved the private browsing privacy-policy link into the enable-confirmation popup only.
- Treats the public 0wl documentation/privacy site as an app surface so viewing it is excluded from active browsing and media tracking.
- Refined Picture-in-Picture and background media tracking so ordinary non-active video records as background media while detected PiP records separately.
- Shows live Picture-in-Picture and background media sessions in History before playback stops.
- Keeps privacy-policy links in the black-and-white terminal aesthetic and left-aligns the Data Control privacy action.
- Updated the public project site and privacy policy for the implemented media buckets and privacy-policy access paths.

## 0.1.5

- Marked 0.1.5 as the Mozilla-approved Firefox Add-ons release in documentation.

## 0.1.4

- Added Settings Data Control with local data status, JSON export, backup import, confirmed retention cleanup, specific delete actions, and typed full-reset confirmation.
- Added background data-control messaging and backup handling without using blanket storage clears or database deletion.
- Added `0wl · icon` footers to Settings, blocked-site, time-limit, and friction interstitial pages.
- Added dashboard `[0wl]` title/icon toggle with remembered local UI preference.
- Improved Data Control and confirmation UI with `[x]` popup close controls, inverted hover action buttons, dropdown-based specific deletes, and auto-clearing status messages.
- Improved Vision pathway, drift, and evasion summaries with repeated-domain collapse, research/dev-loop compression, display caps, occurrence thresholds, and intervention-gated evasion detection.
- Marked 0.1.4 as the Mozilla-approved Firefox Add-ons release in documentation.

## 0.1.3

- Migrated the extension build system to WXT while preserving the existing Firefox extension ID and local storage model.
- Added shared Firefox, Chrome, Microsoft Edge, Opera, and Safari web-extension asset build targets from one React/TypeScript source tree.
- Added Safari wrapper documentation and scripts for Apple's Safari Web Extension converter.
- Added runtime platform capability guards for idle, alarms, and dynamic DNR rules.
- Added the `vision` dashboard tab for local deterministic behavioral summaries.
- Added seed and user-overridable site categories.
- Added local domain transition recording for completed sessions.
- Added distraction pathway, pre-distraction context, recovery, block outcome, bounce-back, substitution, net-time-reclaimed, attempt-chain, block-evasion, focus-interruption, and trend summaries.
- Added local behavior-based recommendations.
- Added scheduled friction rules and a friction interstitial with pause, intent, delay, and hard-stop levels.
- Added local browsing-intent records.
- Added additive IndexedDB version 2 stores for `domain_transitions` and `browsing_intents`.
- Expanded tests for the new vision and friction behavior.
- Updated README and project site documentation for the 0.1.3 source release target.

## 0.1.2

- Approved and listed on Mozilla Add-ons.
- Updated public documentation and project site with the Firefox Add-ons listing.
- Removed AMO `innerHTML` bundle warnings from the generated extension output.
- Added WXT migration groundwork and browser-specific build documentation.

## 0.1.1

- Added AMO listed-release metadata for signing.
- Bumped the release version after the deleted AMO 0.1.0 upload could not be reused.

## 0.1.0

- Initial local-first Firefox usage tracker.
- Domain-based usage sessions and daily aggregates.
- Blocked-site rules and local blocked-attempt recording.
- Daily time limits with bypass support.
- Terminal-style popup, dashboard, blocked page, and time-limit page.
- Firefox-first build, lint, test, package, signing, and release verification workflow.
