/* =========================================================================
 * Gym Buddy — personal fitness & food tracker (static PWA, no backend)
 * All data lives in localStorage on this device.
 * ========================================================================= */

const STORE_KEY = "gymBuddyData.v1";

const DEFAULT_STATE = {
  profile: {
    name: "Me",
    age: 42,
    heightCm: 169,
    sex: "male",
    activity: 1.45,   // light–moderate (some lifting + running)
    goal: "recomp",   // cut | recomp | maintain | gain
    proteinPerKg: 2.0, // upper end of evidence-based range (1.6–2.2) — justified in a deficit
    startWeight: 72.5,
  },
  programStart: todayKey(), // when the current 5-week training block began
  weights: [],         // { date:'YYYY-MM-DD', kg:Number }
  weights_init: false,
  workoutWeights: {},  // exerciseId -> current kg
  workoutLog: {},      // 'YYYY-MM-DD' -> { sessionId, sets: { exId: [bool/number per set] }, done:bool }
  food: {},            // 'YYYY-MM-DD' -> [ { name, kcal, protein } ]
  reminders: {
    enabled: false,
    items: {
      weighIn:  { on: true,  time: "07:00", label: "Morning weigh-in" },
      workout:  { on: true,  time: "18:00", label: "Workout time" },
      breakfast:{ on: false, time: "08:00", label: "Log breakfast" },
      lunch:    { on: true,  time: "13:00", label: "Log lunch" },
      dinner:   { on: true,  time: "19:30", label: "Log dinner" },
      protein:  { on: true,  time: "16:00", label: "Protein check-in" },
    },
  },
  foodPresets: [
    { name: "Eggs (2) + toast", kcal: 320, protein: 20 },
    { name: "Chicken breast 150g", kcal: 250, protein: 46 },
    { name: "Greek yogurt 200g", kcal: 130, protein: 18 },
    { name: "Protein shake", kcal: 170, protein: 30 },
    { name: "Oats 60g + milk", kcal: 320, protein: 14 },
    { name: "Banana", kcal: 100, protein: 1 },
  ],
};

/* ---------- storage ---------- */
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return deepMerge(structuredClone(DEFAULT_STATE), parsed);
  } catch (e) {
    console.warn("load failed", e);
    return structuredClone(DEFAULT_STATE);
  }
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function deepMerge(base, over) {
  for (const k in over) {
    if (over[k] && typeof over[k] === "object" && !Array.isArray(over[k])) {
      base[k] = deepMerge(base[k] || {}, over[k]);
    } else if (over[k] !== undefined) {
      base[k] = over[k];
    }
  }
  return base;
}

/* ---------- date helpers ---------- */
function todayKey(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
function prettyDate(d = new Date()) {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/* ---------- nutrition math ---------- */
function latestWeight() {
  if (state.weights.length) return state.weights[state.weights.length - 1].kg;
  return state.profile.startWeight;
}
function calcTargets() {
  const p = state.profile;
  const w = latestWeight();
  // Mifflin-St Jeor
  const s = p.sex === "male" ? 5 : -161;
  const bmr = 10 * w + 6.25 * p.heightCm - 5 * p.age + s;
  const tdee = bmr * p.activity;
  const adj = { cut: -0.18, recomp: -0.08, maintain: 0, gain: 0.1 }[p.goal] ?? 0;
  const kcal = Math.round((tdee * (1 + adj)) / 10) * 10;
  const protein = Math.round(w * p.proteinPerKg);
  const fat = Math.round((kcal * 0.27) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, fat, carbs, weight: w };
}

/* ---------- block periodization (weekly set ramp + RIR + deload) ---------- */
function blockWeekIndex(date = new Date()) {
  const start = new Date((state.programStart || todayKey()) + "T00:00");
  const days = Math.floor((date - start) / 86400000);
  const len = PROGRAM.block.lengthWeeks;
  const wk = Math.floor(days / 7);
  return ((wk % len) + len) % len;
}
function currentWeek(date = new Date()) {
  return PROGRAM.block.weeks[blockWeekIndex(date)];
}
// target number of sets for an exercise this week (ramps up, then deloads), clamped
function currentSets(ex, date = new Date()) {
  const w = currentWeek(date);
  return Math.max(2, Math.min(ex.sets + 2, ex.sets + w.setBonus));
}

/* ---------- workout helpers ---------- */
function weightFor(exId) {
  if (state.workoutWeights[exId] != null) return state.workoutWeights[exId];
  return PROGRAM.defaultWeights[exId] ?? 0;
}
function getLog(key) {
  return state.workoutLog[key];
}
function ensureLog(key, sessionId) {
  if (!state.workoutLog[key]) {
    state.workoutLog[key] = { sessionId, sets: {}, done: false };
  }
  return state.workoutLog[key];
}
// streak = consecutive past+today days that had a scheduled session and were completed,
// skipping rest/run days (they don't break the strength streak)
function strengthStreak() {
  let count = 0;
  for (let i = 0; i < 120; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const sid = resolveSession(d);
    if (sid === "rest" || sid === "run") continue;
    const log = getLog(todayKey(d));
    if (log && log.done) count++;
    else if (i === 0) continue; // today not done yet shouldn't break streak
    else break;
  }
  return count;
}
// progressive overload: did every set hit the top of the rep range last time?
// Looks at the most recent PRIOR session (never today's in-progress log).
function lastPerformance(exId) {
  const today = todayKey();
  const keys = Object.keys(state.workoutLog).filter((k) => k !== today).sort().reverse();
  for (const k of keys) {
    const log = state.workoutLog[k];
    if (log.sets && log.sets[exId]) return { date: k, sets: log.sets[exId] };
  }
  return null;
}
function shouldProgress(ex) {
  const perf = lastPerformance(ex.id);
  if (!perf) return false;
  const arr = perf.sets;
  const sets = currentSets(ex);
  if (arr.length < sets) return false;
  return arr.slice(0, sets).every((reps) => Number(reps) >= ex.repHigh);
}

/* ---------- UI plumbing ---------- */
const view = document.getElementById("view");
let route = location.hash.replace("#", "") || "today";

function navigate(r) {
  route = r;
  location.hash = r;
  render();
}
window.addEventListener("hashchange", () => {
  const r = location.hash.replace("#", "") || "today";
  if (r !== route) { route = r; render(); }
});

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.hidden = true), 2000);
}

function setActiveTab() {
  document.querySelectorAll(".tab").forEach((b) => {
    const r = b.dataset.route;
    const on = r === route
      || (r === "workouts" && route === "history")
      || (r === "settings" && (route === "reminders" || route === "profile"));
    b.classList.toggle("active", on);
  });
}
document.getElementById("tabbar").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (btn) navigate(btn.dataset.route);
});

function updateStreakPill() {
  document.getElementById("streak-pill").textContent = "🔥 " + strengthStreak();
}

/* =========================================================================
 * RENDER
 * ========================================================================= */
function render() {
  switch (route) {
    case "workouts": view.innerHTML = viewWorkouts(); break;
    case "history":  view.innerHTML = viewHistory(); break;
    case "weight":   view.innerHTML = viewWeight(); bindWeight(); break;
    case "food":     view.innerHTML = viewFood(); bindFood(); break;
    case "settings": view.innerHTML = viewSettings(); bindSettings(); break;
    case "reminders":view.innerHTML = viewReminders(); bindReminders(); break;
    case "profile":  view.innerHTML = viewProfile(); bindProfile(); break;
    default:         route = "today"; view.innerHTML = viewToday(); bindToday();
  }
  setActiveTab();
  updateStreakPill();
  window.scrollTo(0, 0);
}

/* ---------------------- TODAY ---------------------- */
function viewToday() {
  const now = new Date();
  const sid = resolveSession(now);
  const session = PROGRAM.sessions[sid];
  const t = calcTargets();
  const key = todayKey();
  const foodToday = state.food[key] || [];
  const kcalEaten = foodToday.reduce((s, f) => s + (+f.kcal || 0), 0);
  const protEaten = foodToday.reduce((s, f) => s + (+f.protein || 0), 0);
  const lastW = state.weights[state.weights.length - 1];

  let html = `
    <h1>${prettyDate(now)}</h1>
    <p class="subtle">Today's plan, nutrition targets and quick logging.</p>
  `;

  // Workout card
  html += `<div class="card">
    <div class="card-head"><h2>🏋️ ${session.name}</h2><span class="pill">${session.focus || ""}</span></div>`;

  if (session.rest) {
    html += `<p class="subtle" style="margin:0">${session.note}</p>`;
  } else if (session.cardio) {
    html += `<p class="subtle" style="margin:0 0 10px">${session.note}</p>
      <ul class="list">${session.options.map((o) => `<li><span>${o}</span></li>`).join("")}</ul>`;
  } else {
    const log = getLog(key);
    const doneCount = log ? Object.values(log.sets).filter((a) => a && a.length).length : 0;
    const wk = currentWeek();
    html += `<p class="subtle" style="margin:0 0 12px">${session.exercises.length} exercises · ${doneCount} started · <b>week ${blockWeekIndex() + 1}/${PROGRAM.block.lengthWeeks} (${wk.label}, ${wk.rir} RIR)</b></p>
      <button class="btn" onclick="navigate('workouts')">${log && log.done ? "Review session ✓" : "Start workout"}</button>`;
  }
  html += `</div>`;

  // Nutrition card
  const kcalPct = Math.min(100, Math.round((kcalEaten / t.kcal) * 100));
  const protPct = Math.min(100, Math.round((protEaten / t.protein) * 100));
  html += `<div class="card">
    <div class="card-head"><h2>🍽️ Nutrition</h2><span class="pill">${state.profile.goal}</span></div>
    <div class="meter-row"><span>Calories</span><span class="v">${kcalEaten} / ${t.kcal} kcal</span></div>
    <div class="bar ${kcalEaten > t.kcal ? "over" : ""}"><span style="width:${kcalPct}%"></span></div>
    <div class="meter-row" style="margin-top:12px"><span>Protein</span><span class="v">${protEaten} / ${t.protein} g</span></div>
    <div class="bar protein"><span style="width:${protPct}%"></span></div>
    <button class="btn secondary" style="margin-top:14px" onclick="navigate('food')">Log food</button>
  </div>`;

  // Weight card
  const loggedToday = (state.weights.find((e) => e.date === key) || {}).kg;
  html += `<div class="card">
    <div class="card-head"><h2>⚖️ Weight</h2>${loggedToday != null ? `<span class="pill">logged today ✓</span>` : ""}</div>
    <div class="stat-grid">
      <div class="stat"><div class="label">Current</div><div class="value">${latestWeight()}<small> kg</small></div>
        <div class="sub">${lastW ? "logged " + relativeDays(lastW.date) : "from profile"}</div></div>
      <div class="stat"><div class="label">Since start</div><div class="value">${signed(latestWeight() - state.profile.startWeight)}<small> kg</small></div>
        <div class="sub">start ${state.profile.startWeight} kg</div></div>
    </div>
    <div class="search-row" style="margin-top:14px">
      <input id="today-w-input" type="number" inputmode="decimal" step="0.1" placeholder="${loggedToday != null ? loggedToday : "today's kg"}" />
      <button class="btn small" id="today-w-save">Save</button>
    </div>
    <button class="btn secondary" style="margin-top:10px" onclick="navigate('weight')">Trend & history</button>
  </div>`;

  // Reminder nudge
  if (!state.reminders.enabled) {
    html += `<div class="banner info">🔔 <div>Turn on reminders to get nudged for weigh-ins, workouts and meals. <a href="#reminders" onclick="navigate('reminders');return false;">Set up reminders</a></div></div>`;
  }

  return html;
}
function bindToday() {
  const btn = document.getElementById("today-w-save");
  if (btn) btn.onclick = () => saveWeight(document.getElementById("today-w-input").value);
}

// shared weight logger (used by Today and Weight tabs)
function saveWeight(raw) {
  const val = parseFloat(raw);
  if (isNaN(val) || val < 30 || val > 250) { toast("Enter a valid weight"); return false; }
  const key = todayKey();
  const idx = state.weights.findIndex((e) => e.date === key);
  if (idx >= 0) state.weights[idx].kg = val;
  else state.weights.push({ date: key, kg: val });
  save();
  toast("Weight saved: " + val + " kg");
  render();
  return true;
}

function relativeDays(dateStr) {
  const diff = Math.round((Date.now() - new Date(dateStr + "T00:00").getTime()) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  return diff + " days ago";
}
function signed(n) { const v = Math.round(n * 10) / 10; return (v > 0 ? "+" : "") + v; }

/* ---------------------- WORKOUTS ---------------------- */
function viewWorkouts() {
  const now = new Date();
  const sid = resolveSession(now);
  const session = PROGRAM.sessions[sid];
  const key = todayKey();

  let html = `<div class="card-head"><h1>${session.name}</h1><button class="btn small secondary" onclick="navigate('history')">History</button></div>
    <p class="subtle">${prettyDate(now)} · ${session.focus || ""}</p>`;

  if (session.rest) {
    html += `<div class="card"><p style="margin:0">${session.note}</p></div>`;
    html += weekOverview(now);
    return html;
  }
  if (session.cardio) {
    html += `<div class="card"><p class="subtle" style="margin:0 0 10px">${session.note}</p>
      <ul class="list">${session.options.map((o) => `<li><span>${o}</span></li>`).join("")}</ul></div>`;
    html += `<button class="btn ${getLog(key)?.done ? "secondary" : "success"}" onclick="markCardioDone()">${getLog(key)?.done ? "Logged ✓" : "Mark run done"}</button>`;
    html += weekOverview(now);
    return html;
  }

  const log = ensureLog(key, sid);
  const wk = currentWeek();
  const wkNum = blockWeekIndex() + 1;

  html += `<div class="banner ${wk.deload ? "warn" : "up"}">${wk.deload ? "🌙" : "📈"}
    <div><b>Block week ${wkNum}/${PROGRAM.block.lengthWeeks} · ${wk.label}</b> — target <b>${wk.rir} reps in reserve</b>.<br>${wk.note}</div></div>`;

  html += `<div class="banner info">💡 <div>Use <b>+</b> / <b>−</b> to log the reps you did on each set (tap the number to mark a set done at the low end). Stop each set at the week's target reps-in-reserve. Hit the top of the rep range on <b>all</b> sets and I'll suggest adding weight next time.</div></div>`;

  session.exercises.forEach((ex) => {
    const w = weightFor(ex.id);
    const unit = ex.unit === "sec" ? "" : "kg";
    const setArr = log.sets[ex.id] || [];
    const progress = shouldProgress(ex);
    const sets = currentSets(ex);
    const repTarget = ex.unit === "sec" ? `${ex.repLow}–${ex.repHigh}s` :
                      ex.unit === "reps" ? `${ex.repLow}–${ex.repHigh} reps` :
                      `${ex.repLow}–${ex.repHigh} reps`;

    html += `<div class="exercise" id="ex-${ex.id}">
      <div class="exercise-top">
        <div>
          <div class="exercise-name">${ex.name}${ex.stretch ? ` <span class="tag stretch" title="Train the full stretched range — it grows more muscle">stretch</span>` : ""}</div>
          <div class="exercise-meta">${sets} × ${repTarget} · ${wk.rir} RIR</div>
        </div>`;

    if (ex.unit === "sec" || ex.unit === "reps") {
      html += `<div class="weight-edit"><span class="exercise-meta">bodyweight</span></div>`;
    } else {
      html += `<div class="weight-edit">
        <button class="iconbtn" onclick="bumpWeight('${ex.id}', ${-(ex.inc || 1)})">−</button>
        <input type="number" inputmode="decimal" step="0.5" value="${w}" onchange="setWeight('${ex.id}', this.value)" />
        <span class="exercise-meta">${unit}</span>
        <button class="iconbtn" onclick="bumpWeight('${ex.id}', ${ex.inc || 1})">+</button>
      </div>`;
    }
    html += `</div>`;

    // set steppers
    const step = ex.unit === "sec" || ex.unit === "reps" ? 5 : 1;
    const labelUnit = ex.unit === "sec" ? "s" : "";
    html += `<div class="set-pills">`;
    for (let i = 0; i < sets; i++) {
      const val = setArr[i];
      const hit = val != null && val !== "";
      html += `<div class="set-stepper ${hit ? "logged" : ""}">
        <button class="step-btn" onclick="adjustSet('${ex.id}',${i},-1,${ex.repLow},${ex.repHigh},${step})" aria-label="less">−</button>
        <button class="step-val" onclick="toggleSet('${ex.id}',${i},${ex.repLow})">
          <span class="step-num">${hit ? val + labelUnit : "–"}</span>
          <span class="step-lbl">Set ${i + 1}</span>
        </button>
        <button class="step-btn" onclick="adjustSet('${ex.id}',${i},1,${ex.repLow},${ex.repHigh},${step})" aria-label="more">+</button>
      </div>`;
    }
    html += `</div>`;

    if (progress) {
      html += `<div class="exercise-hint" style="color:var(--accent-2)">⬆ You maxed the reps last time — try ${ex.unit ? "more time/reps" : (w + (ex.inc || 1)) + " kg"} today.</div>`;
    }
    html += `<div class="exercise-hint">${ex.note}</div>`;
    html += `</div>`;
  });

  html += `<button class="btn ${log.done ? "secondary" : "success"}" id="finish-btn" onclick="finishWorkout()">${log.done ? "Workout complete ✓ (tap to re-open)" : "Finish workout"}</button>`;
  html += weekOverview(now);
  return html;
}

function weekOverview(now) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = `<div class="section-title">This week</div>
    <p class="subtle" style="margin:-4px 2px 10px">Tap a day to see what it involves.</p>`;
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const sid = resolveSession(d);
    const s = PROGRAM.sessions[sid];
    const log = getLog(todayKey(d));
    const isToday = todayKey(d) === todayKey(now);
    const status = log && log.done ? "✅" : (sid === "rest" ? "😴" : sid === "run" ? "🏃" : "🏋️");

    let detail = "";
    if (s.exercises) {
      detail = `<ul class="list">` + s.exercises.map((ex) => {
        const unit = ex.unit === "sec" ? "s" : "";
        return `<li><span>${ex.name}${ex.stretch ? ` <span class="tag stretch">stretch</span>` : ""}</span><span class="meta">${currentSets(ex, d)} × ${ex.repLow}–${ex.repHigh}${unit}</span></li>`;
      }).join("") + `</ul>`;
    } else if (s.cardio) {
      detail = `<p class="subtle" style="margin:0 0 8px">${s.note}</p><ul class="list">` +
        s.options.map((o) => `<li><span>${o}</span></li>`).join("") + `</ul>`;
    } else {
      detail = `<p class="subtle" style="margin:0">${s.note}</p>`;
    }

    html += `<details class="day ${isToday ? "today" : ""}" ${isToday ? "open" : ""}>
      <summary>
        <span>${status} <b>${days[d.getDay()]}</b> <span class="meta">${d.getDate()}</span></span>
        <span class="meta">${s.name}${s.focus ? " · " + s.focus : ""}${isToday ? " · today" : ""}</span>
      </summary>
      <div class="day-body">${detail}</div>
    </details>`;
  }
  return html;
}

/* ---------------------- HISTORY ---------------------- */
// look up an exercise definition across all sessions
function exDef(exId) {
  for (const sid in PROGRAM.sessions) {
    const s = PROGRAM.sessions[sid];
    if (s.exercises) {
      const found = s.exercises.find((e) => e.id === exId);
      if (found) return found;
    }
  }
  return null;
}

function viewHistory() {
  const logs = Object.entries(state.workoutLog)
    .filter(([, l]) => l.done || (l.sets && Object.keys(l.sets).length))
    .sort((a, b) => b[0].localeCompare(a[0]));

  // stats
  const totalDone = Object.values(state.workoutLog).filter((l) => l.done).length;
  const now = new Date();
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const mondayKey = todayKey(monday);
  const thisWeek = logs.filter(([d, l]) => l.done && d >= mondayKey).length;

  let html = `<div class="card-head"><h1>History</h1><button class="btn small secondary" onclick="navigate('workouts')">Back</button></div>
    <p class="subtle">Everything you've logged, newest first.</p>
    <div class="stat-grid">
      <div class="stat"><div class="label">Workouts done</div><div class="value">${totalDone}</div></div>
      <div class="stat"><div class="label">This week</div><div class="value">${thisWeek}</div></div>
      <div class="stat"><div class="label">Strength streak</div><div class="value">${strengthStreak()}<small> 🔥</small></div></div>
      <div class="stat"><div class="label">Days logged</div><div class="value">${logs.length}</div></div>
    </div>`;

  if (!logs.length) {
    html += `<div class="empty" style="margin-top:18px">No workouts logged yet. Once you log sets on the Workouts tab, they'll show up here.</div>`;
    return html;
  }

  html += `<div class="section-title">Sessions</div>`;
  logs.forEach(([date, log]) => {
    const session = PROGRAM.sessions[log.sessionId] || {};
    const d = new Date(date + "T00:00");
    const dayName = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const isCardio = session.cardio;
    const isToday = date === todayKey();

    // build exercise rows + tonnage estimate (uses current weights)
    let rows = "", tonnage = 0, totalSets = 0;
    if (log.sets) {
      for (const exId in log.sets) {
        const arr = (log.sets[exId] || []).filter((v) => v != null && v !== "");
        if (!arr.length) continue;
        totalSets += arr.length;
        const def = exDef(exId);
        const name = def ? def.name : exId;
        const unitLbl = def && def.unit === "sec" ? "s" : "";
        const wt = state.workoutWeights[exId] ?? (PROGRAM.defaultWeights[exId] || 0);
        if (wt && !(def && def.unit)) tonnage += wt * arr.reduce((s, r) => s + (+r || 0), 0);
        const repsStr = arr.map((r) => r + unitLbl).join(", ");
        rows += `<li><span>${name}</span><span class="meta">${repsStr}${wt && !(def && def.unit) ? ` @ ${wt}kg` : ""}</span></li>`;
      }
    }
    const summary = isCardio
      ? "Run / cardio"
      : `${totalSets} sets${tonnage ? ` · ≈${Math.round(tonnage).toLocaleString()} kg volume` : ""}`;

    html += `<details class="day" ${isToday ? "open" : ""}>
      <summary>
        <span>${log.done ? "✅" : "•"} <b>${dayName}</b></span>
        <span class="meta">${session.name || "Workout"} · ${summary}</span>
      </summary>
      <div class="day-body">${rows ? `<ul class="list">${rows}</ul>` : `<p class="subtle" style="margin:0">${isCardio ? "Cardio session completed." : "Marked done (no sets recorded)."}</p>`}</div>
    </details>`;
  });

  html += `<p class="subtle" style="text-align:center;margin-top:8px">Volume estimates use your current weights.</p>`;
  return html;
}

/* workout actions (global for inline handlers) */
window.bumpWeight = (id, delta) => {
  const cur = weightFor(id);
  const next = Math.max(0, Math.round((cur + delta) * 2) / 2);
  state.workoutWeights[id] = next;
  save();
  render();
};
window.setWeight = (id, val) => {
  const n = parseFloat(val);
  if (!isNaN(n)) { state.workoutWeights[id] = Math.max(0, n); save(); }
};
window.adjustSet = (exId, idx, delta, lo, hi, step) => {
  const key = todayKey();
  const log = ensureLog(key, resolveSession(new Date()));
  if (!log.sets[exId]) log.sets[exId] = [];
  let cur = log.sets[exId][idx];
  if (cur == null || cur === "") {
    if (delta < 0) return;      // nothing logged yet, − does nothing
    cur = lo;                   // first + logs the low end of the range
  } else {
    cur = Math.max(0, cur + delta * step);
  }
  log.sets[exId][idx] = cur;
  save();
  render();
};
window.toggleSet = (exId, idx, lo) => {
  const key = todayKey();
  const log = ensureLog(key, resolveSession(new Date()));
  if (!log.sets[exId]) log.sets[exId] = [];
  const cur = log.sets[exId][idx];
  log.sets[exId][idx] = cur == null || cur === "" ? lo : "";
  save();
  render();
};
window.finishWorkout = () => {
  const key = todayKey();
  const sid = resolveSession(new Date());
  const log = ensureLog(key, sid);
  log.done = !log.done;
  save();
  toast(log.done ? "Workout logged 💪" : "Re-opened");
  render();
};
window.markCardioDone = () => {
  const key = todayKey();
  const log = ensureLog(key, resolveSession(new Date()));
  log.done = !log.done;
  save();
  toast(log.done ? "Run logged 🏃" : "Re-opened");
  render();
};

/* ---------------------- WEIGHT ---------------------- */
function viewWeight() {
  const w = state.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  const latest = w.length ? w[w.length - 1].kg : state.profile.startWeight;
  const goalHint = weightGuidance();

  let html = `<h1>Weight</h1><p class="subtle">Weigh in first thing in the morning, after the toilet, before eating — same conditions each time.</p>`;

  html += `<div class="card">
    <label class="field"><span>Today's weight (kg)</span>
      <input id="w-input" type="number" inputmode="decimal" step="0.1" placeholder="${latest}" /></label>
    <button class="btn" id="w-save">Save weight</button>
  </div>`;

  html += `<div class="banner ${goalHint.cls}">${goalHint.icon} <div>${goalHint.text}</div></div>`;

  if (w.length >= 2) {
    html += `<div class="card"><div class="card-head"><h2>Trend</h2><span class="pill">${w.length} entries</span></div>
      <div class="chart-wrap">${sparkline(w)}</div></div>`;
  }

  // 7-day moving average
  if (w.length) {
    const avg7 = movingAvg(w, 7);
    const avgPrev = movingAvg(w.slice(0, -7), 7);
    html += `<div class="stat-grid">
      <div class="stat"><div class="label">7-day avg</div><div class="value">${avg7 ? avg7.toFixed(1) : "–"}<small> kg</small></div></div>
      <div class="stat"><div class="label">Weekly change</div><div class="value">${avg7 && avgPrev ? signed(avg7 - avgPrev) : "–"}<small> kg</small></div></div>
    </div>`;
  }

  html += `<div class="section-title">History</div><div class="card tight">`;
  if (!w.length) html += `<div class="empty">No entries yet.</div>`;
  else {
    html += `<ul class="list">` + w.slice().reverse().slice(0, 30).map((e) =>
      `<li><span><b>${e.kg} kg</b> <span class="meta">${e.date}</span></span>
        <button class="del" onclick="delWeight('${e.date}')">✕</button></li>`).join("") + `</ul>`;
  }
  html += `</div>`;
  return html;
}
function bindWeight() {
  document.getElementById("w-save").onclick = () => saveWeight(document.getElementById("w-input").value);
}
window.delWeight = (date) => {
  state.weights = state.weights.filter((e) => e.date !== date);
  save(); render();
};
function movingAvg(arr, n) {
  if (!arr.length) return null;
  const slice = arr.slice(-n);
  return slice.reduce((s, e) => s + e.kg, 0) / slice.length;
}
function weightGuidance() {
  const w = state.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  if (w.length < 4) return { cls: "info", icon: "📈", text: "Log your weight for a week or two — I'll start spotting your trend and flag if a change is needed. Daily weight bounces around; the moving average is what matters." };
  const recent = movingAvg(w, 7);
  const older = movingAvg(w.slice(0, -7), 7);
  if (!older) return { cls: "info", icon: "📈", text: "Keep logging — almost enough data for a weekly trend." };
  const delta = recent - older;
  const goal = state.profile.goal;
  if (goal === "cut") {
    if (delta > 0.1) return { cls: "warn", icon: "⚠️", text: `You're up ${signed(delta)} kg/week but aiming to lose. Trim ~150–200 kcal/day or add an easy run.` };
    if (delta < -0.8) return { cls: "warn", icon: "⚠️", text: `Dropping fast (${signed(delta)} kg/week). Faster isn't better for keeping muscle — eat a bit more and keep protein high.` };
    return { cls: "up", icon: "✅", text: `Trending ${signed(delta)} kg/week — a solid, sustainable fat-loss pace. Keep protein at ${calcTargets().protein} g.` };
  }
  if (goal === "gain") {
    if (delta < 0.05) return { cls: "warn", icon: "⚠️", text: `Aiming to gain but flat/down. Add ~150 kcal/day.` };
    return { cls: "up", icon: "✅", text: `Gaining ${signed(delta)} kg/week. Lean gaining range — good.` };
  }
  // recomp / maintain
  if (Math.abs(delta) <= 0.25) return { cls: "up", icon: "✅", text: `Weight is stable (${signed(delta)} kg/week). Perfect for recomp — let strength on your lifts be your progress marker.` };
  return { cls: "info", icon: "📊", text: `Moving ${signed(delta)} kg/week. If that's not intended, nudge calories by ~150/day.` };
}

/* tiny inline SVG sparkline */
function sparkline(data) {
  const w = 680, h = 180, pad = 26;
  const xs = data.map((_, i) => i);
  const ys = data.map((d) => d.kg);
  const minY = Math.min(...ys) - 0.5, maxY = Math.max(...ys) + 0.5;
  const X = (i) => pad + (i / Math.max(1, xs.length - 1)) * (w - pad * 2);
  const Y = (v) => h - pad - ((v - minY) / Math.max(0.1, maxY - minY)) * (h - pad * 2);
  const line = data.map((d, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(d.kg).toFixed(1)}`).join(" ");
  const area = `${line} L${X(xs.length - 1).toFixed(1)},${h - pad} L${X(0).toFixed(1)},${h - pad} Z`;
  const dots = data.map((d, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(d.kg).toFixed(1)}" r="2.5" fill="#4f8cff"/>`).join("");
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4f8cff" stop-opacity="0.35"/><stop offset="100%" stop-color="#4f8cff" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#g)"/>
    <path d="${line}" fill="none" stroke="#4f8cff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    <text x="${pad}" y="14" fill="#9aa3b2" font-size="12">${maxY.toFixed(1)} kg</text>
    <text x="${pad}" y="${h - 6}" fill="#9aa3b2" font-size="12">${minY.toFixed(1)} kg</text>
  </svg>`;
}

/* ---------------------- FOOD ---------------------- */
function viewFood() {
  const key = todayKey();
  const items = state.food[key] || [];
  const t = calcTargets();
  const kcal = items.reduce((s, f) => s + (+f.kcal || 0), 0);
  const prot = items.reduce((s, f) => s + (+f.protein || 0), 0);
  const kcalLeft = t.kcal - kcal, protLeft = t.protein - prot;

  let html = `<h1>Food</h1><p class="subtle">${prettyDate()}</p>`;

  html += `<div class="card">
    <div class="meter-row"><span>Calories</span><span class="v">${kcal} / ${t.kcal} kcal</span></div>
    <div class="bar ${kcal > t.kcal ? "over" : ""}"><span style="width:${Math.min(100, (kcal / t.kcal) * 100)}%"></span></div>
    <div class="meter-row" style="margin-top:6px"><span class="meta">${kcalLeft >= 0 ? kcalLeft + " left" : Math.abs(kcalLeft) + " over"}</span></div>
    <div class="meter-row" style="margin-top:14px"><span>Protein</span><span class="v">${prot} / ${t.protein} g</span></div>
    <div class="bar protein"><span style="width:${Math.min(100, (prot / t.protein) * 100)}%"></span></div>
    <div class="meter-row" style="margin-top:6px"><span class="meta">${protLeft > 0 ? protLeft + " g to go" : "target hit ✓"}</span></div>
  </div>`;

  html += `<div class="card">
    <div class="card-head"><h2>Search a food</h2><span class="pill">Open Food Facts</span></div>
    <div class="search-row">
      <input id="f-search" placeholder="e.g. greek yogurt, oats, banana" enterkeyhint="search" />
      <button class="btn small" id="f-search-btn">Search</button>
    </div>
    <div id="f-results"></div>
  </div>`;

  html += `<div class="card">
    <div class="card-head"><h2>Add food</h2></div>
    <label class="field"><span>Describe your meal — I'll work out the calories</span>
      <textarea id="f-meal" rows="2" placeholder="e.g. 2 eggs + 2 slices bacon + 100g oats + 1 banana"></textarea></label>
    <button class="btn" id="f-calc">Calculate</button>
    <div id="meal-preview"></div>
    <details class="manual">
      <summary>Or enter one item manually</summary>
      <div style="padding-top:12px">
        <label class="field"><span>Name</span><input id="f-name" placeholder="e.g. Chicken & rice" /></label>
        <div class="row">
          <label class="field"><span>Calories</span><input id="f-kcal" type="number" inputmode="numeric" placeholder="kcal" /></label>
          <label class="field"><span>Protein (g)</span><input id="f-prot" type="number" inputmode="numeric" placeholder="g" /></label>
        </div>
        <button class="btn secondary" id="f-add">Add item</button>
      </div>
    </details>
    <div class="chips" id="presets">
      ${state.foodPresets.map((p, i) => `<button class="chip" data-preset="${i}">${p.name} · ${p.kcal}kcal</button>`).join("")}
    </div>
  </div>`;

  html += `<div class="section-title">Today's log</div><div class="card tight">`;
  if (!items.length) html += `<div class="empty">Nothing logged yet.</div>`;
  else {
    html += `<ul class="list">` + items.map((f, i) =>
      `<li><span><b>${f.name}</b><br><span class="meta">${f.kcal} kcal · ${f.protein} g protein</span></span>
        <button class="del" onclick="delFood(${i})">✕</button></li>`).join("") + `</ul>`;
  }
  html += `</div>`;
  return html;
}
function bindFood() {
  const add = () => {
    const name = document.getElementById("f-name").value.trim();
    const kcal = parseInt(document.getElementById("f-kcal").value, 10) || 0;
    const prot = parseInt(document.getElementById("f-prot").value, 10) || 0;
    if (!name) { toast("Name the food"); return; }
    const key = todayKey();
    if (!state.food[key]) state.food[key] = [];
    state.food[key].push({ name, kcal, protein: prot });
    save();
    render();
  };
  document.getElementById("f-add").onclick = add;
  document.getElementById("presets").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-preset]");
    if (!btn) return;
    const p = state.foodPresets[+btn.dataset.preset];
    const key = todayKey();
    if (!state.food[key]) state.food[key] = [];
    state.food[key].push({ ...p });
    save();
    toast("Added " + p.name);
    render();
  });

  // ---- natural-language meal calculator ----
  const mealInput = document.getElementById("f-meal");
  const previewBox = document.getElementById("meal-preview");
  document.getElementById("f-calc").onclick = () => calcMeal(mealInput.value, previewBox);

  previewBox.addEventListener("input", (e) => {
    const line = e.target.closest(".meal-line");
    if (!line) return;
    const i = +line.dataset.i;
    if (e.target.classList.contains("ml-name")) mealPreview[i].label = e.target.value;
    if (e.target.classList.contains("ml-kcal")) mealPreview[i].kcal = +e.target.value || 0;
    if (e.target.classList.contains("ml-prot")) mealPreview[i].protein = +e.target.value || 0;
    // refresh just the total
    const totKcal = mealPreview.reduce((s, l) => s + (+l.kcal || 0), 0);
    const totProt = mealPreview.reduce((s, l) => s + (+l.protein || 0), 0);
    const tot = previewBox.querySelector(".meal-total .v");
    if (tot) tot.textContent = `${totKcal} kcal · ${totProt} g protein`;
  });
  previewBox.addEventListener("click", (e) => {
    if (e.target.closest(".ml-del")) {
      const line = e.target.closest(".meal-line");
      mealPreview.splice(+line.dataset.i, 1);
      renderMealPreview(previewBox);
      return;
    }
    if (e.target.id === "meal-add-all") {
      if (!mealPreview.length) return;
      const key = todayKey();
      if (!state.food[key]) state.food[key] = [];
      mealPreview.forEach((l) => state.food[key].push({ name: l.label || "Food", kcal: +l.kcal || 0, protein: +l.protein || 0 }));
      save();
      mealPreview = [];
      toast("Meal logged");
      render();
    }
  });

  // ---- Open Food Facts search ----
  const searchInput = document.getElementById("f-search");
  const searchBtn = document.getElementById("f-search-btn");
  const resultsBox = document.getElementById("f-results");
  searchBtn.onclick = () => runFoodSearch(searchInput.value.trim(), resultsBox);
  searchInput.onkeydown = (e) => { if (e.key === "Enter") runFoodSearch(searchInput.value.trim(), resultsBox); };

  resultsBox.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add]");
    if (!btn) return;
    const r = foodResults[+btn.dataset.add];
    const gramsEl = btn.closest(".food-result").querySelector(".fr-grams");
    const grams = Math.max(1, parseFloat(gramsEl.value) || 100);
    const kcal = Math.round((r.kcal100 * grams) / 100);
    const protein = Math.round((r.prot100 * grams) / 100);
    const key = todayKey();
    if (!state.food[key]) state.food[key] = [];
    state.food[key].push({ name: `${r.name} (${grams} g)`, kcal, protein });
    save();
    toast(`Added ${kcal} kcal`);
    render();
  });
}

let foodResults = [];
async function runFoodSearch(query, box) {
  if (!query) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="empty">Searching…</div>`;
  const url = "https://world.openfoodfacts.org/cgi/search.pl?" + new URLSearchParams({
    search_terms: query, search_simple: "1", action: "process", json: "1",
    page_size: "20", fields: "product_name,brands,nutriments",
  });
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("status " + res.status);
    const data = await res.json();
    foodResults = (data.products || [])
      .map((p) => {
        const n = p.nutriments || {};
        let kcal = n["energy-kcal_100g"];
        if (kcal == null && n["energy_100g"] != null) kcal = n["energy_100g"] / 4.184; // kJ → kcal
        const prot = n["proteins_100g"];
        const name = (p.product_name || "").trim();
        if (!name || kcal == null || isNaN(kcal)) return null;
        return {
          name: p.brands ? `${name} — ${p.brands.split(",")[0].trim()}` : name,
          kcal100: Math.round(kcal),
          prot100: Math.round((prot || 0) * 10) / 10,
        };
      })
      .filter(Boolean)
      .slice(0, 12);

    if (!foodResults.length) { box.innerHTML = `<div class="empty">No matches with calorie data. Try a simpler term, or enter it manually below.</div>`; return; }

    box.innerHTML = foodResults.map((r, i) => `
      <div class="food-result">
        <div class="fr-main"><b>${escapeHtml(r.name)}</b>
          <div class="meta">${r.kcal100} kcal · ${r.prot100} g protein <span style="opacity:.7">/ 100 g</span></div>
        </div>
        <div class="fr-add">
          <input class="fr-grams" type="number" inputmode="numeric" value="100" aria-label="grams" />
          <span class="meta">g</span>
          <button class="iconbtn" data-add="${i}" aria-label="add">＋</button>
        </div>
      </div>`).join("");
  } catch (err) {
    box.innerHTML = `<div class="empty">Couldn't reach the food database right now (it gets busy, or you're offline). Try again in a moment, or enter the food manually below.</div>`;
  }
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
window.delFood = (i) => {
  const key = todayKey();
  state.food[key].splice(i, 1);
  save(); render();
};

/* ---------- natural-language meal parsing ----------
 * Type "2 eggs + 2 slices bacon + 100g oats" and we estimate calories/protein.
 * Known common foods come from a built-in table; anything else is looked up
 * online (Open Food Facts) and flagged as an estimate. Every line is editable
 * before it's logged.
 */
const WORD_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, half: 0.5, "½": 0.5, "couple": 2, "few": 3 };
const MASS_UNITS = { g: 1, gram: 1, grams: 1, gr: 1, kg: 1000, ml: 1, l: 1000, litre: 1000, liter: 1000 };
const VOL_UNITS = { tbsp: 15, tablespoon: 15, tablespoons: 15, tsp: 5, teaspoon: 5, teaspoons: 5, cup: 150, cups: 150, scoop: 30, scoops: 30, handful: 30, can: 120, tin: 120, bowl: 200, glass: 240 };
const PIECE_UNITS = ["slice", "slices", "piece", "pieces", "rasher", "rashers", "fillet", "fillets", "clove", "cloves", "stick", "sticks"];

// per100 = kcal & protein per 100 g/ml · g = typical weight of "1" of this food
const FOOD_DB = {
  egg:           { per100: { kcal: 143, protein: 12.6 }, g: 50, aliases: ["eggs"] },
  bacon:         { per100: { kcal: 410, protein: 30 }, g: 12, aliases: ["bacon rasher", "bacon rashers", "rasher", "rashers"] },
  sausage:       { per100: { kcal: 300, protein: 13 }, g: 50, aliases: ["sausages"] },
  potato:        { per100: { kcal: 87, protein: 2 }, g: 150, aliases: ["potatoes", "boiled potato"] },
  "sweet potato":{ per100: { kcal: 90, protein: 1.6 }, g: 130, aliases: ["sweet potatoes"] },
  fries:         { per100: { kcal: 312, protein: 3.4 }, g: 117, aliases: ["chips", "french fries"] },
  rice:          { per100: { kcal: 130, protein: 2.7 }, g: 150, aliases: ["white rice", "cooked rice", "brown rice"] },
  pasta:         { per100: { kcal: 158, protein: 5.8 }, g: 150, aliases: ["spaghetti", "cooked pasta", "macaroni"] },
  bread:         { per100: { kcal: 265, protein: 9 }, g: 30, aliases: ["toast", "slice of bread", "white bread", "brown bread", "wholemeal bread"] },
  oats:          { per100: { kcal: 379, protein: 13 }, g: 40, aliases: ["oatmeal", "porridge", "rolled oats"] },
  milk:          { per100: { kcal: 50, protein: 3.4 }, g: 200, aliases: ["semi skimmed milk", "whole milk", "skimmed milk"] },
  yogurt:        { per100: { kcal: 59, protein: 10 }, g: 170, aliases: ["greek yogurt", "yoghurt", "greek yoghurt"] },
  cheese:        { per100: { kcal: 402, protein: 25 }, g: 30, aliases: ["cheddar", "cheddar cheese"] },
  butter:        { per100: { kcal: 717, protein: 0.9 }, g: 10, aliases: [] },
  "olive oil":   { per100: { kcal: 884, protein: 0 }, g: 14, aliases: ["oil"] },
  "peanut butter":{ per100: { kcal: 588, protein: 25 }, g: 16, aliases: [] },
  chicken:       { per100: { kcal: 165, protein: 31 }, g: 120, aliases: ["chicken breast", "chicken breasts", "grilled chicken"] },
  beef:          { per100: { kcal: 250, protein: 26 }, g: 120, aliases: ["beef mince", "minced beef", "ground beef", "steak"] },
  pork:          { per100: { kcal: 242, protein: 27 }, g: 120, aliases: ["pork chop"] },
  tuna:          { per100: { kcal: 116, protein: 26 }, g: 100, aliases: ["canned tuna"] },
  salmon:        { per100: { kcal: 208, protein: 22 }, g: 120, aliases: [] },
  ham:           { per100: { kcal: 145, protein: 18 }, g: 23, aliases: [] },
  banana:        { per100: { kcal: 89, protein: 1.1 }, g: 118, aliases: ["bananas"] },
  apple:         { per100: { kcal: 52, protein: 0.3 }, g: 180, aliases: ["apples"] },
  orange:        { per100: { kcal: 47, protein: 0.9 }, g: 130, aliases: ["oranges"] },
  avocado:       { per100: { kcal: 160, protein: 2 }, g: 100, aliases: ["avocados"] },
  tomato:        { per100: { kcal: 18, protein: 0.9 }, g: 120, aliases: ["tomatoes"] },
  carrot:        { per100: { kcal: 41, protein: 0.9 }, g: 60, aliases: ["carrots"] },
  broccoli:      { per100: { kcal: 34, protein: 2.8 }, g: 90, aliases: [] },
  almonds:       { per100: { kcal: 579, protein: 21 }, g: 30, aliases: ["almond", "nuts"] },
  "protein shake":{ per100: { kcal: 400, protein: 80 }, g: 30, aliases: ["whey", "protein powder", "whey protein"] },
  honey:         { per100: { kcal: 304, protein: 0.3 }, g: 21, aliases: [] },
  sugar:         { per100: { kcal: 387, protein: 0 }, g: 4, aliases: [] },
  coffee:        { per100: { kcal: 2, protein: 0.1 }, g: 240, aliases: ["black coffee"] },
};

// build an alias -> key index once
const FOOD_INDEX = (() => {
  const idx = {};
  for (const key in FOOD_DB) {
    idx[key] = key;
    (FOOD_DB[key].aliases || []).forEach((a) => (idx[a] = key));
  }
  return idx;
})();

function lookupFood(name) {
  const n = name.trim().toLowerCase().replace(/\.$/, "");
  if (FOOD_INDEX[n]) return FOOD_DB[FOOD_INDEX[n]];
  if (n.endsWith("s") && FOOD_INDEX[n.slice(0, -1)]) return FOOD_DB[FOOD_INDEX[n.slice(0, -1)]];
  if (FOOD_INDEX[n + "s"]) return FOOD_DB[FOOD_INDEX[n + "s"]];
  return null;
}

function parseMeal(text) {
  return text
    .split(/\+|,|;|\band\b|\n|&/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw) => {
      let rest = raw.toLowerCase().trim();
      let qty = 1, unit = null;
      const numMatch = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
      if (numMatch) {
        qty = parseFloat(numMatch[1].replace(",", "."));
        rest = numMatch[2];
      } else {
        const wordMatch = rest.match(/^([\wÀ-ÿ½]+)\s+(.*)$/);
        if (wordMatch && WORD_NUM[wordMatch[1]] != null) {
          qty = WORD_NUM[wordMatch[1]];
          rest = wordMatch[2];
        }
      }
      const unitMatch = rest.match(/^([a-zA-Z]+)\.?\s+(.*)$/);
      if (unitMatch) {
        const u = unitMatch[1].toLowerCase();
        if (MASS_UNITS[u] || VOL_UNITS[u] || PIECE_UNITS.includes(u)) {
          unit = u;
          rest = unitMatch[2];
        }
      }
      const name = rest.replace(/^of\s+/, "").trim();
      return { raw, qty, unit, name };
    })
    .filter((it) => it.name);
}

function gramsFor(qty, unit, entry) {
  if (unit && MASS_UNITS[unit]) return qty * MASS_UNITS[unit];
  if (unit && VOL_UNITS[unit]) return qty * VOL_UNITS[unit];
  return qty * (entry && entry.g ? entry.g : 100); // piece / count / unknown unit
}

function makeMealLine(item, grams, per100, estimate, unknown) {
  return {
    label: item.raw.charAt(0).toUpperCase() + item.raw.slice(1),
    kcal: Math.round((per100.kcal * grams) / 100),
    protein: Math.round((per100.protein * grams) / 100),
    estimate: !!estimate,
    unknown: !!unknown,
  };
}

async function offLookup(name) {
  const url = "https://world.openfoodfacts.org/cgi/search.pl?" + new URLSearchParams({
    search_terms: name, search_simple: "1", action: "process", json: "1",
    page_size: "5", fields: "product_name,nutriments",
  });
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    for (const p of data.products || []) {
      const n = p.nutriments || {};
      let kcal = n["energy-kcal_100g"];
      if (kcal == null && n["energy_100g"] != null) kcal = n["energy_100g"] / 4.184;
      if (kcal != null && !isNaN(kcal)) return { kcal: Math.round(kcal), protein: Math.round((n["proteins_100g"] || 0) * 10) / 10 };
    }
  } catch { /* offline / busy */ }
  return null;
}

let mealPreview = [];
async function calcMeal(text, box) {
  const items = parseMeal(text);
  if (!items.length) { box.innerHTML = ""; mealPreview = []; return; }
  box.innerHTML = `<div class="empty">Working it out…</div>`;
  mealPreview = await Promise.all(items.map(async (it) => {
    const entry = lookupFood(it.name);
    if (entry) return makeMealLine(it, gramsFor(it.qty, it.unit, entry), entry.per100, false, false);
    const off = await offLookup(it.name);
    if (off) return makeMealLine(it, gramsFor(it.qty, it.unit, { g: 100 }), off, true, false);
    return { label: it.raw.charAt(0).toUpperCase() + it.raw.slice(1), kcal: 0, protein: 0, estimate: true, unknown: true };
  }));
  renderMealPreview(box);
}

function renderMealPreview(box) {
  if (!mealPreview.length) { box.innerHTML = ""; return; }
  const totKcal = mealPreview.reduce((s, l) => s + (+l.kcal || 0), 0);
  const totProt = mealPreview.reduce((s, l) => s + (+l.protein || 0), 0);
  box.innerHTML = `
    <div class="meal-lines">
      ${mealPreview.map((l, i) => `
        <div class="meal-line" data-i="${i}">
          <input class="ml-name" value="${escapeHtml(l.label)}" />
          <div class="ml-macros">
            <input class="ml-kcal" type="number" inputmode="numeric" value="${l.kcal}" /><span class="meta">kcal</span>
            <input class="ml-prot" type="number" inputmode="numeric" value="${l.protein}" /><span class="meta">g</span>
            <button class="del ml-del" aria-label="remove">✕</button>
          </div>
          ${l.estimate ? `<div class="ml-note meta">${l.unknown ? "⚠ not recognised — please fill in" : "≈ estimated from online data, tweak if needed"}</div>` : ""}
        </div>`).join("")}
    </div>
    <div class="meal-total"><span>Total</span><span class="v">${totKcal} kcal · ${totProt} g protein</span></div>
    <button class="btn success" id="meal-add-all">Add ${mealPreview.length} item${mealPreview.length > 1 ? "s" : ""} to today</button>`;
}

/* ---------------------- SETTINGS (More) ---------------------- */
function viewSettings() {
  const t = calcTargets();
  return `<h1>More</h1><p class="subtle">Targets, reminders, profile and your data.</p>

    <div class="card">
      <div class="card-head"><h2>Your targets</h2><span class="pill">${state.profile.goal}</span></div>
      <div class="stat-grid">
        <div class="stat"><div class="label">Maintenance</div><div class="value">${t.tdee}<small> kcal</small></div></div>
        <div class="stat"><div class="label">Daily target</div><div class="value">${t.kcal}<small> kcal</small></div></div>
        <div class="stat"><div class="label">Protein</div><div class="value">${t.protein}<small> g</small></div></div>
        <div class="stat"><div class="label">Carbs / Fat</div><div class="value">${t.carbs}<small>/</small>${t.fat}<small> g</small></div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Training block</h2><span class="pill">week ${blockWeekIndex() + 1}/${PROGRAM.block.lengthWeeks}</span></div>
      <p class="subtle" style="margin:0 0 10px"><b>${currentWeek().label}</b> · target ${currentWeek().rir} reps in reserve. Sets ramp up each week, then a deload week to recover — repeating on a ${PROGRAM.block.lengthWeeks}-week cycle. Started ${state.programStart}.</p>
      <button class="btn secondary small" id="block-restart">Restart block from today</button>
    </div>

    <div class="card">
      <ul class="list">
        <li><span>📒 Workout history</span><button class="btn small secondary" onclick="navigate('history')">View</button></li>
        <li><span>👤 Profile & goal</span><button class="btn small secondary" onclick="navigate('profile')">Edit</button></li>
        <li><span>🔔 Reminders</span><button class="btn small secondary" onclick="navigate('reminders')">${state.reminders.enabled ? "On" : "Set up"}</button></li>
      </ul>
    </div>

    <div class="card">
      <div class="card-head"><h2>Your data</h2></div>
      <p class="subtle" style="margin:0 0 12px">Everything is stored only on this device. Back it up or move it to another device here.</p>
      <div class="btn-row">
        <button class="btn secondary" id="export-btn">Export</button>
        <button class="btn secondary" id="import-btn">Import</button>
      </div>
      <button class="btn danger" id="reset-btn" style="margin-top:10px">Reset everything</button>
      <input type="file" id="import-file" accept="application/json" hidden />
    </div>

    <p class="subtle" style="text-align:center;margin-top:20px">Gym Buddy · works offline · add to home screen for the app experience</p>
  `;
}
function bindSettings() {
  document.getElementById("block-restart").onclick = () => {
    if (confirm("Restart the training block from today? Next workout becomes week 1.")) {
      state.programStart = todayKey();
      save(); toast("Block restarted"); render();
    }
  };
  document.getElementById("export-btn").onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `gym-buddy-${todayKey()}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  document.getElementById("import-btn").onclick = () => document.getElementById("import-file").click();
  document.getElementById("import-file").onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = deepMerge(structuredClone(DEFAULT_STATE), JSON.parse(reader.result));
        save(); toast("Data imported"); render();
      } catch { toast("Invalid file"); }
    };
    reader.readAsText(file);
  };
  document.getElementById("reset-btn").onclick = () => {
    if (confirm("Delete all your data and start fresh?")) {
      state = structuredClone(DEFAULT_STATE); save(); toast("Reset done"); navigate("today");
    }
  };
}

/* ---------------------- PROFILE ---------------------- */
function viewProfile() {
  const p = state.profile;
  return `<h1>Profile & goal</h1><p class="subtle">Used to calculate your calorie and protein targets.</p>
    <div class="card">
      <div class="row">
        <label class="field"><span>Age</span><input id="p-age" type="number" value="${p.age}" /></label>
        <label class="field"><span>Height (cm)</span><input id="p-height" type="number" value="${p.heightCm}" /></label>
      </div>
      <label class="field"><span>Sex (for BMR formula)</span>
        <select id="p-sex"><option value="male" ${p.sex === "male" ? "selected" : ""}>Male</option><option value="female" ${p.sex === "female" ? "selected" : ""}>Female</option></select></label>
      <label class="field"><span>Starting weight (kg)</span><input id="p-start" type="number" step="0.1" value="${p.startWeight}" /></label>
      <label class="field"><span>Activity level</span>
        <select id="p-activity">
          <option value="1.2" ${p.activity == 1.2 ? "selected" : ""}>Mostly sedentary</option>
          <option value="1.375" ${p.activity == 1.375 ? "selected" : ""}>Light (1–3 sessions/wk)</option>
          <option value="1.45" ${p.activity == 1.45 ? "selected" : ""}>Moderate (lifting + running)</option>
          <option value="1.55" ${p.activity == 1.55 ? "selected" : ""}>Active (most days)</option>
          <option value="1.725" ${p.activity == 1.725 ? "selected" : ""}>Very active</option>
        </select></label>
      <label class="field"><span>Goal</span>
        <select id="p-goal">
          <option value="cut" ${p.goal === "cut" ? "selected" : ""}>Lose fat (-18%)</option>
          <option value="recomp" ${p.goal === "recomp" ? "selected" : ""}>Recomp / lean down (-8%)</option>
          <option value="maintain" ${p.goal === "maintain" ? "selected" : ""}>Maintain</option>
          <option value="gain" ${p.goal === "gain" ? "selected" : ""}>Build muscle (+10%)</option>
        </select></label>
      <label class="field"><span>Protein per kg bodyweight (${p.proteinPerKg} g/kg)</span>
        <input id="p-protein" type="range" min="1.4" max="2.4" step="0.1" value="${p.proteinPerKg}" oninput="document.getElementById('p-protein-val').textContent=this.value" />
        <span id="p-protein-val" class="meta">${p.proteinPerKg}</span></label>
      <button class="btn" id="p-save">Save</button>
    </div>`;
}
function bindProfile() {
  document.getElementById("p-save").onclick = () => {
    const p = state.profile;
    p.age = parseInt(document.getElementById("p-age").value, 10) || p.age;
    p.heightCm = parseInt(document.getElementById("p-height").value, 10) || p.heightCm;
    p.sex = document.getElementById("p-sex").value;
    p.startWeight = parseFloat(document.getElementById("p-start").value) || p.startWeight;
    p.activity = parseFloat(document.getElementById("p-activity").value);
    p.goal = document.getElementById("p-goal").value;
    p.proteinPerKg = parseFloat(document.getElementById("p-protein").value);
    save(); toast("Profile saved"); navigate("settings");
  };
}

/* ---------------------- REMINDERS ---------------------- */
function viewReminders() {
  const r = state.reminders;
  const supported = "Notification" in window;
  const perm = supported ? Notification.permission : "unsupported";

  let html = `<h1>Reminders</h1><p class="subtle">Local notifications from this device. For them to fire reliably, install the app to your home screen and open it at least once a day.</p>`;

  if (!supported) {
    html += `<div class="banner warn">⚠️ <div>This browser doesn't support notifications. Try installing the app or using Chrome/Edge/Safari.</div></div>`;
  } else if (perm === "denied") {
    html += `<div class="banner warn">⚠️ <div>Notifications are blocked. Enable them for this site in your browser/OS settings, then reload.</div></div>`;
  }

  html += `<div class="card">
    <div class="switch">
      <div><div class="lbl">Enable reminders</div><div class="desc">Master switch · ${perm === "granted" ? "permission granted" : "will ask permission"}</div></div>
      <label class="toggle"><input type="checkbox" id="r-master" ${r.enabled ? "checked" : ""}><span class="track"></span></label>
    </div>
  </div>`;

  html += `<div class="section-title">Daily reminders</div><div class="card">`;
  Object.entries(r.items).forEach(([id, it]) => {
    html += `<div class="switch">
      <div style="flex:1"><div class="lbl">${it.label}</div>
        <input type="time" value="${it.time}" data-time="${id}" style="margin-top:6px;max-width:140px" /></div>
      <label class="toggle"><input type="checkbox" data-on="${id}" ${it.on ? "checked" : ""}><span class="track"></span></label>
    </div>`;
  });
  html += `</div>`;

  html += `<button class="btn secondary" id="r-test">Send a test notification</button>`;
  html += `<div class="banner info" style="margin-top:14px">ℹ️ <div>Static apps can't push from a server, so reminders are scheduled on-device while the app (or its background worker) is alive. Installing as a PWA makes this far more reliable.</div></div>`;
  return html;
}
function bindReminders() {
  document.getElementById("r-master").onchange = async (e) => {
    if (e.target.checked) {
      if ("Notification" in window && Notification.permission !== "granted") {
        const res = await Notification.requestPermission();
        if (res !== "granted") { e.target.checked = false; toast("Permission needed"); return; }
      }
      state.reminders.enabled = true;
      toast("Reminders on");
    } else {
      state.reminders.enabled = false;
    }
    save();
    scheduleReminders();
    render();
  };
  document.querySelectorAll("[data-on]").forEach((el) => {
    el.onchange = () => { state.reminders.items[el.dataset.on].on = el.checked; save(); scheduleReminders(); };
  });
  document.querySelectorAll("[data-time]").forEach((el) => {
    el.onchange = () => { state.reminders.items[el.dataset.time].time = el.value; save(); scheduleReminders(); };
  });
  document.getElementById("r-test").onclick = () => showNotification("Gym Buddy", "✅ Test notification — reminders are working!");
}

/* ---------------------- notifications engine ---------------------- */
function showNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    toast("Enable notifications first");
    return;
  }
  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, {
      body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "gym-buddy", renotify: true,
    })).catch(() => new Notification(title, { body }));
  } else {
    new Notification(title, { body });
  }
}

let reminderTimers = [];
function scheduleReminders() {
  reminderTimers.forEach((t) => clearTimeout(t));
  reminderTimers = [];
  if (!state.reminders.enabled || !("Notification" in window) || Notification.permission !== "granted") return;

  const now = new Date();
  Object.values(state.reminders.items).forEach((it) => {
    if (!it.on) return;
    const [h, m] = it.time.split(":").map(Number);
    const when = new Date(now); when.setHours(h, m, 0, 0);
    if (when <= now) return; // already passed today; will be picked up tomorrow on next open
    const delay = when - now;
    if (delay < 86400000) {
      reminderTimers.push(setTimeout(() => {
        showNotification("Gym Buddy", "⏰ " + it.label);
        scheduleReminders();
      }, delay));
    }
  });
}
// reschedule when the app regains focus / a new day starts
document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleReminders(); });

/* ---------------------- PWA install ---------------------- */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById("install-btn");
  btn.hidden = false;
  btn.onclick = async () => {
    btn.hidden = true;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  };
});

/* ---------------------- boot ---------------------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((e) => console.warn("SW reg failed", e));
  });
}
scheduleReminders();
render();
