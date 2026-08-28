import { useState } from "react";
import type { FinalReview, SharedSnapshot } from "../analysis/pipeline";
import type { Severity } from "../analysis/scanner";
import { SEV_META } from "../types";
import { CheckIcon, CopyIcon, RobotIcon, SendIcon, XIcon } from "./icons";

interface Props {
  review: FinalReview | null;
  validations: { text: string; ok: boolean }[];
  shared: SharedSnapshot;
  post: { text: string; url: string | null } | null;
}

const SEV_KEYS: Severity[] = ["critical", "high", "medium", "low", "info"];

export default function ReviewPanel({ review, validations, shared, post }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!review) return;
    try {
      await navigator.clipboard.writeText(review.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard unavailable */ }
  };

  const download = () => {
    if (!review) return;
    const blob = new Blob([review.markdown], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sentinel-review-${shared.source.replace(/[^\w.-]+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!review) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-ink-400">
        <RobotIcon className="h-8 w-8 text-ink-600" />
        <p className="font-mono text-[11px]">the Review agent composes the final verdict at stage 6</p>
      </div>
    );
  }

  const riskColor = review.overall === "high" ? "#f43f5e" : review.overall === "medium" ? "#facc15" : "#10b981";

  return (
    <div className="scroll-thin h-full space-y-3 overflow-auto p-3">
      {/* verdict */}
      <section className="anim-rise rounded-lg border bg-ink-900/70 p-3.5" style={{ borderColor: `${riskColor}44` }}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display rounded-md border px-2.5 py-1 text-[15px] font-bold tracking-wider"
            style={{ color: riskColor, borderColor: `${riskColor}66`, background: `${riskColor}14` }}>
            RISK: {review.overall.toUpperCase()}
          </span>
          <p className="text-[12.5px] font-medium text-ink-200">{review.headline}</p>
          <span className="ml-auto font-mono text-[10px] text-ink-400">
            {review.filesReviewed} files · {review.issues} issues · {shared.patches} patches
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-2.5">
          {SEV_KEYS.map((k) => (
            <span key={k} className="chip border-ink-600 font-mono text-[10px]" style={{ color: SEV_META[k].color }}>
              {SEV_META[k].label} <b>{review.counts[k]}</b>
            </span>
          ))}
          {shared.tokensIn > 0 && (
            <span className="chip ml-auto border-orchid/40 font-mono text-[10px] text-orchid">
              {shared.llmModel} · {shared.tokensIn + shared.tokensOut} tok · ${shared.costUsd.toFixed(4)}
            </span>
          )}
        </div>
        <p className="pt-2.5 text-[12px] leading-relaxed text-ink-300">{review.summary}</p>
      </section>

      {/* validation gate */}
      <section className="anim-rise rounded-lg border border-ink-700/70 bg-ink-900/70 p-3.5" style={{ animationDelay: "60ms" }}>
        <p className="panel-head pb-2">final validation gate</p>
        <ul className="space-y-1">
          {validations.map((v, i) => (
            <li key={i} className="anim-slidein flex items-start gap-2 font-mono text-[10.5px]" style={{ animationDelay: `${i * 60}ms` }}>
              <span className={`mt-px ${v.ok ? "text-emx" : "text-rosex"}`}>
                {v.ok ? <CheckIcon className="h-3.5 w-3.5" /> : <XIcon className="h-3.5 w-3.5" />}
              </span>
              <span className={v.ok ? "text-ink-300" : "text-rosex"}>{v.text}</span>
            </li>
          ))}
          {validations.length === 0 && <li className="font-mono text-[10.5px] text-ink-500">checks run at stage 7…</li>}
        </ul>
      </section>

      {/* github comment preview */}
      <section className="anim-rise overflow-hidden rounded-lg border border-ink-700/70 bg-ink-900/70" style={{ animationDelay: "120ms" }}>
        <header className="flex items-center gap-2 border-b border-ink-700/60 bg-ink-900 px-3.5 py-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-700">
            <RobotIcon className="h-3.5 w-3.5 text-orchid" />
          </span>
          <div>
            <p className="text-[12px] font-semibold text-ink-100">sentinel-crew-bot <span className="chip ml-1 border-ink-600 text-[8.5px] text-ink-400">review</span></p>
            <p className="font-mono text-[9.5px] text-ink-500">
              {post?.url ? (
                <a href={post.url} target="_blank" rel="noreferrer" className="text-emx hover:underline">posted — view on GitHub ↗</a>
              ) : post ? post.text : "preview — posted at stage 8"}
            </p>
          </div>
          <div className="ml-auto flex gap-1.5">
            <button onClick={copy}
              className="chip border-ink-600 text-[10px] text-ink-200 transition-colors hover:border-orchid/50 hover:text-orchid">
              {copied ? <CheckIcon className="h-3 w-3 text-emx" /> : <CopyIcon className="h-3 w-3" />}
              {copied ? "copied" : "copy markdown"}
            </button>
            <button onClick={download}
              className="chip border-ink-600 text-[10px] text-ink-200 transition-colors hover:border-orchid/50 hover:text-orchid">
              <SendIcon className="h-3 w-3" /> download .md
            </button>
          </div>
        </header>
        <pre className="scroll-thin max-h-[420px] overflow-auto whitespace-pre-wrap bg-[#070d18] px-4 py-3 font-mono text-[11px] leading-relaxed text-ink-200">
          {review.markdown}
        </pre>
      </section>

      <p className="px-1 font-mono text-[9.5px] text-ink-500">
        inline comments: {review.inline.length} attached to changed lines · {shared.detectorMode}
        {shared.sourceUrl && <> · <a className="text-cyanx hover:underline" href={shared.sourceUrl} target="_blank" rel="noreferrer">source ↗</a></>}
      </p>
    </div>
  );
}
