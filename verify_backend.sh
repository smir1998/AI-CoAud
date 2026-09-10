#!/bin/bash
# Quick verification script to check if the backend is properly set up

set -e

echo "=== AI CoAudS Backend Verification ==="
echo

# Check if we're in the right directory
if [ ! -f "backend/server.py" ]; then
    echo "❌ Error: backend/server.py not found"
    echo "Please run this script from the repository root"
    exit 1
fi

echo "✓ Found backend/server.py"

# Check Python syntax
echo
echo "=== Checking Python syntax ==="
python -m py_compile backend/server.py
python -m py_compile backend/config.py
python -m py_compile backend/state.py
python -m py_compile backend/github_client.py
python -m py_compile backend/agents.py
python -m py_compile backend/tools.py
python -m py_compile backend/pipeline.py
echo "✓ All Python files have valid syntax"

# Check if test files exist
echo
echo "=== Checking test files ==="
test_files=(
    "backend/tests/__init__.py"
    "backend/tests/conftest.py"
    "backend/tests/test_webhook_security.py"
    "backend/tests/test_github_client.py"
    "backend/tests/test_tools.py"
    "backend/tests/test_agents.py"
)

for file in "${test_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Missing test file: $file"
        exit 1
    fi
    echo "✓ Found $file"
done

# Check if requirements files exist
echo
echo "=== Checking requirements files ==="
if [ ! -f "backend/requirements.txt" ]; then
    echo "❌ Missing backend/requirements.txt"
    exit 1
fi
echo "✓ Found backend/requirements.txt"

if [ ! -f "backend/requirements-test.txt" ]; then
    echo "❌ Missing backend/requirements-test.txt"
    exit 1
fi
echo "✓ Found backend/requirements-test.txt"

# Check CI workflow
echo
echo "=== Checking CI workflow ==="
if [ ! -f ".github/workflows/ci.yml" ]; then
    echo "❌ Missing .github/workflows/ci.yml"
    exit 1
fi
echo "✓ Found .github/workflows/ci.yml"

# Check for duplicate steps in CI
duplicate_count=$(grep -c "name: vuln-scan" .github/workflows/ci.yml || true)
if [ "$duplicate_count" -gt 1 ]; then
    echo "❌ Found $duplicate_count vuln-scan steps in CI (should be 1)"
    exit 1
fi
echo "✓ CI workflow has no duplicate steps"

echo
echo "=== All checks passed! ==="
echo
echo "To run tests locally:"
echo "  cd backend"
echo "  pip install -r requirements-test.txt"
echo "  pytest tests/ -v"
echo
echo "To verify security fix:"
echo "  pytest backend/tests/test_webhook_security.py -v"
