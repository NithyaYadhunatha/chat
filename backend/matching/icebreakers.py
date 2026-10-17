"""
Conversation starters ("serves"). Both players see the same one when a match
starts, and either can serve a new one. Kept light, non-personal and non-sexual:
nothing that asks for age, location, looks or contact details.
"""
import random
from typing import Optional

PROMPTS = [
    "What's a hill you're willing to die on that nobody else cares about?",
    "What's the best thing you've eaten this month?",
    "If you could instantly master one skill, what would it be?",
    "What's a song you've had on repeat lately?",
    "What's the most overrated movie of all time?",
    "Cereal: soup or not soup?",
    "What's something small that made you happy this week?",
    "If you had to teach a class on anything, what would it be?",
    "What fictional world would you actually want to live in?",
    "What's the weirdest fact you know?",
    "What's a game you could play forever?",
    "Morning person or night owl — and do you regret it?",
    "What's a hobby you picked up and immediately dropped?",
    "What's the best advice you've ever ignored?",
    "If animals could talk, which would be the rudest?",
    "What's a book, show or podcast you'd recommend to a stranger?",
    "What would your ideal lazy Sunday look like?",
    "What's something you believed as a kid that was completely wrong?",
    "Which era of music is the best era of music?",
    "What's the most useless talent you have?",
    "If you could add one rule to the world, what would it be?",
    "What's a place you've been that surprised you?",
    "What's the last thing that made you laugh out loud?",
    "Pineapple on pizza — defend your answer.",
    "What's a trend you just don't get?",
    "If you won a free trip tomorrow, where are you going?",
    "What's your comfort movie?",
    "What would you name a boat?",
    "What's a smell that instantly takes you back somewhere?",
    "What job would you be terrible at?",
    "Best snack for a long night of studying or working?",
    "What's something you're looking forward to?",
    "Which video game soundtrack lives rent-free in your head?",
    "What's an opinion you changed your mind about?",
    "If your life had a theme song, what is it?",
    "What's the best gift you've ever given someone?",
    "Cats, dogs, or something unhinged like a capybara?",
    "What's a skill you think everyone should learn?",
    "Tea, coffee, or chaos?",
    "What's the most interesting thing you learned recently?",
]


def pick(exclude: Optional[str] = None) -> str:
    choices = [p for p in PROMPTS if p != exclude]
    return random.choice(choices)
