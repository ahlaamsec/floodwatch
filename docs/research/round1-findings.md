# Round 1 (before) — findings and what changed

**Date:** 11 October 2026 · **Testers:** 5 (3 Tamale, 2 Accra) · **Source:** researcher's verbal notes, entered afterwards (the paper forms were not filled in during the sessions).
Testers are anonymised as T1–T5. No names are stored.

> Still to confirm: which app version they used; what the 1–5 ratings measured; T3–T5's areas, age ranges and languages; where exactly people got stuck. Fill these in before writing the report. Do not guess them.

## What testers did and said

| ID | Area | Age | Language | Found alert | Rating* | Key points |
|---|---|---|---|---|---|---|
| T1 | Sabon Jida, Tamale | 45–59 | ? | With a lot of help | 4 | Understood the purpose; advice made sense; happy to share her area; **asked for live location sharing and for photos of the water level** for friends to see; "very helpful" |
| T2 | Choggu, Tamale | under 18 | Dagbani | **Without help** | 3 | Understood; advice made sense; **worried about being tracked**, compared it to a film where everything you press is watched |
| T3 | ? | adult | ? | With help (UI) | 3 | Very happy to test; found it helpful; **said the voice/audio could be improved** |
| T4 | Accra | adult | ? | With less help than T1 | ? | Similar to T1; **suggested a place where native speakers can add more Twi** |
| T5 | Accra | adult | ? | not recorded (similar to T3) | ? | Similar to T3 |

\*Which question the rating answered is still to be confirmed.

## Themes

1. **Everyone understood what the app is for** (5 of 5 where recorded), and the advice made sense to those asked.
2. **Older adults needed help to get around.** T1 and T3 needed help (T5 reportedly similar to T3); T4 needed less; the youngest tester (T2) needed none. The design is not yet self-explanatory for the main audience.
3. **A privacy tension between testers.** T1 *wanted more* location sharing (live location to family). T2 was *afraid of any* location sharing and of being watched. One design has to serve both.
4. **Showing, not only telling.** T1 wanted photos of the water level, so others can judge how serious it is.
5. **Language ownership.** T4 wanted native speakers to be able to add Twi themselves.
6. **Voice needs work** (T3; detail not yet recorded).

## Design responses in v2.1 (each linked to evidence)

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
- T2 is under 18. Include her answers only if a parent or guardian agreed. Either way, say how you handled this.
- Round 2 uses the timed task. Round 1 has no times, so compare completion (alone / with help) and quotes, not seconds.
