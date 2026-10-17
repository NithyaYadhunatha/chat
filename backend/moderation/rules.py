"""
Pattern rules for the content filter.

Each rule belongs to a category and carries a weight. The engine adds weights
up per message and per chat session, then decides what to do (see engine.py).

Word patterns are "fuzzy": every letter may repeat (seeexxx) and a single
punctuation mark may sit between letters (s.e.x, f*ck is handled separately).
They run against the leetspeak and collapsed variants from normalize.py.
Age and contact-detail patterns run against the plain variant so digits survive.
"""
import re
from dataclasses import dataclass
from enum import Enum
from typing import List, Sequence


class Cat(str, Enum):
    CSAM = "csam"                         # sexual content involving minors — zero tolerance
    SEXUAL_EXPLICIT = "sexual_explicit"   # explicit sexual content or solicitation
    SEXUAL_SUGGESTIVE = "sexual_suggestive"
    SEXUAL_VIOLENCE = "sexual_violence"
    MINOR_AGE = "minor_age"               # someone says they are under 18
    MINOR_REFERENCE = "minor_reference"   # talk of kids/teens (only matters next to sexual content)
    HATE = "hate"                         # slurs
    HARASSMENT = "harassment"             # targeted abuse
    THREAT = "threat"                     # threats of violence, doxxing
    SELF_HARM_INCITE = "self_harm_incite" # telling someone to hurt themselves
    SELF_HARM_RISK = "self_harm_risk"     # user expressing they may hurt themselves
    CONTACT = "contact"                   # trying to move the chat to another app
    PII = "pii"                           # phone numbers, emails
    LINK = "link"                         # URLs
    SCAM = "scam"                         # spam, scams, advertising


@dataclass(frozen=True)
class Rule:
    cat: Cat
    weight: float
    pattern: re.Pattern
    on_plain: bool = False  # match against the digit-preserving variant only
    label: str = ""


_SEP = r"[^\w\s]?"
_L = r"(?<![a-z])"
_R = r"(?![a-z])"


def _fuzzy(word: str) -> str:
    parts = []
    for ch in word:
        if ch == " ":
            parts.append(r"\s*")
        else:
            parts.append(re.escape(ch) + "+")
    return _SEP.join(parts).replace(_SEP + r"\s*" + _SEP, r"\s*")


def words(*items: str, suffix: str = r"(?:s|es|ing|ed|er|ers|y|ie|ies)?") -> str:
    return _L + "(?:" + "|".join(_fuzzy(i) for i in items) + ")" + suffix + _R


def rx(pattern: str) -> re.Pattern:
    return re.compile(pattern, re.IGNORECASE)


AGES_UNDER_18 = r"(?:1[0-7]|[5-9])"
_NOT_A_UNIT = (
    r"(?!\s*(?:min|mins|minute|minutes|hr|hrs|hour|hours|h|sec|secs|s|second|seconds|day|days|"
    r"week|weeks|month|months|%|percent|km|kms|mi|miles|ft|feet|in|inch|inches|cm|mm|kg|kgs|lb|lbs|"
    r"pounds|dollars|bucks|rs|rupees|k|th|st|nd|rd|am|pm|foot|feet|ft|times|x|:|'|\"|\.\d|,\d|/\d|\d))"
)

SEXUAL_EXPLICIT_TERMS = words(
    "porn", "porno", "nude", "nudes", "naked pic", "naked pics", "dick pic", "dickpic", "cock", "pussy",
    "blowjob", "blow job", "handjob", "hand job", "jerk off", "jack off", "jerking off", "wank", "wanking",
    "masturbate", "masturbating", "masturbation", "orgasm", "horny", "sext", "boobs", "boobies", "tits",
    "titties", "penis", "vagina", "dildo", "fap", "onlyfans", "nsfw", "cum", "cumming", "creampie", "anal",
    "bdsm", "erection", "boner", "deepthroat", "milf", "hentai", "xxx", "camgirl", "cam show", "striptease",
    "strip tease", "nipple", "clit", "genitals", "bj", "pornhub", "xvideos", "xhamster", "chaturbate",
    suffix=r"(?:s|es|ing|ed)?",
)

SEXUAL_SOLICIT = "|".join([
    _L + r"send\s+(?:me\s+)?(?:some\s+|a\s+)?(?:nudes?|lewds?|naked\s+\w+|spicy\s+pics?)" + _R,
    _L + r"show\s+(?:me\s+)?(?:your|ur|those|them|ya)\s+(?:body|boob\w*|tit\w*|ass|butt|feet|chest|bra|panties|underwear|dick|cock|pussy|nudes?)" + _R,
    _L + r"(?:wanna|want\s+to|let'?s|lets|can\s+we|will\s+you|u\s+wanna|you\s+wanna|down\s+to)\s+(?:fuck|sext|have\s+sex|hook\s*up|bang|smash)" + _R,
    _L + r"(?:suck|lick|ride|touch|rub|grab|squeeze|kiss|spank)\s+(?:my|your|ur|ya|them|those)\s+(?:dick|cock|d|pussy|tits|boobs|ass|butt|body|thighs|nipples?|balls|chest|cunt|clit)" + _R,
    _L + r"(?:fuck\s+me|fuck\s+(?:you|u)\s+(?:hard|so\s+hard|good|raw)|suck\s+(?:me|it)\s+off|sit\s+on\s+my\s+(?:face|lap|dick|cock))" + _R,
    _L + r"(?:take|taking)\s+(?:off\s+)?(?:your|ur)\s+(?:clothes|shirt|top|bra|pants|panties|underwear)(?:\s+off)?" + _R,
    _L + r"(?:cam\s*2\s*cam|c2c|trade\s+pics|pic\s+trade|rate\s+my\s+(?:d|dick|cock|body|tits|boobs))" + _R,
    _L + r"(?:dirty\s+talk|talk\s+dirty|sex\s+chat|sexchat|have\s+sex|having\s+sex|make\s+love|get\s+laid|one\s+night\s+stand)" + _R,
    _L + r"(?:what(?:'?s|\s+is)\s+(?:your|ur)\s+(?:bra|cup|dick|cock)\s+size|how\s+big\s+is\s+(?:your|ur)\s+(?:dick|cock|d))" + _R,
    _L + r"(?:are\s+(?:you|u)|r\s+u)\s+(?:horny|naked|nude|aroused|touching\s+(?:yourself|urself)|(?:wet|hard)\s+for\s+me)" + _R,
    _L + r"(?:i'?m|im|i\s+am|getting|got)\s+(?:so\s+|really\s+|very\s+)?(?:horny|naked|aroused|(?:wet|hard)\s+for\s+(?:you|u))" + _R,
    _L + r"makes?\s+me\s+(?:so\s+)?(?:wet|hard|horny)" + _R,
])

SEXUAL_SUGGESTIVE_PHRASES = "|".join([
    _L + r"send\s+(?:me\s+)?(?:a\s+)?(?:pic|pics|photo|photos|picture|pictures|selfie|selfies)(?:\s+of\s+(?:you|ur|yourself|urself))?" + _R,
    _L + r"what\s+(?:are\s+(?:you|u)|r\s+u)\s+wearing" + _R,
    _L + r"(?:are\s+(?:you|u)|r\s+u)\s+(?:hot|cute|single|alone)" + _R,
])

SEXUAL_SUGGESTIVE_TERMS = words(
    "sex", "sexy", "seductive", "naughty", "lingerie", "panties", "thong", "bra", "spank", "kink", "kinky",
    "fetish", "turn me on", "turned on", "turns me on", "make out", "making out", "roleplay", "daddy",
    "mommy", "babygirl", "hot body", "booty", "thick", "moan", "kiss me", "cuddle", "bed with me", "sugar daddy",
    suffix=r"(?:s|es|ing|y|ier|iest)?",
)

SEXUAL_VIOLENCE = words("rape", "raping", "rapist", "molest", "grope", "groping", suffix=r"(?:s|d|ed|er|ers|ing)?")

CSAM_TERMS = "|".join([
    _L + r"(?:child\s*porn\w*|kiddie\s*porn|kiddy\s*porn|pthc|pedo\s*(?:pics?|vids?|videos?|porn)|preteen\s*(?:pics?|nudes?|sex|porn)|jail\s*bait|lolicon|shotacon)" + _R,
    _L + r"cp" + _R + r".{0,40}" + _L + r"(?:trade|trading|sell|selling|buy|link|links|vids?|videos?|pics?|folder|mega|have|got)" + _R,
    _L + r"(?:trade|trading|sell|selling|buy|link|links|vids?|videos?|pics?|folder|mega|have|got)" + _R + r".{0,40}" + _L + r"cp" + _R,
    _L + r"(?:underage|under\s*age|minor|kid|kids|child|children|little\s+girl|little\s+boy|preteen|young\s+girl|young\s+boy)s?\s+(?:nudes?|pics?|porn|sex|naked|nsfw)" + _R,
])

MINOR_AGE_PATTERNS = "|".join([
    # "i'm 15", "im only 14", "i am 16" — but not "i'm 15 minutes away"
    r"(?<![\w'])(?:i'?m|i\s+am|im|am|i\s+turned|just\s+turned)\s+(?:only\s+|just\s+|like\s+|about\s+|almost\s+)?" + AGES_UNDER_18 + r"(?!\d)" + _NOT_A_UNIT,
    # "15 yo", "14 years old", "16yrs"
    r"(?<!\d)" + AGES_UNDER_18 + r"\s*(?:yo|y/o|y\.o\.?|yrs?\s*old|years?\s*old|year\s*old|yrs|years?\s+of\s+age)(?![a-z])",
    # "age 15", "my age is 14", "age: 16"
    r"(?<![a-z])(?:age|aged|my\s+age\s+is)\s*[:=\-]?\s*" + AGES_UNDER_18 + r"(?!\d)",
    # ASL style at the start of a message: "15 f", "14/m", "16m"
    r"^\s*" + AGES_UNDER_18 + r"\s*[/,\- ]?\s*(?:m|f|male|female|boy|girl|guy)(?![a-z])",
    r"^\s*(?:m|f|male|female|boy|girl)\s*[/,\- ]?\s*" + AGES_UNDER_18 + r"(?!\d)",
    r"(?<![a-z])asl\s*[:\-]?\s*" + AGES_UNDER_18 + r"(?!\d)",
    # school year
    r"(?<![a-z])(?:in|i'?m\s+in|im\s+in)\s+(?:the\s+)?(?:[5-9]th|6th|7th|8th|9th|fifth|sixth|seventh|eighth|ninth)\s+grade(?![a-z])",
    r"(?<![a-z])(?:i'?m|im|i\s+am)\s+(?:in|at)\s+(?:middle\s+school|junior\s+high|primary\s+school|elementary)(?![a-z])",
])

MINOR_REFERENCE = words(
    "kid", "child", "children", "minor", "underage", "preteen", "teen", "teenager", "schoolgirl", "schoolboy",
    "little girl", "little boy", "young girl", "young boy", "loli", "shota", "jailbait",
    suffix=r"(?:s|z)?",
)

HATE_TERMS = words(
    "nigger", "nigga", "niggah", "faggot", "fag", "retard", "tranny", "chink", "spic", "kike", "wetback",
    "paki", "coon", "gook", "dyke", "raghead", "towelhead", "beaner",
    suffix=r"(?:s|z|ed)?",
)

HARASSMENT_PATTERNS = "|".join([
    _L + r"(?:fuck|f\*ck|f\*\*k|fk|fck|screw)\s+(?:you|u|off|ur\s+mom|your\s+mom)" + _R,
    _L + r"(?:you(?:'?re|\s+are)?|ur|u\s+r)\s+(?:a\s+|an\s+|so\s+)?(?:worthless|pathetic|disgusting|whore|slut|bitch|cunt|subhuman)" + _R,
    words("cunt", "whore", "slut", "motherfucker", suffix=r"(?:s|z)?"),
    _L + r"(?:no\s+one|nobody)\s+(?:loves|likes|cares\s+about)\s+(?:you|u)" + _R,
])

THREAT_PATTERNS = "|".join([
    _L + r"(?:i'?ll|i\s+will|im\s+gonna|i'?m\s+going\s+to|i'?m\s+gonna|gonna)\s+(?:kill|murder|stab|shoot|hurt|beat|find|rape|hunt|dox|doxx|swat)\s+(?:you|u|ur|your)" + _R,
    _L + r"i\s+know\s+where\s+(?:you|u)\s+live" + _R,
    _L + r"(?:i'?ll|i\s+will|gonna)\s+(?:leak|post|share)\s+(?:your|ur)\s+(?:pics|photos|address|nudes|info)" + _R,
    _L + r"(?:ur|your|you'?re|you\s+are)\s+(?:dead|gonna\s+die)" + _R,
])

SELF_HARM_INCITE = "|".join([
    _L + r"(?:kill|hang|shoot|end)\s+(?:your\s*self|urself|yourself|ur\s+self|yo\s*self)" + _R,
    _L + r"kys" + _R,
    _L + r"(?:go|just)\s+(?:die|kill\s+yourself|jump\s+off)" + _R,
    _L + r"(?:you|u)\s+should\s+(?:die|kill\s+yourself|not\s+exist)" + _R,
])

SELF_HARM_RISK = "|".join([
    _L + r"(?:i\s+want\s+to|i\s+wanna|i'?m\s+going\s+to|i'?m\s+gonna|gonna)\s+(?:die|kill\s+myself|end\s+it|end\s+my\s+life|hurt\s+myself|cut\s+myself)" + _R,
    _L + r"(?:i'?m|im|i\s+am|feeling)\s+(?:so\s+)?suicidal" + _R,
    _L + r"(?:i\s+)?(?:don'?t|dont)\s+want\s+to\s+(?:live|be\s+alive|exist)\s*(?:anymore)?" + _R,
    _L + r"(?:i\s+)?(?:cut|cutting|hurt|hurting)\s+myself" + _R,
])

CONTACT_PATTERNS = "|".join([
    _L + r"(?:snap\s*chat|snap|insta|instagram|telegram|kik|whats\s*app|discord|wickr|wechat|skype)\s*(?:id|handle|user\s*name|username|is|:|-|@|\?)",
    _L + r"(?:sc|ig|tg|wa|dc)\s*[:@]",
    _L + r"(?:wanna|want\s+to|let'?s|lets|can\s+we|u\s+wanna|you\s+wanna)\s+(?:video\s*call|vc|facetime|cam|call|move\s+to|switch\s+to)" + _R,
    _L + r"(?:add|follow|dm|message|msg|text|hmu|hit\s+me\s+up)\s+(?:me\s+)?(?:on|at|@)\s+(?!here|this|the\s+app)\w+",
    _L + r"(?:what'?s|whats|wats|what\s+is|drop|give\s+me|send\s+me)\s+(?:your|ur|yo)\s+(?:snap|sc|insta|ig|number|num|digits|discord|telegram|kik|whatsapp|socials?|handle|@)" + _R,
    _L + r"(?:my|here'?s\s+my)\s+(?:snap|sc|insta|ig|number|num|discord|telegram|kik|whatsapp|socials?)\s*(?:is|:|-|@)",
    r"(?<![\w.])@[a-z0-9_.]{3,30}(?![\w@])",
])

PHONE_PATTERN = r"(?<!\d)(?:\+?\d[\s\-.()]*){9,14}\d(?!\d)"
EMAIL_PATTERN = r"[a-z0-9._%+\-]+\s*(?:@|\(at\)|\[at\]|\sat\s)\s*[a-z0-9.\-]+\s*(?:\.|\(dot\)|\[dot\]|\sdot\s)\s*[a-z]{2,}"
LINK_PATTERN = (
    r"(?:https?://|www\.|(?<![@\w])[a-z0-9\-]{2,63}\s*(?:\.|\(dot\)|\[dot\])\s*"
    r"(?:com|net|org|io|co|me|gg|ly|xyz|link|app|tv|in|uk|ru|cc|to|be|site|online|live|chat|fun|club|info|biz|vip|cam|xxx|sex|porn)(?![a-z]))"
)

SCAM_PATTERNS = "|".join([
    words("free robux", "free vbucks", "crypto giveaway", "double your", "investment opportunity",
          "make money fast", "cash app me", "sugar baby", "paypal me", "send me money", "gift card code",
          "subscribe to my", "join my server", "telegram channel",
          suffix=r"(?:s)?"),
])


def _rules() -> List[Rule]:
    return [
        Rule(Cat.CSAM, 10, rx(CSAM_TERMS), label="sexual content involving minors"),
        Rule(Cat.SEXUAL_EXPLICIT, 3, rx(SEXUAL_EXPLICIT_TERMS), label="explicit sexual content"),
        Rule(Cat.SEXUAL_EXPLICIT, 3, rx(SEXUAL_SOLICIT), label="sexual solicitation"),
        Rule(Cat.SEXUAL_SUGGESTIVE, 1, rx(SEXUAL_SUGGESTIVE_TERMS), label="sexual remarks"),
        Rule(Cat.SEXUAL_SUGGESTIVE, 1, rx(SEXUAL_SUGGESTIVE_PHRASES), label="sexual remarks"),
        Rule(Cat.SEXUAL_VIOLENCE, 4, rx(SEXUAL_VIOLENCE), label="sexual violence"),
        Rule(Cat.MINOR_AGE, 1, rx(MINOR_AGE_PATTERNS), on_plain=True, label="under-18 age"),
        Rule(Cat.MINOR_REFERENCE, 1, rx(MINOR_REFERENCE), label="reference to minors"),
        Rule(Cat.HATE, 3, rx(HATE_TERMS), label="hate speech"),
        Rule(Cat.HARASSMENT, 2, rx(HARASSMENT_PATTERNS), label="harassment"),
        Rule(Cat.THREAT, 4, rx(THREAT_PATTERNS), label="threats"),
        Rule(Cat.SELF_HARM_INCITE, 4, rx(SELF_HARM_INCITE), label="encouraging self-harm"),
        Rule(Cat.SELF_HARM_RISK, 1, rx(SELF_HARM_RISK), label="self-harm risk"),
        Rule(Cat.CONTACT, 1, rx(CONTACT_PATTERNS), label="sharing contact handles"),
        Rule(Cat.PII, 1, rx(PHONE_PATTERN), on_plain=True, label="phone number"),
        Rule(Cat.PII, 1, rx(EMAIL_PATTERN), on_plain=True, label="email address"),
        Rule(Cat.LINK, 1, rx(LINK_PATTERN), on_plain=True, label="link"),
        Rule(Cat.SCAM, 2, rx(SCAM_PATTERNS), label="spam or scam"),
    ]


RULES: Sequence[Rule] = _rules()

# Someone who bothers to spell a word out letter by letter ("n u d e s") is
# dodging the filter, so inside those runs we match these stems anywhere.
SPELLED_OUT = [
    (Cat.SEXUAL_EXPLICIT, 3, rx(r"nude|porn|horny|dick|cock|puss|boob|tits|sext|cum|fuck|blowjob|naked"), "explicit sexual content"),
    (Cat.SEXUAL_SUGGESTIVE, 1, rx(r"sex"), "sexual remarks"),
    (Cat.HATE, 3, rx(r"nigg|fag|retard|tranny|chink|kike"), "hate speech"),
    (Cat.SELF_HARM_INCITE, 4, rx(r"^kys$|killyourself"), "encouraging self-harm"),
    (Cat.CONTACT, 1, rx(r"snap|insta|telegram|kik|whatsapp|discord"), "sharing contact handles"),
]
