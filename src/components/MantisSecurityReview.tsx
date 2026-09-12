import React, { useState, useEffect } from 'react';
import { mantisAgent } from '../agents/mantis/agent';
import { MantisStage, SecurityReport, SecurityFinding } from '../agents/mantis/types';

export const MantisSecurityReview: React.FC = () => {
  const [code, setCode] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [stages, setStages] = useState<MantisStage[]>([]);
  const [report, setReport] = useState<SecurityReport | null>(null);
  const [activeTab, setActiveTab] = useState<'code' | 'pipeline' | 'findings' | 'report'>('code');
  const [selectedFinding, setSelectedFinding] = useState<SecurityFinding | null>(null);

  useEffect(() => {
    setStages(mantisAgent.getStages());
  }, []);

  const handleRunPipeline = async () => {
    if (!code.trim()) return;

    setIsRunning(true);
    setActiveTab('pipeline');

    try {
      // Parse code into file map
      const codebase = new Map<string, string>();
      codebase.set('main.py', code);

      // Run the full pipeline
      const result = await mantisAgent.runFullPipeline(codebase);
      
      setReport(result);
      setStages(mantisAgent.getStages());
      setActiveTab('findings');
    } catch (error) {
      console.error('Pipeline failed:', error);
      alert('Pipeline failed. Check console for details.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleLoadSample = () => {
    const sampleCode = `
import sqlite3
import os
import pickle
from flask import Flask, request, redirect

app = Flask(__name__)
PASSWORD = "super_secret_password_123"
API_KEY = "sk-1234567890abcdef"

@app.route('/login', methods=['POST'])
def login():
    username = request.form['username']
    password = request.form['password']
    
    # SQL Injection vulnerability
    conn = sqlite3.connect('users.db')
    query = "SELECT * FROM users WHERE username = '" + username + "' AND password = '" + password + "'"
    cursor = conn.execute(query)
    user = cursor.fetchone()
    
    if user:
        return redirect('/dashboard')
    return 'Invalid credentials'

@app.route('/download')
def download():
    filename = request.args.get('file')
    
    # Path Traversal vulnerability
    filepath = '/var/www/uploads/' + filename
    with open(filepath, 'r') as f:
        return f.read()

@app.route('/api/data', methods=['POST'])
def api_data():
    data = request.get_json()
    
    # Insecure Deserialization
    if 'payload' in data:
        obj = pickle.loads(data['payload'].encode())
        return {'result': str(obj)}
    
    return {'error': 'No payload'}

@app.route('/fetch')
def fetch_url():
    url = request.args.get('url')
    
    # SSRF vulnerability
    import requests
    response = requests.get(url)
    return response.text

if __name__ == '__main__':
    app.run(debug=True)
`;
    setCode(sampleCode);
  };

  const getSeverityColor = (severity: string): string => {
    const colors: Record<string, string> = {
      critical: '#dc2626',
      high: '#ea580c',
      medium: '#ca8a04',
      low: '#2563eb',
      info: '#6b7280',
    };
    return colors[severity] || '#6b7280';
  };

  return (
    <div className="mantis-review">
      <div className="review-header">
        <h2>🔍 Mantis Security Review</h2>
        <p className="subtitle">AI-powered vulnerability detection inspired by Google's Mantis</p>
      </div>

      <div className="review-tabs">
        <button
          className={activeTab === 'code' ? 'active' : ''}
          onClick={() => setActiveTab('code')}
        >
          Code Input
        </button>
        <button
          className={activeTab === 'pipeline' ? 'active' : ''}
          onClick={() => setActiveTab('pipeline')}
        >
          Pipeline
        </button>
        <button
          className={activeTab === 'findings' ? 'active' : ''}
          onClick={() => setActiveTab('findings')}
          disabled={!report}
        >
          Findings {report && `(${report.summary.totalFindings})`}
        </button>
        <button
          className={activeTab === 'report' ? 'active' : ''}
          onClick={() => setActiveTab('report')}
          disabled={!report}
        >
          Report
        </button>
      </div>

      <div className="review-content">
        {activeTab === 'code' && (
          <div className="code-section">
            <div className="code-actions">
              <button onClick={handleLoadSample}>Load Sample Code</button>
              <button 
                onClick={handleRunPipeline} 
                disabled={isRunning || !code.trim()}
                className="primary"
              >
                {isRunning ? 'Running Pipeline...' : 'Run Security Review'}
              </button>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste your code here or load a sample..."
              className="code-input"
              spellCheck={false}
            />
          </div>
        )}

        {activeTab === 'pipeline' && (
          <div className="pipeline-section">
            <h3>Pipeline Stages</h3>
            <div className="stages-grid">
              {stages.map((stage, index) => (
                <div key={stage.id} className={`stage-card ${stage.status}`}>
                  <div className="stage-number">{index + 1}</div>
                  <div className="stage-info">
                    <h4>{stage.name}</h4>
                    <p>{stage.description}</p>
                    <div className="stage-status">
                      <span className={`status-badge ${stage.status}`}>
                        {stage.status === 'pending' && '⏳ Pending'}
                        {stage.status === 'running' && '▶️ Running'}
                        {stage.status === 'completed' && '✅ Completed'}
                        {stage.status === 'failed' && '❌ Failed'}
                        {stage.status === 'skipped' && '⏭️ Skipped'}
                      </span>
                      {stage.duration && (
                        <span className="duration">{stage.duration}ms</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'findings' && report && (
          <div className="findings-section">
            <div className="findings-summary">
              <div className="summary-card critical">
                <h4>Critical</h4>
                <p>{report.summary.bySeverity.critical}</p>
              </div>
              <div className="summary-card high">
                <h4>High</h4>
                <p>{report.summary.bySeverity.high}</p>
              </div>
              <div className="summary-card medium">
                <h4>Medium</h4>
                <p>{report.summary.bySeverity.medium}</p>
              </div>
              <div className="summary-card low">
                <h4>Low</h4>
                <p>{report.summary.bySeverity.low}</p>
              </div>
            </div>

            <div className="findings-list">
              <h3>Vulnerabilities ({report.findings.length})</h3>
              {report.findings.map((finding) => (
                <div
                  key={finding.id}
                  className={`finding-card ${finding.severity}`}
                  onClick={() => setSelectedFinding(finding)}
                >
                  <div className="finding-header">
                    <span 
                      className="severity-badge"
                      style={{ backgroundColor: getSeverityColor(finding.severity) }}
                    >
                      {finding.severity.toUpperCase()}
                    </span>
                    <h4>{finding.title}</h4>
                  </div>
                  <div className="finding-meta">
                    <span className="location">
                      📍 {finding.location.file}:{finding.location.line}
                    </span>
                    {finding.cwe && <span className="cwe">🏷️ {finding.cwe}</span>}
                    <span className="confidence">
                      🎯 {(finding.confidence * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                  <p className="finding-description">{finding.description}</p>
                </div>
              ))}
            </div>

            {selectedFinding && (
              <div className="finding-detail" onClick={() => setSelectedFinding(null)}>
                <div className="detail-content" onClick={(e) => e.stopPropagation()}>
                  <h3>{selectedFinding.title}</h3>
                  <div className="detail-meta">
                    <span 
                      className="severity-badge"
                      style={{ backgroundColor: getSeverityColor(selectedFinding.severity) }}
                    >
                      {selectedFinding.severity.toUpperCase()}
                    </span>
                    {selectedFinding.cvss && <span>CVSS: {selectedFinding.cvss}</span>}
                    {selectedFinding.cwe && <span>{selectedFinding.cwe}</span>}
                  </div>
                  
                  <div className="detail-section">
                    <h4>Description</h4>
                    <p>{selectedFinding.description}</p>
                  </div>

                  <div className="detail-section">
                    <h4>Location</h4>
                    <pre className="code-snippet">
                      <code>{selectedFinding.location.code}</code>
                    </pre>
                    <p className="location-info">
                      {selectedFinding.location.file}:{selectedFinding.location.line}
                    </p>
                  </div>

                  <div className="detail-section">
                    <h4>Evidence</h4>
                    <p>{selectedFinding.evidence.description}</p>
                  </div>

                  <div className="detail-section">
                    <h4>Remediation</h4>
                    <p>{selectedFinding.remediation.description}</p>
                    <ol>
                      {selectedFinding.remediation.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>

                  <button onClick={() => setSelectedFinding(null)}>Close</button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'report' && report && (
          <div className="report-section">
            <h3>Security Review Report</h3>
            
            <div className="report-summary">
              <h4>Summary</h4>
              <div className="summary-stats">
                <div>Total Findings: <strong>{report.summary.totalFindings}</strong></div>
                <div>Critical Issues: <strong className="critical">{report.summary.criticalIssues}</strong></div>
                <div>Scan Duration: <strong>{(report.metadata.scanDuration / 1000).toFixed(2)}s</strong></div>
                <div>Stages Completed: <strong>{report.metadata.stagesCompleted.length}</strong></div>
              </div>
            </div>

            <div className="report-recommendations">
              <h4>Recommendations</h4>
              {report.recommendations.length === 0 ? (
                <p>No recommendations at this time.</p>
              ) : (
                report.recommendations.map((rec, i) => (
                  <div key={i} className={`recommendation-card ${rec.priority}`}>
                    <div className="rec-header">
                      <span className={`priority-badge ${rec.priority}`}>
                        {rec.priority.toUpperCase()}
                      </span>
                      <h5>{rec.title}</h5>
                    </div>
                    <p>{rec.description}</p>
                    <div className="rec-meta">
                      <span>Category: {rec.category}</span>
                      <span>Affects: {rec.affectedFindings.length} findings</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="report-metadata">
              <h4>Report Metadata</h4>
              <pre>{JSON.stringify(report.metadata, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
