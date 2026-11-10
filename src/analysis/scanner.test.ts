import { describe, expect, it } from "vitest";
import { parseRepositorySnapshotFiles } from "./scanner";

describe("repository snapshot line mapping", () => {
  it("preserves source line numbers without pretending the snapshot is a diff", () => {
    const [file] = parseRepositorySnapshotFiles([{ path: "src/auth.ts", content: "const safe = true;\r\nverify(safe);\r\n" }]);

    expect(file.snapshot).toBe(true);
    expect(file.added).toEqual([
      { line: 1, text: "const safe = true;" },
      { line: 2, text: "verify(safe);" },
    ]);
    expect(file.rows).toMatchObject([
      { type: "ctx", oldNo: null, newNo: 1, text: "const safe = true;" },
      { type: "ctx", oldNo: null, newNo: 2, text: "verify(safe);" },
    ]);
  });
});
