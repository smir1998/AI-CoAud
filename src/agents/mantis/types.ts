// Mantis-Inspired Security Review Agent Types

export interface MantisStage {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output?: any;
  error?: string;
  duration?: number;
}

export interface KnowledgeBase {
  architecture: string;
  threatModel: ThreatModel;
  historicalVulns: HistoricalVulnerability[];
  codePatterns: CodePattern[];
}

export interface ThreatModel {
  boundaries: ThreatBoundary[];
  attackSurfaces: AttackSurface[];
  trustLevels: TrustLevel[];
  risks: IdentifiedRisk[];
}

export interface ThreatBoundary {
  name: string;
  description: string;
  components: string[];
  trustLevel: 'trusted' | 'semi-trusted' | 'untrusted';
}

export interface AttackSurface {
  name: string;
  type: 'network' | 'file' | 'api' | 'cli' | 'ui';
  entryPoints: string[];
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
}

export interface TrustLevel {
  component: string;
  level: 'trusted' | 'semi-trusted' | 'untrusted';
  capabilities: string[];
}

export interface IdentifiedRisk {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  likelihood: 'high' | 'medium' | 'low';
  impact: 'high' | 'medium' | 'low';
  cwe?: string;
  affectedComponents: string[];
}

export interface HistoricalVulnerability {
  id: string;
  title: string;
  cwe: string;
  severity: string;
  date: string;
  fixCommit?: string;
  pattern: string;
}

export interface CodePattern {
  name: string;
  description: string;
  files: string[];
  riskIndicators: string[];
}

export interface SecurityFinding {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: number;
  cwe?: string;
  cvss?: number;
  location: FindingLocation;
  evidence: FindingEvidence;
  remediation: Remediation;
  status: 'discovered' | 'verified' | 'reproduced' | 'patched' | 'false-positive';
  reproduced?: boolean;
  patch?: Patch;
}

export interface FindingLocation {
  file: string;
  line: number;
  column?: number;
  function?: string;
  code: string;
}

export interface FindingEvidence {
  type: 'static' | 'dynamic' | 'manual';
  description: string;
  proof?: string;
  reproducer?: string;
}

export interface Remediation {
  description: string;
  steps: string[];
  references?: string[];
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface Patch {
  file: string;
  original: string;
  fixed: string;
  description: string;
  verified: boolean;
}

export interface ReproductionResult {
  success: boolean;
  crashType?: 'segfault' | 'exception' | 'timeout' | 'memory-leak' | 'data-corruption';
  output?: string;
  error?: string;
  sandbox: 'docker' | 'gvisor' | 'vm';
  duration: number;
}

export interface ExploitChain {
  id: string;
  name: string;
  description: string;
  steps: ExploitStep[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  cvss: number;
}

export interface ExploitStep {
  findingId: string;
  action: string;
  expected: string;
  actual?: string;
}

export interface RiskRating {
  finding: SecurityFinding;
  cvss: number;
  epss: number;
  businessImpact: 'critical' | 'high' | 'medium' | 'low';
  exploitability: 'high' | 'medium' | 'low';
  finalRisk: 'critical' | 'high' | 'medium' | 'low';
}

export interface SecurityReport {
  summary: ReportSummary;
  findings: SecurityFinding[];
  exploitChains: ExploitChain[];
  riskMatrix: RiskRating[];
  recommendations: Recommendation[];
  metadata: ReportMetadata;
}

export interface ReportSummary {
  totalFindings: number;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  criticalIssues: number;
  reproducedCount: number;
  patchedCount: number;
}

export interface Recommendation {
  priority: 'immediate' | 'short-term' | 'long-term';
  category: 'architecture' | 'code' | 'process' | 'monitoring';
  title: string;
  description: string;
  affectedFindings: string[];
}

export interface ReportMetadata {
  generatedAt: number;
  repository: string;
  commit: string;
  scanDuration: number;
  stagesCompleted: string[];
  agentVersion: string;
}

export type MantisStageId = 
  | 'history'
  | 'structural-index'
  | 'summarize'
  | 'architecture'
  | 'threat-model'
  | 'plan'
  | 'researcher'
  | 'dedupe'
  | 'review'
  | 'critic'
  | 'reproduce'
  | 'chain'
  | 'patch'
  | 'calibrate'
  | 'reflect'
  | 'report';
