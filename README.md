# Flood Watch v2.1

Flood Watch is a neighbour-to-neighbour flood alert web app for Ghana. It works in **English, Twi and Dagbani**, and people can use it **by voice and pictures**, so it does not depend on reading.

Research question: *Can residents understand, trust and act on peer-to-peer flood alerts in their own language, and what privacy or trust worries do they have (location sharing, false alerts)?*

> This is a student research prototype, not an official warning system. In an emergency call **112**.

---

## What it does

| For residents | For the research |
|---|---|
| Pick a language by **hearing** it, not reading it | **Test sessions**: the paper tester sheet as a phone form (before / after rounds, IDs not names, consent required) |
| **Find my area**: the phone checks its GPS against the area list itself. Only the area name leaves the phone | **Timed task**: counts the seconds and taps a tester needs to find the alert for their area |
| Report a flood in 2 taps: a **water-level picture**, then **speak** where it is (typing is optional) | **Before vs after** table and CSV/JSON export |
| Every phrase has a 🔊 speaker. A "read every screen aloud" mode | **Language Studio**: native speakers mark each phrase Correct / Awkward / Wrong, type a better version and **record it in their own voice** |
| **I see it too** / **Not true**, one vote per phone. Doubtful and old alerts are clearly marked | **Practice alerts** so every tester has something to find |
| Rain forecast for your area (Open-Meteo) | |
| **Ask the helper**: flood-safety assistant (checked answers; Gemini AI optional) | |
| Works offline with the last saved alerts. **Call 112** on every key screen | |
| *New in 2.1 (from Round 1):* a spoken **"What Flood Watch knows about you"** screen, a **"talk to me?"** choice, a 3-step **How to use** card, a **photo of the water** (location data stripped on the phone), **"I am safe" / "I need help"** WhatsApp messages to family, **delete my data**, and **public suggestions** for Twi/Dagbani wording | **Import testers (JSON)**: Round 1 notes are in `docs/research/round1-before.json` |

## Architecture (deliberately simple)

```
 Phone browser (HTML + CSS + plain JavaScript, no framework)
   ├─ i18n.js      all words in EN / Twi / Dagbani
   ├─ voice.js     record · play · speak (human recording → phone voice → GhanaNLP voice)
   ├─ api.js       talks to the server, or falls back to "this phone only" mode
   ├─ research.js  tester sheet, timed task, Language Studio
   └─ shared/      areas.js + faq.js (also used by the server)
          │  JSON over HTTPS
          ▼
 Node.js + Express  (server/server.js)
   ├─ store.js   → data on your computer: data/db.json + data/voice, photos, phrases (deleted after 24 h where noted)
   │               data on Vercel: Upstash Redis (storage.js), same shape, nothing else changes
   ├─ ai.js      → Google Gemini (optional key) or checked answers
   ├─ khaya.js   → GhanaNLP Khaya: Twi/Dagbani translation, speech-to-text, text-to-speech (optional key)
   └─ weather.js → Open-Meteo forecast for the AREA CENTRE (no key)
```

There is no database server and only one dependency (Express). On your computer the data is one JSON file you can open and read. On Vercel the same data lives in a free Upstash Redis database, because Vercel cannot keep files.

### Privacy decisions
- No accounts. No names, phone numbers or coordinates are stored or sent.
- The location check runs **on the phone** (`matchArea` in `public/js/shared/areas.js`). The server receives only `locationChecked: true/false`.
  - *Trade-off:* a dishonest phone could lie about that flag. We accepted this because it means exact positions never leave anyone's phone. The badge is worded "Phone was in this area", not "verified".
- One vote per phone uses a random code saved on the phone, which the server **hashes** with a secret salt.
- Alerts are hidden after 12 hours. Alerts and voice notes are **deleted after 24 hours**.
- Rate limits are in memory only; IP addresses are never written to disk.
- The research data has tester IDs (T1, T2…) only, and nothing is saved without a consent tick.

### How trust is shown (no hidden score)
An alert shows how many neighbours confirmed it, how many said "Not true", how old it is, and whether the reporter's phone was in that area. It is marked **doubtful** when 3 or more people say "Not true" and they outnumber the confirmations. It is marked **old** after 3 hours.

---

## Run it on your computer

You need **Node.js 22.9 or newer** (https://nodejs.org).

```bash
cd flood-watch
npm install
npm start          # → http://localhost:3000
npm test           # 25 automated tests (14 for the API, 11 for the Vercel/Redis storage)
```

Optional keys go in a `.env` file. Copy `.env.example` to `.env` and fill in what you have:

| Key | What it switches on | Where to get it (free) |
|---|---|---|
| `GEMINI_API_KEY` | AI answers in the helper | https://aistudio.google.com/apikey |
| `KHAYA_API_KEY` | Machine voice and speech recognition for Twi and Dagbani, plus a "machine suggestion" button in the Language Studio | https://translation.ghananlp.org (GhanaNLP). Check their current free allowance when you sign up |
| `RESEARCH_PIN` | Protects the research pages | Choose any number |
| `TOKEN_SALT` | Keeps one-vote-per-phone working after restarts | Any long random text. On Vercel it is optional: one is made from the Redis token |

**The app works with no keys at all.** The helper then uses the checked answers, and Twi/Dagbani audio comes from the speakers' own recordings in the Language Studio.

## Put it online so testers can use their own phones

Phones only allow the **microphone and location on HTTPS**, so a plain `http://192.168…` link will not work for those features.

### Vercel (free, lasting, updates itself when you push to GitHub)

1. **Import the repo.** On vercel.com: **Add New → Project →** pick `floodwatch` → **Deploy**. Vercel finds the Express app in `app.js` by itself and serves `public/` from its CDN. No build settings needed.
2. **Add the database (required).** In the project: **Storage → Create / Connect → Upstash for Redis** (free plan), connect it to this project, then **Deployments → ⋯ → Redeploy**. Vercel adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you. Without this the app still opens, but everything is forgotten when the function restarts.
3. **Optional settings** (Project → Settings → Environment Variables): `RESEARCH_PIN`, `TOKEN_SALT`, `GEMINI_API_KEY`, `KHAYA_API_KEY`. Redeploy after changing them.
4. **Check it.** Open `https://YOUR-SITE.vercel.app/api/health`. You should see `"storage":"redis","persistent":true`. If it says `"persistent":false`, step 2 is missing or the variables are wrong (the page says which).

Things to know:
- Alerts, votes, test sessions, voice notes and photos are shared by everyone who opens the link. Voice notes and photos expire after 25 hours by themselves.
- If two people save at the very same instant on two different servers, one save can be lost. That is fine for a test with a few dozen people. For a real launch, use a proper database.
- The "too many requests" limit counts per server, so it is a polite brake, not a strong defence.
- Free plan: Upstash allows 500,000 commands a month. Each open app uses about two a minute, so a testing day is far below that.
- **Export your test sessions (CSV/JSON) after every testing day**, and again before you ever delete the database.

### Quick test from your laptop

```bash
npm start
npx cloudflared tunnel --url http://localhost:3000
```
It prints an `https://….trycloudflare.com` link. Send that to testers. It works while your laptop is on.

### Any host with a normal disk (for example Render.com)

New → Web Service → pick the repo. Build command `npm install`, start command `npm start`, add your keys under Environment. On the free plan the disk is wiped on every redeploy and the service sleeps when unused, so export your sessions often.

---

## Running Round 2 (the "after" test)

1. Open **Settings → For the research team → Test sessions**.
2. Tap **Add practice alerts** once (they are labelled "Practice alert").
3. For each tester: read the consent line, tap **Start timed task**, hand over the phone, and say: *"Find the alert for your area and tell me what you would do."*
4. The timer stops by itself when they open an alert in their area. Tap **Back to the form**, then fill in the rest with their own words.
5. Afterwards, tap **Remove them** to delete the practice alerts, then **Download CSV**.

Round 1: tap **Import testers (JSON)** and choose `docs/research/round1-before.json` (5 anonymised testers). Then fill in the missing details listed in `docs/research/round1-findings.md`. Round 1 has no task times.

## Checking the languages (Language Studio)

Settings → For the research team → **Language Studio**. Choose Dagbani or Twi, give each speaker a code (R1, R2…), and for each phrase:
1. Read the English meaning.
2. Tap **Record** and say it the way people really talk. Tap **Save voice**.
3. Mark the written version Correct / Awkward / Wrong and type a better one. Tap **Save check**.

Recordings are used by the app straight away. Typed corrections are downloaded as CSV and copied into `public/js/i18n.js`.

**Language status (be honest about this in the report):**
- Twi: an AI-assisted draft, not yet checked by native speakers.
- Dagbani: the v1 text has not been checked by a fluent speaker. New phrases have no Dagbani yet and show English until a speaker adds them.

## Files

```
app.js                 Vercel entry point (the same app, exported)
vercel.json            security headers for Vercel
server/server.js       API + serves the site
server/store.js        data: files on your computer, Redis on Vercel
server/storage.js      the small Upstash Redis client
server/{ai,khaya,weather,areas}.js
public/index.html      page + icons (water-level pictures)
public/css/app.css     design: big text, ≥56px buttons, light/dark
public/js/*.js         app, api, i18n, voice, research
public/sw.js           offline support
test/api.test.js       API tests
test/redis.test.js     the same app on a fake Redis (two "servers" sharing one database)
docs/research/         Round 1 data and findings, the heuristic UI audit, test sheets
docs/ui-screen-board.html   annotated screens, v1 and v2 side by side
v1/                    the original prototype, unchanged (the "before" version of Round 1)
```

The area coordinates in `public/js/shared/areas.js` are approximate. Check them with people who live there and correct them before any real use.

## How this was built

Version 1 was an early prototype by Ahlaam Abdallah, written with AI help. Version 2 was rebuilt by Ahlaam with AI assistance (Claude) for the code, the design review and the Twi draft. The research question, the testing, the testers' data and the decisions belong to the project lead. No test findings in this repository are invented: any results come only from the sessions saved in the app.
