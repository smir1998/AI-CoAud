/* Shared UI metadata. Domain types live in src/analysis (scanner / pipeline). */

import type { AgentId } from "./analysis/pipeline";
import type { Severity } from "./analysis/scanner";

export type { AgentId } from "./analysis/pipeline";
export type { Severity } from "./analysis/scanner";

export const AGENT_META: Record<AgentId, { name: string; short: string; color: string; model: string }> = {
  orchestrator: { name: "Orchestrator", short: "ORCH", color: "#38bdf8", model: "controller" },
  style: { name: "Code Quality Agent", short: "STYLE", color: "#f5a524", model: "heuristics" },
  security: { name: "Security (general)", short: "SEC", color: "#f43f5e", model: "rule bucket" },
  tools: { name: "Static Tools", short: "SAST", color: "#22d3ee", model: "deterministic" },
  refactor: { name: "Refactoring Agent", short: "RFCT", color: "#10b981", model: "llm · templates" },
  review: { name: "Review Agent", short: "REV", color: "#e6edf7", model: "synthesis" },
  // ── threat panel: five parallel LLM security specialists ──
  inj:    { name: "Injection Hunter",        short: "INJ", color: "#fb7185", model: "llm · specialist" },
  secret: { name: "Secrets Sentinel",        short: "KEY", color: "#fbbf24", model: "llm · specialist" },
  auth:   { name: "Access Auditor",          short: "ACL", color: "#a78bfa", model: "llm · specialist" },
  supply: { name: "Supply-Chain Auditor",    short: "PKG", color: "#4ade80", model: "llm · specialist" },
  crypto: { name: "Crypto & Transport Auditor", short: "CRY", color: "#67e8f9", model: "llm · specialist" },
};

/* crew layout — main line + the security panel group */
export const CREW_MAIN: AgentId[] = ["orchestrator", "style", "tools", "refactor", "review"];
export const CREW_PANEL: AgentId[] = ["inj", "secret", "auth", "supply", "crypto"];

export const SEV_META: Record<Severity, { label: string; color: string; rank: number }> = {
  critical: { label: "CRIT", color: "#f43f5e", rank: 0 },
  high: { label: "HIGH", color: "#fb923c", rank: 1 },
  medium: { label: "MED", color: "#facc15", rank: 2 },
  low: { label: "LOW", color: "#38bdf8", rank: 3 },
  info: { label: "INFO", color: "#94a3b8", rank: 4 },
};
