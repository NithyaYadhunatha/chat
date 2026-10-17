"""
Moderation decisions for a single message.

`scan()` finds which rule categories a message hits. `evaluate()` turns those
hits plus what we already know about the conversation (how sexual it has been,
whether someone said they're under 18, how many times they tried to swap
contact details) into a Verdict: deliver or block, end the chat, add strike
points, suspend the account, show the sender a notice.

Context matters: "you're sexy" is a warning between adults but grooming when
the other person has said they're 15, and asking for a Snapchat right after
sexual messages is a classic attempt to move a stranger somewhere unmoderated.
"""
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional

from moderation.normalize import normalize
from moderation.rules import RULES, SPELLED_OUT, Cat

SEXUAL_WARN_AT = 3.0       # session sexual score that triggers a warning
SEXUAL_END_AT = 6.0        # ... that ends the chat
SCORE_DECAY = 0.9          # per message, so old remarks fade
SPAM_REPEATS = 3           # identical messages in a row window


@dataclass
class ParticipantState:
    """What we know about one side of a conversation. Lives as long as the chat."""
    sexual_score: float = 0.0
    harassment_count: int = 0
    contact_attempts: int = 0
    scam_count: int = 0
    warned_sexual: bool = False
    said_minor: bool = False
    recent: Deque[str] = field(default_factory=lambda: deque(maxlen=8))


@dataclass
class Verdict:
    deliver: bool = True
    end_session: bool = False
    strike: float = 0.0
    critical: bool = False           # suspend the sender's account + urgent report
    minor_detected: bool = False     # sender said they are under 18
    escalate_partner: bool = False   # partner was sexual with someone who turned out to be a minor
    urgent_review: bool = False      # open a high-priority report for a human moderator
    support: bool = False            # sender may be at risk — show crisis resources
    notice: Optional[str] = None     # shown only to the sender
    categories: List[str] = field(default_factory=list)
    reason: Optional[str] = None     # internal, for the audit log

    @property
    def flagged(self) -> bool:
        return not self.deliver or self.strike > 0 or self.critical or self.minor_detected or self.urgent_review


@dataclass
class Hits:
    weights: Dict[Cat, float] = field(default_factory=dict)
    labels: Dict[Cat, str] = field(default_factory=dict)

    def has(self, *cats: Cat) -> bool:
        return any(c in self.weights for c in cats)

    def w(self, cat: Cat) -> float:
        return self.weights.get(cat, 0.0)


def scan(text: str) -> Hits:
    norm = normalize(text)
    hits = Hits()
    for rule in RULES:
        variants = (norm.plain,) if rule.on_plain else (norm.leet, norm.collapsed)
        count = 0
        for v in variants:
            count = max(count, len(rule.pattern.findall(v)))
        if count:
            # Overlapping rules in one category ("nudes" / "send nudes") count once, and
            # repeating a word five times scores at most double.
            hits.weights[rule.cat] = max(hits.weights.get(rule.cat, 0.0), rule.weight * min(count, 2))
            hits.labels.setdefault(rule.cat, rule.label)
    for run in norm.spelled:
        for cat, weight, pattern, label in SPELLED_OUT:
            if pattern.search(run) and cat not in hits.weights:
                hits.weights[cat] = weight
                hits.labels[cat] = label
    return hits


NOTICE_SEXUAL = "Sexual content isn't allowed here."
NOTICE_SEXUAL_WARN = "Keep it non-sexual — this chat will end if it continues."
NOTICE_MINOR = "This chat is for adults (18+). We've ended it, and your account needs an age check before you can chat with strangers again."
NOTICE_CONTACT = "For your safety, contact details, social handles and links can't be shared with strangers."
NOTICE_HATE = "Slurs and hate speech aren't allowed. A strike was added to your account."
NOTICE_HARASSMENT = "That looks like harassment. Be decent or move on."
NOTICE_THREAT = "Threats aren't tolerated. This chat has ended."
NOTICE_SPAM = "That looks like spam."
NOTICE_REPEAT = "You've sent that several times. Try saying something new."


def evaluate(
    text: str,
    me: ParticipantState,
    partner: Optional[ParticipantState] = None,
    mode: str = "stranger",
) -> Verdict:
    """Decide what happens to `text`, sent by `me` to `partner`. Mutates the states."""
    hits = scan(text)
    v = Verdict(categories=[c.value for c in hits.weights])
    me.sexual_score *= SCORE_DECAY
    partner_minor = bool(partner and partner.said_minor)

    explicit = hits.has(Cat.SEXUAL_EXPLICIT)
    suggestive = hits.has(Cat.SEXUAL_SUGGESTIVE)
    minor_context = hits.has(Cat.MINOR_AGE, Cat.MINOR_REFERENCE)

    # ── Child safety: zero tolerance ────────────────────────────────────────
    if hits.has(Cat.CSAM) or (explicit and hits.has(Cat.MINOR_AGE)) or (explicit and partner_minor):
        v.deliver, v.end_session, v.critical = False, True, True
        v.reason = hits.labels.get(Cat.CSAM) or "sexual content involving a minor"
        v.notice = "This chat has ended. Your account has been suspended pending review."
        return v

    if (explicit and minor_context) or (suggestive and partner_minor):
        # Probably bad, possibly a false positive ("I found porn as a kid") — a human decides.
        v.deliver, v.end_session, v.strike, v.urgent_review = False, True, 3.0, True
        v.reason = "sexual content alongside references to minors"
        v.notice = NOTICE_SEXUAL
        return v

    if hits.has(Cat.MINOR_AGE) and mode == "stranger":
        me.said_minor = True
        v.deliver, v.end_session, v.minor_detected = False, True, True
        v.escalate_partner = bool(partner and partner.sexual_score >= 1)
        v.reason = "user stated an age under 18"
        v.notice = NOTICE_MINOR
        return v

    # ── Violence & self-harm ────────────────────────────────────────────────
    if hits.has(Cat.THREAT, Cat.SELF_HARM_INCITE):
        cat = Cat.THREAT if hits.has(Cat.THREAT) else Cat.SELF_HARM_INCITE
        v.deliver, v.end_session, v.strike = False, mode == "stranger", 2.0
        v.reason, v.notice = hits.labels[cat], NOTICE_THREAT
        return v

    if hits.has(Cat.SEXUAL_VIOLENCE):
        v.deliver, v.strike = False, 1.5
        v.reason, v.notice = hits.labels[Cat.SEXUAL_VIOLENCE], NOTICE_SEXUAL

    # ── Sexual content ──────────────────────────────────────────────────────
    if explicit:
        me.sexual_score += hits.w(Cat.SEXUAL_EXPLICIT)
        v.deliver = False
        v.strike += 1.5
        v.reason = v.reason or hits.labels[Cat.SEXUAL_EXPLICIT]
        v.notice = NOTICE_SEXUAL
        if me.sexual_score >= SEXUAL_END_AT and mode == "stranger":
            v.end_session = True
    elif suggestive:
        me.sexual_score += hits.w(Cat.SEXUAL_SUGGESTIVE)
        if me.sexual_score >= SEXUAL_END_AT:
            v.deliver, v.strike = False, v.strike + 1.0
            v.end_session = mode == "stranger"
            v.reason, v.notice = "repeated sexual remarks", NOTICE_SEXUAL
        elif me.sexual_score >= SEXUAL_WARN_AT and not me.warned_sexual:
            me.warned_sexual = True
            v.notice = NOTICE_SEXUAL_WARN
            v.reason = "sexual remarks (warning)"

    # ── Hate & harassment ───────────────────────────────────────────────────
    if hits.has(Cat.HATE):
        v.deliver, v.strike = False, v.strike + 1.0
        v.reason, v.notice = v.reason or hits.labels[Cat.HATE], NOTICE_HATE

    if hits.has(Cat.HARASSMENT):
        me.harassment_count += 1
        v.deliver = False
        v.notice = v.notice or NOTICE_HARASSMENT
        v.reason = v.reason or hits.labels[Cat.HARASSMENT]
        if me.harassment_count >= 2:
            v.strike += 1.0
        if me.harassment_count >= 3 and mode == "stranger":
            v.end_session = True

    # ── Moving strangers off-platform / sharing personal info ───────────────
    if mode == "stranger" and hits.has(Cat.CONTACT, Cat.PII, Cat.LINK):
        me.contact_attempts += 1
        v.deliver = False
        v.notice = v.notice or NOTICE_CONTACT
        v.reason = v.reason or next(hits.labels[c] for c in (Cat.CONTACT, Cat.PII, Cat.LINK) if c in hits.labels)
        if me.sexual_score >= 1 or partner_minor:
            # Asking for a Snapchat after sexual talk, or of a minor: grooming pattern.
            v.strike += 1.5
            v.end_session = True
            v.reason = "tried to move a sexual conversation off-platform"
        elif me.contact_attempts >= 3:
            v.strike += 0.5

    if hits.has(Cat.SCAM):
        me.scam_count += 1
        v.deliver = False
        v.notice = v.notice or NOTICE_SPAM
        v.reason = v.reason or hits.labels[Cat.SCAM]
        if me.scam_count >= 2:
            v.strike += 0.5

    # ── Repeats ─────────────────────────────────────────────────────────────
    key = normalize(text).collapsed
    if v.deliver and sum(1 for m in me.recent if m == key) >= SPAM_REPEATS - 1:
        v.deliver = False
        v.notice = NOTICE_REPEAT
        v.reason = v.reason or "repeated message"
    me.recent.append(key)

    if hits.has(Cat.SELF_HARM_RISK):
        v.support = True

    v.strike = min(v.strike, 3.0)
    return v


def check_profile_text(text: str) -> Optional[str]:
    """Usernames and interests are shown to strangers, so screen them too. Returns a reason or None."""
    hits = scan(text)
    for cat in (Cat.CSAM, Cat.SEXUAL_EXPLICIT, Cat.SEXUAL_VIOLENCE, Cat.HATE, Cat.HARASSMENT,
                Cat.THREAT, Cat.SELF_HARM_INCITE, Cat.CONTACT, Cat.PII, Cat.LINK, Cat.SCAM):
        if hits.has(cat):
            return hits.labels[cat]
    if hits.w(Cat.SEXUAL_SUGGESTIVE) >= 1 and hits.has(Cat.MINOR_REFERENCE, Cat.MINOR_AGE):
        return "sexual reference"
    return None
