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
review conversations. Human contributions require code-owner approval; org owners
can merge their own PRs after the mandatory checks, since the org initially has
one maintainer. Direct pushes, force pushes, and deleting `main` are blocked.

The only automation exception is the guarded update bot: it can merge its own
successful, internal update PRs that modify only `sources.json` and/or `flake.lock`.
It cannot bypass the mandatory CI or write directly to `main`.

Never commit credentials, Minecraft assets, prepared resources, account data, or
worlds. Report security vulnerabilities privately as described in `SECURITY.md`.
Contributions are licensed under the repository's MIT license.
