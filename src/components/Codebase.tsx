// AI CoAudS - Codebase Component
// Displays the implementation code and file structure

import { useState } from 'react';

interface CodeFile {
  path: string;
  language: string;
  description: string;
  code: string;
}

const CODEBASE_FILES: CodeFile[] = [
  {
    path: 'backend/server.py',
    language: 'python',
    description: 'FastAPI webhook server with HMAC verification',
    code: `from fastapi import FastAPI, Request, HTTPException
import hmac
import hashlib

app = FastAPI(title="AI CoAudS")

@app.post("/webhook")
async def webhook(request: Request):
    # Verify GitHub webhook signature
    signature = request.headers.get("X-Hub-Signature-256")
    body = await request.body()
    
    if not verify_signature(body, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    # Process webhook
    payload = await request.json()
    return {"status": "accepted"}

def verify_signature(body: bytes, signature: str) -> bool:
    secret = settings.github_webhook_secret.encode()
    expected = "sha256=" + hmac.new(
        secret, body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)`,
  },
  {
    path: 'backend/pipeline.py',
    language: 'python',
    description: 'Multi-agent orchestration pipeline',
    code: `from crewai import Agent, Task, Crew, Process

class AuditPipeline:
    def __init__(self):
        self.agents = self._create_agents()
    
    def _create_agents(self):
        orchestrator = Agent(
            role="Orchestrator",
            goal="Coordinate security audit",
            backstory="Expert at coordinating..."
        )
        
        security_panel = [
            Agent(role="Injection Hunter", ...),
            Agent(role="Secrets Sentinel", ...),
            Agent(role="Access Auditor", ...),
            Agent(role="Supply-Chain Auditor", ...),
            Agent(role="Crypto & Transport", ...),
        ]
        
        return [orchestrator, *security_panel]
    
    async def run(self, pr_diff: str):
        tasks = self._create_tasks(pr_diff)
        crew = Crew(
            agents=self.agents,
            tasks=tasks,
            process=Process.sequential
        )
        return await crew.kickoff_async()`,
  },
  {
    path: 'src/components/Console.tsx',
    language: 'typescript',
    description: 'Live audit console UI component',
    code: `export function Console() {
  const [prUrl, setPrUrl] = useState('');
  const [audits, setAudits] = useState<AuditResult[]>([]);
  
  const startAudit = async () => {
    // Parse PR URL and start audit
    const match = prUrl.match(
      /github\\.com\\/([^/]+)\\/([^/]+)\\/pull\\/(\\d+)/
    );
    
    // Trigger backend audit
    const result = await triggerAudit(match);
    setAudits([result, ...audits]);
  };
  
  return (
    <div className="console">
      <input
        value={prUrl}
        onChange={(e) => setPrUrl(e.target.value)}
        placeholder="GitHub PR URL"
      />
      <button onClick={startAudit}>
        Start Audit
      </button>
      <AuditList audits={audits} />
    </div>
  );
}`,
  },
  {
    path: '.github/workflows/ci.yml',
    language: 'yaml',
    description: 'GitHub Actions CI/CD pipeline',
    code: `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      
      - name: Install dependencies
        run: pip install -r backend/requirements.txt
      
      - name: Run tests
        run: pytest backend/tests/
      
      - name: Security scan
        run: |
          pip-audit -r backend/requirements.txt
          bandit -r backend/
  
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '24'
      
      - name: Build
        run: npm run build`,
  },
];

export function Codebase() {
  const [selectedFile, setSelectedFile] = useState<CodeFile | null>(null);

  return (
    <div className="flex h-full">
      {/* File List */}
      <div className="w-80 border-r border-ink-700/50 overflow-y-auto">
        <div className="p-4">
          <h3 className="font-display text-sm font-semibold text-ink-400 uppercase tracking-wider mb-3">
            Implementation Files
          </h3>
          <div className="space-y-2">
            {CODEBASE_FILES.map((file) => (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedFile?.path === file.path
                    ? 'bg-orchid/10 border-orchid/50'
                    : 'bg-ink-800/50 border-ink-700/50 hover:bg-ink-800'
                }`}
              >
                <div className="font-mono text-sm text-ink-100 mb-1">
                  {file.path}
                </div>
                <div className="text-xs text-ink-400">
                  {file.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Code Viewer */}
      <div className="flex-1 overflow-y-auto">
        {selectedFile ? (
          <div className="p-6">
            <div className="mb-4">
              <h3 className="font-display text-xl font-bold text-ink-100 mb-2">
                {selectedFile.path}
              </h3>
              <p className="text-sm text-ink-400">
                {selectedFile.description}
              </p>
              <div className="mt-2 inline-block px-2 py-1 bg-ink-800 rounded text-xs font-mono text-ink-300">
                {selectedFile.language}
              </div>
            </div>
            <pre className="bg-ink-900 border border-ink-700/50 rounded-lg p-4 overflow-x-auto">
              <code className="text-sm font-mono text-ink-200">
                {selectedFile.code}
              </code>
            </pre>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-ink-500">
              <p className="text-lg mb-2">No file selected</p>
              <p className="text-sm">Select a file from the list to view its code</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Codebase;
