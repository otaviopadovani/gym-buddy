/*
 * Dumbbell-focused training program.
 * Built around a returning lifter who already has decent cardio (10k runner).
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
    rdl: 12,
    one_arm_row: 12,
    shoulder_press: 8,
    biceps_curl: 8,
    reverse_lunge: 8,
    renegade_row: 8,
    stiff_leg_dl: 12,
    lateral_raise: 5,
    triceps_ext: 7,
    hammer_curl: 8,
    plank: 0,
    russian_twist: 6,
    calf_raise: 12,
  },

  sessions: {
    fullA: {
      name: "Full Body A",
      focus: "Squat • Push • Pull",
      exercises: [
        { id: "goblet_squat",  name: "Goblet Squat",            sets: 3, repLow: 8,  repHigh: 12, inc: 2, note: "Hold one dumbbell at your chest. Sit between your heels, knees out." },
        { id: "floor_press",   name: "DB Floor / Bench Press",  sets: 3, repLow: 8,  repHigh: 12, inc: 2, note: "Lie down, press both dumbbells up. Lower until upper arms touch the floor." },
        { id: "one_arm_row",   name: "One-Arm DB Row",          sets: 3, repLow: 8,  repHigh: 12, inc: 2, note: "Brace a hand on a bench/chair. Pull the dumbbell to your hip. (per arm)" },
        { id: "shoulder_press",name: "DB Shoulder Press",       sets: 3, repLow: 8,  repHigh: 12, inc: 2, note: "Seated or standing, press overhead without flaring the ribs." },
        { id: "biceps_curl",   name: "DB Biceps Curl",          sets: 2, repLow: 10, repHigh: 15, inc: 2, note: "Slow on the way down, no swinging." },
        { id: "plank",         name: "Plank",                   sets: 3, repLow: 30, repHigh: 60, inc: 0, unit: "sec", note: "Squeeze glutes, straight line head to heels." },
      ],
    },
    fullB: {
      name: "Full Body B",
      focus: "Lunge • Push • Pull",
      exercises: [
        { id: "reverse_lunge", name: "DB Reverse Lunge",        sets: 3, repLow: 8,  repHigh: 12, inc: 2, note: "A dumbbell in each hand, step back and down. (per leg)" },
        { id: "stiff_leg_dl",  name: "DB Romanian Deadlift",    sets: 3, repLow: 8,  repHigh: 12, inc: 2, note: "Soft knees, push hips back, feel the hamstrings. Flat back." },
        { id: "renegade_row",  name: "Renegade Row",            sets: 3, repLow: 6,  repHigh: 10, inc: 2, note: "Push-up position on dumbbells, row one at a time. Hips still. (per arm)" },
        { id: "lateral_raise", name: "DB Lateral Raise",        sets: 3, repLow: 12, repHigh: 18, inc: 1, note: "Raise to shoulder height, lead with the elbows." },
        { id: "triceps_ext",   name: "DB Overhead Triceps Ext", sets: 2, repLow: 10, repHigh: 15, inc: 2, note: "Both hands on one dumbbell, lower behind the head." },
        { id: "russian_twist", name: "Russian Twist",           sets: 3, repLow: 20, repHigh: 30, inc: 1, unit: "reps", note: "Hold a dumbbell, rotate side to side. Count both sides." },
      ],
    },
    run: {
      name: "Run / Cardio",
      focus: "Aerobic base",
      cardio: true,
      note: "Easy conversational pace. You can run 10k, so keep most runs easy (zone 2). Add one faster session a week only if recovery is good.",
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
  window.resolveSession = resolveSession;
}
