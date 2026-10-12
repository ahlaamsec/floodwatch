# Flood Watch v1: heuristic UI audit

**Method:** a heuristic review of the v1 code (`flood_alert.tsx`) against usability and accessibility basics (Nielsen's heuristics, WCAG 2.2 AA). I did it with AI assistance (Claude).
**Status:** this is an expert-style review, **not** user evidence. User findings come only from the Round 1 and Round 2 test sheets.

| # | Screen | Problem | Severity (1–5) | Fixed in v2 by |
|---|---|---|---|---|
| 1 | Report → list | Alerts were saved only on the sender's phone (`window.storage` is not available in a normal browser), yet the app said "your neighbors can see it now". The core promise was not true. | 5 | Node backend shares alerts between phones. The confirmation now says exactly who can see the alert. |
| 2 | Alert detail | No way to say an alert is false, and "Still true" could be tapped without limit, which inflated the count. | 4 | "I see this too" / "This is not true", one vote per phone. Alerts with more doubts than confirmations are marked "Doubtful". |
| 3 | Report | The street field was required free text with no guidance, so people could enter names, houses or phone numbers. There was no privacy explanation anywhere. | 4 | The landmark is optional, with a "place, not a person" hint. Phone numbers and emails are blocked. A privacy box appears at area selection. |
| 4 | All | The Dagbani was never checked by a fluent speaker. In Dagbani mode, times, "Share", the placeholder and area "Other" stayed in English. | 4 | All text is moved to one file (`i18n.js`). The review checklist is `research/dagbani-review.csv`. Audio slots are ready for recorded Dagbani. |
| 5 | Alert list | Helper text contrast was 2.5:1 and 2.9:1 (AA needs 4.5:1). Text was 12px. Severity leaned on colour. | 3 | High-contrast light theme (all pairs ≥ 4.65:1), 17px body text, and icon + word + bar for each level. |
| 6 | Alert list | Cards were clickable `<div>`s, so a keyboard or screen reader couldn't use them. Dialogs had no Escape key and no focus handling. | 3 | Cards are buttons. Sheets close with Escape and return focus. |
| 7 | All | Example alerts looked real, and alerts never expired. | 3 | "Practice alert" label. Alerts show as "Older" after 2 h and disappear after 6 h. |
| 8 | Home | "Change area" wiped the area and dropped you into onboarding with no way back. | 2 | Area screen has a Back link that keeps the current area. |
| 9 | Onboarding | Language could only be changed from a small "EN" pill after onboarding, which was in English. | 2 | Language is the first screen. |

**What I changed first and why:** #1. Without it the app cannot do what it says, and testing trust in alerts that nobody else receives would measure nothing.
