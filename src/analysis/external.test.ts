import { afterEach, describe, expect, it, vi } from "vitest";
import { callLLM, fetchPullRequest } from "./external";

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
