import type { Finding, Severity } from "../types";
import { AGENT_META, SEV_META } from "../types";
import { MergeIcon, SparkIcon } from "./icons";

interface Props {
  findings: Finding[];
  activeId: string | null;
  onFocus: (f: Finding) => void;
}

const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

export function sortFindings(list: Finding[]): Finding[] {
  return [...list].sort(
    (a, b) =>
      SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) ||
      b.confidence - a.confidence
  );
}

export function FindingCard({ f, active, onFocus }: { f: Finding; active: boolean; onFocus: (f: Finding) => void }) {
  const sev = SEV_META[f.severity];
  const agent = AGENT_META[f.agent];
  return (
    <article
      onClick={() => onFocus(f)}
      className={`anim-rise cursor-pointer rounded-lg border bg-ink-850/80 transition-all duration-200 hover:translate-y-[-1px] hover:border-ink-600 ${
        active ? "border-orchid/60 shadow-[0_0_0_1px_rgba(56,189,248,0.25),0_8px_24px_-12px_rgba(56,189,248,0.3)]" : "border-ink-700/70"
      }`}
      style={{ borderLeftWidth: 3, borderLeftColor: sev.color }}
    >
      <header className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <span className="chip" style={{ color: sev.color, borderColor: sev.border, background: sev.bg }}>
          {sev.label}
        </span>
        <h4 className="font-display text-[13.5px] font-semibold tracking-wide text-ink-100">{f.title}</h4>
        <span className="ml-auto flex items-center gap-1.5">
          {f.patch && (
            <span className="chip inline-flex items-center gap-1 text-emx" style={{ borderColor: "rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.08)" }}>
              <SparkIcon className="h-3 w-3" /> patch
            </span>
          )}
          {f.corroboratedBy?.map((c) => (
            <span key={c} className="chip inline-flex items-center gap-1 text-cyanx" style={{ borderColor: "rgba(34,211,238,0.4)", background: "rgba(34,211,238,0.08)" }}>
              <MergeIcon className="h-3 w-3" /> {c}
            </span>
          ))}
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-1.5 font-mono text-[10.5px] text-ink-400">
        <span style={{ color: agent.color }}>▣ {agent.name}</span>
        <span className="text-ink-300">{f.file}:{f.line}</span>
        <span className="ml-auto flex items-center gap-1.5">
          confidence
          <span className="inline-block h-1 w-14 overflow-hidden rounded-full bg-ink-700">
            <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${Math.round(f.confidence * 100)}%`, background: sev.color }} />
          </span>
          <b className="text-ink-200">{Math.round(f.confidence * 100)}%</b>
        </span>
      </div>

      <p className="px-4 pt-2 text-[12.5px] leading-relaxed text-ink-200">{f.issue}</p>

      <p className="px-4 pt-1.5 pb-3 text-[12px] leading-relaxed text-ink-300">
        <span className="font-display text-[10px] font-semibold tracking-[0.14em] text-ink-400 uppercase">Fix → </span>
        {f.recommendation}
      </p>

      {f.note && (
        <p className="mx-4 mb-3 rounded-md border border-ink-700/70 bg-ink-900/60 px-3 py-1.5 text-[11px] italic text-ink-400">
          review agent: {f.note}
        </p>
      )}

      {f.patch && (
        <div className="mx-4 mb-4 overflow-hidden rounded-md border border-ink-700/70 font-mono text-[11.5px]">
          <div className="flex items-center gap-2 border-b border-ink-700/70 bg-ink-900/80 px-3 py-1 font-display text-[9.5px] font-semibold tracking-[0.18em] text-emx uppercase">
            <SparkIcon className="h-3 w-3" /> suggested refactor
          </div>
          <div className="bg-rosex/[0.05]">
            {f.patch.before.map((l, i) => (
              <div key={`b${i}`} className="flex px-2 text-ink-200/80">
                <span className="w-4 shrink-0 text-rosex select-none">−</span>
                <span className="whitespace-pre-wrap break-all">{l}</span>
              </div>
            ))}
          </div>
          <div className="bg-emx/[0.06]">
            {f.patch.after.map((l, i) => (
              <div key={`a${i}`} className="flex px-2 text-ink-100">
                <span className="w-4 shrink-0 text-emx select-none">+</span>
                <span className="whitespace-pre-wrap break-all">{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export default function Findings({ findings, activeId, onFocus }: Props) {
  const sorted = sortFindings(findings);
  if (sorted.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-500">
        <span className="led-pulse inline-block h-2 w-2 rounded-full bg-cyanx" style={{ color: "#22d3ee" }} />
        <p className="font-mono text-[12px]">awaiting agent reports…</p>
        <p className="text-[11.5px] text-ink-600">findings stream in here the moment an auditor files them</p>
      </div>
    );
  }
  return (
    <div className="scroll-thin h-full space-y-3 overflow-auto p-3">
      {sorted.map((f) => (
        <FindingCard key={f.id} f={f} active={f.id === activeId} onFocus={onFocus} />
      ))}
    </div>
  );
}
