/* Gym Buddy service worker — offline caching + notification clicks */
const CACHE = "gym-buddy-v8";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./program.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./assets/exercises/incline_press-0.jpg",
  "./assets/exercises/incline_press-1.jpg",
  "./assets/exercises/one_arm_row-0.jpg",
  "./assets/exercises/one_arm_row-1.jpg",
  "./assets/exercises/shoulder_press-0.jpg",
  "./assets/exercises/shoulder_press-1.jpg",
  "./assets/exercises/lateral_raise-0.jpg",
  "./assets/exercises/lateral_raise-1.jpg",
  "./assets/exercises/goblet_squat-0.jpg",
  "./assets/exercises/goblet_squat-1.jpg",
  "./assets/exercises/biceps_curl-0.jpg",
  "./assets/exercises/biceps_curl-1.jpg",
  "./assets/exercises/calf_raise-0.jpg",
  "./assets/exercises/calf_raise-1.jpg",
  "./assets/exercises/plank-0.jpg",
  "./assets/exercises/plank-1.jpg",
  "./assets/exercises/floor_press-0.jpg",
  "./assets/exercises/floor_press-1.jpg",
  "./assets/exercises/renegade_row-0.jpg",
  "./assets/exercises/renegade_row-1.jpg",
  "./assets/exercises/rdl-0.jpg",
  "./assets/exercises/rdl-1.jpg",
  "./assets/exercises/reverse_lunge-0.jpg",
  "./assets/exercises/reverse_lunge-1.jpg",
  "./assets/exercises/rear_delt_fly-0.jpg",
  "./assets/exercises/rear_delt_fly-1.jpg",
  "./assets/exercises/triceps_ext-0.jpg",
  "./assets/exercises/triceps_ext-1.jpg",
  "./assets/exercises/russian_twist-0.jpg",
  "./assets/exercises/russian_twist-1.jpg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// cache-first for app assets, network fallback
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});

// focus/open the app when a reminder is tapped
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});

// best-effort daily reminder check via periodic background sync (where supported)
self.addEventListener("periodicsync", (e) => {
  if (e.tag === "gym-buddy-reminders") {
    // The page reschedules precise timers; this just keeps the SW warm.
  }
});
