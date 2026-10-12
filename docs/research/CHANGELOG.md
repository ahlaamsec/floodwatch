# Changelog: v1 (Round 1) → v2 (Round 2)

Every change should point to its source: **A#** = the heuristic audit (`ui-audit-v1.md`), **T#** = a Round 1 tester finding (tester ID), **RQ** = the research question.

| Change | Why (source) | Research angle |
|---|---|---|
| Rebuilt as plain HTML/CSS/JS + a Node backend | A1. Alerts never reached anyone else | Core function |
| "I see this too" + "This is not true", one vote per phone, "Doubtful" label | A2 | Trust, false alerts |
| Alert age, "Older" after 2 h, removed after 6 h | A7 | Trust |
| Privacy box. Area only, optional landmark, phone/email blocked | A3 | Privacy |
| Language chosen first. All text in one file. English fallback | A4, A9 | Inclusion |
| Listen button (English text-to-speech now, Dagbani recordings when added) | RQ: people who don't read | Inclusion |
| Icon + word + bar for each level. AA contrast. 17px text. Buttons for cards | A5, A6 | Accessibility |
| Share on WhatsApp | How warnings already travel | Reach |
| "Was this advice helpful?" (anonymous counts at `/api/stats`) | Measurement | Evaluation |
| Offline: last alerts saved on the phone | Floods cut connections | Reliability |
| "Practice alert" label on demo data | A7, test honesty | Research ethics |
| _Round 1 changes go here (T1, T2, …)_ | | |
