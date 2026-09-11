// AI Coding Skill Agent - Core Types and Interfaces

export interface CodeAnalysis {
  language: string;
  complexity: number;
  issues: CodeIssue[];
  suggestions: CodeSuggestion[];
  metrics: CodeMetrics;
}

export interface CodeIssue {
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  rule: string;
  fix?: string;
}

export interface CodeSuggestion {
  type: 'improvement' | 'optimization' | 'best-practice' | 'security';
  message: string;
  code?: string;
  impact: 'high' | 'medium' | 'low';
}

export interface CodeMetrics {
  linesOfCode: number;
  commentRatio: number;
  functionCount: number;
  avgFunctionLength: number;
  maxNestingDepth: number;
}

export interface CodeCompletion {
  text: string;
  confidence: number;
  context: string;
}

export interface CodingTip {
  category: string;
  title: string;
  description: string;
  example?: string;
  link?: string;
}

export interface AgentResponse {
  type: 'analysis' | 'suggestion' | 'completion' | 'tip' | 'explanation';
  content: any;
  timestamp: number;
}

export type SupportedLanguage = 
  | 'javascript' 
  | 'typescript' 
  | 'python' 
  | 'java' 
  | 'cpp' 
  | 'go' 
  | 'rust'
  | 'html'
  | 'css'
  | 'sql';
