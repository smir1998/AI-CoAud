"""Contract tests for the backend dependency and security-scan configuration."""

from __future__ import annotations

import ast
import re
import unittest
from pathlib import Path

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name
from packaging.version import Version


REPO_ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS_PATH = REPO_ROOT / "backend" / "requirements.txt"
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "ci.yml"
TOOLS_PATH = REPO_ROOT / "backend" / "tools.py"


def load_requirements() -> dict[str, Requirement]:
    """Parse the manifest while rejecting ambiguous duplicate declarations."""
    parsed: dict[str, Requirement] = {}
    for line_number, raw_line in enumerate(
        REQUIREMENTS_PATH.read_text(encoding="utf-8").splitlines(), start=1
    ):
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue

        requirement = Requirement(line)
        name = canonicalize_name(requirement.name)
        if name in parsed:
            raise AssertionError(
                f"duplicate requirement {name!r} on line {line_number}"
            )
        parsed[name] = requirement
    return parsed


def load_runtime_scanners() -> set[str]:
    """Read ToolRunner.run_all's scanner names without importing backend deps."""
    tree = ast.parse(TOOLS_PATH.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if node.name != "run_all":
            continue
        for child in ast.walk(node):
            if not isinstance(child, ast.Assign):
                continue
            if not any(
                isinstance(target, ast.Name) and target.id == "jobs"
                for target in child.targets
            ):
                continue
            if not isinstance(child.value, (ast.List, ast.Tuple)):
                break
            return {
                element.elts[0].value
                for element in child.value.elts
                if isinstance(element, ast.Tuple)
                and element.elts
                and isinstance(element.elts[0], ast.Constant)
                and isinstance(element.elts[0].value, str)
            }
    raise AssertionError("could not find ToolRunner.run_all's jobs declaration")


def load_vulnerability_scan_region() -> tuple[int, list[str]]:
    """Return the vuln-scan step indent and all lines up to the next job."""
    lines = WORKFLOW_PATH.read_text(encoding="utf-8").splitlines()
    marker = re.compile(r"^(\s*)- name: vuln-scan \(pip-audit \+ bandit\)\s*$")
    for start, line in enumerate(lines):
        match = marker.match(line)
        if not match:
            continue
        region = [line]
        for candidate in lines[start + 1 :]:
            next_job = re.match(r"^  ([a-zA-Z0-9_-]+):\s*$", candidate)
            # Keep misplaced step fields in the region so the nesting test can
            # report them precisely instead of hiding the malformed content.
            if next_job and next_job.group(1) not in {"env", "run"}:
                break
            region.append(candidate)
        return len(match.group(1)), region
    raise AssertionError("could not find the vuln-scan workflow step")


class RequirementContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.requirements = load_requirements()

    def test_manifest_has_unique_parseable_requirements(self) -> None:
        self.assertGreater(len(self.requirements), 0)

    def test_fastapi_range_includes_floor_and_excludes_next_major(self) -> None:
        versions = self.requirements["fastapi"].specifier

        self.assertIn(Version("0.128.3"), versions)
        self.assertIn(Version("0.999.999"), versions)
        self.assertNotIn(Version("0.128.2"), versions)
        self.assertNotIn(Version("1.0.0"), versions)

    def test_chromadb_compatible_release_stays_within_minor_one(self) -> None:
        versions = self.requirements["chromadb"].specifier

        self.assertIn(Version("1.1.0"), versions)
        self.assertIn(Version("1.1.99"), versions)
        self.assertNotIn(Version("1.0.99"), versions)
        self.assertNotIn(Version("1.2.0"), versions)

    def test_transitive_starlette_is_not_constrained_directly(self) -> None:
        self.assertNotIn("starlette", self.requirements)

    def test_every_runtime_scanner_is_installed_in_the_backend_image(self) -> None:
        declared = set(self.requirements)
        missing = load_runtime_scanners() - declared

        self.assertEqual(
            missing,
            set(),
            "ToolRunner silently skips runtime scanners missing from "
            f"backend/requirements.txt: {sorted(missing)}",
        )


class VulnerabilityScanWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.step_indent, cls.region = load_vulnerability_scan_region()
        cls.region_text = "\n".join(cls.region)

    def test_env_and_run_are_fields_of_the_vulnerability_scan_step(self) -> None:
        expected_indent = self.step_indent + 2
        for field in ("env", "run"):
            matching_lines = [
                line for line in self.region if line.strip() == f"{field}:"
            ]
            self.assertEqual(len(matching_lines), 1, f"expected one {field}: field")
            actual_indent = len(matching_lines[0]) - len(matching_lines[0].lstrip())
            self.assertEqual(
                actual_indent,
                expected_indent,
                f"{field}: must be nested under the vuln-scan list item",
            )

    def test_application_environment_is_installed_and_consistency_checked(self) -> None:
        self.assertIn(
            "python -m pip install -r backend/requirements.txt", self.region_text
        )
        self.assertRegex(self.region_text, r"(?m)^\s*python -m pip check\s*$")

    def test_pip_audit_is_pinned_and_run_from_an_isolated_environment(self) -> None:
        self.assertIn("python -m venv .pip-audit-venv", self.region_text)
        self.assertIn(
            '.pip-audit-venv/bin/python -m pip install "pip-audit==2.10.1"',
            self.region_text,
        )
        self.assertRegex(
            self.region_text, r"(?m)^\s*\.pip-audit-venv/bin/pip-audit \\\s*$"
        )

    def test_audit_targets_manifest_and_repository_config(self) -> None:
        audit_command = re.search(
            r"\.pip-audit-venv/bin/pip-audit \\\n(?P<arguments>(?:\s+.*(?:\n|$))+?)\s*echo ",
            self.region_text,
        )
        self.assertIsNotNone(audit_command, "could not locate the pip-audit command")
        arguments = audit_command.group("arguments")
        self.assertIn("-r backend/requirements.txt", arguments)
        self.assertIn("--config .pip-audit.toml", arguments)
        self.assertIn("--progress-spinner off", arguments)

    def test_bandit_still_scans_backend_at_medium_severity_or_higher(self) -> None:
        self.assertRegex(self.region_text, r"(?m)^\s*bandit -r backend -ll -q\s*$")


if __name__ == "__main__":
    unittest.main()
