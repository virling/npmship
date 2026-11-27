# npmship

Release an npm package from a git repo, then check that the release actually landed. Zero dependencies.

- **Dry run by default.** `npmship minor` prints the plan and changes nothing. `--yes` does it.
- **Preflight.** Clean tree, default branch, not behind upstream, `npm test` passes.
- **Keep a Changelog.** Moves `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` and updates the compare links.
- **Drafts the changelog.** `npmship draft` turns the commit subjects since the last release tag into `[Unreleased]` entries.
- **Your version scripts run.** Uses `npm version X.Y.Z --no-git-tag-version`, so a `version` script that syncs other manifests still works.
- **Verifies the release.** The tag's CI run passed, the version is on registry.npmjs.org (fetched directly, not through `npm view`'s cache), `latest` points at it, provenance is there, the GitHub release exists, and the tarball has every file `files` should include.

## Requirements

- Node.js 20 or newer
- git
- GitHub CLI (`gh`), logged in, for the CI and GitHub release checks
- A tag-triggered workflow that publishes to npm (npmship tags and pushes, CI publishes)

## Usage

```bash
npx @virling/npmship minor              # print the plan
npx @virling/npmship minor --yes        # preflight, CHANGELOG, npm version, commit "Release X.Y.Z", tag vX.Y.Z
npx @virling/npmship minor --yes --push # also push the branch and tag, then verify --wait
npx @virling/npmship draft              # print [Unreleased] entries drafted from commits
npx @virling/npmship draft --write      # add them to CHANGELOG.md
npx @virling/npmship verify             # verify the version in package.json
npx @virling/npmship verify 1.2.0 --wait --timeout 900
```

| Flag | Meaning |
|---|---|
| `--yes` | Make the release. Without it nothing changes. |
| `--push` | Push the branch and tag, then wait for CI and npm. Without it the push commands are printed. |
| `--write` | With `draft`: add the drafted entries to CHANGELOG.md. Without it nothing changes. |
| `--allow-empty-changelog` | Release even if `[Unreleased]` has no entries. |
| `--wait` | Poll until CI finishes and the version is on npm (every 15 s, default timeout 1800 s). |
| `--json` | Machine-readable output. |

The tag is annotated, and signed with `-s` when `tag.gpgSign` or `commit.gpgsign` is true. `verify` exits 1 if any check fails. A version that is not `latest` and a package that never had provenance are warnings, not failures.

## Drafting the changelog

`npmship draft` reads `git log <tag>..HEAD --no-merges`, where `<tag>` is the highest `vX.Y.Z` tag reachable from HEAD (all commits if there is none). It skips:

- release commits (subject starts with `Release ` and a digit)
- commits whose changed files are all under `test/` or `.github/`, or end in `.md`

Each remaining subject becomes a bullet, unchanged, grouped by its first word:

| First word | Section |
|---|---|
| Add, Ship, Support, Introduce, Allow | Added |
| Fix, Close, Stop, Handle, Prevent | Fixed |
| Remove, Drop, Delete | Removed |
| anything else | Changed |

`--write` puts the bullets under `## [Unreleased]`, inside an existing `### Added` (etc.) subsection when there is one, and skips any bullet already in the section, so running it twice is safe. It refuses if CHANGELOG.md has no `## [Unreleased]` heading. Edit the result before releasing; commit subjects are a draft, not release notes. `--json` prints the grouped and skipped commits. When `[Unreleased]` is empty, the release dry run says how many commits `draft` would use.

## Compared with release-it / semantic-release

release-it and semantic-release do much more (plugins, commit-message versioning, publishing from your machine or CI). npmship only does the bump, changelog move and tag in the Keep a Changelog style, leaves publishing to your CI, and spends its effort on checking afterwards that CI passed and the package on npm is what you expect. If you already use one of them, `npmship verify` still works after it.

## More tools from Virling

- [agentmem](https://github.com/virling/agentmem): project memory for AI coding agents, shared across Claude Code, Cursor, Codex and other MCP clients.
- [ccdoctor](https://github.com/virling/ccdoctor): checks your Claude Code setup: hooks, MCP servers and plugins that are registered but not working.
- [ciwhy](https://github.com/virling/ciwhy): finds the real error in a failed GitHub Actions run and tells you if it is flaky.
- [subagents](https://github.com/virling/subagents): reviews what Claude Code subagents did in a session and flags repeated or wasted work.

## License

[PolyForm Noncommercial 1.0.0](LICENSE).
