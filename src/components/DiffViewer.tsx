import { useEffect, useMemo, useRef, useState } from "react";
import type { Finding, PRFile, Severity } from "../types";
import { SEV_META } from "../types";

interface Props {
  files: PRFile[];
  findings: Finding[];
  activeId: string | null;
  onFocus: (f: Finding) => void;
}

const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

export default function DiffViewer({ files, findings, activeId, onFocus }: Props) {
  const [fileIdx, setFileIdx] = useState(0);
  const file = files[Math.min(fileIdx, files.length - 1)];
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const focusedRef = useRef<string | null>(null);

  const active = findings.find((f) => f.id === activeId) ?? null;

  // jump to active finding's file + line
  useEffect(() => {
    if (!active) return;
    const idx = files.findIndex((f) => f.path === active.file);
    if (idx >= 0 && idx !== fileIdx) setFileIdx(idx);
  }, [active, files, fileIdx]);

  useEffect(() => {
    if (!active || focusedRef.current === active.id) return;
    focusedRef.current = active.id;
    const key = `${active.file}:${active.line}`;
    const el = rowRefs.current[key];
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);

  useEffect(() => {
    if (!activeId) focusedRef.current = null;
  }, [activeId]);

  const lineFindings = useMemo(() => {
    const map = new Map<number, Finding[]>();
    for (const f of findings) {
      if (f.status === "merged" || f.file !== file.path) continue;
      const arr = map.get(f.line) ?? [];
      arr.push(f);
      map.set(f.line, arr);
    }
    for (const arr of map.values())
      arr.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
    return map;
  }, [findings, file.path]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* file tabs */}
      <div className="flex items-center gap-1 border-b border-ink-700/60 px-2 pt-2">
        {files.map((f, i) => (
          <button
            key={f.path}
            onClick={() => setFileIdx(i)}
            className={`group flex items-center gap-2 rounded-t-md border border-b-0 px-3 py-1.5 font-mono text-[11.5px] transition-colors ${
              i === fileIdx
                ? "border-ink-600/70 bg-ink-800 text-ink-100"
                : "border-transparent text-ink-300 hover:bg-ink-800/50 hover:text-ink-200"
            }`}
          >
            <span>{f.path}</span>
            <span className="text-[10px] text-emx">+{f.additions}</span>
            {f.deletions > 0 && <span className="text-[10px] text-rosex">−{f.deletions}</span>}
          </button>
        ))}
        <div className="ml-auto hidden pb-1 pr-2 text-[10px] font-mono text-ink-400 sm:block">
          unified diff · {file.lang}
        </div>
      </div>

      {/* diff body */}
      <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-ink-900/60 py-2 font-mono text-[12px] leading-[1.55]">
        {file.lines.map((ln, i) => {
          const fs = ln.n ? lineFindings.get(ln.n) : undefined;
          const top = fs?.[0];
          const isActive = top && active && fs?.some((f) => f.id === active.id);
          const key = `${file.path}:${ln.n ?? "x"}`;
          const base =
            ln.t === "add"
              ? "bg-emx/[0.07] text-ink-100"
              : ln.t === "del"
                ? "bg-rosex/[0.08] text-ink-200/80"
                : "text-ink-300/90";
          return (
            <div
              key={i}
              ref={(el) => { rowRefs.current[key] = el; }}
              onClick={() => top && onFocus(top)}
              className={`group flex items-stretch px-0 transition-colors ${base} ${top ? "cursor-pointer" : ""} ${
                isActive ? "outline outline-1 -outline-offset-1 outline-orchid/70 bg-orchid/[0.08]" : top ? "hover:bg-ink-700/30" : ""
              }`}
            >
              {/* marker rail */}
              <div className="flex w-5 shrink-0 items-center justify-center border-r border-ink-700/40">
                {top && ln.n ? (
                  <span
                    className="led-pulse inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: SEV_META[top.severity].color, color: SEV_META[top.severity].color }}
                  />
                ) : (
                  <span className="w-3 text-center text-ink-600 select-none">
                    {ln.t === "add" ? "+" : ln.t === "del" ? "−" : ""}
                  </span>
                )}
              </div>
              {/* line number */}
              <div className="w-10 shrink-0 border-r border-ink-700/40 pr-2 text-right text-[10.5px] text-ink-500 select-none"
                style={{ color: "#4d648f" }}>
                {ln.n ?? ""}
              </div>
              {/* code */}
              <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre px-3">{ln.c || " "}</pre>
              {/* sev chip on hover / active */}
              {top && ln.n && (
                <div className="flex shrink-0 items-center pr-3 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ opacity: isActive ? 1 : undefined }}>
                  <span className="chip" style={{ color: SEV_META[top.severity].color, borderColor: SEV_META[top.severity].border, background: SEV_META[top.severity].bg }}>
                    {SEV_META[top.severity].label}{fs && fs.length > 1 ? ` +${fs.length - 1}` : ""}
                  </span>
                </div>
              )}
            </div>
          );
        })}
        <div className="px-4 pt-3 pb-1 text-[10.5px] text-ink-500">
          ● marked lines carry live agent findings — click to inspect
        </div>
      </div>
    </div>
  );
}
