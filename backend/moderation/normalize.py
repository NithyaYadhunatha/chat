"""
Text normalisation used before pattern matching.

People dodge word filters with leetspeak (s3x), look-alike letters from other
alphabets (Cyrillic "а"), invisible characters, stretched letters (seeeexxx) and
spaced-out spelling (s e x). We match patterns against several normalised
variants of each message so all of those collapse to the same thing.
"""
import re
import unicodedata
from dataclasses import dataclass

_INVISIBLE = re.compile(r"[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤⁪-⁯﻿]")

_HOMOGLYPHS = str.maketrans({
    # Cyrillic
    "а": "a", "в": "b", "е": "e", "ё": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p",
    "с": "c", "т": "t", "у": "y", "х": "x", "і": "i", "ї": "i", "ј": "j", "ѕ": "s", "ԁ": "d",
    "ɡ": "g", "ո": "n", "ս": "u",
    # Greek
    "α": "a", "β": "b", "ε": "e", "η": "n", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p",
    "τ": "t", "υ": "u", "χ": "x", "ω": "w",
})

_LEET = str.maketrans({
    "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g",
    "@": "a", "$": "s", "!": "i", "|": "i", "+": "t", "€": "e", "£": "l",
})

# Runs of 3+ single characters separated by spaces/punctuation: "s e x", "n.u.d.e.s"
_SPACED = re.compile(r"(?<!\w)(?:\w[\s.\-_*~,]+){2,}\w(?!\w)")
_SEPARATORS = re.compile(r"[\s.\-_*~,]+")


@dataclass(frozen=True)
class Normalized:
    plain: str      # lower-cased, accents/invisibles/homoglyphs removed — digits kept
    leet: str       # plain with leetspeak digits/symbols mapped to letters
    collapsed: str  # leet with spaced-out single letters joined together
    spelled: tuple  # just the spaced-out runs, joined ("s e n d n u d e s" -> "sendnudes")


def _strip_marks(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def normalize(text: str) -> Normalized:
    t = unicodedata.normalize("NFKC", text)
    t = _INVISIBLE.sub("", t)
    t = _strip_marks(t).casefold().translate(_HOMOGLYPHS)
    t = re.sub(r"\s+", " ", t).strip()

    leet = t.translate(_LEET)
    spelled = tuple(_SEPARATORS.sub("", m.group(0)) for m in _SPACED.finditer(leet))
    collapsed = _SPACED.sub(lambda m: _SEPARATORS.sub("", m.group(0)), leet)
    return Normalized(plain=t, leet=leet, collapsed=collapsed, spelled=spelled)


def clean_user_text(text: str, max_len: int) -> str:
    """Strip control/invisible characters and trim. Used before storing or relaying text."""
    text = unicodedata.normalize("NFC", text)
    text = _INVISIBLE.sub("", text)
    text = "".join(c for c in text if c in "\n\t" or unicodedata.category(c)[0] != "C")
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:max_len]
