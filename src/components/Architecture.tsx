import type { ReactNode } from "react";
import type { AgentId } from "../types";
import { AGENT_META } from "../types";
import {
  BookIcon, BranchIcon, CheckIcon, CpuIcon, FlaskIcon, LayersIcon,
  MergeIcon, RobotIcon, ShieldIcon, SparkIcon, WebhookIcon, ZapIcon,
} from "./icons";

/* ── pipeline diagram ─────────────────────────────────────── */

function Node({ x, y, w, title, sub, color }: { x: number; y: number; w: number; title: string; sub: string; color: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={46} rx={8} fill="#0d1626" stroke={color} strokeWidth={1.4} />
      <text x={x + w / 2} y={y + 19} textAnchor="middle" fill="#e6edf7" fontSize={13} fontWeight={600} fontFamily="'Chakra Petch', sans-serif">
        {title}
      </text>
      <text x={x + w / 2} y={y + 35} textAnchor="middle" fill="#8ca0c0" fontSize={9.5} fontFamily="'IBM Plex Mono', monospace">
        {sub}
      </text>
    </g>
  );
}

function Edge({ d, color = "rgba(56,189,248,0.4)" }: { d: string; color?: string }) {
  return <path d={d} fill="none" stroke={color} strokeWidth={1.5} className="flow-dash" markerEnd="url(#arr)" />;
}

function Diagram() {
  return (
    <svg viewBox="0 0 1000 640" className="w-full" role="img" aria-label="Agentic audit pipeline diagram">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="rgba(56,189,248,0.55)" />
        </marker>
      </defs>

      <Node x={420} y={12} w={160} title="GitHub PR" sub="opened / synchronize" color="#4d648f" />
      <Edge d="M500 58 V 92" />
      <Node x={405} y={96} w={190} title="Webhook + HMAC" sub="FastAPI · signature check" color="#22d3ee" />
      <Edge d="M500 142 V 176" />
      <Node x={395} y={180} w={210} title="Fetch PR + diff" sub="REST v3 · files · patches" color="#22d3ee" />
      <Edge d="M500 226 V 260" />
      <Node x={380} y={264} w={240} title="Orchestrator Agent" sub="shared state · dispatch · aggregate" color="#38bdf8" />

      <Edge d="M500 310 V 326 H 200 V 344" color="rgba(245,165,36,0.45)" />
      <Edge d="M500 310 V 344" color="rgba(244,63,94,0.45)" />
      <Edge d="M500 310 V 326 H 800 V 344" color="rgba(34,211,238,0.45)" />

      <Node x={110} y={348} w={180} title="Style Agent" sub="claude-sonnet-4 · smells" color="#f5a524" />
      <Node x={410} y={348} w={180} title="Security Agent" sub="gpt-4o · taint / secrets" color="#f43f5e" />
      <Node x={710} y={348} w={180} title="Static Tools" sub="semgrep · bandit · ruff" color="#22d3ee" />

      <Edge d="M200 394 V 412 H 500 V 430" color="rgba(245,165,36,0.45)" />
      <Edge d="M500 394 V 430" color="rgba(244,63,94,0.45)" />
      <Edge d="M800 394 V 412 H 500 V 430" color="rgba(34,211,238,0.45)" />

      <Node x={390} y={434} w={220} title="Refactor Agent" sub="patches · preserves behavior" color="#10b981" />
      <Edge d="M500 480 V 500" />
      <Node x={390} y={504} w={220} title="Review Agent" sub="dedupe · rank · severity" color="#e6edf7" />
      <Edge d="M500 550 V 566 H 330 V 580" />
      <Edge d="M500 550 V 566 H 670 V 580" />
      <Node x={240} y={584} w={180} title="Validation" sub="ast.parse · lint · tests" color="#f5a524" />
      <Node x={580} y={584} w={180} title="Post Review" sub="PR comment + inline" color="#10b981" />

      <text x={500} y={338} textAnchor="middle" fill="#4d648f" fontSize={9} fontFamily="'IBM Plex Mono', monospace">parallel fan-out</text>
    </svg>
  );
}

/* ── agent roster ─────────────────────────────────────────── */

const ROSTER: Record<AgentId, { goal: string; tools: string[]; output: string }> = {
  orchestrator: {
    goal: "Receives the PR event, fetches metadata + diff, maintains the shared workflow state, assigns work to the specialists and aggregates their results.",
    tools: ["github-client", "diff-parser", "state-store"],
    output: "audit plan · shared state · final aggregation",
  },
  style: {
    goal: "Detects code smells, duplication, cyclomatic complexity, naming issues and style violations on the changed hunks; suggests cleaner implementations.",
    tools: ["ast", "complexity-scorer"],
    output: "findings[] with file, line, severity, confidence",
  },
  security: {
    goal: "Hunts injection sinks, insecure auth, hardcoded secrets, unsafe dependencies and missing input validation; correlates LLM hunches against SAST hits to kill false positives.",
    tools: ["taint-map", "osv-advisories"],
    output: "findings[] + tool corroboration links",
  },
  tools: {
    goal: "Runs deterministic checkers as a hallucination guardrail — only tool-confirmed or high-confidence LLM findings survive into the final review.",
    tools: ["semgrep", "bandit", "ruff", "pip-audit"],
    output: "normalized ToolFinding[] (rule, line, CWE)",
  },
  refactor: {
    goal: "Takes confirmed HIGH/MEDIUM findings and generates behavior-preserving patches, explaining why each change is safer or cleaner.",
    tools: ["patch-writer", "ast-diff"],
    output: "suggested patches + rationale per finding",
  },
  review: {
    goal: "Merges duplicates, drops low-confidence noise, assigns Critical→Info severity and writes the concise structured PR review that gets posted.",
    tools: ["dedupe-index", "severity-rubric"],
    output: "markdown review + inline comments + risk verdict",
  },
};

const AGENT_ORDER: AgentId[] = ["orchestrator", "style", "security", "tools", "refactor", "review"];

/* ── shared state schema ──────────────────────────────────── */

const SCHEMA: [string, string][] = [
  ["repository", "str  # acme/api-service"],
  ["pr_number", "int"],
  ["commit_sha", "str  # head sha audited"],
  ["base_ref / head_ref", "str"],
  ["changed_files", "list[ChangedFile]"],
  ["  .patch / .hunks", "str / list[Hunk]"],
  ["agent_findings", "dict[AgentId, list[Finding]]"],
  ["  .severity", "critical|high|medium|low|info"],
  ["  .confidence", "float 0..1"],
  ["  .suggested_fix", "Patch | None"],
  ["tool_findings", "list[ToolFinding]  # SAST"],
  ["corroboration", "dict[finding_id, rule_ids]"],
  ["validations", "list[CheckResult]"],
  ["final_review", "Review  # markdown + verdict"],
];

/* ── advanced features ────────────────────────────────────── */

const FEATURES: { icon: ReactNode; text: string }[] = [
  { icon: <ZapIcon className="h-3.5 w-3.5" />, text: "Parallel agent execution — style, security and SAST fan out concurrently" },
  { icon: <LayersIcon className="h-3.5 w-3.5" />, text: "Shared state / memory — one Redis-backed AuditState every agent reads and writes" },
  { icon: <SparkIcon className="h-3.5 w-3.5" />, text: "Automatic patch generation with behavior-preservation contract" },
  { icon: <CheckIcon className="h-3.5 w-3.5" />, text: "Human approval gate before any fix is applied to a branch" },
  { icon: <FlaskIcon className="h-3.5 w-3.5" />, text: "Test execution after refactoring — ast.parse, lint and pytest in a sandbox" },
  { icon: <ShieldIcon className="h-3.5 w-3.5" />, text: "Dependency vulnerability scanning via pip-audit + OSV advisories" },
  { icon: <MergeIcon className="h-3.5 w-3.5" />, text: "False-positive detection — LLM findings must survive tool corroboration" },
  { icon: <BranchIcon className="h-3.5 w-3.5" />, text: "Incremental analysis — only changed hunks are audited on synchronize" },
  { icon: <RobotIcon className="h-3.5 w-3.5" />, text: "Automatic structured PR review with per-line inline comments" },
  { icon: <CpuIcon className="h-3.5 w-3.5" />, text: "Security severity scoring — CVSS-aligned rubric, confidence-weighted" },
];

export default function Architecture() {
  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-4 px-3 pb-6 lg:px-5">
      <header className="anim-rise panel flex flex-wrap items-end justify-between gap-3 px-5 py-4">
        <div>
          <p className="panel-head flex items-center gap-2"><BookIcon className="h-3.5 w-3.5 text-orchid" /> system architecture</p>
          <h2 className="font-display pt-1 text-[24px] font-bold tracking-wide text-ink-100">
            Six agents, one verdict
          </h2>
          <p className="max-w-2xl pt-1 text-[13px] leading-relaxed text-ink-300">
            A GitHub webhook wakes the FastAPI server; the Orchestrator pulls the diff into shared state and fans work out
            to two LLM auditors and a deterministic toolchain in parallel. Confirmed issues flow through the Refactor and
            Review agents, get validated, and are posted back to the PR as a structured review.
          </p>
        </div>
        <div className="flex gap-2 font-mono text-[10.5px] text-ink-400">
          <span className="chip border-ink-600 text-ink-300">crewai 0.80</span>
          <span className="chip border-ink-600 text-ink-300">fastapi 0.115</span>
          <span className="chip border-ink-600 text-ink-300">python 3.12</span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <section className="anim-rise panel p-4 xl:col-span-3" style={{ animationDelay: "80ms" }}>
          <p className="panel-head pb-2">event → review pipeline</p>
          <Diagram />
        </section>

        <section className="anim-rise panel overflow-hidden xl:col-span-2" style={{ animationDelay: "140ms" }}>
          <p className="panel-head border-b border-ink-700/60 bg-ink-900/60 px-4 py-2.5">shared state schema</p>
          <div className="scroll-thin max-h-[520px] overflow-auto p-3 font-mono text-[11px] leading-[1.8]">
            <p className="text-ink-500"># state.py — written by orchestrator, read/written by every agent</p>
            <p className="text-cyanx">class <span className="text-ink-100">AuditState</span>(BaseModel):</p>
            {SCHEMA.map(([k, v], i) => (
              <p key={i} className="flex gap-3 pl-4">
                <span className={k.startsWith("  ") ? "text-ink-400" : "text-orchid"}>{k.trim()}</span>
                <span className="ml-auto text-right text-ink-500">{v}</span>
              </p>
            ))}
            <p className="pt-2 text-ink-500"># persisted to Redis so agents share memory across workers</p>
            <p className="text-ink-300">store = RedisStateStore(url=settings.REDIS_URL)</p>
          </div>
        </section>
      </div>

      {/* roster */}
      <section className="anim-rise grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" style={{ animationDelay: "200ms" }}>
        {AGENT_ORDER.map((id, i) => {
          const m = AGENT_META[id];
          const r = ROSTER[id];
          return (
            <article key={id} className="anim-rise group panel relative overflow-hidden p-4 transition-transform duration-200 hover:-translate-y-0.5"
              style={{ animationDelay: `${220 + i * 70}ms` }}>
              <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: m.color, opacity: 0.85 }} />
              <header className="flex items-center gap-2.5">
                <span className="font-display flex h-8 w-11 items-center justify-center rounded-md border text-[11px] font-bold tracking-widest"
                  style={{ color: m.color, borderColor: `${m.color}55`, background: `${m.color}14` }}>
                  {m.short}
                </span>
                <div>
                  <h3 className="font-display text-[14px] font-semibold text-ink-100">{m.name}</h3>
                  <p className="font-mono text-[10px] text-ink-500">llm: {m.model}</p>
                </div>
              </header>
              <p className="pt-2.5 text-[12px] leading-relaxed text-ink-300">{r.goal}</p>
              <div className="flex flex-wrap gap-1.5 pt-2.5">
                {r.tools.map((t) => (
                  <span key={t} className="chip border-ink-600 text-ink-300 transition-colors group-hover:border-ink-500">{t}</span>
                ))}
              </div>
              <p className="pt-2.5 font-mono text-[10px] text-ink-500">→ {r.output}</p>
            </article>
          );
        })}
      </section>

      {/* advanced features */}
      <section className="anim-rise panel px-5 py-4" style={{ animationDelay: "280ms" }}>
        <p className="panel-head pb-3">advanced capabilities</p>
        <ul className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          {FEATURES.map((f, i) => (
            <li key={i} className="anim-slidein flex items-start gap-2.5 text-[12.5px] text-ink-200" style={{ animationDelay: `${i * 50}ms` }}>
              <span className="mt-0.5 text-emx">{f.icon}</span>
              {f.text}
            </li>
          ))}
        </ul>
      </section>

      <div className="anim-rise flex items-center gap-2 px-1 font-mono text-[10.5px] text-ink-500" style={{ animationDelay: "340ms" }}>
        <WebhookIcon className="h-3.5 w-3.5 text-cyanx" />
        full reference implementation — FastAPI server, CrewAI crew, SAST runners, validation and Docker — in the Implementation tab
      </div>
    </div>
  );
}
