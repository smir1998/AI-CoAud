"""Tests for LLM agent functionality."""
import pytest
from unittest.mock import AsyncMock, patch, Mock
import json

from agents import (
    run_security_agent,
    run_style_agent,
    refactor_agent,
    _extract_json,
    _trim,
    _diff_payload,
    MAX_DIFF_CHARS,
)
from state import AuditState, Finding, Severity


@pytest.fixture
def sample_state():
    """Sample audit state for testing."""
    state = AuditState(
        repository="owner/repo",
        pr_number=123,
        commit_sha="abc123",
        changed_files=["test.py"],
        post_image={"test.py": "def test():\n    pass"},
        added_lines={"test.py": [1, 2]},
    )
    return state


class TestJSONExtraction:
    """Test JSON extraction from LLM output."""

    def test_extract_json_valid(self):
        """Valid JSON should be extracted."""
        text = 'Some text {"findings": []} more text'
        result = _extract_json(text)
        assert result == {"findings": []}

    def test_extract_json_with_markdown(self):
        """JSON in markdown code blocks should be extracted."""
        text = '```json\n{"findings": []}\n```'
        result = _extract_json(text)
        assert result == {"findings": []}

    def test_extract_json_no_object(self):
        """Missing JSON object should raise ValueError."""
        text = "No JSON here"
        with pytest.raises(ValueError, match="no JSON object"):
            _extract_json(text)

    def test_extract_json_multiple_objects(self):
        """Multiple JSON objects should extract the outermost."""
        text = '{"outer": {"inner": {}}} extra'
        result = _extract_json(text)
        assert result == {"outer": {"inner": {}}}


class TestDiffTrimming:
    """Test diff text trimming."""

    def test_trim_short_text(self):
        """Short text should not be trimmed."""
        text = "short text"
        result = _trim(text)
        assert result == text

    def test_trim_long_text(self):
        """Long text should be trimmed with indicator."""
        text = "x" * (MAX_DIFF_CHARS + 1000)
        result = _trim(text)
        assert len(result) < len(text)
        assert "truncated" in result.lower()
        assert result.endswith("…")


class TestDiffPayload:
    """Test diff payload generation."""

    def test_payload_includes_metadata(self, sample_state):
        """Payload should include PR metadata."""
        payload = _diff_payload(sample_state)
        assert "owner/repo" in payload
        assert "#123" in payload
        assert "test.py" in payload

    def test_payload_includes_file_content(self, sample_state):
        """Payload should include file content."""
        payload = _diff_payload(sample_state)
        assert "def test():" in payload

    def test_payload_truncates_large_files(self, sample_state):
        """Large file content should be truncated."""
        sample_state.post_image["test.py"] = "x" * 20000
        payload = _diff_payload(sample_state)
        assert len(payload) <= MAX_DIFF_CHARS + 1000  # Allow some overhead


class TestSecurityAgent:
    """Test security agent functionality."""

    @pytest.mark.asyncio
    async def test_security_agent_crewai_success(self, sample_state):
        """Security agent should work with CrewAI."""
        mock_result = Mock()
        mock_result.pydantic.findings = [
            Finding(
                id="test-1",
                agent="security",
                file="test.py",
                line=1,
                severity=Severity.HIGH,
                confidence=0.9,
                title="Test finding",
                issue="Test issue",
                recommendation="Test recommendation",
                source="llm",
            )
        ]
        
        with patch('agents._run_crew', return_value=mock_result.pydantic.findings):
            findings = await run_security_agent(sample_state)
            
            assert len(findings) == 1
            assert findings[0].agent == "security"
            assert findings[0].source == "llm"

    @pytest.mark.asyncio
    async def test_security_agent_fallback_to_anthropic(self, sample_state):
        """Security agent should fall back to Anthropic when CrewAI fails."""
        with patch('agents._run_crew', side_effect=Exception("CrewAI failed")):
            with patch('agents._run_direct') as mock_direct:
                mock_direct.return_value = []
                
                await run_security_agent(sample_state)
                
                mock_direct.assert_called_once()

    @pytest.mark.asyncio
    async def test_security_agent_anthropic_success(self, sample_state):
        """Security agent should work with direct Anthropic API."""
        anthropic_response = Mock()
        anthropic_response.content = [
            Mock(type="text", text='{"findings": []}')
        ]
        
        with patch('agents._run_crew', side_effect=Exception("CrewAI failed")):
            with patch('anthropic.AsyncAnthropic') as mock_anthropic:
                mock_client = Mock()
                mock_client.messages.create = AsyncMock(return_value=anthropic_response)
                mock_anthropic.return_value = mock_client
                
                findings = await run_security_agent(sample_state)
                
                assert findings == []


class TestStyleAgent:
    """Test style agent functionality."""

    @pytest.mark.asyncio
    async def test_style_agent_returns_findings(self, sample_state):
        """Style agent should return findings."""
        with patch('agents._run') as mock_run:
            mock_run.return_value = [
                Finding(
                    id="style-1",
                    agent="style",
                    file="test.py",
                    line=1,
                    severity=Severity.LOW,
                    confidence=0.8,
                    title="Style issue",
                    issue="Test issue",
                    recommendation="Test recommendation",
                    source="llm",
                )
            ]
            
            findings = await run_style_agent(sample_state)
            
            assert len(findings) == 1
            assert findings[0].agent == "style"


class TestRefactorAgent:
    """Test refactor agent functionality."""

    @pytest.mark.asyncio
    async def test_refactor_agent_success(self):
        """Refactor agent should return patch."""
        finding = Finding(
            id="test-1",
            agent="security",
            file="test.py",
            line=1,
            severity=Severity.HIGH,
            confidence=0.9,
            title="SQL injection",
            issue="SQL injection detected",
            recommendation="Use parameterized query",
            source="llm",
        )
        
        anthropic_response = Mock()
        anthropic_response.content = [
            Mock(type="text", text='{"before": "old", "after": "new", "note": "fixed"}')
        ]
        
        with patch('anthropic.AsyncAnthropic') as mock_anthropic:
            mock_client = Mock()
            mock_client.messages.create = AsyncMock(return_value=anthropic_response)
            mock_anthropic.return_value = mock_client
            
            result = await refactor_agent(finding, "old code")
            
            assert result is not None
            assert result["before"] == "old"
            assert result["after"] == "new"
            assert result["note"] == "fixed"

    @pytest.mark.asyncio
    async def test_refactor_agent_failure_returns_none(self):
        """Refactor agent should return None on failure."""
        finding = Finding(
            id="test-1",
            agent="security",
            file="test.py",
            line=1,
            severity=Severity.HIGH,
            confidence=0.9,
            title="SQL injection",
            issue="SQL injection detected",
            recommendation="Use parameterized query",
            source="llm",
        )
        
        with patch('anthropic.AsyncAnthropic', side_effect=Exception("API error")):
            result = await refactor_agent(finding, "old code")
            
            assert result is None

    @pytest.mark.asyncio
    async def test_refactor_agent_invalid_json_returns_none(self):
        """Refactor agent should return None when JSON is invalid."""
        finding = Finding(
            id="test-1",
            agent="security",
            file="test.py",
            line=1,
            severity=Severity.HIGH,
            confidence=0.9,
            title="SQL injection",
            issue="SQL injection detected",
            recommendation="Use parameterized query",
            source="llm",
        )
        
        anthropic_response = Mock()
        anthropic_response.content = [
            Mock(type="text", text="No JSON here")
        ]
        
        with patch('anthropic.AsyncAnthropic') as mock_anthropic:
            mock_client = Mock()
            mock_client.messages.create = AsyncMock(return_value=anthropic_response)
            mock_anthropic.return_value = mock_client
            
            result = await refactor_agent(finding, "old code")
            
            assert result is None
