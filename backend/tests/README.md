# Backend Tests

Comprehensive test suite for AI CoAudS backend functionality.

## Test Coverage

### `test_webhook_security.py`
Tests for webhook signature verification and security policy:
- Valid/invalid signature handling
- Missing signature rejection
- Fail-closed behavior in production
- Dev mode unsigned webhook allowance
- Payload size limits
- Repository allowlist filtering

### `test_github_client.py`
Tests for GitHub API client:
- PR fetching with pagination
- Rate limit handling and warnings
- Review comment chunking (>50 comments)
- Fallback to issue comments on failure
- Error handling for non-JSON responses

### `test_tools.py`
Tests for deterministic static analysis tool runner:
- Missing tool handling (returns "skipped")
- Timeout handling
- Exception handling (doesn't crash audit)
- Semgrep/Bandit/Ruff/pip-audit output parsing
- Parallel tool execution
- Empty file handling

### `test_agents.py`
Tests for LLM agent functionality:
- JSON extraction from LLM output
- Diff text trimming
- Security agent with CrewAI and Anthropic fallback
- Style agent functionality
- Refactor agent success/failure handling
- Invalid JSON handling

## Running Tests

```bash
cd backend
python -m pytest tests/ -v
```

### With Coverage

```bash
python -m pytest tests/ --cov=. --cov-report=html
```

### Specific Test File

```bash
python -m pytest tests/test_webhook_security.py -v
```

### Specific Test

```bash
python -m pytest tests/test_webhook_security.py::TestWebhookSignatureVerification::test_valid_signature_accepted -v
```

## Test Requirements

Tests require the following packages (installed in CI):
- pytest
- pytest-asyncio
- pytest-cov
- httpx

Install locally:
```bash
pip install pytest pytest-asyncio pytest-cov httpx
```

## Security Testing

The webhook security tests verify the fail-closed security policy:
- **Production**: Missing `GITHUB_WEBHOOK_SECRET` → rejects all webhooks
- **Development**: `DEV_ALLOW_UNSIGNED_WEBHOOKS=true` → allows unsigned with warning
- **With Secret**: Validates HMAC-SHA256 signature

This ensures webhooks cannot be forged in production while allowing local development without configuring secrets.

## CI Integration

Tests run automatically in GitHub Actions on every push and pull request.
See `.github/workflows/ci.yml` for the complete CI pipeline.
