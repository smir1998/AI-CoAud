/* AI CoAudS — five-specialist LLM security panel.
 *
 * Replaces the single generalist security pass with five domain agents that
 * run IN PARALLEL, each owning a disjoint threat surface. Disjointness is
 * enforced by the prompts (every specialist is told what the others own),
 * which keeps the panel from triple-reporting the same line.
 *
 * Two execution modes:
 *   · LLM mode   — 5 concurrent provider calls, one per specialist; results
 *                  are corroborated against the deterministic rule findings
 *                  (±3 lines, same file) and corroborated rules get retagged
 *                  to the specialist that confirmed them.
 *   · offline    — no key configured: each specialist *adopts* the rule
 *                  findings whose CWE falls inside its domain, so the crew
 *                  bar, counts and attribution still reflect the panel.
 */
import type { Finding, FindingAgent, ParsedFile, Severity } from "./scanner";
import { SEV_ORDER } from "./scanner";
import { callLLM, extractJsonArray } from "./external";
import type { Settings } from "./pipeline";

export type SpecialistId = Extract<FindingAgent, "inj" | "secret" | "auth" | "supply" | "crypto">;

export interface Specialist {
  id: SpecialistId;
  name: string;
  short: string;
  color: string;
  mission: string;       // one-line charter (UI / architecture docs)
  focus: string;         // prompt: exclusive hunting ground
  exclusions: string;    // prompt: what the other four own
  cwes: string[];        // offline-delegation scope + corroboration tags
}

export const SPECIALISTS: Specialist[] = [
  {
    id: "inj",
    name: "Injection Hunter",
    short: "INJ",
    color: "#fb7185",
    mission: "traces attacker-controlled bytes into sinks — SQL, shell, eval, templates, HTML, log streams",
    focus:
      "SQL injection via string building or f-strings, OS command injection (shell=True, backticks, child_process), " +
      "code injection (eval/exec/Function), template injection, XSS sinks (innerHTML, dangerouslySetInnerHTML, unescaped output), " +
      "log injection, and path traversal that reaches a file or process sink.",
    exclusions: "hardcoded secrets, authentication/session logic, dependency choices and cryptographic algorithms — other panel members own those.",
    cwes: ["CWE-89", "CWE-78", "CWE-79", "CWE-94", "CWE-95", "CWE-917", "CWE-117", "CWE-943", "CWE-22"],
  },
  {
    id: "secret",
    name: "Secrets Sentinel",
    short: "KEY",
    color: "#fbbf24",
    mission: "hunts credentials, tokens and key material that must never ship",
    focus:
      "hardcoded passwords, API keys, tokens and connection strings; AWS/GCP/Stripe/Slack key shapes; private key or " +
      "certificate material; .env values committed inline; secrets embedded in URLs, logs or error messages; weak credential storage.",
    exclusions: "injection sinks, authentication flow logic and crypto algorithm choice — other panel members own those.",
    cwes: ["CWE-798", "CWE-321", "CWE-522", "CWE-259", "CWE-200", "CWE-532"],
  },
  {
    id: "auth",
    name: "Access Auditor",
    short: "ACL",
    color: "#a78bfa",
    mission: "attacks the trust model — authentication, sessions, authorization, JWT, cookies",
    focus:
      "broken authentication, missing or weak authorization checks, IDOR on user-supplied identifiers, JWT 'none' or " +
      "unverified signatures, session fixation, insecure cookie flags, debug/admin endpoints left exposed, permissive CORS.",
    exclusions: "injection payloads, committed secret values and crypto primitives — other panel members own those.",
    cwes: ["CWE-287", "CWE-345", "CWE-347", "CWE-639", "CWE-614", "CWE-384", "CWE-276", "CWE-732", "CWE-489", "CWE-942"],
  },
  {
    id: "supply",
    name: "Supply-Chain Auditor",
    short: "PKG",
    color: "#4ade80",
    mission: "audits what the code trusts — dependencies, deserialization, unpinned builds",
    focus:
      "unsafe deserialization (pickle, yaml.load, Marshal, unserialize), known-vulnerable or unpinned dependencies, " +
      "typosquatting risk, abandoned/deprecated packages in new code, and loading untrusted plugins or remote code.",
    exclusions: "injection sinks, secret values, auth flows and cryptography — other panel members own those.",
    cwes: ["CWE-502", "CWE-1104", "CWE-829", "CWE-1395", "CWE-494", "CWE-16"],
  },
  {
    id: "crypto",
    name: "Crypto & Transport Auditor",
    short: "CRY",
    color: "#67e8f9",
    mission: "grades the math and the wire — hashes, PRNGs, TLS, key handling",
    focus:
      "weak hashes used for security purposes (MD5/SHA1), insecure PRNGs for tokens or ids (Math.random, random.randint), " +
      "disabled TLS or certificate verification, cleartext transmission of credentials, weak key sizes or ECB mode.",
    exclusions: "injection, committed secret values, auth flows and dependency selection — other panel members own those.",
    cwes: ["CWE-327", "CWE-328", "CWE-330", "CWE-295", "CWE-319", "CWE-326", "CWE-310"],
  },
];

export const SPECIALIST_BY_ID = Object.fromEntries(SPECIALISTS.map((s) => [s.id, s])) as Record<SpecialistId, Specialist>;

export const isSpecialist = (a: string): a is SpecialistId => a in SPECIALIST_BY_ID;

/* ── execution ────────────────────────────────────────────── */

interface RawFinding {
  line: number; severity: Severity; confidence: number;
  title: string; issue: string; recommendation: string; cwe?: string | null;
}

export interface PanelReport {
  findings: Finding[];                       // novel LLM findings (offline: [])
  tokensIn: number;
  tokensOut: number;
  perAgent: Record<SpecialistId, { count: number; corroborated: number; ms: number }>;
}

export interface PanelOptions {
  files: ParsedFile[];
  settings: Settings;
  useLLM: boolean;
  /** deterministic security findings — adopted (offline) or corroborated (LLM) in place */
  ruleFindings: Finding[];
  cancelled: () => boolean;
  agentStatus: (id: SpecialistId, status: "running" | "done", count?: number) => void;
  log: (id: SpecialistId | "orchestrator", text: string) => void;
}

const SCHEMA =
  '{"line": <int>, "severity": "critical|high|medium|low|info", "confidence": <0..1>, ' +
  '"title": <str>, "issue": <str>, "recommendation": <str>, "cwe": <str|null>}';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function systemPrompt(s: Specialist): string {
  return [
    `You are the ${s.name}, one of five specialist agents on a security panel auditing a pull request in parallel.`,
    `Your exclusive domain: ${s.focus}`,
    `Never report: ${s.exclusions}`,
    "Report ONLY genuine issues on the ADDED lines, citing the exact line numbers shown. No style nits, no speculation about unseen code, no duplicates.",
    `Respond with ONLY a JSON array. Each item: ${SCHEMA}`,
  ].join("\n");
}

async function runSpecialist(
  s: Specialist, files: ParsedFile[], settings: Settings, o: PanelOptions,
): Promise<{ findings: Finding[]; tokensIn: number; tokensOut: number }> {
  const findings: Finding[] = [];
  let tokensIn = 0, tokensOut = 0;
  // per-agent budget: 3 most-changed files × 130 added lines
  const budget = [...files]
    .filter((f) => f.added.length > 0)
    .sort((a, b) => b.added.length - a.added.length)
    .slice(0, 3);

  for (const f of budget) {
    if (o.cancelled()) break;
    const added = f.added.slice(0, 130);
    if (added.length === 0) continue;
    o.log(s.id, `→ ${f.path}: scanning ${added.length} added line(s) for ${s.short.toLowerCase()} patterns`);
    const prompt = `File: ${f.path} (language: ${f.lang})\nAdded lines:\n` +
      added.map((a) => `L${a.line}: ${a.text}`).join("\n");
    const res = await callLLM(
      settings.provider as "anthropic" | "openai", settings.apiKey, settings.model,
      systemPrompt(s), prompt,
    );
    tokensIn += res.inputTokens;
    tokensOut += res.outputTokens;
    o.log(s.id, `← ${res.model}: ${res.inputTokens}+${res.outputTokens} tok`);

    for (const r of extractJsonArray<RawFinding>(res.text)) {
      if (!Number.isFinite(r.line) || !r.title) continue;
      const line = added.some((a) => a.line === r.line) ? r.line : added[0].line;
      const sev: Severity = SEV_ORDER.includes(r.severity) ? r.severity : "medium";
      findings.push({
        id: `${f.path}:${line}:${s.id}-${findings.length}`,
        agent: s.id, detector: "llm", severity: sev,
        confidence: Math.min(0.97, Math.max(0.4, Number(r.confidence) || 0.6)),
        file: f.path, line, title: r.title,
        issue: r.issue || "", recommendation: r.recommendation || "",
        excerpt: f.added.find((a) => a.line === line)?.text ?? "",
        cwe: r.cwe || undefined,
      });
    }
  }
  return { findings, tokensIn, tokensOut };
}

/** corroborate specialist findings against rule hits; mutates rule findings in place */
function corroborate(spec: Finding[], rules: Finding[], s: SpecialistId): number {
  let hits = 0;
  for (const lf of spec) {
    const near = rules.find(
      (rf) => rf.agent === "security" && rf.file === lf.file && Math.abs(rf.line - lf.line) <= 3,
    );
    if (near) {
      near.detector = "hybrid";
      near.agent = s; // the specialist that confirmed it now owns it
      near.confidence = Math.min(0.98, Math.max(near.confidence, lf.confidence) + 0.03);
      hits++;
    }
  }
  return hits;
}

export async function runSecurityPanel(o: PanelOptions): Promise<PanelReport> {
  const perAgent = Object.fromEntries(
    SPECIALISTS.map((s) => [s.id, { count: 0, corroborated: 0, ms: 0 }]),
  ) as PanelReport["perAgent"];

  if (!o.useLLM) {
    // offline: each specialist adopts the rule findings inside its CWE domain
    for (let i = 0; i < SPECIALISTS.length; i++) {
      const s = SPECIALISTS[i];
      o.agentStatus(s.id, "running");
      await wait(140);
      if (o.cancelled()) return { findings: [], tokensIn: 0, tokensOut: 0, perAgent };
      const owned = o.ruleFindings.filter((f) => f.agent === "security" && f.cwe && s.cwes.includes(f.cwe));
      for (const f of owned) f.agent = s.id;
      perAgent[s.id] = { count: owned.length, corroborated: owned.length, ms: 140 };
      o.agentStatus(s.id, "done", owned.length);
      o.log(s.id, `offline — adopted ${owned.length} deterministic finding(s) in [${s.cwes.slice(0, 4).join(", ")}${s.cwes.length > 4 ? "…" : ""}]`);
    }
    const leftover = o.ruleFindings.filter((f) => f.agent === "security").length;
    if (leftover > 0) o.log("orchestrator", `${leftover} rule finding(s) outside panel domains stay with the general security bucket`);
    return { findings: [], tokensIn: 0, tokensOut: 0, perAgent };
  }

  // LLM mode: five concurrent provider calls, staggered 120ms so the LEDs ripple
  o.log("orchestrator", `dispatching ${SPECIALISTS.length}-specialist security panel → ${o.settings.model} (parallel)`);
  const novel: Finding[] = [];
  let tokensIn = 0, tokensOut = 0;

  await Promise.allSettled(
    SPECIALISTS.map(async (s, i) => {
      o.agentStatus(s.id, "running");
      await wait(i * 120);
      const t0 = performance.now();
      try {
        const r = await runSpecialist(s, o.files, o.settings, o);
        const corr = corroborate(r.findings, o.ruleFindings, s.id);
        novel.push(...r.findings.filter((lf) =>
          !o.ruleFindings.some((rf) => rf.agent === s.id && rf.file === lf.file && Math.abs(rf.line - lf.line) <= 3),
        ));
        tokensIn += r.tokensIn;
        tokensOut += r.tokensOut;
        perAgent[s.id] = { count: r.findings.length, corroborated: corr, ms: performance.now() - t0 };
        o.agentStatus(s.id, "done", r.findings.length);
        o.log(s.id, `${r.findings.length} candidate(s): ${corr} corroborated by rules · ${((performance.now() - t0) / 1000).toFixed(1)}s`);
      } catch (err) {
        perAgent[s.id] = { count: 0, corroborated: 0, ms: performance.now() - t0 };
        o.agentStatus(s.id, "done", 0);
        o.log(s.id, `call failed (${err instanceof Error ? err.message : String(err)}) — deterministic findings stand for this domain`);
      }
    }),
  );

  return { findings: novel, tokensIn, tokensOut, perAgent };
}
