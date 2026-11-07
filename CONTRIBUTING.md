# Contributing

Contributions are welcome through pull requests:

1. Fork [OpenStaticFish/horizon-flake](https://github.com/OpenStaticFish/horizon-flake).
2. Create a branch in your fork and make a focused change.
3. Run the checks below and open a PR targeting `main`.

```sh
nix develop
bun install --frozen-lockfile
bun run check
nix fmt -- --ci
actionlint
nix flake check --print-build-logs
nix run . -- --version
```

Fork workflows use GitHub-hosted runners and read-only permissions, without
repository secrets. An organization maintainer must approve workflow execution
for **every external contributor**, even returning contributors.

Only authorized OpenStaticFish organization maintainers can merge contributions.
`main` requires a pull request, passing `check`, an up-to-date branch, and resolved
review conversations. Code and workflow changes require code-owner approval; org owners
can merge their own PRs after the mandatory checks, since the org initially has
one maintainer. Direct pushes, force pushes, and deleting `main` are blocked.

Only `sources.json` and `flake.lock` are exempt from code-owner review, so the
guarded update bot can merge its own successful, internal metadata update PRs.
It cannot bypass mandatory CI or write directly to `main`. External metadata PRs
still require an organization maintainer to merge them; the bot will not merge
PRs authored by people or opened from forks. Repository write access is reserved
for organization maintainers, never outside collaborators.

Never commit credentials, Minecraft assets, prepared resources, account data, or
worlds. Report security vulnerabilities privately as described in `SECURITY.md`.
Contributions are licensed under the repository's MIT license.
