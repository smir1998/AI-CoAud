#!/bin/bash
# Quick start guide to verify and commit all fixes

echo "=========================================="
echo "AI CoAudS - Fix Verification & Commit"
echo "=========================================="
echo

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Step 1: Check if we're in the right directory
echo "Step 1: Checking repository structure..."
if [ ! -f "backend/server.py" ]; then
    print_error "backend/server.py not found"
    print_info "Please run this script from the repository root"
    exit 1
fi
print_success "Repository structure OK"
echo

# Step 2: Verify Python syntax
echo "Step 2: Verifying Python syntax..."
python -m py_compile backend/server.py 2>/dev/null
if [ $? -eq 0 ]; then
    print_success "server.py syntax OK"
else
    print_error "server.py has syntax errors"
    exit 1
fi

python -m py_compile backend/config.py 2>/dev/null
if [ $? -eq 0 ]; then
    print_success "config.py syntax OK"
else
    print_error "config.py has syntax errors"
    exit 1
fi
echo

# Step 3: Check test files
echo "Step 3: Checking test files..."
test_files=(
    "backend/tests/__init__.py"
    "backend/tests/conftest.py"
    "backend/tests/test_webhook_security.py"
    "backend/tests/test_github_client.py"
    "backend/tests/test_tools.py"
    "backend/tests/test_agents.py"
)

all_tests_exist=true
for file in "${test_files[@]}"; do
    if [ -f "$file" ]; then
        print_success "Found $file"
    else
        print_error "Missing $file"
        all_tests_exist=false
    fi
done

if [ "$all_tests_exist" = false ]; then
    print_error "Some test files are missing"
    exit 1
fi
echo

# Step 4: Check for test requirements
echo "Step 4: Checking test requirements..."
if [ ! -f "backend/requirements-test.txt" ]; then
    print_error "backend/requirements-test.txt not found"
    exit 1
fi
print_success "requirements-test.txt found"
echo

# Step 5: Verify CI workflow
echo "Step 5: Verifying CI workflow..."
if [ ! -f ".github/workflows/ci.yml" ]; then
    print_error ".github/workflows/ci.yml not found"
    exit 1
fi

# Check for duplicate vuln-scan steps
duplicate_count=$(grep -c "name: vuln-scan" .github/workflows/ci.yml 2>/dev/null || echo 0)
if [ "$duplicate_count" -eq 1 ]; then
    print_success "CI workflow OK (no duplicate steps)"
elif [ "$duplicate_count" -eq 0 ]; then
    print_error "No vuln-scan step found in CI"
    exit 1
else
    print_error "Found $duplicate_count vuln-scan steps (should be 1)"
    exit 1
fi
echo

# Step 6: Summary
echo "=========================================="
echo "Verification Complete!"
echo "=========================================="
echo
print_success "All checks passed!"
echo
echo "Next steps:"
echo "1. Install test dependencies:"
echo "   cd backend && pip install -r requirements-test.txt"
echo
echo "2. Run tests:"
echo "   cd backend && pytest tests/ -v"
echo
echo "3. Commit and push:"
echo "   git add -A"
echo "   git commit -m \"fix: resolve webhook signature bypass and test infrastructure\""
echo "   git push origin main"
echo
echo "4. Monitor GitHub Actions for successful pipeline"
echo
print_info "See COMPLETE_FIX_SUMMARY.md for detailed information"
