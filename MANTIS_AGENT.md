# Mantis Security Review Agent

A comprehensive, multi-stage security review agent inspired by [Google's Mantis](https://github.com/google/mantis) project. This implementation provides AI-powered vulnerability detection through a sophisticated pipeline of security analysis stages.

## 🎯 Overview

The Mantis Security Review Agent implements a 16-stage security review pipeline that analyzes code for vulnerabilities, generates proof-of-concept reproducers, and provides actionable remediation guidance.

## 🏗️ Architecture

### Pipeline Stages

The agent executes the following stages sequentially:

1. **VCS History** - Analyze version control history for past vulnerabilities
2. **Structural Index** - Build semantic index of codebase
3. **Code Summarization** - Generate code summaries
4. **Architecture Analysis** - Analyze codebase architecture and boundaries
5. **Threat Modeling** - Build comprehensive threat model
6. **Scan Planning** - Create targeted scanning roadmap
7. **Security Research** - Find vulnerabilities using pattern matching
8. **Deduplication** - Remove duplicate findings
9. **Review** - Verify findings and filter false positives
10. **Critique** - Eliminate non-viable issues
11. **Reproduction** - Generate PoC reproducers (requires sandbox)
12. **Exploit Chaining** - Combine findings into exploit chains
13. **Patch Generation** - Generate minimal fixes
14. **Risk Calibration** - Calculate final risk ratings
15. **Reflection** - Extract insights from analysis
16. **Report Generation** - Generate comprehensive security report

### Core Components

#### Knowledge Base Builder (`knowledge-base.ts`)
- Analyzes codebase structure and architecture
- Identifies threat boundaries and attack surfaces
- Assesses trust levels across components
- Identifies historical vulnerabilities
- Detects vulnerable code patterns

#### Security Researcher (`researcher.ts`)
- Implements 14+ vulnerability detectors:
  - SQL Injection (CWE-89)
  - Command Injection (CWE-78)
  - Path Traversal (CWE-22)
  - Cross-Site Scripting (CWE-79)
  - Insecure Deserialization (CWE-502)
  - Hardcoded Credentials (CWE-798)
  - Weak Cryptography (CWE-327)
  - Server-Side Request Forgery (CWE-918)
  - Authentication Bypass (CWE-287)
  - Insecure Direct Object Reference (CWE-639)
  - CSRF (CWE-352)
  - Open Redirect (CWE-601)
  - Memory Safety Issues (CWE-120)
  - Race Conditions (CWE-362)

#### Main Agent (`agent.ts`)
- Orchestrates the 16-stage pipeline
- Manages stage execution and status tracking
- Handles deduplication and false positive filtering
- Generates comprehensive security reports
- Provides actionable recommendations

## 🚀 Usage

### Basic Usage

```typescript
import { mantisAgent } from './agents/mantis';

// Create a codebase map
const codebase = new Map<string, string>();
codebase.set('app.py', '... your code ...');

// Run the full pipeline
const report = await mantisAgent.runFullPipeline(codebase);

console.log(`Found ${report.summary.totalFindings} vulnerabilities`);
console.log(`Critical: ${report.summary.criticalIssues}`);
```

### React Component

```tsx
import { MantisSecurityReview } from './components/MantisSecurityReview';

function App() {
  return <MantisSecurityReview />;
}
```

### Skip Optional Stages

```typescript
const report = await mantisAgent.runFullPipeline(codebase, {
  skipStages: ['history', 'structural-index', 'summarize']
});
```

### Provide VCS History

```typescript
const report = await mantisAgent.runFullPipeline(codebase, {
  vcsHistory: [
    'fix: SQL injection vulnerability in login',
    'security: patch XSS in user input',
  ]
});
```

## 📊 Report Structure

The security report includes:

```typescript
interface SecurityReport {
  summary: {
    totalFindings: number;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    criticalIssues: number;
    reproducedCount: number;
    patchedCount: number;
  };
  findings: SecurityFinding[];
  exploitChains: ExploitChain[];
  riskMatrix: RiskRating[];
  recommendations: Recommendation[];
  metadata: ReportMetadata;
}
```

## 🔍 Vulnerability Detection

Each finding includes:

- **Title**: Clear vulnerability name
- **Description**: Detailed explanation
- **Severity**: critical, high, medium, low, info
- **Confidence**: 0.0 - 1.0 confidence score
- **CWE**: Common Weakness Enumeration ID
- **CVSS**: Common Vulnerability Scoring System score
- **Location**: File, line, function, code snippet
- **Evidence**: Static/dynamic evidence
- **Remediation**: Step-by-step fix instructions

## 🎨 UI Features

The React component provides:

- **Code Input**: Paste code or load samples
- **Pipeline View**: Real-time stage execution status
- **Findings View**: Interactive vulnerability list with filtering
- **Report View**: Comprehensive security report
- **Finding Details**: Modal with full vulnerability details
- **Severity Summary**: Visual breakdown by severity
- **Recommendations**: Prioritized action items

## 🛡️ Security Features

### Threat Modeling
- Identifies network, file system, and data storage boundaries
- Maps attack surfaces (API, CLI, file transfer)
- Assesses trust levels across components
- Identifies potential risks

### Deduplication
- Removes duplicate findings based on title, file, and line
- Prevents redundant vulnerability reports

### False Positive Filtering
- Filters findings by confidence threshold
- Critic stage eliminates non-viable issues
- Context-aware validation

### Risk Calibration
- CVSS scoring for standardized risk assessment
- Business impact analysis
- Exploitability assessment
- Final risk rating

## 📈 Comparison with Google's Mantis

This implementation is inspired by Google's Mantis but is a standalone TypeScript/React implementation:

| Feature | Google Mantis | This Implementation |
|---------|--------------|---------------------|
| Language | Python | TypeScript |
| Framework | ADK/Antigravity | React |
| Stages | 16 | 16 |
| Sandbox | Docker/gVisor/GCE | Planned |
| VCS Integration | Full | Basic |
| UI | CLI | Web UI |
| Real-time | Yes | Yes |

## 🔧 Configuration

### Environment Variables

```env
VITE_AI_API_KEY=your_api_key_here  # For future AI integration
```

### Customization

You can extend the agent by:

1. **Adding new detectors** in `researcher.ts`
2. **Customizing threat models** in `knowledge-base.ts`
3. **Modifying pipeline stages** in `agent.ts`
4. **Extending report format** in types

## 🧪 Testing

```bash
# Run the development server
npm run dev

# Build for production
npm run build

# Type checking
npm run typecheck
```

## 📚 API Reference

### MantisAgent

```typescript
class MantisAgent {
  runFullPipeline(
    codebase: Map<string, string>,
    options?: {
      vcsHistory?: string[];
      skipStages?: MantisStageId[];
    }
  ): Promise<SecurityReport>;
  
  getStages(): MantisStage[];
  getFindings(): SecurityFinding[];
}
```

### KnowledgeBaseBuilder

```typescript
class KnowledgeBaseBuilder {
  buildArchitecture(codebase: Map<string, string>): Promise<string>;
  buildThreatModel(architecture: string, codebase: Map<string, string>): Promise<ThreatModel>;
  extractHistoricalVulnerabilities(vcsHistory?: string[]): Promise<HistoricalVulnerability[]>;
  identifyCodePatterns(codebase: Map<string, string>): Promise<CodePattern[]>;
  getKnowledgeBase(): KnowledgeBase;
}
```

### SecurityResearcher

```typescript
class SecurityResearcher {
  scan(codebase: Map<string, string>, knowledgeBase: KnowledgeBase): Promise<SecurityFinding[]>;
  getFindings(): SecurityFinding[];
}
```

## 🚧 Current Limitations

1. **No Sandbox Execution**: Reproduction stage requires sandbox environment (not yet implemented)
2. **No Exploit Chaining**: Chain stage requires reproduction results
3. **No Patch Generation**: Patch stage requires reproduction results
4. **Static Analysis Only**: Currently uses pattern matching, not dynamic analysis
5. **No VCS Integration**: Historical analysis requires manual input

## 🔮 Future Enhancements

- [ ] Sandbox integration for PoC reproduction
- [ ] Dynamic analysis capabilities
- [ ] Exploit chain generation
- [ ] Automated patch generation
- [ ] Git integration for VCS history
- [ ] AI-powered vulnerability explanation
- [ ] Custom rule definitions
- [ ] Multi-language support expansion
- [ ] Continuous monitoring mode
- [ ] Integration with CI/CD pipelines

## 📄 License

MIT

## 🙏 Acknowledgments

Inspired by [Google's Mantis](https://github.com/google/mantis) project - a modular, stack-agnostic toolkit of security review skills for AI coding agents.

## 📖 References

- [Google Mantis](https://github.com/google/mantis)
- [CWE - Common Weakness Enumeration](https://cwe.mitre.org/)
- [CVSS - Common Vulnerability Scoring System](https://www.first.org/cvss/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

Built with ❤️ using React, TypeScript, and security best practices
