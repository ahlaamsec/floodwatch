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
| **Round 1 changes (v2.1)** | | |
| "How to use" card (3 steps, can be heard) and a first-run "Should the app talk to you?" | T1, T3, T5 needed help (Round 1) | Inclusion |
| First-run "What Flood Watch knows about you" (spoken) and "Delete everything this app saved on my phone" | T2 feared being tracked | Privacy |
| "I am safe" / "I need help" messages sent by the person on WhatsApp; exact location only if they tick a box and never sent to Flood Watch | T1 wanted live location; T2 feared tracking | Privacy, control |
| Optional photo of the water; the phone strips hidden location data (EXIF) | T1 | Trust, privacy |
| "Help improve Twi and Dagbani": suggestions from anyone, recordings only from the research team | T4 | Language ownership |
| **Round 1 → v2.1.1** | | |
| A heading "Warnings from your neighbours" (with a speaker button) directly above the alert list; read aloud for people who chose "talk to me" | Researcher's summary: the step where people got stuck was viewing neighbours' alerts (T1, T3, T4, T5 needed help) | Inclusion, core function |
| The "How to use" card moved from above the list to below it, so on a first visit the warnings are on screen (they were below the screen, at about 860 px on an 844 px phone) | Same: viewing neighbours' alerts. Found by testing the screen, not by testers | Inclusion, core function |
| On phones the "Ask the helper" button is now a normal button at the end of the page; it floats only on wide screens. On a 360×640 phone the floating button covered the first warning | Same. Found by testing the screen on a small phone | Inclusion |
