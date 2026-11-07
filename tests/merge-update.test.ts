import { describe, expect, test } from "bun:test";
import { allowedUpdateFiles, eligibleCheck, eligiblePullRequest, type CompletedCheck } from "../scripts/merge-update";

const repository = "OpenStaticFish/horizon-flake";
const check: CompletedCheck = {
  name: "Check",
  path: ".github/workflows/check.yml",
  event: "workflow_dispatch",
  conclusion: "success",
  head_branch: "automation/horizon-update-123-1",
  head_sha: "a".repeat(40),
  head_repository: { full_name: repository },
  actor: { login: "github-actions[bot]" },
};

function pull() {
  return {
    number: 1, state: "open", draft: false,
    user: { login: "github-actions[bot]", type: "Bot" },
    head: { sha: check.head_sha, ref: check.head_branch, repo: { full_name: repository } },
    base: { ref: "main", repo: { full_name: repository } },
    labels: [{ name: "automated-update" }],
  };
}

describe("trusted check eligibility", () => {
  test("accepts only the explicitly dispatched, successful internal bot check", () => {
    expect(eligibleCheck(check, repository)).toBe(true);
  });

  test("rejects fork repositories, human actors and untrusted event types", () => {
    for (const candidate of [
      { ...check, head_repository: { full_name: "outsider/horizon-flake" } },
      { ...check, actor: { login: "contributor" } },
      { ...check, event: "pull_request" },
      { ...check, event: "push" },
      { ...check, conclusion: "failure" },
      { ...check, conclusion: "cancelled" },
      { ...check, path: ".github/workflows/other.yml" },
      { ...check, head_branch: "main" },
      { ...check, head_branch: "automation/horizon-update-malicious" },
      { ...check, head_sha: "not-a-sha" },
      null,
    ]) expect(eligibleCheck(candidate, repository)).toBe(false);
  });
});

describe("PR eligibility", () => {
  test("accepts a labeled bot PR for the exact checked SHA and main branch", () => {
    expect(eligiblePullRequest(pull(), check, repository, "main")).toBe(true);
  });

  test("rejects spoofed authors, forks, stale SHAs, wrong branches and drafts", () => {
    const valid = pull();
    for (const candidate of [
      { ...valid, user: { login: "contributor", type: "User" } },
      { ...valid, user: { login: "github-actions[bot]", type: "User" } },
      { ...valid, head: { ...valid.head, sha: "b".repeat(40) } },
      { ...valid, head: { ...valid.head, ref: "main" } },
      { ...valid, head: { ...valid.head, repo: { full_name: "outsider/horizon-flake" } } },
      { ...valid, base: { ...valid.base, ref: "other" } },
      { ...valid, base: { ...valid.base, repo: { full_name: "outsider/horizon-flake" } } },
      { ...valid, labels: [] },
      { ...valid, state: "closed" },
      { ...valid, draft: true },
      { ...valid, number: -1 },
      null,
    ]) expect(eligiblePullRequest(candidate, check, repository, "main")).toBe(false);
  });
});

describe("auto-merge file allowlist", () => {
  test("allows only the existing version manifest and Nix lock", () => {
    expect(allowedUpdateFiles([{ filename: "sources.json", status: "modified" }])).toBe(true);
    expect(allowedUpdateFiles([{ filename: "flake.lock", status: "modified" }])).toBe(true);
    expect(allowedUpdateFiles([
      { filename: "sources.json", status: "modified" }, { filename: "flake.lock", status: "modified" },
    ])).toBe(true);
  });

  test("rejects code, workflows, renames, deletion, empty and malformed responses", () => {
    for (const files of [
      [], null,
      [{ filename: "scripts/update.ts", status: "modified" }],
      [{ filename: ".github/workflows/check.yml", status: "modified" }],
      [{ filename: "sources.json", status: "renamed" }],
      [{ filename: "sources.json", status: "removed" }],
      [{ filename: "sources.json", status: "added" }],
      [{ filename: "sources.json", status: "modified" }, { filename: "README.md", status: "modified" }],
    ]) expect(allowedUpdateFiles(files)).toBe(false);
  });
});
