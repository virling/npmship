# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- `npmship init` workflows pin `actions/checkout` and `actions/setup-node` to commit SHAs.

## [0.3.1] - 2026-11-28

### Fixed

- A release that fails partway prints the `git reset --hard` command that undoes it.
- `package-lock.json` is staged only when git tracks it, so a gitignored lockfile no longer breaks the release.
- A version that is not above the current one is refused in the plan.
- The branch and tag are pushed in one atomic push, with the command to retry on failure.
- `--timeout` must be a positive number of seconds.
- A failing `npm test` shows stderr as well as stdout.
- `npmship init` workflows limit the test token to read access and publish prereleases under the `next` npm tag.

## [0.3.0] - 2026-11-28

### Added

- `npmship init [--write]`: creates `.github/workflows/test.yml`, `.github/workflows/release.yml` (trusted publishing with provenance, GitHub release from CHANGELOG, major tag move when the package has an `action.yml`) and `CHANGELOG.md`, keeping existing files, and prints the `npm trust github` command.

## [0.2.2] - 2026-11-28

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

[Unreleased]: https://github.com/virling/npmship/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/virling/npmship/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/virling/npmship/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/virling/npmship/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/virling/npmship/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/virling/npmship/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/virling/npmship/releases/tag/v0.1.0
