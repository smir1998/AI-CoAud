import { useState, type ReactNode } from "react";
import Architecture from "./components/Architecture";
import Codebase from "./components/Codebase";
import Console from "./components/Console";
import { ActivityIcon, BookIcon, CodeIcon, LogoIcon, MarkdownIcon, ShieldIcon, WebhookIcon } from "./components/icons";
import Readme from "./components/Readme";

type View = "console" | "architecture" | "readme" | "codebase";

const NAV: { id: View; label: string; icon: ReactNode }[] = [
  { id: "console", label: "live console", icon: <ActivityIcon className="h-3.5 w-3.5" /> },
  { id: "architecture", label: "architecture", icon: <BookIcon className="h-3.5 w-3.5" /> },
  { id: "readme", label: "readme", icon: <MarkdownIcon className="h-3.5 w-3.5" /> },
  { id: "codebase", label: "implementation", icon: <CodeIcon className="h-3.5 w-3.5" /> },
];

export default function App() {
  const [view, setView] = useState<View>("console");

  return (
    <div className="relative min-h-screen">
      <div className="ambient" />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* header */}
        <header className="border-b border-ink-700/50 bg-ink-950/70 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-[1560px] flex-wrap items-center gap-x-5 gap-y-2 px-3 py-3 lg:px-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-orchid/40 bg-orchid/[0.08] text-orchid shadow-[0_0_20px_-4px_rgba(56,189,248,0.5)]">
                <LogoIcon className="h-5 w-5" />
              </span>
              <div className="leading-tight">
                <h1 className="font-display text-[17px] font-bold tracking-[0.08em] text-ink-100">
                  AI&nbsp;<span className="text-orchid">CoAudS</span>
                </h1>
                <p className="font-mono text-[9.5px] tracking-[0.14em] text-ink-400 uppercase">
                  agentic PR audit · multi-agent code review
                </p>
              </div>
            </div>

            <nav className="order-3 flex w-full gap-1 sm:order-none sm:ml-6 sm:w-auto">
              {NAV.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setView(n.id)}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-display text-[11.5px] font-semibold tracking-wide transition-all ${
                    view === n.id
                      ? "border-orchid/50 bg-orchid/[0.1] text-orchid shadow-[0_0_16px_-6px_rgba(56,189,248,0.6)]"
                      : "border-transparent text-ink-400 hover:bg-ink-800/70 hover:text-ink-200"
                  }`}
                >
                  {n.icon}
                  {n.label}
                </button>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-3 font-mono text-[10px] text-ink-400">
              <span className="hidden items-center gap-1.5 md:flex">
                <WebhookIcon className="h-3.5 w-3.5 text-cyanx" />
                api.github.com · direct from browser
              </span>
              <span className="flex items-center gap-1.5 rounded-md border border-emx/40 bg-emx/[0.07] px-2 py-1 text-emx">
                <span className="led-pulse inline-block h-1.5 w-1.5 rounded-full bg-emx" style={{ color: "#10b981" }} />
                online
              </span>
            </div>
          </div>
        </header>

        {/* view */}
        <main className="flex-1 pt-3">
          <div key={view} className="anim-rise">
            {view === "console" && <Console />}
            {view === "architecture" && <Architecture />}
            {view === "readme" && <Readme />}
            {view === "codebase" && <Codebase />}
          </div>
        </main>

        {/* footer */}
        <footer className="mt-4 border-t border-ink-700/50 bg-ink-950/70">
          <div className="mx-auto flex w-full max-w-[1560px] flex-wrap items-center gap-x-6 gap-y-1 px-3 py-2.5 font-mono text-[10px] text-ink-500 lg:px-5">
            <span className="flex items-center gap-1.5 text-ink-400">
              <ShieldIcon className="h-3.5 w-3.5 text-orchid" /> ai-coauds v1.0.0
            </span>
            <span>github webhook → orchestrator → 3 parallel auditors → refactor → review → validation → PR comment</span>
            <span className="ml-auto flex items-center gap-4">
              <span>reference stack: crewai + fastapi + semgrep/bandit/ruff</span>
              <span className="text-ink-600">real analysis in your browser · your keys never leave it</span>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
