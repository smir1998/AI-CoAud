import { Component, type ErrorInfo, type ReactNode } from "react";

export interface CapturedError {
  error: Error;
  componentStack?: string;
  timestamp: number;
  url: string;
  userAgent: string;
}

interface Props {
  children: ReactNode;
  onError?: (error: CapturedError) => void;
}

interface State {
  hasError: boolean;
  error: CapturedError | null;
}

/**
 * Global error boundary that captures all runtime errors and provides
 * diagnostic information for the self-healing debugger.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: null }; // Will be set in componentDidCatch
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const captured: CapturedError = {
      error,
      componentStack: errorInfo.componentStack || undefined,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    this.setState({ error: captured });
    console.error("[ai-coauds] error boundary caught:", captured);

    // Notify parent if callback provided
    this.props.onError?.(captured);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-ink-950 p-4">
          <div className="max-w-2xl w-full panel border-rosex/40 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rosex/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-rosex" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-ink-100">Runtime Error Detected</h2>
                <p className="text-sm text-ink-400">The self-healing debugger has captured this error</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-mono text-ink-500 mb-1">Error Type</p>
                <p className="text-sm font-mono text-rosex">{this.state.error.error.name}</p>
              </div>

              <div>
                <p className="text-xs font-mono text-ink-500 mb-1">Message</p>
                <p className="text-sm text-ink-200">{this.state.error.error.message}</p>
              </div>

              {this.state.error.error.stack && (
                <div>
                  <p className="text-xs font-mono text-ink-500 mb-1">Stack Trace</p>
                  <pre className="text-xs font-mono text-ink-300 bg-ink-900 p-3 rounded overflow-x-auto max-h-48">
                    {this.state.error.error.stack}
                  </pre>
                </div>
              )}

              {this.state.error.componentStack && (
                <div>
                  <p className="text-xs font-mono text-ink-500 mb-1">Component Stack</p>
                  <pre className="text-xs font-mono text-ink-300 bg-ink-900 p-3 rounded overflow-x-auto max-h-32">
                    {this.state.error.componentStack}
                  </pre>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 px-4 py-2 rounded-md border border-orchid/50 bg-orchid/10 text-orchid font-display text-sm font-semibold hover:bg-orchid/20 transition-colors"
                >
                  Reload Page
                </button>
                <button
                  onClick={() => this.setState({ hasError: false, error: null })}
                  className="flex-1 px-4 py-2 rounded-md border border-ink-600 text-ink-300 font-display text-sm font-semibold hover:bg-ink-800 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Global error handler that catches unhandled promise rejections and
 * runtime errors outside of React's error boundary.
 */
export function setupGlobalErrorHandler(onError: (error: CapturedError) => void) {
  // Catch unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    const captured: CapturedError = {
      error,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    };
    console.error("[ai-coauds] unhandled rejection:", captured);
    onError(captured);
  });

  // Catch runtime errors
  window.addEventListener("error", (event) => {
    const error = event.error instanceof Error ? event.error : new Error(event.message);
    const captured: CapturedError = {
      error,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    };
    console.error("[ai-coauds] runtime error:", captured);
    onError(captured);
  });
}
