// AI CoAudS - Live Console Component
// Main interface for the agentic PR audit system

import { useState, useEffect } from 'react';

interface AuditResult {
  prNumber: number;
  repository: string;
  findings: Finding[];
  status: 'pending' | 'running' | 'completed' | 'error';
  timestamp: number;
}

interface Finding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  file: string;
  line: number;
  agent: string;
  confidence: number;
}

export function Console() {
  const [prUrl, setPrUrl] = useState('');
  const [audits, setAudits] = useState<AuditResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState<AuditResult | null>(null);

  const startAudit = async () => {
    if (!prUrl.trim()) return;
    
    setIsRunning(true);
    
    // Parse PR URL
    const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
      alert('Invalid GitHub PR URL');
      setIsRunning(false);
      return;
    }

    const [, owner, repo, prNumber] = match;
    
    // Simulate audit process
    const newAudit: AuditResult = {
      prNumber: parseInt(prNumber),
      repository: `${owner}/${repo}`,
      findings: [],
      status: 'running',
      timestamp: Date.now(),
    };
    
    setAudits([newAudit, ...audits]);
    setSelectedAudit(newAudit);

    // Simulate agent processing
    setTimeout(() => {
      const completedAudit: AuditResult = {
        ...newAudit,
        status: 'completed',
        findings: generateMockFindings(parseInt(prNumber)),
      };
      
      setAudits(audits.map(a => a.timestamp === newAudit.timestamp ? completedAudit : a));
      setSelectedAudit(completedAudit);
      setIsRunning(false);
    }, 3000);
  };

  const generateMockFindings = (prNumber: number): Finding[] => {
    const severities: Finding['severity'][] = ['critical', 'high', 'medium', 'low'];
    const agents = ['Injection Hunter', 'Secrets Sentinel', 'Access Auditor', 'Supply-Chain Auditor', 'Crypto & Transport Auditor'];
    
    return Array.from({ length: Math.floor(Math.random() * 5) + 3 }, (_, i) => ({
      id: `finding-${prNumber}-${i}`,
      severity: severities[Math.floor(Math.random() * severities.length)],
      title: `Security Issue ${i + 1}`,
      description: `Potential vulnerability detected in the pull request`,
      file: `src/module${i + 1}.ts`,
      line: Math.floor(Math.random() * 100) + 1,
      agent: agents[Math.floor(Math.random() * agents.length)],
      confidence: Math.random() * 0.3 + 0.7,
    }));
  };

  const getSeverityColor = (severity: Finding['severity']) => {
    const colors = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/50',
      high: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
      medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      low: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    };
    return colors[severity];
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-ink-700/50 bg-ink-900/50 p-6">
        <h2 className="font-display text-2xl font-bold text-ink-100 mb-4">
          Live Audit Console
        </h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={prUrl}
            onChange={(e) => setPrUrl(e.target.value)}
            placeholder="https://github.com/owner/repo/pull/123"
            className="flex-1 px-4 py-2 bg-ink-800 border border-ink-600 rounded-lg text-ink-100 placeholder-ink-500 focus:outline-none focus:border-orchid/60"
            disabled={isRunning}
          />
          <button
            onClick={startAudit}
            disabled={isRunning || !prUrl.trim()}
            className="px-6 py-2 bg-orchid/20 border border-orchid/50 text-orchid rounded-lg font-semibold hover:bg-orchid/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? 'Auditing...' : 'Start Audit'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Audit List */}
        <div className="w-80 border-r border-ink-700/50 overflow-y-auto">
          <div className="p-4">
            <h3 className="font-display text-sm font-semibold text-ink-400 uppercase tracking-wider mb-3">
              Recent Audits
            </h3>
            {audits.length === 0 ? (
              <p className="text-ink-500 text-sm">No audits yet</p>
            ) : (
              <div className="space-y-2">
                {audits.map((audit) => (
                  <button
                    key={audit.timestamp}
                    onClick={() => setSelectedAudit(audit)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedAudit?.timestamp === audit.timestamp
                        ? 'bg-orchid/10 border-orchid/50'
                        : 'bg-ink-800/50 border-ink-700/50 hover:bg-ink-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-sm text-ink-100">
                        #{audit.prNumber}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        audit.status === 'completed' ? 'bg-emx/20 text-emx' :
                        audit.status === 'running' ? 'bg-cyanx/20 text-cyanx' :
                        audit.status === 'error' ? 'bg-rosex/20 text-rosex' :
                        'bg-ink-700 text-ink-400'
                      }`}>
                        {audit.status}
                      </span>
                    </div>
                    <div className="text-xs text-ink-400 truncate">
                      {audit.repository}
                    </div>
                    {audit.findings.length > 0 && (
                      <div className="text-xs text-ink-500 mt-1">
                        {audit.findings.length} findings
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Audit Details */}
        <div className="flex-1 overflow-y-auto">
          {selectedAudit ? (
            <div className="p-6">
              <div className="mb-6">
                <h3 className="font-display text-xl font-bold text-ink-100 mb-2">
                  PR #{selectedAudit.prNumber}
                </h3>
                <p className="text-ink-400">{selectedAudit.repository}</p>
                <p className="text-xs text-ink-500 mt-1">
                  {new Date(selectedAudit.timestamp).toLocaleString()}
                </p>
              </div>

              {selectedAudit.status === 'running' && (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="inline-block w-12 h-12 border-4 border-orchid/30 border-t-orchid rounded-full animate-spin mb-4"></div>
                    <p className="text-ink-400">Agents analyzing pull request...</p>
                  </div>
                </div>
              )}

              {selectedAudit.status === 'completed' && (
                <div>
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    {['critical', 'high', 'medium', 'low'].map((severity) => {
                      const count = selectedAudit.findings.filter(f => f.severity === severity).length;
                      return (
                        <div key={severity} className={`p-4 rounded-lg border ${getSeverityColor(severity as Finding['severity'])}`}>
                          <div className="text-3xl font-bold">{count}</div>
                          <div className="text-sm uppercase tracking-wider">{severity}</div>
                        </div>
                      );
                    })}
                  </div>

                  <h4 className="font-display text-lg font-semibold text-ink-100 mb-4">
                    Findings
                  </h4>
                  <div className="space-y-3">
                    {selectedAudit.findings.map((finding) => (
                      <div
                        key={finding.id}
                        className="p-4 bg-ink-800/50 border border-ink-700/50 rounded-lg"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getSeverityColor(finding.severity)}`}>
                              {finding.severity.toUpperCase()}
                            </span>
                            <span className="font-semibold text-ink-100">
                              {finding.title}
                            </span>
                          </div>
                          <span className="text-xs text-ink-500">
                            {(finding.confidence * 100).toFixed(0)}% confidence
                          </span>
                        </div>
                        <p className="text-sm text-ink-300 mb-2">
                          {finding.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-ink-500">
                          <span className="font-mono">{finding.file}:{finding.line}</span>
                          <span>Detected by: {finding.agent}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-ink-500">
                <p className="text-lg mb-2">No audit selected</p>
                <p className="text-sm">Enter a GitHub PR URL to start auditing</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Console;
