/* Real network integrations: GitHub REST API + LLM providers.
   GitHub public reads need no token (CORS-enabled). Posting a review needs a PAT.
   LLM calls go direct from the browser with the user's own key. */

import { CONFIG } from "../config";

export interface PRMeta {
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  author: string;
  sha: string;
  base: string;
  head: string;
  url: string;
  body: string;
}

export interface PRFilePatch {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

import { CONFIG } from "../config";

const GH = CONFIG.endpoints.github;
const GH_HEADERS = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

async function gh<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...GH_HEADERS, ...(init?.headers || {}) } });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.message || msg;
    } catch { /* non-JSON error body */ }
    if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
      msg = "GitHub rate limit exhausted for unauthenticated requests (60/hr) — add a token in Settings";
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export function parsePRRef(input: string): { owner: string; repo: string; pr: number } | null {
  const t = input.trim();
  let m = t.match(/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i);
  if (m) return { owner: m[1], repo: m[2], pr: parseInt(m[3], 10) };
  m = t.match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/);
  if (m) return { owner: m[1], repo: m[2], pr: parseInt(m[3], 10) };
  return null;
}

export async function fetchPullRequest(owner: string, repo: string, pr: number): Promise<{ meta: PRMeta; files: PRFilePatch[] }> {
  const [pull, files] = await Promise.all([
    gh<{ title: string; user: { login: string }; head: { sha: string; ref: string }; base: { ref: string }; html_url: string; body: string | null }>(
      `${GH}/repos/${owner}/${repo}/pulls/${pr}`),
    gh<{ filename: string; status: string; additions: number; deletions: number; patch?: string }[]>(
      `${GH}/repos/${owner}/${repo}/pulls/${pr}/files?per_page=100`),
  ]);
  return {
    meta: {
      owner, repo, prNumber: pr, title: pull.title, author: pull.user.login,
      sha: pull.head.sha, base: pull.base.ref, head: pull.head.ref,
      url: pull.html_url, body: pull.body ?? "",
    },
    files: files.map((f) => ({ path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch: f.patch })),
  };
}

export interface InlineComment {
  path: string;
  line: number;
  body: string;
}

export async function postPullRequestReview(
  owner: string, repo: string, pr: number, token: string,
  payload: { commitId: string; event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"; body: string; comments: InlineComment[] },
): Promise<{ id: number; htmlUrl: string }> {
  const res = await fetch(`${GH}/repos/${owner}/${repo}/pulls/${pr}/reviews`, {
    method: "POST",
    headers: { ...GH_HEADERS, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      commit_id: payload.commitId,
      event: payload.event,
      body: payload.body,
      comments: payload.comments,
    }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json())?.message || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = (await res.json()) as { id: number; html_url: string };
  return { id: data.id, htmlUrl: data.html_url };
}

/* ── LLM providers ────────────────────────────────────────── */

export type Provider = "anthropic" | "openai" | "none";

export interface LLMResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export const PROVIDER_MODELS: Record<Exclude<Provider, "none">, string[]> = {
  anthropic: ["claude-sonnet-4-5", "claude-haiku-4-5"],
  openai: ["gpt-4o", "gpt-4o-mini"],
};

// USD per 1M tokens [input, output]
const PRICING: Record<string, [number, number]> = {
  "claude-sonnet-4-5": [3, 15], "claude-haiku-4-5": [1, 5],
  "gpt-4o": [2.5, 10], "gpt-4o-mini": [0.15, 0.6],
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] || [3, 15];
  return (inputTokens / 1e6) * p[0] + (outputTokens / 1e6) * p[1];
}

export async function callLLM(provider: Exclude<Provider, "none">, apiKey: string, model: string, system: string, prompt: string): Promise<LLMResult> {
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model, max_tokens: 4096, system, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json())?.error?.message || msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    const data = (await res.json()) as { content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number }; model: string };
    return {
      text: data.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n"),
      model: data.model,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
    };
  }
  // OpenAI
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json())?.error?.message || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[]; usage: { prompt_tokens: number; completion_tokens: number }; model: string };
  return {
    text: data.choices[0]?.message?.content ?? "",
    model: data.model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

export function extractJsonArray<T>(text: string): T[] {
  const stripped = text.replace(/```(?:json)?/g, "").trim();
  const start = stripped.indexOf("[");
  const end = stripped.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function extractJsonObject<T>(text: string): T | null {
  const stripped = text.replace(/```(?:json)?/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
