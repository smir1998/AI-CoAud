import { describe, expect, it } from "vitest";
import { initialState } from "./useAuditEngine";

describe("initial audit state", () => {
  it("starts idle without pre-populated audit results", () => {
    const state = initialState();
    expect(state.status).toBe("idle");
    expect(state.files).toEqual([]);
    expect(state.findings).toEqual([]);
    expect(state.shared.source).toBe("—");
  });
});
