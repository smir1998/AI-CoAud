"""Tests for deterministic static analysis tool runner."""
import pytest
from unittest.mock import AsyncMock, patch
import json

from tools import ToolRunner, _run, TOOL_TIMEOUT


@pytest.fixture
def sample_files():
    """Sample Python files for testing."""
    return {
        "test.py": """
import os
import pickle

def vulnerable():
    # SQL injection
    cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
    
    # Unsafe deserialization
    data = pickle.loads(user_input)
    
    # Hardcoded secret
    api_key = "sk-1234567890abcdef"
""",
        "safe.py": """
def safe_function():
    return "no issues here"
""",
    }


class TestToolRunner:
    """Test ToolRunner functionality."""

    def test_missing_tool_returns_skipped(self, sample_files):
        """Missing tool should return 'skipped' status."""
        runner = ToolRunner(sample_files)
        
        with patch('shutil.which', return_value=None):
            result = runner._wrap("nonexistent-tool", AsyncMock())
            
            assert result["status"] == "skipped"
            assert result["hits"] == []
            assert result["tool"] == "nonexistent-tool"

    @pytest.mark.asyncio
    async def test_tool_timeout_handling(self, sample_files):
        """Tool timeout should be handled gracefully."""
        runner = ToolRunner(sample_files)
        
        async def slow_tool():
            raise TimeoutError(f"semgrep exceeded {TOOL_TIMEOUT}s")
        
        result = await runner._wrap("semgrep", slow_tool)
        
        assert result["status"] == "timeout"
        assert result["hits"] == []
        assert result["ms"] == TOOL_TIMEOUT * 1000

    @pytest.mark.asyncio
    async def test_tool_exception_handling(self, sample_files):
        """Tool exceptions should not crash the audit."""
        runner = ToolRunner(sample_files)
        
        async def failing_tool():
            raise RuntimeError("tool crashed")
        
        result = await runner._wrap("semgrep", failing_tool)
        
        assert result["status"] == "error"
        assert result["hits"] == []
        assert result["ms"] == 0

    @pytest.mark.asyncio
    async def test_semgrep_parsing(self, sample_files):
        """Semgrep JSON output should be parsed correctly."""
        runner = ToolRunner(sample_files)
        
        semgrep_output = {
            "results": [
                {
                    "path": "test.py",
                    "start": {"line": 10},
                    "extra": {
                        "severity": "ERROR",
                        "message": "SQL injection detected",
                    },
                    "check_id": "python.sql-injection",
                }
            ]
        }
        
        with patch('tools._run', return_value=(0, json.dumps(semgrep_output), "")):
            hits = await runner._semgrep()
            
            assert len(hits) == 1
            assert hits[0]["file"] == "test.py"
            assert hits[0]["line"] == 10
            assert hits[0]["severity"] == "high"  # ERROR maps to high
            assert hits[0]["rule"] == "python.sql-injection"

    @pytest.mark.asyncio
    async def test_bandit_parsing(self, sample_files):
        """Bandit JSON output should be parsed correctly."""
        runner = ToolRunner(sample_files)
        
        bandit_output = {
            "results": [
                {
                    "filename": "test.py",
                    "line_number": 15,
                    "issue_severity": "HIGH",
                    "test_id": "B301",
                    "issue_text": "Pickle usage detected",
                    "issue_confidence": "HIGH",
                }
            ]
        }
        
        with patch('tools._run', return_value=(0, json.dumps(bandit_output), "")):
            hits = await runner._bandit()
            
            assert len(hits) == 1
            assert hits[0]["file"] == "test.py"
            assert hits[0]["line"] == 15
            assert hits[0]["severity"] == "high"
            assert hits[0]["rule"] == "B301"
            assert hits[0]["confidence"] == "high"

    @pytest.mark.asyncio
    async def test_ruff_parsing(self, sample_files):
        """Ruff JSON output should be parsed correctly."""
        runner = ToolRunner(sample_files)
        
        ruff_output = [
            {
                "filename": "test.py",
                "location": {"row": 5},
                "code": "F401",
                "message": "Import os is unused",
            }
        ]
        
        with patch('tools._run', return_value=(0, json.dumps(ruff_output), "")):
            hits = await runner._ruff()
            
            assert len(hits) == 1
            assert hits[0]["file"] == "test.py"
            assert hits[0]["line"] == 5
            assert hits[0]["severity"] == "low"
            assert hits[0]["rule"] == "F401"

    @pytest.mark.asyncio
    async def test_pip_audit_parsing(self, sample_files):
        """pip-audit JSON output should be parsed correctly."""
        runner = ToolRunner(sample_files, requirements="requests==2.25.0")
        
        pip_audit_output = [
            {
                "name": "requests",
                "version": "2.25.0",
                "vulns": [
                    {
                        "id": "PYSEC-2021-123",
                        "description": "Vulnerability in requests",
                    }
                ],
            }
        ]
        
        with patch('tools._run', return_value=(0, json.dumps(pip_audit_output), "")):
            hits = await runner._pip_audit()
            
            assert len(hits) == 1
            assert hits[0]["file"] == "requirements.txt"
            assert hits[0]["severity"] == "high"
            assert hits[0]["rule"] == "PYSEC-2021-123"
            assert "requests==2.25.0" in hits[0]["message"]

    @pytest.mark.asyncio
    async def test_run_all_parallel(self, sample_files):
        """run_all should execute tools in parallel."""
        runner = ToolRunner(sample_files)
        
        with patch('shutil.which', return_value="/usr/bin/tool"):
            with patch.object(runner, '_semgrep', return_value=[]):
                with patch.object(runner, '_bandit', return_value=[]):
                    with patch.object(runner, '_ruff', return_value=[]):
                        with patch.object(runner, '_pip_audit', return_value=[]):
                            results = await runner.run_all()
                            
                            assert len(results) == 4
                            assert all(r["status"] == "ok" for r in results)

    @pytest.mark.asyncio
    async def test_empty_python_files_skips_bandit(self):
        """Bandit should be skipped when no Python files present."""
        runner = ToolRunner({"readme.md": "# README"})
        
        hits = await runner._bandit()
        assert hits == []

    @pytest.mark.asyncio
    async def test_no_requirements_skips_pip_audit(self, sample_files):
        """pip-audit should be skipped when no requirements provided."""
        runner = ToolRunner(sample_files, requirements=None)
        
        hits = await runner._pip_audit()
        assert hits == []

    def test_cleanup_removes_temp_dir(self, sample_files):
        """cleanup should remove temporary directory."""
        runner = ToolRunner(sample_files)
        temp_dir = runner.tmp.name
        
        assert temp_dir.exists()
        runner.cleanup()
        assert not temp_dir.exists()


class TestRunSubprocess:
    """Test subprocess execution with timeout."""

    @pytest.mark.asyncio
    async def test_successful_command(self):
        """Successful command should return output."""
        rc, out, err = await _run(["echo", "hello"])
        
        assert rc == 0
        assert "hello" in out

    @pytest.mark.asyncio
    async def test_timeout_kills_process(self):
        """Timeout should kill the process."""
        with pytest.raises(TimeoutError):
            await _run(["sleep", "10"])

    @pytest.mark.asyncio
    async def test_failed_command_returns_nonzero(self):
        """Failed command should return non-zero exit code."""
        rc, out, err = await _run(["false"])
        
        assert rc != 0
