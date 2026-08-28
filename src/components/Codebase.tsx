import { useMemo, useState, type ReactNode } from "react";
import { CODE_FILES } from "../data/codebase";
import { CheckIcon, CodeIcon, CopyIcon, FileCodeIcon } from "./icons";

const KW = new Set([
  "def", "class", "import", "from", "return", "if", "elif", "else", "for",
  "while", "in", "with", "as", "try", "except", "finally", "raise", "async",
  "await", "lambda", "pass", "break", "continue", "yield", "not", "and", "or",
  "is", "None", "True", "False", "global", "assert", "del",
]);

function keywords(seg: string, prefix: string): ReactNode {
  return seg.split(/(@\w+|\b[A-Za-z_]\w*\b)/g).map((w, i) => {
    if (w.startsWith("@")) return <span key={`${prefix}${i}`} className="text-cyanx">{w}</span>;
    if (KW.has(w)) return <span key={`${prefix}${i}`} className="text-orchid">{w}</span>;
    if (/^\d+(\.\d+)?$/.test(w)) return <span key={`${prefix}${i}`} className="text-rosex">{w}</span>;
    return <span key={`${prefix}${i}`}>{w}</span>;
  });
}

function pyLine(line: string, key: number): ReactNode {
  const parts: ReactNode[] = [];
  const re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|#.*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) parts.push(<span key={`c${k++}`}>{keywords(line.slice(last, m.index), `${key}a${k}`)}</span>);
    const tok = m[0];
    parts.push(
      <span key={`t${k++}`} className={tok.startsWith("#") ? "italic text-ink-500" : "text-[#8fd6a8]"}>{tok}</span>
    );
    last = m.index + tok.length;
    if (tok.startsWith("#")) break;
  }
  if (last < line.length) parts.push(<span key={`c${k++}`}>{keywords(line.slice(last), `${key}b${k}`)}</span>);
  return <span key={key}>{parts}</span>;
}

function plainLine(line: string, key: number): ReactNode {
  const hash = line.indexOf("#");
  if (hash >= 0)
    return (
      <span key={key}>
        <span>{line.slice(0, hash)}</span>
        <span className="italic text-ink-500">{line.slice(hash)}</span>
      </span>
    );
  return <span key={key}>{line}</span>;
}

export default function Codebase() {
  const [idx, setIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const file = CODE_FILES[idx];

  const lines = useMemo(() => file.code.replace(/\n$/, "").split("\n"), [file]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-4 px-3 pb-6 lg:px-5">
      <header className="anim-rise panel flex flex-wrap items-end justify-between gap-3 px-5 py-4">
        <div>
          <p className="panel-head flex items-center gap-2"><CodeIcon className="h-3.5 w-3.5 text-emx" /> reference implementation</p>
          <h2 className="font-display pt-1 text-[24px] font-bold tracking-wide text-ink-100">ai-coauds / service</h2>
          <p className="max-w-2xl pt-1 text-[13px] leading-relaxed text-ink-300">
            The production-shaped Python codebase behind the console: FastAPI webhook server, CrewAI crew of five agents,
            Redis-backed shared state, deterministic SAST runners and the validation gate — containerized with Docker.
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10.5px] text-ink-400">
          <span className="chip border-ink-600 text-ink-300">{CODE_FILES.length} files</span>
          <span className="chip border-ink-600 text-emx">python 3.12</span>
        </div>
      </header>

      <div className="anim-rise grid grid-cols-1 gap-3 lg:grid-cols-12" style={{ animationDelay: "100ms" }}>
        {/* file tree */}
        <nav className="panel overflow-hidden lg:col-span-3">
          <p className="panel-head border-b border-ink-700/60 bg-ink-900/60 px-3 py-2">files</p>
          <ul className="p-1.5">
            {CODE_FILES.map((f, i) => (
              <li key={f.name}>
                <button
                  onClick={() => setIdx(i)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-all ${
                    i === idx ? "bg-orchid/[0.09] text-orchid shadow-[inset_2px_0_0_#38bdf8]" : "text-ink-300 hover:bg-ink-800/70 hover:text-ink-100"
                  }`}
                >
                  <FileCodeIcon className={`h-3.5 w-3.5 shrink-0 ${i === idx ? "text-orchid" : "text-ink-500"}`} />
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[12px] font-medium">{f.name}</span>
                    <span className="block truncate text-[10px] text-ink-500">{f.note}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-ink-700/60 p-3">
            <p className="font-mono text-[10px] leading-relaxed text-ink-500">
              $ git clone github.com/acme/ai-coauds<br />
              $ docker compose up --build<br />
              $ curl -X POST :8000/webhook …
            </p>
          </div>
        </nav>

        {/* code pane */}
        <section className="panel flex min-h-[560px] flex-col overflow-hidden lg:col-span-9">
          <div className="flex items-center gap-2 border-b border-ink-700/60 bg-ink-900/70 px-3 py-2">
            <span className="font-mono text-[12px] font-semibold text-ink-100">{file.name}</span>
            <span className="chip border-ink-600 text-ink-400">{file.lang}</span>
            <span className="hidden truncate font-mono text-[10px] text-ink-500 sm:block">— {file.note}</span>
            <button
              onClick={copy}
              className="ml-auto flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-800 px-2.5 py-1 font-mono text-[10.5px] text-ink-200 transition-colors hover:border-emx/60 hover:text-emx"
            >
              {copied ? <CheckIcon className="h-3 w-3 text-emx" /> : <CopyIcon className="h-3 w-3" />}
              {copied ? "copied" : "copy"}
            </button>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-auto py-2 font-mono text-[12px] leading-[1.65]">
            {lines.map((ln, i) => (
              <div key={i} className="flex px-0 transition-colors hover:bg-ink-800/40">
                <span className="w-11 shrink-0 pr-3 text-right text-[10.5px] text-ink-600 select-none">{i + 1}</span>
                <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre pr-4 text-ink-200">
                  {file.lang === "python" ? pyLine(ln, i) : plainLine(ln, i)}
                </pre>
              </div>
            ))}
          </div>
          <div className="border-t border-ink-700/60 bg-ink-900/70 px-3 py-1.5 font-mono text-[10px] text-ink-500">
            {lines.length} lines · {file.lang === "python" ? "utf-8 · python" : file.lang} · sentinel-crew@1.0.0
          </div>
        </section>
      </div>
    </div>
  );
}
