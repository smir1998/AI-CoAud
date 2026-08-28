import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuditEngine, type LogLine } from "../engine/useAuditEngine";
import type { AuditInput } from "../analysis/pipeline";
import { parsePRRef, PROVIDER_MODELS, type Provider } from "../analysis/external";
import { CONFIG } from "../config";
import { SEV_ORDER, type Severity } from "../analysis/scanner";
import { AGENT_META, SEV_META, type AgentId } from "../types";
import { FIXTURES } from "../data/fixtures";
import DiffViewer from "./DiffViewer";
import Findings from "./Findings";
import ReviewPanel from "./ReviewPanel";
import {
  AlertIcon, BranchIcon, CodeIcon, DiffIcon, FlaskIcon, GearIcon, LayersIcon,
  PauseIcon, PlayIcon, RobotIcon, TerminalIcon, WebhookIcon, ZapIcon,
} from "./icons";

/* ── small primitives ─────────────────────────────────────── */

function Led({ color, on, pulse }: { color: string; on: boolean; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {on && pulse && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: color }} />}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: on ? color : "#27395c" }} />
    </span>
  );
}

const AGENT_ORDER: AgentId[] = ["orchestrator", "style", "security", "tools", "refactor", "review"];

const STAGES = [
  "webhook", "fetch diff", "audit plan", "parallel audit", "refactor", "review", "validate", "post review",
];

type Tab = "diff" | "findings" | "review";
type Mode = "github" | "diff" | "sample";

export default function Console() {
  const { state, settings, updateSettings, run, rerun, cancel } = useAuditEngine();
  const { shared, status } = state;

  const [tab, setTab] = useState<Tab>("findings");
  const [mode, setMode] = useState<Mode>("sample");
  const [prInput, setPrInput] = useState("");
  const [diffInput, setDiffInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const startRef = useRef(Date.now());

  const running = status === "running";

  useEffect(() => {
    if (status === "running") startRef.current = Date.now();
  }, [status]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => forceTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [running]);

  const elapsedSec = ((running ? Date.now() - startRef.current : shared.elapsedMs) / 1000).toFixed(1);

  const startAudit = () => {
    setActiveId(null);
    let input: AuditInput | null = null;
    if (mode === "github") {
      const ref = parsePRRef(prInput);
      if (!ref) return;
      input = { kind: "github", ...ref, ref: `${ref.owner}/${ref.repo}#${ref.pr}` };
    } else if (mode === "diff") {
      if (!diffInput.trim()) return;
      input = { kind: "diff", text: diffInput };
    }
    if (input) run(input, settings);
  };

  const githubValid = mode !== "github" || parsePRRef(prInput) !== null;
  const diffValid = mode !== "diff" || diffInput.trim().length > 10;
  const canRun = !running && githubValid && diffValid;

  const TABS: { id: Tab; label: string; icon: ReactNode; badge?: number }[] = [
    { id: "diff", label: "diff", icon: <DiffIcon className="h-3.5 w-3.5" />, badge: shared.files },
    { id: "findings", label: "findings", icon: <AlertIcon className="h-3.5 w-3.5" />, badge: state.findings.length },
    { id: "review", label: "review", icon: <RobotIcon className="h-3.5 w-3.5" />, badge: state.review ? 1 : 0 },
  ];

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-3.5 px-3 pb-8 lg:px-5">
      {/* ── command bar ── */}
      <section className="anim-rise panel px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="panel-head mr-1"><WebhookIcon className="h-3.5 w-3.5 text-cyanx" /> audit source</p>
          <div className="flex overflow-hidden rounded-md border border-ink-600">
            {(["github", "diff", "sample"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 font-mono text-[10.5px] tracking-wide transition-colors ${
                  mode === m ? "bg-orchid/15 text-orchid" : "text-ink-400 hover:text-ink-200"
                }`}>
                {m === "github" ? "github pr" : m === "diff" ? "paste diff" : "samples"}
              </button>
            ))}
          </div>

          {mode === "github" && (
            <input
              value={prInput}
              onChange={(e) => setPrInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canRun && startAudit()}
              placeholder="owner/repo#123  or  https://github.com/owner/repo/pull/123"
              className="min-w-[260px] flex-1 rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 font-mono text-[11.5px] text-ink-100 placeholder:text-ink-500 focus:border-orchid/60 focus:outline-none"
            />
          )}
          {mode === "sample" && (
            <div className="flex flex-1 flex-wrap gap-1.5">
              {FIXTURES.map((fx) => (
                <button key={fx.id}
                  onClick={() => { setActiveId(null); run({ kind: "fixture", fixture: fx }, settings); }}
                  className={`chip border-ink-600 text-[10px] transition-colors hover:border-orchid/50 hover:text-orchid ${
                    shared.title === fx.title && !running ? "border-orchid/60 text-orchid" : "text-ink-300"
                  }`}>
                  {fx.repo} #{fx.prNumber}
                </button>
              ))}
            </div>
          )}

          <button onClick={() => setShowSettings((s) => !s)}
            className={`chip border-ink-600 text-[10px] transition-colors hover:border-orchid/50 ${showSettings ? "text-orchid" : "text-ink-300"}`}>
            <GearIcon className="h-3.5 w-3.5" /> keys & tokens
            {settings.provider !== "none" && <Led color="#10b981" on />}
          </button>

          {running ? (
            <button onClick={cancel}
              className="flex items-center gap-1.5 rounded-md border border-rosex/50 bg-rosex/10 px-3.5 py-1.5 font-mono text-[11px] font-semibold text-rosex transition-colors hover:bg-rosex/20">
              <PauseIcon className="h-3.5 w-3.5" /> cancel
            </button>
          ) : (
            <button onClick={mode === "sample" ? rerun : startAudit} disabled={!canRun}
              className="flex items-center gap-1.5 rounded-md border border-orchid/60 bg-orchid/15 px-3.5 py-1.5 font-mono text-[11px] font-semibold text-orchid transition-all hover:bg-orchid/25 disabled:cursor-not-allowed disabled:opacity-40">
              <PlayIcon className="h-3.5 w-3.5" /> {mode === "sample" ? "re-run audit" : "run audit"}
            </button>
          )}

          {/* live status */}
          <span className="ml-auto flex items-center gap-2 font-mono text-[10.5px]">
            {status === "running" && (
              <><Led color="#38bdf8" on pulse /><span className="text-cyanx">auditing · {elapsedSec}s · {STAGES[Math.max(state.stage, 0)]}</span></>
            )}
            {status === "done" && (
              <><Led color="#10b981" on /><span className="text-emx">done in {(shared.elapsedMs / 1000).toFixed(1)}s · {shared.findings} findings · risk {shared.risk ?? "—"}</span></>
            )}
            {status === "error" && (
              <><Led color="#f43f5e" on /><span className="text-rosex">pipeline halted</span></>
            )}
          </span>
        </div>

        {mode === "diff" && (
          <textarea
            value={diffInput}
            onChange={(e) => setDiffInput(e.target.value)}
            rows={5}
            placeholder={"paste a unified diff (git format-patch / git diff output)…\n\ndiff --git a/app.py b/app.py\n@@ -1,3 +1,5 @@\n+import pickle"}
            className="scroll-thin mt-2.5 w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-100 placeholder:text-ink-500 focus:border-orchid/60 focus:outline-none"
          />
        )}

        {mode === "github" && !githubValid && prInput.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-amberx">
            <AlertIcon className="h-3 w-3" /> expected “owner/repo#123” or a full pull-request URL
          </p>
        )}

        {/* settings drawer */}
        {showSettings && (
          <div className="anim-rise mt-3 grid gap-3 border-t border-ink-700/60 pt-3 md:grid-cols-3">
            <div>
              <p className="pb-1.5 font-mono text-[9.5px] tracking-wider text-ink-500">LLM SECURITY AGENT</p>
              <div className="flex overflow-hidden rounded-md border border-ink-600">
                {(["none", "anthropic", "openai"] as Provider[]).map((p) => (
                  <button key={p} onClick={() => updateSettings({
                    provider: p,
                    model: p === "anthropic" ? CONFIG.llm.anthropicModel : p === "openai" ? CONFIG.llm.openaiModel : settings.model,
                  })}
                    className={`flex-1 px-2 py-1.5 font-mono text-[10px] transition-colors ${
                      settings.provider === p ? "bg-orchid/15 text-orchid" : "text-ink-400 hover:text-ink-200"
                    }`}>
                    {p === "none" ? "off (rules only)" : p}
                  </button>
                ))}
              </div>
            </div>
            {settings.provider !== "none" && (
              <>
                <div>
                  <p className="pb-1.5 font-mono text-[9.5px] tracking-wider text-ink-500">{settings.provider.toUpperCase()} API KEY</p>
                  <input type="password" value={settings.apiKey} onChange={(e) => updateSettings({ apiKey: e.target.value })}
                    placeholder={settings.provider === "anthropic" ? "sk-ant-…" : "sk-…"}
                    className="w-full rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 font-mono text-[11px] text-ink-100 placeholder:text-ink-500 focus:border-orchid/60 focus:outline-none" />
                  <select value={settings.model} onChange={(e) => updateSettings({ model: e.target.value })}
                    className="mt-1.5 w-full rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 font-mono text-[10.5px] text-ink-200 focus:outline-none">
                    {PROVIDER_MODELS[settings.provider].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </>
            )}
            <div>
              <p className="pb-1.5 font-mono text-[9.5px] tracking-wider text-ink-500">GITHUB TOKEN (POSTS REVIEWS)</p>
              <input type="password" value={settings.ghToken} onChange={(e) => updateSettings({ ghToken: e.target.value })}
                placeholder="github_pat_… (repo scope)"
                className="w-full rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 font-mono text-[11px] text-ink-100 placeholder:text-ink-500 focus:border-orchid/60 focus:outline-none" />
            </div>
            <p className="font-mono text-[9.5px] leading-relaxed text-ink-500 md:col-span-3">
              keys are stored in <b className="text-ink-300">this browser only</b> (localStorage) and sent directly to the provider / GitHub — never to any other server.
              without an LLM key the audit runs the full deterministic engine; without a GitHub token the review is generated but not auto-posted.
            </p>
          </div>
        )}
      </section>

      {status === "error" && (
        <section className="anim-rise flex items-center gap-3 rounded-lg border border-rosex/40 bg-rosex/[0.07] px-4 py-3">
          <AlertIcon className="h-4 w-4 shrink-0 text-rosex" />
          <p className="text-[12.5px] text-ink-200"><b className="text-rosex">fetch failed:</b> {state.error}</p>
          <button onClick={rerun} className="chip ml-auto border-rosex/40 text-[10px] text-rosex hover:bg-rosex/10">retry</button>
        </section>
      )}

      {/* ── pipeline rail + crew ── */}
      <section className="anim-rise panel px-4 py-3" style={{ animationDelay: "60ms" }}>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
          {STAGES.map((label, i) => {
            const done = status === "done" || state.stage > i;
            const active = status === "running" && state.stage === i;
            const pulseKey = state.pulses[`stage-${i}`];
            return (
              <div key={label} className="flex items-center gap-1">
                <span key={`${i}:${pulseKey ?? 0}`}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9.5px] tracking-wide transition-colors ${
                    done ? "border-emx/40 text-emx" : active ? "border-orchid/60 bg-orchid/10 text-orchid" : "border-ink-700 text-ink-500"
                  } ${active && pulseKey ? "anim-flash" : ""}`}>
                  <Led color={done ? "#10b981" : active ? "#38bdf8" : "#27395c"} on={done || active} pulse={active} />
                  {i + 1}·{label}
                </span>
                {i < STAGES.length - 1 && <span className={`h-px w-3 ${done ? "bg-emx/40" : "bg-ink-700"}`} />}
              </div>
            );
          })}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-ink-700/50 pt-2.5">
          {AGENT_ORDER.map((id) => {
            const m = AGENT_META[id];
            const a = state.agents[id];
            const active = a.status === "running";
            return (
              <span key={id} className={`chip border-ink-600 text-[9.5px] transition-all ${active ? "anim-pulse-soft" : ""}`}
                style={active || a.status === "done" ? { borderColor: `${m.color}55`, color: m.color } : undefined}>
                <Led color={m.color} on={a.status !== "pending"} pulse={active} />
                {m.short}
                {a.status === "done" && a.count > 0 && <b>·{a.count}</b>}
                {active && <span className="text-ink-500">…</span>}
              </span>
            );
          })}
          <span className="chip ml-auto border-ink-600 text-[9.5px] text-ink-400">
            <LayersIcon className="h-3 w-3 text-cyanx" /> detector: {shared.detectorMode}{shared.llmModel ? ` · ${shared.llmModel}` : ""}
          </span>
        </div>
      </section>

      {/* ── main grid ── */}
      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1fr)_330px]">
        {/* tabs */}
        <section className="anim-rise panel flex min-h-[560px] flex-col overflow-hidden" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center border-b border-ink-700/60 bg-ink-900/60">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1.5 px-4 py-2.5 font-mono text-[10.5px] tracking-wide transition-colors ${
                  tab === t.id ? "text-orchid" : "text-ink-400 hover:text-ink-200"
                }`}>
                {t.icon} {t.label}
                {!!t.badge && <span className="rounded bg-ink-700 px-1 text-[9px] text-ink-200">{t.badge}</span>}
                {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-orchid" />}
              </button>
            ))}
            <span className="ml-auto pr-3 font-mono text-[9.5px] text-ink-500">
              {shared.source} · {shared.sha}
            </span>
          </div>
          <div className="min-h-0 flex-1">
            {tab === "diff" && (
              <DiffViewer files={state.files} findings={state.findings} activeId={activeId} onPick={(id) => { setActiveId(id); }} />
            )}
            {tab === "findings" && (
              <Findings findings={state.findings} activeId={activeId} onPick={(id) => { setActiveId(id); setTab("findings"); }} />
            )}
            {tab === "review" && (
              <ReviewPanel review={state.review} validations={state.validations} shared={shared} post={state.post} />
            )}
          </div>
        </section>

        {/* right rail */}
        <div className="flex min-h-[560px] flex-col gap-3.5">
          <SharedStatePanel state={state} />
          <LogPanel logs={state.logs} />
        </div>
      </div>
    </div>
  );
}

/* ── shared state panel ───────────────────────────────────── */

function SharedStatePanel({ state }: { state: ReturnType<typeof useAuditEngine>["state"] }) {
  const s = state.shared;
  const rows: { key: string; label: string; value: ReactNode }[] = [
    { key: "sh_source", label: "source", value: s.sourceUrl ? <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="text-cyanx hover:underline">{s.source}</a> : s.source },
    { key: "sh_sha", label: "head sha", value: <span className="text-ink-300">{s.sha}</span> },
    { key: "sh_title", label: "title", value: <span className="max-w-[170px] truncate text-ink-300">{s.title}</span> },
    { key: "sh_author", label: "author", value: s.author },
    { key: "sh_refs", label: "refs", value: `${s.base} ← ${s.head}` },
    { key: "sh_files", label: "files", value: `${s.files}  (+${s.additions}/−${s.deletions})` },
    { key: "sh_findings", label: "findings", value: s.findings },
    { key: "sh_patches", label: "patches", value: s.patches },
    { key: "sh_tokens", label: "llm tokens", value: s.tokensIn ? `${s.tokensIn}+${s.tokensOut} · $${s.costUsd.toFixed(4)}` : "—" },
    { key: "sh_risk", label: "overall risk", value: s.risk ? <b style={{ color: s.risk === "high" ? "#f43f5e" : s.risk === "medium" ? "#facc15" : "#10b981" }}>{s.risk.toUpperCase()}</b> : "—" },
    { key: "sh_posted", label: "posted", value: s.posted ? <a href={s.posted} target="_blank" rel="noreferrer" className="text-emx hover:underline">review ↗</a> : "—" },
  ];
  return (
    <section className="anim-rise panel" style={{ animationDelay: "180ms" }}>
      <p className="panel-head border-b border-ink-700/60 bg-ink-900/60 px-3.5 py-2.5">
        <LayersIcon className="h-3.5 w-3.5 text-orchid" /> shared workflow state
      </p>
      <div className="space-y-px p-2 font-mono text-[10.5px]">
        {rows.map((r) => {
          const pulse = state.pulses[r.key];
          return (
            <div key={`${r.key}:${pulse ?? 0}`}
              className={`flex items-center justify-between gap-2 rounded px-2 py-[3.5px] ${pulse ? "anim-flash" : ""}`}>
              <span className="text-ink-500">{r.label}</span>
              <span className="text-right text-ink-200">{r.value}</span>
            </div>
          );
        })}
        {/* severity breakdown */}
        <div className="mt-1.5 border-t border-ink-700/60 pt-2">
          {SEV_ORDER.map((sev: Severity) => {
            const pulse = state.pulses[`sev_${sev}`];
            const c = state.shared.counts[sev];
            return (
              <div key={`${sev}:${pulse ?? 0}`} className={`flex items-center justify-between rounded px-2 py-[3px] ${pulse ? "anim-flash" : ""}`}>
                <span className="flex items-center gap-1.5" style={{ color: SEV_META[sev].color }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEV_META[sev].color }} />
                  {SEV_META[sev].label.toLowerCase()}
                </span>
                <b style={{ color: c > 0 ? SEV_META[sev].color : undefined }} className={c === 0 ? "text-ink-600" : ""}>{c}</b>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── live agent log ───────────────────────────────────────── */

function LogPanel({ logs }: { logs: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [logs.length]);
  return (
    <section className="anim-rise panel flex min-h-0 flex-1 flex-col" style={{ animationDelay: "240ms" }}>
      <p className="panel-head flex items-center gap-2 border-b border-ink-700/60 bg-ink-900/60 px-3.5 py-2.5">
        <TerminalIcon className="h-3.5 w-3.5 text-emx" /> agent event stream
        <span className="ml-auto font-mono text-[9px] normal-case text-ink-500">{logs.length} events</span>
      </p>
      <div ref={ref} className="scroll-thin min-h-[180px] flex-1 overflow-auto bg-[#070d18] p-2.5 font-mono text-[10px] leading-[1.7]">
        {logs.length === 0 && <p className="text-ink-600">— stream idle —</p>}
        {logs.map((l) => (
          <p key={l.id} className="anim-slidein flex gap-2">
            <span className="shrink-0 text-ink-600">{l.t}</span>
            <span className="w-[74px] shrink-0 font-semibold" style={{ color: AGENT_META[l.agent].color }}>{AGENT_META[l.agent].short}</span>
            <span className="text-ink-300">{l.text}</span>
          </p>
        ))}
      </div>
    </section>
  );
}
