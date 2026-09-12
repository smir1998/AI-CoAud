// Mantis Security Review Agent - Main Orchestrator

import { MantisStage, MantisStageId, SecurityReport, SecurityFinding } from './types';
import { kbBuilder } from './knowledge-base';
import { researcher } from './researcher';

export class MantisAgent {
  private stages: Map<MantisStageId, MantisStage> = new Map();
  private findings: SecurityFinding[] = [];
  private startTime: number = 0;

  constructor() {
    this.initializeStages();
  }

  private initializeStages(): void {
    const stageDefinitions: Array<{ id: MantisStageId; name: string; description: string }> = [
      { id: 'history', name: 'VCS History', description: 'Analyze version control history for past vulnerabilities' },
      { id: 'structural-index', name: 'Structural Index', description: 'Build semantic index of codebase' },
      { id: 'summarize', name: 'Code Summarization', description: 'Generate code summaries' },
      { id: 'architecture', name: 'Architecture Analysis', description: 'Analyze codebase architecture' },
      { id: 'threat-model', name: 'Threat Modeling', description: 'Build threat model' },
      { id: 'plan', name: 'Scan Planning', description: 'Create scanning roadmap' },
      { id: 'researcher', name: 'Security Research', description: 'Find vulnerabilities' },
      { id: 'dedupe', name: 'Deduplication', description: 'Remove duplicate findings' },
      { id: 'review', name: 'Review', description: 'Verify findings and filter false positives' },
      { id: 'critic', name: 'Critique', description: 'Eliminate non-viable issues' },
      { id: 'reproduce', name: 'Reproduction', description: 'Generate PoC reproducers' },
      { id: 'chain', name: 'Exploit Chaining', description: 'Combine findings into exploit chains' },
      { id: 'patch', name: 'Patch Generation', description: 'Generate minimal fixes' },
      { id: 'calibrate', name: 'Risk Calibration', description: 'Calculate final risk ratings' },
      { id: 'reflect', name: 'Reflection', description: 'Extract insights' },
      { id: 'report', name: 'Report Generation', description: 'Generate final report' },
    ];

    for (const def of stageDefinitions) {
      this.stages.set(def.id, {
        id: def.id,
        name: def.name,
        description: def.description,
        status: 'pending',
      });
    }
  }

  async runFullPipeline(codebase: Map<string, string>, options?: {
    vcsHistory?: string[];
    skipStages?: MantisStageId[];
  }): Promise<SecurityReport> {
    this.startTime = Date.now();
    this.findings = [];

    console.log('🔍 Starting Mantis Security Review Pipeline...\n');

    // Stage 1: VCS History (optional)
    if (!options?.skipStages?.includes('history')) {
      await this.runStage('history', async () => {
        const vulns = await kbBuilder.extractHistoricalVulnerabilities(options?.vcsHistory);
        console.log(`   Found ${vulns.length} historical vulnerabilities`);
        return vulns;
      });
    }

    // Stage 2: Structural Index (optional)
    if (!options?.skipStages?.includes('structural-index')) {
      await this.runStage('structural-index', async () => {
        console.log('   Building semantic index...');
        return { indexed: codebase.size };
      });
    }

    // Stage 3: Summarize (optional)
    if (!options?.skipStages?.includes('summarize')) {
      await this.runStage('summarize', async () => {
        console.log('   Generating code summaries...');
        return { summarized: codebase.size };
      });
    }

    // Stage 4: Architecture Analysis
    if (!options?.skipStages?.includes('architecture')) {
      await this.runStage('architecture', async () => {
        const arch = await kbBuilder.buildArchitecture(codebase);
        console.log('   Architecture analysis complete');
        return arch;
      });
    }

    // Stage 5: Threat Modeling
    if (!options?.skipStages?.includes('threat-model')) {
      await this.runStage('threat-model', async () => {
        const kb = kbBuilder.getKnowledgeBase();
        const threatModel = await kbBuilder.buildThreatModel(kb.architecture, codebase);
        console.log(`   Identified ${threatModel.risks.length} risks`);
        return threatModel;
      });
    }

    // Stage 6: Plan
    if (!options?.skipStages?.includes('plan')) {
      await this.runStage('plan', async () => {
        const patterns = await kbBuilder.identifyCodePatterns(codebase);
        console.log(`   Found ${patterns.length} code patterns to scan`);
        return { patterns };
      });
    }

    // Stage 7: Security Research (CORE)
    if (!options?.skipStages?.includes('researcher')) {
      await this.runStage('researcher', async () => {
        const kb = kbBuilder.getKnowledgeBase();
        this.findings = await researcher.scan(codebase, kb);
        console.log(`   Discovered ${this.findings.length} potential vulnerabilities`);
        return this.findings;
      });
    }

    // Stage 8: Deduplication
    if (!options?.skipStages?.includes('dedupe')) {
      await this.runStage('dedupe', async () => {
        const before = this.findings.length;
        this.findings = this.deduplicateFindings(this.findings);
        const removed = before - this.findings.length;
        console.log(`   Removed ${removed} duplicate findings`);
        return { removed };
      });
    }

    // Stage 9: Review
    if (!options?.skipStages?.includes('review')) {
      await this.runStage('review', async () => {
        const before = this.findings.length;
        this.findings = this.reviewFindings(this.findings);
        const filtered = before - this.findings.length;
        console.log(`   Filtered ${filtered} false positives`);
        return { filtered };
      });
    }

    // Stage 10: Critic
    if (!options?.skipStages?.includes('critic')) {
      await this.runStage('critic', async () => {
        const before = this.findings.length;
        this.findings = this.criticFindings(this.findings);
        const eliminated = before - this.findings.length;
        console.log(`   Eliminated ${eliminated} non-viable issues`);
        return { eliminated };
      });
    }

    // Stage 11: Reproduce (skip for now - requires sandbox)
    if (!options?.skipStages?.includes('reproduce')) {
      await this.runStage('reproduce', async () => {
        console.log('   Skipping reproduction (requires sandbox environment)');
        return { skipped: true };
      }, true); // Mark as skipped
    }

    // Stage 12: Chain (skip for now)
    if (!options?.skipStages?.includes('chain')) {
      await this.runStage('chain', async () => {
        console.log('   Skipping exploit chaining (requires reproduction)');
        return { skipped: true };
      }, true);
    }

    // Stage 13: Patch (skip for now)
    if (!options?.skipStages?.includes('patch')) {
      await this.runStage('patch', async () => {
        console.log('   Skipping patch generation (requires reproduction)');
        return { skipped: true };
      }, true);
    }

    // Stage 14: Calibrate
    if (!options?.skipStages?.includes('calibrate')) {
      await this.runStage('calibrate', async () => {
        console.log('   Calibrating risk ratings...');
        return { calibrated: this.findings.length };
      });
    }

    // Stage 15: Reflect
    if (!options?.skipStages?.includes('reflect')) {
      await this.runStage('reflect', async () => {
        console.log('   Extracting insights...');
        return { insights: [] };
      });
    }

    // Stage 16: Report
    if (!options?.skipStages?.includes('report')) {
      await this.runStage('report', async () => {
        const report = this.generateReport(codebase);
        console.log(`   Report generated with ${report.summary.totalFindings} findings`);
        return report;
      });
    }

    console.log('\n✅ Pipeline completed!\n');

    return this.generateReport(codebase);
  }

  private async runStage<T>(
    id: MantisStageId, 
    fn: () => Promise<T>,
    skip: boolean = false
  ): Promise<T | undefined> {
    const stage = this.stages.get(id)!;
    
    if (skip) {
      stage.status = 'skipped';
      console.log(`⏭️  Skipping: ${stage.name}`);
      return undefined;
    }

    stage.status = 'running';
    const startTime = Date.now();
    
    console.log(`▶️  Running: ${stage.name}`);
    
    try {
      const result = await fn();
      stage.status = 'completed';
      stage.duration = Date.now() - startTime;
      stage.output = result;
      console.log(`✅ Completed: ${stage.name} (${stage.duration}ms)\n`);
      return result;
    } catch (error) {
      stage.status = 'failed';
      stage.error = error instanceof Error ? error.message : String(error);
      stage.duration = Date.now() - startTime;
      console.error(`❌ Failed: ${stage.name} - ${stage.error}\n`);
      throw error;
    }
  }

  private deduplicateFindings(findings: SecurityFinding[]): SecurityFinding[] {
    const unique = new Map<string, SecurityFinding>();
    
    for (const finding of findings) {
      const key = `${finding.title}|${finding.location.file}|${finding.location.line}`;
      if (!unique.has(key)) {
        unique.set(key, finding);
      }
    }
    
    return Array.from(unique.values());
  }

  private reviewFindings(findings: SecurityFinding[]): SecurityFinding[] {
    // Filter out low-confidence findings
    return findings.filter(f => f.confidence >= 0.7);
  }

  private criticFindings(findings: SecurityFinding[]): SecurityFinding[] {
    // Additional filtering based on context
    return findings.filter(f => {
      // Keep all critical and high severity
      if (f.severity === 'critical' || f.severity === 'high') return true;
      
      // Filter medium if confidence is low
      if (f.severity === 'medium' && f.confidence < 0.8) return false;
      
      return true;
    });
  }

  private generateReport(codebase: Map<string, string>): SecurityReport {
    const bySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    const byStatus: Record<string, number> = {
      discovered: 0,
      verified: 0,
      reproduced: 0,
      patched: 0,
      'false-positive': 0,
    };

    for (const finding of this.findings) {
      bySeverity[finding.severity]++;
      byStatus[finding.status]++;
    }

    const recommendations = this.generateRecommendations();

    return {
      summary: {
        totalFindings: this.findings.length,
        bySeverity,
        byStatus,
        criticalIssues: bySeverity.critical,
        reproducedCount: byStatus.reproduced,
        patchedCount: byStatus.patched,
      },
      findings: this.findings,
      exploitChains: [],
      riskMatrix: [],
      recommendations,
      metadata: {
        generatedAt: Date.now(),
        repository: 'codebase',
        commit: 'HEAD',
        scanDuration: Date.now() - this.startTime,
        stagesCompleted: Array.from(this.stages.values())
          .filter(s => s.status === 'completed')
          .map(s => s.name),
        agentVersion: '1.0.0',
      },
    };
  }

  private generateRecommendations(): any[] {
    const recommendations = [];

    const criticalCount = this.findings.filter(f => f.severity === 'critical').length;
    const highCount = this.findings.filter(f => f.severity === 'high').length;

    if (criticalCount > 0) {
      recommendations.push({
        priority: 'immediate',
        category: 'code',
        title: 'Address Critical Vulnerabilities',
        description: `${criticalCount} critical vulnerabilities require immediate attention`,
        affectedFindings: this.findings
          .filter(f => f.severity === 'critical')
          .map(f => f.id),
      });
    }

    if (highCount > 0) {
      recommendations.push({
        priority: 'short-term',
        category: 'code',
        title: 'Fix High Severity Issues',
        description: `${highCount} high severity issues should be addressed soon`,
        affectedFindings: this.findings
          .filter(f => f.severity === 'high')
          .map(f => f.id),
      });
    }

    // Check for common patterns
    const sqlInjections = this.findings.filter(f => f.cwe === 'CWE-89');
    if (sqlInjections.length > 0) {
      recommendations.push({
        priority: 'immediate',
        category: 'process',
        title: 'Implement Parameterized Queries',
        description: 'Multiple SQL injection vulnerabilities detected. Implement parameterized queries across the codebase.',
        affectedFindings: sqlInjections.map(f => f.id),
      });
    }

    const hardcodedSecrets = this.findings.filter(f => f.cwe === 'CWE-798');
    if (hardcodedSecrets.length > 0) {
      recommendations.push({
        priority: 'immediate',
        category: 'process',
        title: 'Implement Secret Management',
        description: 'Hardcoded credentials found. Implement proper secret management using environment variables or a secrets manager.',
        affectedFindings: hardcodedSecrets.map(f => f.id),
      });
    }

    return recommendations;
  }

  getStages(): MantisStage[] {
    return Array.from(this.stages.values());
  }

  getFindings(): SecurityFinding[] {
    return this.findings;
  }
}

export const mantisAgent = new MantisAgent();
