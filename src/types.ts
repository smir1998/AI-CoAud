export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type AgentId =
  | "orchestrator"
  | "style"
  | "security"
  | "tools"
  | "refactor"
  | "review";

export type StageId =
  | "webhook"
  | "fetch"
  | "orchestrate"
  | "audit"
  | "refactor"
  | "review"
  | "validate"
  | "post";

export interface DiffLine {
  t: "ctx" | "add" | "del";
  n?: number; // line number in the new file (add/ctx only)
  c: string;
}

export interface PRFile {
  path: string;
  lang: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

export interface Patch {
  before: string[];
  after: string[];
}

export interface Finding {
  id: string;
  agent: AgentId;
  source: string; // human label of the detector
  tool?: string; // deterministic rule id, if any
  file: string;
  line: number;
  severity: Severity;
  confidence: number; // 0..1
  title: string;
  issue: string;
  recommendation: string;
  patch?: Patch;
  status: "open" | "confirmed" | "merged" | "dismissed";
  corroboratedBy?: string[];
  note?: string;
}

export interface LogLine {
  id: number;
  t: number; // virtual ms
  agent: AgentId | "system" | "github";
  text: string;
}

export interface StageState {
  id: StageId;
  status: "pending" | "active" | "done";
  detail?: string;
}

export interface AgentState {
  id: AgentId;
  status: "idle" | "running" | "done";
  findings: number;
}

export interface SharedState {
  repository: string;
  pr_number: number;
  commit_sha: string;
  base_ref: string;
  head_ref: string;
  changed_files: number;
  additions: number;
  deletions: number;
  diff_loaded: boolean;
  findings_total: number;
  sev_critical: number;
  sev_high: number;
  sev_medium: number;
  sev_low: number;
  sev_info: number;
  patches_generated: number;
  validations: string[];
  overall_risk: Severity | null;
  posted: boolean;
}

export interface FinalReview {
  overall: Severity;
  filesReviewed: number;
  issues: number;
  counts: Record<Severity, number>;
  headline: string;
  summary: string;
  markdown: string;
}

export type AuditEvent =
  | { at: number; type: "log"; agent: LogLine["agent"]; text: string }
  | { at: number; type: "stage"; id: StageId; status: StageState["status"]; detail?: string }
  | { at: number; type: "agent"; id: AgentId; status: AgentState["status"] }
  | { at: number; type: "finding"; finding: Finding }
  | { at: number; type: "patch"; id: string; patch: Patch; note?: string }
  | { at: number; type: "merge"; from: string[]; into: string; note: string; tool?: string }
  | { at: number; type: "dismiss"; id: string; note: string; toSeverity?: Severity }
  | { at: number; type: "state"; patch: Partial<SharedState> }
  | { at: number; type: "validation"; text: string; ok: boolean }
  | { at: number; type: "review"; review: FinalReview }
  | { at: number; type: "post"; text: string };

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  repo: string;
  sha: string;
  files: PRFile[];
  webhookPayload: string[];
  events: AuditEvent[];
  duration: number;
}

export const SEV_META: Record<
  Severity,
  { label: string; color: string; bg: string; border: string; rank: number }
> = {
  critical: { label: "CRITICAL", color: "#f43f5e", bg: "rgba(244,63,94,0.12)", border: "rgba(244,63,94,0.45)", rank: 0 },
  high: { label: "HIGH", color: "#fb923c", bg: "rgba(251,146,60,0.12)", border: "rgba(251,146,60,0.45)", rank: 1 },
  medium: { label: "MEDIUM", color: "#facc15", bg: "rgba(250,204,21,0.10)", border: "rgba(250,204,21,0.40)", rank: 2 },
  low: { label: "LOW", color: "#38bdf8", bg: "rgba(56,189,248,0.10)", border: "rgba(56,189,248,0.40)", rank: 3 },
  info: { label: "INFO", color: "#94a3b8", bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.40)", rank: 4 },
};

export const AGENT_META: Record<
  AgentId,
  { name: string; short: string; color: string; model: string; role: string }
> = {
  orchestrator: { name: "Orchestrator", short: "ORC", color: "#38bdf8", model: "gpt-4o", role: "Plans the audit, maintains shared state, aggregates results" },
  style: { name: "Style Agent", short: "STY", color: "#f5a524", model: "claude-sonnet-4", role: "Smells, complexity, naming, duplication, idiom" },
  security: { name: "Security Agent", short: "SEC", color: "#f43f5e", model: "gpt-4o", role: "Injection, secrets, auth flaws, unsafe deps" },
  tools: { name: "Static Tools", short: "SAST", color: "#22d3ee", model: "deterministic", role: "Semgrep · Bandit · Ruff · pip-audit" },
  refactor: { name: "Refactor Agent", short: "REF", color: "#10b981", model: "claude-sonnet-4", role: "Generates patches that preserve behavior" },
  review: { name: "Review Agent", short: "REV", color: "#e6edf7", model: "gpt-4o", role: "Dedupes, ranks, writes the final PR review" },
};
