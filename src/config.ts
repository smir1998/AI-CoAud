/* AI CoAudS — runtime configuration.
 *
 * Single source of truth for endpoints, defaults and limits.
 * Every value can be overridden at build time via VITE_* env vars
 * (see .env.example); nothing secret ever lives here.
 */

const env = (key: string, fallback: string): string =>
  (import.meta.env[key] as string | undefined) ?? fallback;

export const CONFIG = {
  appName: "AI CoAudS",
  version: "2.1.0",
  build: {
    mode: import.meta.env.MODE,
    prod: import.meta.env.PROD,
    base: import.meta.env.BASE_URL,
  },

  endpoints: {
    github: env("VITE_GITHUB_API", "https://api.github.com"),
    anthropic: env("VITE_ANTHROPIC_API", "https://api.anthropic.com"),
    openai: env("VITE_OPENAI_API", "https://api.openai.com"),
  },

  llm: {
    enabled: env("VITE_LLM_ENABLED", "true") !== "false",
    anthropicModel: env("VITE_ANTHROPIC_MODEL", "claude-sonnet-4-5"),
    anthropicModels: ["claude-sonnet-4-5", "claude-haiku-4-5"],
    openaiModel: env("VITE_OPENAI_MODEL", "gpt-4.1-mini"),
    openaiModels: ["gpt-4.1", "gpt-4.1-mini"],
  },

  limits: {
    requestTimeoutMs: 60_000,
    llmTimeoutMs: 150_000,     // model calls legitimately run longer
    maxDiffChars: 24_000,      // per-PR context budget for LLM calls
    maxInlineComments: 50,     // GitHub review payload cap
    maxFilesForLLM: 20,        // beyond this: deterministic engine only
  },

  storage: {
    settings: "ai-coauds.settings.v1",
    readmeDraft: "ai-coauds.readme.draft.v1",
  },
} as const;

export type AppConfig = typeof CONFIG;
