import { describe, expect, it } from "vitest";
import { SECURITY_SPECIALISTS, parseSpecialistFindings, specialistPrompt } from "./specialists";
import type { ParsedFile } from "./scanner";

const files: ParsedFile[] = [{
  path: "src/auth.ts",
  lang: "ts",
  rows: [],
  added: [{ line: 8, text: "query(`select * from users where id=${userId}`)" }],
  additions: 1,
  deletions: 0,
}];

describe("Mantis-style security specialists", () => {
  it("defines five focused security roles", () => {
    expect(SECURITY_SPECIALISTS.map((specialist) => specialist.id)).toEqual([
      "injection", "secrets", "auth", "dependencies", "crypto",
    ]);
  });

  it("builds bounded prompts from added lines only", () => {
    const prompt = specialistPrompt(SECURITY_SPECIALISTS[0], files);
    expect(prompt).toContain("Injection");
    expect(prompt).toContain("L8: query(");
    expect(prompt).not.toContain("unchanged context");
    expect(prompt).toContain("only report findings on the added lines");
  });

  it("keeps only valid findings on exact added lines", () => {
    const raw = JSON.stringify([
      { file: "src/auth.ts", line: 8, severity: "high", confidence: 0.93, title: "SQL injection", issue: "Interpolated input", recommendation: "Bind parameters", cwe: "CWE-89" },
      { file: "src/auth.ts", line: 9, severity: "critical", confidence: 0.99, title: "Untouched issue", issue: "Not in patch", recommendation: "Ignore" },
      { file: "src/auth.ts", line: "8", severity: "high", confidence: 0.99, title: "Invalid line type", issue: "Bad schema", recommendation: "Ignore" },
      { file: "src/other.ts", line: 8, severity: "critical", confidence: 0.99, title: "Wrong file", issue: "Wrong path", recommendation: "Ignore" },
    ]);

    const findings = parseSpecialistFindings(SECURITY_SPECIALISTS[0], files, raw);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      agent: "security", detector: "specialist", file: "src/auth.ts", line: 8,
      severity: "high", confidence: 0.93, rule: "MANTIS-INJECTION", cwe: "CWE-89",
    });
  });

  it("returns no findings for malformed output", () => {
    expect(parseSpecialistFindings(SECURITY_SPECIALISTS[0], files, "not json")).toEqual([]);
  });
});
