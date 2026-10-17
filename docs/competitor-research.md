# Competitor research — anonymous text chat (October 2026)

What the Omegle successors do, where they fall short, and what PingPong does about it.
Sources are mostly vendor pages, app listings and review sites; vendor claims are labelled as such.

## Why Omegle died
- Shut down in November 2023. The founder's farewell letter said running it was "no longer sustainable, financially nor psychologically", citing the cost of fighting misuse, including "unspeakably heinous crimes".
- The decisive case: an 11-year-old matched with an adult who then abused her. Reports say under-18s (13+) were allowed until 2022, and that its "monitored chats" didn't stop abuse.
- At its peak (2021) it had ~66M monthly users — demand for random chat is real; the moderation model was the failure.

**Lesson:** age gating and grooming prevention aren't add-ons; they decide whether the product can exist.

## The field

| Service | What's distinctive | Moderation / age | Money | Common complaints |
|---|---|---|---|---|
| **Emerald Chat** | Text + video, interests, group channels, public **karma** (up/down votes) | Automated tools + reports; eSafety notes no real age verification; negative karma can trigger "karma bans" | Gender, karma, country, language filters are paid | Brigading of karma, paying users dominate, minors present |
| **Chitchat.gg** | Text without an account, interest matching, web-only PWA | Real-time automated moderation, face-based age check (vendor claim) | Gender matching paid | Filters cost money |
| **Uhmegle** | Closest to classic Omegle, no sign-up, interest tags | Claims AI + human review, undocumented | Free | Unknown operator, unverified safety claims |
| **OmeTV / Chatroulette / Chatspin** | Video-first, country filters, translation | Hybrid AI + human (Chatroulette uses Hive); explicit content still gets through | Gender filters paid | Evasion by clearing cookies / rotating IPs |
| **Joingy** | No sign-up, no filters | Report-only, no age checks | Free | Weakest moderation in its class |
| **Monkey** | 15-second swipe video intros | Self-reported age | Free | WaPo found unwanted sexual advances involving minors; pulled from the App Store |
| **Yubo** (adjacent) | Teen social app | **Facial age estimation (Yoti) for 100% of users**, age-separated communities | — | — |

## Patterns worth copying
1. **Interest matching** — universal, expected.
2. **Reputation** (Emerald's karma) — but public scores invite brigading and pay-to-win.
3. **Conversation prompts** — Omegle's "question mode" gave strangers something to talk about.
4. **Real-time automated moderation** — table stakes now; the good ones combine classifiers with human review.
5. **Age assurance beyond a checkbox** — Yubo shows full-population age estimation is feasible.

## Recurring user complaints
- **Paywalled basic filters** (gender/region/interests).
- **Bots and copy-paste spam**, fake activity numbers.
- **Explicit content and harassment** slipping through, moderation reacting only after the fact.
- **Ban evasion** by clearing cookies or switching IPs.

## What PingPong does
| Problem seen in the market | PingPong |
|---|---|
| Minors on adult chat (Omegle's fatal flaw) | Account + date of birth at sign-up; filter detects self-stated minor ages and pulls the account into an age check; any sexual message towards a self-declared minor suspends the sender; AI monitor watches for grooming |
| Explicit content reported after the fact | Messages are screened **before delivery**, with evasion-resistant normalisation; sexual escalation ends the match |
| Public karma that gets brigaded | **Private** post-match rating; never shown, never bans anyone; consistently badly-rated players are matched mostly with each other |
| Bots and copy-paste openers | Same long message pasted into many chats gets stopped, then struck |
| Moving victims off-platform | Phone numbers, emails, socials and links blocked in stranger chat; "Add friend" only works if both press it |
| Ban evasion | Bans are tied to the account; suspended emails/Google IDs can't re-register |
| Paywalled filters | Everything free |
| "Nothing to say" | Shared **serves** (conversation starters) on every match, plus a serve button |
| Reports without proof | Server attaches the real transcript, which the reporter can't edit |

## Next steps (not built yet)
- **Facial age estimation** (e.g. Yoti) at sign-up or when the filter flags someone — the strongest single safety upgrade, needs a vendor contract.
- **Email verification** to slow throwaway accounts.
- **Language preference** in matching and optional translation (OmeTV/Camloo do this).
- **Redis-backed state** so the API can scale past one instance.

## Sources
- [NBC News — why Omegle shut down](https://www.nbcnews.com/tech/social-media/omegle-shut-down-did-why-leif-k-brooks-shutdown-alternatives-rcna124393)
- [Silicon Republic — Omegle shutdown](https://www.siliconrepublic.com/?p=1055438)
- [eSafety Commissioner — Emerald Chat guide](https://esafety.gov.au/key-topics/esafety-guide/emerald-chat)
- [Emerald Chat (official)](https://emeraldchat.com/) · [App Store listing](https://apps.apple.com/us/app/emerald-chat-meet-new-people/id6449822829) · [Trustpilot reviews](https://www.trustpilot.com/review/emeraldchat.com?page=2)
- [Chitchat.gg — Omegle alternatives compared](https://www.chitchat.gg/blog/5-best-omegle-alternatives/) (vendor's own comparison)
- [OmeTV — Wikipedia](https://en.wikipedia.org/wiki/OmeTV)
- [Yubo × Yoti case study](https://yoti.com/wp-content/uploads/2024/12/FINAL-Yubo_Case-Study_101224.pdf) · [Yoti facial age estimation FAQ](https://www.yoti.com/blog/facial-age-estimation-faq-frequently-asked-questions) (vendor)
- [DEV Community — a developer's experience with random-chat sites](https://dev.to/pascal_wolf/discovering-real-connections-my-experience-with-bazoocam-chatrandom-and-cammatch-on-randomchat-20li)
