/**
 * js/app.js
 * Entry point. Fast-paths #/map cold start (deferring the archive JSON fetches and the legacy
 * copperplate engine until after the map `idle`), routes the archive views (lobby, categories,
 * entry reader, search, novel reader, investigation game, exhibition hall) and enforces zero
 * inline event attributes.
 */
import { initRouter, pushChapterHash } from "./router.js";

let earthController = null;
let earthInitPromise = null;
let archiveMountPromise = null;
let archiveMounted = false;
let routeToken = 0;

// ---------------------------------------------------------------------------------------------
// Shared fetch caches and the `ctx` object handed to every view renderer
// ---------------------------------------------------------------------------------------------
const fetchCache = new Map();
function cachedFetch(rel, kind) {
  const key = `${kind}:${rel}`;
  if (!fetchCache.has(key)) {
    const p = fetch("./" + String(rel).replace(/^\.?\//, ""))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${rel}`);
        return kind === "text" ? r.text() : r.json();
      })
      .catch((err) => {
        fetchCache.delete(key);
        throw err;
      });
    fetchCache.set(key, p);
  }
  return fetchCache.get(key);
}
const getManifest = () => cachedFetch("data/manifest.json", "json");
const fetchJson = (rel) => cachedFetch(rel, "json");
const fetchText = (rel) => cachedFetch(rel, "text");
async function fetchEntry(id) {
  const manifest = await getManifest();
  const item = (manifest.entries || []).find((e) => e.id === id);
  if (!item) throw new Error(`Unknown entry ${id}`);
  return fetchJson(item.path);
}

let ctxPromise = null;
function getCtx() {
  if (!ctxPromise) {
    ctxPromise = Promise.all([import("./clearance.js"), import("./autolink.js")]).then(
      ([clearance, autolink]) => {
        let autolinkIndexPromise = null;
        const getAutolinkIndex = () => {
          if (!autolinkIndexPromise) {
            autolinkIndexPromise = getManifest().then((m) => autolink.buildAutolinkIndex(m.entries || []));
          }
          return autolinkIndexPromise;
        };
        autolink.initEntryPreviewPopover({
          getManifestEntry: async (id) => ((await getManifest()).entries || []).find((e) => e.id === id) || null,
          fetchEntry,
        });
        return {
          getManifest,
          getAutolinkIndex,
          fetchEntry,
          fetchJson,
          fetchText,
          clearance,
          autolink,
          navigate: (hash) => {
            window.location.hash = hash;
          },
          openPantheonIndex: async (idx) => {
            window.switchLiber("pantheon", true);
            if (typeof window.selectPantheon === "function") window.selectPantheon(Number(idx) || 0);
          },
          activateAstrolabe: async (cityId, cam) => {
            window.switchLiber("gallery", true);
            if (cityId && typeof window.__astrolabeFocus === "function") window.__astrolabeFocus(cityId, cam);
          },
          startLegacyCinema: () => {},
          stopLegacyCinema: () => {},
        };
      }
    );
  }
  return ctxPromise;
}

let p2p3CssPromise = null;
function ensureP2P3Css() {
  if (!p2p3CssPromise) {
    p2p3CssPromise = Promise.all(
      ["./css/wiki-v2.css", "./css/p3-modules.css"].map(
        (href) =>
          new Promise((resolve) => {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = href;
            link.onload = link.onerror = () => resolve();
            document.head.appendChild(link);
          })
      )
    );
  }
  return p2p3CssPromise;
}

// ---------------------------------------------------------------------------------------------
// Delegated handlers (zero inline onclick)
// ---------------------------------------------------------------------------------------------
document.addEventListener("click", (e) => {
  const redact = e.target.closest(".scp-redact");
  if (redact && !redact.hasAttribute("data-redact-key")) {
    redact.classList.toggle("revealed");
    return;
  }
  const backBtn = e.target.closest("[data-history-back]");
  if (backBtn) {
    e.preventDefault();
    history.back();
    return;
  }
  // Early fallback nav handler before legacy-engine finishes mounting
  if (!archiveMounted) {
    const navBtn = e.target.closest(".liber-nav-btn[data-liber]");
    if (navBtn) window.location.hash = "#/" + navBtn.dataset.liber;
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    const redact = e.target.closest(".scp-redact");
    if (redact && !redact.hasAttribute("data-redact-key")) {
      e.preventDefault();
      redact.classList.toggle("revealed");
    }
  }
});

const CORNER_LATIN = {
  home: "ATRIVM — INDEX",
  prologus: "PROLOGVS — INDEX",
  map: "LIBER I — DE TERRA",
  pantheon: "LIBER II — NVMEN",
  scp: "LIBER III — ARCANVM",
  architectura: "LIBER IV — LOCI",
  oraculum: "LIBER V — ORACVLVM",
  gallery: "LIBER VI — SPHAERA",
  exhibit: "LIBER VI — SPHAERA",
  colophon: "COLOPHON — LICENTIA",
  entry: "CODEX — FOLIVM",
  category: "CATALOGVS — ARCHIVI",
  search: "INQVISITIO",
  novel: "FABVLAE — LIBRI",
  play: "PROBATIO — GRADVS",
};
const STAGE_OF = {
  home: "stage-home",
  category: "stage-category",
  search: "stage-search",
  novel: "stage-novel",
  play: "stage-play",
};
// Which top-nav button stays lit for each view
const NAV_GROUP = {
  entry: "category",
  scp: "category",
  architectura: "category",
  oraculum: "search",
  prologus: "home",
  pantheon: "gallery",
  exhibit: "gallery",
};

function setNavActive(view) {
  const name = NAV_GROUP[view] || view;
  document.querySelectorAll(".liber-nav-btn[data-liber]").forEach((b) => b.classList.toggle("active", b.dataset.liber === name));
}

function basicSwitchStage(view) {
  document.body.setAttribute("data-view", view);
  const tr = document.getElementById("corner-tr");
  if (tr) tr.textContent = CORNER_LATIN[view] || "LIBER I — DE TERRA";
  setNavActive(view);
  document.querySelectorAll(".chapter-stage, #stage-map").forEach((el) => {
    const id = el.id.replace(/^stage-/, "");
    el.classList.toggle("open", id === view);
  });
}

async function ensureEarthController() {
  if (earthController) return earthController;
  if (!earthInitPromise) {
    earthInitPromise = import("./realistic-map.js").then((mod) =>
      mod.createRealisticEarthController({
        onOpenEntry(entryId) {
          window.location.hash = `#/entry/${encodeURIComponent(entryId)}`;
        },
      })
    );
  }
  earthController = await earthInitPromise;
  return earthController;
}

async function loadAndMountArchive() {
  const [{ PANTHEON_SIGILS, CITY_SIGILS }, { mountArchiveEngine }, manifest] = await Promise.all([
    import("./sigils.js"),
    import("./legacy-engine.js"),
    getManifest(),
  ]);

  const detailed = await Promise.all(manifest.entries.map((item) => fetchJson(item.path)));

  const entities = detailed
    .filter((d) => d.category === "entities")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((d) => ({
      roman: d.code,
      sym: PANTHEON_SIGILS[d.artType] || PANTHEON_SIGILS.cthulhu,
      latin: d.latin,
      condensed: d.condensed,
      fig: d.fig,
      sub: d.sub,
      lore: d.summary,
      scripture: d.scripture,
      metrics: d.metrics,
      stats: d.stats,
      artType: d.artType,
      city: d.legacyCityId,
      cam: d.cam,
    }));

  const scpFiles = detailed
    .filter((d) => d.category === "scp")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((d) => ({
      id: d.id,
      cat: d.subCat,
      badge: d.badge,
      code: d.code,
      title: d.title,
      authorCredit: d.authorCredit,
      hume: d.hume,
      city: d.legacyCityId,
      summary: d.summary,
      proc: d.proc,
      log: d.log,
      infobox: d.infobox,
    }));

  const cityOrder = [
    "rlyeh", "alexandria", "site2000", "gate001", "prague", "site13",
    "cairo", "antarctica", "penglai", "baikal", "arkham", "leng",
  ];
  const seenLegacy = new Set();
  const cities = detailed
    .filter((d) => d.category === "sites" && cityOrder.includes(d.legacyCityId))
    .filter((d) => {
      if (seenLegacy.has(d.legacyCityId)) return false;
      seenLegacy.add(d.legacyCityId);
      return true;
    })
    .sort((a, b) => cityOrder.indexOf(a.legacyCityId) - cityOrder.indexOf(b.legacyCityId))
    .map((d) => ({
      id: d.legacyCityId,
      entryId: d.id,
      roman: d.code,
      name: d.title,
      short: d.short,
      lat: d.geo.lat,
      lon: d.geo.lon,
      type: d.type,
      glyph: CITY_SIGILS[d.legacyCityId] || CITY_SIGILS.alexandria,
      style: d.style,
      hasRiver: d.hasRiver,
      hasWaterfall: d.hasWaterfall,
      mountainRing: d.mountainRing,
      tag: d.code,
      coords: d.coordsText,
      motto: d.motto,
      desc: d.summary,
      terrain: d.terrain,
      arch: d.arch,
      crowd: d.crowd,
      god: d.god,
    }));

  const factions = detailed
    .filter((d) => d.category === "goi")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((d) => ({
      id: d.id,
      name: d.title,
      code: d.code,
      badge: d.badge,
      desc: d.summary,
      city: d.legacyCityId,
    }));

  const aicKb = detailed
    .filter((d) => d.category === "codices")
    .map((d) => ({
      id: d.id,
      title: d.title,
      keys: d.aliases,
      summary: d.summary,
    }));

  mountArchiveEngine({ PANTHEON: entities, SCP_FILES: scpFiles, CITIES: cities, FACTIONS: factions, AIC_KB: aicKb });
  archiveMounted = true;
  window.__archiveReady = true;
}

function ensureArchiveMounted() {
  if (!archiveMountPromise) {
    archiveMountPromise = loadAndMountArchive();
  }
  return archiveMountPromise;
}

async function renderArchiveView(view, rest, token) {
  window.switchLiber(view === "gallery" ? "gallery" : view, true);
  const [ctx] = await Promise.all([getCtx(), ensureP2P3Css()]);
  if (token !== routeToken) return;
  const [pathPart, ...q] = String(rest || "").split("?");
  const query = q.length ? "?" + q.join("?") : "";

  if (view === "entry") {
    const { renderEntryView } = await import("./views/entry.js");
    if (token !== routeToken) return;
    let id = pathPart.replace(/\/+$/, "");
    try { id = decodeURIComponent(id); } catch (_) {}
    await renderEntryView(document.getElementById("entry-detail-root"), id, ctx);
    return;
  }
  if (view === "home") {
    const { renderHomeView } = await import("./views/home.js");
    if (token !== routeToken) return;
    await renderHomeView(document.getElementById("home-root"), ctx);
  } else if (view === "category") {
    const { renderCategoryView } = await import("./views/category.js");
    if (token !== routeToken) return;
    await renderCategoryView(document.getElementById("category-root"), pathPart.replace(/\/+$/, ""), query, ctx);
  } else if (view === "search") {
    const { renderSearchView } = await import("./views/search.js");
    if (token !== routeToken) return;
    await renderSearchView(document.getElementById("search-root"), query || pathPart, ctx);
  } else if (view === "novel") {
    const { renderNovelView } = await import("./views/novel-reader.js");
    if (token !== routeToken) return;
    await renderNovelView(document.getElementById("novel-root"), pathPart, ctx);
  } else if (view === "play") {
    const { renderPlayView } = await import("./views/play-game.js");
    if (token !== routeToken) return;
    await renderPlayView(document.getElementById("play-root"), pathPart, ctx);
  }
  const stage = document.getElementById(STAGE_OF[view]);
  if (stage) stage.scrollTop = 0;
}

async function renderGallery(rest, token) {
  const ctx = await getCtx();
  await ensureP2P3Css();
  if (token !== routeToken) return;
  const room = String(rest || "").split(/[/?]/)[0].toLowerCase();
  const custom = document.getElementById("stage-gallery-custom");
  if (room === "timeline" || room === "cinema") {
    window.switchLiber("exhibit", true);
    if (custom) custom.style.display = "";
  }
  const { renderGalleryView } = await import("./views/gallery.js");
  if (token !== routeToken) return;
  await renderGalleryView(custom, rest, ctx);
}

initRouter(async ({ view, rest }) => {
  const token = ++routeToken;
  if (view === "map") {
    if (archiveMounted) {
      window.switchLiber("map", true);
    } else {
      basicSwitchStage("map");
    }
    setNavActive("map");
    const ctrl = await ensureEarthController();
    ctrl.applySubRoute(rest);
    if (!archiveMountPromise) {
      let triggered = false;
      const startArchive = () => {
        if (triggered) return;
        triggered = true;
        ensureArchiveMounted();
      };
      ctrl.map.once("idle", startArchive);
      setTimeout(startArchive, 4500);
    }
    return;
  }

  await ensureArchiveMounted();
  if (token !== routeToken) return;
  if (view === "gallery") {
    await renderGallery(rest, token);
  } else if (STAGE_OF[view] || view === "entry") {
    await renderArchiveView(view, rest, token);
  } else {
    window.switchLiber(view, true);
  }
  setNavActive(view);
});
