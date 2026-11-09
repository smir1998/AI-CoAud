import { afterEach, describe, expect, it, vi } from "vitest";
import { runPipeline, selectReviewEvent } from "./pipeline";

afterEach(() => vi.unstubAllGlobals());

describe("review and cancellation safety", () => {
  it("never approves a partially covered pull request", () => {
    expect(selectReviewEvent("low", true)).toBe("COMMENT");
    expect(selectReviewEvent("high", true)).toBe("COMMENT");
    expect(selectReviewEvent("low", false)).toBe("APPROVE");
    expect(selectReviewEvent("high", false)).toBe("REQUEST_CHANGES");
  });

  it("passes an aborted signal through the GitHub fetch stage", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return Promise.reject(init?.signal?.reason ?? new DOMException("Aborted", "AbortError"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const events: unknown[] = [];

    await runPipeline(
      { kind: "github", owner: "acme", repo: "demo", pr: 5, ref: "acme/demo#5" },
      { provider: "none", apiKey: "", model: "", ghToken: "" },
      (event) => events.push(event),
      () => controller.signal.aborted,
      controller.signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
    expect(events).not.toContainEqual(expect.objectContaining({ kind: "done" }));
  });
});
