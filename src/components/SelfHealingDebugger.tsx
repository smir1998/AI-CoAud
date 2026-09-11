// AI CoAudS - Self-Healing Debugger Component

import { useState, useEffect } from 'react';
import { type CapturedError } from './ErrorBoundary';

interface Props {
  error: CapturedError;
  onDismiss: () => void;
  onApply?: (fix: string) => void;
}

interface FixProposal {
  diagnosis: string;
  rootCause: string;
  suggestedFix: string;
  confidence: number;
  steps: string[];
}

export function SelfHealingDebugger({ error, onDismiss, onApply }: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const [proposal, setProposal] = useState<FixProposal | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    analyzeError();
  }, [error]);

  const analyzeError = async () => {
    setAnalyzing(true);
    setAnalysisError(null);

    try {
      // Mock AI analysis - in production, this would call an LLM API
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const mockProposal: FixProposal = {
        diagnosis: `Runtime error detected: ${error.error.name}`,
        rootCause: error.error.message || 'Unknown error occurred during application execution',
        suggestedFix: 'Review the error stack trace and implement proper error handling. Consider adding try-catch blocks around the failing code.',
        confidence: 0.75,
        steps: [
          'Review the error message and stack trace',
          'Identify the component or function causing the error',
          'Add appropriate error handling',
          'Test the fix in development environment',
          'Deploy the fix to production',
        ],
      };

      setProposal(mockProposal);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-950 p-4">
      <div className="max-w-3xl w-full panel border-orchid/40 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-orchid/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-orchid" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold text-ink-100">Self-Healing Debugger</h2>
            <p className="text-sm text-ink-400">AI-powered error analysis and recovery</p>
          </div>
        </div>

        {/* Error Summary */}
        <div className="mb-6 p-4 bg-ink-900 rounded-lg border border-ink-700">
          <p className="text-xs font-mono text-ink-500 mb-1">Error</p>
          <p className="text-sm font-mono text-rosex">{error.error.name}</p>
          <p className="text-sm text-ink-200 mt-1">{error.error.message}</p>
        </div>

        {/* Analysis Status */}
        {analyzing && (
          <div className="mb-6 p-4 bg-cyanx/10 rounded-lg border border-cyanx/30">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-cyanx border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-cyanx">Analyzing error with AI...</p>
            </div>
          </div>
        )}

        {/* Analysis Error */}
        {analysisError && (
          <div className="mb-6 p-4 bg-rosex/10 rounded-lg border border-rosex/30">
            <p className="text-sm text-rosex mb-2">Analysis failed:</p>
            <p className="text-sm text-ink-300">{analysisError}</p>
            <button
              onClick={analyzeError}
              className="mt-3 px-3 py-1.5 rounded-md border border-rosex/50 bg-rosex/10 text-rosex text-sm font-semibold hover:bg-rosex/20 transition-colors"
            >
              Retry Analysis
            </button>
          </div>
        )}

        {/* Fix Proposal */}
        {proposal && (
          <div className="space-y-4 mb-6">
            <div className="p-4 bg-emx/10 rounded-lg border border-emx/30">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-mono text-emx">Diagnosis</p>
                <span className="text-xs font-mono text-ink-400">
                  Confidence: {Math.round(proposal.confidence * 100)}%
                </span>
              </div>
              <p className="text-sm text-ink-200">{proposal.diagnosis}</p>
            </div>

            <div className="p-4 bg-ink-900 rounded-lg border border-ink-700">
              <p className="text-xs font-mono text-ink-500 mb-2">Root Cause</p>
              <p className="text-sm text-ink-200">{proposal.rootCause}</p>
            </div>

            <div className="p-4 bg-orchid/10 rounded-lg border border-orchid/30">
              <p className="text-xs font-mono text-orchid mb-2">Suggested Fix</p>
              <pre className="text-xs font-mono text-ink-200 bg-ink-900 p-3 rounded overflow-x-auto">
                {proposal.suggestedFix}
              </pre>
            </div>

            <div className="p-4 bg-ink-900 rounded-lg border border-ink-700">
              <p className="text-xs font-mono text-ink-500 mb-2">Recovery Steps</p>
              <ol className="space-y-2">
                {proposal.steps.map((step, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink-200">
                    <span className="text-orchid font-mono">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t border-ink-700">
          {proposal && onApply && (
            <button
              onClick={() => onApply(proposal.suggestedFix)}
              className="flex-1 px-4 py-2 rounded-md border border-emx/50 bg-emx/10 text-emx font-display text-sm font-semibold hover:bg-emx/20 transition-colors"
            >
              Apply Fix (Requires Reload)
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="flex-1 px-4 py-2 rounded-md border border-orchid/50 bg-orchid/10 text-orchid font-display text-sm font-semibold hover:bg-orchid/20 transition-colors"
          >
            Reload Page
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 px-4 py-2 rounded-md border border-ink-600 text-ink-300 font-display text-sm font-semibold hover:bg-ink-800 transition-colors"
          >
            Dismiss
          </button>
        </div>

        {/* Debug Info */}
        <details className="mt-6">
          <summary className="text-xs font-mono text-ink-500 cursor-pointer hover:text-ink-300">
            Show raw error details
          </summary>
          <div className="mt-2 space-y-2">
            {error.error.stack && (
              <div>
                <p className="text-xs font-mono text-ink-500 mb-1">Stack Trace</p>
                <pre className="text-xs font-mono text-ink-300 bg-ink-900 p-2 rounded overflow-x-auto max-h-32">
                  {error.error.stack}
                </pre>
              </div>
            )}
            {error.componentStack && (
              <div>
                <p className="text-xs font-mono text-ink-500 mb-1">Component Stack</p>
                <pre className="text-xs font-mono text-ink-300 bg-ink-900 p-2 rounded overflow-x-auto max-h-32">
                  {error.componentStack}
                </pre>
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
