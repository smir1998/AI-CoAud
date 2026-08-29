import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// tell the inline boot watchdog in index.html that React is alive
(window as unknown as { __coauds_mounted?: boolean }).__coauds_mounted = true;

/* Root-level fault isolation: catches anything that escapes App's own
 * ViewBoundary (e.g. a crash inside App's shell render) and renders a
 * visible diagnosis instead of a blank screen. */
class RootBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[ai-coauds] fatal render fault:", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 560, border: "1px solid rgba(248,113,113,.4)", borderRadius: 10, padding: "22px 26px", background: "rgba(10,17,31,.9)", color: "#a9bad8", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, lineHeight: 1.7 }}>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 16, color: "#fca5a5", letterSpacing: "0.06em" }}>
            AI CoAudS hit a render fault
          </div>
          <div style={{ marginTop: 10, color: "#f87171" }}>
            {this.state.error.name}: {this.state.error.message}
          </div>
          <div style={{ marginTop: 10 }}>
            The console could not render. A hard refresh (Ctrl/Cmd+Shift+R) clears stale bundles; details are in the browser console.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, background: "rgba(56,189,248,.1)", color: "#38bdf8", border: "1px solid rgba(56,189,248,.5)", borderRadius: 6, padding: "7px 16px", fontFamily: "'Chakra Petch', sans-serif", fontWeight: 600, cursor: "pointer" }}
          >
            reload console
          </button>
        </div>
      </div>
    );
  }
}

/* surface uncaught runtime errors visibly — nothing should fail silently */
window.addEventListener("unhandledrejection", (e) => {
  console.error("[ai-coauds] unhandled rejection:", e.reason);
});

const container = document.getElementById("root");
if (!container) throw new Error("#root missing — index.html is corrupted");
// React replaces the boot fallback on first commit — if it never commits,
// the fallback (and its watchdog) stays visible.

ReactDOM.createRoot(container).render(
  <RootBoundary>
    <App />
  </RootBoundary>
);
