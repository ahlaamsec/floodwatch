# Round 1 (before) — findings and what changed

**Date:** 11 October 2026 · **Testers:** 5 (2 Tamale, 3 Accra) · **Source:** researcher's verbal notes, entered afterwards (the paper forms were not filled in during the sessions).
Testers are anonymised as T1–T5. No names are stored.

**Confirmed by the researcher on 12 October 2026**
- The 1–5 rating answered *"How much would you recommend it to others?"* (it was **not** a trust rating).
- **T3, T4 and T5 speak Twi.** The original v1 had no Twi, so the researcher **added Twi to the app during their sessions**. For these three testers the "before" version was therefore *v1 plus Twi added on the spot*, not v1 as built. Say this plainly in the report.
- **T1 and T2 used the first version (v1 as built: English and Dagbani). T3, T4 and T5 used v1 with Twi added.**
- **Ages (researcher's estimates):** T3 a man around his 40s; T4 similar to T1 (45–59); T5 similar to T3 (around 40s).
- Sabon Jida (T1's area) is in Tamale. T1 spoke Dagbani.
- **T3, T4 and T5 are in Accra**, where the flooding happened. T5 found the alert **with help**.
- **Where people got stuck: the part for viewing neighbours' alerts** (the researcher's summary for the testers who needed help; it was not timed or recorded per person).
- The guardian of T2 (under 18) gave permission.
- T3's exact comment about the voice/audio was not written down and cannot be recovered. Ask him again when he tries v2.1.

> Nothing essential is left unknown for Round 1. The ages for T3–T5 are estimates, so say so in the report. No task times were taken, and the paper forms were not filled in during the sessions.

## What testers did and said

| ID | Area | Age | Language | Found alert | Would recommend (1–5) | Key points |
|---|---|---|---|---|---|---|
| T1 | Sabon Jida, Tamale | 45–59 | **Dagbani** | With a lot of help | 4 | Understood the purpose; advice made sense; happy to share her area; **asked for live location sharing and for photos of the water level** for friends to see; "very helpful" |
| T2 | Choggu, Tamale | under 18 | Dagbani | **Without help** | 3 | Understood; advice made sense; **worried about being tracked**, compared it to a film where everything you press is watched |
| T3 | Accra | man, ~40s* | **Twi** | With help (UI) | 3 | Very happy to test; found it helpful; **said the voice/audio could be improved** |
| T4 | Accra | ~45–59* | **Twi** | With less help than T1 | ? | Similar to T1; **suggested a place where native speakers can add more Twi** |
| T5 | Accra | ~40s* | **Twi** | With help | ? | Similar to T3 |

\*Ages for T3–T5 are the researcher's estimates (T4 'similar to T1', T5 'similar to T3').

Ratings are how much the tester would recommend the app to others (1–5). Only T1, T2 and T3 gave one (4, 3, 3), so there is nothing to average; report them as individual answers.

## Themes

1. **Everyone understood what the app is for** (5 of 5 where recorded), and the advice made sense to those asked.
2. **Four of the five testers needed help; only the youngest (T2) found the alert alone.** T1 needed a lot of help, T3 and T5 needed help, T4 needed less. According to the researcher, **the step where people got stuck was viewing their neighbours' alerts**, which is the app's core feature. The design is not yet self-explanatory for the main audience.
3. **A privacy tension between testers.** T1 *wanted more* location sharing (live location to family). T2 was *afraid of any* location sharing and of being watched. One design has to serve both.
4. **Showing, not only telling.** T1 wanted photos of the water level, so others can judge how serious it is.
5. **Language ownership.** T4 wanted native speakers to be able to add Twi themselves.
6. **Voice needs work** (T3; the detail was not recorded).
7. **Language coverage.** Three of the five testers (T3–T5) speak Twi, and v1 had no Twi. The researcher had to add it during their sessions. Without that, these testers could not have used the app in their own language.

## Design responses in v2.1 (each linked to evidence)

> **Not yet clearly solved:** people got stuck at *viewing neighbours' alerts*. v2.1 adds a How-to card and read-aloud, but (from reading the code) the alert list still sits below the red report button, the emergency button, the 'I am safe / I need help' buttons and the How-to card, and nothing on the screen says these are warnings from neighbours. Round 2's timed task measures exactly this step, so any change to it should be made, and written down, **before** Round 2.

| Finding | Change |
|---|---|
| Older testers needed help (T1, T3, T5) | A short **"How to use"** card on the home screen (3 steps, each can be heard); a first-run question **"Should the app talk to you?"** that turns on read-aloud for everything |
| Fear of tracking (T2) | A first-run screen, **"What Flood Watch knows about you"**, spoken aloud: what it knows, what it never knows, and that it cannot see anything else on the phone. It is honest that test sessions count taps. Plus **"Delete everything this app saved on my phone"** in Settings |
| Wanted live location sharing (T1) vs. fear of tracking (T2) | Not built as tracking. Instead: **"I am safe" / "I need help"** messages the person sends to their own family on WhatsApp. Exact location is added **only if they tick a box**, it is made on the phone, and Flood Watch never receives it. Sharing is something the person does, one message at a time, never continuous |
| Photos of the water level (T1) | Optional **photo in a report**. The phone shrinks the picture and **removes hidden location data (EXIF/GPS)** before sending. A prompt asks people to avoid faces. Photos are deleted with the alert after 24 hours |
| Native speakers adding Twi (T4) | Settings → **"Help improve Twi and Dagbani"**: anyone can suggest better wording; only the research team can publish recordings (so a wrong or harmful recording can't reach everyone instantly) |
| Voice could be better (T3) | Read-aloud by default if chosen at first run; *more changes once his specific comment is known* |

## For the report

- Write these as observations from a small, informal first round, not as statistics.
- The T1/T2 tension is the most interesting finding for usable privacy: the same feature is *wanted* by one person and *feared* by another. The response keeps the person in control (they send it, one message at a time) rather than choosing one side.
- T2 is under 18. A parent or guardian gave permission; say so in the report and describe how it was asked for.
- For T3–T5 the 'before' version was v1 plus Twi added during the session. Say so, and do not present their results as a clean test of the original v1.
- Round 2 uses the timed task. Round 1 has no times, so compare completion (alone / with help) and quotes, not seconds.
