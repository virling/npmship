# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- The dry run no longer reports "cannot tell the default branch" in repos without `origin/HEAD` (created with `git init` instead of `git clone`). It asks the remote instead.

## [0.2.1] - 2026-11-27

### Fixed

- `draft --write` and the release plan say "1 entry" instead of "1 entries".

## [0.2.0] - 2026-11-27

### Added

- `npmship draft [--write]`: drafts `[Unreleased]` entries from commit subjects since the last `vX.Y.Z` tag, grouped into Added, Changed, Removed and Fixed, skipping release commits and commits that only touch tests, CI or Markdown. `--write` merges them into CHANGELOG.md without duplicates.
- The release dry run hints at `npmship draft --write` when `[Unreleased]` is empty.

## [0.1.0] - 2026-11-27

### Added

- `npmship <patch|minor|major|X.Y.Z>`: dry-run release plan by default; `--yes` runs preflight, moves the CHANGELOG Unreleased section, runs `npm version`, commits and tags; `--push` pushes and verifies.
- `npmship verify [X.Y.Z] [--wait]`: checks the tag's GitHub Actions run, the npm registry, `latest`, provenance, the GitHub release and the published file list.

[Unreleased]: https://github.com/virling/npmship/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/virling/npmship/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/virling/npmship/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/virling/npmship/releases/tag/v0.1.0
