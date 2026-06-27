/*
 * Claw Services public-cache service worker.
 * Deny-by-default: only safe same-origin GET resources are cached.
 * Bump CACHE_VERSION when cache policy or cached public payload shape changes.
 */
const CACHE_VERSION = "claw-cache-v2";
const STATIC_CACHE = `${CACHE_VERSION}:static`;
const CONTENT_CACHE = `${CACHE_VERSION}:content`;
const PAGE_CACHE = `${CACHE_VERSION}:pages`;
const CURRENT_CACHES = new Set([STATIC_CACHE, CONTENT_CACHE, PAGE_CACHE]);

const MAX_AGE = {
  immutable: 365 * 24 * 60 * 60 * 1000,
  publicAsset: 7 * 24 * 60 * 60 * 1000,
  landingApi: 24 * 60 * 60 * 1000,
  pageFallback: 60 * 60 * 1000,
};

const MAX_ENTRIES = {
  static: 120,
  content: 40,
  pages: 6,
};

const PRECACHE_PAGES = ["/", "/portal"];
const PRECACHE_PUBLIC_ASSETS = [
  "/favicon.ico",
  "/brand/claw-services-logo.svg",
  "/brand/claw-services-mark.svg",
];
const PRECACHE_CONTENT = ["/api/landing"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      cacheUrls(PAGE_CACHE, PRECACHE_PAGES, MAX_ENTRIES.pages),
      cacheUrls(STATIC_CACHE, PRECACHE_PUBLIC_ASSETS, MAX_ENTRIES.static),
      cacheUrls(CONTENT_CACHE, PRECACHE_CONTENT, MAX_ENTRIES.content),
    ]).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      cleanupOldCaches(),
      deleteExpiredEntries(STATIC_CACHE, MAX_AGE.publicAsset),
      deleteExpiredEntries(CONTENT_CACHE, MAX_AGE.landingApi),
      deleteExpiredEntries(PAGE_CACHE, MAX_AGE.pageFallback),
    ]).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (shouldBypass(request)) return;

  const url = new URL(request.url);

  if (isImmutableBuildAsset(url)) {
    event.respondWith(cacheFirst(event, STATIC_CACHE, MAX_ENTRIES.static));
    return;
  }

  if (isPublicAsset(url)) {
    event.respondWith(
      staleWhileRevalidate(event, STATIC_CACHE, MAX_AGE.publicAsset, MAX_ENTRIES.static),
    );
    return;
  }

  if (isLandingApi(url)) {
    event.respondWith(
      staleWhileRevalidate(event, CONTENT_CACHE, MAX_AGE.landingApi, MAX_ENTRIES.content),
    );
    return;
  }

  if (isPublicPage(url, request)) {
    event.respondWith(networkFirstPage(event));
  }
});

function shouldBypass(request) {
  if (request.method !== "GET") return true;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return true;

  if (
    request.headers.has("authorization") ||
    request.headers.has("cookie") ||
    request.credentials === "include"
  ) {
    return true;
  }

  if (url.pathname.startsWith("/api/") && !isLandingApi(url)) return true;
  if (url.pathname.startsWith("/_next/data/") || url.pathname.startsWith("/_next/image")) return true;

  const forbiddenPrefixes = [
    "/account",
    "/admin",
    "/auth",
    "/customer",
    "/customers",
    "/dashboard",
    "/delivery",
    "/login",
    "/tenant",
    "/tenants",
  ];

  return forbiddenPrefixes.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
}

function isImmutableBuildAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isPublicAsset(url) {
  return (
    url.pathname === "/favicon.ico" ||
    url.pathname.startsWith("/brand/") ||
    url.pathname.startsWith("/stock/")
  );
}

function isLandingApi(url) {
  return url.pathname === "/api/landing";
}

function isPublicPage(url, request) {
  const isPagePath = url.pathname === "/" || url.pathname === "/portal";
  return isPagePath && (request.mode === "navigate" || request.destination === "document");
}

function normalizedCacheKey(request) {
  const url = new URL(request.url || request, self.location.origin);
  if (!url.pathname.startsWith("/_next/static/")) {
    url.search = "";
  }
  url.hash = "";
  return new Request(url.toString(), { method: "GET" });
}

function freshRequest(request) {
  return new Request(request, { cache: "no-cache" });
}

async function cacheUrls(cacheName, urls, maxEntries) {
  const cache = await caches.open(cacheName);
  await Promise.allSettled(
    urls.map(async (url) => {
      const request = new Request(new URL(url, self.location.origin).toString(), {
        method: "GET",
        credentials: "same-origin",
        cache: "no-cache",
      });
      const response = await fetch(request);
      if (canCacheResponse(response)) {
        await putStamped(cache, normalizedCacheKey(request), response, maxEntries);
      }
    }),
  );
}

async function cacheFirst(event, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const key = normalizedCacheKey(event.request);
  const cached = await cache.match(key);
  if (cached) return cached;

  const response = await fetch(freshRequest(event.request));
  if (canCacheResponse(response)) {
    event.waitUntil(putStamped(cache, key, response.clone(), maxEntries));
  }
  return response;
}

async function staleWhileRevalidate(event, cacheName, maxAgeMs, maxEntries) {
  const cache = await caches.open(cacheName);
  const key = normalizedCacheKey(event.request);
  const cached = await cache.match(key);
  const refresh = fetch(freshRequest(event.request)).then(async (response) => {
    if (canCacheResponse(response)) {
      await putStamped(cache, key, response.clone(), maxEntries);
    }
    return response;
  });

  if (cached && isFresh(cached, maxAgeMs)) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }

  try {
    return await refresh;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

async function networkFirstPage(event) {
  const cache = await caches.open(PAGE_CACHE);
  const key = normalizedCacheKey(event.request);

  try {
    const response = await fetch(freshRequest(event.request));
    if (canCacheResponse(response)) {
      event.waitUntil(putStamped(cache, key, response.clone(), MAX_ENTRIES.pages));
    }
    return response;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached && isFresh(cached, MAX_AGE.pageFallback)) return cached;
    throw error;
  }
}

function canCacheResponse(response) {
  if (!response || !response.ok || response.redirected) return false;
  if (response.type !== "basic") return false;

  const cacheControl = response.headers.get("cache-control") || "";
  if (/\bno-store\b/i.test(cacheControl)) return false;
  if (response.headers.has("set-cookie")) return false;

  return true;
}

async function putStamped(cache, key, response, maxEntries) {
  const headers = new Headers(response.headers);
  headers.set("X-Claw-Cached-At", Date.now().toString());

  const body = await response.clone().blob();
  const stamped = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  await cache.put(key, stamped);
  await trimCache(cache, maxEntries);
}

function cachedAt(response) {
  const stamp = Number(response.headers.get("X-Claw-Cached-At") || 0);
  return Number.isFinite(stamp) ? stamp : 0;
}

function isFresh(response, maxAgeMs) {
  const stamp = cachedAt(response);
  return stamp > 0 && Date.now() - stamp <= maxAgeMs;
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;

  const entries = await Promise.all(
    keys.map(async (request) => [request, await cache.match(request)]),
  );

  entries.sort((a, b) => cachedAt(a[1]) - cachedAt(b[1]));
  await Promise.all(entries.slice(0, keys.length - maxEntries).map(([request]) => cache.delete(request)));
}

async function deleteExpiredEntries(cacheName, maxAgeMs) {
  const cache = await caches.open(cacheName);
  const entries = await Promise.all(
    (await cache.keys()).map(async (request) => [request, await cache.match(request)]),
  );

  await Promise.all(
    entries
      .filter(([, response]) => !response || !isFresh(response, maxAgeMs))
      .map(([request]) => cache.delete(request)),
  );
}

async function cleanupOldCaches() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith("claw-cache-") && !CURRENT_CACHES.has(name))
      .map((name) => caches.delete(name)),
  );
}
