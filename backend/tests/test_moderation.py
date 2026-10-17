import asyncio

import pytest

from matching.matchmaker import Matchmaker
from moderation.engine import ParticipantState, evaluate, scan
from moderation.rules import Cat


@pytest.mark.parametrize("text,cat", [
    ("send nudes", Cat.SEXUAL_EXPLICIT),
    ("s e n d  n u d e s", Cat.SEXUAL_EXPLICIT),
    ("s3nd nud3s", Cat.SEXUAL_EXPLICIT),
    ("ѕend nudеs", Cat.SEXUAL_EXPLICIT),      # Cyrillic look-alikes
    ("n​u​d​e​s", Cat.SEXUAL_EXPLICIT),  # zero-width spaces
    ("hooorny?", Cat.SEXUAL_EXPLICIT),
    ("are you touching yourself", Cat.SEXUAL_EXPLICIT),
    ("im 15 f", Cat.MINOR_AGE),
    ("i am 16", Cat.MINOR_AGE),
    ("14 years old lol", Cat.MINOR_AGE),
    ("i'm in 8th grade", Cat.MINOR_AGE),
    ("add me on snap", Cat.CONTACT),
    ("whats ur insta", Cat.CONTACT),
    ("call me 98765 43210", Cat.PII),
    ("bob [at] gmail [dot] com", Cat.PII),
    ("check www.example.com", Cat.LINK),
    ("kys", Cat.SELF_HARM_INCITE),
    ("i know where you live", Cat.THREAT),
    ("trading cp vids", Cat.CSAM),
    ("i want to kill myself", Cat.SELF_HARM_RISK),
])
def test_detects(text, cat):
    assert cat in scan(text).weights


@pytest.mark.parametrize("text", [
    "hey whats up", "22 m from bangalore", "i'm 15 minutes away", "I'm 6'2", "the cocktail was great",
    "analysis of the data", "my therapist is nice", "this exam is so hard", "ride my bike to work",
    "touch my heart", "i'm 19 m", "cumulative grade", "i was 15 when i moved", "see you at 5pm",
    "what music do you like?", "are you kidding me", "i'm at home now", "u r a good person",
])
def test_ignores_innocent_messages(text):
    hits = scan(text)
    assert not hits.has(Cat.SEXUAL_EXPLICIT, Cat.CSAM, Cat.MINOR_AGE, Cat.HATE, Cat.THREAT,
                        Cat.SELF_HARM_INCITE, Cat.CONTACT, Cat.PII, Cat.LINK), (text, hits.weights)


def test_sexual_escalation_ends_chat():
    me, partner = ParticipantState(), ParticipantState()
    first = evaluate("you're so sexy", me, partner)
    assert first.deliver and not first.end_session
    for line in ["what are you wearing", "sexy sexy", "kiss me", "you turn me on", "be naughty with me",
                 "sexy pics?", "send me a selfie", "so sexy"]:
        v = evaluate(line, me, partner)
        if v.end_session:
            break
    assert v.end_session and not v.deliver and v.strike > 0


def test_grooming_patterns():
    me, minor = ParticipantState(), ParticipantState(said_minor=True)
    assert evaluate("send nudes", me, minor).critical
    v = evaluate("you're cute, are you single", ParticipantState(), minor)
    assert v.end_session and v.urgent_review

    flirty = ParticipantState(sexual_score=2)
    v = evaluate("add me on snap", flirty, ParticipantState())
    assert v.end_session and v.strike >= 1.5


def test_contact_allowed_between_friends():
    assert evaluate("my insta is @someone", ParticipantState(), ParticipantState(), mode="dm").deliver


def test_repeat_spam_blocked():
    me = ParticipantState()
    results = [evaluate("hello??", me).deliver for _ in range(4)]
    assert results[:2] == [True, True] and results[-1] is False


def test_matchmaker_respects_blocks_interests_and_cooldown():
    async def run():
        mm = Matchmaker()
        await mm.join("a", {"music"}, excluded={"b"})
        await mm.join("b", {"music"}, excluded={"a"})
        await mm.join("c", {"music", "chess"}, excluded=set())
        pairs = await mm.take_pairs()
        assert [(p[0].user_id, p[1].user_id, p[2]) for p in pairs] == [("a", "c", ["music"])]

        # c and a were just paired, so they aren't matched again straight away.
        await mm.join("a", set(), set())
        await mm.join("c", set(), set())
        assert await mm.take_pairs() == []

        # Someone with interests waits for a shared one rather than taking anyone.
        mm2 = Matchmaker()
        await mm2.join("x", {"chess"}, set())
        await mm2.join("y", {"football"}, set())
        assert await mm2.take_pairs() == []
    asyncio.run(run())


def test_low_trust_pool_is_separate():
    async def run():
        mm = Matchmaker()
        await mm.join("good", set(), set(), low_trust=False)
        await mm.join("bad", set(), set(), low_trust=True)
        assert await mm.take_pairs() == []
        await mm.join("bad2", set(), set(), low_trust=True)
        pairs = await mm.take_pairs()
        assert {pairs[0][0].user_id, pairs[0][1].user_id} == {"bad", "bad2"}
    asyncio.run(run())


def test_trust_score_needs_several_bad_ratings():
    from models import User
    from moderation.trust import is_low_trust
    u = User.model_construct(rating_up=0, rating_down=3)
    assert not is_low_trust(u)
    u = User.model_construct(rating_up=1, rating_down=6)
    assert is_low_trust(u)
    u = User.model_construct(rating_up=20, rating_down=6)
    assert not is_low_trust(u)
