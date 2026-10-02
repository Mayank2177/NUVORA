"""Pure domain services used by HTTP, MCP, and CLI surfaces."""

from .guidance import evaluate_guidance
from .hash_chain import compute_entry_hash, verify_chain
from .project_markdown import generate_project_markdown
from .skills import compute_skill_claims

__all__ = [
    "compute_entry_hash",
    "compute_skill_claims",
    "evaluate_guidance",
    "generate_project_markdown",
    "verify_chain",
]