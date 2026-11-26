/**
 * js/app.js
 * Entry point: loads data/manifest.json and structured entry JSONs,
 * mounts archival views, lazy-mounts MapLibre Realistic Earth on #/map,
 * and handles #/entry/<id> and #/gallery ("神学星象仪").
 */
import { PANTHEON_SIGILS, CITY_SIGILS } from "./sigils.js";
import { escapeHtml, renderSafeMarkup } from "./sanitize.js";
import { mountArchiveEngine } from "./legacy-engine.js";
import { initRouter, parseHashRoute } from "./router.js";

let allDetailedEntries = [];
let earthController = null;
let earthInitPromise = null;

async function ensureEarthController() {
  if (earthController) return earthController;
  if (!earthInitPromise) {
    earthInitPromise = import("./realistic-map.js").then((mod) =>
      mod.createRealisticEarthController({
        onOpenEntry(entryId) {
          window.location.hash = `#/entry/${entryId}`;
        },
      })
    );
  }
  earthController = await earthInitPromise;
  return earthController;
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
        <div><button class="bp-btn active" onclick="window.location.hash='#/map'">返回写实地球 →</button></div>
      </div>`;
    return;
  }

  const infoboxHtml = Array.isArray(item.infobox) && item.infobox.length
    ? `<div class="infobox-list">` +
      item.infobox
        .map(
          (r) =>
            `<div class="infobox-item"><span class="infobox-label">${escapeHtml(r.label)}：</span><span class="infobox-val">${escapeHtml(r.value)}</span>${r.original ? '<span class="orig-field-tag">本站设定</span>' : ""}</div>`
        )
        .join("") +
      `</div>`
    : "";

  const mapBtn = item.geo
    ? `<button class="bp-btn active" onclick="window.location.hash='#/map/${escapeHtml(item.id)}'">在写实地球定位 (${item.geo.lat.toFixed(2)}°, ${item.geo.lon.toFixed(2)}°) →</button>`
    : item.mapSiteId
      ? `<button class="bp-btn active" onclick="window.location.hash='#/map/${escapeHtml(item.mapSiteId)}'">在写实地球查看关联站点 →</button>`
      : "";

  root.innerHTML = `
    <article class="archive-card" style="padding:28px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; border-bottom:1px solid var(--border); padding-bottom:12px;">
        <span class="${escapeHtml(item.badge || "badge-gold")}">${escapeHtml(item.code || item.category.toUpperCase())}</span>
        <span class="badge-cyan">出处：${escapeHtml(item.provenanceLabel || item.provenance)}</span>
      </div>
      <h1 class="condensed-monument" style="font-size:30px; margin-top:6px;">${escapeHtml(item.title)}</h1>
      ${infoboxHtml}
      <p class="prose-read" style="margin-top:10px;">${renderSafeMarkup(item.summary)}</p>
      ${item.proc ? `<p class="prose-read" style="color:var(--ink-sec);"><b>收容与驻防（本站设定）：</b>${renderSafeMarkup(item.proc)}</p>` : ""}
      ${item.log ? `<div style="border-left:3px solid var(--klein); padding-left:12px; margin-top:6px;"><p class="prose-read">${renderSafeMarkup(item.log)}</p></div>` : ""}
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
        ${mapBtn}
        <button class="bp-btn" onclick="window.location.hash='#/scp'">浏览全部收容卷宗</button>
        <button class="bp-btn" onclick="history.back()">← 返回上一页</button>
      </div>
      <div class="fiction-notice">版权与免责声明：SCP 相关内容遵循 CC BY-SA 3.0 协议；本站为虚构创作作品，地点与真实机构无关。</div>
    </article>
  `;
}

async function loadArchiveData() {
  const manifest = await (await fetch("./data/manifest.json")).json();
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
    "cairo", "antarctica", "penglai", "baikal", "arkham", "leng"
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

  return { PANTHEON: entities, SCP_FILES: scpFiles, CITIES: cities, FACTIONS: factions, AIC_KB: aicKb };
}

const initialRoute = parseHashRoute();
if (initialRoute.view === "map") {
  const ctrl = await ensureEarthController();
  if (!window.__earthMapLoaded) {
    await new Promise((res) => {
      ctrl.map.once("load", res);
      setTimeout(res, 2500);
    });
  }
}

const data = await loadArchiveData();
mountArchiveEngine(data);

initRouter(async ({ view, rest }) => {
  window.switchLiber(view, true);
  if (view === "map") {
    const ctrl = await ensureEarthController();
    ctrl.applySubRoute(rest);
  } else if (view === "entry") {
    renderEntryDetailView(rest.split("?")[0]);
  }
});

window.__archiveReady = true;
