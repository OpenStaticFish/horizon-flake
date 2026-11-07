// Privileged automation: this file is run ONLY from the trusted default branch.
// PR metadata and filenames are data, never code or shell commands.

interface RecordValue {
  [key: string]: unknown;
}

function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

export interface CompletedCheck {
  name: "Check";
  path: ".github/workflows/check.yml";
  event: "workflow_dispatch";
  conclusion: "success";
  head_branch: string;
  head_sha: string;
  head_repository: { full_name: string };
  actor: { login: string };
}

export function eligibleCheck(value: unknown, repository: string): value is CompletedCheck {
  return record(value) &&
    value.name === "Check" &&
    value.path === ".github/workflows/check.yml" &&
    value.event === "workflow_dispatch" &&
    value.conclusion === "success" &&
    typeof value.head_branch === "string" &&
    /^automation\/horizon-update-\d+-\d+$/.test(value.head_branch) &&
    typeof value.head_sha === "string" && /^[a-f0-9]{40}$/.test(value.head_sha) &&
    record(value.head_repository) && value.head_repository.full_name === repository &&
    record(value.actor) && value.actor.login === "github-actions[bot]";
}

export interface UpdatePullRequest {
  number: number;
}

export function eligiblePullRequest(
  value: unknown,
  run: CompletedCheck,
  repository: string,
  defaultBranch: string,
): value is UpdatePullRequest {
  return record(value) &&
    Number.isSafeInteger(value.number) && Number(value.number) > 0 &&
    value.state === "open" && value.draft === false &&
    record(value.user) && value.user.login === "github-actions[bot]" && value.user.type === "Bot" &&
    record(value.head) && value.head.sha === run.head_sha && value.head.ref === run.head_branch &&
    record(value.head.repo) && value.head.repo.full_name === repository &&
    record(value.base) && value.base.ref === defaultBranch &&
    record(value.base.repo) && value.base.repo.full_name === repository &&
    Array.isArray(value.labels) &&
    value.labels.some((label: unknown) => record(label) && label.name === "automated-update");
}

export function allowedUpdateFiles(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.length <= 2 &&
    value.every((file: unknown) => record(file) && file.status === "modified" &&
      (file.filename === "sources.json" || file.filename === "flake.lock"));
}

async function github(args: string[]): Promise<unknown> {
  const child = Bun.spawn(["gh", "api", ...args], { stdout: "pipe", stderr: "inherit" });
  const output = await new Response(child.stdout).text();
  if (await child.exited !== 0) throw new Error("GitHub API request failed; no merge performed.");
  return JSON.parse(output);
}

async function pages(path: string): Promise<unknown[]> {
  const data = await github([path, "--paginate", "--slurp"]);
  if (!Array.isArray(data) || !data.every(Array.isArray)) {
    throw new Error("Unexpected paginated GitHub response; no merge performed.");
  }
  return data.flat();
}

async function main(): Promise<void> {
  const repository = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!repository || !eventPath) throw new Error("Run this script from GitHub Actions.");
  const event: unknown = await Bun.file(eventPath).json();
  if (!record(event) || !record(event.repository) ||
    typeof event.repository.default_branch !== "string" ||
    event.repository.full_name !== repository || !eligibleCheck(event.workflow_run, repository)) {
    console.log("Not a successful, trusted bot-update check; skipping.");
    return;
  }
  const run = event.workflow_run;
  const defaultBranch = event.repository.default_branch;
  const owner = repository.split("/")[0]!;
  const query = new URLSearchParams({
    state: "open", head: `${owner}:${run.head_branch}`, base: defaultBranch, per_page: "100",
  });
  const pulls = (await pages(`repos/${repository}/pulls?${query}`)).filter(
    (pull): pull is UpdatePullRequest => eligiblePullRequest(pull, run, repository, defaultBranch),
  );
  if (pulls.length !== 1) throw new Error("Expected exactly one matching bot update PR; no merge performed.");
  const pull = pulls[0]!;
  const files = await pages(`repos/${repository}/pulls/${pull.number}/files?per_page=100`);
  if (!allowedUpdateFiles(files)) {
    throw new Error("Only modifications to sources.json and flake.lock may auto-merge.");
  }
  // The SHA precondition closes the race with any push after the successful check.
  // Server-side rules still require CI, an up-to-date branch, and a resolved conversation.
  const result = await github([
    `repos/${repository}/pulls/${pull.number}/merge`, "--method", "PUT",
    "-f", `sha=${run.head_sha}`, "-f", "merge_method=squash",
  ]);
  if (!record(result) || result.merged !== true) throw new Error("GitHub declined the merge.");
  console.log(`Merged verified update #${pull.number} at ${run.head_sha}.`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Automatic merge failed.");
    process.exitCode = 1;
  });
}
