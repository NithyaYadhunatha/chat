"""
Regex patterns and word lists for content moderation.
Severity levels: low, medium, high
"""
import re
from typing import List, Tuple

# (pattern_regex, severity, friendly_label)
BANNED_PATTERNS: List[Tuple[re.Pattern, str, str]] = [
    # High severity — zero tolerance
    (re.compile(r'\b(kill\s*your?self|kys)\b', re.IGNORECASE), "high", "self-harm encouragement"),
    (re.compile(r'\b(rape|molest)\b', re.IGNORECASE), "high", "sexual violence"),
    (re.compile(r'\bcp\b|\bchild\s*porn', re.IGNORECASE), "high", "CSAM reference"),

    # Medium severity
    (re.compile(r'\b(nigger|nigga|faggot|retard)\b', re.IGNORECASE), "medium", "slur"),
    (re.compile(r'\b(fuck\s*you|fuck\s*off|go\s*fuck)\b', re.IGNORECASE), "medium", "targeted profanity"),

    # Low severity — warned but not struck
    (re.compile(r'\b(shit|ass|bitch|damn|crap)\b', re.IGNORECASE), "low", "mild profanity"),
]

# Spam detection: same message repeated
SPAM_REPEAT_THRESHOLD = 3  # same content within a session triggers warning
