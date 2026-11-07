# Security

Report vulnerabilities privately using
[GitHub's private vulnerability reporting](https://github.com/OpenStaticFish/horizon-flake/security/advisories/new).
Do not include tokens, account data, or exploitable details in a public issue.

This repository packages upstream Horizon binaries; it does not audit Horizon or
provide Minecraft assets. Report issues in the game itself to
[Horizon](https://github.com/horizon-rust/horizon/security).

Fork PRs must not gain secrets, write permissions, or access to self-hosted
runners. The privileged merge workflow must run only trusted default-branch
code, never a PR checkout or an artifact supplied by a PR. Its bot-author,
repository, workflow, exact commit, label, and file-allowlist checks are security
boundaries and must not be weakened to make a failing update merge.
