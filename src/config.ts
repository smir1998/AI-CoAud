// AI CoAudS Configuration

export const CONFIG = {
  version: "2.0.0",
  deploy: {
    url: "",
  },
  github: {
    apiBaseUrl: "https://api.github.com",
  },
  llm: {
    provider: "anthropic" as const, // 'anthropic' | 'openai'
    model: "claude-3-5-sonnet-20241022",
    apiKey: "", // Set via UI or environment
    maxTokens: 4096,
    temperature: 0.3,
  },
  agents: {
    maxSteps: 10,
    enableSimulation: true, // Fallback when no API key
  },
};
