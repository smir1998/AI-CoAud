"""Tests for GitHub API client."""
import pytest
from unittest.mock import AsyncMock, Mock, patch
import httpx

from github_client import GitHubClient, GitHubError, TransientGitHubError, PRMeta, PRFile


@pytest.fixture
def client():
    """GitHub client with test token."""
    return GitHubClient("test-token")


class TestGitHubClient:
    """Test GitHub API client functionality."""

    @pytest.mark.asyncio
    async def test_get_pull_success(self, client):
        """Successful PR fetch should return PRMeta."""
        mock_pr = {
            "title": "Test PR",
            "user": {"login": "testuser"},
            "base": {"ref": "main"},
            "head": {"ref": "feature", "sha": "abc123"},
        }
        mock_files = [
            {
                "filename": "test.py",
                "status": "modified",
                "additions": 10,
                "deletions": 5,
                "patch": "@@ -1,5 +1,10 @@\n+added line",
            }
        ]
        
        with patch.object(client._client, 'get') as mock_get:
            mock_get.side_effect = [
                Mock(json=lambda: mock_pr, status_code=200, headers={}),
                Mock(json=lambda: mock_files, status_code=200, headers={}),
            ]
            
            result = await client.get_pull("owner", "repo", 123)
            
            assert isinstance(result, PRMeta)
            assert result.title == "Test PR"
            assert result.author == "testuser"
            assert result.base_ref == "main"
            assert result.head_ref == "feature"
            assert result.head_sha == "abc123"
            assert len(result.files) == 1
            assert result.files[0].path == "test.py"

    @pytest.mark.asyncio
    async def test_get_pull_pagination(self, client):
        """PR with many files should paginate correctly."""
        mock_pr = {
            "title": "Test PR",
            "user": {"login": "testuser"},
            "base": {"ref": "main"},
            "head": {"ref": "feature", "sha": "abc123"},
        }
        
        # First page: 100 files (full page)
        page1 = [{"filename": f"file{i}.py", "status": "added", "additions": 1, "deletions": 0} for i in range(100)]
        # Second page: 50 files (partial page - signals end)
        page2 = [{"filename": f"file{i}.py", "status": "added", "additions": 1, "deletions": 0} for i in range(100, 150)]
        
        with patch.object(client._client, 'get') as mock_get:
            mock_get.side_effect = [
                Mock(json=lambda: mock_pr, status_code=200, headers={}),
                Mock(json=lambda: page1, status_code=200, headers={}),
                Mock(json=lambda: page2, status_code=200, headers={}),
            ]
            
            result = await client.get_pull("owner", "repo", 123)
            
            assert len(result.files) == 150

    @pytest.mark.asyncio
    async def test_rate_limit_handling(self, client):
        """Rate limit errors should raise TransientGitHubError."""
        with patch.object(client._client, 'get') as mock_get:
            mock_get.return_value = Mock(
                status_code=403,
                headers={"X-RateLimit-Remaining": "0"},
                json=lambda: {"message": "rate limit exceeded"},
            )
            
            with pytest.raises(TransientGitHubError):
                await client._get("/test")

    @pytest.mark.asyncio
    async def test_rate_limit_warning(self, client):
        """Low rate limit should log warning."""
        with patch.object(client._client, 'get') as mock_get:
            mock_get.return_value = Mock(
                status_code=200,
                headers={"X-RateLimit-Remaining": "20"},
                json=lambda: {"data": "test"},
            )
            
            # Should not raise, just warn
            result = await client._get("/test")
            assert result == {"data": "test"}

    @pytest.mark.asyncio
    async def test_create_review_chunking(self, client):
        """Review with many comments should be chunked."""
        meta = PRMeta(
            owner="owner",
            repo="repo",
            number=123,
            title="Test",
            author="user",
            base_ref="main",
            head_ref="feature",
            head_sha="abc123",
            files=[],
        )
        
        # Create 75 comments (exceeds MAX_INLINE_COMMENTS=50)
        comments = [{"path": f"file{i}.py", "line": 1, "body": f"comment {i}"} for i in range(75)]
        
        with patch.object(client._client, 'post') as mock_post:
            mock_post.return_value = Mock(
                status_code=201,
                json=lambda: {"html_url": "https://github.com/owner/repo/pull/123#review"},
                headers={},
            )
            
            result = await client.create_review(meta, "Review body", "COMMENT", comments)
            
            # Should make 2 calls: first with 50 comments, second with 25
            assert mock_post.call_count == 2
            
            # First call should have 50 comments
            first_call_args = mock_post.call_args_list[0]
            assert len(first_call_args[1]["json"]["comments"]) == 50
            
            # Second call should have 25 comments
            second_call_args = mock_post.call_args_list[1]
            assert len(second_call_args[1]["json"]["comments"]) == 25

    @pytest.mark.asyncio
    async def test_create_review_fallback_to_issue_comment(self, client):
        """Failed inline review should fall back to issue comment."""
        meta = PRMeta(
            owner="owner",
            repo="repo",
            number=123,
            title="Test",
            author="user",
            base_ref="main",
            head_ref="feature",
            head_sha="abc123",
            files=[],
        )
        
        comments = [{"path": "file.py", "line": 1, "body": "comment"}]
        
        with patch.object(client._client, 'post') as mock_post:
            # First call (review) fails with 422
            mock_post.side_effect = [
                Mock(
                    status_code=422,
                    json=lambda: {"message": "invalid comment position"},
                    headers={},
                ),
                # Second call (issue comment) succeeds
                Mock(
                    status_code=201,
                    json=lambda: {"html_url": "https://github.com/owner/repo/issues/123#comment"},
                    headers={},
                ),
            ]
            
            result = await client.create_review(meta, "Review body", "COMMENT", comments)
            
            # Should fall back to issue comment
            assert mock_post.call_count == 2
            assert "issues/123/comments" in mock_post.call_args_list[1][0][0]

    @pytest.mark.asyncio
    async def test_error_handling_non_json_response(self, client):
        """Non-JSON error responses should be handled gracefully."""
        with patch.object(client._client, 'get') as mock_get:
            mock_get.return_value = Mock(
                status_code=500,
                headers={},
                json=Mock(side_effect=ValueError("not JSON")),
                text="Internal Server Error",
            )
            
            with pytest.raises(GitHubError) as exc_info:
                await client._get("/test")
            
            assert "500" in str(exc_info.value)
            assert "Internal Server Error" in str(exc_info.value)
