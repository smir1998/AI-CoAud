// AI CoAudS - Architecture Component
// Displays the system architecture and agent pipeline

export function Architecture() {
  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-6xl mx-auto">
        <h2 className="font-display text-2xl font-bold text-ink-100 mb-6">
          System Architecture
        </h2>

        {/* Pipeline Overview */}
        <div className="mb-8 p-6 bg-ink-900/50 border border-ink-700/50 rounded-lg">
          <h3 className="font-display text-lg font-semibold text-ink-100 mb-4">
            Agentic Audit Pipeline
          </h3>
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-4">
            {[
              { name: 'Webhook', color: 'orchid' },
              { name: 'Orchestrator', color: 'cyanx' },
              { name: 'Security Panel', color: 'rosex' },
              { name: 'Style Agent', color: 'amberx' },
              { name: 'SAST Tools', color: 'emx' },
              { name: 'Refactor', color: 'emx' },
              { name: 'Review', color: 'ink-300' },
              { name: 'Validate', color: 'emx' },
              { name: 'Post', color: 'orchid' },
            ].map((stage, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`px-4 py-2 rounded-lg border bg-${stage.color}/10 border-${stage.color}/50 text-${stage.color} font-mono text-sm whitespace-nowrap`}>
                  {stage.name}
                </div>
                {i < 8 && (
                  <svg className="w-4 h-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Security Panel */}
        <div className="mb-8 p-6 bg-ink-900/50 border border-ink-700/50 rounded-lg">
          <h3 className="font-display text-lg font-semibold text-ink-100 mb-4">
            5-Specialist Security Panel
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                name: 'Injection Hunter',
                short: 'INJ',
                color: '#fb7185',
                description: 'SQLi, Command Injection, XSS, Template Injection',
                cwes: ['CWE-89', 'CWE-78', 'CWE-79', 'CWE-94'],
              },
              {
                name: 'Secrets Sentinel',
                short: 'KEY',
                color: '#fbbf24',
                description: 'Hardcoded credentials, API keys, private keys',
                cwes: ['CWE-798', 'CWE-321', 'CWE-522'],
              },
              {
                name: 'Access Auditor',
                short: 'ACL',
                color: '#a78bfa',
                description: 'Authentication, authorization, JWT, session management',
                cwes: ['CWE-287', 'CWE-345', 'CWE-639'],
              },
              {
                name: 'Supply-Chain Auditor',
                short: 'PKG',
                color: '#4ade80',
                description: 'Dependencies, deserialization, package vulnerabilities',
                cwes: ['CWE-502', 'CWE-1104', 'CWE-829'],
              },
              {
                name: 'Crypto & Transport',
                short: 'CRY',
                color: '#67e8f9',
                description: 'Weak cryptography, TLS, secure communication',
                cwes: ['CWE-327', 'CWE-328', 'CWE-295'],
              },
            ].map((agent, i) => (
              <div
                key={i}
                className="p-4 bg-ink-800/50 border border-ink-700/50 rounded-lg"
                style={{ borderLeftWidth: '3px', borderLeftColor: agent.color }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="font-mono text-xs font-bold px-2 py-0.5 rounded"
                    style={{ color: agent.color, backgroundColor: `${agent.color}20` }}
                  >
                    {agent.short}
                  </span>
                  <h4 className="font-semibold text-ink-100">{agent.name}</h4>
                </div>
                <p className="text-sm text-ink-300 mb-3">{agent.description}</p>
                <div className="flex flex-wrap gap-1">
                  {agent.cwes.map((cwe) => (
                    <span key={cwe} className="text-xs font-mono px-2 py-0.5 bg-ink-900 text-ink-400 rounded">
                      {cwe}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Technology Stack */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-ink-900/50 border border-ink-700/50 rounded-lg">
            <h3 className="font-display text-lg font-semibold text-ink-100 mb-4">
              Frontend
            </h3>
            <ul className="space-y-2 text-sm text-ink-300">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orchid"></span>
                React 19.2.8
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orchid"></span>
                TypeScript 5.9.3
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orchid"></span>
                Vite 7.3.6
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orchid"></span>
                Tailwind CSS 4.3.3
              </li>
            </ul>
          </div>

          <div className="p-6 bg-ink-900/50 border border-ink-700/50 rounded-lg">
            <h3 className="font-display text-lg font-semibold text-ink-100 mb-4">
              Backend
            </h3>
            <ul className="space-y-2 text-sm text-ink-300">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyanx"></span>
                Python 3.12
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyanx"></span>
                FastAPI 0.115.6
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyanx"></span>
                CrewAI 1.15.18
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyanx"></span>
                Redis 8
              </li>
            </ul>
          </div>

          <div className="p-6 bg-ink-900/50 border border-ink-700/50 rounded-lg">
            <h3 className="font-display text-lg font-semibold text-ink-100 mb-4">
              Security Tools
            </h3>
            <ul className="space-y-2 text-sm text-ink-300">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emx"></span>
                Semgrep 1.100.0
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emx"></span>
                Bandit 1.8.0
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emx"></span>
                Ruff 0.8.6
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emx"></span>
                pip-audit 2.7.3
              </li>
            </ul>
          </div>

          <div className="p-6 bg-ink-900/50 border border-ink-700/50 rounded-lg">
            <h3 className="font-display text-lg font-semibold text-ink-100 mb-4">
              Deployment
            </h3>
            <ul className="space-y-2 text-sm text-ink-300">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amberx"></span>
                Docker Compose
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amberx"></span>
                GitHub Actions CI/CD
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amberx"></span>
                GitHub Pages
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amberx"></span>
                Nginx (Production)
              </li>
            </ul>
          </div>
        </div>

        {/* Data Flow */}
        <div className="mt-8 p-6 bg-ink-900/50 border border-ink-700/50 rounded-lg">
          <h3 className="font-display text-lg font-semibold text-ink-100 mb-4">
            Data Flow
          </h3>
          <div className="space-y-4 text-sm text-ink-300">
            <div className="flex items-start gap-3">
              <span className="font-mono text-orchid font-bold">1.</span>
              <div>
                <strong className="text-ink-100">Webhook Reception:</strong> GitHub PR webhook received and HMAC-SHA256 signature verified
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="font-mono text-orchid font-bold">2.</span>
              <div>
                <strong className="text-ink-100">Orchestration:</strong> Orchestrator agent fetches PR diff and dispatches to specialist agents
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="font-mono text-orchid font-bold">3.</span>
              <div>
                <strong className="text-ink-100">Parallel Analysis:</strong> 5 security specialists + style agent + SAST tools run in parallel
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="font-mono text-orchid font-bold">4.</span>
              <div>
                <strong className="text-ink-100">Corroboration:</strong> Findings corroborated across agents, false positives filtered
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="font-mono text-orchid font-bold">5.</span>
              <div>
                <strong className="text-ink-100">Refactoring:</strong> Refactor agent generates fix suggestions for confirmed issues
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="font-mono text-orchid font-bold">6.</span>
              <div>
                <strong className="text-ink-100">Review & Validation:</strong> Review agent compiles report, validation gate checks fixes
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="font-mono text-orchid font-bold">7.</span>
              <div>
                <strong className="text-ink-100">PR Comment:</strong> Structured review posted to GitHub PR with inline comments
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Architecture;
