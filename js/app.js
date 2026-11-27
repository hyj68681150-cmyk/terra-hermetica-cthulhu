/**
 * js/app.js
 * Entry point: fast-paths #/map cold start (deferring 44 archive JSON fetches
 * and legacy copperplate engine until after map `idle`), handles #/entry/<id>,
 * and enforces zero inline `onclick` attributes.
 */
import { escapeHtml, renderSafeMarkup } from "./sanitize.js";
import { initRouter, parseHashRoute, pushChapterHash } from "./router.js";

let allDetailedEntries = [];
let earthController = null;
let earthInitPromise = null;
let archiveMountPromise = null;
let archiveMounted = false;

// Delegated click & keyboard handler for .scp-redact and [data-history-back] (zero inline onclick)
document.addEventListener("click", (e) => {
  const redact = e.target.closest(".scp-redact");
  if (redact) {
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
    if (navBtn) {
      pushChapterHash(navBtn.dataset.liber);
    }
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    const redact = e.target.closest(".scp-redact");
    if (redact) {
      e.preventDefault();
      redact.classList.toggle("revealed");
    }
  }
});

const CORNER_LATIN = {"prologus":"PROLOGVS — INDEX","map":"LIBER I — DE TERRA","pantheon":"LIBER II — NVMEN","scp":"LIBER III — ARCANVM","architectura":"LIBER IV — LOCI","oraculum":"LIBER V — ORACVLVM","gallery":"LIBER VI — SPHAERA","colophon":"COLOPHON — LICENTIA","entry":"CODEX — FOLIVM"};
function basicSwitchStage(view) {
  const name = view === "terra" ? "gallery" : view;
  document.body.setAttribute("data-view", name);
  const tr = document.getElementById("corner-tr");
  if (tr) tr.textContent = CORNER_LATIN[name] || "LIBER I — DE TERRA";
  document.querySelectorAll(".liber-nav-btn[data-liber]").forEach((b) =>
    b.classList.toggle("active", b.dataset.liber === name)
  );
  ["prologus", "map", "pantheon", "scp", "architectura", "oraculum", "colophon", "entry"].forEach((st) => {
    const el = document.getElementById(`stage-${st}`);
    if (el) el.classList.toggle("open", name === st);
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

function formatEntryCoord(geo) {
  if (!geo) return "";
  const digits = geo.precision === "exact" ? 4 : 1;
  const ns = geo.lat >= 0 ? "N" : "S";
  const ew = geo.lon >= 0 ? "E" : "W";
  return `${Math.abs(geo.lat).toFixed(digits)}°${ns}, ${Math.abs(geo.lon).toFixed(digits)}°${ew}`;
}

function renderEntryDetailView(entryId) {
  const root = document.getElementById("entry-detail-root");
  if (!root) return;
  const item = allDetailedEntries.find((e) => e.id === entryId);
  if (!item) {
    root.innerHTML = `
      <div class="archive-card">
        <h2 class="condensed-monument" style="font-size:26px;">档案库未收录：${escapeHtml(entryId)}</h2>
        <p class="prose-read">未找到对应词条编号，请返回写实地球或收容档案库重新选择。</p>
        <div><a class="bp-btn active" style="text-decoration:none;" href="#/map">返回写实地球 →</a></div>
      </div>`;
    return;
  }

  const infoboxHtml =
    Array.isArray(item.infobox) && item.infobox.length
      ? `<div class="infobox-list">` +
        item.infobox
          .map(
            (r) =>
              `<div class="infobox-item"><span class="infobox-label">${escapeHtml(r.label)}：</span><span class="infobox-val">${escapeHtml(r.value)}</span>${r.original ? '<span class="orig-field-tag">本站设定</span>' : ""}</div>`
          )
          .join("") +
        `</div>`
      : "";

  const safeItemHref = `#/map/${encodeURIComponent(item.id)}`;
  const safeMapSiteHref = item.mapSiteId ? `#/map/${encodeURIComponent(item.mapSiteId)}` : "";
  const mapBtn = item.geo
    ? `<a class="bp-btn active" style="text-decoration:none;" href="${escapeHtml(safeItemHref)}">在写实地球定位 (${escapeHtml(formatEntryCoord(item.geo))}) →</a>`
    : item.mapSiteId
      ? `<a class="bp-btn active" style="text-decoration:none;" href="${escapeHtml(safeMapSiteHref)}">在写实地球查看关联站点 →</a>`
      : "";

  root.innerHTML = `
    <article class="archive-card" style="padding:28px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; border-bottom:1px solid var(--border); padding-bottom:12px;">
        <span class="${item.provenance === "original" ? "badge-original" : "badge-canon"}">${escapeHtml(item.code || item.category.toUpperCase())}</span>
        <span class="${item.provenance === "original" ? "badge-original" : "badge-canon"}">出处：${escapeHtml(item.provenanceLabel || item.provenance)}</span>
      </div>
      <h1 class="condensed-monument" style="font-size:30px; margin-top:6px;">${escapeHtml(item.title)}</h1>
      ${infoboxHtml}
      <p class="prose-read" style="margin-top:10px;">${renderSafeMarkup(item.summary)}</p>
      ${item.proc ? `<p class="prose-read" style="color:var(--ink-sec);"><b>收容与驻防（本站设定）：</b>${renderSafeMarkup(item.proc)}</p>` : ""}
      ${item.log ? `<div style="border-left:3px solid var(--klein); padding-left:12px; margin-top:6px;"><p class="prose-read">${renderSafeMarkup(item.log)}</p></div>` : ""}
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
        ${mapBtn}
        <a class="bp-btn" style="text-decoration:none;" href="#/scp">浏览全部收容卷宗</a>
        <button class="bp-btn" type="button" data-history-back="1">← 返回上一页</button>
      </div>
      <div class="fiction-notice">版权与免责声明：SCP 相关内容遵循 CC BY-SA 3.0 协议；本站为虚构创作作品，地点与真实机构无关。</div>
    </article>
  `;
}

async function loadAndMountArchive() {
  const [{ PANTHEON_SIGILS, CITY_SIGILS }, { mountArchiveEngine }, manifest] = await Promise.all([
    import("./sigils.js"),
    import("./legacy-engine.js"),
    fetch("./data/manifest.json").then((r) => r.json()),
  ]);

  const detailed = await Promise.all(
    manifest.entries.map((item) => fetch("./" + item.path).then((r) => r.json()))
  );
  allDetailedEntries = detailed;

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

initRouter(async ({ view, rest }) => {
  if (view === "map") {
    if (archiveMounted) {
      window.switchLiber("map", true);
    } else {
      basicSwitchStage("map");
    }
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
  } else {
    await ensureArchiveMounted();
    window.switchLiber(view, true);
    if (view === "entry") {
      renderEntryDetailView(rest.split("?")[0]);
    }
  }
});
