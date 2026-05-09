"""
Content filter: scans messages against banned patterns.
Returns severity and matched label for downstream handling.
"""
from typing import Optional, Tuple
from moderation.patterns import BANNED_PATTERNS


def check_message(content: str) -> Tuple[str, Optional[str], Optional[str]]:
    """
    Scan `content` against all banned patterns.

    Returns:
        (verdict, severity, label)
        verdict: "clean" | "warn" | "strike"
        severity: None | "low" | "medium" | "high"
        label: human-readable description of the match, or None
    """
    for pattern, severity, label in BANNED_PATTERNS:
        if pattern.search(content):
            if severity == "low":
                return "warn", severity, label
            elif severity == "medium":
                return "strike", severity, label
            elif severity == "high":
                return "strike", severity, label

    return "clean", None, None


def is_spam(content: str, recent_messages: list[str]) -> bool:
    """Detect if the user is spamming the same message."""
    from moderation.patterns import SPAM_REPEAT_THRESHOLD
    count = sum(1 for m in recent_messages if m.strip().lower() == content.strip().lower())
    return count >= SPAM_REPEAT_THRESHOLD
