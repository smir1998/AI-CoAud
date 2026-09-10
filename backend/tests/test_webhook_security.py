"""Tests for webhook signature verification and security policy."""
import hashlib
import hmac
import pytest
from fastapi.testclient import TestClient

from server import app, verify_signature, settings


@pytest.fixture
def client():
    """Test client with fresh app instance."""
    return TestClient(app)


@pytest.fixture
def sample_payload():
    """Sample GitHub webhook payload."""
    return b'{"action": "opened", "pull_request": {"number": 123}}'


def make_signature(payload: bytes, secret: str) -> str:
    """Generate valid HMAC-SHA256 signature."""
    return "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


class TestWebhookSignatureVerification:
    """Test webhook signature verification security policy."""

    def test_valid_signature_accepted(self, sample_payload):
        """Valid signature should be accepted."""
        secret = "test-secret-123"
        settings.github_webhook_secret = secret
        signature = make_signature(sample_payload, secret)
        
        # Should not raise
        verify_signature(sample_payload, signature)

    def test_invalid_signature_rejected(self, sample_payload):
        """Invalid signature should be rejected."""
        settings.github_webhook_secret = "test-secret-123"
        invalid_signature = "sha256=invalid"
        
        with pytest.raises(Exception) as exc_info:
            verify_signature(sample_payload, invalid_signature)
        assert exc_info.value.status_code == 401

    def test_missing_signature_rejected_when_secret_configured(self, sample_payload):
        """Missing signature should be rejected when secret is configured."""
        settings.github_webhook_secret = "test-secret-123"
        
        with pytest.raises(Exception) as exc_info:
            verify_signature(sample_payload, None)
        assert exc_info.value.status_code == 401

    def test_missing_secret_rejects_in_production(self, sample_payload):
        """Missing secret without dev flag should reject (fail-closed)."""
        settings.github_webhook_secret = ""
        settings.dev_allow_unsigned_webhooks = False
        
        with pytest.raises(Exception) as exc_info:
            verify_signature(sample_payload, None)
        assert exc_info.value.status_code == 401
        assert "not configured" in str(exc_info.value.detail).lower()

    def test_missing_secret_allows_in_dev_mode(self, sample_payload):
        """Missing secret with dev flag should allow with warning."""
        settings.github_webhook_secret = ""
        settings.dev_allow_unsigned_webhooks = True
        
        # Should not raise
        verify_signature(sample_payload, None)
        
        # Reset for other tests
        settings.dev_allow_unsigned_webhooks = False

    def test_tampered_payload_rejected(self, sample_payload):
        """Tampered payload should be rejected."""
        secret = "test-secret-123"
        settings.github_webhook_secret = secret
        signature = make_signature(sample_payload, secret)
        
        # Tamper with payload
        tampered = sample_payload.replace(b"123", b"999")
        
        with pytest.raises(Exception) as exc_info:
            verify_signature(tampered, signature)
        assert exc_info.value.status_code == 401

    def test_webhook_endpoint_size_limit(self, client):
        """Webhook endpoint should reject oversized payloads."""
        settings.github_webhook_secret = "test"
        settings.max_webhook_bytes = 1000
        
        # Create payload larger than limit
        large_payload = b'{"data": "' + b"x" * 2000 + b'"}'
        signature = make_signature(large_payload, "test")
        
        response = client.post(
            "/webhook",
            content=large_payload,
            headers={
                "X-Hub-Signature-256": signature,
                "X-GitHub-Event": "pull_request",
            },
        )
        
        assert response.status_code == 413
        assert "too large" in response.json()["detail"].lower()

    def test_webhook_endpoint_rejects_unsigned_in_production(self, client, sample_payload):
        """Webhook endpoint should reject unsigned requests in production."""
        settings.github_webhook_secret = ""
        settings.dev_allow_unsigned_webhooks = False
        
        response = client.post(
            "/webhook",
            content=sample_payload,
            headers={"X-GitHub-Event": "pull_request"},
        )
        
        assert response.status_code == 401
        assert "not configured" in response.json()["detail"].lower()

    def test_webhook_endpoint_allows_unsigned_in_dev(self, client, sample_payload):
        """Webhook endpoint should allow unsigned requests in dev mode."""
        settings.github_webhook_secret = ""
        settings.dev_allow_unsigned_webhooks = True
        
        response = client.post(
            "/webhook",
            content=sample_payload,
            headers={"X-GitHub-Event": "ping"},
        )
        
        # Should not be 401 (may be 200 for ping or other status)
        assert response.status_code != 401
        
        # Reset
        settings.dev_allow_unsigned_webhooks = False


class TestRepositoryAllowlist:
    """Test repository allowlist filtering."""

    def test_empty_allowlist_accepts_all(self):
        """Empty allowlist should accept all repositories."""
        settings.allowed_repos = ""
        allowlist = settings.repo_allowlist
        assert len(allowlist) == 0

    def test_allowlist_parses_comma_separated(self):
        """Allowlist should parse comma-separated repositories."""
        settings.allowed_repos = "owner/repo1,owner/repo2, owner/repo3 "
        allowlist = settings.repo_allowlist
        assert allowlist == {"owner/repo1", "owner/repo2", "owner/repo3"}

    def test_allowlist_filters_whitespace(self):
        """Allowlist should filter whitespace-only entries."""
        settings.allowed_repos = "owner/repo1, ,owner/repo2,  "
        allowlist = settings.repo_allowlist
        assert allowlist == {"owner/repo1", "owner/repo2"}
