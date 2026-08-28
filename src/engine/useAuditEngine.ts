import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentId, AgentState, AuditEvent, Finding, FinalReview, LogLine, PullRequest,
  Severity, SharedState, StageId, StageState,
} from "../types";

export const STAGES: { id: StageId; label: string }[] = [
  { id: "webhook", label: "Webhook received" },
  { id: "fetch", label: "Fetch PR + diff" },
  { id: "orchestrate", label: "Orchestrator" },
  { id: "audit", label: "Parallel audit" },
  { id: "refactor", label: "Refactor agent" },
  { id: "review", label: "Review agent" },
  { id: "validate", label: "Final validation" },
  { id: "post", label: "Post to GitHub" },
];

export interface EngineState {
  time: number;
  done: boolean;
  stages: Record<StageId, StageState>;
  agents: Record<AgentId, AgentState>;
  findings: Finding[];
  logs: LogLine[];
  shared: SharedState;
  review: FinalReview | null;
  postText: string | null;
  validations: { text: string; ok: boolean }[];
  pulses: Record<string, number>;
}

const AGENT_IDS: AgentId[] = ["orchestrator", "style", "security", "tools", "refactor", "review"];

function initState(pr: PullRequest): EngineState {
  const stages = {} as Record<StageId, StageState>;
  for (const s of STAGES) stages[s.id] = { id: s.id, status: "pending" };
  const agents = {} as Record<AgentId, AgentState>;
  for (const a of AGENT_IDS) agents[a] = { id: a, status: "idle", findings: 0 };
  const additions = pr.files.reduce((s, f) => s + f.additions, 0);
  const deletions = pr.files.reduce((s, f) => s + f.deletions, 0);
  return {
    time: 0,
    done: false,
    stages,
    agents,
    findings: [],
    logs: [],
    shared: {
      repository: pr.repo,
      pr_number: pr.number,
      commit_sha: pr.sha,
      base_ref: pr.base,
      head_ref: pr.branch,
      changed_files: pr.files.length,
      additions,
      deletions,
      diff_loaded: false,
      findings_total: 0,
      sev_critical: 0,
      sev_high: 0,
      sev_medium: 0,
      sev_low: 0,
      sev_info: 0,
      patches_generated: 0,
      validations: [],
      overall_risk: null,
      posted: false,
    },
    review: null,
    postText: null,
    validations: [],
    pulses: {},
  };
}

function recount(findings: Finding[]): Partial<SharedState> {
  const c: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) if (f.status !== "merged") c[f.severity]++;
  return {
    findings_total: findings.filter((f) => f.status !== "merged").length,
    sev_critical: c.critical,
    sev_high: c.high,
    sev_medium: c.medium,
    sev_low: c.low,
    sev_info: c.info,
  };
}

let logSeq = 0;

const COUNT_KEYS = ["findings", "findings_total", "sev_critical", "sev_high", "sev_medium", "sev_low", "sev_info"];

function applyEvent(s: EngineState, e: AuditEvent): EngineState {
  const pulse = (key: string) => ({ ...s.pulses, [key]: Date.now() + Math.random() });
  const pulseCounts = () => {
    const p = { ...s.pulses };
    const stamp = Date.now() + Math.random();
    for (const k of COUNT_KEYS) p[k] = stamp + Math.random() * 0.5;
    return p;
  };
  switch (e.type) {
    case "log": {
      const line: LogLine = { id: ++logSeq, t: e.at, agent: e.agent, text: e.text };
      return { ...s, logs: [...s.logs.slice(-90), line] };
    }
    case "stage":
      return {
        ...s,
        stages: { ...s.stages, [e.id]: { id: e.id, status: e.status, detail: e.detail ?? s.stages[e.id].detail } },
      };
    case "agent":
      return { ...s, agents: { ...s.agents, [e.id]: { ...s.agents[e.id], status: e.status } } };
    case "finding": {
      const findings = [...s.findings, e.finding];
      return {
        ...s,
        findings,
        agents: { ...s.agents, [e.finding.agent]: { ...s.agents[e.finding.agent], findings: s.agents[e.finding.agent].findings + 1 } },
        shared: { ...s.shared, ...recount(findings) },
        pulses: pulseCounts(),
      };
    }
    case "patch": {
      const findings = s.findings.map((f) =>
        f.id === e.id ? { ...f, patch: e.patch, note: e.note ?? f.note, status: "confirmed" as const } : f
      );
      return { ...s, findings, pulses: pulse("patches") };
    }
    case "merge": {
      const findings = s.findings.map((f) =>
        f.id === e.into
          ? { ...f, corroboratedBy: [...(f.corroboratedBy ?? []), e.tool ?? "tool"], note: e.note, confidence: Math.min(0.99, f.confidence + 0.02) }
          : f
      );
      return { ...s, findings, pulses: pulse("findings") };
    }
    case "dismiss": {
      const findings = s.findings.map((f) =>
        f.id === e.id ? { ...f, note: e.note, severity: e.toSeverity ?? f.severity, status: "confirmed" as const } : f
      );
      return { ...s, findings, shared: { ...s.shared, ...recount(findings) }, pulses: pulseCounts() };
    }
    case "state": {
      const pulses = { ...s.pulses };
      for (const k of Object.keys(e.patch)) pulses[k] = Date.now() + Math.random();
      return { ...s, shared: { ...s.shared, ...e.patch }, pulses };
    }
    case "validation":
      return { ...s, validations: [...s.validations, { text: e.text, ok: e.ok }] };
    case "review": {
      const findings = s.findings.map((f) => (f.status === "merged" ? f : { ...f, status: "confirmed" as const }));
      return { ...s, review: e.review, findings, pulses: pulse("review") };
    }
    case "post":
      return { ...s, postText: e.text };
    default:
      return s;
  }
}

export function useAuditEngine(pr: PullRequest) {
  const [state, setState] = useState<EngineState>(() => initState(pr));
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(2);
  const idxRef = useRef(0);
  const timeRef = useRef(0);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const trigger = useCallback(() => {
    idxRef.current = 0;
    timeRef.current = 0;
    setState(initState(pr));
    setRunning(true);
  }, [pr]);

  useEffect(() => {
    idxRef.current = 0;
    timeRef.current = 0;
    setState(initState(pr));
    setRunning(true);
  }, [pr]);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      timeRef.current += 55 * speedRef.current;
      const t = timeRef.current;
      const evs = pr.events;
      let i = idxRef.current;
      const due: AuditEvent[] = [];
      while (i < evs.length && evs[i].at <= t) {
        due.push(evs[i]);
        i++;
      }
      idxRef.current = i;
      if (due.length > 0) {
        setState((s) => {
          let next = s;
          for (const e of due) next = applyEvent(next, e);
          return { ...next, time: t };
        });
      } else {
        setState((s) => ({ ...s, time: t }));
      }
      if (i >= evs.length && t >= pr.duration) {
        setRunning(false);
        setState((s) => ({ ...s, done: true, time: pr.duration }));
      }
    }, 55);
    return () => clearInterval(iv);
  }, [running, pr]);

  return { state, running, speed, setSpeed, trigger, setRunning };
}
