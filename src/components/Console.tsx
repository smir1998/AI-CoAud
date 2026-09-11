// Modern Agentic Console - Real-time AI agent visualization
import { useState, useEffect, useRef } from 'react';
import { runAgent, simulateAgent, type AgentStep, type AgentState } from '../agents/runtime';
import { CONFIG } from '../config';
import { GitHubInput } from './GitHubInput';

interface ConsoleProps {
  apiKey?: string;
}

export function Console({ apiKey }: ConsoleProps) {
  const [task, setTask] = useState('');
  const [context, setContext] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [status, setStatus] = useState<AgentState['status']>('idle');
  const [error, setError] = useState<string>();
  const [useSimulation, setUseSimulation] = useState(!apiKey);
  const [inputMode, setInputMode] = useState<'manual' | 'github'>('github');
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  const handleRun = async () => {
    if (!task.trim()) return;

    setIsRunning(true);
    setSteps([]);
    setError(undefined);
    setStatus('thinking');

    const callbacks = {
      onThought: (thought: string) => {
        setSteps(prev => [...prev, {
          type: 'thought',
          content: thought,
          timestamp: Date.now(),
        }]);
        setStatus('thinking');
      },
      onAction: (action: any) => {
        setSteps(prev => [...prev, {
          type: 'action',
          content: `Calling ${action.function.name}`,
          timestamp: Date.now(),
          toolCall: action,
        }]);
        setStatus('acting');
      },
      onObservation: (observation: string) => {
        setSteps(prev => [...prev, {
          type: 'observation',
          content: observation,
          timestamp: Date.now(),
        }]);
        setStatus('observing');
      },
      onReflection: (reflection: string) => {
        setSteps(prev => [...prev, {
          type: 'reflection',
          content: reflection,
          timestamp: Date.now(),
        }]);
        setStatus('reflecting');
      },
      onComplete: (result: any) => {
        setStatus('complete');
        setIsRunning(false);
      },
      onError: (error: any) => {
        setError(error.message);
        setStatus('error');
        setIsRunning(false);
      },
    };

    try {
      if (useSimulation || !apiKey) {
        await simulateAgent(task, context, callbacks);
      } else {
        CONFIG.llm.apiKey = apiKey;
        await runAgent(task, context, callbacks);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
      setIsRunning(false);
    }
  };

  const getStatusColor = (status: AgentState['status']) => {
    switch (status) {
      case 'thinking': return 'text-purple-400';
      case 'acting': return 'text-blue-400';
      case 'observing': return 'text-cyan-400';
      case 'reflecting': return 'text-amber-400';
      case 'complete': return 'text-emerald-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: AgentState['status']) => {
    switch (status) {
      case 'thinking': return '💭';
      case 'acting': return '⚡';
      case 'observing': return '👁️';
      case 'reflecting': return '🔄';
      case 'complete': return '✅';
      case 'error': return '❌';
      default: return '⏸️';
    }
  };

  return (
    <div className="flex flex-col h-full bg-ink-950">
      {/* Header */}
      <div className="border-b border-ink-700/50 bg-ink-900/50 backdrop-blur-xl">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold gradient-text">AI CoAudS Console</h1>
              <p className="text-sm text-ink-400 mt-1">Agentic AI Code Audit System</p>
            </div>
            <div className="flex items-center gap-3">
              <div className={`status-dot ${status === 'complete' ? 'active' : status === 'error' ? 'error' : isRunning ? 'running' : ''}`} />
              <span className={`text-sm font-medium ${getStatusColor(status)}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
          </div>

          {/* Input Section */}
          <div className="space-y-3">
            {/* Input Mode Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setInputMode('github')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  inputMode === 'github'
                    ? 'bg-orchid text-white'
                    : 'bg-ink-800 text-ink-300 hover:bg-ink-700'
                }`}
                disabled={isRunning}
              >
                🐙 GitHub Repository/PR
              </button>
              <button
                onClick={() => setInputMode('manual')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  inputMode === 'manual'
                    ? 'bg-orchid text-white'
                    : 'bg-ink-800 text-ink-300 hover:bg-ink-700'
                }`}
                disabled={isRunning}
              >
                ✍️ Manual Input
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-300 mb-2">
                Task / Audit Request
              </label>
              <textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="e.g., Audit this React component for security vulnerabilities..."
                className="input-modern w-full h-20 resize-none"
                disabled={isRunning}
              />
            </div>

            {/* Conditional Input */}
            {inputMode === 'github' ? (
              <GitHubInput
                onContentReady={(content, metadata) => {
                  setContext(content);
                  // Auto-generate task based on metadata
                  if (metadata.type === 'pr') {
                    setTask(`Audit PR #${metadata.pr.number}: ${metadata.pr.title} for security vulnerabilities, code quality issues, and best practices.`);
                  } else if (metadata.type === 'repo') {
                    setTask(`Audit the selected files from ${metadata.owner}/${metadata.repoName} for security vulnerabilities and code quality.`);
                  } else if (metadata.type === 'file') {
                    setTask(`Audit ${metadata.path} for security vulnerabilities and code quality issues.`);
                  }
                }}
                disabled={isRunning}
              />
            ) : (
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-2">
                  Code Context
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Paste code to audit..."
                  className="input-modern w-full h-32 resize-none font-mono text-sm"
                  disabled={isRunning}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-ink-300">
                <input
                  type="checkbox"
                  checked={useSimulation}
                  onChange={(e) => setUseSimulation(e.target.checked)}
                  className="rounded"
                  disabled={isRunning}
                />
                Simulation Mode {!apiKey && '(No API key)'}
              </label>

              <button
                onClick={handleRun}
                disabled={isRunning || !task.trim() || !context.trim()}
                className="btn-primary"
              >
                {isRunning ? (
                  <span className="flex items-center gap-2">
                    <span className="anim-spin">⚙️</span>
                    Running...
                  </span>
                ) : (
                  '🚀 Run Agent'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Steps Visualization */}
      <div className="flex-1 overflow-y-auto scroll-modern">
        <div className="px-6 py-4 space-y-4">
          {steps.length === 0 && !isRunning && (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">🤖</div>
              <h3 className="text-xl font-semibold text-ink-200 mb-2">
                Ready to Audit
              </h3>
              <p className="text-ink-400 max-w-md mx-auto">
                Enter a task and code context above, then click "Run Agent" to start the agentic AI audit.
              </p>
            </div>
          )}

          {steps.map((step, idx) => (
            <div
              key={idx}
              className="anim-fade"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-ink-800 flex items-center justify-center text-lg">
                  {step.type === 'thought' && '💭'}
                  {step.type === 'action' && '⚡'}
                  {step.type === 'observation' && '👁️'}
                  {step.type === 'reflection' && '🔄'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${
                      step.type === 'thought' ? 'text-purple-400' :
                      step.type === 'action' ? 'text-blue-400' :
                      step.type === 'observation' ? 'text-cyan-400' :
                      'text-amber-400'
                    }`}>
                      {step.type}
                    </span>
                    <span className="text-xs text-ink-500">
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  {step.type === 'thought' && (
                    <div className="thought-bubble">
                      {step.content}
                    </div>
                  )}

                  {step.type === 'action' && step.toolCall && (
                    <div className="code-block">
                      <div className="text-xs text-ink-400 mb-2">
                        Tool: {step.toolCall.function.name}
                      </div>
                      <pre className="text-sm text-ink-200 overflow-x-auto">
                        {JSON.stringify(JSON.parse(step.toolCall.function.arguments), null, 2)}
                      </pre>
                    </div>
                  )}

                  {step.type === 'observation' && (
                    <div className="code-block bg-emerald-500/5 border-emerald-500/20">
                      <pre className="text-sm text-ink-200 overflow-x-auto whitespace-pre-wrap">
                        {step.content}
                      </pre>
                    </div>
                  )}

                  {step.type === 'reflection' && (
                    <div className="thought-bubble bg-amber-500/10 border-amber-500/30">
                      <div className="text-xs font-semibold text-amber-400 mb-2">
                        📝 Final Reflection
                      </div>
                      {step.content}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isRunning && (
            <div className="flex items-center gap-3 text-ink-400 anim-fade">
              <div className="status-dot running" />
              <span className="text-sm">Agent is {status}...</span>
            </div>
          )}

          {error && (
            <div className="anim-fade bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-red-400 font-semibold">❌ Error</span>
              </div>
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <div ref={logsEndRef} />
        </div>
      </div>

      {/* Footer Stats */}
      {steps.length > 0 && (
        <div className="border-t border-ink-700/50 bg-ink-900/50 backdrop-blur-xl px-6 py-3">
          <div className="flex items-center justify-between text-xs text-ink-400">
            <div className="flex items-center gap-4">
              <span>Steps: {steps.length}</span>
              <span>•</span>
              <span>Thoughts: {steps.filter(s => s.type === 'thought').length}</span>
              <span>•</span>
              <span>Actions: {steps.filter(s => s.type === 'action').length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="status-dot active" />
              <span>Mode: {useSimulation ? 'Simulation' : 'Live LLM'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
