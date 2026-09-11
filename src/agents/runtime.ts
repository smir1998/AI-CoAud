// Agentic AI Runtime - ReAct pattern with tool use
// Implements autonomous agent loop: Think → Act → Observe → Reflect

import { CONFIG } from '../config';

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (args: any) => Promise<any>;
}

export interface AgentStep {
  type: 'thought' | 'action' | 'observation' | 'reflection';
  content: string;
  timestamp: number;
  toolCall?: ToolCall;
  toolResult?: any;
}

export interface AgentState {
  messages: AgentMessage[];
  steps: AgentStep[];
  currentStep: number;
  maxSteps: number;
  status: 'idle' | 'thinking' | 'acting' | 'observing' | 'reflecting' | 'complete' | 'error';
  error?: string;
  tokensUsed: number;
}

export interface StreamCallback {
  onThought?: (thought: string) => void;
  onAction?: (action: ToolCall) => void;
  onObservation?: (observation: string) => void;
  onReflection?: (reflection: string) => void;
  onComplete?: (result: any) => void;
  onError?: (error: Error) => void;
}

// Tool registry
const tools: Map<string, Tool> = new Map();

export function registerTool(tool: Tool) {
  tools.set(tool.name, tool);
}

export function getTool(name: string): Tool | undefined {
  return tools.get(name);
}

export function getAllTools(): Tool[] {
  return Array.from(tools.values());
}

// LLM API integration
async function callLLM(
  messages: AgentMessage[],
  tools?: Tool[],
  stream?: boolean
): Promise<any> {
  const provider = CONFIG.llm.provider;
  const apiKey = CONFIG.llm.apiKey;
  const model = CONFIG.llm.model;

  if (!apiKey) {
    throw new Error('API key not configured. Please set your API key in settings.');
  }

  if (provider === 'anthropic') {
    return callAnthropic(messages, tools, stream);
  } else if (provider === 'openai') {
    return callOpenAI(messages, tools, stream);
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

async function callAnthropic(
  messages: AgentMessage[],
  tools?: Tool[],
  stream?: boolean
): Promise<any> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.llm.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CONFIG.llm.model,
      max_tokens: 4096,
      messages: messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.content,
      })),
      system: messages.find(m => m.role === 'system')?.content,
      tools: tools?.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  return response.json();
}

async function callOpenAI(
  messages: AgentMessage[],
  tools?: Tool[],
  stream?: boolean
): Promise<any> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: CONFIG.llm.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        tool_calls: m.tool_calls,
        tool_call_id: m.tool_call_id,
      })),
      tools: tools?.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  return response.json();
}

// Main agent loop - ReAct pattern
export async function runAgent(
  task: string,
  context: string,
  callbacks: StreamCallback = {}
): Promise<AgentState> {
  const state: AgentState = {
    messages: [
      {
        role: 'system',
        content: `You are an expert security auditor AI agent. You analyze code for security vulnerabilities using a systematic approach:

1. THINK: Analyze the task and plan your approach
2. ACT: Use available tools to gather information
3. OBSERVE: Analyze tool results
4. REFLECT: Evaluate findings and decide next steps

Be thorough, precise, and security-focused. Always explain your reasoning.`,
      },
      {
        role: 'user',
        content: `Task: ${task}\n\nContext:\n${context}`,
      },
    ],
    steps: [],
    currentStep: 0,
    maxSteps: 10,
    status: 'thinking',
    tokensUsed: 0,
  };

  try {
    while (state.currentStep < state.maxSteps && state.status !== 'complete') {
      state.status = 'thinking';
      
      // Call LLM
      const response = await callLLM(state.messages, getAllTools());
      
      // Parse response
      const assistantMessage = response.choices?.[0]?.message || response.content?.[0];
      
      if (!assistantMessage) {
        throw new Error('Invalid response from LLM');
      }

      // Add assistant message to history
      state.messages.push({
        role: 'assistant',
        content: assistantMessage.content || '',
        tool_calls: assistantMessage.tool_calls,
      });

      // Record thought step
      if (assistantMessage.content) {
        state.steps.push({
          type: 'thought',
          content: assistantMessage.content,
          timestamp: Date.now(),
        });
        callbacks.onThought?.(assistantMessage.content);
      }

      // Check for tool calls
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        state.status = 'acting';
        
        for (const toolCall of assistantMessage.tool_calls) {
          const tool = getTool(toolCall.function.name);
          
          if (!tool) {
            throw new Error(`Tool not found: ${toolCall.function.name}`);
          }

          // Record action step
          state.steps.push({
            type: 'action',
            content: `Calling ${tool.name}`,
            timestamp: Date.now(),
            toolCall,
          });
          callbacks.onAction?.(toolCall);

          // Execute tool
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await tool.execute(args);

            // Record observation step
            state.steps.push({
              type: 'observation',
              content: JSON.stringify(result, null, 2),
              timestamp: Date.now(),
              toolResult: result,
            });
            callbacks.onObservation?.(JSON.stringify(result));

            // Add tool result to messages
            state.messages.push({
              role: 'tool',
              content: JSON.stringify(result),
              tool_call_id: toolCall.id,
              name: tool.name,
            });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            state.messages.push({
              role: 'tool',
              content: `Error: ${errorMsg}`,
              tool_call_id: toolCall.id,
              name: tool.name,
            });
          }
        }

        state.status = 'observing';
      } else {
        // No tool calls - agent is done
        state.status = 'complete';
        callbacks.onComplete?.(assistantMessage.content);
      }

      state.currentStep++;
    }

    if (state.currentStep >= state.maxSteps) {
      state.status = 'complete';
      state.steps.push({
        type: 'reflection',
        content: 'Maximum steps reached. Summarizing findings.',
        timestamp: Date.now(),
      });
    }

    return state;
  } catch (error) {
    state.status = 'error';
    state.error = error instanceof Error ? error.message : String(error);
    callbacks.onError?.(error instanceof Error ? error : new Error(state.error));
    return state;
  }
}

// Fallback simulation mode (when no API key)
export async function simulateAgent(
  task: string,
  context: string,
  callbacks: StreamCallback = {}
): Promise<AgentState> {
  const state: AgentState = {
    messages: [],
    steps: [],
    currentStep: 0,
    maxSteps: 5,
    status: 'thinking',
    tokensUsed: 0,
  };

  const steps = [
    {
      type: 'thought' as const,
      content: `Analyzing the task: "${task}". I need to examine the code for security vulnerabilities, focusing on common patterns like injection flaws, authentication issues, and data exposure.`,
      delay: 800,
    },
    {
      type: 'action' as const,
      content: 'Scanning code for SQL injection patterns...',
      delay: 600,
    },
    {
      type: 'observation' as const,
      content: 'Found 2 potential SQL injection vulnerabilities in user input handling. Lines 45 and 78 use string concatenation in SQL queries.',
      delay: 700,
    },
    {
      type: 'thought' as const,
      content: 'The SQL injection findings are critical. I should also check for other common vulnerabilities like XSS, hardcoded secrets, and insecure dependencies.',
      delay: 800,
    },
    {
      type: 'reflection' as const,
      content: 'Summary: Found 2 critical SQL injection vulnerabilities, 1 medium XSS issue, and 3 low-severity code quality issues. Recommend immediate remediation of SQL injection flaws using parameterized queries.',
      delay: 600,
    },
  ];

  for (const step of steps) {
    state.status = step.type === 'action' ? 'acting' : 
                   step.type === 'observation' ? 'observing' : 
                   step.type === 'reflection' ? 'reflecting' : 'thinking';
    
    state.steps.push({
      type: step.type,
      content: step.content,
      timestamp: Date.now(),
    });

    if (step.type === 'thought') callbacks.onThought?.(step.content);
    if (step.type === 'action') callbacks.onAction?.({ id: 'sim', type: 'function', function: { name: 'scan', arguments: '{}' } });
    if (step.type === 'observation') callbacks.onObservation?.(step.content);
    if (step.type === 'reflection') callbacks.onReflection?.(step.content);

    await new Promise(resolve => setTimeout(resolve, step.delay));
    state.currentStep++;
  }

  state.status = 'complete';
  callbacks.onComplete?.(steps[steps.length - 1].content);

  return state;
}
