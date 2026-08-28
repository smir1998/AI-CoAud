import { useCallback, useEffect, useRef, useState } from "react";
import type { Finding, ParsedFile, Severity } from "../analysis/scanner";
import {
  runPipeline,
  type AgentId, type AuditInput, type FinalReview, type PipelineEvent, type Settings, type SharedSnapshot,
} from "../analysis/pipeline";
import type { Provider } from "../analysis/external";
import { CONFIG } from "../config";
import { FIXTURES } from "../data/fixtures";

export interface LogLine {
  id: number;
  t: string;
  agent: AgentId;
  text: string;
}

export interface EngineState {
  status: "running" | "done" | "error";
  stage: number;
  agents: Record<AgentId, { status: "pending" | "running" | "done"; count: number }>;
  logs: LogLine[];
  files: ParsedFile[];
  findings: Finding[];
  shared: SharedSnapshot;
  review: FinalReview | null;
  validations: { text: string; ok: boolean }[];
  post: { text: string; url: string | null } | null;
  error: string | null;
  pulses: Record<string, number>;
}

const AGENT_IDS: AgentId[] = ["orchestrator", "style", "security", "tools", "refactor", "review"];

const initialAgents = () =>
  Object.fromEntries(AGENT_IDS.map((id) => [id, { status: "pending", count: 0 }])) as EngineState["agents"];

const zeroCounts = (): Record<Severity, number> => ({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });

const initialShared = (): SharedSnapshot => ({
  source: "—", sourceUrl: null, sha: "—", title: "—", author: "—", base: "—", head: "—",
  files: 0, additions: 0, deletions: 0, detectorMode: "deterministic rules",
  llmModel: null, tokensIn: 0, tokensOut: 0, costUsd: 0,
  findings: 0, counts: zeroCounts(), patches: 0, risk: null, posted: null, elapsedMs: 0,
});

const initialState = (): EngineState => ({
  status: "running",
  stage: -1,
  agents: initialAgents(),
  logs: [],
  files: [],
  findings: [],
  shared: initialShared(),
  review: null,
  validations: [],
  post: null,
  error: null,
  pulses: {},
});

/* ── settings persistence (keys stay in this browser) ────── */

const SETTINGS_KEY = CONFIG.storage.settings;

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { provider: "none", apiKey: "", model: CONFIG.llm.anthropicModel, ghToken: "", ...JSON.parse(raw) } as Settings;
  } catch { /* corrupted storage */ }
  return { provider: "none", apiKey: "", model: CONFIG.llm.anthropicModel, ghToken: "" };
}

let logSeq = 0;

export function useAuditEngine() {
  const [state, setState] = useState<EngineState>(initialState);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [input, setInput] = useState<AuditInput>({ kind: "fixture", fixture: FIXTURES[0] });
  const genRef = useRef(0);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (next.provider !== "none" && !next.apiKey) {
        // keep model coherent when switching provider
      }
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, []);

  const apply = useCallback((s: EngineState, e: PipelineEvent): EngineState => {
    const stamp = () => Date.now() + Math.random();
    const pulseKeys = (keys: string[]) => {
      const p = { ...s.pulses };
      for (const k of keys) p[k] = stamp() + Math.random() * 0.4;
      return p;
    };
    switch (e.kind) {
      case "stage":
        return { ...s, stage: e.stage, pulses: pulseKeys([`stage-${e.stage}`]) };
      case "agent": {
        const agents = { ...s.agents, [e.id]: { status: e.status, count: e.count ?? s.agents[e.id].count } };
        return { ...s, agents, pulses: pulseKeys([`agent-${e.id}`]) };
      }
      case "log":
        return {
          ...s,
          logs: [...s.logs.slice(-220), { id: ++logSeq, t: new Date().toLocaleTimeString("en-GB"), agent: e.agent, text: e.text }],
        };
      case "files":
        return { ...s, files: e.files, pulses: pulseKeys(["files"]) };
      case "finding": {
        const findings = [...s.findings, e.finding];
        return {
          ...s, findings,
          pulses: pulseKeys(["findings", "findings_total", `sev_${e.finding.severity}`]),
        };
      }
      case "patch": {
        const findings = s.findings.map((f) => (f.id === e.findingId ? { ...f, patch: e.patch } : f));
        return { ...s, findings, pulses: pulseKeys(["patches"]) };
      }
      case "state":
        return {
          ...s, shared: { ...s.shared, ...e.patch },
          pulses: pulseKeys(Object.keys(e.patch).map((k) => `sh_${k}`)),
        };
      case "review":
        return { ...s, review: e.review, pulses: pulseKeys(["review"]) };
      case "validations":
        return { ...s, validations: e.items };
      case "post":
        return { ...s, post: { text: e.text, url: e.url }, pulses: pulseKeys(["post"]) };
      case "error":
        return { ...s, status: "error", error: e.message, stage: s.stage };
      case "done":
        return { ...s, status: "done" };
      default:
        return s;
    }
  }, []);

  const run = useCallback((nextInput: AuditInput, s?: Settings) => {
    const gen = ++genRef.current;
    const cfg = s ?? loadSettings();
    setInput(nextInput);
    setState({ ...initialState(), status: "running" });
    const cancelled = () => genRef.current !== gen;
    void runPipeline(nextInput, cfg, (e) => {
      if (cancelled()) return;
      setState((prev) => apply(prev, e));
    }, cancelled).finally(() => {
      if (cancelled()) return; // a newer run owns the state now
      setState((prev) => (prev.status === "running" ? { ...prev, status: "done" } : prev));
    });
  }, [apply]);

  const rerun = useCallback(() => run(input, settings), [run, input, settings]);
  const cancel = useCallback(() => {
    genRef.current++;
    setState((prev) => (prev.status === "running" ? { ...prev, status: "done" } : prev));
  }, []);

  // audit the first fixture on load so the console opens alive
  useEffect(() => {
    run({ kind: "fixture", fixture: FIXTURES[0] }, settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, settings, updateSettings, input, run, rerun, cancel, provider: settings.provider as Provider };
}
