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
    proteinPerKg: 1.8,
    startWeight: 72.5,
  },
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
function lastPerformance(exId) {
  const keys = Object.keys(state.workoutLog).sort().reverse();
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
  if (arr.length < ex.sets) return false;
  return arr.slice(0, ex.sets).every((reps) => Number(reps) >= ex.repHigh);
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
    const on = r === route || (r === "settings" && (route === "reminders" || route === "profile"));
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
    html += `<p class="subtle" style="margin:0 0 12px">${session.exercises.length} exercises · ${doneCount} started</p>
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
  html += `<div class="card">
    <div class="card-head"><h2>⚖️ Weight</h2></div>
    <div class="stat-grid">
      <div class="stat"><div class="label">Current</div><div class="value">${latestWeight()}<small> kg</small></div>
        <div class="sub">${lastW ? "logged " + relativeDays(lastW.date) : "from profile"}</div></div>
      <div class="stat"><div class="label">Since start</div><div class="value">${signed(latestWeight() - state.profile.startWeight)}<small> kg</small></div>
        <div class="sub">start ${state.profile.startWeight} kg</div></div>
    </div>
    <button class="btn secondary" style="margin-top:14px" onclick="navigate('weight')">Log today's weight</button>
  </div>`;

  // Reminder nudge
  if (!state.reminders.enabled) {
    html += `<div class="banner info">🔔 <div>Turn on reminders to get nudged for weigh-ins, workouts and meals. <a href="#reminders" onclick="navigate('reminders');return false;">Set up reminders</a></div></div>`;
  }

  return html;
}
function bindToday() {}

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

  let html = `<h1>${session.name}</h1><p class="subtle">${prettyDate(now)} · ${session.focus || ""}</p>`;

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

  html += `<div class="banner info">💡 <div>Tap a set circle each time you finish it — enter the reps you actually did. When you hit the top of the rep range on <b>all</b> sets, I'll suggest adding weight next time.</div></div>`;

  session.exercises.forEach((ex) => {
    const w = weightFor(ex.id);
    const unit = ex.unit === "sec" ? "" : "kg";
    const setArr = log.sets[ex.id] || [];
    const progress = shouldProgress(ex);
    const repTarget = ex.unit === "sec" ? `${ex.repLow}–${ex.repHigh}s` :
                      ex.unit === "reps" ? `${ex.repLow}–${ex.repHigh} reps` :
                      `${ex.repLow}–${ex.repHigh} reps`;

    html += `<div class="exercise" id="ex-${ex.id}">
      <div class="exercise-top">
        <div>
          <div class="exercise-name">${ex.name}</div>
          <div class="exercise-meta">${ex.sets} × ${repTarget}</div>
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

    // set pills
    html += `<div class="set-pills">`;
    for (let i = 0; i < ex.sets; i++) {
      const val = setArr[i];
      const hit = val != null && val !== "";
      const labelUnit = ex.unit === "sec" ? "s" : "";
      html += `<button class="set-pill ${hit ? "hit" : ""}" onclick="logSet('${ex.id}', ${i}, ${ex.repHigh}, '${ex.unit || "reps"}')">
        Set ${i + 1}${hit ? ": " + val + labelUnit : ""}</button>`;
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
  let html = `<div class="section-title">This week</div><div class="card tight"><ul class="list">`;
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const sid = resolveSession(d);
    const s = PROGRAM.sessions[sid];
    const log = getLog(todayKey(d));
    const isToday = todayKey(d) === todayKey(now);
    const status = log && log.done ? "✅" : (sid === "rest" ? "😴" : sid === "run" ? "🏃" : "⬜");
    html += `<li><span>${status} <b>${days[d.getDay()]}</b> <span class="meta">${d.getDate()}</span></span>
      <span class="meta">${s.name}${isToday ? " · today" : ""}</span></li>`;
  }
  html += `</ul></div>`;
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
window.logSet = (exId, idx, target, unit) => {
  const key = todayKey();
  const sid = resolveSession(new Date());
  const log = ensureLog(key, sid);
  if (!log.sets[exId]) log.sets[exId] = [];
  const promptUnit = unit === "sec" ? "seconds held" : "reps done";
  const current = log.sets[exId][idx];
  const input = window.prompt(`${promptUnit}? (target ${target})`, current != null && current !== "" ? current : target);
  if (input === null) return;
  log.sets[exId][idx] = input === "" ? "" : Math.max(0, parseInt(input, 10) || 0);
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
  document.getElementById("w-save").onclick = () => {
    const val = parseFloat(document.getElementById("w-input").value);
    if (isNaN(val) || val < 30 || val > 250) { toast("Enter a valid weight"); return; }
    const key = todayKey();
    const idx = state.weights.findIndex((e) => e.date === key);
    if (idx >= 0) state.weights[idx].kg = val;
    else state.weights.push({ date: key, kg: val });
    save();
    toast("Weight saved");
    render();
  };
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
    <div class="card-head"><h2>Add food</h2></div>
    <label class="field"><span>What did you eat?</span><input id="f-name" placeholder="e.g. Chicken & rice" /></label>
    <div class="row">
      <label class="field"><span>Calories</span><input id="f-kcal" type="number" inputmode="numeric" placeholder="kcal" /></label>
      <label class="field"><span>Protein (g)</span><input id="f-prot" type="number" inputmode="numeric" placeholder="g" /></label>
    </div>
    <button class="btn" id="f-add">Add</button>
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
}
window.delFood = (i) => {
  const key = todayKey();
  state.food[key].splice(i, 1);
  save(); render();
};

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
      <ul class="list">
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
