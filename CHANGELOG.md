# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-27

### Added

- `npmship <patch|minor|major|X.Y.Z>`: dry-run release plan by default; `--yes` runs preflight, moves the CHANGELOG Unreleased section, runs `npm version`, commits and tags; `--push` pushes and verifies.
- `npmship verify [X.Y.Z] [--wait]`: checks the tag's GitHub Actions run, the npm registry, `latest`, provenance, the GitHub release and the published file list.

[Unreleased]: https://github.com/virling/npmship/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/virling/npmship/releases/tag/v0.1.0
