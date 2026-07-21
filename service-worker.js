/* Gym Buddy service worker — offline caching + notification clicks */
const CACHE = "gym-buddy-v9";
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

// Only handle this app's files. External APIs (for example Open Food Facts)
// must return their own response/errors rather than an offline HTML fallback.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations and code are network-first so an installed PWA can refresh to
  // the newest GitHub Pages deployment. Exercise photos remain cache-first.
  const isImage = req.destination === "image";
  if (isImage) {
    e.respondWith(cacheFirst(req));
  } else {
    e.respondWith(networkFirst(req, req.mode === "navigate"));
  }
});

async function networkFirst(req, isNavigation) {
  try {
    const response = await fetch(req);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(req, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    if (isNavigation) return caches.match("./index.html");
    return Response.error();
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const response = await fetch(req);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(req, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
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
