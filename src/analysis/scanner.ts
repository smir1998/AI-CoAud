/* Sentinel Crew — deterministic analysis core.
   Unified-diff parsing + a real Semgrep/Bandit-style rule engine.
   Everything here runs on actual code the user supplies — no scripted results. */

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Lang = "py" | "js" | "ts" | "other";

export interface DiffRow {
  type: "add" | "del" | "ctx" | "hunk";
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

export interface ParsedFile {
  path: string;
  lang: Lang;
  rows: DiffRow[];
  added: { line: number; text: string }[];
  additions: number;
  deletions: number;
}

export interface FindingPatch {
  before: string;
  after: string;
  note: string;
  source: "template" | "llm";
}

export interface Finding {
  id: string;
  agent: "security" | "style";
  detector: "rule" | "llm" | "hybrid";
  rule?: string;
  severity: Severity;
  confidence: number; // 0..1
  file: string;
  line: number;
  title: string;
  issue: string;
  recommendation: string;
  excerpt: string;
  cwe?: string;
  patch?: FindingPatch;
}

/* ── language detection ───────────────────────────────────── */

export function langOf(path: string): Lang {
  if (/\.(py|pyi)$/.test(path)) return "py";
  if (/\.(js|jsx|mjs|cjs)$/.test(path)) return "js";
  if (/\.(ts|tsx)$/.test(path)) return "ts";
  return "other";
}

/* ── unified diff parsing ─────────────────────────────────── */

const HUNK_RE = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@\s*(.*)$/;

const makeFile = (path: string): ParsedFile =>
  ({ path, lang: langOf(path), rows: [], added: [], additions: 0, deletions: 0 });

export function parseUnifiedDiff(patch: string, fallbackPath?: string): ParsedFile[] {
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  const files: ParsedFile[] = [];
  let cur: ParsedFile | null = null;
  let oldNo: number | null = null;
  let newNo: number | null = null;

  if (fallbackPath) {
    cur = makeFile(fallbackPath);
    files.push(cur);
  }

  for (const raw of lines) {
    const line = raw;
    if (line.startsWith("diff --git ")) {
      const m = line.match(/diff --git a\/(.+) b\/(.+)/);
      cur = makeFile(m ? m[2] : "unknown");
      files.push(cur);
      oldNo = newNo = null;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const p = line.slice(4).replace(/^b\//, "").trim();
      if (p && p !== "/dev/null") {
        if (!cur || cur.rows.length > 0 || cur.path !== p) {
          cur = makeFile(p);
          files.push(cur);
          oldNo = newNo = null;
        } else {
          cur.path = p;
        }
      }
      continue;
    }
    if (line.startsWith("--- ") || line.startsWith("index ") ||
        line.startsWith("new file") || line.startsWith("deleted file") ||
        line.startsWith("similarity ") || line.startsWith("rename ") ||
        line.startsWith("Binary files") || line.startsWith("\\ No newline")) continue;

    const hunk = line.match(HUNK_RE);
    if (hunk && cur) {
      oldNo = parseInt(hunk[1], 10);
      newNo = parseInt(hunk[3], 10);
      cur.rows.push({ type: "hunk", oldNo: null, newNo: null, text: line });
      continue;
    }
    if (!cur || oldNo === null || newNo === null) continue;

    const tag = line[0];
    const body = line.slice(1);
    if (tag === "+") {
      cur.rows.push({ type: "add", oldNo: null, newNo, text: body });
      cur.added.push({ line: newNo, text: body });
      cur.additions++;
      newNo++;
    } else if (tag === "-") {
      cur.rows.push({ type: "del", oldNo, newNo: null, text: body });
      cur.deletions++;
      oldNo++;
    } else {
      cur.rows.push({ type: "ctx", oldNo, newNo, text: body });
      oldNo++;
      newNo++;
    }
  }
  return files.filter((f) => f.path !== "/dev/null" && f.rows.length > 0);
}

/* ── rule engine ──────────────────────────────────────────── */

interface Fix {
  make: (line: string) => FindingPatch;
}

interface Rule {
  id: string;
  severity: Severity;
  confidence: number;
  cwe?: string;
  langs?: Lang[];
  match: RegExp;
  exclude?: RegExp;
  title: string;
  issue: string;
  recommendation: string;
  fix?: Fix;
}

const envish = /os\.environ|getenv|process\.env|settings\.|config\.|vault|placeholder|example|xxx|your[_-]/i;

const SEC_RULES: Rule[] = [
  {
    id: "SEC-023", severity: "critical", confidence: 0.99, cwe: "CWE-798",
    match: /BEGIN (RSA|OPENSSH|EC|DSA|PGP) PRIVATE KEY/,
    title: "Private key committed to source",
    issue: "A PEM private key block is being added to the repository. Anyone with read access to this repo (and its history, forever) can impersonate the key holder.",
    recommendation: "Remove the key, rotate it immediately, and load it from a secret manager or environment variable.",
    fix: { make: (l) => ({ before: l, after: 'private_key = os.environ["SERVICE_PRIVATE_KEY"]  # loaded from secret manager', note: "Secrets must never live in VCS — history must be rewritten and the key rotated.", source: "template" }) },
  },
  {
    id: "SEC-001", severity: "high", confidence: 0.98, cwe: "CWE-798",
    match: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
    title: "Hardcoded AWS access key",
    issue: "An AWS access key ID is committed in source. Long-lived static keys are a top credential-leak vector and are routinely swept by attackers.",
    recommendation: "Revoke the key in IAM, use IAM roles / instance profiles, and load any needed key from the environment.",
    fix: { make: (l) => ({ before: l, after: 'aws_access_key_id = os.environ["AWS_ACCESS_KEY_ID"]', note: "Rotate the exposed key — it must be considered compromised.", source: "template" }) },
  },
  {
    id: "SEC-002", severity: "high", confidence: 0.92, cwe: "CWE-798",
    match: /\b(?:password|passwd|secret|secret_key|api_key|apikey|auth_token|token)\s*[:=]\s*["'][^"']{6,}["']/i,
    exclude: envish,
    title: "Hardcoded secret / credential",
    issue: "A secret-looking value is assigned directly in code. Committed credentials persist in git history and leak to anyone with repo access.",
    recommendation: "Read the value from the environment or a secret manager and rotate the exposed credential.",
    fix: { make: (l) => {
      const m = l.match(/^(\s*)([\w.]+)\s*[:=]\s*/);
      const ind = m ? m[1] : "";
      const name = m ? m[2].split(".").pop()!.toUpperCase() : "SECRET";
      return { before: l, after: `${ind}${m ? m[2] : "secret"} = os.environ["${name}"]`, note: "Environment-backed configuration keeps secrets out of VCS.", source: "template" };
    } },
  },
  {
    id: "SEC-003", severity: "high", confidence: 0.94, cwe: "CWE-89",
    match: /(?:execute|executemany|cursor\.\w+|\.query)\s*\(\s*(?:f["']|["'].*["']\s*(?:%|\+|\.format))/i,
    exclude: /^\s*#/,
    title: "SQL built by string interpolation",
    issue: "User-controlled data is concatenated or f-string-formatted into a SQL statement. This is a classic SQL-injection sink: input can restructure the query.",
    recommendation: "Use parameterized queries — pass values as bound parameters, never interpolated text.",
    fix: { make: (l) => {
      const ind = l.match(/^\s*/)?.[0] ?? "";
      const call = l.match(/^(\s*)[\w.]*(execute|query)/)?.[0] ?? `${ind}cursor.execute`;
      return { before: l, after: `${call}(\n${ind}    "SELECT id, role FROM users WHERE email = %s AND active = %s",\n${ind}    (email, True),\n${ind})`, note: "Bound parameters are never interpreted as SQL by the driver.", source: "template" };
    } },
  },
  {
    id: "SEC-024", severity: "high", confidence: 0.9, cwe: "CWE-89", langs: ["js", "ts"],
    match: /(?:query|execute|raw)\s*\(\s*`[^`]*\$\{/,
    title: "SQL built with template literal",
    issue: "Values are interpolated into a SQL string with a template literal, which bypasses driver parameterization and enables injection.",
    recommendation: "Use the driver's placeholder syntax (?) and pass values as a separate array.",
  },
  {
    id: "SEC-013", severity: "high", confidence: 0.93, cwe: "CWE-347",
    match: /(?:jwt|decode)\b.*verify\s*=\s*False|options\s*=\s*\{[^}]*verify_signature[^}]*False/i,
    title: "JWT signature verification disabled",
    issue: "Tokens are decoded without verifying the signature, so any attacker can forge valid-looking tokens and escalate privileges.",
    recommendation: "Always verify signatures and claims (exp, iss, aud) with a strong algorithm.",
    fix: { make: (l) => {
      const ind = l.match(/^\s*/)?.[0] ?? "";
      return { before: l, after: `${ind}payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])`, note: "Verification is the only thing that makes a JWT trustworthy.", source: "template" };
    } },
  },
  {
    id: "SEC-005", severity: "high", confidence: 0.9, cwe: "CWE-95", langs: ["py"],
    match: /(?<![\w.])e(?:val|xec)\s*\(/,
    exclude: /cursor\.exec|\.execute|db\./,
    title: "Dynamic code execution (eval/exec)",
    issue: "eval()/exec() executes attacker-influenceable text as code. If any part of the expression derives from input, this is remote code execution.",
    recommendation: "Replace with ast.literal_eval for data, a parser, or an explicit dispatch table.",
    fix: { make: (l) => ({ before: l, after: l.replace(/\beval\s*\(/, "ast.literal_eval(").replace(/\bexec\s*\(/, "raise NotImplementedError  # exec removed — use a dispatch table  ("), note: "literal_eval only parses Python literals — no code execution.", source: "template" }) },
  },
  {
    id: "SEC-018", severity: "high", confidence: 0.9, cwe: "CWE-78", langs: ["js", "ts"],
    match: /child_process|\bexec\s*\(\s*`|\bexecSync\s*\(\s*`/,
    title: "Shell command built from template",
    issue: "A shell command interpolates runtime values. Metacharacters in input (;, &&, backticks) yield command injection.",
    recommendation: "Use execFile/spawn with an argument array — never a composed shell string.",
  },
  {
    id: "SEC-004", severity: "medium", confidence: 0.88, cwe: "CWE-78", langs: ["py"],
    match: /subprocess\.(?:run|call|Popen|check_output)\s*\(.*shell\s*=\s*True/,
    title: "shell=True subprocess call",
    issue: "shell=True routes the command through /bin/sh, so shell metacharacters in any interpolated value become command injection.",
    recommendation: "Pass the command as an argument list and drop shell=True.",
    fix: { make: (l) => ({ before: l, after: l.replace(/shell\s*=\s*True,?\s*/g, "").replace(/subprocess\.(\w+)\(\s*f?["']([^"']+)["']/, (mm, fn, cmd) => `subprocess.${fn}(${JSON.stringify(cmd.split(/\s+/))}`), note: "Argument lists are never re-parsed by a shell.", source: "template" }) },
  },
  {
    id: "SEC-006", severity: "medium", confidence: 0.9, cwe: "CWE-328",
    match: /hashlib\.(?:md5|sha1)\s*\(|\bmd5\s*\(|\bsha1\s*\(/,
    exclude: /checksum|integrity|etag/i,
    title: "Weak hash (MD5/SHA1) for credentials",
    issue: "MD5/SHA1 are collision-broken and GPU-fast to brute-force — unsuitable for password or token hashing.",
    recommendation: "Use a slow adaptive KDF: bcrypt, argon2, or scrypt with a per-user salt.",
    fix: { make: (l) => {
      const ind = l.match(/^\s*/)?.[0] ?? "";
      return { before: l, after: `${ind}hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12))`, note: "bcrypt's work factor keeps brute force expensive as hardware improves.", source: "template" };
    } },
  },
  {
    id: "SEC-007", severity: "medium", confidence: 0.9, cwe: "CWE-502", langs: ["py"],
    match: /pickle\.(?:load|loads)\s*\(/,
    title: "Deserialization with pickle",
    issue: "pickle executes arbitrary code during unpickling of untrusted data — a direct remote-code-execution path.",
    recommendation: "Deserialize with json/schema-validated formats; reserve pickle for trusted, internal data only.",
    fix: { make: (l) => ({ before: l, after: l.replace(/pickle\.(loads?)\(/, "json.load$1(".replace("json.loads(", "json.loads(")), note: "JSON cannot encode executable objects.", source: "template" }) },
  },
  {
    id: "SEC-010", severity: "medium", confidence: 0.9, cwe: "CWE-502", langs: ["py"],
    match: /yaml\.load\s*\((?![^)]*SafeLoader)/,
    title: "yaml.load without SafeLoader",
    issue: "Plain yaml.load can instantiate arbitrary Python objects (!!python/object), leading to code execution on crafted YAML.",
    recommendation: "Use yaml.safe_load, which only constructs basic types.",
    fix: { make: (l) => ({ before: l, after: l.replace(/yaml\.load\s*\(/, "yaml.safe_load("), note: "safe_load rejects object-construction tags.", source: "template" }) },
  },
  {
    id: "SEC-008", severity: "medium", confidence: 0.88, cwe: "CWE-295",
    match: /verify\s*=\s*False|CHECK_CERTIFICATES?\s*=\s*False|ssl\._create_unverified/i,
    title: "TLS certificate verification disabled",
    issue: "Disabling certificate verification allows any on-path attacker to impersonate the server (trivially exploitable MITM).",
    recommendation: "Keep verification on; if a private CA is required, pass its bundle to verify= instead.",
    fix: { make: (l) => ({ before: l, after: l.replace(/verify\s*=\s*False/, "verify=True"), note: "If the peer uses a private CA, set verify='/path/to/ca-bundle.pem'.", source: "template" }) },
  },
  {
    id: "SEC-009", severity: "medium", confidence: 0.87, cwe: "CWE-489", langs: ["py"],
    match: /(?:app\.run\s*\(.*debug\s*=\s*True|DEBUG\s*=\s*True)/,
    exclude: /^\s*#/,
    title: "Debug mode enabled",
    issue: "Framework debug mode exposes an interactive console and full tracebacks — effectively a remote shell and source disclosure in production.",
    recommendation: "Drive debug from an environment flag that defaults off in deployed settings.",
    fix: { make: (l) => {
      const ind = l.match(/^\s*/)?.[0] ?? "";
      return { before: l, after: l.includes("app.run") ? `${ind}app.run(debug=os.environ.get("FLASK_DEBUG", "0") == "1")` : `${ind}DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"`, note: "Debug stays available locally, off by default in production.", source: "template" };
    } },
  },
  {
    id: "SEC-012", severity: "medium", confidence: 0.8, cwe: "CWE-22", langs: ["py"],
    match: /os\.path\.join\s*\((?:[^)]*(?:request|user|input|param|filename|path))/i,
    exclude: /secure_filename|realpath.*startswith|basename/,
    title: "Path built from user input",
    issue: "Joining user-controlled names onto a base path permits ../ traversal to read or write outside the intended directory.",
    recommendation: "Sanitize with secure_filename/basename and verify the resolved path stays under the base with os.path.realpath.",
    fix: { make: (l) => {
      const ind = l.match(/^\s*/)?.[0] ?? "";
      return { before: l, after: `${ind}safe = os.path.realpath(os.path.join(BASE_DIR, secure_filename(name)))\n${ind}if not safe.startswith(os.path.realpath(BASE_DIR) + os.sep):\n${ind}    raise ValueError("path traversal blocked")`, note: "Resolving symlinks before the prefix check closes the classic bypasses.", source: "template" };
    } },
  },
  {
    id: "SEC-011", severity: "medium", confidence: 0.82, cwe: "CWE-330", langs: ["py"],
    match: /\brandom\.(?:random|randint|choice|randrange)\s*\(.*(token|secret|password|salt|nonce|otp)|\btoken.*random\.(?:random|randint|choice)/i,
    title: "Non-cryptographic PRNG for secrets",
    issue: "The random module is predictable — values derived from it (tokens, salts, OTPs) can be forecast by an attacker.",
    recommendation: "Use the secrets module (secrets.token_urlsafe / token_hex) for anything security-relevant.",
    fix: { make: (l) => ({ before: l, after: l.replace(/random\.randint\s*\([^)]*\)/, "int(secrets.token_hex(4), 16)").replace(/random\.(random|choice|randrange)\s*\([^)]*\)/, "secrets.token_urlsafe(32)"), note: "secrets draws from the OS CSPRNG.", source: "template" }) },
  },
  {
    id: "SEC-017", severity: "medium", confidence: 0.85, cwe: "CWE-79", langs: ["js", "ts"],
    match: /dangerouslySetInnerHTML/,
    title: "Unescaped HTML injection (React)",
    issue: "dangerouslySetInnerHTML renders raw markup; any user-controlled content in it is stored XSS.",
    recommendation: "Render with DOMPurify-sanitized content, or restructure to React elements.",
  },
  {
    id: "SEC-022", severity: "low", confidence: 0.75, cwe: "CWE-319",
    match: /["']http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[^"']+["']/,
    exclude: /schema|example|w3\.org|xmlns|namespace/i,
    title: "Cleartext HTTP endpoint",
    issue: "Traffic to a plaintext http:// endpoint can be read and tampered with on path.",
    recommendation: "Use https:// and enable HSTS on the service.",
  },
  {
    id: "SEC-014", severity: "low", confidence: 0.85, cwe: "CWE-732",
    match: /0o?777|chmod.*777/,
    title: "World-writable permissions (0777)",
    issue: "0777 lets any local user modify the file/directory — a privilege-escalation stepping stone.",
    recommendation: "Use the narrowest mode that works (0750/0640) and explicit ownership.",
  },
  {
    id: "SEC-021", severity: "low", confidence: 0.8, cwe: "CWE-532",
    match: /(?:print|console\.log|logger\.\w+)\s*\(.*(?:password|token|secret|api_key)/i,
    title: "Sensitive value written to logs",
    issue: "Credentials printed to stdout/logs persist in log pipelines and are visible to anyone with log access.",
    recommendation: "Log a redacted placeholder instead; never the raw secret.",
  },
  {
    id: "SEC-020", severity: "info", confidence: 0.9,
    match: /#\s*(TODO|FIXME|XXX)\b.*\b(security|auth|secret|vuln|hack|unsafe)\b/i,
    title: "Security-tagged TODO in new code",
    issue: "A TODO/FIXME referencing security is landing in the codebase — tech debt with a security label tends to get exploited before it gets fixed.",
    recommendation: "Resolve before merge or file a tracked ticket and reference it in the comment.",
  },
];

/* ── style heuristics ─────────────────────────────────────── */

const STYLE_TESTS: { id: string; re: RegExp; severity: Severity; confidence: number; title: string; issue: string; recommendation: string }[] = [
  { id: "STY-003", re: /^\s*except\s*:\s*(#.*)?$/, severity: "medium", confidence: 0.9, title: "Bare except clause", issue: "except: swallows KeyboardInterrupt, SystemExit and every real bug — failures become invisible.", recommendation: "Catch the specific exception types you can actually handle." },
  { id: "STY-011", re: /^\s*except\s+(Exception|BaseException)[^:]*:\s*(pass|continue)\s*(#.*)?$/, severity: "medium", confidence: 0.88, title: "Exception silently swallowed", issue: "Catching Exception and passing hides errors that will resurface later as corrupted state.", recommendation: "Log and re-raise, or handle a narrow exception with recovery." },
  { id: "STY-009", re: /def\s+\w+\s*\([^)]*=\s*(\[\]|\{\})/, severity: "medium", confidence: 0.95, title: "Mutable default argument", issue: "The default list/dict is created once and shared across calls — a classic state-leak bug.", recommendation: "Default to None and construct the collection inside the function." },
  { id: "STY-005", re: /(?<![\w.])print\s*\(/, severity: "low", confidence: 0.8, title: "print() in library code", issue: "Print statements bypass logging levels and pollute stdout in services and tests.", recommendation: "Use the logging module with an appropriate level." },
  { id: "STY-012", re: /^\s*from\s+[\w.]+\s+import\s+\*/, severity: "low", confidence: 0.9, title: "Wildcard import", issue: "import * hides dependencies, causes name collisions and defeats static analysis.", recommendation: "Import the specific names you use." },
  { id: "STY-006", re: /^\s*(?:async\s+)?def\s+[a-z]+[A-Z]\w*\s*\(/, severity: "low", confidence: 0.85, title: "Non-PEP8 function name", issue: "camelCase function names break Python convention and grep-ability.", recommendation: "Rename to snake_case." },
  { id: "STY-004", re: /#\s*(TODO|FIXME|XXX)\b/i, severity: "info", confidence: 0.95, title: "TODO/FIXME marker", issue: "Unresolved markers accumulate as invisible debt.", recommendation: "Track it in the issue tracker instead of the source." },
];

function scanStyleFiles(files: ParsedFile[]): Finding[] {
  const out: Finding[] = [];
  const seenLines = new Map<string, number>();
  let n = 0;

  for (const f of files) {
    if (f.lang === "py") {
      // per-function complexity & length over added lines
      const fnStarts: { line: number; name: string; indent: number }[] = [];
      let branches = 0;
      let body = 0;
      let current: (typeof fnStarts)[0] | null = null;
      const flush = () => {
        if (!current) return;
        if (branches > 9) out.push(mk("style", "rule", "STY-002", "medium", 0.78, f.path, current.line, `High cyclomatic complexity in ${current.name}()`, `~${branches + 1} independent paths through one function — hard to test and easy to break.`, "Split into smaller functions; extract conditionals into named predicates.", f, current.line));
        if (body > 45) out.push(mk("style", "rule", "STY-001", "low", 0.75, f.path, current.line, `${current.name}() is very long`, `~${body} added lines in a single function hurts readability and diff review.`, "Extract logical steps into helpers.", f, current.line));
      };
      for (const a of f.added) {
        const def = a.text.match(/^(\s*)(?:async\s+)?def\s+(\w+)/);
        if (def) {
          flush();
          current = { line: a.line, name: def[2], indent: def[1].length };
          branches = 0; body = 0;
          fnStarts.push(current);
          continue;
        }
        if (current && a.text.trim()) {
          body++;
          branches += (a.text.match(/\b(if|elif|for|while|except)\b|(\band\b|\bor\b)/g) || []).length;
        }
      }
      flush();
    }
    for (const a of f.added) {
      for (const t of STYLE_TESTS) {
        if (t.id === "STY-005" && /(test|tests)\//.test(f.path)) continue;
        if (t.re.test(a.text)) {
          out.push(mk("style", "rule", t.id, t.severity, t.confidence, f.path, a.line, t.title, t.issue, t.recommendation, f, a.line));
        }
      }
      if (a.text.length > 120) out.push(mk("style", "rule", "STY-008", "info", 0.95, f.path, a.line, "Line exceeds 120 characters", "Overlong lines hurt review quality and side-by-side diffs.", "Wrap or extract.", f, a.line));
      const key = a.text.trim();
      if (key.length > 24) seenLines.set(key, (seenLines.get(key) || 0) + 1);
      n++;
    }
  }
  // duplication across the diff
  for (const [text, count] of seenLines) {
    if (count >= 3) {
      const owner = files.flatMap((f) => f.added.filter((a) => a.text.trim() === text).map((a) => ({ f, a }))).slice(0, 1);
      for (const { f, a } of owner) {
        out.push(mk("style", "rule", "STY-010", "low", 0.7, f.path, a.line, "Duplicated code block", `The same logic appears ${count}× across the diff — fixes will drift between copies.`, "Extract a shared helper.", f, a.line));
      }
    }
  }
  return out;
}

function mk(agent: Finding["agent"], detector: Finding["detector"], rule: string, severity: Severity, confidence: number, file: string, line: number, title: string, issue: string, recommendation: string, f: ParsedFile, ln: number): Finding {
  return {
    id: `${file}:${line}:${rule}`,
    agent, detector, rule, severity, confidence, file, line, title, issue, recommendation,
    excerpt: f.added.find((a) => a.line === ln)?.text ?? "",
  };
}

export function scanFiles(files: ParsedFile[]): Finding[] {
  const out: Finding[] = [];
  for (const f of files) {
    for (const a of f.added) {
      for (const r of SEC_RULES) {
        if (r.langs && !r.langs.includes(f.lang)) continue;
        if (!r.match.test(a.text)) continue;
        if (r.exclude && r.exclude.test(a.text)) continue;
        const finding: Finding = {
          id: `${f.path}:${a.line}:${r.id}`,
          agent: "security", detector: "rule", rule: r.id,
          severity: r.severity, confidence: r.confidence,
          file: f.path, line: a.line, title: r.title,
          issue: r.issue, recommendation: r.recommendation,
          excerpt: a.text, cwe: r.cwe,
          patch: r.fix ? r.fix.make(a.text) : undefined,
        };
        out.push(finding);
      }
    }
  }
  return [...out, ...scanStyleFiles(files)];
}

/* ── patch validation (real checks on generated patches) ─── */

export function validatePatch(file: ParsedFile, patch: FindingPatch): { ok: boolean; reason: string } {
  const src = file.added.map((a) => a.text).join("\n");
  const beforeTrim = patch.before.trim();
  if (!beforeTrim) return { ok: false, reason: "empty target" };
  if (!src.includes(beforeTrim) && !file.rows.some((r) => r.text.trim() === beforeTrim)) {
    return { ok: false, reason: "target lines not found in file — patch would not apply" };
  }
  if (!patch.after.trim()) return { ok: false, reason: "replacement is empty" };
  const open = (patch.after.match(/[[{(]/g) || []).length;
  const close = (patch.after.match(/[\])}]/g) || []).length;
  if (Math.abs(open - close) > 1) return { ok: false, reason: "unbalanced brackets in replacement" };
  return { ok: true, reason: "target located · brackets balanced · non-empty replacement" };
}

export const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];
