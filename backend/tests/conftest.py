"""Shared test fixtures and configuration."""
import pytest
from unittest.mock import patch


@pytest.fixture(autouse=True)
def reset_settings():
    """Reset settings to defaults after each test."""
    from server import settings
    
    # Store original values
    original_secret = settings.github_webhook_secret
    original_dev_flag = settings.dev_allow_unsigned_webhooks
    original_allowlist = settings.allowed_repos
    original_max_bytes = settings.max_webhook_bytes
    
    yield
    
    # Restore original values
    settings.github_webhook_secret = original_secret
    settings.dev_allow_unsigned_webhooks = original_dev_flag
    settings.allowed_repos = original_allowlist
    settings.max_webhook_bytes = original_max_bytes


@pytest.fixture
def mock_redis():
    """Mock Redis connection."""
    with patch('state.redis.Redis') as mock_redis:
        mock_client = mock_redis.from_url.return_value
        mock_client.ping.return_value = True
        yield mock_client


@pytest.fixture
def mock_anthropic():
    """Mock Anthropic API client."""
    with patch('anthropic.AsyncAnthropic') as mock_anthropic:
        mock_client = mock_anthropic.return_value
        yield mock_client
