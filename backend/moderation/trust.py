"""
Private trust score from post-chat ratings.

Competitors like Emerald Chat show karma publicly, which invites brigading and
"karma bans" from a handful of people. Ours is never shown to anyone and never
bans anybody on its own: it only decides which matching pool you wait in.
People who many different strangers rate badly end up mostly meeting each other.
"""
from models import User

MIN_DOWN_VOTES = 4        # need several independent bad ratings before it matters
LOW_TRUST_BELOW = 0.35    # Laplace-smoothed share of good ratings


def trust_score(user: User) -> float:
    return (user.rating_up + 1) / (user.rating_up + user.rating_down + 2)


def is_low_trust(user: User) -> bool:
    return user.rating_down >= MIN_DOWN_VOTES and trust_score(user) < LOW_TRUST_BELOW
