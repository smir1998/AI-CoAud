import { afterEach, describe, expect, it, vi } from "vitest";
import { callLLM, fetchPullRequest, fetchRepositorySnapshot, parseRepoRef } from "./external";

const pull = {
  title: "large change",
  user: { login: "author" },
  head: { sha: "a".repeat(40), ref: "feature" },
  base: { ref: "main" },
  html_url: "https://github.com/acme/demo/pull/5",
  body: null,
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function filePage(start: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    filename: `src/file-${start + index}.ts`,
    status: "modified",
    additions: 1,
    deletions: 0,
    patch: `@@ -1 +1,2 @@\n old\n+new ${start + index}`,
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchPullRequest", () => {
  it("paginates to the audit cap and reports when more files remain", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/pulls/5")) return jsonResponse(pull);
      const page = Number(url.searchParams.get("page"));
      return jsonResponse(page === 1 ? filePage(1, 100) : page === 2 ? filePage(101, 100) : filePage(201, 1));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPullRequest("acme", "demo", 5);

    expect(result.files).toHaveLength(200);
    expect(result.partialCoverage).toBe(true);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/files?")).length).toBe(3);
  });

  it("marks an exactly capped pull request complete when no next page exists", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/pulls/5")) return jsonResponse(pull);
      const page = Number(url.searchParams.get("page"));
      return jsonResponse(page < 3 ? filePage((page - 1) * 100 + 1, 100) : []);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPullRequest("acme", "demo", 5);

    expect(result.files).toHaveLength(200);
    expect(result.partialCoverage).toBe(false);
  });

  it("passes cancellation through to metadata and file requests", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input));
      return jsonResponse(url.pathname.endsWith("/pulls/5") ? pull : []);
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPullRequest("acme", "demo", 5, controller.signal);

    expect(fetchMock.mock.calls).toHaveLength(2);
    const requestSignals = fetchMock.mock.calls.map(([, init]) => init?.signal);
    controller.abort();
    expect(requestSignals.every((signal) => signal?.aborted)).toBe(true);
  });

  it("sends the saved GitHub token with private pull request reads", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input));
      return jsonResponse(url.pathname.endsWith("/pulls/5") ? pull : []);
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPullRequest("acme", "private", 5, undefined, "ghp_test-token");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => init?.headers && new Headers(init.headers).get("Authorization") === "Bearer ghp_test-token")).toBe(true);
  });

  it("parses repository URLs and snapshots only bounded text files at the selected branch", async () => {
    const encode = (content: string) => btoa(content);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/repos/acme/demo") return jsonResponse({ default_branch: "main" });
      if (url.pathname.endsWith("/branches/release%2F2026")) return jsonResponse({ commit: { sha: "commit-sha" } });
      if (url.pathname.endsWith("/git/trees/commit-sha")) return jsonResponse({ truncated: false, tree: [
        { path: "src/app.ts", type: "blob", sha: "blob-app", size: 18 },
        { path: "README.md", type: "blob", sha: "blob-readme", size: 8 },
        { path: "node_modules/dependency/index.ts", type: "blob", sha: "ignored", size: 10 },
        { path: "assets/logo.png", type: "blob", sha: "binary", size: 20 },
      ] });
      const blob = url.pathname.endsWith("/blob-app") ? "const x = 1;\n" : "# project\n";
      return jsonResponse({ encoding: "base64", content: encode(blob) });
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(parseRepoRef("https://github.com/acme/demo/")).toEqual({ owner: "acme", repo: "demo" });
    const result = await fetchRepositorySnapshot("acme", "demo", "release/2026", "ghp_test-token");

    expect(result).toMatchObject({ branch: "release/2026", sha: "commit-sha", eligibleFiles: 2, skippedFiles: 0, partialCoverage: false });
    expect(result.files.map((file) => file.path)).toEqual(["README.md", "src/app.ts"]);
    expect(fetchMock.mock.calls.every(([, init]) => new Headers(init?.headers).get("Authorization") === "Bearer ghp_test-token")).toBe(true);
  });

  it("skips unusually tall files and reports partial branch coverage", async () => {
    const tallFile = Array.from({ length: 5_001 }, (_, index) => `const n${index} = ${index};`).join("\n");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/repos/acme/demo") return jsonResponse({ default_branch: "main" });
      if (url.pathname.endsWith("/branches/main")) return jsonResponse({ commit: { sha: "commit-sha" } });
      if (url.pathname.endsWith("/git/trees/commit-sha")) return jsonResponse({ truncated: false, tree: [
        { path: "src/a-tall.ts", type: "blob", sha: "tall", size: tallFile.length },
        { path: "src/z-small.ts", type: "blob", sha: "small", size: 9 },
      ] });
      const content = url.pathname.endsWith("/tall") ? tallFile : "const ok = 1;";
      return jsonResponse({ encoding: "base64", content: btoa(content) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchRepositorySnapshot("acme", "demo", "", "token");

    expect(result.files.map((file) => file.path)).toEqual(["src/z-small.ts"]);
    expect(result).toMatchObject({ eligibleFiles: 2, skippedFiles: 1, partialCoverage: true });
  });

  it("aborts an in-flight provider request when the audit signal is cancelled", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(init?.signal?.reason ?? new DOMException("Aborted", "AbortError"));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener("abort", abort, { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = callLLM("openai", "test-key", "gpt-4.1-mini", "system", "prompt", controller.signal);
    controller.abort();

    await expect(request).rejects.toThrow();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
