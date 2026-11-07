# Horizon flake

Packages the **precompiled Horizon launcher** from
[horizon-rust/horizon](https://github.com/horizon-rust/horizon). No Rust compilation
is needed. Supports **`x86_64-linux`**, the only architecture with an upstream Linux
launcher release.

The upstream AppImage is pinned by version and SHA-256 in `sources.json`, extracted
at build time, and wrapped with Nixpkgs' AppImage FHS environment. This provides
the conventional Linux loader and libraries for both the launcher **and the games
and Java runtimes it downloads** on NixOS, without requiring system-wide `nix-ld`
or FUSE. The desktop menu entry and icons are included. Entries Horizon creates
itself also use the stable `horizon-launcher` command from your Nix profile, not a
version-specific binary that disappears after garbage collection.

## Home Manager

Like [t3code-desktop-flake](https://github.com/OpenStaticFish/t3code-desktop-flake),
add an input, import the module, and enable the program:

```nix
{
  inputs.horizon = {
    url = "github:OpenStaticFish/horizon-flake";
    inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { nixpkgs, home-manager, horizon, ... }: {
    homeConfigurations.your-user = home-manager.lib.homeManagerConfiguration {
      pkgs = nixpkgs.legacyPackages.x86_64-linux;
      modules = [
        ./home.nix
        horizon.homeManagerModules.default
        { programs.horizon.enable = true; }
      ];
    };
  };
}
```

For Home Manager embedded in NixOS, use the same module in the user's imports:

```nix
home-manager.users.your-user = {
  imports = [ inputs.horizon.homeManagerModules.default ];
  programs.horizon.enable = true;
};
```

The module exposes `programs.horizon.enable` and `programs.horizon.package`. It
does not change Horizon's writable settings or manage your accounts and worlds.
If you only want the package, no module is necessary:

```nix
home.packages = [ inputs.horizon.packages.${pkgs.stdenv.hostPlatform.system}.default ];
```

## Run or build

From this checkout:

```sh
nix run .
nix run . -- --version
nix build .#horizon-launcher
```

From GitHub: `nix run github:OpenStaticFish/horizon-flake`.
The command is `horizon-launcher`. An optional overlay also provides
`pkgs.horizon-launcher` via `inputs.horizon.overlays.default`.

Sign in with a Microsoft account that owns **Minecraft: Java Edition**. Horizon
installs the game and prepares assets from your licensed copy; no Minecraft
assets are included in this flake. See the
[upstream installation guide](https://playhorizon.dev/docs/install).

## Automatic updates

`.github/workflows/update.yml` runs daily at **04:37 UTC**, or manually through
**Actions → Update Horizon and flake.lock → Run workflow**. It:

1. Finds a stable **launcher** release with a Linux AppImage, skipping game,
   nightly, preview, draft, and incompatible releases. It does not use GitHub's
   `/releases/latest`, which can point to the game instead.
2. Downloads the asset with Nix and checks its SHA-256 against GitHub's published
   asset digest before atomically updating `sources.json`.
3. Updates `flake.lock`, checks TypeScript and tests, then opens a labeled update
   PR on an internal automation branch if something changed. It keeps at most one
   update PR open; a failed update stays open for maintainer investigation.
4. Explicitly dispatches the read-only **Check** workflow on that branch. This
   builds the flake, validates workflows/formatting, and smoke-tests the launcher.
5. **Merge verified updates** runs after successful checks. It executes only
   default-branch code and verifies the bot author, internal repository, branch,
   label, exact checked SHA, and an allowlist containing only `sources.json` and
   `flake.lock`, then squash-merges through GitHub's protected-branch API.

No extra secret or self-hosted runner is required: automation uses `GITHUB_TOKEN`
and GitHub-hosted Ubuntu runners. The check workflow also runs on normal pushes
and pull requests. Bot pushes do not trigger push workflows, so update PR checks
are explicitly dispatched. The bot cannot bypass required CI or push to `main`.

**Unlike the example's mutable, launch-time downloader, the launcher here stays
pinned in `/nix/store`.** Its built-in self-updater is disabled; Horizon still
manages game downloads and updates in its normal writable data directory. To
receive a new launcher in your Home Manager configuration, advance this input
and rebuild:

```sh
nix flake update horizon
home-manager switch --flake .#your-user
# For Home Manager embedded in NixOS, use your normal nixos-rebuild instead.
```

CI updates this repository, not the lock file in your separate NixOS/Home Manager
repository. There is no background user timer or launch-time launcher update.

## Open-source access and branch protection

Anyone can read, fork, open issues, and submit a pull request. Outside contributors
have no write or merge access. `main` requires PRs, successful GitHub Actions
`check`, an up-to-date branch, and resolved conversations; force pushes and
deletion are blocked. Human PRs require maintainer/code-owner approval. Org owners
may merge their own PRs after CI, avoiding a two-person deadlock for the initial
single-maintainer org. Only org owners and the guarded update bot can merge `main`.

All external fork workflows require maintainer approval and run read-only on
GitHub-hosted runners. Repository workflow tokens default to read-only; only the
updater and guarded merger request write access. Actions are SHA-pinned and
restricted to the three approved action revisions used by these workflows.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the
[MIT license](LICENSE). Add a trusted OpenStaticFish team to `CODEOWNERS` and the
maintainer-access ruleset when expanding the maintainer group.

## Development

```sh
nix develop
bun install --frozen-lockfile
bun run check
bun run update                 # refresh sources.json; Nix and network access required
nix flake update
nix fmt
actionlint
nix flake check --print-build-logs
nix run . -- --version
```

The updater uses `GH_TOKEN` when present to avoid GitHub API rate limits. Tests use
fixtures and do not contact GitHub. The FHS wrapper requires unprivileged user
namespaces (Bubblewrap); a host or container that disables them cannot run it.
The flake checks build and validate the package without trying to start a nested
Bubblewrap environment inside Nix's build sandbox.

Native Rust mods compile the game and may need an additional development
environment; this flake supplies the precompiled launcher's runtime, not a native
mod build toolchain. Full gameplay and Microsoft sign-in are not exercised by CI.

Horizon is MIT-licensed and unofficial: not approved by or associated with Mojang
or Microsoft.
