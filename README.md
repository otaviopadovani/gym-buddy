# Gym Buddy

A personal, dumbbell-focused **fitness & food tracker** built as an offline-capable **PWA**. No backend, no accounts — all your data is stored locally on your device. Built to be hosted for free on **GitHub Pages**.

## What it does

- **Today** — your plan for the day (workout / run / rest), nutrition progress and weight at a glance.
- **Workouts** — a 3×/week full-body **dumbbell program** with running on the off days. Log each set's reps, edit the weights, and get **progressive-overload suggestions**: when you hit the top of the rep range on every set, it tells you to add weight next time.
- **Weight** — log your morning weight, see a trend chart + 7-day moving average, and get **guidance** on whether to nudge your calories based on your goal.
- **Food** — log meals against **calorie & protein targets** calculated from your profile (Mifflin–St Jeor BMR → TDEE → goal adjustment). Quick-add presets included.
- **Reminders** — on-device notifications for weigh-ins, workouts, meals and a protein check-in.
- **More** — edit your profile/goal, manage reminders, and **export/import** your data (JSON) to back it up or move devices.

The defaults are pre-filled for the owner (42 y, 169 cm, 72.5 kg start, returning to training, runs 10k) — everything is editable under **More → Profile**.

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

## Tech

Vanilla JS, no dependencies. `sharp` is only used once to render the PNG icons from `icons/icon.svg` and is not needed to run or deploy the app.
