// Coding Agent - Main orchestrator for AI coding assistance

import { codeAnalyzer } from './analyzer';
import { aiService } from './ai-service';
import { 
  CodeAnalysis, 
  CodeCompletion, 
  CodingTip, 
  SupportedLanguage,
  AgentResponse 
} from './types';

export class CodingAgent {
  private language: SupportedLanguage = 'typescript';

  setLanguage(language: SupportedLanguage): void {
    this.language = language;
  }

  getLanguage(): SupportedLanguage {
    return this.language;
  }

  async analyzeCode(code: string): Promise<AgentResponse> {
    const analysis = codeAnalyzer.analyze(code, this.language);
    
    return {
      type: 'analysis',
      content: analysis,
      timestamp: Date.now(),
    };
  }

  async completeCode(context: string): Promise<AgentResponse> {
    const completion = await aiService.completeCode(context, this.language);
    
    return {
      type: 'completion',
      content: completion,
      timestamp: Date.now(),
    };
  }

  async explainCode(code: string): Promise<AgentResponse> {
    const explanation = await aiService.explainCode(code, this.language);
    
    return {
      type: 'explanation',
      content: { explanation, language: this.language },
      timestamp: Date.now(),
    };
  }

  async getTips(): Promise<AgentResponse> {
    const tips = await aiService.getCodingTips(this.language);
    
    return {
      type: 'tip',
      content: tips,
      timestamp: Date.now(),
    };
  }

  async refactorCode(code: string): Promise<AgentResponse> {
    const refactored = await aiService.refactorCode(code, this.language);
    
    return {
      type: 'suggestion',
      content: { 
        original: code, 
        refactored,
        language: this.language 
      },
      timestamp: Date.now(),
    };
  }

  async getQuickStats(code: string): Promise<{
    lines: number;
    functions: number;
    complexity: number;
    issues: number;
  }> {
    const analysis = codeAnalyzer.analyze(code, this.language);
    
    return {
      lines: analysis.metrics.linesOfCode,
      functions: analysis.metrics.functionCount,
      complexity: analysis.complexity,
      issues: analysis.issues.length,
    };
  }

  async suggestImprovements(code: string): Promise<AgentResponse> {
    const analysis = codeAnalyzer.analyze(code, this.language);
    
    return {
      type: 'suggestion',
      content: {
        suggestions: analysis.suggestions,
        issues: analysis.issues,
        metrics: analysis.metrics,
      },
      timestamp: Date.now(),
    };
  }
}

export const codingAgent = new CodingAgent();
