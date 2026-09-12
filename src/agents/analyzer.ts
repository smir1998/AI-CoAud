// Code Analyzer - Static analysis and metrics calculation

import { CodeAnalysis, CodeIssue, CodeSuggestion, CodeMetrics, SupportedLanguage } from './types';

export class CodeAnalyzer {
  analyze(code: string, language: SupportedLanguage): CodeAnalysis {
    const metrics = this.calculateMetrics(code, language);
    const issues = this.detectIssues(code, language);
    const suggestions = this.generateSuggestions(code, language, metrics);
    
    return {
      language,
      complexity: this.calculateComplexity(code, language),
      issues,
      suggestions,
      metrics,
    };
  }

  private calculateMetrics(code: string, language: SupportedLanguage): CodeMetrics {
    const lines = code.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    const commentLines = lines.filter(line => this.isComment(line.trim(), language));
    
    const functions = this.extractFunctions(code, language);
    const functionLengths = functions.map(fn => fn.split('\n').length);
    
    return {
      linesOfCode: nonEmptyLines.length,
      commentRatio: commentLines.length / Math.max(nonEmptyLines.length, 1),
      functionCount: functions.length,
      avgFunctionLength: functionLengths.length > 0 
        ? functionLengths.reduce((a, b) => a + b, 0) / functionLengths.length 
        : 0,
      maxNestingDepth: this.calculateMaxNesting(code),
    };
  }

  private isComment(line: string, language: SupportedLanguage): boolean {
    switch (language) {
      case 'javascript':
      case 'typescript':
      case 'java':
      case 'cpp':
      case 'go':
      case 'rust':
        return line.startsWith('//') || line.startsWith('/*') || line.startsWith('*');
      case 'python':
        return line.startsWith('#');
      case 'html':
        return line.startsWith('<!--');
      case 'css':
        return line.startsWith('/*');
      case 'sql':
        return line.startsWith('--') || line.startsWith('/*');
      default:
        return false;
    }
  }

  private extractFunctions(code: string, language: SupportedLanguage): string[] {
    const patterns: Record<SupportedLanguage, RegExp> = {
      javascript: /function\s+\w+\s*\([^)]*\)\s*\{[^}]*\}|const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*\}/g,
      typescript: /function\s+\w+\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{[^}]*\}|const\s+\w+\s*=\s*\([^)]*\)\s*(?::\s*\w+)?\s*=>\s*\{[^}]*\}/g,
      python: /def\s+\w+\s*\([^)]*\)\s*:/g,
      java: /(public|private|protected)?\s*(static)?\s*\w+\s+\w+\s*\([^)]*\)\s*\{[^}]*\}/g,
      cpp: /\w+\s+\w+\s*\([^)]*\)\s*\{[^}]*\}/g,
      go: /func\s+\w+\s*\([^)]*\)\s*\{[^}]*\}/g,
      rust: /fn\s+\w+\s*\([^)]*\)\s*\{[^}]*\}/g,
      html: /<script[^>]*>([\s\S]*?)<\/script>/g,
      css: /\.[\w-]+\s*\{[^}]*\}/g,
      sql: /CREATE\s+(PROCEDURE|FUNCTION)\s+\w+/gi,
    };

    const pattern = patterns[language];
    if (!pattern) return [];

    const matches = code.match(pattern);
    return matches || [];
  }

  private calculateMaxNesting(code: string): number {
    let maxDepth = 0;
    let currentDepth = 0;
    
    for (const char of code) {
      if (char === '{' || char === '(') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}' || char === ')') {
        currentDepth = Math.max(0, currentDepth - 1);
      }
    }
    
    return maxDepth;
  }

  private calculateComplexity(code: string, language: SupportedLanguage): number {
    // Cyclomatic complexity calculation
    const controlStructures = [
      'if', 'else if', 'elif', 'for', 'while', 'case', 'catch', '&&', '||',
      'and', 'or', 'except', 'unless', 'when'
    ];
    
    let complexity = 1; // Base complexity
    
    for (const structure of controlStructures) {
      const regex = new RegExp(`\\b${structure}\\b`, 'g');
      const matches = code.match(regex);
      if (matches) {
        complexity += matches.length;
      }
    }
    
    return complexity;
  }

  private detectIssues(code: string, language: SupportedLanguage): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const lines = code.split('\n');
    
    // Check for common issues
    lines.forEach((line, index) => {
      const lineNum = index + 1;
      
      // Long lines
      if (line.length > 120) {
        issues.push({
          line: lineNum,
          severity: 'warning',
          message: `Line is too long (${line.length} characters). Consider breaking it up.`,
          rule: 'max-line-length',
        });
      }
      
      // Console.log in production code
      if (language === 'javascript' || language === 'typescript') {
        if (line.includes('console.log')) {
          issues.push({
            line: lineNum,
            severity: 'warning',
            message: 'Remove console.log statements before production',
            rule: 'no-console',
            fix: 'Remove or replace with proper logging',
          });
        }
      }
      
      // TODO comments
      if (line.toUpperCase().includes('TODO') || line.toUpperCase().includes('FIXME')) {
        issues.push({
          line: lineNum,
          severity: 'info',
          message: 'TODO/FIXME comment found - consider addressing this',
          rule: 'no-todo',
        });
      }
      
      // Hardcoded values
      if (language === 'python' && line.match(/password\s*=\s*["'][^"']+["']/i)) {
        issues.push({
          line: lineNum,
          severity: 'error',
          message: 'Hardcoded password detected - use environment variables',
          rule: 'no-hardcoded-password',
          fix: 'Use os.environ.get("PASSWORD") or similar',
        });
      }
      
      // SQL injection risk
      if (language === 'python' && line.match(/execute\s*\(\s*["'].*%s.*["']/)) {
        issues.push({
          line: lineNum,
          severity: 'error',
          message: 'Potential SQL injection - use parameterized queries',
          rule: 'sql-injection',
          fix: 'Use cursor.execute(sql, params) with proper parameterization',
        });
      }
    });
    
    return issues;
  }

  private generateSuggestions(
    code: string, 
    language: SupportedLanguage, 
    metrics: CodeMetrics
  ): CodeSuggestion[] {
    const suggestions: CodeSuggestion[] = [];
    
    // Low comment ratio
    if (metrics.commentRatio < 0.1 && metrics.linesOfCode > 50) {
      suggestions.push({
        type: 'best-practice',
        message: 'Consider adding more comments to improve code readability',
        impact: 'medium',
      });
    }
    
    // High complexity
    if (metrics.maxNestingDepth > 4) {
      suggestions.push({
        type: 'improvement',
        message: 'Deep nesting detected. Consider extracting nested logic into separate functions',
        impact: 'high',
      });
    }
    
    // Long functions
    if (metrics.avgFunctionLength > 30) {
      suggestions.push({
        type: 'improvement',
        message: 'Functions are quite long on average. Consider breaking them into smaller, focused functions',
        impact: 'medium',
      });
    }
    
    // Language-specific suggestions
    if (language === 'python') {
      if (code.includes('except:')) {
        suggestions.push({
          type: 'best-practice',
          message: 'Avoid bare except clauses. Catch specific exceptions instead',
          impact: 'high',
          code: 'except SpecificError as e:',
        });
      }
    }
    
    if (language === 'javascript' || language === 'typescript') {
      if (code.includes('var ')) {
        suggestions.push({
          type: 'best-practice',
          message: 'Use const/let instead of var for better scoping',
          impact: 'medium',
        });
      }
    }
    
    return suggestions;
  }
}

export const codeAnalyzer = new CodeAnalyzer();
