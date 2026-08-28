import { useEffect, useRef, useState } from "react";
import type { Finding, ParsedFile, Severity } from "../analysis/scanner";
import { SEV_META } from "../types";
import { DiffIcon } from "./icons";

interface Props {
  files: ParsedFile[];
  findings: Finding[];
  activeId: string | null;
  onPick: (id: string) => void;
}

function topSeverity(findings: Finding[]): Severity | null {
  if (findings.length === 0) return null;
  let best = findings[0].severity;
  for (const f of findings) if (SEV_META[f.severity].rank < SEV_META[best].rank) best = f.severity;
  return best;
}

export default function DiffViewer({ files, findings, activeId, onPick }: Props) {
  const [active, setActive] = useState(0);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const focusedRef = useRef<string | null>(null);
  const file = files[Math.min(active, Math.max(files.length - 1, 0))];

  useEffect(() => { setActive(0); focusedRef.current = null; }, [files]);

  const activeFinding = findings.find((f) => f.id === activeId) ?? null;

  useEffect(() => {
    if (!activeFinding || focusedRef.current === activeFinding.id) return;
    const idx = files.findIndex((f) => f.path === activeFinding.file);
    if (idx >= 0) setActive(idx);
    focusedRef.current = activeFinding.id;
    requestAnimationFrame(() => {
      const el = rowRefs.current[`${activeFinding.file}:${activeFinding.line}`];
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [activeFinding, files]);

  if (files.length === 0) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-ink-400">
        <DiffIcon className="h-8 w-8 text-ink-600" />
        <p className="font-mono text-[11px]">diff hunks will render here once the orchestrator fetches them</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* file tabs */}
      <div className="scroll-thin flex items-center gap-1 overflow-x-auto border-b border-ink-700/60 bg-ink-900/70 px-2 py-1.5">
        {files.map((f, i) => {
          const hits = findings.filter((x) => x.file === f.path).length;
          const worst = topSeverity(findings.filter((x) => x.file === f.path));
          return (
            <button key={f.path} onClick={() => setActive(i)}
              className={`group flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10.5px] transition-colors ${
                i === active ? "border-orchid/50 bg-orchid/10 text-ink-100" : "border-transparent text-ink-300 hover:border-ink-600 hover:text-ink-100"
              }`}>
              {worst && <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEV_META[worst].color }} />}
              {f.path}
              <span className="text-emx">+{f.additions}</span>
              <span className="text-rosex">−{f.deletions}</span>
              {hits > 0 && <span className="rounded bg-ink-700/70 px-1 text-[9px] text-ink-200">{hits}</span>}
            </button>
          );
        })}
      </div>

      {/* rows */}
      <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-[#070d18]">
        {file && file.rows.map((row, i) => {
          if (row.type === "hunk") {
            return (
              <div key={i} className="border-y border-ink-800/80 bg-ink-900/60 px-3 py-0.5 font-mono text-[10.5px] text-cyanx/80">
                {row.text}
              </div>
            );
          }
          const marked = row.type === "add" ? findings.filter((f) => f.file === file.path && f.line === row.newNo) : [];
          const sev = topSeverity(marked);
          const isActive = !!activeFinding && activeFinding.file === file.path && activeFinding.line === row.newNo;
          const refKey = `${file.path}:${row.newNo}`;
          return (
            <div
              key={i}
              ref={(el) => { if (marked.length) rowRefs.current[refKey] = el; }}
              onClick={() => marked.length && onPick(marked[0].id)}
              className={`group flex font-mono text-[11.5px] leading-[1.55] ${marked.length ? "cursor-pointer" : ""} ${
                isActive ? "ring-1 ring-inset ring-orchid/60" : ""
              } ${row.type === "add" ? "bg-emx/[0.05]" : row.type === "del" ? "bg-rosex/[0.06]" : ""}`}
            >
              <span className="w-11 shrink-0 select-none border-r border-ink-800/70 px-1.5 text-right text-[10px] text-ink-500">
                {row.oldNo ?? ""}
              </span>
              <span className="w-11 shrink-0 select-none border-r border-ink-800/70 px-1.5 text-right text-[10px] text-ink-500">
                {row.newNo ?? ""}
              </span>
              <span className={`w-5 shrink-0 select-none text-center ${
                row.type === "add" ? "text-emx" : row.type === "del" ? "text-rosex" : "text-ink-600"
              }`}>
                {row.type === "add" ? "+" : row.type === "del" ? "−" : " "}
              </span>
              <span className="relative flex-1 whitespace-pre-wrap break-all pr-8 text-ink-200">
                {row.text || " "}
                {sev && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onPick(marked[0].id); }}
                    title={`${marked.length} finding(s) — click to inspect`}
                    className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full border px-1.5 py-px text-[8.5px] font-semibold tracking-wide transition-transform hover:scale-110"
                    style={{ color: SEV_META[sev].color, borderColor: `${SEV_META[sev].color}66`, background: `${SEV_META[sev].color}1a` }}>
                    {SEV_META[sev].label}
                    {marked.length > 1 && `·${marked.length}`}
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
