# Changesets

All thirteen `@paragraf/*` library packages share one version (the `fixed`
group in `config.json`). `@paragraf/studio` and `paragraf-demo` are private
and are never published.

The changelog is the hand-written `CHANGELOG.md` at the repo root;
Changesets does not generate changelogs here (`"changelog": false`).

## Releasing

1. `npx changeset` — pick any library package and the bump type. Because the
   group is fixed, every package gets the same new version.
2. `npx changeset version` — writes the new version into every
   `package.json` and updates the internal dependency ranges.
3. Move the "Unreleased" section of `CHANGELOG.md` under the new version.
4. Commit, merge to `main`, then push the tag `vX.Y.Z`. The tag starts
   `.github/workflows/release.yml`, which builds, tests, checks the packed
   tarballs and publishes.
