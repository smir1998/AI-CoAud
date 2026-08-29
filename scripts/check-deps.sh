#!/usr/bin/env bash
# Fast local mirror of CI's "resolve-check requirements" step.
# Run before committing dependency changes — conflicts surface here in
# seconds with pip's full log, instead of inside an opaque buildx run.
set -euo pipefail
cd "$(dirname "$0")/.."

python -m pip install --upgrade pip --quiet
echo "── manifest under test (backend/requirements.txt @ $(git rev-parse --short HEAD 2>/dev/null || echo '?')) ──"
cat backend/requirements.txt
echo "──────────────────────────────────────────────────────"
pip --version
pip install --dry-run -r backend/requirements.txt
echo "✔ dependency graph resolves"
