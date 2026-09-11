// Knowledge Base Builder - Analyzes codebase structure and builds threat model

import { 
  KnowledgeBase, 
  ThreatModel, 
  ThreatBoundary, 
  AttackSurface, 
  TrustLevel,
  IdentifiedRisk,
  HistoricalVulnerability,
  CodePattern 
} from './types';

export class KnowledgeBaseBuilder {
  private kb: Partial<KnowledgeBase> = {};

  async buildArchitecture(codebase: Map<string, string>): Promise<string> {
    const files = Array.from(codebase.keys());
    const structure: any = {
      directories: new Set<string>(),
      entryPoints: [] as string[],
      dependencies: new Map<string, string[]>(),
      frameworks: new Set<string>(),
    };

    // Analyze file structure
    for (const file of files) {
      const content = codebase.get(file) || '';
      const dir = file.substring(0, file.lastIndexOf('/'));
      if (dir) structure.directories.add(dir);

      // Detect entry points
      if (this.isEntryPoint(file, content)) {
        structure.entryPoints.push(file);
      }

      // Detect frameworks
      this.detectFrameworks(content, structure.frameworks);

      // Extract dependencies
      const deps = this.extractDependencies(content);
      if (deps.length > 0) {
        structure.dependencies.set(file, deps);
      }
    }

    const architecture = this.generateArchitectureMarkdown(structure, files);
    this.kb.architecture = architecture;
    return architecture;
  }

  async buildThreatModel(architecture: string, codebase: Map<string, string>): Promise<ThreatModel> {
    const boundaries = this.identifyBoundaries(codebase);
    const attackSurfaces = this.identifyAttackSurfaces(codebase);
    const trustLevels = this.assessTrustLevels(codebase);
    const risks = this.identifyRisks(boundaries, attackSurfaces, codebase);

    const threatModel: ThreatModel = {
      boundaries,
      attackSurfaces,
      trustLevels,
      risks,
    };

    this.kb.threatModel = threatModel;
    return threatModel;
  }

  async extractHistoricalVulnerabilities(vcsHistory?: string[]): Promise<HistoricalVulnerability[]> {
    const vulns: HistoricalVulnerability[] = [];
    
    if (vcsHistory) {
      for (const commit of vcsHistory) {
        const vuln = this.parseVulnerabilityFromCommit(commit);
        if (vuln) vulns.push(vuln);
      }
    }

    this.kb.historicalVulns = vulns;
    return vulns;
  }

  async identifyCodePatterns(codebase: Map<string, string>): Promise<CodePattern[]> {
    const patterns: CodePattern[] = [];
    
    // Common vulnerable patterns
    const patternDetectors = [
      { name: 'SQL Queries', regex: /(?:execute|query|SELECT|INSERT|UPDATE|DELETE)/i, risk: 'SQL injection' },
      { name: 'Command Execution', regex: /(?:exec|system|popen|subprocess|shell)/i, risk: 'Command injection' },
      { name: 'File Operations', regex: /(?:open|read|write|fopen|fread|fwrite)/i, risk: 'Path traversal' },
      { name: 'Deserialization', regex: /(?:pickle|unserialize|yaml\.load|JSON\.parse)/i, risk: 'Insecure deserialization' },
      { name: 'Cryptographic Operations', regex: /(?:encrypt|decrypt|hash|MD5|SHA1|AES|RSA)/i, risk: 'Weak cryptography' },
      { name: 'Network Operations', regex: /(?:socket|connect|send|recv|http|request)/i, risk: 'SSRF' },
      { name: 'Authentication', regex: /(?:login|auth|password|token|session|jwt)/i, risk: 'Auth bypass' },
      { name: 'User Input', regex: /(?:req\.body|req\.query|req\.params|input|argv)/i, risk: 'Input validation' },
    ];

    for (const [file, content] of codebase.entries()) {
      for (const detector of patternDetectors) {
        if (detector.regex.test(content)) {
          const existing = patterns.find(p => p.name === detector.name);
          if (existing) {
            existing.files.push(file);
            if (!existing.riskIndicators.includes(detector.risk)) {
              existing.riskIndicators.push(detector.risk);
            }
          } else {
            patterns.push({
              name: detector.name,
              description: `Code patterns related to ${detector.name.toLowerCase()}`,
              files: [file],
              riskIndicators: [detector.risk],
            });
          }
        }
      }
    }

    this.kb.codePatterns = patterns;
    return patterns;
  }

  getKnowledgeBase(): KnowledgeBase {
    return {
      architecture: this.kb.architecture || '',
      threatModel: this.kb.threatModel || {
        boundaries: [],
        attackSurfaces: [],
        trustLevels: [],
        risks: [],
      },
      historicalVulns: this.kb.historicalVulns || [],
      codePatterns: this.kb.codePatterns || [],
    };
  }

  private isEntryPoint(file: string, content: string): boolean {
    const entryPointPatterns = [
      /app\.listen|server\.listen|http\.createServer/,
      /if __name__ == ['"]__main__['"]/,
      /public static void main/,
      /func main\(\)/,
      /export default|module\.exports/,
    ];
    
    return entryPointPatterns.some(pattern => pattern.test(content)) ||
           file.includes('index.') ||
           file.includes('main.') ||
           file.includes('app.');
  }

  private detectFrameworks(content: string, frameworks: Set<string>): void {
    const frameworkPatterns = [
      { name: 'Express', regex: /require\(['"]express['"]\)|from ['"]express['"]/ },
      { name: 'Django', regex: /from django\.|import django/ },
      { name: 'Flask', regex: /from flask import|import flask/ },
      { name: 'Spring', regex: /@SpringBootApplication|org\.springframework/ },
      { name: 'Rails', regex: /class.*< ApplicationController/ },
      { name: 'React', regex: /import React|from ['"]react['"]/ },
      { name: 'Vue', regex: /import.*from ['"]vue['"]/ },
    ];

    for (const fw of frameworkPatterns) {
      if (fw.regex.test(content)) {
        frameworks.add(fw.name);
      }
    }
  }

  private extractDependencies(content: string): string[] {
    const deps: string[] = [];
    
    // JavaScript/TypeScript
    const jsImports = content.match(/(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g);
    if (jsImports) deps.push(...jsImports);
    
    // Python
    const pyImports = content.match(/(?:import|from)\s+(\w+)/g);
    if (pyImports) deps.push(...pyImports);
    
    return deps;
  }

  private generateArchitectureMarkdown(structure: any, files: string[]): string {
    let md = '# Codebase Architecture\n\n';
    
    md += '## Overview\n';
    md += `- Total files: ${files.length}\n`;
    md += `- Directories: ${structure.directories.size}\n`;
    md += `- Entry points: ${structure.entryPoints.length}\n`;
    md += `- Frameworks: ${Array.from(structure.frameworks).join(', ') || 'None detected'}\n\n`;
    
    md += '## Entry Points\n';
    for (const ep of structure.entryPoints) {
      md += `- \`${ep}\`\n`;
    }
    md += '\n';
    
    md += '## Directory Structure\n';
    const dirs = Array.from(structure.directories).sort();
    for (const dir of dirs.slice(0, 20)) {
      md += `- \`${dir}/\`\n`;
    }
    if (dirs.length > 20) {
      md += `- ... and ${dirs.length - 20} more directories\n`;
    }
    
    return md;
  }

  private identifyBoundaries(codebase: Map<string, string>): ThreatBoundary[] {
    const boundaries: ThreatBoundary[] = [];
    
    // Network boundary
    const networkFiles = Array.from(codebase.entries())
      .filter(([_, content]) => /(?:socket|http|server|listen|connect)/i.test(content))
      .map(([file]) => file);
    
    if (networkFiles.length > 0) {
      boundaries.push({
        name: 'Network Boundary',
        description: 'External network interfaces and API endpoints',
        components: networkFiles,
        trustLevel: 'untrusted',
      });
    }
    
    // File system boundary
    const fileOpsFiles = Array.from(codebase.entries())
      .filter(([_, content]) => /(?:open|read|write|file|path)/i.test(content))
      .map(([file]) => file);
    
    if (fileOpsFiles.length > 0) {
      boundaries.push({
        name: 'File System Boundary',
        description: 'File system operations and storage',
        components: fileOpsFiles,
        trustLevel: 'semi-trusted',
      });
    }
    
    // Database boundary
    const dbFiles = Array.from(codebase.entries())
      .filter(([_, content]) => /(?:database|db|sql|query|mongo|redis)/i.test(content))
      .map(([file]) => file);
    
    if (dbFiles.length > 0) {
      boundaries.push({
        name: 'Data Storage Boundary',
        description: 'Database and persistent storage',
        components: dbFiles,
        trustLevel: 'trusted',
      });
    }
    
    return boundaries;
  }

  private identifyAttackSurfaces(codebase: Map<string, string>): AttackSurface[] {
    const surfaces: AttackSurface[] = [];
    
    // API endpoints
    const apiFiles = Array.from(codebase.entries())
      .filter(([_, content]) => /@(?:Get|Post|Put|Delete|Patch|app\.(get|post|put|delete))/i.test(content))
      .map(([file]) => file);
    
    if (apiFiles.length > 0) {
      surfaces.push({
        name: 'REST API',
        type: 'api',
        entryPoints: apiFiles,
        riskLevel: 'high',
      });
    }
    
    // CLI interface
    const cliFiles = Array.from(codebase.entries())
      .filter(([file]) => file.includes('cli') || file.includes('command') || file.includes('arg'))
      .map(([file]) => file);
    
    if (cliFiles.length > 0) {
      surfaces.push({
        name: 'Command Line Interface',
        type: 'cli',
        entryPoints: cliFiles,
        riskLevel: 'medium',
      });
    }
    
    // File upload/download
    const uploadFiles = Array.from(codebase.entries())
      .filter(([_, content]) => /(?:upload|download|file|multipart|form-data)/i.test(content))
      .map(([file]) => file);
    
    if (uploadFiles.length > 0) {
      surfaces.push({
        name: 'File Transfer',
        type: 'file',
        entryPoints: uploadFiles,
        riskLevel: 'high',
      });
    }
    
    return surfaces;
  }

  private assessTrustLevels(codebase: Map<string, string>): TrustLevel[] {
    const levels: TrustLevel[] = [];
    
    // Core business logic - trusted
    const coreFiles = Array.from(codebase.entries())
      .filter(([file]) => file.includes('core') || file.includes('service') || file.includes('domain'))
      .map(([file]) => file);
    
    if (coreFiles.length > 0) {
      levels.push({
        component: 'Core Business Logic',
        level: 'trusted',
        capabilities: ['Process data', 'Execute business rules'],
      });
    }
    
    // External interfaces - untrusted
    const externalFiles = Array.from(codebase.entries())
      .filter(([file]) => file.includes('api') || file.includes('controller') || file.includes('handler'))
      .map(([file]) => file);
    
    if (externalFiles.length > 0) {
      levels.push({
        component: 'External Interfaces',
        level: 'untrusted',
        capabilities: ['Receive input', 'Send output'],
      });
    }
    
    return levels;
  }

  private identifyRisks(
    boundaries: ThreatBoundary[], 
    surfaces: AttackSurface[], 
    codebase: Map<string, string>
  ): IdentifiedRisk[] {
    const risks: IdentifiedRisk[] = [];
    let riskId = 1;
    
    // Check for common vulnerabilities
    for (const [file, content] of codebase.entries()) {
      // SQL Injection
      if (/(?:execute|query).*\+.*(?:req|input|param|argv)/i.test(content)) {
        risks.push({
          id: `RISK-${riskId++}`,
          title: 'Potential SQL Injection',
          description: 'User input concatenated directly into SQL queries',
          severity: 'critical',
          likelihood: 'high',
          impact: 'high',
          cwe: 'CWE-89',
          affectedComponents: [file],
        });
      }
      
      // Command Injection
      if (/(?:exec|system|popen).*\+.*(?:req|input|param|argv)/i.test(content)) {
        risks.push({
          id: `RISK-${riskId++}`,
          title: 'Potential Command Injection',
          description: 'User input used in command execution',
          severity: 'critical',
          likelihood: 'high',
          impact: 'high',
          cwe: 'CWE-78',
          affectedComponents: [file],
        });
      }
      
      // Path Traversal
      if (/(?:open|read|write).*\+.*(?:req|input|param|path)/i.test(content)) {
        risks.push({
          id: `RISK-${riskId++}`,
          title: 'Potential Path Traversal',
          description: 'User input used in file path construction',
          severity: 'high',
          likelihood: 'medium',
          impact: 'high',
          cwe: 'CWE-22',
          affectedComponents: [file],
        });
      }
      
      // Hardcoded credentials
      if (/(?:password|secret|key|token)\s*=\s*['"][^'"]{8,}['"]/i.test(content)) {
        risks.push({
          id: `RISK-${riskId++}`,
          title: 'Hardcoded Credentials',
          description: 'Credentials found in source code',
          severity: 'high',
          likelihood: 'high',
          impact: 'high',
          cwe: 'CWE-798',
          affectedComponents: [file],
        });
      }
    }
    
    return risks;
  }

  private parseVulnerabilityFromCommit(commit: string): HistoricalVulnerability | null {
    // Parse commit message for vulnerability indicators
    const vulnPatterns = [
      /(?:fix|patch|security)\s*:\s*(?:CVE-\d{4}-\d+|XSS|SQLi|RCE|LFI|RFI)/i,
      /(?:vulnerability|security issue|bug)/i,
    ];
    
    if (vulnPatterns.some(p => p.test(commit))) {
      return {
        id: `HIST-${Date.now()}`,
        title: commit.substring(0, 100),
        cwe: 'CWE-unknown',
        severity: 'medium',
        date: new Date().toISOString(),
        pattern: commit,
      };
    }
    
    return null;
  }
}

export const kbBuilder = new KnowledgeBaseBuilder();
