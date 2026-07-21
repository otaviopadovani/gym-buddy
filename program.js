/*
 * Dumbbell-focused training program — AESTHETICS / "tone & look lean".
 * Built around a returning lifter who already has decent cardio (10k runner)
 * and wants definition rather than size: capped shoulders, defined arms,
 * a tighter waist, decent chest/back posture and glutes — not bulk.
 *
 * How that shapes the plan:
 *   - Moderate volume, higher-rep accessory work (shoulders, arms, core, glutes).
 *   - Compound lifts kept but not maximal/heavy — enough to build shape, not mass.
 *   - Staying lean is driven by the food/weight side (recomp goal). Lifting
 *     builds the muscle; the deficit reveals it.
 *
 * Structure: 3 full-body dumbbell sessions (A / B / A, alternating week to week)
 * plus easy running / conditioning on the off days. Plenty of rest built in.
 *
 * Progression model = "double progression":
 *   - Each lift has a rep range (e.g. 8-12) and a fixed number of sets.
 *   - When you hit the TOP of the range on every set, the app suggests a
 *     weight increase for next time (small jumps because dumbbells are paired).
 */

const PROGRAM = {
  // weekday (0=Sun .. 6=Sat) -> session id
  schedule: {
    1: "fullA", // Monday
    2: "run",   // Tuesday
    3: "fullB", // Wednesday
    4: "run",   // Thursday
    5: "fullA", // Friday  (alternates to B automatically on even weeks)
    6: "run",   // Saturday (longer easy run)
    0: "rest",  // Sunday
  },

  // default starting dumbbell load (kg, per hand unless noted). Conservative
  // on purpose for a comeback block — you can bump these in the app.
  defaultWeights: {
    goblet_squat: 12,
    floor_press: 10,
    incline_press: 9,
    rdl: 12,
    one_arm_row: 12,
    shoulder_press: 8,
    biceps_curl: 8,
    reverse_lunge: 8,
    renegade_row: 8,
    hip_thrust: 14,
    lateral_raise: 5,
    rear_delt_fly: 5,
    triceps_ext: 7,
    calf_raise: 12,
    plank: 0,
    russian_twist: 6,
  },

  // 5-week progression block (double progression + weekly set ramp + deload).
  // Evidence: hypertrophy keeps rising with weekly sets (Pelland 2025) and with
  // proximity to failure (Robinson 2024); a deload manages accumulated fatigue.
  block: {
    lengthWeeks: 5,
    weeks: [
      { label: "Re-introduction", setBonus: 0,  rir: "2–3", deload: false, note: "Ease back in and nail technique. Stop each set with 2–3 good reps left in the tank." },
      { label: "Build",           setBonus: 1,  rir: "2–3", deload: false, note: "Add a set where you can. Still leave 2–3 reps in reserve." },
      { label: "Build",           setBonus: 1,  rir: "1–2", deload: false, note: "Push a little closer to failure — 1–2 reps in reserve." },
      { label: "Peak",            setBonus: 2,  rir: "0–2", deload: false, note: "Hardest week. The last rep of each set should be a real grind." },
      { label: "Deload",          setBonus: -1, rir: "4–5", deload: true,  note: "Recovery week: lighter, fewer sets, well short of failure. This is when the growth actually happens." },
    ],
  },

  sessions: {
    fullA: {
      name: "Full Body A",
      focus: "Push • Quads • Shoulders",
      exercises: [
        { id: "incline_press", name: "DB Incline Press",        sets: 3, repLow: 8,  repHigh: 12, inc: 2, stretch: true, note: "Upper-chest focus. No bench? Prop your back on cushions for a slight incline. Lower fully for a deep chest stretch." },
        { id: "one_arm_row",   name: "One-Arm DB Row",          sets: 3, repLow: 10, repHigh: 12, inc: 2, stretch: true, note: "Brace a hand on a bench/chair. Let the dumbbell hang low for a full stretch, then pull to your hip. Builds the V-taper. (per arm)" },
        { id: "shoulder_press",name: "DB Shoulder Press",       sets: 3, repLow: 8,  repHigh: 12, inc: 2, note: "Seated or standing, press overhead without flaring the ribs." },
        { id: "lateral_raise", name: "DB Lateral Raise",        sets: 4, repLow: 12, repHigh: 20, inc: 1, note: "The #1 'capped shoulder' move. Light weight, controlled, lead with the elbows. Don't swing." },
        { id: "goblet_squat",  name: "Goblet Squat",            sets: 3, repLow: 10, repHigh: 15, inc: 2, stretch: true, note: "Hold one dumbbell at your chest. Sit deep between your heels, knees out — full depth grows more muscle." },
        { id: "biceps_curl",   name: "DB Biceps Curl",          sets: 3, repLow: 10, repHigh: 15, inc: 2, note: "Slow on the way down, full extension at the bottom. No swinging." },
        { id: "calf_raise",    name: "DB Standing Calf Raise",  sets: 3, repLow: 12, repHigh: 20, inc: 2, stretch: true, note: "Dumbbell(s) in hand, rise onto the toes and pause at the top, then sink heels low for a deep stretch." },
        { id: "plank",         name: "Plank",                   sets: 3, repLow: 30, repHigh: 60, inc: 0, unit: "sec", note: "Squeeze glutes, straight line head to heels. Tight midsection." },
      ],
    },
    fullB: {
      name: "Full Body B",
      focus: "Pull • Hinge • Arms",
      exercises: [
        { id: "floor_press",   name: "DB Floor Press",           sets: 3, repLow: 8,  repHigh: 12, inc: 2, stretch: true, note: "Second weekly chest hit. Lie down, lower until the upper arms touch the floor, then press." },
        { id: "renegade_row",  name: "Renegade Row",            sets: 3, repLow: 8,  repHigh: 12, inc: 2, note: "Push-up position on dumbbells, row one at a time. Keep the hips still — back + core. (per arm)" },
        { id: "rdl",           name: "DB Romanian Deadlift",    sets: 3, repLow: 10, repHigh: 12, inc: 2, stretch: true, note: "Soft knees, push the hips back until you feel a strong hamstring stretch. Flat back, then drive up." },
        { id: "reverse_lunge", name: "DB Reverse Lunge",        sets: 3, repLow: 10, repHigh: 12, inc: 2, stretch: true, note: "Dumbbell in each hand, step back and sink the back knee low. Shapes legs & glutes. (per leg)" },
        { id: "lateral_raise", name: "DB Lateral Raise",        sets: 3, repLow: 12, repHigh: 20, inc: 1, note: "Second weekly shoulder hit — shoulders respond well to frequency. Controlled, lead with the elbows." },
        { id: "rear_delt_fly", name: "DB Rear-Delt Fly",        sets: 3, repLow: 12, repHigh: 20, inc: 1, note: "Hinge over, raise dumbbells out to the sides. Rounds out the shoulders & fixes posture." },
        { id: "triceps_ext",   name: "DB Overhead Triceps Ext", sets: 3, repLow: 10, repHigh: 15, inc: 2, stretch: true, note: "Both hands on one dumbbell, lower it behind your head for a deep stretch. Triceps are most of the arm." },
        { id: "russian_twist", name: "Russian Twist",           sets: 3, repLow: 20, repHigh: 30, inc: 1, unit: "reps", note: "Hold a dumbbell, rotate side to side. Count both sides. Obliques / tight waist." },
      ],
    },
    run: {
      name: "Run / Cardio",
      focus: "Aerobic base",
      cardio: true,
      note: "Keep most runs easy (zone 2) — great for staying lean and revealing the muscle, without burning recovery you need for lifting. One faster session a week is plenty.",
      options: [
        "Easy run 30–40 min (can hold a conversation)",
        "Tempo: 10 min easy + 15 min comfortably hard + 5 min easy",
        "Intervals: 6 × 1 min hard / 2 min easy",
        "Long easy run 45–70 min (weekend)",
        "Brisk walk + mobility if legs are tired",
      ],
    },
    rest: {
      name: "Rest day",
      focus: "Recover",
      rest: true,
      note: "Full rest or a gentle walk and some stretching. Recovery is when you actually adapt — don't skip it.",
    },
  },
};

// Public-domain exercise photographs and adapted form instructions from
// yuhonas/free-exercise-db (The Unlicense). Images are bundled locally so the
// guides remain available when this PWA is offline.
const FORM_GUIDES = {
  incline_press: {
    sourceId: "Incline_Dumbbell_Press",
    steps: [
      "Set the bench to a low incline. Plant both feet and keep your upper back against the bench.",
      "Start with the dumbbells beside your upper chest, wrists stacked over elbows.",
      "Press up without bouncing the weights together, then lower slowly through a comfortable full range.",
    ],
  },
  one_arm_row: {
    sourceId: "One-Arm_Dumbbell_Row",
    steps: [
      "Brace one hand and the same-side knee on a bench or sturdy chair; keep your back flat.",
      "Let the working arm hang, then pull the dumbbell toward your hip while keeping your torso still.",
      "Squeeze your back briefly and lower under control to a full stretch before repeating.",
    ],
  },
  shoulder_press: {
    sourceId: "Dumbbell_Shoulder_Press",
    steps: [
      "Sit with back support or stand tall; hold the dumbbells at shoulder height.",
      "Brace your stomach and press overhead without leaning back or flaring your ribs.",
      "Finish with arms overhead, then lower slowly until the dumbbells return to shoulder level.",
    ],
  },
  lateral_raise: {
    sourceId: "Side_Lateral_Raise",
    steps: [
      "Stand tall with light dumbbells by your sides and keep a soft bend in your elbows.",
      "Raise your arms out to the sides, leading with the elbows and keeping your torso still.",
      "Stop around shoulder height and lower slowly; avoid shrugging or swinging.",
    ],
  },
  goblet_squat: {
    sourceId: "Goblet_Squat",
    steps: [
      "Hold one dumbbell vertically at your chest and stand around shoulder width.",
      "Brace, sit down between your hips, and let your knees track in line with your toes.",
      "Descend only while your heels and posture stay controlled, then drive through your whole foot to stand.",
    ],
  },
  biceps_curl: {
    sourceId: "Dumbbell_Bicep_Curl",
    steps: [
      "Stand tall with palms forward and elbows close to your sides.",
      "Curl without moving your upper arms or swinging your torso.",
      "Squeeze briefly at the top, then lower all the way under control.",
    ],
  },
  calf_raise: {
    sourceId: "Standing_Dumbbell_Calf_Raise",
    steps: [
      "Hold the dumbbells at your sides and place the balls of your feet on a stable step if available.",
      "Rise as high as you can onto your toes and pause while squeezing your calves.",
      "Lower slowly until your heels are beneath the step for a controlled stretch.",
    ],
  },
  plank: {
    sourceId: "Plank",
    steps: [
      "Place elbows beneath shoulders and support yourself on forearms and toes.",
      "Brace your stomach and squeeze your glutes so your head, hips, and heels form one line.",
      "Breathe normally and stop when your hips sag or your lower back takes over.",
    ],
  },
  floor_press: {
    sourceId: "Dumbbell_Floor_Press",
    steps: [
      "Lie on the floor with bent knees and hold the dumbbells above your chest.",
      "Lower with control until your upper arms gently contact the floor; keep wrists over elbows.",
      "Pause without bouncing, then press the dumbbells back up while keeping your shoulders stable.",
    ],
  },
  renegade_row: {
    sourceId: "Alternating_Renegade_Row",
    steps: [
      "Take a high-plank position with hands on dumbbells and feet wider than shoulder width.",
      "Brace hard, push one dumbbell into the floor, and row the other toward your hip.",
      "Keep hips facing the floor, lower slowly, and alternate sides. Use knees down if needed.",
    ],
  },
  rdl: {
    sourceId: "Stiff-Legged_Dumbbell_Deadlift",
    steps: [
      "Stand tall with dumbbells in front of your thighs and keep a slight, fixed bend in your knees.",
      "Push your hips backward while keeping the weights close and your spine neutral.",
      "Stop at a strong hamstring stretch before your back rounds, then drive your hips forward to stand.",
    ],
  },
  reverse_lunge: {
    sourceId: "Dumbbell_Rear_Lunge",
    steps: [
      "Stand tall with dumbbells at your sides and brace your torso.",
      "Step one leg backward and lower until both knees are comfortably bent; keep the front foot planted.",
      "Drive through the front foot to return, keeping the front knee aligned with its toes.",
    ],
  },
  rear_delt_fly: {
    sourceId: "Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench",
    steps: [
      "Hinge forward with a flat back; lightly support your forehead on a bench if available.",
      "With softly bent elbows, raise the dumbbells out to the sides rather than pulling them backward.",
      "Stop around shoulder height, squeeze the rear shoulders, and lower slowly without swinging.",
    ],
  },
  triceps_ext: {
    sourceId: "Standing_Dumbbell_Triceps_Extension",
    steps: [
      "Hold one dumbbell securely with both hands overhead and brace your torso.",
      "Keep upper arms close to your head while bending only the elbows to lower the weight behind you.",
      "Stop at a comfortable stretch, then straighten your elbows without arching your back.",
    ],
  },
  russian_twist: {
    sourceId: "Russian_Twist",
    steps: [
      "Sit with knees bent, lean back slightly, and keep your spine long and chest lifted.",
      "Hold the dumbbell close and rotate your rib cage—not just your hands—from side to side.",
      "Move slowly and use a lighter weight if your lower back rounds or feels strained.",
    ],
  },
};

// Which full-body session runs on a Friday flips each ISO week so you don't
// always do A twice and B once.
function resolveSession(date) {
  const dow = date.getDay();
  let id = PROGRAM.schedule[dow];
  if (id === "fullA" && dow === 5) {
    // even ISO week -> swap Friday to B for balance
    const week = isoWeek(date);
    if (week % 2 === 0) id = "fullB";
  }
  return id;
}

function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

if (typeof window !== "undefined") {
  window.PROGRAM = PROGRAM;
  window.FORM_GUIDES = FORM_GUIDES;
  window.resolveSession = resolveSession;
}
