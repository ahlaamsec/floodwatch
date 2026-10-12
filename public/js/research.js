// Research tools: the digital tester sheet, a timed task, before/after comparison,
// and the Language Studio where native speakers check and record every phrase.
import { h, icon, toast, prefs, savePrefs } from "./app.js";
import { api, features, getMode, LS } from "./api.js";
import { STRINGS, SOURCE, LANGS } from "./i18n.js";
import { ALL_AREAS } from "./shared/areas.js";
import { startRecording, playUrl, canRecord, loadPhraseIndex, hasRecording } from "./voice.js";

const SS = {
  get: (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => sessionStorage.setItem(k, JSON.stringify(v)),
  del: (k) => sessionStorage.removeItem(k),
};

// ===================================================================================
// Timed task: "Find the alert for your area and tell me what you would do."
// The tester starts the app fresh. We count seconds and taps until they open an alert
// in the area they chose. Nothing about the tester is recorded except these numbers.
// ===================================================================================
export const task = {
  active: () => Boolean(SS.get("fw.task")),
  start() {
    SS.set("fw.prefsBackup", { ...prefs });
    SS.set("fw.task", { start: Date.now(), taps: 0 });
    Object.assign(prefs, { lang: null, areaId: null, locationChecked: false, autoRead: false, introDone: false, howToDone: false });
    savePrefs();
    location.hash = "#/welcome";
    this.restoreBar();
    location.reload();
  },
  restoreBar() {
    document.querySelector(".taskbar")?.remove();
    if (!this.active()) return;
    const timeEl = h("span");
    const bar = h("div", { class: "taskbar", role: "note" }, h("span", {}, "● Test running "), timeEl,
      h("button", { type: "button", onclick: () => this.finish("no") }, "Stop"));
    document.body.append(bar);
    document.getElementById("app").style.paddingTop = "26px";
    const tick = () => { const s = SS.get("fw.task"); if (!s) return; const sec = Math.round((Date.now() - s.start) / 1000); timeEl.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
    tick(); clearInterval(this._iv); this._iv = setInterval(tick, 1000);
    if (!this._listening) {
      this._listening = true;
      document.addEventListener("pointerdown", (e) => {
        const s = SS.get("fw.task");
        if (s && !e.target.closest(".taskbar") && e.target.closest("button, a, input, label")) { s.taps++; SS.set("fw.task", s); }
      }, true);
    }
  },
  onOpenAlert(al, areaId) {
    if (this.active() && al.areaId === areaId) this.finish("yes");
  },
  finish(completed) {
    const s = SS.get("fw.task");
    if (!s) return;
    const area = ALL_AREAS.find((a) => a.id === prefs.areaId);
    SS.set("fw.taskResult", { completed, taskSeconds: Math.round((Date.now() - s.start) / 1000), taskTaps: s.taps, area: area?.name || "", language: prefs.lang || "" });
    SS.del("fw.task");
    clearInterval(this._iv);
    const backToForm = () => {
      Object.assign(prefs, SS.get("fw.prefsBackup") || {}); savePrefs(); SS.del("fw.prefsBackup");
      document.querySelector(".overlay")?.remove(); document.querySelector(".taskbar")?.remove();
      document.getElementById("app").style.paddingTop = "";
      location.hash = "#/research";
    };
    if (completed === "yes") {
      document.body.append(h("div", { class: "overlay" }, h("div", { class: "card" },
        h("div", { style: "font-size:3rem" }, "✓"),
        h("h2", {}, "Well done! Ask them: what would you do now?"),
        h("p", { class: "muted" }, "Listen to their answer first, then tap below."),
        h("button", { class: "btn primary mt", type: "button", onclick: backToForm }, "Back to the form"))));
    } else backToForm();
  },
};

// ===================================================================================
// Research screen
// ===================================================================================
const pinOk = () => !features.researchPin || sessionStorage.getItem("fw.pin");

export async function renderResearch(mount) {
  const back = h("header", { class: "top" }, h("a", { class: "iconbtn", href: "#/settings", "aria-label": "Back" }, icon("i-back")),
    h("div", { class: "title" }, h("h1", { tabindex: "-1" }, "Test sessions"), h("div", { class: "sub" }, getMode() === "server" ? "Saved on the server" : "Saved on THIS phone only")));

  if (!pinOk()) {
    const pin = h("input", { type: "text", inputmode: "numeric", "aria-label": "Researcher PIN" });
    return mount(back, h("form", { class: "card box", onsubmit: (e) => { e.preventDefault(); sessionStorage.setItem("fw.pin", pin.value.trim()); renderResearch(mount); } },
      h("label", { class: "f" }, "Researcher PIN"), pin, h("button", { class: "btn primary mt" }, "Open")));
  }

  let sessions = [];
  try { sessions = await api.sessions(); } catch (e) { if (e.status === 401) { sessionStorage.removeItem("fw.pin"); toast("Wrong PIN"); return renderResearch(mount); } toast(e.message); }
  const result = SS.get("fw.taskResult");

  // ---------- the form (digital copy of the paper Test Session Sheet) ----------
  const round = LS.get("fw.round", "after");
  const nextId = (r) => "T" + (sessions.filter((s) => s.round === r).length + 1);
  const f = {};
  const radios = (name, opts, val) => h("div", { class: "seg", role: "radiogroup" }, opts.map(([v, label]) => {
    const inp = h("input", { type: "radio", name, value: v });
    if (v === val) inp.checked = true;
    f[name] ||= [];
    f[name].push(inp);
    return h("label", {}, inp, label);
  }));
  const val = (name) => (f[name] || []).find((i) => i.checked)?.value ?? "";
  const txt = (name, label, value = "", area = true) => {
    const el = h(area ? "textarea" : "input", { type: "text", name });
    el.value = value;
    f[name] = el;
    return [h("label", { class: "f" }, label), el];
  };

  const form = h("form", { class: "card box rs" },
    h("h2", {}, "Tester sheet"),
    h("label", { class: "f" }, "Round"), radios("round", [["before", "Before (v1)"], ["after", "After (v2)"]], round),
    ...txt("testerId", "Tester ID (never a name)", nextId(round), false),
    ...txt("area", "Area (neighbourhood only)", result?.area || "", false),
    h("label", { class: "f" }, "Age range"), radios("ageRange", [["under-18", "Under 18 (guardian consent needed)"], ["18-29", "18–29"], ["30-44", "30–44"], ["45-59", "45–59"], ["60-74", "60–74"], ["75+", "75+"]]),
    h("label", { class: "f" }, "Language used"), radios("language", [["en", "English"], ["twi", "Twi"], ["dag", "Dagbani"], ["mixed", "Mixed"]], result?.language || ""),
    ...txt("date", "Date", new Date().toISOString().slice(0, 10), false),
    h("div", { class: "banner off mt" }, "Read aloud: \"This is a test of the app, not of you. You can stop any time. I will not write down your name.\""),
    h("label", { class: "tile" }, h("span", { class: "grow" }, "They agreed to take part"), (f.consent = h("input", { type: "checkbox", style: "width:28px;height:28px" }))),
    h("h2", { class: "mt" }, "Task: \"Find the alert for your area and tell me what you would do.\""),
    h("label", { class: "f" }, "Completed?"), radios("completed", [["yes", "Yes"], ["with_help", "With help"], ["no", "No"]], result?.completed || ""),
    ...txt("taskSeconds", "Time (seconds) — filled by the timed task", result?.taskSeconds ?? "", false),
    ...txt("taskTaps", "Taps — filled by the timed task", result?.taskTaps ?? "", false),
    ...txt("stuck", "Where did they get stuck?"),
    ...txt("q1Purpose", "1. What do you think this app is for? (their words)"),
    ...txt("q2Advice", "2. Did the safety advice make sense? Any confusing words?"),
    h("label", { class: "f" }, "3. Trust in an alert from a neighbour (1 = not at all, 5 = completely)"), radios("trust", [1, 2, 3, 4, 5].map((n) => [String(n), String(n)])),
    ...txt("trustWhy", "Why that trust score?"),
    ...txt("q4Sharing", "4. OK sharing your area? Anything you would not want shared?"),
    ...txt("q5Change", "5. What would you change?"),
    h("label", { class: "f" }, "How easy was it? (1 very hard – 5 very easy)"), radios("ease", [["1", "😣 1"], ["2", "🙁 2"], ["3", "😐 3"], ["4", "🙂 4"], ["5", "😄 5"]]),
    h("label", { class: "f" }, "How much would they recommend it to others? (1 = not at all, 5 = very much)"), radios("recommend", [1, 2, 3, 4, 5].map((n) => [String(n), String(n)])),
    ...txt("feeling", "How did they feel? (their words if possible)"),
    ...txt("notes", "Notes and quotes"),
    h("button", { class: "btn primary mt", type: "submit" }, "Save this tester"),
  );
  f.round.forEach((r) => r.addEventListener("change", () => { LS.set("fw.round", r.value); f.testerId.value = nextId(r.value); }));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const s = {
      round: val("round"), testerId: f.testerId.value.trim(), area: f.area.value.trim(), ageRange: val("ageRange"),
      language: val("language"), date: f.date.value.trim(), consent: f.consent.checked, completed: val("completed"),
      taskSeconds: f.taskSeconds.value.trim(), taskTaps: f.taskTaps.value.trim(), stuck: f.stuck.value, q1Purpose: f.q1Purpose.value,
      q2Advice: f.q2Advice.value, trust: val("trust"), trustWhy: f.trustWhy.value, q4Sharing: f.q4Sharing.value,
      q5Change: f.q5Change.value, ease: val("ease"), recommend: val("recommend"), feeling: f.feeling.value, notes: f.notes.value,
      appVersion: val("round") === "before" ? "1.0" : "", // empty: the server fills in the real app version (not a stale "2.0")
      source: result ? "timed-task" : "entered",
    };
    if (!s.consent) return toast("Tick consent first (or don't record this person).");
    try { await api.saveSession(s); SS.del("fw.taskResult"); toast("Saved ✓"); renderResearch(mount); }
    catch (err) { toast(err.message); }
  };

  // ---------- comparison ----------
  const stats = (r) => {
    const S = sessions.filter((s) => s.round === r);
    const pct = (k) => (S.length ? Math.round((100 * S.filter((s) => s.completed === k).length) / S.length) : 0);
    const nums = (k) => S.map((s) => Number(s[k])).filter((x) => x > 0);
    const avg = (k) => { const a = nums(k); return a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : "–"; };
    const med = (k) => { const a = nums(k).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : "–"; };
    return { n: S.length, yes: pct("yes"), help: pct("with_help"), no: pct("no"), trust: avg("trust"), ease: avg("ease"), recommend: avg("recommend"), time: med("taskSeconds"), taps: med("taskTaps") };
  };
  const B = stats("before"), A = stats("after");
  const row = (label, b, a) => h("tr", {}, h("td", {}, label), h("td", {}, String(b)), h("td", {}, String(a)));
  const compare = h("div", { class: "card box rs" }, h("h2", {}, "Before vs after"),
    h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, "Before (v1)"), h("th", {}, "After (v2)"))),
      h("tbody", {},
        row("Testers", B.n, A.n),
        row("Found alert alone", B.yes + "%", A.yes + "%"),
        row("Found with help", B.help + "%", A.help + "%"),
        row("Did not find", B.no + "%", A.no + "%"),
        row("Median time (s)", B.time, A.time),
        row("Median taps", B.taps, A.taps),
        row("Avg trust (1–5)", B.trust, A.trust),
        row("Avg ease (1–5)", B.ease, A.ease),
        row("Avg would recommend (1–5)", B.recommend, A.recommend))),
    h("p", { class: "muted" }, "Small groups: report these as descriptive numbers, not proof. Quotes matter more than percentages here."));

  // ---------- list + export ----------
  const cols = ["round", "appVersion", "testerId", "area", "ageRange", "language", "date", "completed", "taskSeconds", "taskTaps", "stuck", "q1Purpose", "q2Advice", "trust", "trustWhy", "q4Sharing", "q5Change", "ease", "recommend", "feeling", "notes", "source"];
  const download = (name, text, type) => { const a = h("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove(); };
  const csv = () => [cols.join(","), ...sessions.map((s) => cols.map((c) => `"${String(s[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const list = h("div", { class: "card box rs" }, h("h2", {}, `Saved testers (${sessions.length})`),
    h("table", {}, h("tbody", {}, sessions.map((s) => h("tr", {},
      h("td", {}, `${s.round === "before" ? "B" : "A"} · ${s.testerId}`), h("td", {}, `${s.area} · ${s.completed || "?"} · ${s.taskSeconds ?? "–"}s`),
      h("td", {}, h("button", { class: "chipbtn", type: "button", onclick: async () => { if (confirmDelete(s)) { await api.deleteSession(s.id); renderResearch(mount); } } }, "Delete")))))),
    h("div", { class: "row mt" },
      h("button", { class: "btn ghost", type: "button", onclick: () => download("flood-watch-sessions.csv", csv(), "text/csv") }, "Download CSV"),
      h("button", { class: "btn ghost", type: "button", onclick: () => download("flood-watch-sessions.json", JSON.stringify(sessions, null, 2), "application/json") }, "Download JSON")),
    (() => {
      // Import testers from a JSON file (e.g. round1-before.json prepared from paper notes).
      const inp = h("input", { type: "file", accept: "application/json,.json", class: "sr", id: "import-json" });
      inp.onchange = async () => {
        try {
          const rows = JSON.parse(await inp.files[0].text());
          let n = 0;
          for (const r of Array.isArray(rows) ? rows : rows.sessions || []) { await api.saveSession(r); n++; }
          toast(`Imported ${n} ✓`); renderResearch(mount);
        } catch (e) { toast("Import failed: " + e.message); }
      };
      return h("div", { class: "mt" }, inp, h("label", { class: "btn ghost", for: "import-json" }, "Import testers (JSON)"));
    })());

  mount(
    back,
    h("div", { class: "card box" }, h("h2", {}, "Run a timed test"),
      h("p", {}, "1. Add practice alerts (so every area has one). 2. Tap Start and hand over the phone. 3. Say: \"Find the alert for your area and tell me what you would do.\" The timer stops by itself when they open an alert for their area."),
      h("div", { class: "row mt" },
        h("button", { class: "btn ghost", type: "button", onclick: async () => { try { await api.addPracticeAlerts(); toast("Practice alerts added ✓"); } catch (e) { toast(e.message); } } }, "Add practice alerts"),
        h("button", { class: "btn ghost", type: "button", onclick: async () => { try { await api.clearPracticeAlerts(); toast("Practice alerts removed"); } catch (e) { toast(e.message); } } }, "Remove them")),
      h("button", { class: "btn primary mt", type: "button", onclick: () => task.start() }, icon("i-play"), "Start timed task")),
    result ? h("div", { class: "banner rain" }, `Task result: ${result.completed}, ${result.taskSeconds}s, ${result.taskTaps} taps — fill in the rest below.`) : null,
    form, compare, list,
  );
}

function confirmDelete(s) {
  // Avoid browser dialogs: a second tap within 3 seconds confirms.
  const k = "del-" + s.id;
  if (confirmDelete[k] && Date.now() - confirmDelete[k] < 3000) return true;
  confirmDelete[k] = Date.now();
  toast("Tap Delete again to confirm");
  return false;
}

// ===================================================================================
// Language Studio — native speakers check every phrase and record it in their own voice.
// ===================================================================================
export async function renderStudio(mount) {
  // Anyone can suggest better wording. Only the research team (PIN) can save recordings.
  const team = pinOk();
  await loadPhraseIndex();
  let reviews = [];
  try { reviews = await api.reviews(); } catch { /* fine */ }
  const lang = LS.get("fw.studioLang", "dag");
  const reviewer = LS.get("fw.reviewer", "R1");
  const filter = LS.get("fw.studioFilter", "todo");
  const keys = Object.keys(STRINGS.en).filter((k) => k !== "appTitle");
  const isTemplate = (k) => /\{\w+\}/.test(STRINGS.en[k]);
  const reviewedKeys = new Set(reviews.filter((r) => r.lang === lang).map((r) => r.key));
  const recorded = keys.filter((k) => hasRecording(lang, k)).length;
  const shown = keys.filter((k) => filter === "all" || (filter === "todo" && (!reviewedKeys.has(k) || (!hasRecording(lang, k) && !isTemplate(k)))) || (filter === "missing" && !STRINGS[lang][k]));

  const revInput = h("input", { type: "text", value: reviewer, style: "max-width:120px", "aria-label": "Your reviewer code" });
  revInput.onchange = () => LS.set("fw.reviewer", revInput.value.trim() || "R1");

  const phraseCard = (k) => {
    const cur = STRINGS[lang][k];
    const better = h("textarea", { placeholder: `Better ${LANGS.find((l) => l.code === lang).name} (type it the way people really say it)` });
    let verdict = "";
    const vbtn = (v, label) => h("button", { class: "chipbtn", type: "button", "aria-pressed": "false", onclick: (e) => {
      verdict = v; e.currentTarget.parentNode.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false")); e.currentTarget.setAttribute("aria-pressed", "true");
    } }, label);
    const recBox = h("div", { class: "row", style: "align-items:center" });
    let rec = null, blob = null;
    const recBtn = h("button", { class: "btn ghost", type: "button" }, icon("i-mic"), "Record");
    recBtn.onclick = async () => {
      if (rec) { blob = await rec.stop(); rec = null; recBtn.lastChild.textContent = "Record again"; drawRec(); return; }
      try { rec = await startRecording(20000); recBtn.lastChild.textContent = "Stop"; rec.done.then(() => rec && recBtn.click()); } catch { toast("Microphone not allowed"); }
    };
    const drawRec = () => recBox.replaceChildren(...[
      !team ? null : canRecord() && !isTemplate(k) ? recBtn : h("span", { class: "muted" }, isTemplate(k) ? "Has a changing number/name — text only" : "No microphone"),
      hasRecording(lang, k) ? h("button", { class: "btn ghost", type: "button", onclick: () => playUrl(api.phraseAudioUrl(lang, k)) }, icon("i-play"), "Saved") : null,
      blob ? h("button", { class: "btn ok", type: "button", onclick: async () => {
        try { await api.savePhraseAudio(lang, k, blob, revInput.value.trim()); blob = null; await loadPhraseIndex(); toast("Recording saved ✓"); drawRec(); } catch (e) { toast(e.message); }
      } }, "Save voice") : null].filter(Boolean));
    drawRec();
    const draftBtn = features.khaya && getMode() === "server" ? h("button", { class: "chipbtn", type: "button", onclick: async () => {
      try { better.value = await api.machineDraft(STRINGS.en[k], lang); toast("Machine suggestion — please correct it"); } catch (e) { toast(e.message); }
    } }, "Machine suggestion") : null;
    const count = reviews.filter((r) => r.lang === lang && r.key === k).length;
    return h("div", { class: "card phrase" },
      h("div", { class: "en" }, `English: “${STRINGS.en[k]}”`, count ? `  · ${count} review(s)` : ""),
      h("div", { class: "cur" + (cur ? "" : " missing") }, cur || "Missing — please say and type it"),
      recBox,
      h("div", { class: "chips mt" }, vbtn("correct", "✓ Correct"), vbtn("awkward", "~ Awkward"), vbtn("wrong", "✗ Wrong / missing")),
      h("div", { class: "mt" }, better), draftBtn,
      h("button", { class: "btn primary mt", type: "button", onclick: async () => {
        if (!verdict) return toast("Choose Correct, Awkward or Wrong");
        try { await api.saveReview({ lang, key: k, verdict, better: better.value, reviewer: revInput.value.trim() }); toast("Saved ✓"); reviews = await api.reviews(); }
        catch (e) { toast(e.message); }
      } }, "Save check"));
  };

  const download = () => {
    const rows = [["lang", "key", "english", "current", "verdict", "better", "reviewer", "time"],
      ...reviews.map((r) => [r.lang, r.key, STRINGS.en[r.key], STRINGS[r.lang]?.[r.key] || "", r.verdict, r.better, r.reviewer, new Date(r.at).toISOString()])];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = h("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "language-reviews.csv" });
    document.body.append(a); a.click(); a.remove();
  };

  mount(
    h("header", { class: "top" }, h("a", { class: "iconbtn", href: "#/settings", "aria-label": "Back" }, icon("i-back")),
      h("div", { class: "title" }, h("h1", { tabindex: "-1" }, team ? "Language Studio" : "Help improve the words"), h("div", { class: "sub" }, SOURCE[lang]))),
    h("div", { class: "card box" },
      h("p", {}, "Ask a fluent speaker to: read the English, say it the way people in their area really talk, tap Record, then mark the written version Correct / Awkward / Wrong and type a better one."),
      h("div", { class: "chips" }, ["dag", "twi", "en"].map((l) => h("button", { class: "chipbtn", type: "button", "aria-pressed": String(l === lang), onclick: () => { LS.set("fw.studioLang", l); renderStudio(mount); } }, LANGS.find((x) => x.code === l).name))),
      h("div", { class: "chips mt" }, [["todo", "Still to do"], ["missing", "Missing text"], ["all", "All"]].map(([v, label]) => h("button", { class: "chipbtn", type: "button", "aria-pressed": String(v === filter), onclick: () => { LS.set("fw.studioFilter", v); renderStudio(mount); } }, label))),
      h("label", { class: "f" }, "Reviewer code (R1, R2… never a name)"), revInput,
      h("p", { class: "mt" }, `Recorded: ${recorded} / ${keys.filter((k) => !isTemplate(k)).length}`), h("div", { class: "bar" }, h("i", { style: `width:${Math.round((100 * recorded) / keys.filter((k) => !isTemplate(k)).length)}%` })),
      h("p", { class: "mt" }, `Checked: ${reviewedKeys.size} / ${keys.length}`), h("div", { class: "bar" }, h("i", { style: `width:${Math.round((100 * reviewedKeys.size) / keys.length)}%` })),
      h("button", { class: "btn ghost mt", type: "button", onclick: download }, "Download all checks (CSV)")),
    h("div", { class: "list mt" }, shown.length ? shown.map(phraseCard) : h("div", { class: "card empty" }, "All done for this filter 🎉")),
  );
}
