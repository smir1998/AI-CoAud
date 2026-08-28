/* Implementation browser — serves the REAL files from the repository.
 * Imported with Vite's ?raw so the tab is always byte-identical to what
 * ships in the container. No embedded copies to drift out of sync. */

import serverPy from "../../backend/server.py?raw";
import pipelinePy from "../../backend/pipeline.py?raw";
import agentsPy from "../../backend/agents.py?raw";
import statePy from "../../backend/state.py?raw";
import githubClientPy from "../../backend/github_client.py?raw";
import toolsPy from "../../backend/tools.py?raw";
import validationPy from "../../backend/validation.py?raw";
import requirementsTxt from "../../backend/requirements.txt?raw";
import envExample from "../../backend/.env.example?raw";
import backendDockerfile from "../../backend/Dockerfile?raw";
import composeYml from "../../docker-compose.yml?raw";
import webDockerfile from "../../deploy/Dockerfile.web?raw";
import nginxConf from "../../deploy/nginx.conf?raw";
import ciYml from "../../.github/workflows/ci.yml?raw";

export interface CodeFile {
  name: string;
  note: string;
  lang: "python" | "yaml" | "docker" | "nginx" | "env" | "text";
  code: string;
}

export const CODE_FILES: CodeFile[] = [
  { name: "server.py", note: "FastAPI webhook — HMAC verify, bounded worker pool", lang: "python", code: serverPy },
  { name: "pipeline.py", note: "Orchestrator — parallel audit, corroboration, review", lang: "python", code: pipelinePy },
  { name: "agents.py", note: "CrewAI crew — security, style, refactor, review", lang: "python", code: agentsPy },
  { name: "state.py", note: "AuditState + Redis store with in-memory fallback", lang: "python", code: statePy },
  { name: "github_client.py", note: "httpx client — diffs, chunked reviews, rate-limit aware", lang: "python", code: githubClientPy },
  { name: "tools.py", note: "Semgrep / Bandit / Ruff / pip-audit with timeouts", lang: "python", code: toolsPy },
  { name: "validation.py", note: "Prove patches parse & apply before posting", lang: "python", code: validationPy },
  { name: "requirements.txt", note: "Pinned runtime — service, agents, scanners", lang: "text", code: requirementsTxt },
  { name: ".env.example", note: "Every secret + tunable the service reads", lang: "env", code: envExample },
  { name: "backend/Dockerfile", note: "Slim image, non-root user, healthcheck", lang: "docker", code: backendDockerfile },
  { name: "docker-compose.yml", note: "web + api + redis with health-gated startup", lang: "yaml", code: composeYml },
  { name: "deploy/Dockerfile.web", note: "Multi-stage SPA build → hardened nginx", lang: "docker", code: webDockerfile },
  { name: "deploy/nginx.conf", note: "CSP locked to real endpoints, immutable assets", lang: "nginx", code: nginxConf },
  { name: ".github/workflows/ci.yml", note: "Typecheck · python gate · signed ghcr images", lang: "yaml", code: ciYml },
];
