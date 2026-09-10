import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ErrorBoundary, setupGlobalErrorHandler, type CapturedError } from "./components/ErrorBoundary";
import { SelfHealingDebugger } from "./components/SelfHealingDebugger";

/* Boot-phase flags for the inline watchdog in index.html.
 * "exec" lands the moment this module starts running — BEFORE any render —
 * so the watchdog can distinguish "bundle never arrived" from "mounted". */
(window as unknown as { __coauds_boot?: string }).__coauds_boot = "exec";

/**
 * Root component with self-healing debugger integration.
 * Catches all runtime errors and provides AI-powered diagnosis and recovery.
 */
function Root() {
  const [activeError, setActiveError] = useState<CapturedError | null>(null);

  const handleError = (error: CapturedError) => {
    setActiveError(error);
  };

  const handleDismiss = () => {
    setActiveError(null);
  };

  const handleApplyFix = (fix: string) => {
    // For now, log the fix and reload. In production, this could:
    // - Apply the fix to source files (dev mode)
    // - Store the fix for manual application
    // - Send to a backend service for review
    console.log("[ai-coauds] applying fix:", fix);
    alert("Fix proposal logged. Reload the page to see changes.");
    window.location.reload();
  };

  // Setup global error handler for unhandled rejections and runtime errors
  React.useEffect(() => {
    setupGlobalErrorHandler(handleError);
  }, []);

  // If there's an active error, show the self-healing debugger
  if (activeError) {
    return <SelfHealingDebugger error={activeError} onDismiss={handleDismiss} onApply={handleApplyFix} />;
  }

  return (
    <ErrorBoundary onError={handleError}>
      <App />
    </ErrorBoundary>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("#root missing — index.html is corrupted");

// React replaces the boot fallback on first commit — if it never commits,
// the fallback (and its watchdog) stays visible.
ReactDOM.createRoot(container).render(<Root />);

/* render() commits synchronously — reaching this line means the tree is up.
 * If it throws, the flag never lands and the watchdog reports the stall. */
(window as unknown as { __coauds_mounted?: boolean }).__coauds_mounted = true;
