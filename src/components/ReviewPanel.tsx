import { useState, type ReactNode } from "react";
import type { FinalReview, SharedState, Severity } from "../types";
import { SEV_META } from "../types";
import { CheckIcon, CopyIcon, FlaskIcon, RobotIcon, SendIcon, XIcon } from "./icons";

interface Props {
  review: FinalReview | null;
  validations: { text: string; ok: boolean }[];
  shared: SharedState;
  postText: string | null;
}

/* tiny markdown-ish renderer for the GitHub comment preview */
function md(text: string): ReactNode[] {
  return text.split("\n").map((raw, i) => {
    const line = raw.trimEnd();
    const inline = (s: string, key: string): ReactNode[] =>
      s.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, j) => {
        if (part.startsWith("`")) return <code key={`${key}-${j}`} className="rounded bg-ink-700/60 px-1 py-px font-mono text-[11px] text-cyanx">{part.slice(1, -1)}</code>;
        if (part.startsWith("**")) return <strong key={`${key}-${j}`} className="text-ink-100">{part.slice(2, -2)}</strong>;
        return <span key={`${key}-${j}`}>{part}</span>;
      });
    if (line.startsWith("## "))
      return <h3 key={i} className="font-display pt-1 text-[15px] font-bold text-ink-100">{inline(line.slice(3), `h${i}`)}</h3>;
    if (line.startsWith("### "))
      return <h4 key={i} className="font-display pt-2.5 pb-1 text-[10.5px] font-semibold tracking-[0.16em] text-ink-400 uppercase">{inline(line.slice(4), `s${i}`)}</h4>;
    if (line.startsWith("- "))
      return (
        <div key={i} className="flex gap-2 py-0.5 pl-1 text-[12.5px] leading-relaxed text-ink-200">
          <span className="text-ink-500 select-none">•</span>
          <span>{inline(line.slice(2), `l${i}`)}</span>
        </div>
      );
    if (line.startsWith("_") && line.endsWith("_"))
      return <p key={i} className="pt-1 text-[11.5px] italic text-ink-400">{inline(line.slice(1, -1), `i${i}`)}</p>;
    if (line === "") return <div key={i} className="h-1.5" />;
    return <p key={i} className="text-[12.5px] leading-relaxed text-ink-200">{inline(line, `p${i}`)}</p>;
  });
}

const COUNT_KEYS: Severity[] = ["critical", "high", "medium", "low", "info"];

export default function ReviewPanel({ review, validations, shared, postText }: Props) {
  const [copied, setCopied] = useState(false);

  if (!review) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <FlaskIcon className="h-8 w-8 text-ink-600" />
        <div>
          <p className="font-mono text-[12px] text-ink-400">review not yet synthesized</p>
          <p className="pt-1 text-[11.5px] text-ink-600">
            the Review agent dedupes and ranks findings, then drafts the PR comment
          </p>
        </div>
        {validations.length > 0 && (
          <ul className="w-full max-w-sm space-y-1.5 pt-2 text-left">
            {validations.map((v, i) => (
              <li key={i} className="anim-slidein flex items-center gap-2 font-mono text-[11px] text-ink-300">
                {v.ok ? <CheckIcon className="h-3.5 w-3.5 text-emx" /> : <XIcon className="h-3.5 w-3.5 text-rosex" />}
                {v.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const sev = SEV_META[review.overall];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(review.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="scroll-thin h-full space-y-4 overflow-auto p-4">
      {/* headline block */}
      <div className="anim-rise panel relative overflow-hidden p-5">
        <div className="absolute inset-y-0 left-0 w-1" style={{ background: sev.color }} />
        <div className="flex flex-wrap items-center gap-5">
          <div>
            <p className="panel-head">overall risk</p>
            <p className="font-display text-[44px] leading-none font-bold tracking-wide" style={{ color: sev.color }}>
              {SEV_META[review.overall].label}
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[15.5px] font-semibold text-ink-100">{review.headline}</h3>
            <p className="pt-1.5 text-[12.5px] leading-relaxed text-ink-300">{review.summary}</p>
            <p className="pt-2 font-mono text-[10.5px] text-ink-400">
              files reviewed <b className="text-ink-200">{review.filesReviewed}</b> · issues <b className="text-ink-200">{review.issues}</b> · patches <b className="text-emx">{shared.patches_generated}</b> · validations <b className="text-emx">{validations.filter((v) => v.ok).length}/{validations.length}</b>
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-2">
          {COUNT_KEYS.map((k, i) => {
            const m = SEV_META[k];
            const n = review.counts[k];
            return (
              <div
                key={k}
                className="anim-rise rounded-md border px-2 py-2 text-center"
                style={{ animationDelay: `${i * 70}ms`, borderColor: n > 0 ? m.border : "rgba(39,57,92,0.5)", background: n > 0 ? m.bg : "rgba(13,22,38,0.5)" }}
              >
                <p className="font-display text-[22px] leading-none font-bold" style={{ color: n > 0 ? m.color : "#4d648f" }}>{n}</p>
                <p className="pt-1 font-mono text-[9px] tracking-[0.12em] text-ink-400 uppercase">{m.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* validation checklist */}
      {validations.length > 0 && (
        <div className="anim-rise panel p-4" style={{ animationDelay: "120ms" }}>
          <p className="panel-head flex items-center gap-2"><FlaskIcon className="h-3.5 w-3.5" /> final validation</p>
          <ul className="pt-2.5 space-y-1.5">
            {validations.map((v, i) => (
              <li key={i} className="anim-slidein flex items-start gap-2 font-mono text-[11.5px] text-ink-200" style={{ animationDelay: `${i * 90}ms` }}>
                {v.ok ? <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emx" /> : <XIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rosex" />}
                {v.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* github comment preview */}
      <div className="anim-rise panel overflow-hidden" style={{ animationDelay: "200ms" }}>
        <div className="flex items-center gap-2 border-b border-ink-700/60 bg-ink-900/70 px-4 py-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-ink-600 bg-ink-800 text-orchid">
            <RobotIcon className="h-3.5 w-3.5" />
          </span>
          <div className="leading-tight">
            <p className="text-[12px] font-semibold text-ink-100">
              sentinel-crew <span className="chip ml-1 text-orchid" style={{ borderColor: "rgba(56,189,248,0.4)", background: "rgba(56,189,248,0.08)" }}>bot</span>
            </p>
            <p className="font-mono text-[10px] text-ink-500">
              {shared.posted ? `review posted · ${postText?.includes("APPROVE") ? "APPROVE" : "REQUEST_CHANGES"}` : "preview — posts when pipeline reaches stage 8"}
            </p>
          </div>
          <button
            onClick={copy}
            className="ml-auto flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-800 px-2.5 py-1 font-mono text-[10.5px] text-ink-200 transition-colors hover:border-orchid/60 hover:text-orchid"
          >
            {copied ? <CheckIcon className="h-3 w-3 text-emx" /> : <CopyIcon className="h-3 w-3" />}
            {copied ? "copied" : "copy markdown"}
          </button>
        </div>
        <div className="bg-ink-900/40 px-4 py-3">{md(review.markdown)}</div>
        <div className={`flex items-center gap-2 border-t px-4 py-2.5 font-mono text-[11px] transition-colors ${shared.posted ? "border-emx/30 bg-emx/[0.06] text-emx" : "border-ink-700/60 bg-ink-900/60 text-ink-400"}`}>
          <SendIcon className="h-3.5 w-3.5" />
          {shared.posted
            ? "POST /pulls/reviews → 201 Created · inline comments attached"
            : "queued — awaiting review + validation stages"}
        </div>
      </div>
    </div>
  );
}
