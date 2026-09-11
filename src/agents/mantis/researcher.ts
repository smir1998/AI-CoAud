// Security Researcher - Finds vulnerabilities using knowledge base context

import { 
  SecurityFinding, 
  FindingLocation, 
  FindingEvidence, 
  Remediation,
  KnowledgeBase 
} from './types';

export class SecurityResearcher {
  private findings: SecurityFinding[] = [];
  private findingIdCounter = 1;

  async scan(
    codebase: Map<string, string>, 
    knowledgeBase: KnowledgeBase
  ): Promise<SecurityFinding[]> {
    this.findings = [];
    
    // Scan each file for vulnerabilities
    for (const [file, content] of codebase.entries()) {
      await this.scanFile(file, content, knowledgeBase);
    }
    
    return this.findings;
  }

  private async scanFile(
    file: string, 
    content: string, 
    kb: KnowledgeBase
  ): Promise<void> {
    const lines = content.split('\n');
    
    // Run all vulnerability detectors
    await this.detectSQLInjection(file, lines, content);
    await this.detectCommandInjection(file, lines, content);
    await this.detectPathTraversal(file, lines, content);
    await this.detectXSS(file, lines, content);
    await this.detectInsecureDeserialization(file, lines, content);
    await this.detectHardcodedSecrets(file, lines, content);
    await this.detectWeakCrypto(file, lines, content);
    await this.detectSSRF(file, lines, content);
    await this.detectAuthBypass(file, lines, content);
    await this.detectIDOR(file, lines, content);
    await this.detectCSRF(file, lines, content);
    await this.detectOpenRedirect(file, lines, content);
    await this.detectMemoryIssues(file, lines, content);
    await this.detectRaceConditions(file, lines, content);
  }

  private async detectSQLInjection(file: string, lines: string[], content: string): Promise<void> {
    // Pattern 1: String concatenation in SQL queries
    const sqlConcatPattern = /(?:execute|query|raw)\s*\(\s*["'](?:SELECT|INSERT|UPDATE|DELETE)[^"']*["']\s*\+\s*(\w+)/gi;
    let match;
    
    while ((match = sqlConcatPattern.exec(content)) !== null) {
      const lineNum = this.getLineNumber(content, match.index);
      this.addFinding({
        title: 'SQL Injection via String Concatenation',
        description: 'User input is concatenated directly into SQL query, allowing SQL injection attacks',
        severity: 'critical',
        confidence: 0.95,
        cwe: 'CWE-89',
        cvss: 9.8,
        location: {
          file,
          line: lineNum,
          code: lines[lineNum - 1],
        },
        evidence: {
          type: 'static',
          description: `Variable '${match[1]}' concatenated into SQL query`,
        },
        remediation: {
          description: 'Use parameterized queries or prepared statements',
          steps: [
            'Replace string concatenation with parameterized query',
            'Use database driver\'s parameter binding feature',
            'Validate and sanitize all user inputs',
          ],
          difficulty: 'easy',
        },
        status: 'discovered',
      });
    }
    
    // Pattern 2: f-string/format in SQL
    const sqlFormatPattern = /(?:execute|query)\s*\(\s*f?["'](?:SELECT|INSERT|UPDATE|DELETE)[^"']*\{[^}]+\}/gi;
    while ((match = sqlFormatPattern.exec(content)) !== null) {
      const lineNum = this.getLineNumber(content, match.index);
      this.addFinding({
        title: 'SQL Injection via String Formatting',
        description: 'SQL query uses string formatting with user-controlled variables',
        severity: 'critical',
        confidence: 0.9,
        cwe: 'CWE-89',
        cvss: 9.8,
        location: {
          file,
          line: lineNum,
          code: lines[lineNum - 1],
        },
        evidence: {
          type: 'static',
          description: 'String formatting used in SQL query',
        },
        remediation: {
          description: 'Use parameterized queries instead of string formatting',
          steps: [
            'Use parameterized queries with placeholders',
            'Pass user input as separate parameters',
            'Never use string interpolation in SQL',
          ],
          difficulty: 'easy',
        },
        status: 'discovered',
      });
    }
  }

  private async detectCommandInjection(file: string, lines: string[], content: string): Promise<void> {
    const patterns = [
      /(?:exec|system|popen|subprocess\.call|subprocess\.run)\s*\(\s*["'][^"']*["']\s*\+\s*(\w+)/gi,
      /(?:exec|system|popen)\s*\(\s*f["'][^"']*\{[^}]+\}/gi,
      /os\.system\s*\(\s*["'][^"']*["']\s*%\s*(\w+)/gi,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = this.getLineNumber(content, match.index);
        this.addFinding({
          title: 'Command Injection',
          description: 'User input used in command execution, allowing arbitrary command execution',
          severity: 'critical',
          confidence: 0.95,
          cwe: 'CWE-78',
          cvss: 9.8,
          location: {
            file,
            line: lineNum,
            code: lines[lineNum - 1],
          },
          evidence: {
            type: 'static',
            description: 'User input concatenated into command',
          },
          remediation: {
            description: 'Use allowlists and avoid shell=True',
            steps: [
              'Avoid using user input in commands',
              'Use allowlist of permitted commands',
              'Never use shell=True with user input',
              'Use subprocess with array arguments',
            ],
            difficulty: 'medium',
          },
          status: 'discovered',
        });
      }
    }
  }

  private async detectPathTraversal(file: string, lines: string[], content: string): Promise<void> {
    const patterns = [
      /(?:open|read|write|fopen)\s*\(\s*["'][^"']*["']\s*\+\s*(\w+)/gi,
      /(?:open|read|write)\s*\(\s*f["'][^"']*\{[^}]+\}/gi,
      /os\.path\.join\s*\(\s*[^,]+,\s*(?:req|input|param|argv)/gi,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = this.getLineNumber(content, match.index);
        this.addFinding({
          title: 'Path Traversal',
          description: 'User input used in file path construction, allowing directory traversal',
          severity: 'high',
          confidence: 0.85,
          cwe: 'CWE-22',
          cvss: 7.5,
          location: {
            file,
            line: lineNum,
            code: lines[lineNum - 1],
          },
          evidence: {
            type: 'static',
            description: 'User input used in file path',
          },
          remediation: {
            description: 'Validate and sanitize file paths',
            steps: [
              'Use os.path.basename() to extract filename',
              'Validate path is within allowed directory',
              'Use realpath() to resolve symlinks',
              'Reject paths containing .. or /',
            ],
            difficulty: 'easy',
          },
          status: 'discovered',
        });
      }
    }
  }

  private async detectXSS(file: string, lines: string[], content: string): Promise<void> {
    const patterns = [
      /innerHTML\s*=\s*(?:req|input|param|data)/gi,
      /document\.write\s*\(\s*(?:req|input|param|data)/gi,
      /(?:res\.send|response\.write)\s*\(\s*(?:req|input|param|data)/gi,
      /\{\{[^}]*\|safe\}\}/gi,  // Django/Jinja2 safe filter
      /v-html\s*=\s*["'][^"']*["']/gi,  // Vue v-html
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = this.getLineNumber(content, match.index);
        this.addFinding({
          title: 'Cross-Site Scripting (XSS)',
          description: 'User input rendered without proper escaping, allowing XSS attacks',
          severity: 'high',
          confidence: 0.8,
          cwe: 'CWE-79',
          cvss: 6.1,
          location: {
            file,
            line: lineNum,
            code: lines[lineNum - 1],
          },
          evidence: {
            type: 'static',
            description: 'User input rendered without escaping',
          },
          remediation: {
            description: 'Escape all user input before rendering',
            steps: [
              'Use framework\'s auto-escaping features',
              'Escape HTML entities before rendering',
              'Use Content-Security-Policy headers',
              'Validate input on server side',
            ],
            difficulty: 'easy',
          },
          status: 'discovered',
        });
      }
    }
  }

  private async detectInsecureDeserialization(file: string, lines: string[], content: string): Promise<void> {
    const patterns = [
      /pickle\.loads?\s*\(\s*(?:req|input|data|file)/gi,
      /yaml\.load\s*\(\s*(?:req|input|data|file)(?!.*Loader=.*SafeLoader)/gi,
      /unserialize\s*\(\s*\$_(?:GET|POST|REQUEST|COOKIE)/gi,
      /JSON\.parse\s*\(\s*(?:req|input|data)/gi,
      /eval\s*\(\s*(?:req|input|data|JSON\.parse)/gi,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = this.getLineNumber(content, match.index);
        this.addFinding({
          title: 'Insecure Deserialization',
          description: 'Untrusted data deserialized, allowing remote code execution',
          severity: 'critical',
          confidence: 0.9,
          cwe: 'CWE-502',
          cvss: 9.8,
          location: {
            file,
            line: lineNum,
            code: lines[lineNum - 1],
          },
          evidence: {
            type: 'static',
            description: 'Untrusted data deserialized',
          },
          remediation: {
            description: 'Use safe deserialization methods',
            steps: [
              'Avoid deserializing untrusted data',
              'Use JSON instead of pickle/yaml when possible',
              'Use SafeLoader for YAML',
              'Validate data structure after deserialization',
            ],
            difficulty: 'medium',
          },
          status: 'discovered',
        });
      }
    }
  }

  private async detectHardcodedSecrets(file: string, lines: string[], content: string): Promise<void> {
    const patterns = [
      /(?:password|passwd|pwd)\s*=\s*["'][^"']{8,}["']/gi,
      /(?:api[_-]?key|apikey)\s*=\s*["'][^"']{16,}["']/gi,
      /(?:secret|token)\s*=\s*["'][^"']{16,}["']/gi,
      /AKIA[0-9A-Z]{16}/g,  // AWS Access Key
      /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = this.getLineNumber(content, match.index);
        this.addFinding({
          title: 'Hardcoded Credentials',
          description: 'Sensitive credentials found in source code',
          severity: 'high',
          confidence: 0.95,
          cwe: 'CWE-798',
          cvss: 7.5,
          location: {
            file,
            line: lineNum,
            code: lines[lineNum - 1],
          },
          evidence: {
            type: 'static',
            description: 'Hardcoded credential detected',
          },
          remediation: {
            description: 'Use environment variables or secret management',
            steps: [
              'Move credentials to environment variables',
              'Use secret management service (AWS Secrets Manager, etc.)',
              'Use .env files (not committed to git)',
              'Rotate exposed credentials immediately',
            ],
            difficulty: 'easy',
          },
          status: 'discovered',
        });
      }
    }
  }

  private async detectWeakCrypto(file: string, lines: string[], content: string): Promise<void> {
    const patterns = [
      /MD5\s*\(/gi,
      /SHA1\s*\(/gi,
      /hashlib\.md5/gi,
      /hashlib\.sha1/gi,
      /DES\s*\(/gi,
      /RC4\s*\(/gi,
      /ECB/gi,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = this.getLineNumber(content, match.index);
        this.addFinding({
          title: 'Weak Cryptographic Algorithm',
          description: 'Use of deprecated or weak cryptographic algorithm',
          severity: 'medium',
          confidence: 0.85,
          cwe: 'CWE-327',
          cvss: 5.3,
          location: {
            file,
            line: lineNum,
            code: lines[lineNum - 1],
          },
          evidence: {
            type: 'static',
            description: 'Weak crypto algorithm detected',
          },
          remediation: {
            description: 'Use modern cryptographic algorithms',
            steps: [
              'Replace MD5/SHA1 with SHA-256 or SHA-3',
              'Replace DES/RC4 with AES-256',
              'Use CBC or GCM mode instead of ECB',
              'Use established crypto libraries',
            ],
            difficulty: 'medium',
          },
          status: 'discovered',
        });
      }
    }
  }

  private async detectSSRF(file: string, lines: string[], content: string): Promise<void> {
    const patterns = [
      /(?:requests\.get|requests\.post|fetch|axios)\s*\(\s*(?:req|input|param|url)/gi,
      /urllib\.request\.urlopen\s*\(\s*(?:req|input|param|url)/gi,
      /http\.get\s*\(\s*(?:req|input|param|url)/gi,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = this.getLineNumber(content, match.index);
        this.addFinding({
          title: 'Server-Side Request Forgery (SSRF)',
          description: 'User input used in server-side HTTP request, allowing SSRF attacks',
          severity: 'high',
          confidence: 0.8,
          cwe: 'CWE-918',
          cvss: 7.5,
          location: {
            file,
            line: lineNum,
            code: lines[lineNum - 1],
          },
          evidence: {
            type: 'static',
            description: 'User input used in HTTP request',
          },
          remediation: {
            description: 'Validate and restrict URLs',
            steps: [
              'Validate URL scheme (http/https only)',
              'Block internal IP ranges (127.0.0.0/8, 10.0.0.0/8, etc.)',
              'Use allowlist of permitted domains',
              'Disable redirects or validate redirect targets',
            ],
            difficulty: 'medium',
          },
          status: 'discovered',
        });
      }
    }
  }

  private async detectAuthBypass(file: string, lines: string[], content: string): Promise<void> {
    const patterns = [
      /if\s*\(\s*(?:req\.user|currentUser|isAuthenticated)\s*\)\s*\{[\s\S]*?return/gi,
      /@(?:login_required|authenticated|requires_auth)/gi,
      /jwt\.decode\s*\([^)]*\)\s*(?!.*verify)/gi,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = this.getLineNumber(content, match.index);
        this.addFinding({
          title: 'Potential Authentication Bypass',
          description: 'Authentication check may be bypassed or incomplete',
          severity: 'high',
          confidence: 0.7,
          cwe: 'CWE-287',
          cvss: 7.5,
          location: {
            file,
            line: lineNum,
            code: lines[lineNum - 1],
          },
          evidence: {
            type: 'static',
            description: 'Incomplete authentication check',
          },
          remediation: {
            description: 'Implement proper authentication checks',
            steps: [
              'Verify JWT signature and expiration',
              'Check user permissions on every request',
              'Use middleware for authentication',
              'Implement proper session management',
            ],
            difficulty: 'medium',
          },
          status: 'discovered',
        });
      }
    }
  }

  private async detectIDOR(file: string, lines: string[], content: string): Promise<void> {
    const patterns = [
      /\/(?:user|account|profile)\/(\w+)\/(?:edit|delete|update)/gi,
      /SELECT.*WHERE\s+(?:id|user_id)\s*=\s*(?:req|input|param)/gi,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = this.getLineNumber(content, match.index);
        this.addFinding({
          title: 'Insecure Direct Object Reference (IDOR)',
          description: 'Direct access to objects via user-controlled identifiers without authorization check',
          severity: 'high',
          confidence: 0.75,
          cwe: 'CWE-639',
          cvss: 7.5,
          location: {
            file,
            line: lineNum,
            code: lines[lineNum - 1],
          },
          evidence: {
            type: 'static',
            description: 'Direct object reference without authz',
          },
          remediation: {
            description: 'Implement proper authorization checks',
            steps: [
              'Verify user owns the requested resource',
              'Use indirect references (UUIDs, tokens)',
              'Implement role-based access control',
              'Log all access attempts',
            ],
            difficulty: 'medium',
          },
          status: 'discovered',
        });
      }
    }
  }

  private async detectCSRF(file: string, lines: string[], content: string): Promise<void> {
    // Check for state-changing operations without CSRF protection
    if (/(?:POST|PUT|DELETE|PATCH)/i.test(content) && 
        !/csrf|CsrfViewMiddleware|@csrf_protect/i.test(content)) {
      this.addFinding({
        title: 'Missing CSRF Protection',
        description: 'State-changing operations without CSRF token validation',
        severity: 'medium',
        confidence: 0.6,
        cwe: 'CWE-352',
        cvss: 5.4,
        location: {
          file,
          line: 1,
          code: lines[0],
        },
        evidence: {
          type: 'static',
          description: 'No CSRF protection detected',
        },
        remediation: {
          description: 'Implement CSRF protection',
          steps: [
            'Use framework\'s CSRF middleware',
            'Include CSRF tokens in forms',
            'Validate tokens on state-changing requests',
            'Use SameSite cookie attribute',
          ],
          difficulty: 'easy',
        },
        status: 'discovered',
      });
    }
  }

  private async detectOpenRedirect(file: string, lines: string[], content: string): Promise<void> {
    const patterns = [
      /redirect\s*\(\s*(?:req|input|param|url)/gi,
      /res\.redirect\s*\(\s*(?:req|input|param|url)/gi,
      /Location:\s*(?:req|input|param|url)/gi,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = this.getLineNumber(content, match.index);
        this.addFinding({
          title: 'Open Redirect',
          description: 'User input used in redirect, allowing phishing attacks',
          severity: 'medium',
          confidence: 0.8,
          cwe: 'CWE-601',
          cvss: 5.4,
          location: {
            file,
            line: lineNum,
            code: lines[lineNum - 1],
          },
          evidence: {
            type: 'static',
            description: 'User input used in redirect',
          },
          remediation: {
            description: 'Validate redirect URLs',
            steps: [
              'Use allowlist of permitted redirect URLs',
              'Validate URL is relative or same-domain',
              'Reject URLs with different scheme/host',
              'Use indirect references',
            ],
            difficulty: 'easy',
          },
          status: 'discovered',
        });
      }
    }
  }

  private async detectMemoryIssues(file: string, lines: string[], content: string): Promise<void> {
    // C/C++ specific patterns
    if (file.endsWith('.c') || file.endsWith('.cpp') || file.endsWith('.h')) {
      const patterns = [
        /strcpy\s*\(/gi,
        /strcat\s*\(/gi,
        /gets\s*\(/gi,
        /malloc\s*\([^)]*\)\s*(?!.*free)/gi,
      ];
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const lineNum = this.getLineNumber(content, match.index);
          this.addFinding({
            title: 'Memory Safety Issue',
            description: 'Unsafe memory operation detected',
            severity: 'high',
            confidence: 0.85,
            cwe: 'CWE-120',
            cvss: 7.5,
            location: {
              file,
              line: lineNum,
              code: lines[lineNum - 1],
            },
            evidence: {
              type: 'static',
              description: 'Unsafe memory operation',
            },
            remediation: {
              description: 'Use safe memory operations',
              steps: [
                'Use strncpy instead of strcpy',
                'Use strncat instead of strcat',
                'Use fgets instead of gets',
                'Always free allocated memory',
                'Use RAII in C++',
              ],
              difficulty: 'medium',
            },
            status: 'discovered',
          });
        }
      }
    }
  }

  private async detectRaceConditions(file: string, lines: string[], content: string): Promise<void> {
    // Check for shared state without synchronization
    if (/(?:global|static|class.*variable)/i.test(content) && 
        !/(?:lock|mutex|synchronized|atomic)/i.test(content)) {
      this.addFinding({
        title: 'Potential Race Condition',
        description: 'Shared state accessed without synchronization',
        severity: 'medium',
        confidence: 0.6,
        cwe: 'CWE-362',
        cvss: 5.9,
        location: {
          file,
          line: 1,
          code: lines[0],
        },
        evidence: {
          type: 'static',
          description: 'Shared state without synchronization',
        },
        remediation: {
          description: 'Implement proper synchronization',
          steps: [
            'Use locks/mutexes for shared state',
            'Use atomic operations',
            'Use thread-local storage',
            'Minimize shared state',
          ],
          difficulty: 'hard',
        },
        status: 'discovered',
      });
    }
  }

  private addFinding(finding: Omit<SecurityFinding, 'id'>): void {
    this.findings.push({
      ...finding,
      id: `FIND-${this.findingIdCounter++}`,
    });
  }

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  getFindings(): SecurityFinding[] {
    return this.findings;
  }
}

export const researcher = new SecurityResearcher();
