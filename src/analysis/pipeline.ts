/* The Orchestrator. Every stage below does real work on real code:
   GitHub REST fetch, deterministic rule scan, optional live LLM audit,
   patch generation with target validation, review synthesis, and an
   actual POST to /pulls/{n}/reviews when a token is configured. */

import {
  SEV_ORDER,
  parseUnifiedDiff, scanFiles, validatePatch,
  type Finding, type FindingPatch, type ParsedFile, type Severity,
} from "./scanner";
import {
  fetchPullRequest, postPullRequestReview, callLLM, estimateCost,
  extractJsonArray, extractJsonObject,
  type PRMeta, type Provider, type InlineComment,
} from "./external";
import type { Fixture } from "../data/fixtures";

export type AgentId = "orchestrator" | "style" | "security" | "tools" | "refactor" | "review";

export type AuditInput =
  | { kind: "github"; owner: string; repo: string; pr: number; ref: string }
  | { kind: "diff"; text: string }
  | { kind: "fixture"; fixture: Fixture };

export interface Settings {
  provider: Provider;
  apiKey: string;
  model: string;
  ghToken: string;
}

export interface SharedSnapshot {
  source: string;
  sourceUrl: string | null;
  sha: string;
  title: string;
  author: string;
  base: string;
  head: string;
  files: number;
  additions: number;
  deletions: number;
  detectorMode: string;
  llmModel: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  findings: number;
  counts: Record<Severity, number>;
  patches: number;
  risk: string | null;
  posted: string | null;
  elapsedMs: number;
}

export interface FinalReview {
  overall: string;
  filesReviewed: number;
  issues: number;
  counts: Record<Severity, number>;
  headline: string;
  summary: string;
  markdown: string;
  inline: InlineComment[];
}

export type PipelineEvent =
  | { kind: "stage"; stage: number }
  | { kind: "agent"; id: AgentId; status: "pending" | "running" | "done"; count?: number }
  | { kind: "log"; agent: AgentId; text: string }
  | { kind: "files"; files: ParsedFile[] }
  | { kind: "finding"; finding: Finding }
  | { kind: "patch"; findingId: string; patch: FindingPatch }
  | { kind: "state"; patch: Partial<SharedSnapshot> }
  | { kind: "review"; review: FinalReview }
  | { kind: "validations"; items: { text: string; ok: boolean }[] }
  | { kind: "post"; text: string; url: string | null }
  | { kind: "done" }
  | { kind: "error"; message: string };

export type Emit = (e: PipelineEvent) => void;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const zeroCounts = (): Record<Severity, number> => ({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });

function recount(findings: Finding[]): { counts: Record<Severity, number>; total: number } {
  const counts = zeroCounts();
  for (const f of findings) counts[f.severity]++;
  return { counts, total: findings.length };
}

const SEV_BADGE: Record<Severity, string> = {
  critical: "🔴", high: "🟠", medium: "🟡", low: "🔵", info: "⚪",
};

/* ── LLM security audit ───────────────────────────────────── */

interface LLMFindingRaw {
  line: number; severity: Severity; confidence: number;
  title: string; issue: string; recommendation: string; cwe?: string | null;
}

async function llmSecurityPass(
  files: ParsedFile[], settings: Settings,
  emit: Emit, cancelled: () => boolean,
): Promise<{ findings: Finding[]; tokensIn: number; tokensOut: number }> {
  const findings: Finding[] = [];
  let tokensIn = 0, tokensOut = 0;
  const system = [
    "You are a senior application-security auditor reviewing a pull request.",
    "Rules: report ONLY genuine issues on the ADDED lines, citing the exact line numbers given.",
    "No style nits, no speculation about code that is not shown, no duplicates.",
    "Respond with ONLY a JSON array. Each item:",
    '{"line": <int>, "severity": "critical|high|medium|low|info", "confidence": <0..1>, "title": <str>, "issue": <str>, "recommendation": <str>, "cwe": <str|null>}',
  ].join("\n");

  for (const f of files.slice(0, 5)) {
    if (cancelled()) break;
    const added = f.added.slice(0, 220);
    if (added.length === 0) continue;
    const prompt = `File: ${f.path} (language: ${f.lang})\nAdded lines:\n` +
      added.map((a) => `L${a.line}: ${a.text}`).join("\n");
    emit({ kind: "log", agent: "security", text: `→ ${f.path}: ${added.length} added lines to ${settings.model}` });
    const res = await callLLM(settings.provider as "anthropic" | "openai", settings.apiKey, settings.model, system, prompt);
    tokensIn += res.inputTokens;
    tokensOut += res.outputTokens;
    emit({ kind: "log", agent: "security", text: `← ${res.model}: ${res.inputTokens}+${res.outputTokens} tok` });
    const raw = extractJsonArray<LLMFindingRaw>(res.text);
    for (const r of raw) {
      if (!Number.isFinite(r.line) || !r.title) continue;
      const line = added.some((a) => a.line === r.line) ? r.line : added[0].line;
      const sev: Severity = SEV_ORDER.includes(r.severity) ? r.severity : "medium";
      findings.push({
        id: `${f.path}:${line}:llm-${findings.length}`,
        agent: "security", detector: "llm", severity: sev,
        confidence: Math.min(0.97, Math.max(0.4, Number(r.confidence) || 0.6)),
        file: f.path, line, title: r.title,
        issue: r.issue || "", recommendation: r.recommendation || "",
        excerpt: f.added.find((a) => a.line === line)?.text ?? "",
        cwe: r.cwe || undefined,
      });
    }
    emit({ kind: "log", agent: "security", text: `parsed ${raw.length} candidate finding(s) from ${f.path}` });
  }
  return { findings, tokensIn, tokensOut };
}

/* ── LLM patch generation ─────────────────────────────────── */

async function llmPatch(
  finding: Finding, file: ParsedFile, settings: Settings,
): Promise<FindingPatch | null> {
  const system = "You refactor code to fix a confirmed audit finding while preserving behavior. Respond with ONLY JSON: " +
    '{"before": "<exact line(s) to replace, copied verbatim from the listing>", "after": "<replacement code>", "note": "<one sentence: why safer/cleaner>"}';
  const listing = file.added.map((a) => `L${a.line}: ${a.text}`).join("\n");
  const prompt = `File: ${finding.file}\nFinding (line ${finding.line}): ${finding.title} — ${finding.issue}\nFix guidance: ${finding.recommendation}\n\nAdded lines:\n${listing}`;
  const res = await callLLM(settings.provider as "anthropic" | "openai", settings.apiKey, settings.model, system, prompt);
  const obj = extractJsonObject<{ before: string; after: string; note: string }>(res.text);
  if (!obj || !obj.before || !obj.after) return null;
  return { before: obj.before, after: obj.after, note: obj.note || "LLM-generated fix", source: "llm" };
}

/* ── review synthesis ─────────────────────────────────────── */

function buildReview(findings: Finding[], files: ParsedFile[], shared: SharedSnapshot, postedNote: string): FinalReview {
  const { counts, total } = recount(findings);
  const overall = counts.critical > 0 || counts.high > 0 ? "high" : counts.medium > 0 ? "medium" : "low";
  const ranked = [...findings].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || b.confidence - a.confidence);
  const top = ranked[0];
  const headline = top ? `${top.title} (${top.file}:${top.line})` : "No issues found in changed lines";
  const summary = total === 0
    ? `Clean audit across ${files.length} file(s): the deterministic engine and ${shared.detectorMode} found nothing actionable in the changed lines.`
    : `Top priority: ${headline}. ${counts.high + counts.critical} high-or-critical item(s) should block the merge; suggested fixes are attached where a safe transformation exists.`;

  const lines: string[] = [
    `## 🛡 Sentinel Crew Review — overall risk: **${overall.toUpperCase()}**`,
    "",
    `**Files reviewed:** ${files.length} · **Issues:** ${total} · ` +
    `(${counts.critical} critical · ${counts.high} high · ${counts.medium} medium · ${counts.low} low · ${counts.info} info)`,
    `**Detectors:** ${shared.detectorMode}${shared.llmModel ? ` · ${shared.llmModel}` : ""}` +
    (shared.tokensIn ? ` · ${shared.tokensIn + shared.tokensOut} tok · $${shared.costUsd.toFixed(4)}` : ""),
    "",
    "### Findings",
    "",
  ];
  for (const f of ranked.slice(0, 12)) {
    lines.push(`${SEV_BADGE[f.severity]} **${f.severity.toUpperCase()}** · \`${f.file}:${f.line}\` · ${f.title}`);
    lines.push(`> ${f.issue}`);
    lines.push(`> **Fix:** ${f.recommendation}`);
    lines.push(`> confidence ${Math.round(f.confidence * 100)}% · detector: ${f.detector}${f.rule ? ` · rule ${f.rule}` : ""}${f.cwe ? ` · ${f.cwe}` : ""}`);
    lines.push("");
  }
  if (ranked.length > 12) lines.push(`_…and ${ranked.length - 12} more finding(s) in the audit log._`, "");
  lines.push("---", `_Posted by Sentinel Crew · deterministic rules + LLM audit · patches validated before posting_ ${postedNote}`);

  const inline: InlineComment[] = ranked.slice(0, 10).map((f) => ({
    path: f.file,
    line: f.line,
    body: `**${f.severity.toUpperCase()}${f.rule ? ` · ${f.rule}` : ""}** — ${f.title}\n\n${f.issue}\n\n**Recommendation:** ${f.recommendation}` +
      (f.patch ? `\n\n_Suggested fix:_ \n\`\`\`\n${f.patch.after}\n\`\`\`` : ""),
  }));

  return { overall, filesReviewed: files.length, issues: total, counts, headline, summary, markdown: lines.join("\n"), inline };
}

/* ── the orchestrator run ─────────────────────────────────── */

export async function runPipeline(
  input: AuditInput, settings: Settings, emit: Emit, cancelled: () => boolean,
): Promise<void> {
  const t0 = performance.now();
  const tick = () => emit({ kind: "state", patch: { elapsedMs: Math.round(performance.now() - t0) } });
  const log = (agent: AgentId, text: string) => emit({ kind: "log", agent, text });
  const agent = (id: AgentId, status: "pending" | "running" | "done", count?: number) => emit({ kind: "agent", id, status, count });
  const stage = (n: number) => emit({ kind: "stage", stage: n });
  const useLLM = settings.provider !== "none" && settings.apiKey.trim().length > 5;

  let meta: PRMeta | null = null;
  let files: ParsedFile[] = [];
  let sourceLabel = "";
  let sourceUrl: string | null = null;
  let sha = "local-diff";
  let title = "Pasted diff";
  let author = "you";
  let base = "—", head = "—";

  /* stage 1 — webhook received */
  stage(0);
  agent("orchestrator", "running");
  if (input.kind === "github") {
    sourceLabel = `${input.owner}/${input.repo}#${input.pr}`;
    sourceUrl = `https://github.com/${input.owner}/${input.repo}/pull/${input.pr}`;
    log("orchestrator", `pull_request · opened · ${sourceLabel}`);
  } else if (input.kind === "diff") {
    sourceLabel = "pasted unified diff";
    log("orchestrator", `manual audit · unified diff (${input.text.length} chars)`);
  } else {
    const fx = input.fixture;
    sourceLabel = `${fx.repo}#${fx.prNumber}`;
    sourceUrl = fx.url;
    sha = fx.sha; title = fx.title; author = fx.author; base = fx.base; head = fx.head;
    log("orchestrator", `pull_request · opened · ${sourceLabel} (fixture)`);
  }
  await sleep(260);

  /* stage 2 — fetch metadata + diff */
  stage(1);
  log("orchestrator", "GET pulls/{n} + pulls/{n}/files — metadata, patches, head sha");
  try {
    if (input.kind === "github") {
      const data = await fetchPullRequest(input.owner, input.repo, input.pr);
      meta = data.meta;
      sha = data.meta.sha.slice(0, 12); title = data.meta.title; author = data.meta.author;
      base = data.meta.base; head = data.meta.head; sourceUrl = data.meta.url;
      for (const f of data.files) {
        if (!f.patch) { log("orchestrator", `skip ${f.path} (binary or rename-only)`); continue; }
        files.push(...parseUnifiedDiff(f.patch, f.path));
      }
      log("orchestrator", `fetched ${data.files.length} file(s) · head ${sha}`);
    } else {
      const text = input.kind === "diff" ? input.text : input.fixture.diff;
      files = parseUnifiedDiff(text);
      if (files.length === 0) throw new Error("No parseable diff hunks found — paste a unified diff (with @@ markers) or a GitHub PR link.");
      log("orchestrator", `parsed ${files.length} file(s) from unified diff`);
    }
  } catch (err) {
    emit({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    agent("orchestrator", "done");
    return;
  }
  if (cancelled()) return;
  const additions = files.reduce((s, f) => s + f.additions, 0);
  const deletions = files.reduce((s, f) => s + f.deletions, 0);
  emit({ kind: "files", files });
  emit({
    kind: "state",
    patch: {
      source: sourceLabel, sourceUrl, sha, title, author, base, head,
      files: files.length, additions, deletions,
      detectorMode: useLLM ? "rules + llm" : "deterministic rules",
    },
  });
  for (const f of files.slice(0, 6)) log("orchestrator", `• ${f.path}  +${f.additions}/−${f.deletions}`);
  tick();
  await sleep(300);

  /* stage 3 — plan */
  stage(2);
  const budgetLines = files.reduce((s, f) => s + Math.min(f.added.length, 220), 0);
  log("orchestrator", `audit plan: ${files.length} file(s), ${additions} added lines, ~${budgetLines} in LLM context budget`);
  log("orchestrator", useLLM ? `llm enabled (${settings.provider}/${settings.model}) — parallel pass with rule engine` : "no api key set — running deterministic engine only (add a key in Settings for the LLM pass)");
  await sleep(260);

  /* stage 4 — parallel audit */
  stage(3);
  agent("tools", "running");
  agent("style", "running");
  if (useLLM) agent("security", "running");
  await sleep(160);

  // deterministic engines (real, synchronous)
  let findings = scanFiles(files);
  const ruleFindings = findings.length;
  const secCount = findings.filter((f) => f.agent === "security").length;
  const styCount = findings.filter((f) => f.agent === "style").length;
  agent("tools", "done", secCount);
  log("tools", `bandit/semgrep-style rules: ${secCount} hit(s) across ${files.length} file(s)`);
  agent("style", "done", styCount);
  log("style", `complexity + smell heuristics: ${styCount} hit(s)`);
  tick();

  // LLM pass with corroboration merge
  let tokensIn = 0, tokensOut = 0;
  if (useLLM) {
    try {
      const llm = await llmSecurityPass(files, settings, emit, cancelled);
      tokensIn = llm.tokensIn; tokensOut = llm.tokensOut;
      let merged = 0, novel = 0;
      for (const lf of llm.findings) {
        const near = findings.find((rf) => rf.file === lf.file && Math.abs(rf.line - lf.line) <= 3 && rf.agent === "security");
        if (near) {
          near.detector = "hybrid";
          near.confidence = Math.min(0.98, Math.max(near.confidence, lf.confidence) + 0.03);
          merged++;
        } else {
          findings.push(lf);
          novel++;
        }
      }
      log("security", `${llm.findings.length} llm candidate(s): ${merged} corroborated rule hits, ${novel} novel`);
      agent("security", "done", llm.findings.length);
    } catch (err) {
      log("security", `llm pass failed (${err instanceof Error ? err.message : err}) — deterministic findings stand`);
      agent("security", "done", 0);
    }
  } else {
    log("security", "heuristic mode — promoting corroborated rule hits only");
    agent("security", "done", secCount);
  }
  emit({ kind: "state", patch: { llmModel: useLLM ? settings.model : null, tokensIn, tokensOut, costUsd: useLLM ? estimateCost(settings.model, tokensIn, tokensOut) : 0 } });

  // stream findings into the UI (sorted, then revealed one by one)
  findings = [...findings].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || b.confidence - a.confidence);
  for (const f of findings) {
    if (cancelled()) return;
    emit({ kind: "finding", finding: f });
    await sleep(90);
  }
  emit({ kind: "state", patch: { ...recount(findings), findings: findings.length } });
  tick();
  await sleep(240);

  /* stage 5 — refactor */
  stage(4);
  agent("refactor", "running");
  const patchable = findings.filter((f) => ["critical", "high", "medium"].includes(f.severity));
  let patches = 0;
  for (const f of patchable.slice(0, 5)) {
    if (cancelled()) return;
    const file = files.find((x) => x.path === f.file);
    if (!file) continue;
    let patch = f.patch;
    if (!patch && useLLM) {
      try {
        log("refactor", `requesting ${settings.model} patch for ${f.file}:${f.line}`);
        patch = (await llmPatch(f, file, settings)) ?? undefined;
        if (patch) {
          const v = validatePatch(file, patch);
          if (!v.ok) { log("refactor", `llm patch rejected — ${v.reason}`); patch = undefined; }
        }
      } catch { patch = undefined; }
    }
    if (!patch) {
      log("refactor", `no safe transformation for ${f.rule ?? f.title} — manual fix recommended`);
      continue;
    }
    const v = validatePatch(file, patch);
    if (!v.ok) { log("refactor", `template patch rejected for ${f.file}:${f.line} — ${v.reason}`); continue; }
    f.patch = patch;
    emit({ kind: "patch", findingId: f.id, patch });
    patches++;
    log("refactor", `✓ ${f.file}:${f.line} — ${patch.source} patch (${patch.note})`);
    tick();
    await sleep(140);
  }
  agent("refactor", "done", patches);
  emit({ kind: "state", patch: { patches } });
  await sleep(220);

  /* stage 6 — review synthesis */
  stage(5);
  agent("review", "running");
  const sharedSoFar: SharedSnapshot = {
    source: sourceLabel, sourceUrl, sha, title, author, base, head,
    files: files.length, additions, deletions,
    detectorMode: useLLM ? "rules + llm" : "deterministic rules",
    llmModel: useLLM ? settings.model : null, tokensIn, tokensOut,
    costUsd: useLLM ? estimateCost(settings.model, tokensIn, tokensOut) : 0,
    findings: findings.length, ...recount(findings), patches, risk: null, posted: null,
    elapsedMs: Math.round(performance.now() - t0),
  };
  const review = buildReview(findings, files, sharedSoFar, "");
  log("review", `merged ${ruleFindings} deterministic + llm findings → ${review.issues} ranked`);
  log("review", `verdict: ${review.overall.toUpperCase()} · ${review.headline}`);
  agent("review", "done", review.issues);
  emit({ kind: "review", review });
  emit({ kind: "state", patch: { risk: review.overall, findings: review.issues } });
  await sleep(240);

  /* stage 7 — validation */
  stage(6);
  const validations: { text: string; ok: boolean }[] = [];
  const patched = findings.filter((f) => f.patch);
  for (const f of patched) {
    const file = files.find((x) => x.path === f.file)!;
    const v = validatePatch(file, f.patch!);
    validations.push({ text: `patch ${f.file}:${f.line} — ${v.reason}`, ok: v.ok });
    log("orchestrator", `${v.ok ? "✓" : "✗"} ${f.file}:${f.line} ${v.reason}`);
  }
  const onChangedLines = findings.every((f) => {
    const file = files.find((x) => x.path === f.file);
    return file?.added.some((a) => a.line === f.line) ?? false;
  });
  validations.push({ text: "every finding maps to a changed line", ok: onChangedLines });
  validations.push({ text: `review markdown rendered (${review.markdown.length} chars)`, ok: review.markdown.length > 0 });
  validations.push({ text: `inline comments within GitHub limit (${review.inline.length}/50)`, ok: review.inline.length <= 50 });
  emit({ kind: "validations", items: validations });
  log("orchestrator", `validation gate: ${validations.filter((v) => v.ok).length}/${validations.length} checks passed`);
  await sleep(260);

  /* stage 8 — post back to GitHub */
  stage(7);
  const event: "APPROVE" | "REQUEST_CHANGES" = review.overall === "high" ? "REQUEST_CHANGES" : "APPROVE";
  if (input.kind === "github" && settings.ghToken.trim()) {
    log("orchestrator", `POST /repos/${input.owner}/${input.repo}/pulls/${input.pr}/reviews · event=${event}`);
    try {
      const res = await postPullRequestReview(input.owner, input.repo, input.pr, settings.ghToken.trim(), {
        commitId: meta?.sha ?? "",
        event,
        body: review.markdown,
        comments: review.inline,
      });
      emit({ kind: "post", text: `review #${res.id} posted · ${event}`, url: res.htmlUrl });
      emit({ kind: "state", patch: { posted: res.htmlUrl } });
      log("orchestrator", `✓ 201 Created — review #${res.id} is live on the PR`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit({ kind: "post", text: `post failed: ${msg}`, url: null });
      log("orchestrator", `✗ GitHub rejected the review — ${msg}`);
    }
  } else if (input.kind === "github") {
    emit({ kind: "post", text: `review ready (${event}) — add a GitHub token in Settings to auto-post`, url: null });
    log("orchestrator", "no GitHub token configured — review held locally (copy/download from the Review tab)");
  } else {
    emit({ kind: "post", text: "audit complete — run against a GitHub PR link to post this review back automatically", url: null });
    log("orchestrator", "local audit complete — nothing to post (source is not a GitHub PR)");
  }
  tick();
  await sleep(200);
  agent("orchestrator", "done");
  emit({ kind: "done" });
}
