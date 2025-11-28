const CACHE_NAME = "portfolio-shell-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./apps/estimate-calculator.html",
  "./apps/contractor-estimator.html",
  "./apps/notary-intake.html",
  "./apps/app-template.html",
  "./blog/index.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null)))
      )
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      caches.match(request).then((cachedPage) => {
        if (cachedPage) return cachedPage;
        return fetch(request).catch(() => caches.match("./index.html"));
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
    )
  );
});
