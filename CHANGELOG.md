# Changelog

All notable changes to 0wl will be documented in this file.

The project follows semantic versioning once public releases begin.

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
