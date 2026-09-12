import { useState, type ReactNode } from "react";
import type { Finding } from "../analysis/scanner";
import { AGENT_META, SEV_META } from "../types";
import { ChevronIcon, CpuIcon, FileCodeIcon, ShieldIcon, SparkIcon } from "./icons";

interface Props {
  findings: Finding[];
  activeId: string | null;
  onPick: (id: string) => void;
}

const DETECTOR_LABEL: Record<Finding["detector"], { text: string; icon: ReactNode }> = {
  rule: { text: "deterministic rule", icon: <ShieldIcon className="h-3 w-3" /> },
  llm: { text: "llm audit", icon: <CpuIcon className="h-3 w-3" /> },
  hybrid: { text: "rule + specialist corroborated", icon: <SparkIcon className="h-3 w-3" /> },
};

export default function Findings({ findings, activeId, onPick }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (findings.length === 0) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center">
        <ShieldIcon className="h-8 w-8 text-emx/60" />
        <p className="font-mono text-[11px] text-ink-400">
          no findings yet — the audit streams results here as each agent reports
        </p>
      </div>
    );
  }

  return (
    <div className="scroll-thin h-full space-y-2 overflow-auto p-2.5">
      {findings.map((f, i) => {
        const sev = SEV_META[f.severity];
        const isActive = f.id === activeId;
        const expanded = open[f.id] ?? f.patch !== undefined;
        const det = DETECTOR_LABEL[f.detector];
        return (
          <article
            key={f.id}
            onClick={() => onPick(f.id)}
            className={`anim-slidein cursor-pointer rounded-lg border bg-ink-900/70 transition-all duration-150 ${
              isActive ? "border-orchid/60 shadow-[0_0_0_1px_rgba(56,189,248,0.25),0_4px_18px_-6px_rgba(56,189,248,0.25)]" : "border-ink-700/70 hover:border-ink-500"
            }`}
            style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
          >
            <header className="flex items-center gap-2 px-3 pt-2.5">
              <span className="rounded border px-1.5 py-px font-mono text-[9.5px] font-bold tracking-wider"
                style={{ color: sev.color, borderColor: `${sev.color}55`, background: `${sev.color}14` }}>
                {sev.label}
              </span>
              <span
                title={`${AGENT_META[f.agent].name} — raised by this agent`}
                className="rounded border px-1.5 py-px font-mono text-[9px] font-bold tracking-widest"
                style={{ color: AGENT_META[f.agent].color, borderColor: `${AGENT_META[f.agent].color}44`, background: `${AGENT_META[f.agent].color}0f` }}>
                {AGENT_META[f.agent].short}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onPick(f.id); }}
                className="flex items-center gap-1 font-mono text-[10.5px] text-cyanx transition-colors hover:text-ink-100">
                <FileCodeIcon className="h-3 w-3" />
                {f.file}:{f.line}
              </button>
              <span className="ml-auto font-mono text-[9.5px] text-ink-500">
                conf <b style={{ color: f.confidence >= 0.85 ? "#10b981" : f.confidence >= 0.7 ? "#facc15" : "#f5a524" }}>
                  {Math.round(f.confidence * 100)}%
                </b>
              </span>
            </header>

            <h4 className="px-3 pt-1.5 text-[13px] font-semibold text-ink-100">{f.title}</h4>

            <div className="flex flex-wrap items-center gap-1.5 px-3 pt-1.5">
              <span className="chip border-ink-600 text-[9px] text-ink-300">
                <span className="text-orchid">{det.icon}</span> {det.text}
              </span>
              {f.rule && <span className="chip border-ink-600 font-mono text-[9px] text-ink-300">{f.rule}</span>}
              {f.cwe && <span className="chip border-rosex/40 font-mono text-[9px] text-rosex/90">{f.cwe}</span>}
              {f.patch && (
                <button
                  onClick={(e) => { e.stopPropagation(); setOpen((o) => ({ ...o, [f.id]: !expanded })); }}
                  className="chip ml-auto border-emx/40 text-[9px] text-emx transition-colors hover:bg-emx/10">
                  <ChevronIcon className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
                  suggested fix
                </button>
              )}
            </div>

            <p className="px-3 pt-1.5 text-[11.5px] leading-relaxed text-ink-300">{f.issue}</p>

            {f.excerpt && (
              <pre className="mx-3 mt-2 overflow-x-auto rounded border border-ink-700/60 bg-[#070d18] px-2.5 py-1.5 font-mono text-[10.5px] leading-relaxed text-ink-200">
                <span className="select-none text-ink-500">L{f.line} </span>{f.excerpt}
              </pre>
            )}

            <p className="px-3 pb-2.5 pt-1.5 text-[11.5px] leading-relaxed text-ink-300">
              <b className="text-emx">Fix: </b>{f.recommendation}
            </p>

            {f.patch && expanded && (
              <div className="border-t border-ink-700/60 px-3 py-2">
                <p className="pb-1.5 font-mono text-[9.5px] tracking-wider text-ink-500">
                  SUGGESTED REFACTOR · {f.patch.source === "llm" ? "model-generated" : "deterministic template"}
                </p>
                <pre className="scroll-thin overflow-x-auto rounded border border-rosex/25 bg-rosex/[0.06] px-2.5 py-1.5 font-mono text-[10.5px] leading-relaxed text-rosex/90">
                  {f.patch.before}
                </pre>
                <pre className="scroll-thin mt-1 overflow-x-auto rounded border border-emx/25 bg-emx/[0.06] px-2.5 py-1.5 font-mono text-[10.5px] leading-relaxed text-emx">
                  {f.patch.after}
                </pre>
                <p className="pt-1.5 text-[10.5px] italic text-ink-400">{f.patch.note}</p>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
