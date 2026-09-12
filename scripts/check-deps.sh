#!/usr/bin/env bash
# Local mirror of the FULL CI backend gate — run before committing ANY
# backend/ change. Everything that can turn the backend job red is checked
# here in seconds, with readable output, instead of inside an opaque run:
#
#   1. pin-guard    — rejects the exact patterns that caused this repo's
#                     dependency failures (hard pins on agent-owned libs,
#                     pydantic-settings below crewai's floor, httpx floors)
#   2. syntax gate  — python -m compileall (catches broken edits pre-lint)
#   3. lint         — ruff check --select E9,F (unused imports/vars, undefs)
#   4. resolve-check— pip install --dry-run (full graph, pip's full log)
#
# Usage: bash scripts/check-deps.sh
set -euo pipefail
cd "$(dirname "$0")/.."

REQ=backend/requirements.txt
echo "── manifest under test ($REQ @ $(git rev-parse --short HEAD 2>/dev/null || echo '?')) ──"
sha256sum "$REQ" 2>/dev/null || shasum -a 256 "$REQ"
echo

echo "── 1/4 pin-guard ──────────────────────────────────────"
fail=0
if grep -Eq '^(anthropic|openai)==?' "$REQ"; then
  echo "✘ $(basename "$REQ"): hard pin on anthropic/openai — litellm (inside crewai)"
  echo "  owns those versions. Delete the line; the backend imports neither directly."
  fail=1
fi
if grep -Eq '^pydantic-settings(==|>=)([01]\.|2\.(0|1[0-3])(\.|,|$))' "$REQ"; then
  echo "✘ $(basename "$REQ"): pydantic-settings pinned BELOW 2.14.2 — crewai 1.15.18"
  echo "  requires >=2.14.2 (also the GHSA-4xgf-cpjx-pc3j security floor)."
  fail=1
fi
if grep -Eq '^httpx>=?' "$REQ"; then
  echo "✘ $(basename "$REQ"): httpx has a LOWER bound — the agent tree owns the"
  echo "  floor (litellm). Use only the major cap: 'httpx<1.0'."
  fail=1
fi
[ "$fail" -eq 0 ] || exit 1
echo "✔ no forbidden pin patterns"
echo

echo "── 2/4 syntax gate ────────────────────────────────────"
python -m compileall -q backend
echo "✔ all backend modules compile"
echo

echo "── 3/4 lint (ruff E9,F) ───────────────────────────────"
if command -v ruff >/dev/null 2>&1; then
  ruff check backend --select E9,F --no-fix
else
  python -m pip install --quiet "ruff>=0.9,<1.0"
  ruff check backend --select E9,F --no-fix
fi
echo "✔ lint clean"
echo

echo "── 4/4 dependency resolve-check ───────────────────────"
PIP_INDEX_URL="${PIP_INDEX_URL:-https://pypi.org/simple}"
export PIP_INDEX_URL
python -m pip install --upgrade pip --quiet
pip --version
echo "index: $PIP_INDEX_URL"
pip install --dry-run -r "$REQ"
echo
echo "✔ ALL BACKEND GATES PASS — safe to commit & push"
