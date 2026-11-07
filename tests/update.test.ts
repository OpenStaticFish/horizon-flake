import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assetName,
  findLatestRelease,
  releaseVersion,
  repository,
  selectRelease,
  sourcesForRelease,
  writeSources,
  type Release,
} from "../scripts/update";
import pinned from "../sources.json";

const hex = "ab".repeat(32);
const hash = `sha256-${Buffer.from(hex, "hex").toString("base64")}`;

function release(tag = "launcher@0.2.49", overrides: Partial<Release> = {}): Release {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [{
      name: assetName,
      browser_download_url: `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${assetName}`,
      digest: `sha256:${hex}`,
    }],
    ...overrides,
  };
}

describe("release selection", () => {
  test("recognizes both upstream launcher tag formats", () => {
    expect(releaseVersion("launcher@0.2.49")).toBe("0.2.49");
    expect(releaseVersion("launcher-v0.1.0")).toBe("0.1.0");
    for (const tag of ["v0.2.49", "nightly", "nightly-2026-11-05", "launcher@0.2.50-rc.1"]) {
      expect(releaseVersion(tag)).toBeUndefined();
    }
  });

  test("ignores games, prereleases, drafts and releases without the Linux asset", () => {
    const valid = release();
    expect(selectRelease([
      release("v99.0.0"),
      release("nightly", { prerelease: true }),
      release("launcher@9.0.0", { prerelease: true }),
      release("launcher@8.0.0", { draft: true }),
      release("launcher@7.0.0", { assets: [] }),
      valid,
    ])).toBe(valid);
  });

  test("compares version components numerically rather than lexically", () => {
    const newest = release("launcher@0.10.0");
    expect(selectRelease([release("launcher@0.9.99"), newest, release("launcher@0.2.100")])).toBe(newest);
  });

  test("paginates when a page contains no usable launcher", async () => {
    const pages: number[] = [];
    const expected = release();
    const selected = await findLatestRelease(async (page) => {
      pages.push(page);
      return page === 1 ? Array.from({ length: 100 }, () => release("nightly")) : [expected];
    });
    expect(selected).toBe(expected);
    expect(pages).toEqual([1, 2]);
  });

  test("fails clearly when there is no supported release", async () => {
    await expect(findLatestRelease(async () => [])).rejects.toThrow("No stable Horizon launcher");
  });

  test("bounds pagination and propagates API errors", async () => {
    let requests = 0;
    await expect(findLatestRelease(async () => {
      requests++;
      return Array.from({ length: 100 }, () => release("nightly"));
    })).rejects.toThrow("No stable Horizon launcher");
    expect(requests).toBe(10);
    await expect(findLatestRelease(async () => {
      throw new Error("HTTP 403");
    })).rejects.toThrow("HTTP 403");
  });
});

describe("verified source metadata", () => {
  test("prefetches the actual asset and converts its SHA-256 to SRI", async () => {
    const candidate = release();
    let fetched: string | undefined;
    const sources = await sourcesForRelease(candidate, async (url) => {
      fetched = url;
      return hash;
    });
    expect(sources).toEqual({
      version: "0.2.49",
      tag: candidate.tag_name,
      url: candidate.assets[0]!.browser_download_url,
      hash,
    });
    expect(fetched).toBe(sources.url);
  });

  test("rejects a mismatched download", async () => {
    await expect(sourcesForRelease(release(), async () => "sha256-wrong")).rejects.toThrow("does not match");
  });

  test("rejects missing or malformed digests before downloading", async () => {
    for (const digest of [undefined, null, "", "sha256:abc", `md5:${hex}`]) {
      const candidate = release();
      candidate.assets[0]!.digest = digest;
      await expect(sourcesForRelease(candidate, async () => {
        throw new Error("must not download");
      })).rejects.toThrow("no valid GitHub SHA-256");
    }
  });

  test("rejects unexpected download hosts or assets", async () => {
    const candidate = release();
    candidate.assets[0]!.browser_download_url = "https://example.com/untrusted.AppImage";
    await expect(sourcesForRelease(candidate)).rejects.toThrow("expected upstream release");
  });

  test("rejects unsupported releases even if selected explicitly", async () => {
    for (const candidate of [
      release("v1.0.0"),
      release("launcher@1.0.0", { prerelease: true }),
      release("launcher@1.0.0", { draft: true }),
      release("launcher@1.0.0", { assets: [] }),
    ]) {
      await expect(sourcesForRelease(candidate)).rejects.toThrow("Not a supported stable");
    }
  });

  test("keeps the committed manifest internally consistent", () => {
    expect(releaseVersion(pinned.tag)).toBe(pinned.version);
    expect(pinned.url).toBe(`https://github.com/${repository}/releases/download/${encodeURIComponent(pinned.tag)}/${assetName}`);
    expect(pinned.hash).toMatch(/^sha256-[A-Za-z0-9+/]{43}=$/);
  });
});

describe("manifest writes", () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  async function manifest(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "horizon-flake-test-"));
    directories.push(directory);
    return join(directory, "sources.json");
  }

  test("creates metadata atomically and leaves no temporary files", async () => {
    const path = await manifest();
    expect(await writeSources(path, pinned)).toBe(true);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(pinned);
    expect(await readdir(directories[0]!)).toEqual(["sources.json"]);
  });

  test("does not rewrite an unchanged manifest", async () => {
    const path = await manifest();
    await writeSources(path, pinned);
    const before = await stat(path);
    expect(await writeSources(path, pinned)).toBe(false);
    expect((await stat(path)).ino).toBe(before.ino);
  });

  test("replaces outdated metadata", async () => {
    const path = await manifest();
    await writeFile(path, "outdated\n");
    expect(await writeSources(path, pinned)).toBe(true);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(pinned);
  });
});
