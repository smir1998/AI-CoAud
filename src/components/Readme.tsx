import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import originalReadme from "../../README.md?raw";
import Markdown from "./Markdown";
import { SECURITY_RULES_INDEX, STYLE_CHECKS_INDEX } from "../analysis/scanner";
import { CONFIG } from "../config";
import {
  BranchIcon, CheckIcon, CopyIcon, DownloadIcon, GearIcon, MarkdownIcon, ReplayIcon, SendIcon, SparkIcon, XIcon, ZapIcon,
} from "./icons";

const DRAFT_KEY = CONFIG.storage.readmeDraft;
const SETTINGS_KEY = CONFIG.storage.settings;

function loadDraft(): string {
  try {
    const v = localStorage.getItem(DRAFT_KEY);
    // an empty stored draft would render as a mysteriously blank preview — treat it as "no draft"
    if (v !== null && v.trim() !== "") return v;
  } catch { /* storage unavailable */ }
  return originalReadme;
}

function loadGhToken(): string {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as { ghToken?: string };
      return s.ghToken ?? "";
    }
  } catch { /* ignore */ }
  return "";
}

function lineDelta(edited: string, base: string): { add: number; del: number } {
  const count = (s: string) => {
    const m = new Map<string, number>();
    for (const l of s.split("\n")) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  };
  const a = count(edited);
  const b = count(base);
  let add = 0;
  let del = 0;
  for (const [l, n] of a) add += Math.max(0, n - (b.get(l) ?? 0));
  for (const [l, n] of b) del += Math.max(0, n - (a.get(l) ?? 0));
  return { add, del };
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

/* ── insertable snippets ──────────────────────────────────── */

function rulesTableSnippet(): string {
  // escape characters that would corrupt a markdown table cell
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/`/g, "ʼ");
  const rows = SECURITY_RULES_INDEX.map(
    (r) => `| \`${r.id}\` | ${r.severity} | ${r.cwe} | ${esc(r.title)} | \`${esc(r.pattern)}\` |`,
  ).join("\n");
  return `\n\n## Deterministic security rules\n\n_Generated live from the running scanner — ${SECURITY_RULES_INDEX.length} detectors._\n\n| ID | Severity | CWE | Detector | Pattern |\n|---|---|---|---|---|\n${rows}\n`;
}

function styleSnippet(): string {
  const rows = STYLE_CHECKS_INDEX.map((s) => `| \`${s.id}\` | ${s.severity} | ${s.title} |`).join("\n");
  return `\n\n## Style heuristics\n\n_${STYLE_CHECKS_INDEX.length} checks run on every changed hunk._\n\n| ID | Severity | Check |\n|---|---|---|\n${rows}\n`;
}

const SAMPLE_REVIEW = `\n\n## Sample review\n\n\`\`\`markdown\n## 🤖 AI CoAudS Review — overall risk: **HIGH**\n\n### Security — HIGH · auth.py:21\nSQL injection: user input reaches cursor.execute via f-string.  confidence 96%\n> fix: parameterize → cursor.execute("SELECT … WHERE name = %s", (username,))\n\n### Patches validated: 4/4 · files: 3 · findings: 10\n\`\`\`\n`;

/* ── push-to-github modal ─────────────────────────────────── */

interface PushStep { label: string; status: "idle" | "run" | "ok" | "err"; detail?: string }

function PushModal({ text, onClose }: { text: string; onClose: () => void }) {
  const [repo, setRepo] = useState("acme/ai-coauds");
  const [path, setPath] = useState("README.md");
  const [branch, setBranch] = useState("main");
  const [message, setMessage] = useState("docs: refresh README via AI CoAudS studio");
  const [token, setToken] = useState(loadGhToken);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<PushStep[]>([
    { label: "Resolve existing file", status: "idle" },
    { label: "Commit via contents API", status: "idle" },
  ]);
  const [result, setResult] = useState<{ commitUrl: string; commitSha: string; fileUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setStep = (idx: number, patch: Partial<PushStep>) =>
    setSteps((s) => s.map((st, i) => (i === idx ? { ...st, ...patch } : st)));

  const validRepo = /^[\w.-]+\/[\w.-]+$/.test(repo.trim());

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setSteps((s) => s.map((st) => ({ ...st, status: "idle" as const, detail: undefined })));
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      ...(token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {}),
    };
    const base = `https://api.github.com/repos/${repo.trim()}`;

    // step 1 — resolve sha
    setStep(0, { status: "run" });
    let sha: string | null = null;
    try {
      const res = await fetch(`${base}/contents/${encodeURIComponent(path.trim())}?ref=${encodeURIComponent(branch.trim())}`, { headers });
      if (res.status === 200) {
        const data = (await res.json()) as { sha: string };
        sha = data.sha;
        setStep(0, { status: "ok", detail: `updating · sha ${sha.slice(0, 10)}` });
      } else if (res.status === 404) {
        setStep(0, { status: "ok", detail: "file missing — will create" });
      } else {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `GitHub responded ${res.status}`);
      }
    } catch (e) {
      setStep(0, { status: "err" });
      setError(e instanceof Error ? e.message : "network error");
      setBusy(false);
      return;
    }

    // step 2 — commit
    setStep(1, { status: "run" });
    try {
      const res = await fetch(`${base}/contents/${encodeURIComponent(path.trim())}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: message.trim() || "docs: update README",
          content: b64(text),
          branch: branch.trim() || "main",
          ...(sha ? { sha } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        message?: string;
        commit?: { sha: string; html_url: string };
        content?: { html_url: string };
      } | null;
      if (!res.ok || !body?.commit) throw new Error(body?.message ?? `GitHub responded ${res.status}`);
      setStep(1, { status: "ok", detail: `commit ${body.commit.sha.slice(0, 10)}` });
      setResult({
        commitUrl: body.commit.html_url,
        commitSha: body.commit.sha,
        fileUrl: body.content?.html_url ?? `${base.replace("api.github.com/repos", "github.com")}/blob/${branch.trim()}/${path.trim()}`,
      });
    } catch (e) {
      setStep(1, { status: "err" });
      setError(e instanceof Error ? e.message : "network error");
    }
    setBusy(false);
  };

  const field = "w-full rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 font-mono text-[11.5px] text-ink-100 outline-none transition-colors focus:border-orchid/60";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="anim-rise w-full max-w-lg rounded-xl border border-ink-600 bg-ink-850 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-ink-700/70 px-5 py-3.5">
          <p className="panel-head flex items-center gap-2">
            <SendIcon className="h-3.5 w-3.5 text-emx" /> commit README to GitHub
          </p>
          <button onClick={onClose} className="rounded p-1 text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100" aria-label="close">
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="pb-1 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-400">repository</span>
              <input className={field} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" />
            </label>
            <label className="block">
              <span className="pb-1 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-400">file path</span>
              <input className={field} value={path} onChange={(e) => setPath(e.target.value)} placeholder="README.md" />
            </label>
            <label className="block">
              <span className="pb-1 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-400">branch</span>
              <input className={field} value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
            </label>
            <label className="block">
              <span className="pb-1 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-400">github token</span>
              <input className={field} type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_… (contents scope)" />
            </label>
          </div>
          <label className="block">
            <span className="pb-1 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-400">commit message</span>
            <input className={field} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>

          <div className="rounded-lg border border-ink-700/70 bg-ink-900/60 px-3.5 py-2.5">
            {steps.map((st, i) => (
              <p key={i} className="flex items-center gap-2.5 py-1 font-mono text-[11px]">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    st.status === "ok" ? "bg-emx" : st.status === "err" ? "bg-rosex" : st.status === "run" ? "led-pulse bg-cyanx" : "bg-ink-600"
                  }`}
                />
                <span className={st.status === "err" ? "text-rosex" : st.status === "ok" ? "text-emx" : "text-ink-300"}>{st.label}</span>
                {st.detail && <span className="ml-auto text-[10px] text-ink-500">{st.detail}</span>}
              </p>
            ))}
            {error && (
              <p className="mt-1 border-t border-ink-700/60 pt-2 font-mono text-[10.5px] text-rosex">✗ {error}</p>
            )}
            {result && (
              <p className="mt-1 space-x-2 border-t border-ink-700/60 pt-2 font-mono text-[10.5px] text-emx">
                <span>✓ committed {result.commitSha.slice(0, 10)}</span>
                <a href={result.commitUrl} target="_blank" rel="noreferrer" className="md-link">commit</a>
                <a href={result.fileUrl} target="_blank" rel="noreferrer" className="md-link">file</a>
              </p>
            )}
          </div>

          <p className="font-mono text-[9.5px] leading-relaxed text-ink-500">
            PUT /repos/{"{owner}"}/{"{repo}"}/contents/{"{path}"} — resolves the current sha first so updates never clobber; creates the file when missing. Token never leaves your browser except to api.github.com.
          </p>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-ink-700/70 px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-ink-600 px-3 py-1.5 font-display text-[11px] font-semibold text-ink-300 transition-colors hover:bg-ink-800">
            cancel
          </button>
          <button
            onClick={run}
            disabled={busy || !validRepo}
            className="flex items-center gap-1.5 rounded-md border border-emx/50 bg-emx/[0.12] px-3.5 py-1.5 font-display text-[11px] font-semibold text-emx transition-all hover:bg-emx/[0.2] hover:shadow-[0_0_18px_-6px_rgba(16,185,129,0.7)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendIcon className="h-3.5 w-3.5" /> {busy ? "committing…" : "commit"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ── preview fault isolation ──────────────────────────────── */

class PreviewBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel border-rosex/50 p-4">
        <p className="panel-head text-rosex">preview crashed</p>
        <p className="pt-2 font-mono text-[11px] leading-relaxed text-rosex/90">
          {this.state.error.name}: {this.state.error.message}
        </p>
        <p className="pt-1.5 text-[12px] text-ink-300">
          The renderer threw while building this preview. Your markdown is safe in the editor — details are in the browser console.
        </p>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-3 rounded-md border border-orchid/50 bg-orchid/[0.1] px-3 py-1 font-display text-[11px] font-semibold text-orchid transition-colors hover:bg-orchid/[0.18]"
        >
          retry render
        </button>
      </div>
    );
  }
}

/* ── studio ───────────────────────────────────────────────── */

type Mode = "edit" | "split" | "preview";

export default function Readme() {
  const [text, setText] = useState(loadDraft);
  const [saved, setSaved] = useState(true);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<Mode>("split");
  const [pushOpen, setPushOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimer = useRef<number | null>(null);

  // debounced autosave
  useEffect(() => {
    setSaved(false);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, text); } catch { /* ignore */ }
      setSaved(true);
    }, 500);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [text]);

  const modified = text !== originalReadme;
  const stats = useMemo(() => {
    const lines = text.split("\n").length;
    const words = text.split(/\s+/).filter(Boolean).length;
    const delta = lineDelta(text, originalReadme);
    return { lines, words, mins: Math.max(1, Math.round(words / 220)), delta };
  }, [text]);

  const insertAtCursor = (snippet: string) => {
    const ta = taRef.current;
    if (!ta) { setText((t) => `${t}\n${snippet}`); return; }
    const s = ta.selectionStart ?? text.length;
    const e = ta.selectionEnd ?? s;
    const next = text.slice(0, s) + snippet + text.slice(e);
    setText(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = s + snippet.length;
      ta.setSelectionRange(pos, pos);
    });
    setMode((m) => (m === "preview" ? "split" : m));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked */ }
  };

  const download = () => {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "README.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const revert = () => {
    setText(originalReadme);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const s = ta.selectionStart;
      const next = text.slice(0, s) + "  " + text.slice(ta.selectionEnd);
      setText(next);
      requestAnimationFrame(() => ta.setSelectionRange(s + 2, s + 2));
    }
  };

  const showEditor = mode !== "preview";
  const showPreview = mode !== "edit";

  // renderer diagnostics — blocks as state (drives re-render), ms in a ref (never loops)
  const [blocks, setBlocks] = useState(0);
  const msRef = useRef(0);
  const onStats = useCallback((b: number, ms: number) => {
    msRef.current = ms;
    setBlocks((prev) => (prev === b ? prev : b));
  }, []);

  const toolBtn =
    "flex items-center gap-1.5 rounded-md border border-ink-600 px-2.5 py-1.5 font-display text-[10.5px] font-semibold tracking-wide text-ink-300 transition-all hover:border-ink-500 hover:bg-ink-800 hover:text-ink-100";

  return (
    <div className="mx-auto w-full max-w-[1560px] space-y-4 px-3 pb-6 lg:px-5">
      {/* header */}
      <header className="anim-rise panel flex flex-wrap items-end justify-between gap-3 px-5 py-4">
        <div>
          <p className="panel-head flex items-center gap-2">
            <MarkdownIcon className="h-3.5 w-3.5 text-orchid" /> readme studio
          </p>
          <h2 className="font-display pt-1 text-[24px] font-bold tracking-wide text-ink-100">
            Edit it live — then commit it for real
          </h2>
          <p className="max-w-2xl pt-1 text-[13px] leading-relaxed text-ink-300">
            The project README, loaded from <span className="font-mono text-[12px] text-cyanx">README.md?raw</span>. Type on the left, watch the preview,
            insert live-generated rule tables straight from the scanner, and push the result to GitHub through the contents API.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px]">
          <span className="chip border-ink-600 text-ink-300">{stats.lines} lines</span>
          <span className="chip border-ink-600 text-ink-300">{stats.words} words · ~{stats.mins} min</span>
          {modified ? (
            <span className="chip border-amberx/50 bg-amberx/[0.08] text-amberx">
              modified <b className="text-emx">+{stats.delta.add}</b> <b className="text-rosex">−{stats.delta.del}</b>
            </span>
          ) : (
            <span className="chip border-emx/40 bg-emx/[0.06] text-emx">in sync with repo copy</span>
          )}
          <span className={`chip ${saved ? "border-ink-600 text-ink-500" : "border-cyanx/50 text-cyanx"}`}>
            {saved ? "autosaved" : "saving…"}
          </span>
        </div>
      </header>

      {/* toolbar */}
      <div className="anim-rise flex flex-wrap items-center gap-2 px-1" style={{ animationDelay: "60ms" }}>
        <div className="flex overflow-hidden rounded-md border border-ink-600">
          {(["edit", "split", "preview"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 font-display text-[10.5px] font-semibold tracking-wide transition-colors ${
                mode === m ? "bg-orchid/[0.14] text-orchid" : "text-ink-400 hover:bg-ink-800 hover:text-ink-200"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <span className="mx-1 hidden h-4 w-px bg-ink-700 sm:block" />

        <button className={toolBtn} onClick={() => insertAtCursor(rulesTableSnippet())} title="insert a table of every live security detector">
          <ZapIcon className="h-3.5 w-3.5 text-amberx" /> rules table · {SECURITY_RULES_INDEX.length}
        </button>
        <button className={toolBtn} onClick={() => insertAtCursor(styleSnippet())} title="insert the style-check table">
          <SparkIcon className="h-3.5 w-3.5 text-cyanx" /> style checks · {STYLE_CHECKS_INDEX.length}
        </button>
        <button className={toolBtn} onClick={() => insertAtCursor(SAMPLE_REVIEW)}>
          <MarkdownIcon className="h-3.5 w-3.5 text-orchid" /> sample review
        </button>

        <span className="mx-1 hidden h-4 w-px bg-ink-700 sm:block" />

        <button className={toolBtn} onClick={copy}>
          {copied ? <CheckIcon className="h-3.5 w-3.5 text-emx" /> : <CopyIcon className="h-3.5 w-3.5" />} {copied ? "copied" : "copy"}
        </button>
        <button className={toolBtn} onClick={download}>
          <DownloadIcon className="h-3.5 w-3.5" /> download
        </button>
        {modified && (
          <button className={toolBtn} onClick={revert} title="restore the shipped README">
            <ReplayIcon className="h-3.5 w-3.5 text-rosex" /> revert
          </button>
        )}

        <button
          onClick={() => setPushOpen(true)}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-emx/50 bg-emx/[0.1] px-3.5 py-1.5 font-display text-[11px] font-semibold tracking-wide text-emx transition-all hover:bg-emx/[0.18] hover:shadow-[0_0_20px_-6px_rgba(16,185,129,0.7)]"
        >
          <BranchIcon className="h-3.5 w-3.5" /> push to GitHub
        </button>
      </div>

      {/* split workspace */}
      <div className={`grid gap-4 ${showEditor && showPreview ? "lg:grid-cols-2" : ""}`}>
        {showEditor && (
          <section className="anim-rise panel flex min-h-[420px] flex-col overflow-hidden lg:h-[calc(100vh-320px)] lg:min-h-[480px]" style={{ animationDelay: "110ms" }}>
            <header className="flex items-center gap-2.5 border-b border-ink-700/60 bg-ink-900/60 px-4 py-2.5">
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-400">
                <GearIcon className="h-3.5 w-3.5 text-ink-500" /> README.md
              </span>
              <span className="font-mono text-[9.5px] text-ink-600">tab = indent · autosaves locally</span>
              <span className="ml-auto flex items-center gap-1.5 font-mono text-[9.5px] text-cyanx">
                <span className="led-pulse inline-block h-1.5 w-1.5 rounded-full bg-cyanx" style={{ color: "#22d3ee" }} /> markdown
              </span>
            </header>
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              spellCheck={false}
              className="scroll-thin w-full flex-1 resize-none bg-transparent px-4 py-3 font-mono text-[12.5px] leading-[1.75] text-ink-200 caret-orchid outline-none placeholder:text-ink-600"
              placeholder="# Start writing markdown…"
            />
          </section>
        )}

        {showPreview && (
          <section className="anim-rise panel flex min-h-[420px] flex-col overflow-hidden lg:h-[calc(100vh-320px)] lg:min-h-[480px]" style={{ animationDelay: "160ms" }}>
            <header className="flex items-center gap-2.5 border-b border-ink-700/60 bg-ink-900/60 px-4 py-2.5">
              <span className="font-mono text-[10px] text-ink-400">preview</span>
              <span className="font-mono text-[9.5px] text-ink-500">
                {blocks} blocks · {msRef.current.toFixed(1)}ms
              </span>
              <span className="ml-auto flex items-center gap-1.5 font-mono text-[9.5px] text-emx">
                <span className="led-pulse inline-block h-1.5 w-1.5 rounded-full bg-emx" style={{ color: "#10b981" }} /> live
              </span>
            </header>
            <div className="scroll-thin flex-1 overflow-auto px-6 py-5">
              {text.trim() === "" ? (
                <div className="panel mx-auto mt-8 max-w-md border-ink-600 p-6 text-center">
                  <p className="font-display text-[15px] font-semibold text-ink-200">Nothing to preview</p>
                  <p className="pt-1.5 text-[12.5px] leading-relaxed text-ink-400">
                    The markdown source is empty — either it was cleared in the editor, or a stale blank draft was loaded from local storage.
                  </p>
                  <button
                    onClick={revert}
                    className="mt-4 rounded-md border border-orchid/50 bg-orchid/[0.1] px-4 py-1.5 font-display text-[11.5px] font-semibold text-orchid transition-colors hover:bg-orchid/[0.18]"
                  >
                    restore shipped README
                  </button>
                </div>
              ) : (
                <PreviewBoundary>
                  <Markdown text={text} onStats={onStats} />
                </PreviewBoundary>
              )}
            </div>
          </section>
        )}
      </div>

      {pushOpen && <PushModal text={text} onClose={() => setPushOpen(false)} />}
    </div>
  );
}
