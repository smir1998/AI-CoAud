// AI Service - Integration with AI APIs for code intelligence

import { CodeCompletion, CodingTip, SupportedLanguage } from './types';

export interface AIConfig {
  apiKey?: string;
  endpoint?: string;
  model?: string;
}

export class AIService {
  private config: AIConfig;

  constructor(config: AIConfig = {}) {
    this.config = {
      apiKey: config.apiKey || (import.meta as any).env?.VITE_AI_API_KEY,
      endpoint: config.endpoint || 'https://api.openai.com/v1',
      model: config.model || 'gpt-4',
    };
  }

  async completeCode(
    context: string,
    language: SupportedLanguage,
    maxTokens: number = 150
  ): Promise<CodeCompletion> {
    // Mock implementation - replace with actual API call
    // In production, this would call OpenAI, Anthropic, or similar API
    
    const mockCompletions: Record<SupportedLanguage, string[]> = {
      javascript: [
        'function calculateSum(a, b) {\n  return a + b;\n}',
        'const result = items.filter(item => item.active).map(item => item.value);',
      ],
      typescript: [
        'interface User {\n  id: number;\n  name: string;\n  email: string;\n}',
        'async function fetchData<T>(url: string): Promise<T> {\n  const response = await fetch(url);\n  return response.json();\n}',
      ],
      python: [
        'def process_data(data: list) -> dict:\n    """Process and transform the input data."""\n    return {"result": len(data)}',
        'class DataProcessor:\n    def __init__(self, config: dict):\n        self.config = config',
      ],
      java: [
        'public class UserService {\n    public User getUser(int id) {\n        return userRepository.findById(id);\n    }\n}',
      ],
      cpp: [
        'std::vector<int> filterEven(const std::vector<int>& nums) {\n    std::vector<int> result;\n    for (int n : nums) {\n        if (n % 2 == 0) result.push_back(n);\n    }\n    return result;\n}',
      ],
      go: [
        'func ProcessData(data []string) map[string]int {\n    result := make(map[string]int)\n    for _, item := range data {\n        result[item]++\n    }\n    return result\n}',
      ],
      rust: [
        'fn process_items(items: &[String]) -> Vec<String> {\n    items.iter()\n        .filter(|s| !s.is_empty())\n        .map(|s| s.to_uppercase())\n        .collect()\n}',
      ],
      html: [
        '<div class="container">\n  <h1>Title</h1>\n  <p>Content</p>\n</div>',
      ],
      css: [
        '.container {\n  max-width: 1200px;\n  margin: 0 auto;\n  padding: 20px;\n}',
      ],
      sql: [
        'SELECT u.name, COUNT(o.id) as order_count\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id\nGROUP BY u.name\nHAVING COUNT(o.id) > 5;',
      ],
    };

    const completions = mockCompletions[language] || mockCompletions.javascript;
    const randomIndex = Math.floor(Math.random() * completions.length);
    
    return {
      text: completions[randomIndex],
      confidence: 0.75 + Math.random() * 0.2,
      context: context.slice(-200),
    };
  }

  async explainCode(code: string, language: SupportedLanguage): Promise<string> {
    // Mock implementation
    const explanations: Record<string, string> = {
      javascript: 'This JavaScript code performs data transformation operations using array methods.',
      typescript: 'This TypeScript code uses type-safe operations with explicit type annotations.',
      python: 'This Python code implements data processing logic with type hints.',
      java: 'This Java code follows object-oriented principles with proper encapsulation.',
      cpp: 'This C++ code uses modern C++ features with STL containers.',
      go: 'This Go code demonstrates idiomatic Go patterns with goroutine safety.',
      rust: 'This Rust code leverages ownership and borrowing for memory safety.',
      html: 'This HTML structure provides semantic markup for web content.',
      css: 'This CSS applies styling with modern layout techniques.',
      sql: 'This SQL query performs data retrieval with joins and aggregations.',
    };

    return explanations[language] || 'This code implements the specified functionality.';
  }

  async getCodingTips(language: SupportedLanguage): Promise<CodingTip[]> {
    const tips: Record<SupportedLanguage, CodingTip[]> = {
      javascript: [
        {
          category: 'Performance',
          title: 'Use Array Methods Efficiently',
          description: 'Prefer map, filter, reduce over manual loops for better readability and potential optimization.',
          example: 'const doubled = numbers.map(n => n * 2);',
        },
        {
          category: 'Best Practice',
          title: 'Avoid Mutating State',
          description: 'Use immutable patterns to prevent unexpected side effects.',
          example: 'const newState = { ...oldState, updated: true };',
        },
      ],
      typescript: [
        {
          category: 'Type Safety',
          title: 'Use Strict Mode',
          description: 'Enable strict mode in tsconfig.json for better type checking.',
          example: '{ "compilerOptions": { "strict": true } }',
        },
        {
          category: 'Best Practice',
          title: 'Prefer Interfaces for Objects',
          description: 'Use interfaces over type aliases for object shapes.',
          example: 'interface User { id: number; name: string; }',
        },
      ],
      python: [
        {
          category: 'Performance',
          title: 'Use List Comprehensions',
          description: 'List comprehensions are faster and more Pythonic than loops.',
          example: 'squares = [x**2 for x in range(10)]',
        },
        {
          category: 'Best Practice',
          title: 'Use Type Hints',
          description: 'Add type hints for better code documentation and IDE support.',
          example: 'def process(data: list[str]) -> dict[str, int]:',
        },
      ],
      java: [
        {
          category: 'Best Practice',
          title: 'Use Optional for Nullable Returns',
          description: 'Return Optional<T> instead of null to avoid NullPointerException.',
          example: 'public Optional<User> findUser(int id) { }',
        },
      ],
      cpp: [
        {
          category: 'Memory Safety',
          title: 'Use Smart Pointers',
          description: 'Prefer unique_ptr and shared_ptr over raw pointers.',
          example: 'std::unique_ptr<MyClass> ptr = std::make_unique<MyClass>();',
        },
      ],
      go: [
        {
          category: 'Error Handling',
          title: 'Always Check Errors',
          description: 'Never ignore returned errors in Go.',
          example: 'result, err := doSomething()\nif err != nil {\n    return err\n}',
        },
      ],
      rust: [
        {
          category: 'Ownership',
          title: 'Understand Borrowing Rules',
          description: 'Learn Rust\'s ownership system to write safe concurrent code.',
          example: 'fn process(data: &str) -> String { data.to_uppercase() }',
        },
      ],
      html: [
        {
          category: 'Accessibility',
          title: 'Use Semantic HTML',
          description: 'Use appropriate HTML elements for better accessibility.',
          example: '<nav>, <main>, <article>, <section>',
        },
      ],
      css: [
        {
          category: 'Performance',
          title: 'Avoid Deep Nesting',
          description: 'Keep CSS selectors specific but not overly nested.',
          example: '.card .title { } instead of .page .container .card .title { }',
        },
      ],
      sql: [
        {
          category: 'Performance',
          title: 'Use Indexes',
          description: 'Create indexes on columns used in WHERE and JOIN clauses.',
          example: 'CREATE INDEX idx_user_email ON users(email);',
        },
      ],
    };

    return tips[language] || [];
  }

  async refactorCode(code: string, language: SupportedLanguage): Promise<string> {
    // Mock implementation - in production, this would use AI to refactor
    const refactoredCode: Record<SupportedLanguage, string> = {
      javascript: '// Refactored: Extracted common logic into helper function\n' + code,
      typescript: '// Refactored: Improved type safety and reduced duplication\n' + code,
      python: '# Refactored: Applied Python best practices and PEP 8\n' + code,
      java: '// Refactored: Improved design patterns and SOLID principles\n' + code,
      cpp: '// Refactored: Modernized C++ practices\n' + code,
      go: '// Refactored: Improved error handling and concurrency\n' + code,
      rust: '// Refactored: Improved ownership and borrowing\n' + code,
      html: '<!-- Refactored: Improved semantic structure -->\n' + code,
      css: '/* Refactored: Improved selector specificity */\n' + code,
      sql: '-- Refactored: Optimized query performance\n' + code,
    };

    return refactoredCode[language] || code;
  }
}

export const aiService = new AIService();
