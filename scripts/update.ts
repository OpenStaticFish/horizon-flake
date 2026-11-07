import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const repository = "horizon-rust/horizon";
export const assetName = "horizon-launcher-linux-x86_64.AppImage";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  digest?: string | null;
}

export interface Release {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: ReleaseAsset[];
}

export interface Sources {
  version: string;
  tag: string;
  url: string;
  hash: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAsset(value: unknown): value is ReleaseAsset {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.browser_download_url === "string" &&
    (value.digest == null || typeof value.digest === "string")
  );
}

function isRelease(value: unknown): value is Release {
  return (
    isRecord(value) &&
    typeof value.tag_name === "string" &&
    typeof value.draft === "boolean" &&
    typeof value.prerelease === "boolean" &&
    Array.isArray(value.assets) &&
    value.assets.every(isAsset)
  );
}

export function releaseVersion(tag: string): string | undefined {
  // Both forms have been used upstream. Game, nightly and preview tags are not launchers.
  return /^launcher(?:@|-v)(\d+\.\d+\.\d+)$/.exec(tag)?.[1];
}

export function selectRelease(releases: readonly Release[]): Release | undefined {
  const candidates = releases.filter(
    (release) =>
      !release.draft &&
      !release.prerelease &&
      releaseVersion(release.tag_name) !== undefined &&
      release.assets.some((asset) => asset.name === assetName),
  );

  return candidates.sort((left, right) => {
    const a = releaseVersion(left.tag_name)!.split(".").map(Number);
    const b = releaseVersion(right.tag_name)!.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      const difference = b[i]! - a[i]!;
      if (difference !== 0) return difference;
    }
    return 0;
  })[0];
}

export async function findLatestRelease(
  getPage: (page: number) => Promise<Release[]>,
): Promise<Release> {
  // /releases/latest is the GAME release, not necessarily the launcher. Paginate past it.
  for (let page = 1; page <= 10; page++) {
    const releases = await getPage(page);
    const selected = selectRelease(releases);
    if (selected) return selected;
    if (releases.length < 100) break;
  }
  throw new Error("No stable Horizon launcher release with a Linux x86-64 AppImage found.");
}

async function githubRequest(path: string): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "horizon-flake-updater",
  };
  if (process.env.GH_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  }
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub API request failed: HTTP ${response.status}.`);
  }
  return response.json();
}

async function prefetchUrl(url: string): Promise<string> {
  const process = Bun.spawn([
    "nix",
    "--option", "connect-timeout", "15",
    "--option", "stalled-download-timeout", "30",
    "--option", "download-attempts", "3",
    "store", "prefetch-file", "--json", url,
  ], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const output = await new Response(process.stdout).text();
  if ((await process.exited) !== 0) {
    throw new Error("Nix could not download the release asset.");
  }
  const result: unknown = JSON.parse(output);
  if (!isRecord(result) || typeof result.hash !== "string") {
    throw new Error("Nix returned an invalid prefetch result.");
  }
  return result.hash;
}

export async function sourcesForRelease(
  release: Release,
  prefetch: (url: string) => Promise<string> = prefetchUrl,
): Promise<Sources> {
  const version = releaseVersion(release.tag_name);
  const asset = release.assets.find((candidate) => candidate.name === assetName);
  if (!version || release.draft || release.prerelease || !asset) {
    throw new Error("Not a supported stable launcher release.");
  }

  const url = `https://github.com/${repository}/releases/download/${encodeURIComponent(release.tag_name)}/${assetName}`;
  if (asset.browser_download_url !== url) {
    throw new Error("The release asset URL does not belong to the expected upstream release.");
  }
  const digest = /^sha256:([a-fA-F0-9]{64})$/.exec(asset.digest ?? "")?.[1];
  if (!digest) {
    throw new Error("The AppImage has no valid GitHub SHA-256 digest; refusing an unverified update.");
  }
  const expected = `sha256-${Buffer.from(digest, "hex").toString("base64")}`;
  const actual = await prefetch(url);
  if (actual !== expected) {
    throw new Error("The downloaded AppImage does not match the GitHub SHA-256 digest.");
  }
  return { version, tag: release.tag_name, url, hash: actual };
}

export async function writeSources(path: string, sources: Sources): Promise<boolean> {
  const contents = `${JSON.stringify(sources, null, 2)}\n`;
  const current = await readFile(path, "utf8").catch((error: unknown) => {
    if (isRecord(error) && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (contents === current) return false;

  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  return true;
}

async function main(): Promise<void> {
  if (Bun.argv.length > 2) {
    throw new Error("Usage: bun run scripts/update.ts (no arguments)");
  }
  const release = await findLatestRelease(async (page) => {
    const data = await githubRequest(`releases?per_page=100&page=${page}`);
    if (!Array.isArray(data) || !data.every(isRelease)) {
      throw new Error("GitHub returned an invalid releases response.");
    }
    return data;
  });
  const sources = await sourcesForRelease(release);
  const path = fileURLToPath(new URL("../sources.json", import.meta.url));
  const changed = await writeSources(path, sources);
  console.log(changed ? `Pinned Horizon launcher ${sources.version}.` : `Horizon launcher ${sources.version} is already pinned.`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Update failed.");
    process.exitCode = 1;
  });
}
