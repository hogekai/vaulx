Release a new version of vaulx. Follow these steps exactly:

## 1. Determine version bump

Run `git tag -l 'v*' --sort=-v:refname | head -1` to find the latest version tag.
If no tag exists, treat all commits as new and use the current version in package.json as the base.

Run `git log <last-tag>..HEAD --oneline` (or `git log --oneline` if no tag) to get all commits since the last release.

Analyze the commits to determine the semantic version bump:
- **patch**: bug fixes, docs, refactors, CI changes only
- **minor**: new features, new tools, new commands, new config options
- **major**: breaking changes (API changes, removed features, renamed env vars)

Present the commit list and your recommended version bump to the user. Wait for confirmation before proceeding. If the user specifies a different version, use that instead.

## 2. Update CHANGELOG.md

Read the current CHANGELOG.md (create it if it doesn't exist).

Add a new section at the top (below the header) with format:

```
## [X.Y.Z] - YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Removed
- ...
```

Only include sections that have entries. Summarize each commit into a concise user-facing changelog entry. Group by category. Skip merge commits and trivial changes (typo fixes in comments, etc.).

## 3. Update version in package.json

Update the `"version"` field in package.json to the new version.

## 4. Run checks

Run these commands sequentially and stop if any fail:
```
npm run lint
npm run test:unit
npm run build
```

If lint fails, try `npm run lint:fix` first, then re-run lint.
If any step fails after attempting fixes, report the error and stop.

## 5. Commit

Stage CHANGELOG.md and package.json (and any lint-fixed files).
Commit with message: `release: vX.Y.Z`

## 6. Tag

Create an annotated tag: `git tag -a vX.Y.Z -m "vX.Y.Z"`

## 7. Push and publish

Run:
```
git push && git push --tags
```

Then create a GitHub Release (this triggers the npm publish workflow):
```
gh release create vX.Y.Z --title "vX.Y.Z" --notes "See CHANGELOG.md for details"
```

Report what was done and link to the created release.
