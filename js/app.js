/**
 * js/app.js
 * Entry point: loads data/manifest.json and structured entry JSONs,
 * mounts views, and binds the Hash Router.
 */
import { PANTHEON_SIGILS, CITY_SIGILS } from "./sigils.js";
import { mountArchiveEngine } from "./legacy-engine.js";
import { initRouter } from "./router.js";

async function loadArchiveData() {
  const manifest = await (await fetch("./data/manifest.json")).json();
  const detailed = await Promise.all(
    manifest.entries.map((item) => fetch("./" + item.path).then((r) => r.json()))
  );

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
  const cities = detailed
    .filter((d) => d.category === "sites")
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

const data = await loadArchiveData();
mountArchiveEngine(data);
initRouter(({ view }) => {
  window.switchLiber(view === "map" ? "terra" : view, true);
});
window.__archiveReady = true;
