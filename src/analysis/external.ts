/* Real network integrations: GitHub REST API + LLM providers.
   Public reads work without a token; private reads and posting require a PAT.
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

export interface RepositorySnapshotFile {
  path: string;
  content: string;
}

export interface RepositorySnapshot {
  branch: string;
  sha: string;
  files: RepositorySnapshotFile[];
  eligibleFiles: number;
  skippedFiles: number;
  partialCoverage: boolean;
}

const GH = CONFIG.endpoints.github;
const GH_HEADERS = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

async function gh<T>(url: string, init?: RequestInit): Promise<T> {
  const timeout = AbortSignal.timeout(CONFIG.limits.requestTimeoutMs);
  const res = await fetch(url, {
    ...init,
    headers: { ...GH_HEADERS, ...(init?.headers || {}) },
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.message || msg;
    } catch { /* non-JSON error body */ }
    if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
      msg = "GitHub API rate limit exhausted — add or check a token in Settings, then retry";
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

export function parseRepoRef(input: string): { owner: string; repo: string } | null {
  const value = input.trim().replace(/\/$/, "");
  const urlMatch = value.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)(?:\.git)?$/i);
  const plainMatch = value.match(/^([\w.-]+)\/([\w.-]+)$/);
  const match = urlMatch ?? plainMatch;
  return match ? { owner: match[1], repo: match[2].replace(/\.git$/i, "") } : null;
}

const SNAPSHOT_MAX_FILES = 120;
const SNAPSHOT_MAX_PUBLIC_FILES = 40;
const SNAPSHOT_MAX_FILE_BYTES = 256_000;
const SNAPSHOT_MAX_TOTAL_BYTES = 4_000_000;
const SNAPSHOT_MAX_LINES = 20_000;
const SNAPSHOT_MAX_FILE_LINES = 5_000;
const SNAPSHOT_CONCURRENCY = 4;
const OMIT_DIRS = new Set([".git", "node_modules", "vendor", "dist", "build", "coverage", ".next", "target", ".venv", "venv", "__pycache__"]);
const TEXT_EXTENSIONS = /\.(?:pyi?|[cm]?jsx?|tsx?|go|rs|java|kt|php|rb|swift|cs|c|h|cc|cpp|hpp|sh|bash|ya?ml|toml|json|html?|sql|tf|md|xml|gradle|properties)$/i;
const TEXT_FILENAMES = new Set(["dockerfile", "makefile", "gemfile", "procfile", "requirements.txt", "go.mod", "cargo.toml", "pom.xml", ".env.example", ".gitignore", ".dockerignore"]);

function isSnapshotTextFile(path: string): boolean {
  const parts = path.split("/");
  const lowerParts = parts.map((part) => part.toLowerCase());
  const name = lowerParts[lowerParts.length - 1] ?? "";
  if (lowerParts.some((part) => OMIT_DIRS.has(part))) return false;
  if (/(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|cargo\.lock|poetry\.lock|pipfile\.lock|composer\.lock)$/i.test(name)) return false;
  if (/\.(?:lock|min\.js|map|svg|png|jpe?g|gif|ico|pdf|zip|gz|woff2?)$/i.test(name)) return false;
  return TEXT_EXTENSIONS.test(name) || TEXT_FILENAMES.has(name);
}

function githubAuth(token?: string): Record<string, string> {
  return token?.trim() ? { Authorization: `Bearer ${token.trim()}` } : {};
}

export async function fetchPullRequest(
  owner: string, repo: string, pr: number, signal?: AbortSignal, token?: string,
): Promise<{ meta: PRMeta; files: PRFilePatch[]; partialCoverage: boolean }> {
  const headers = githubAuth(token);
  const [pull, firstPage] = await Promise.all([
    gh<{ title: string; user: { login: string }; head: { sha: string; ref: string }; base: { ref: string }; html_url: string; body: string | null }>(
      `${GH}/repos/${owner}/${repo}/pulls/${pr}`, { signal, headers }),
    gh<{ filename: string; status: string; additions: number; deletions: number; patch?: string }[]>(
      `${GH}/repos/${owner}/${repo}/pulls/${pr}/files?per_page=100&page=1`, { signal, headers }),
  ]);
  const files = [...firstPage];
  const maxFiles = CONFIG.limits.maxFilesPerAudit;
  let page = 2;
  let lastBatchLength = firstPage.length;
  while (files.length < maxFiles && lastBatchLength === 100) {
    const batch = await gh<typeof firstPage>(
      `${GH}/repos/${owner}/${repo}/pulls/${pr}/files?per_page=100&page=${page++}`, { signal, headers },
    );
    if (batch.length === 0) break;
    files.push(...batch);
    lastBatchLength = batch.length;
  }
  let partialCoverage = files.length > maxFiles;
  if (files.length >= maxFiles) {
    if (!partialCoverage && lastBatchLength === 100) {
      const nextPage = await gh<typeof firstPage>(
        `${GH}/repos/${owner}/${repo}/pulls/${pr}/files?per_page=100&page=${page}`, { signal, headers },
      );
      partialCoverage = nextPage.length > 0;
    }
    files.length = maxFiles;
  }
  return {
    meta: {
      owner, repo, prNumber: pr, title: pull.title, author: pull.user.login,
      sha: pull.head.sha, base: pull.base.ref, head: pull.head.ref,
      url: pull.html_url, body: pull.body ?? "",
    },
    files: files.map((f) => ({ path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch: f.patch })),
    partialCoverage,
  };
}

export async function fetchRepositorySnapshot(
  owner: string, repo: string, requestedBranch: string, token: string, signal?: AbortSignal,
): Promise<RepositorySnapshot> {
  const headers = githubAuth(token);
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = encodeURIComponent(repo);
  const metadata = await gh<{ default_branch: string }>(`${GH}/repos/${encodedOwner}/${encodedRepo}`, { signal, headers });
  const branch = requestedBranch.trim() || metadata.default_branch;
  if (!branch) throw new Error("GitHub did not provide a default branch for this repository");
  const branchData = await gh<{ commit: { sha: string } }>(
    `${GH}/repos/${encodedOwner}/${encodedRepo}/branches/${encodeURIComponent(branch)}`, { signal, headers },
  );
  const sha = branchData.commit.sha;
  const tree = await gh<{ truncated: boolean; tree: { path: string; type: string; sha: string; size?: number }[] }>(
    `${GH}/repos/${encodedOwner}/${encodedRepo}/git/trees/${encodeURIComponent(sha)}?recursive=1`, { signal, headers },
  );

  const blobs = tree.tree.filter((entry) => entry.type === "blob" && isSnapshotTextFile(entry.path));
  const maxFiles = token.trim() ? SNAPSHOT_MAX_FILES : SNAPSHOT_MAX_PUBLIC_FILES;
  const maxBytes = SNAPSHOT_MAX_TOTAL_BYTES;
  const candidates = blobs
    .filter((entry) => typeof entry.size === "number" && entry.size <= SNAPSHOT_MAX_FILE_BYTES)
    .sort((a, b) => {
      const score = (path: string) => /^(package\.json|pyproject\.toml|requirements\.txt|go\.mod|cargo\.toml|pom\.xml)$/i.test(path) ? 2 : 1;
      return score(b.path) - score(a.path) || a.path.localeCompare(b.path);
    });
  const selected: typeof candidates = [];
  let selectedBytes = 0;
  for (const candidate of candidates) {
    if (selected.length >= maxFiles || selectedBytes + (candidate.size ?? 0) > maxBytes) break;
    selected.push(candidate);
    selectedBytes += candidate.size ?? 0;
  }

  const downloadedFiles: RepositorySnapshotFile[] = [];
  const failedPaths: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < selected.length && !signal?.aborted) {
      const index = next++;
      const entry = selected[index];
      try {
        const blob = await gh<{ encoding: string; content: string }>(
          `${GH}/repos/${encodedOwner}/${encodedRepo}/git/blobs/${encodeURIComponent(entry.sha)}`, { signal, headers },
        );
        if (blob.encoding !== "base64") throw new Error("GitHub returned a non-base64 blob");
        const bytes = Uint8Array.from(atob(blob.content.replace(/\s/g, "")), (char) => char.charCodeAt(0));
        const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        downloadedFiles.push({ path: entry.path, content });
      } catch (error) {
        if (signal?.aborted) throw error;
        failedPaths.push(entry.path);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SNAPSHOT_CONCURRENCY, selected.length) }, worker));
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  const files: RepositorySnapshotFile[] = [];
  let totalLines = 0;
  for (const file of downloadedFiles.sort((a, b) => a.path.localeCompare(b.path))) {
    const lineCount = file.content.length === 0 ? 0 : file.content.split(/\r\n|\n|\r/).length;
    if (lineCount > SNAPSHOT_MAX_FILE_LINES || totalLines + lineCount > SNAPSHOT_MAX_LINES) continue;
    files.push(file);
    totalLines += lineCount;
  }
  if (files.length === 0) throw new Error("No supported text files could be read; check the repository, branch, and token permissions");

  const skippedFiles = blobs.length - files.length;
  return {
    branch, sha, files: files.sort((a, b) => a.path.localeCompare(b.path)), eligibleFiles: blobs.length,
    skippedFiles,
    partialCoverage: tree.truncated || selected.length < blobs.length || downloadedFiles.length < selected.length || files.length < downloadedFiles.length,
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
  signal?: AbortSignal,
): Promise<{ id: number; htmlUrl: string }> {
  const timeout = AbortSignal.timeout(CONFIG.limits.requestTimeoutMs);
  const res = await fetch(`${GH}/repos/${owner}/${repo}/pulls/${pr}/reviews`, {
    method: "POST",
    headers: { ...GH_HEADERS, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      commit_id: payload.commitId,
      event: payload.event,
      body: payload.body,
      comments: payload.comments,
    }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
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

export const PROVIDER_MODELS: Record<Exclude<Provider, "none">, readonly string[]> = {
  anthropic: CONFIG.llm.anthropicModels,
  openai: CONFIG.llm.openaiModels,
};

// USD per 1M tokens [input, output]
const PRICING: Record<string, [number, number]> = {
  "claude-sonnet-4-5": [3, 15], "claude-haiku-4-5": [1, 5],
  "gpt-4.1": [2, 8], "gpt-4.1-mini": [0.4, 1.6],
  "gpt-4o": [2.5, 10], "gpt-4o-mini": [0.15, 0.6],
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] || [3, 15];
  return (inputTokens / 1e6) * p[0] + (outputTokens / 1e6) * p[1];
}

function llmError(e: unknown, fallback: string): Error {
  if (e instanceof DOMException && e.name === "TimeoutError") {
    return new Error(`provider timed out after ${CONFIG.limits.llmTimeoutMs / 1000}s — retry or switch models`);
  }
  if (e instanceof TypeError) return new Error("network unreachable — check connectivity / proxy");
  return e instanceof Error ? e : new Error(fallback);
}

export async function callLLM(
  provider: Exclude<Provider, "none">, apiKey: string, model: string,
  system: string, prompt: string, signal?: AbortSignal,
): Promise<LLMResult> {
  if (provider === "anthropic") {
    let res: Response;
    try {
      res = await fetch(`${CONFIG.endpoints.anthropic}/v1/messages`, {
      method: "POST",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(CONFIG.limits.llmTimeoutMs)])
        : AbortSignal.timeout(CONFIG.limits.llmTimeoutMs),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model, max_tokens: 4096, system, messages: [{ role: "user", content: prompt }] }),
      });
    } catch (e) {
      throw llmError(e, "anthropic request failed");
    }
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
  let res: Response;
  try {
    res = await fetch(`${CONFIG.endpoints.openai}/v1/chat/completions`, {
      method: "POST",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(CONFIG.limits.llmTimeoutMs)])
        : AbortSignal.timeout(CONFIG.limits.llmTimeoutMs),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    throw llmError(e, "openai request failed");
  }
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
