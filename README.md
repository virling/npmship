# npmship

Release an npm package from a git repo, then check that the release actually landed. Zero dependencies.

- **Dry run by default.** `npmship minor` prints the plan and changes nothing. `--yes` does it.
- **Preflight.** Clean tree, default branch, not behind upstream, `npm test` passes.
- **Keep a Changelog.** Moves `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` and updates the compare links.
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
npx @virling/npmship verify             # verify the version in package.json
npx @virling/npmship verify 1.2.0 --wait --timeout 900
```

| Flag | Meaning |
|---|---|
| `--yes` | Make the release. Without it nothing changes. |
| `--push` | Push the branch and tag, then wait for CI and npm. Without it the push commands are printed. |
| `--allow-empty-changelog` | Release even if `[Unreleased]` has no entries. |
| `--wait` | Poll until CI finishes and the version is on npm (every 15 s, default timeout 1800 s). |
| `--json` | Machine-readable output. |

The tag is annotated, and signed with `-s` when `tag.gpgSign` or `commit.gpgsign` is true. `verify` exits 1 if any check fails. A version that is not `latest` and a package that never had provenance are warnings, not failures.

## Compared with release-it / semantic-release

release-it and semantic-release do much more (plugins, commit-message versioning, publishing from your machine or CI). npmship only does the bump, changelog move and tag in the Keep a Changelog style, leaves publishing to your CI, and spends its effort on checking afterwards that CI passed and the package on npm is what you expect. If you already use one of them, `npmship verify` still works after it.

## License

[PolyForm Noncommercial 1.0.0](LICENSE).
