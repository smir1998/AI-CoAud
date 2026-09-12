// AI CoAudS - README Component
// Displays project documentation and usage guide

export function Readme() {
  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-4xl mx-auto prose prose-invert">
        <h1 className="font-display text-3xl font-bold text-ink-100 mb-6">
          AI CoAudS
        </h1>
        
        <p className="text-lg text-ink-300 mb-8">
          Agentic multi-agent code auditing for GitHub Pull Requests
        </p>

        <div className="space-y-8">
          {/* Overview */}
          <section>
            <h2 className="font-display text-2xl font-bold text-ink-100 mb-4">
              Overview
            </h2>
            <p className="text-ink-300 leading-relaxed">
              AI CoAudS is an agentic PR audit system that uses a panel of 5 specialized security agents 
              to automatically analyze GitHub pull requests. The system combines LLM-powered analysis with 
              deterministic SAST tools to provide comprehensive security reviews.
            </p>
          </section>

          {/* Features */}
          <section>
            <h2 className="font-display text-2xl font-bold text-ink-100 mb-4">
              Features
            </h2>
            <ul className="space-y-3 text-ink-300">
              <li className="flex items-start gap-3">
                <span className="text-orchid font-bold">•</span>
                <div>
                  <strong className="text-ink-100">5-Specialist Security Panel:</strong> Injection Hunter, 
                  Secrets Sentinel, Access Auditor, Supply-Chain Auditor, and Crypto & Transport Auditor
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-orchid font-bold">•</span>
                <div>
                  <strong className="text-ink-100">Real GitHub Integration:</strong> Fetches PR diffs via 
                  GitHub API and posts structured reviews back to PRs
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-orchid font-bold">•</span>
                <div>
                  <strong className="text-ink-100">Deterministic SAST:</strong> Semgrep, Bandit, Ruff, 
                  and pip-audit for reliable vulnerability detection
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-orchid font-bold">•</span>
                <div>
                  <strong className="text-ink-100">Self-Healing Debugger:</strong> AI-powered error 
                  diagnosis and recovery suggestions
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-orchid font-bold">•</span>
                <div>
                  <strong className="text-ink-100">CI/CD Integration:</strong> GitHub Actions workflow 
                  for automated security scanning
                </div>
              </li>
            </ul>
          </section>

          {/* Quick Start */}
          <section>
            <h2 className="font-display text-2xl font-bold text-ink-100 mb-4">
              Quick Start
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-ink-200 mb-2">1. Install Dependencies</h3>
                <pre className="bg-ink-900 border border-ink-700/50 rounded-lg p-4 overflow-x-auto">
                  <code className="text-sm font-mono text-ink-200">
{`# Frontend
npm install

# Backend
cd backend
pip install -r requirements.txt`}
                  </code>
                </pre>
              </div>

              <div>
                <h3 className="font-semibold text-ink-200 mb-2">2. Configure Environment</h3>
                <pre className="bg-ink-900 border border-ink-700/50 rounded-lg p-4 overflow-x-auto">
                  <code className="text-sm font-mono text-ink-200">
{`# Create .env file
GITHUB_TOKEN=your_github_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret
ANTHROPIC_API_KEY=your_anthropic_key`}
                  </code>
                </pre>
              </div>

              <div>
                <h3 className="font-semibold text-ink-200 mb-2">3. Run Development Server</h3>
                <pre className="bg-ink-900 border border-ink-700/50 rounded-lg p-4 overflow-x-auto">
                  <code className="text-sm font-mono text-ink-200">
{`# Frontend
npm run dev

# Backend (in separate terminal)
cd backend
uvicorn server:app --reload`}
                  </code>
                </pre>
              </div>
            </div>
          </section>

          {/* Usage */}
          <section>
            <h2 className="font-display text-2xl font-bold text-ink-100 mb-4">
              Usage
            </h2>
            <div className="space-y-4 text-ink-300">
              <p>
                To audit a GitHub pull request:
              </p>
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li>Open the Live Console tab</li>
                <li>Enter a GitHub PR URL (e.g., <code className="bg-ink-900 px-2 py-0.5 rounded">https://github.com/owner/repo/pull/123</code>)</li>
                <li>Click "Start Audit"</li>
                <li>Wait for the 5-agent panel to complete analysis</li>
                <li>Review findings in the console or check the PR for posted comments</li>
              </ol>
            </div>
          </section>

          {/* Architecture */}
          <section>
            <h2 className="font-display text-2xl font-bold text-ink-100 mb-4">
              Architecture
            </h2>
            <p className="text-ink-300 mb-4">
              The system follows a multi-stage pipeline:
            </p>
            <div className="bg-ink-900 border border-ink-700/50 rounded-lg p-4">
              <div className="font-mono text-sm text-ink-300 space-y-1">
                <div>1. Webhook → Orchestrator</div>
                <div>2. Orchestrator → Security Panel (5 agents in parallel)</div>
                <div>3. Security Panel → Style Agent + SAST Tools</div>
                <div>4. Corroboration & False Positive Filtering</div>
                <div>5. Refactor Agent → Generate Fixes</div>
                <div>6. Review Agent → Compile Report</div>
                <div>7. Validation Gate → Check Fixes</div>
                <div>8. Post Review to GitHub PR</div>
              </div>
            </div>
          </section>

          {/* Security */}
          <section>
            <h2 className="font-display text-2xl font-bold text-ink-100 mb-4">
              Security
            </h2>
            <ul className="space-y-2 text-ink-300">
              <li className="flex items-start gap-3">
                <span className="text-emx">✓</span>
                HMAC-SHA256 webhook signature verification
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emx">✓</span>
                Fail-closed security policy (rejects unsigned webhooks in production)
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emx">✓</span>
                No secrets in client-side code
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emx">✓</span>
                Environment variable-based configuration
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emx">✓</span>
                Dependency vulnerability scanning (pip-audit)
              </li>
            </ul>
          </section>

          {/* Deployment */}
          <section>
            <h2 className="font-display text-2xl font-bold text-ink-100 mb-4">
              Deployment
            </h2>
            <div className="space-y-4 text-ink-300">
              <p>
                The application can be deployed using Docker Compose:
              </p>
              <pre className="bg-ink-900 border border-ink-700/50 rounded-lg p-4 overflow-x-auto">
                <code className="text-sm font-mono text-ink-200">
{`# Build and start all services
docker compose up --build

# Or run in detached mode
docker compose up -d --build`}
                </code>
              </pre>
              <p>
                For GitHub Pages deployment, the frontend is automatically built and deployed 
                via GitHub Actions on every push to main.
              </p>
            </div>
          </section>

          {/* License */}
          <section>
            <h2 className="font-display text-2xl font-bold text-ink-100 mb-4">
              License
            </h2>
            <p className="text-ink-300">
              MIT License - see LICENSE file for details
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default Readme;
