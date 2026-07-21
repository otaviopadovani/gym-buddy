# Gym Buddy

A personal, dumbbell-focused **fitness & food tracker** built as an offline-capable **PWA**. No backend, no accounts — all your data is stored locally on your device. Built to be hosted for free on **GitHub Pages**.

## What it does

- **Today** — your plan for the day (workout / run / rest), nutrition progress, and an inline quick weight log.
- **Workouts** — a 3×/week **full-body dumbbell program tuned for a lean, defined look** (not bulk). Every session trains the whole body (legs included), so each muscle is hit ~2×/week. It runs on an auto-managed **5-week periodized block** (sets ramp up each week, then a deload), shows a **target reps-in-reserve (RIR)** per session, flags **stretch-biased** lifts, and gives **progressive-overload suggestions** when you max the rep range.
- **History** — a full log of every completed session with the reps you did and an estimated training volume.
- **Weight** — log your morning weight, see a trend chart + 7-day moving average, and get **goal-aware guidance** on whether to nudge your calories.
- **Food** — log meals against **calorie & protein targets** (Mifflin–St Jeor BMR → TDEE → goal adjustment). Includes a **natural-language meal calculator** ("2 eggs + 2 slices bacon + 100g oats") backed by a built-in food table and the **Open Food Facts** database, plus search and quick-add presets.
- **Reminders** — on-device notifications for weigh-ins, workouts, meals and a protein check-in.
- **More** — edit your profile/goal, manage the training block, and **export/import** your data (JSON) to back it up or move devices.

The defaults are pre-filled for the owner (42 y, 170 cm, 70 kg start, returning to training, runs 10k, **goal: look lean & toned**) — everything is editable under **More → Profile**.

## Training methodology & the science

The program isn't a generic template — every design choice is anchored to current (2024–2026) meta-analyses and reviews. The goal is *body recomposition*: build lean muscle while gradually losing fat.

### Why full-body 3×/week (and no isolated "leg day")
Once weekly volume is equated, **higher training frequency adds little for hypertrophy** — what matters is total weekly sets per muscle. Full-body sessions let every muscle (legs included) be trained ~2×/week on just three lifting days, which beats a once-weekly body-part split. A classic "chest/back/leg day" split only makes sense at 5–6 days/week.
- Pelland et al., *Sports Medicine* (2025) — [The Resistance Training Dose Response](https://link.springer.com/article/10.1007/s40279-025-02344-w)

### Volume is the main driver — so it ramps over time
Muscle growth keeps rising with weekly sets (diminishing returns, no clear plateau); ~**10–20 sets per muscle per week** is the practical sweet spot. The app's **5-week block** starts light (re-introduction), adds a set most weeks toward a peak, then deloads — taking each major muscle from ~9 sets/week to ~15 at peak.
- Pelland et al., *Sports Medicine* (2025) — [dose response](https://pubmed.ncbi.nlm.nih.gov/41343037/)

### Train close to failure (target RIR)
Hypertrophy improves the closer a set is taken to failure, while strength is relatively unaffected. Each block week prescribes a **reps-in-reserve (RIR)** target (start 2–3, peak 0–2, deload 4–5).
- Robinson et al., *Sports Medicine* (2024) — [proximity to failure](https://pubmed.ncbi.nlm.nih.gov/38970765/) ([FAU summary](https://www.fau.edu/newsdesk/articles/muscle-growth-strength-study))

### Load doesn't dictate growth — which is why dumbbells are fine
Hypertrophy is similar across a wide load range (~30–85% of max) as long as sets are taken near failure. Limited dumbbell weight is **not** a barrier: higher-rep sets to near-failure build just as much muscle.
- Schoenfeld et al., *JSCR* (2017) — [low- vs high-load](https://journals.lww.com/nsca-jscr/fulltext/2017/12000/strength_and_hypertrophy_adaptations_between_low_.31.aspx); [Repetition Continuum review](https://www.researchgate.net/publication/349319068_Loading_Recommendations_for_Muscle_Strength_Hypertrophy_and_Local_Endurance_A_Re-Examination_of_the_Repetition_Continuum)

### Train muscles in the stretched position
Training (and emphasizing) the **long/stretched range** produces equal or greater hypertrophy than short-range work. Stretch-biased lifts (RDL, incline/floor press, overhead triceps extension, deep squats/lunges, calf raises, rows) are tagged `stretch` in the app.
- Varovic/Wolf/Schoenfeld et al. (2025) — [muscle length & regional hypertrophy](https://link.springer.com/article/10.1007/s11332-025-01586-5)

### Running won't steal your gains
The "interference effect" is largely overstated for strength and size at moderate endurance volumes — it mainly blunts *explosive power*. Mitigations baked into the plan: **lift and run on alternate days**, keep most runs easy, and note that running causes more muscle damage than cycling (swap if legs are beat up).
- Umbrella review of meta-analyses (2026) — [Maximizing Adaptations in Concurrent Training](https://www.fisiologiadelejercicio.com/wp-content/uploads/2026/03/Maximizing-Adaptations-in-Concurrent-Training.pdf); [Stronger by Science](https://www.strongerbyscience.com/research-spotlight-interference-effect/)

### Protein & recomposition
Recomp (simultaneous muscle gain + fat loss) works best in **novices, returning lifters, and those with fat to lose** — using a **slight deficit or maintenance + high protein + progressive lifting**. ~**1.6 g/kg** maximizes gains, with the confidence interval up to **2.2 g/kg**; the app defaults to **2.0 g/kg** since protein needs rise while dieting (and efficacy dips slightly with age). Spread it over ~4 meals (~0.4 g/kg each).
- Morton et al., *BJSM* (2018) — [protein meta-analysis](https://bjsm.bmj.com/content/52/6/376)
- Barakat et al. (2020) & 2019–2024 review — [body recomposition](https://apcz.umk.pl/JEHS/article/view/59391)

> Not medical advice — it's a personal tool built on the current evidence base. Adjust to your own recovery, joints, and preferences.

## Run locally

It's plain HTML/CSS/JS — no build step. Just serve the folder over HTTP (service workers need `http(s)`, not `file://`):

```bash
# any of these from the project root
npx serve .
# or
python -m http.server 8080
```

Then open the printed URL (e.g. `http://localhost:8080`).

## Deploy to GitHub Pages

### Option A — automatic (included workflow)
1. Create a repo on your GitHub and push this folder:
   ```bash
   git remote add origin https://github.com/<you>/gym-buddy.git
   git push -u origin main
   ```
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included `.github/workflows/deploy.yml` publishes the site on every push to `main`.
4. Your app will be live at `https://<you>.github.io/gym-buddy/`.

### Option B — no workflow
**Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`**. Done.

> Tip: open the live HTTPS URL on your phone and **Add to Home Screen** to install it as an app. Reminders are most reliable when installed.

## Notes & limitations

- Because this is a static site with no server, **push notifications can't be sent from a server**. Reminders are scheduled on-device while the app (or its background worker) is alive, so keep it installed and open it daily. A test button is in the Reminders tab.
- Data lives in this browser's `localStorage`. Clearing site data wipes it — use **Export** to back up.
- The installed PWA checks for new deployments whenever it opens or returns to the foreground. Tap **↻** in the header to force an update check and refresh; it changes to **Update** when a new version is ready. Previously cached files remain available offline.

## Tech

Vanilla JS, no dependencies. `sharp` is only used once to render the PNG icons from `icons/icon.svg` and is not needed to run or deploy the app.

### Exercise media

The start/finish photographs in `assets/exercises/` come from
[yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db), an
open public-domain exercise dataset released under
[The Unlicense](https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE).
Form instructions in the app were adapted and shortened for this routine.
The files are bundled locally so the guides continue to work offline.
