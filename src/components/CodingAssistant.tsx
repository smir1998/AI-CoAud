import React, { useState, useEffect } from 'react';
import { codingAgent } from '../agents/coding-agent';
import { CodeAnalysis, SupportedLanguage } from '../agents/types';

export const CodingAssistant: React.FC = () => {
  const [code, setCode] = useState<string>('');
  const [language, setLanguage] = useState<SupportedLanguage>('typescript');
  const [analysis, setAnalysis] = useState<CodeAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'code' | 'analysis' | 'tips'>('code');
  const [tips, setTips] = useState<any[]>([]);

  useEffect(() => {
    codingAgent.setLanguage(language);
  }, [language]);

  const handleAnalyze = async () => {
    if (!code.trim()) return;
    
    setIsAnalyzing(true);
    try {
      const response = await codingAgent.analyzeCode(code);
      setAnalysis(response.content);
      setActiveTab('analysis');
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGetTips = async () => {
    try {
      const response = await codingAgent.getTips();
      setTips(response.content);
      setActiveTab('tips');
    } catch (error) {
      console.error('Failed to get tips:', error);
    }
  };

  const handleComplete = async () => {
    if (!code.trim()) return;
    
    try {
      const response = await codingAgent.completeCode(code);
      setCode(code + '\n' + response.content.text);
    } catch (error) {
      console.error('Completion failed:', error);
    }
  };

  return (
    <div className="coding-assistant">
      <div className="assistant-header">
        <h2>AI Coding Assistant</h2>
        <select 
          value={language} 
          onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
          className="language-selector"
        >
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="python">Python</option>
          <option value="java">Java</option>
          <option value="cpp">C++</option>
          <option value="go">Go</option>
          <option value="rust">Rust</option>
        </select>
      </div>

      <div className="assistant-tabs">
        <button 
          className={activeTab === 'code' ? 'active' : ''}
          onClick={() => setActiveTab('code')}
        >
          Code Editor
        </button>
        <button 
          className={activeTab === 'analysis' ? 'active' : ''}
          onClick={() => setActiveTab('analysis')}
          disabled={!analysis}
        >
          Analysis
        </button>
        <button 
          className={activeTab === 'tips' ? 'active' : ''}
          onClick={handleGetTips}
        >
          Tips
        </button>
      </div>

      <div className="assistant-content">
        {activeTab === 'code' && (
          <div className="code-editor-section">
            <div className="editor-actions">
              <button onClick={handleAnalyze} disabled={isAnalyzing || !code.trim()}>
                {isAnalyzing ? 'Analyzing...' : 'Analyze Code'}
              </button>
              <button onClick={handleComplete} disabled={!code.trim()}>
                Complete Code
              </button>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste or write your code here..."
              className="code-input"
              spellCheck={false}
            />
          </div>
        )}

        {activeTab === 'analysis' && analysis && (
          <div className="analysis-section">
            <div className="metrics-grid">
              <div className="metric-card">
                <h4>Lines of Code</h4>
                <p>{analysis.metrics.linesOfCode}</p>
              </div>
              <div className="metric-card">
                <h4>Functions</h4>
                <p>{analysis.metrics.functionCount}</p>
              </div>
              <div className="metric-card">
                <h4>Complexity</h4>
                <p>{analysis.complexity}</p>
              </div>
              <div className="metric-card">
                <h4>Issues</h4>
                <p>{analysis.issues.length}</p>
              </div>
            </div>

            {analysis.issues.length > 0 && (
              <div className="issues-section">
                <h3>Issues Found</h3>
                {analysis.issues.map((issue, index) => (
                  <div key={index} className={`issue-item ${issue.severity}`}>
                    <span className="issue-line">Line {issue.line}</span>
                    <span className="issue-message">{issue.message}</span>
                    {issue.fix && <span className="issue-fix">Fix: {issue.fix}</span>}
                  </div>
                ))}
              </div>
            )}

            {analysis.suggestions.length > 0 && (
              <div className="suggestions-section">
                <h3>Suggestions</h3>
                {analysis.suggestions.map((suggestion, index) => (
                  <div key={index} className={`suggestion-item ${suggestion.impact}`}>
                    <span className="suggestion-type">{suggestion.type}</span>
                    <p>{suggestion.message}</p>
                    {suggestion.code && (
                      <pre className="suggestion-code">{suggestion.code}</pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'tips' && (
          <div className="tips-section">
            {tips.length === 0 ? (
              <p className="no-tips">Click "Tips" to load coding tips for {language}</p>
            ) : (
              tips.map((tip, index) => (
                <div key={index} className="tip-card">
                  <div className="tip-header">
                    <span className="tip-category">{tip.category}</span>
                    <h4>{tip.title}</h4>
                  </div>
                  <p>{tip.description}</p>
                  {tip.example && (
                    <pre className="tip-example">{tip.example}</pre>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
