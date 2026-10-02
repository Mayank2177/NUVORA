"""Generate an owner-only portable PROJECT.md export."""
from __future__ import annotations

from typing import Any


def _clean(value: Any) -> str:
    return str(value or "").replace("\x00", "").strip()


def generate_project_markdown(
    project: dict[str, Any],
    commits: list[dict[str, Any]],
    evidence: list[dict[str, Any]],
    guidance: list[dict[str, Any]],
) -> str:
    stack = ", ".join(project.get("stack") or []) or "Not specified"
    lines = [
        f"# {_clean(project.get('name'))}",
        "",
        _clean(project.get("summary")) or "_No project summary yet._",
        "",
        "## Project",
        "",
        f"- Repository: {_clean(project.get('repo')) or 'Not connected'}",
        f"- Stack: {stack}",
        f"- Time span: {_clean(project.get('span')) or 'Not specified'}",
        f"- Status: {_clean(project.get('status'))}",
        "",
        "## Evidence",
        "",
    ]
    if evidence:
        for item in evidence:
            verified = "verified" if item.get("verified") else "unverified"
            lines.extend(
                [
                    f"### {_clean(item.get('title'))}",
                    "",
                    f"- Kind: {_clean(item.get('kind'))}",
                    f"- Verification: {verified}",
                    f"- Date: {_clean(item.get('when') or item.get('occurred_at'))}",
                    "",
                    _clean(item.get("body")) or "_No description._",
                    "",
                ]
            )
    else:
        lines.extend(["_No evidence recorded._", ""])

    lines.extend(["## Recent commits", ""])
    if commits:
        for commit in commits[:100]:
            lines.append(
                f"- `{_clean(commit.get('hash'))}` {_clean(commit.get('message'))}"
            )
    else:
        lines.append("_No commits recorded._")

    lines.extend(["", "## Suggested next actions", ""])
    if guidance:
        for suggestion in guidance:
            lines.append(
                f"- **{_clean(suggestion.get('action'))}** — {_clean(suggestion.get('reason'))}"
            )
    else:
        lines.append("_No immediate gaps detected._")
    lines.append("")
    return "\n".join(lines)