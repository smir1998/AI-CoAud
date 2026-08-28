import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentId, Finding, PullRequest, StageId } from "../types";
import { AGENT_META, SEV_META } from "../types";
import { PULL_REQUESTS } from "../data/pullRequests";
import { STAGES, useAuditEngine } from "../engine/useAuditEngine";
import DiffViewer from "./DiffViewer";
import Findings from "./Findings";
import ReviewPanel from "./ReviewPanel";
import {
  ActivityIcon, BranchIcon, CheckIcon, ClockIcon, DiffIcon, LayersIcon,
  PauseIcon, PlayIcon, ReplayIcon, RobotIcon, TerminalIcon, WebhookIcon, ZapIcon,
} from "./icons";

/* ── small atoms ─────────────────────────────────────────── */

function Led({ color, on, pulse }: { color: string; on: boolean; pulse?: boolean }) {
  return (
    <span
      className={pulse ? "led-pulse inline-block h-1.5 w-1.5 shrink-0 rounded-full" : "inline-block h-1.5 w-1.5 shrink-0 rounded-full"}
      style={{ background: on ? color : "#27395c", color }}
    />
  );
}

function AgentChip({ id, status, count }: { id: AgentId; status: "idle" | "running" | "done"; count: number }) {
  const m = AGENT_META[id];
  return (
    <div
      className="group relative flex min-w-0 items-center gap-2 rounded-md border border-ink-700/70 bg-ink-850/80 px-2.5 py-1.5 transition-colors hover:border-ink-600"
      title={`${m.name} · ${m.model}\n${m.role}`}
    >
      <Led color={m.color} on={status !== "idle"} pulse={status === "running"} />
      <span className="font-display text-[10.5px] font-semibold tracking-[0.1em]" style={{ color: status === "idle" ? "#4d648f" : m.color }}>
        {m.short}
      </span>
      <span className="hidden truncate font-mono text-[10px] text-ink-400 xl:block">{m.name}</span>
      {count > 0 && (
        <span className="ml-auto rounded-sm bg-ink-700/80 px-1.5 font-mono text-[10px] text-ink-200">{count}</span>
      )}
      {status === "running" && <span className="indeterminate absolute bottom-0 left-2 right-2 h-px rounded-full" style={{ background: m.color }} />}
    </div>
  );
}

/* ── left rail: stages + payload ─────────────────────────── */

function StageRail({ pr, stages }: { pr: PullRequest; stages: Record<StageId, { status: string; detail?: string }> }) {
  return (
    <div className="panel p-3">
      <p className="panel-head flex items-center gap-2 px-1 pb-2.5"><ZapIcon className="h-3.5 w-3.5 text-amberx" /> pipeline</p>
      <ol className="relative space-y-0.5">
        {STAGES.map((st, i) => {
          const s = stages[st.id];
          const active = s.status === "active";
          const done = s.status === "done";
          return (
            <li key={st.id} className="relative flex items-center gap-2.5 rounded-md px-1.5 py-[5px] transition-colors"
              style={{ background: active ? "rgba(56,189,248,0.06)" : undefined }}>
              <span className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[9.5px]"
                style={{
                  borderColor: done ? "rgba(16,185,129,0.55)" : active ? "rgba(56,189,248,0.6)" : "#27395c",
                  background: done ? "rgba(16,185,129,0.12)" : active ? "rgba(56,189,248,0.1)" : "#0a111f",
                  color: done ? "#10b981" : active ? "#38bdf8" : "#4d648f",
                }}>
                {done ? <CheckIcon className="h-2.5 w-2.5" /> : i + 1}
              </span>
              {i < STAGES.length - 1 && (
                <span className="absolute top-[26px] left-[13px] h-[calc(100%-16px)] w-px"
                  style={{ background: done ? "rgba(16,185,129,0.4)" : "#1a2a45" }} />
              )}
              <span className={`font-display text-[11.5px] font-semibold tracking-wide ${done ? "text-ink-200" : active ? "text-orchid" : "text-ink-500"}`}>
                {st.label}
              </span>
              {active && <span className="led-pulse ml-1 h-1 w-1 rounded-full bg-orchid" style={{ color: "#38bdf8" }} />}
              {s.detail && <span className="ml-auto truncate pl-1 font-mono text-[9.5px] text-ink-400">{s.detail}</span>}
            </li>
          );
        })}
      </ol>

      <div className="mt-3 border-t border-ink-700/60 pt-2.5">
        <p className="panel-head flex items-center gap-2 px-1 pb-1.5"><WebhookIcon className="h-3.5 w-3.5 text-cyanx" /> webhook payload</p>
        <div className="scroll-thin max-h-36 overflow-auto rounded-md border border-ink-700/60 bg-ink-900/80 p-2 font-mono text-[10px] leading-[1.5] text-ink-300">
          {pr.webhookPayload.map((l, i) => (
            <div key={i} className="whitespace-pre">{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── right rail: shared state + event log ────────────────── */

const STATE_ROWS: { key: string; label: string; fmt?: (v: unknown) => string }[] = [
  { key: "repository", label: "repository" },
  { key: "pr_number", label: "pr_number", fmt: (v) => `#${v}` },
  { key: "commit_sha", label: "commit_sha" },
  { key: "head_ref", label: "head_ref" },
  { key: "base_ref", label: "base_ref" },
  { key: "changed_files", label: "changed_files" },
  { key: "additions", label: "additions", fmt: (v) => `+${v}` },
  { key: "deletions", label: "deletions", fmt: (v) => `−${v}` },
  { key: "diff_loaded", label: "diff_loaded" },
  { key: "findings_total", label: "findings" },
  { key: "sev_critical", label: "sev.critical" },
  { key: "sev_high", label: "sev.high" },
  { key: "sev_medium", label: "sev.medium" },
  { key: "sev_low", label: "sev.low" },
  { key: "sev_info", label: "sev.info" },
  { key: "patches_generated", label: "patches" },
  { key: "overall_risk", label: "overall_risk" },
  { key: "posted", label: "posted" },
];

function SharedStatePanel({ shared, pulses }: { shared: Record<string, unknown>; pulses: Record<string, number> }) {
  return (
    <div className="panel overflow-hidden">
      <p className="panel-head flex items-center gap-2 border-b border-ink-700/60 bg-ink-900/60 px-3 py-2">
        <LayersIcon className="h-3.5 w-3.5 text-orchid" /> shared workflow state
        <span className="ml-auto flex items-center gap-1 font-mono text-[9px] normal-case tracking-normal text-ink-500">
          <Led color="#38bdf8" on pulse /> redis:audit:{String(shared.pr_number)}
        </span>
      </p>
      <div className="px-1 py-1 font-mono text-[10.5px]">
        {STATE_ROWS.map(({ key, label, fmt }) => {
          const raw = shared[key];
          let display: string;
          let color = "#b9c8e0";
          if (raw === true) { display = "true"; color = "#10b981"; }
          else if (raw === false) { display = "false"; color = "#4d648f"; }
          else if (raw === null) { display = "null"; color = "#4d648f"; }
          else if (key === "overall_risk" && typeof raw === "string") { display = raw.toUpperCase(); color = SEV_META[raw as keyof typeof SEV_META]?.color ?? "#b9c8e0"; }
          else { display = fmt ? fmt(raw) : String(raw); }
          const pulseKey = pulses[key];
          return (
            <div key={`${key}:${pulseKey ?? 0}`} className={`flex items-center justify-between rounded px-2 py-[3px] ${pulseKey ? "anim-flash" : ""}`}>
              <span className="text-ink-400">{label}</span>
              <span style={{ color }}>{display}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventLog({ logs }: { logs: { id: number; t: number; agent: string; text: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [logs.length]);
  const tag = (a: string) => {
    if (a === "system") return { s: "SYS", c: "#8ca0c0" };
    if (a === "github") return { s: "GH", c: "#22d3ee" };
    const m = AGENT_META[a as AgentId];
    return m ? { s: m.short, c: m.color } : { s: "SYS", c: "#8ca0c0" };
  };
  return (
    <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <p className="panel-head flex items-center gap-2 border-b border-ink-700/60 bg-ink-900/60 px-3 py-2">
        <TerminalIcon className="h-3.5 w-3.5 text-emx" /> agent event log
        <span className="ml-auto font-mono text-[9px] normal-case tracking-normal text-ink-500">{logs.length} events</span>
      </p>
      <div ref={ref} className="scroll-thin min-h-0 flex-1 overflow-auto p-2 font-mono text-[10.5px] leading-[1.6]">
        {logs.map((l) => {
          const t = tag(l.agent);
          return (
            <div key={l.id} className="anim-slidein flex gap-2 whitespace-pre-wrap break-words">
              <span className="shrink-0 text-ink-600">{(l.t / 1000).toFixed(1).padStart(4, "0")}s</span>
              <span className="w-8 shrink-0 font-semibold" style={{ color: t.c }}>{t.s}</span>
              <span className="text-ink-300">{l.text}</span>
            </div>
          );
        })}
        {logs.length === 0 && <p className="cursor-blink px-1 text-ink-500">listening for webhook</p>}
      </div>
    </div>
  );
}

/* ── main console ────────────────────────────────────────── */

type Tab = "diff" | "findings" | "review";

export default function Console() {
  const [prId, setPrId] = useState(PULL_REQUESTS[0].id);
  const pr = PULL_REQUESTS.find((p) => p.id === prId)!;
  const { state, running, speed, setSpeed, trigger, setRunning } = useAuditEngine(pr);
  const [tab, setTab] = useState<Tab>("diff");
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setTab("diff");
    setActiveId(null);
  }, [prId]);

  const focusFinding = (f: Finding) => {
    setActiveId(f.id);
    setTab("diff");
  };

  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of state.findings) if (f.status !== "merged") c[f.severity]++;
    return c;
  }, [state.findings]);

  const issues = state.shared.findings_total;
  const risk = state.shared.overall_risk;
  const progress = Math.min(100, (state.time / pr.duration) * 100);

  return (
    <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-3 px-3 pb-4 lg:px-5">
      {/* command bar */}
      <div className="panel flex flex-wrap items-center gap-2 px-3 py-2.5">
        <span className="panel-head mr-1 hidden items-center gap-2 sm:flex"><ActivityIcon className="h-3.5 w-3.5 text-rosex" /> audit target</span>
        {PULL_REQUESTS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPrId(p.id)}
            className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-all ${
              p.id === prId
                ? "border-orchid/60 bg-orchid/[0.08] shadow-[0_0_16px_-6px_rgba(56,189,248,0.5)]"
                : "border-ink-700/70 bg-ink-850/60 hover:border-ink-600"
            }`}
          >
            <BranchIcon className={`h-3.5 w-3.5 ${p.id === prId ? "text-orchid" : "text-ink-500"}`} />
            <span>
              <span className={`block font-mono text-[10px] leading-tight ${p.id === prId ? "text-orchid" : "text-ink-400"}`}>#{p.number}</span>
              <span className="block max-w-40 truncate text-[11px] leading-tight font-medium text-ink-200">{p.title}</span>
            </span>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 font-mono text-[10.5px] text-ink-400 md:flex">
            <ClockIcon className="h-3.5 w-3.5" /> {(state.time / 1000).toFixed(1)}s / {(pr.duration / 1000).toFixed(1)}s
          </span>
          <div className="flex overflow-hidden rounded-md border border-ink-700/70">
            {[1, 2, 4].map((s) => (
              <button key={s} onClick={() => setSpeed(s)}
                className={`px-2 py-1 font-mono text-[10.5px] transition-colors ${speed === s ? "bg-orchid/15 text-orchid" : "bg-ink-850 text-ink-400 hover:text-ink-200"}`}>
                {s}×
              </button>
            ))}
          </div>
          <button onClick={() => setRunning(!running)} disabled={state.done}
            className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-800 px-2.5 py-1 font-mono text-[10.5px] text-ink-200 transition-colors hover:border-orchid/60 hover:text-orchid disabled:opacity-40">
            {running ? <PauseIcon className="h-3 w-3" /> : <PlayIcon className="h-3 w-3" />}
            {running ? "pause" : "resume"}
          </button>
          <button onClick={trigger}
            className="flex items-center gap-1.5 rounded-md border border-emx/50 bg-emx/10 px-2.5 py-1 font-mono text-[10.5px] text-emx transition-all hover:bg-emx/20">
            <ReplayIcon className="h-3 w-3" /> re-run webhook
          </button>
        </div>
      </div>

      {/* live stats strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="panel px-3 py-2">
          <p className="panel-head">overall risk</p>
          <p className="font-display pt-0.5 text-[20px] leading-tight font-bold" style={{ color: risk ? SEV_META[risk].color : "#4d648f" }}>
            {risk ? SEV_META[risk].label : "——"}
          </p>
        </div>
        <div className="panel px-3 py-2">
          <p className="panel-head">issues found</p>
          <p className="font-display pt-0.5 text-[20px] leading-tight font-bold text-ink-100">{issues}</p>
        </div>
        {(["high", "medium", "low"] as const).map((k) => (
          <div key={k} className="panel px-3 py-2">
            <p className="panel-head" style={{ color: SEV_META[k].color }}>{k} sev</p>
            <p className="font-display pt-0.5 text-[20px] leading-tight font-bold" style={{ color: counts[k] > 0 ? SEV_META[k].color : "#4d648f" }}>{counts[k]}</p>
          </div>
        ))}
        <div className="panel px-3 py-2">
          <p className="panel-head">status</p>
          <p className="flex items-center gap-2 pt-1 font-mono text-[11.5px] font-semibold" style={{ color: state.done ? "#10b981" : running ? "#38bdf8" : "#f5a524" }}>
            <Led color={state.done ? "#10b981" : running ? "#38bdf8" : "#f5a524"} on pulse={!state.done && running} />
            {state.done ? "REVIEW POSTED" : running ? "AUDITING" : "PAUSED"}
          </p>
        </div>
      </div>

      {/* crew bar */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {(["orchestrator", "style", "security", "tools", "refactor", "review"] as AgentId[]).map((id) => (
          <AgentChip key={id} id={id} status={state.agents[id].status} count={state.agents[id].findings} />
        ))}
      </div>

      {/* main grid */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="lg:col-span-3"><StageRail pr={pr} stages={state.stages} /></div>

        <div className="flex min-h-[540px] flex-col lg:col-span-6">
          <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center gap-1 border-b border-ink-700/60 bg-ink-900/60 px-2 pt-1.5">
              {(
                [
                  { id: "diff", label: "diff", icon: <DiffIcon className="h-3.5 w-3.5" /> },
                  { id: "findings", label: `findings · ${state.findings.filter((f) => f.status !== "merged").length}`, icon: <ZapIcon className="h-3.5 w-3.5" /> },
                  { id: "review", label: "final review", icon: <RobotIcon className="h-3.5 w-3.5" /> },
                ] as { id: Tab; label: string; icon: ReactNode }[]
              ).map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-1.5 font-display text-[11px] font-semibold tracking-wide transition-colors ${
                    tab === t.id ? "border-ink-600/70 bg-ink-850 text-orchid" : "border-transparent text-ink-400 hover:text-ink-200"
                  }`}>
                  {t.icon}{t.label}
                  {t.id === "review" && state.review && (
                    <span className="chip" style={{ color: SEV_META[state.review.overall].color, borderColor: SEV_META[state.review.overall].border, background: SEV_META[state.review.overall].bg }}>
                      {SEV_META[state.review.overall].label}
                    </span>
                  )}
                </button>
              ))}
              <span className="ml-auto hidden pb-1 pr-2 font-mono text-[9.5px] text-ink-500 sm:block">
                {pr.repo} · {pr.branch} → {pr.base}
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <div className={tab === "diff" ? "h-full" : "hidden"}>
                <DiffViewer files={pr.files} findings={state.findings} activeId={activeId} onFocus={focusFinding} />
              </div>
              <div className={tab === "findings" ? "h-full" : "hidden"}>
                <Findings findings={state.findings} activeId={activeId} onFocus={focusFinding} />
              </div>
              <div className={tab === "review" ? "h-full" : "hidden"}>
                <ReviewPanel review={state.review} validations={state.validations} shared={state.shared} postText={state.postText} />
              </div>
            </div>
          </div>
          {/* progress */}
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-800">
            <div className="h-full rounded-full transition-[width] duration-150 ease-linear"
              style={{ width: `${progress}%`, background: state.done ? "#10b981" : "linear-gradient(90deg,#38bdf8,#22d3ee)" }} />
          </div>
        </div>

        <div className="flex min-h-[540px] flex-col gap-3 lg:col-span-3">
          <SharedStatePanel shared={state.shared as unknown as Record<string, unknown>} pulses={state.pulses} />
          <EventLog logs={state.logs} />
        </div>
      </div>
    </div>
  );
}
