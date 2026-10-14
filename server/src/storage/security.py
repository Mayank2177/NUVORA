"""Security scanning and redaction for publication safety."""
import re
from typing import Any


# Redaction rules for secret detection
REDACTION_RULES: list[dict[str, Any]] = [
    {
        "type": "private_key",
        "severity": "block",
        "description": "Cryptographic private key block detected",
        "pattern": re.compile(
            r"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----.*?-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----",
            re.IGNORECASE | re.DOTALL,
        ),
        "mask": "[REDACTED_PRIVATE_KEY]",
    },
    {
        "type": "aws_access_key",
        "severity": "block",
        "description": "AWS access key ID detected",
        "pattern": re.compile(
            r"(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}",
            re.IGNORECASE,
        ),
        "mask": "[REDACTED_AWS_KEY]",
    },
    {
        "type": "github_token",
        "severity": "block",
        "description": "GitHub token detected",
        "pattern": re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,255}\b"),
        "mask": "[REDACTED_GITHUB_TOKEN]",
    },
    {
        "type": "slack_token", "severity": "block", "description": "Slack token detected",
        "pattern": re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
        "mask": "[REDACTED_SLACK_TOKEN]",
    },
    {
        "type": "stripe_secret", "severity": "block", "description": "Stripe secret key detected",
        "pattern": re.compile(r"\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b"),
        "mask": "[REDACTED_STRIPE_KEY]",
    },
    {
        "type": "google_api_key", "severity": "block", "description": "Google API key detected",
        "pattern": re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
        "mask": "[REDACTED_GOOGLE_KEY]",
    },
    {
        "type": "jwt", "severity": "block", "description": "JWT detected",
        "pattern": re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
        "mask": "[REDACTED_JWT]",
    },
    {
        "type": "openai_key",
        "severity": "block",
        "description": "OpenAI API key detected",
        "pattern": re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{16,255}\b"),
        "mask": "[REDACTED_OPENAI_KEY]",
    },
    {
        "type": "generic_api_key",
        "severity": "block",
        "description": "Generic API key, secret, token, or password assignment detected",
        "pattern": re.compile(
            r"(?:api[_-]?key|secret|token|password|auth[_-]?token)\s*[:=]\s*\S+",
            re.IGNORECASE,
        ),
        "mask": 'api_key: "[REDACTED_SECRET]"',
    },
    {
        "type": "db_connection_uri",
        "severity": "block",
        "description": "Database connection URI containing credentials detected",
        "pattern": re.compile(
            r"(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis)://[a-zA-Z0-9_]+:[^@\s]+@[a-zA-Z0-9.-]+(?::[0-9]+)?/[a-zA-Z0-9_]+",
            re.IGNORECASE,
        ),
        "mask": "[REDACTED_DATABASE_URI]",
    },
    {
        "type": "url_credentials",
        "severity": "block",
        "description": "URL containing embedded credentials detected",
        "pattern": re.compile(
            r"https?://[^\s/@:]+:[^\s/@]+@[^\s/]+", re.IGNORECASE
        ),
        "mask": "[REDACTED_CREDENTIAL_URL]",
    },
    {
        "type": "email_address",
        "severity": "warn",
        "description": "Email address detected",
        "pattern": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
        "mask": "[user@example.redacted]",
    },
    {
        "type": "phone_number",
        "severity": "warn",
        "description": "Phone number detected",
        "pattern": re.compile(
            r"(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{3}\)|\d{3}[-.\s])[-.\s]?\d{3}[-.\s]\d{4}\b"
        ),
        "mask": "[REDACTED_PHONE]",
    },
    {
        "type": "absolute_local_path",
        "severity": "warn",
        "description": "Absolute local user path detected",
        "pattern": re.compile(
            r"(?:/Users/[a-zA-Z0-9_.-]+|/home/[a-zA-Z0-9_.-]+|[A-Za-z]:\\[Uu]sers\\[a-zA-Z0-9_.-]+)(?:/[a-zA-Z0-9_.-]+)*",
            re.IGNORECASE,
        ),
        "mask": "/workspace/.../[project_path]",
    },
]


def scan_content(content: str, location_hint: str = "content body") -> dict[str, Any]:
    """
    Scan content for secrets and PII.
    Returns scan results with blocking/warning findings.
    """
    findings: list[dict[str, Any]] = []

    for rule in REDACTION_RULES:
        pattern = rule["pattern"]
        for match in pattern.finditer(content):
            findings.append(
                {
                    "severity": rule["severity"],
                    "type": rule["type"],
                    "description": rule["description"],
                    "location": location_hint,
                }
            )

    blocking = [f for f in findings if f["severity"] == "block"]
    warnings = [f for f in findings if f["severity"] == "warn"]

    if blocking:
        summary = f"BLOCKED: Found {len(blocking)} critical secret(s) and {len(warnings)} warning(s). Publication cannot proceed until resolved."
    elif warnings:
        summary = f"PASSED WITH WARNINGS: Found {len(warnings)} potential PII/path items. Review before making public."
    else:
        summary = "CLEAN: No secrets or PII detected. Ready for publication."

    return {
        "has_blocking_findings": bool(blocking),
        "findings": findings,
        "summary": summary,
    }


def redact_text(text: str) -> tuple[str, int]:
    """
    Redact sensitive information from text.
    Returns (redacted_text, redaction_count).
    """
    result = text
    count = 0

    for rule in REDACTION_RULES:
        result, replaced = rule["pattern"].subn(rule["mask"], result)
        count += replaced

    return result, count
