import type { Finding, ParsedFile, Severity } from "./scanner";
import { SEV_ORDER } from "./scanner";
import { extractJsonArray } from "./external";

export interface SecuritySpecialist {
  id: "injection" | "secrets" | "auth" | "dependencies" | "crypto";
  name: string;
  focus: string;
}

export const SECURITY_SPECIALISTS: SecuritySpecialist[] = [
  { id: "injection", name: "Injection", focus: "SQL, shell, template, command, and code injection" },
  { id: "secrets", name: "Secrets", focus: "credentials, tokens, private keys, and sensitive data exposure" },
  { id: "auth", name: "Authentication and authorization", focus: "identity, access control, sessions, and permission checks" },
  { id: "dependencies", name: "Dependencies and unsafe input", focus: "dependency risks, unsafe deserialization, and untrusted input" },
  { id: "crypto", name: "Cryptography and transport", focus: "cryptographic misuse, randomness, and TLS" },
];

const MAX_FILES = 8;
const MAX_LINES = 120;
const MAX_LINE_CHARS = 300;

export function specialistPrompt(specialist: SecuritySpecialist, files: ParsedFile[], lineScope: "added" | "scanned" = "added"): string {
  let remaining = MAX_LINES;
  const sections: string[] = [];
  for (const file of files.slice(0, MAX_FILES)) {
    const added = file.added.slice(0, remaining);
    if (!added.length) continue;
    remaining -= added.length;
    sections.push(`File: ${file.path} (${file.lang})\n${added.map((row) => `L${row.line}: ${row.text.slice(0, MAX_LINE_CHARS)}`).join("\n")}`);
    if (!remaining) break;
  }
  return `Review code as the ${specialist.name} security specialist. Focus: ${specialist.focus}.\n` +
    `Rule: only report findings on the ${lineScope} lines below when they are confirmed security issues. Cite the exact line number. ` +
    `Do not infer problems from code that is not shown. Return ONLY a JSON array; return [] if no issue. ` +
    `Each item must match: {"file": exact path, "line": integer, "severity": "critical|high|medium|low|info", "confidence": number, "title": string, "issue": string, "recommendation": string, "cwe": string|null}.\n\n` +
    (sections.join("\n\n") || "No added lines to review.");
}

interface RawFinding {
  file: string;
  line: number;
  severity: Severity;
  confidence: number;
  title: string;
  issue: string;
  recommendation: string;
  cwe?: string | null;
}

export function parseSpecialistFindings(specialist: SecuritySpecialist, files: ParsedFile[], rawText: string): Finding[] {
  const raw = extractJsonArray<RawFinding>(rawText);
  const findings: Finding[] = [];
  for (const item of raw) {
    if (typeof item.file !== "string" || !Number.isInteger(item.line) || typeof item.title !== "string" || !item.title.trim()) continue;
    const file = files.find((candidate) => candidate.path === item.file && candidate.added.some((row) => row.line === item.line));
    if (!file) continue;
    const added = file.added.find((row) => row.line === item.line)!;
    findings.push({
      id: `${file.path}:${item.line}:specialist-${specialist.id}-${findings.length}`,
      agent: "security", detector: "specialist", rule: `MANTIS-${specialist.id.toUpperCase()}`,
      severity: SEV_ORDER.includes(item.severity) ? item.severity : "medium",
      confidence: Math.min(0.97, Math.max(0.4, Number(item.confidence) || 0.6)),
      file: file.path, line: item.line, title: item.title.trim(),
      issue: typeof item.issue === "string" ? item.issue : "",
      recommendation: typeof item.recommendation === "string" ? item.recommendation : "",
      excerpt: added.text, cwe: typeof item.cwe === "string" ? item.cwe : undefined,
    });
  }
  return findings;
}
