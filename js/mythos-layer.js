/**
 * js/mythos-layer.js — 「大浸染」舆图图层
 *
 * 在铜版地球上画出群梦之后的世界：
 *   - 五级危险区：铜版排线，越危险排线越密（II 单斜线 → III 交叉 → IV 加横线 → V 加点刻与压暗）
 *   - 各级边界线、大区拉丁标签
 *   - 异常点（洛氏神话 / SCP / 本站异闻）与人类据点（七曜圣城、基金会站点、前哨、遗迹、禁书库）
 *   - 结界圈、位置误差圈、结界航线
 *   - 地图中心的危险等级读数，全球视图里的七曜天球
 *
 * 数据：data/map/mythos-{threat,points,wards}.geojson，由 tools/build-mythos.mjs 生成，不要手改。
 * 用法：prefetchMythosData() 尽早拉数据；地图 load 之后 installMythos(map, hooks)，返回 api。
 *   hooks.onCardOpen(id) / hooks.onCardClose()：图版卡开关（卡片和档案点共用 #map-site-card）
 *   hooks.formatCoord(lat, lon, precision)：坐标格式，与档案点一致
 */
import { escapeHtml } from "./sanitize.js";

const URLS = [
  "./data/map/mythos-threat.geojson",
  "./data/map/mythos-points.geojson",
  "./data/map/mythos-wards.geojson",
];

let dataPromise = null;
export function prefetchMythosData() {
  if (!dataPromise) {
    dataPromise = Promise.all(
      URLS.map((u) =>
        fetch(u).then((r) => {
          if (!r.ok) throw new Error(`${u} → HTTP ${r.status}`);
          return r.json();
        })
      )
    );
  }
  return dataPromise;
}

const INK = "#0a1890";
const RAD = Math.PI / 180;
const ROMAN = ["0", "I", "II", "III", "IV", "V"];
const KIND = {
  mythos: { badge: "洛氏原典", cls: "plate-badge-canon", tag: "神话", fig: "MYTHOS" },
  scp: { badge: "SCP 原典", cls: "plate-badge-canon", tag: "SCP", fig: "SCP" },
  omen: { badge: "本站设定", cls: "plate-badge-orig", tag: "异闻", fig: "OMEN" },
};
const BASTION = {
  sanctuary: "七曜圣城",
  site: "基金会站点",
  outpost: "盟约前哨",
  ally: "盟友据点",
  relic: "遗迹据点",
  archive: "禁书库",
};
const BASTION_FIG = { site: "SITVS", outpost: "STATIO", ally: "SOCII", relic: "RELIQVIAE", archive: "BIBLIOTHECA" };
const WHY = { ring: "据点结界圈内", corridor: "结界航线压低", ward: "城防结界压低", macro: "身处更大的危险区" };
const PREC = { exact: "精确坐标", city: "城市级范围", region: "区域级范围", approx: "大致位置" };

// 各底图下的排线强度；纸本用墨色，其余用白色
const THEMES = {
  copperplate: { ink: false, k: 1 },
  realistic: { ink: false, k: 0.8 },
  night: { ink: false, k: 0.72 },
  paper: { ink: true, k: 0.95 },
};
const HATCH_ALPHA = { 2: 0.3, 3: 0.32, 4: 0.34, 5: 0.46 };
const fade = (a) => ["interpolate", ["linear"], ["zoom"], 3, a, 8, a * 0.8, 11, a * 0.45, 14, a * 0.22];
const SYMBOL_FONT = '"Segoe UI Symbol", "Noto Sans Symbols", "Noto Sans Symbols 2", "Apple Symbols", "DejaVu Sans", serif';
const PLANETS = [
  ["☽", "LVNA", 27.32],
  ["☿", "MERCVRIVS", 87.97],
  ["♀", "VENVS", 224.7],
  ["☉", "SOL", 365.26],
  ["♂", "MARS", 686.98],
  ["♃", "IVPPITER", 4332.6],
  ["♄", "SATVRNVS", 10759],
];

// ── 画布图片（pixelRatio 2） ────────────────────────────────────────────────
function ctx2d(w, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c.getContext("2d");
}
const pixels = (g) => g.getImageData(0, 0, g.canvas.width, g.canvas.height);
function disk(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
function ring(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
}

// 32×32 设备像素的无缝排线砖（16 css px）
function hatchImage(level, color) {
  const N = 32;
  const g = ctx2d(N);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 2;
  if (level === 2 || level === 3) {
    g.beginPath();
    for (const o of [-N, 0, N]) {
      if (level === 2) {
        g.moveTo(o, N);
        g.lineTo(o + N, 0);
      } else {
        g.moveTo(o, 0);
        g.lineTo(o + N, N);
      }
    }
    g.stroke();
  } else if (level === 4) {
    g.fillRect(0, 7, N, 2);
    g.fillRect(0, 23, N, 2);
  } else {
    for (const [x, y] of [[5, 5], [21, 5], [13, 13], [29, 13], [5, 21], [21, 21], [13, 29], [29, 29]]) {
      disk(g, x, y, 1.7);
    }
  }
  return pixels(g);
}

function anomalyIcon(kind, fg, bg) {
  const m = 24;
  const g = ctx2d(48);
  g.fillStyle = bg;
  disk(g, m, m, 16);
  g.strokeStyle = fg;
  g.fillStyle = fg;
  g.lineWidth = 2.4;
  if (kind === "mythos") {
    ring(g, m, m, 11);
  } else if (kind === "scp") {
    g.strokeRect(m - 10, m - 10, 20, 20);
  } else {
    g.beginPath();
    g.moveTo(m, m - 12.5);
    g.lineTo(m + 11, m + 7.5);
    g.lineTo(m - 11, m + 7.5);
    g.closePath();
    g.stroke();
  }
  disk(g, m, kind === "omen" ? m + 1.5 : m, 3.6);
  return pixels(g);
}

function bastionIcon(type, fg, bg) {
  const m = 22;
  const g = ctx2d(44);
  g.fillStyle = bg;
  disk(g, m, m, 15);
  g.strokeStyle = fg;
  g.fillStyle = fg;
  g.lineWidth = 2;
  const line = (x1, y1, x2, y2) => {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };
  if (type === "site") {
    g.strokeRect(m - 9, m - 9, 18, 18);
    line(m, m - 5, m, m + 5);
    line(m - 5, m, m + 5, m);
  } else if (type === "outpost") {
    g.beginPath();
    g.moveTo(m, m - 11);
    g.lineTo(m + 11, m);
    g.lineTo(m, m + 11);
    g.lineTo(m - 11, m);
    g.closePath();
    g.stroke();
    disk(g, m, m, 2.6);
  } else if (type === "ally") {
    ring(g, m, m, 10);
    line(m, m - 10, m, m + 10);
    line(m - 10, m, m + 10, m);
  } else if (type === "relic") {
    line(m - 9, m - 8, m + 9, m - 8);
    line(m - 5.5, m - 8, m - 5.5, m + 9);
    line(m + 5.5, m - 8, m + 5.5, m + 9);
    line(m - 10, m + 9, m + 10, m + 9);
  } else {
    g.beginPath();
    g.moveTo(m, m - 6);
    g.lineTo(m - 10, m - 9);
    g.lineTo(m - 10, m + 7);
    g.lineTo(m, m + 10);
    g.lineTo(m + 10, m + 7);
    g.lineTo(m + 10, m - 9);
    g.closePath();
    g.stroke();
    line(m, m - 6, m, m + 10);
  }
  return pixels(g);
}

// 七曜圣城：双圈印章 + 十二道刻齿 + 行星符号
function sanctuaryIcon(glyph, fg, bg) {
  const m = 36;
  const g = ctx2d(72);
  g.fillStyle = bg;
  disk(g, m, m, 30);
  g.strokeStyle = fg;
  g.lineWidth = 2;
  ring(g, m, m, 29);
  g.lineWidth = 1.3;
  ring(g, m, m, 24.5);
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6;
    g.beginPath();
    g.moveTo(m + Math.cos(a) * 24.5, m + Math.sin(a) * 24.5);
    g.lineTo(m + Math.cos(a) * 29, m + Math.sin(a) * 29);
    g.stroke();
  }
  g.fillStyle = fg;
  g.font = `30px ${SYMBOL_FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(`${glyph}︎`, m, m + 1.5);
  return pixels(g);
}

// ── 几何 ────────────────────────────────────────────────────────────────────
// 等级边界线：取多边形的环，去掉沿 ±180° 经线和 ±90° 纬线的接缝段
function contoursFrom(threat) {
  const features = [];
  for (const f of threat.features) {
    const lines = [];
    for (const poly of f.geometry.coordinates) {
      for (const r of poly) {
        let cur = [];
        for (let i = 0; i < r.length; i++) {
          const p = r[i];
          if (i > 0) {
            const q = r[i - 1];
            const seam =
              (Math.abs(p[0]) === 180 && p[0] === q[0]) || (Math.abs(p[1]) === 90 && p[1] === q[1]);
            if (seam) {
              if (cur.length > 1) lines.push(cur);
              cur = [];
            }
          }
          cur.push(p);
        }
        if (cur.length > 1) lines.push(cur);
      }
    }
    features.push({
      type: "Feature",
      properties: { level: f.properties.level },
      geometry: { type: "MultiLineString", coordinates: lines },
    });
  }
  return { type: "FeatureCollection", features };
}

function bboxOf(r) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of r) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}
function inRing(r, x, y) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function buildZoneIndex(threat) {
  return threat.features
    .map((f) => ({
      level: f.properties.level,
      polys: f.geometry.coordinates.map((poly) => ({ rings: poly, bbox: bboxOf(poly[0]) })),
    }))
    .sort((a, b) => b.level - a.level);
}
function haversineKm(lon1, lat1, lon2, lat2) {
  const dφ = (lat2 - lat1) * RAD;
  const dλ = (lon2 - lon1) * RAD;
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dλ / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}
function destPoint(lon, lat, distDeg, bearingDeg) {
  const φ1 = lat * RAD, λ1 = lon * RAD, δ = distDeg * RAD, θ = bearingDeg * RAD;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [((λ2 / RAD + 540) % 360) - 180, φ2 / RAD];
}
function zhNum(n) {
  const d = "零一二三四五六七八九";
  n = Math.round(n);
  if (n < 10) return d[n];
  if (n < 20) return "十" + (n % 10 ? d[n % 10] : "");
  if (n < 100) return d[Math.floor(n / 10)] + "十" + (n % 10 ? d[n % 10] : "");
  if (n < 1000) {
    const h = Math.floor(n / 100), r = n % 100;
    return d[h] + "百" + (r === 0 ? "" : r < 10 ? "零" + d[r] : (r < 20 ? "一" : "") + zhNum(r));
  }
  return String(n);
}
const safeUrl = (u) => (typeof u === "string" && /^https:\/\//.test(u) ? u : null);
const extLink = (u, text) =>
  `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;

// ── 安装 ────────────────────────────────────────────────────────────────────
export async function installMythos(map, hooks = {}) {
  const [threat, points, wards] = await prefetchMythosData();
  const meta = threat.meta || {};
  const LEVELS = meta.levels || [];
  const levelInfo = (n) => LEVELS.find((l) => l.level === n) || { level: n, zh: "", la: "", rule: "" };

  const items = new Map();
  for (const f of points.features) {
    const p = f.properties;
    if (p.layer === "anomaly" || p.layer === "bastion") {
      items.set(p.id, { p, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });
    }
  }
  const wardRings = wards.features
    .filter((f) => f.properties.kind === "ward" && Number.isFinite(f.properties.cx))
    .map((f) => ({ name: f.properties.name, km: f.properties.ward, lon: f.properties.cx, lat: f.properties.cy }));
  const zoneIndex = buildZoneIndex(threat);

  // 图片：L = 白线蓝底（铜版、写实、夜灯），I = 墨线纸底（纸本）
  const addImg = (name, data) => {
    if (!map.hasImage(name)) map.addImage(name, data, { pixelRatio: 2 });
  };
  for (const s of ["L", "I"]) {
    const fg = s === "I" ? INK : "#ffffff";
    const bg = s === "I" ? "rgba(246, 244, 238, 0.96)" : "rgba(7, 18, 118, 0.92)";
    for (const L of [2, 3, 4, 5]) addImg(`mythos-hatch-${L}-${s}`, hatchImage(L, fg));
    for (const k of Object.keys(KIND)) addImg(`mythos-anom-${k}-${s}`, anomalyIcon(k, fg, bg));
    for (const t of Object.keys(BASTION_FIG)) addImg(`mythos-b-${t}-${s}`, bastionIcon(t, fg, bg));
    for (const { p } of items.values()) {
      if (p.type === "sanctuary") addImg(`mythos-sanct-${p.id}-${s}`, sanctuaryIcon(p.glyph || "☉", fg, bg));
    }
  }

  map.addSource("mythos-threat", { type: "geojson", data: threat, maxzoom: 9, tolerance: 0.5, buffer: 32 });
  map.addSource("mythos-contours", { type: "geojson", data: contoursFrom(threat), maxzoom: 9, tolerance: 0.5 });
  map.addSource("mythos-wards", { type: "geojson", data: wards, maxzoom: 12 });
  map.addSource("mythos-points", { type: "geojson", data: points, maxzoom: 12 });

  const addLayer = (spec, before) => map.addLayer(spec, before && map.getLayer(before) ? before : undefined);
  const BEFORE_FILL = "vector-waterways";
  const BEFORE_LINE = "vector-water-labels";
  const BEFORE_LABEL = "archive-zones-fill";
  const BEFORE_SYMBOL = "archive-clusters-outer";
  const WHITE_HALO = "rgba(6, 15, 96, 0.86)";
  const textPaint = { "text-color": "#ffffff", "text-halo-color": WHITE_HALO, "text-halo-width": 1 };

  // 危险区：V 级先压暗，再从 II 到 V 叠排线
  addLayer(
    {
      id: "mythos-threat-5-solid",
      type: "fill",
      source: "mythos-threat",
      filter: ["==", ["get", "level"], 5],
      paint: { "fill-color": "#030a4a", "fill-opacity": fade(0.34), "fill-antialias": false },
    },
    BEFORE_FILL
  );
  for (const L of [2, 3, 4, 5]) {
    addLayer(
      {
        id: `mythos-threat-${L}`,
        type: "fill",
        source: "mythos-threat",
        filter: ["==", ["get", "level"], L],
        paint: { "fill-pattern": `mythos-hatch-${L}-L`, "fill-opacity": fade(HATCH_ALPHA[L]), "fill-antialias": false },
      },
      BEFORE_FILL
    );
  }

  const CONTOUR = {
    2: { w: 0.6, a: 0.5, dash: [3, 2.5] },
    3: { w: 0.7, a: 0.55 },
    4: { w: 0.95, a: 0.62 },
    5: { w: 0.8, a: 0.72, gap: 1.6 },
  };
  for (const L of [2, 3, 4, 5]) {
    const c = CONTOUR[L];
    const paint = {
      "line-color": "#ffffff",
      "line-width": c.w,
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 1, c.a * 0.85, 6, c.a, 12, c.a * 0.5],
    };
    if (c.dash) paint["line-dasharray"] = c.dash;
    if (c.gap) paint["line-gap-width"] = c.gap;
    addLayer(
      {
        id: `mythos-contour-${L}`,
        type: "line",
        source: "mythos-contours",
        filter: ["==", ["get", "level"], L],
        layout: { "line-join": "round" },
        paint,
      },
      BEFORE_LINE
    );
  }

  // 结界圈、误差圈、航线
  const kindIs = (k) => ["==", ["get", "kind"], k];
  const wardOf = (types) => ["all", kindIs("ward"), ["in", ["get", "type"], ["literal", types]]];
  addLayer(
    {
      id: "mythos-unc",
      type: "line",
      source: "mythos-wards",
      filter: kindIs("uncertainty"),
      paint: { "line-color": "#ffffff", "line-width": 0.7, "line-opacity": 0.42, "line-dasharray": [1.5, 2.5] },
    },
    BEFORE_LINE
  );
  addLayer(
    {
      id: "mythos-ward-sanct",
      type: "line",
      source: "mythos-wards",
      filter: wardOf(["sanctuary"]),
      layout: { "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 0.85, "line-gap-width": 2.2, "line-opacity": 0.88 },
    },
    BEFORE_LINE
  );
  addLayer(
    {
      id: "mythos-ward-solid",
      type: "line",
      source: "mythos-wards",
      filter: wardOf(["site", "ally", "archive-site"]),
      layout: { "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 0.9, "line-opacity": 0.72 },
    },
    BEFORE_LINE
  );
  addLayer(
    {
      id: "mythos-ward-dash",
      type: "line",
      source: "mythos-wards",
      filter: wardOf(["outpost"]),
      paint: { "line-color": "#ffffff", "line-width": 0.9, "line-opacity": 0.7, "line-dasharray": [3, 2] },
    },
    BEFORE_LINE
  );
  addLayer(
    {
      id: "mythos-ward-dot",
      type: "line",
      source: "mythos-wards",
      filter: wardOf(["relic", "archive"]),
      layout: { "line-cap": "round" },
      paint: { "line-color": "#ffffff", "line-width": 1.3, "line-opacity": 0.75, "line-dasharray": [0.2, 2.2] },
    },
    BEFORE_LINE
  );
  addLayer(
    {
      id: "mythos-corr-casing",
      type: "line",
      source: "mythos-wards",
      filter: kindIs("corridor"),
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 3, 6, 8],
        "line-opacity": 0.1,
        "line-blur": 1.5,
      },
    },
    BEFORE_LINE
  );
  addLayer(
    {
      id: "mythos-corr",
      type: "line",
      source: "mythos-wards",
      filter: kindIs("corridor"),
      layout: { "line-join": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.8, 6, 1.4],
        "line-opacity": 0.78,
        "line-dasharray": [5, 3],
      },
    },
    BEFORE_LINE
  );
  addLayer(
    {
      id: "mythos-corr-label",
      type: "symbol",
      source: "mythos-wards",
      filter: kindIs("corridor"),
      minzoom: 2.2,
      maxzoom: 7.5,
      layout: {
        "symbol-placement": "line",
        "text-field": ["concat", ["get", "latin"], " · ", ["get", "name"]],
        "text-font": ["Noto Sans Italic"],
        "text-size": 10.5,
        "text-letter-spacing": 0.14,
        "symbol-spacing": 420,
        "text-max-angle": 28,
        "text-keep-upright": true,
        "text-padding": 4,
      },
      paint: { ...textPaint, "text-opacity": 0.82 },
    },
    BEFORE_LABEL
  );

  // 大区标签：按 minzoom / maxzoom 分组建层
  const regionGroups = new Map();
  for (const f of points.features) {
    const p = f.properties;
    if (p.layer !== "region") continue;
    const key = `${p.minzoom ?? 1.2}|${p.maxzoom ?? 5.2}`;
    if (!regionGroups.has(key)) regionGroups.set(key, []);
    regionGroups.get(key).push(p.id);
  }
  const regionLayers = [];
  for (const [key, ids] of regionGroups) {
    const [minzoom, maxzoom] = key.split("|").map(Number);
    const id = `mythos-region-${regionLayers.length}`;
    regionLayers.push(id);
    addLayer(
      {
        id,
        type: "symbol",
        source: "mythos-points",
        minzoom,
        maxzoom,
        filter: ["all", ["==", ["get", "layer"], "region"], ["in", ["get", "id"], ["literal", ids]]],
        layout: {
          "text-field": ["format", ["get", "la"], { "font-scale": 1 }, "\n", {}, ["get", "zh"], { "font-scale": 0.8 }],
          "text-font": ["Noto Sans Italic"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 1, 10.5, 4, 14],
          "text-letter-spacing": 0.3,
          "text-line-height": 1.35,
          "text-max-width": 30,
          "text-padding": 6,
          "symbol-sort-key": ["get", "rank"],
        },
        paint: { "text-color": "#ffffff", "text-opacity": 0.6, "text-halo-color": "rgba(6, 15, 96, 0.7)", "text-halo-width": 0.8 },
      },
      BEFORE_LABEL
    );
  }

  // 异常点：IV–V 级全局可见，III 级 z2.4 起，I–II 级 z3.4 起
  const anomOf = (extra) => ["all", ["==", ["get", "layer"], "anomaly"], extra];
  const anomIcon = (s) => ["concat", "mythos-anom-", ["get", "kind"], `-${s}`];
  addLayer(
    {
      id: "mythos-anom-halo",
      type: "circle",
      source: "mythos-points",
      filter: anomOf([">=", ["get", "threat"], 5]),
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 8.5, 6, 13],
        "circle-opacity": 0,
        "circle-stroke-width": 0.8,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-opacity": 0.6,
        "circle-pitch-alignment": "map",
      },
    },
    BEFORE_SYMBOL
  );
  const ANOM_TIERS = [
    { id: "mythos-anom-hi", filter: [">=", ["get", "threat"], 4], minzoom: 0, textZ: 3.4 },
    { id: "mythos-anom-mid", filter: ["==", ["get", "threat"], 3], minzoom: 2.4, textZ: 4.4 },
    { id: "mythos-anom-lo", filter: ["<=", ["get", "threat"], 2], minzoom: 3.4, textZ: 5.2 },
  ];
  for (const t of ANOM_TIERS) {
    addLayer(
      {
        id: t.id,
        type: "symbol",
        source: "mythos-points",
        minzoom: t.minzoom,
        filter: anomOf(t.filter),
        layout: {
          "icon-image": anomIcon("L"),
          "icon-size": ["match", ["get", "threat"], 5, 0.95, 4, 0.85, 3, 0.75, 0.66],
          "icon-allow-overlap": true,
          "text-field": ["step", ["zoom"], "", t.textZ, ["get", "label"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11.5,
          "text-anchor": "top",
          "text-offset": [0, 0.95],
          "text-max-width": 9,
          "text-optional": true,
          "text-padding": 3,
          "symbol-sort-key": ["get", "rank"],
        },
        paint: textPaint,
      },
      BEFORE_SYMBOL
    );
  }

  // 据点：七曜圣城全局可见并带拉丁铭文，其余 z2.6 起
  const isSol = ["==", ["get", "id"], "sanct-sol"];
  addLayer(
    {
      id: "mythos-bastion",
      type: "symbol",
      source: "mythos-points",
      minzoom: 2.6,
      filter: ["all", ["==", ["get", "layer"], "bastion"], ["!=", ["get", "type"], "sanctuary"]],
      layout: {
        "icon-image": ["concat", "mythos-b-", ["get", "type"], "-L"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 2.6, 0.7, 8, 0.95],
        "icon-allow-overlap": true,
        "text-field": ["step", ["zoom"], "", 4.6, ["get", "label"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11.5,
        "text-anchor": "top",
        "text-offset": [0, 0.9],
        "text-max-width": 9,
        "text-optional": true,
        "symbol-sort-key": ["get", "rank"],
      },
      paint: textPaint,
    },
    BEFORE_SYMBOL
  );
  addLayer(
    {
      id: "mythos-bastion-sanct",
      type: "symbol",
      source: "mythos-points",
      filter: ["all", ["==", ["get", "layer"], "bastion"], ["==", ["get", "type"], "sanctuary"]],
      layout: {
        "icon-image": ["concat", "mythos-sanct-", ["get", "id"], "-L"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 4, 0.78, 9, 0.92],
        "icon-allow-overlap": true,
        "text-field": [
          "step",
          ["zoom"],
          ["format", "", {}],
          1.6,
          ["format", ["get", "label"], {}, "\n", {}, ["get", "latin"], { "font-scale": 0.74, "text-font": ["literal", ["Noto Sans Italic"]] }],
        ],
        "text-font": ["Noto Sans Regular"],
        "text-size": 12,
        "text-letter-spacing": 0.04,
        "text-line-height": 1.3,
        "text-anchor": ["case", isSol, "bottom", "top"],
        "text-offset": ["case", isSol, ["literal", [0, -1.55]], ["literal", [0, 1.45]]],
        "text-max-width": 14,
        "text-optional": true,
        "symbol-sort-key": 0,
      },
      paint: { ...textPaint, "text-halo-width": 1.1 },
    },
    BEFORE_SYMBOL
  );

  const GROUPS = {
    zones: [
      "mythos-threat-5-solid",
      "mythos-threat-2",
      "mythos-threat-3",
      "mythos-threat-4",
      "mythos-threat-5",
      "mythos-contour-2",
      "mythos-contour-3",
      "mythos-contour-4",
      "mythos-contour-5",
      ...regionLayers,
    ],
    anomalies: ["mythos-unc", "mythos-anom-halo", "mythos-anom-hi", "mythos-anom-mid", "mythos-anom-lo"],
    bastions: [
      "mythos-ward-sanct",
      "mythos-ward-solid",
      "mythos-ward-dash",
      "mythos-ward-dot",
      "mythos-corr-casing",
      "mythos-corr",
      "mythos-corr-label",
      "mythos-bastion",
      "mythos-bastion-sanct",
    ],
  };
  const groupOn = { zones: true, anomalies: true, bastions: true, orbits: true };
  const LINE_LAYERS = [
    "mythos-contour-2",
    "mythos-contour-3",
    "mythos-contour-4",
    "mythos-contour-5",
    "mythos-unc",
    "mythos-ward-sanct",
    "mythos-ward-solid",
    "mythos-ward-dash",
    "mythos-ward-dot",
    "mythos-corr-casing",
    "mythos-corr",
  ];
  const TEXT_LAYERS = [
    "mythos-corr-label",
    ...regionLayers,
    "mythos-anom-hi",
    "mythos-anom-mid",
    "mythos-anom-lo",
    "mythos-bastion",
    "mythos-bastion-sanct",
  ];

  // ── 主题 ──
  let themeKey = null;
  function applyTheme(mode) {
    const t = THEMES[mode] || THEMES.copperplate;
    if (mode === themeKey) return;
    themeKey = mode;
    const s = t.ink ? "I" : "L";
    const fg = t.ink ? INK : "#ffffff";
    const halo = t.ink ? "rgba(246, 244, 238, 0.94)" : WHITE_HALO;
    const paint = (id, prop, val) => map.getLayer(id) && map.setPaintProperty(id, prop, val);
    const layout = (id, prop, val) => map.getLayer(id) && map.setLayoutProperty(id, prop, val);
    paint("mythos-threat-5-solid", "fill-color", t.ink ? INK : "#030a4a");
    paint("mythos-threat-5-solid", "fill-opacity", fade((t.ink ? 0.12 : 0.34) * t.k));
    for (const L of [2, 3, 4, 5]) {
      paint(`mythos-threat-${L}`, "fill-pattern", `mythos-hatch-${L}-${s}`);
      paint(`mythos-threat-${L}`, "fill-opacity", fade(HATCH_ALPHA[L] * t.k));
    }
    for (const id of LINE_LAYERS) paint(id, "line-color", fg);
    paint("mythos-anom-halo", "circle-stroke-color", fg);
    for (const id of TEXT_LAYERS) {
      paint(id, "text-color", fg);
      paint(id, "text-halo-color", halo);
    }
    for (const t2 of ANOM_TIERS) layout(t2.id, "icon-image", anomIcon(s));
    layout("mythos-bastion", "icon-image", ["concat", "mythos-b-", ["get", "type"], `-${s}`]);
    layout("mythos-bastion-sanct", "icon-image", ["concat", "mythos-sanct-", ["get", "id"], `-${s}`]);
  }

  // ── 点击与悬停 ──
  const CLICKABLE = ["mythos-bastion-sanct", "mythos-bastion", "mythos-anom-hi", "mythos-anom-mid", "mythos-anom-lo"];
  const ARCHIVE_HIT = ["archive-places-icon", "archive-clusters"];
  const visible = (id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none";
  function hitAt(point, pad = 6) {
    const layers = CLICKABLE.filter(visible);
    if (!layers.length || !point) return null;
    const box = [
      [point.x - pad, point.y - pad],
      [point.x + pad, point.y + pad],
    ];
    const hits = map.queryRenderedFeatures(box, { layers });
    if (!hits.length) return null;
    hits.sort((a, b) => (a.properties.rank ?? 99) - (b.properties.rank ?? 99));
    return hits[0];
  }
  map.on("click", (e) => {
    const archiveLayers = ARCHIVE_HIT.filter((id) => map.getLayer(id));
    if (archiveLayers.length && map.queryRenderedFeatures(e.point, { layers: archiveLayers }).length) return;
    const hit = hitAt(e.point);
    if (hit) openById(hit.properties.id, { camera: "fly" });
  });
  let hovering = false;
  let hoverRaf = 0;
  let hoverPt = null;
  map.on("mousemove", (e) => {
    hoverPt = e.point;
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      const over = Boolean(hitAt(hoverPt, 4));
      if (over) {
        map.getCanvas().style.cursor = "pointer";
        hovering = true;
      } else if (hovering) {
        map.getCanvas().style.cursor = "";
        hovering = false;
      }
    });
  });

  // ── 图版卡 ──
  let openId = null;
  const fmtCoord = (it, prec) =>
    hooks.formatCoord
      ? hooks.formatCoord(it.lat, it.lon, prec)
      : `${Math.abs(it.lat).toFixed(2)}°${it.lat >= 0 ? "N" : "S"} · ${Math.abs(it.lon).toFixed(2)}°${it.lon >= 0 ? "E" : "W"}`;
  const section = (h, text) =>
    `<div class="mythos-sec"><div class="mythos-sec-h">${escapeHtml(h)}</div><p>${escapeHtml(text)}</p></div>`;

  function sourceLine(p) {
    const parts = [];
    const u = safeUrl(p.srcUrl);
    if (p.srcTitle) parts.push(u ? extLink(u, p.srcTitle) : escapeHtml(p.srcTitle));
    if (p.srcAuthor) parts.push(escapeHtml(p.srcAuthor));
    if (p.srcLicense) parts.push(escapeHtml(p.srcLicense));
    const pg = safeUrl(p.srcPage);
    if (pg) parts.push(`${extLink(pg, "条目原页")}${p.srcPageAuthor ? `（${escapeHtml(p.srcPageAuthor)}）` : ""}`);
    const ref = safeUrl(typeof p.ref === "string" ? p.ref : p.ref?.url);
    if (ref) parts.push(extLink(ref, "现实地点"));
    return parts.length ? `<span class="mythos-src">${parts.join(" · ")}</span>` : "";
  }
  function primaryAction(p) {
    if (p.entryId) {
      return `<a class="plate-btn primary" href="#/entry/${escapeHtml(encodeURIComponent(p.entryId))}">查阅卷宗 →</a>`;
    }
    const u = safeUrl(p.srcUrl);
    return u
      ? `<a class="plate-btn primary" href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">阅读原文 →</a>`
      : "";
  }
  const closeBtn = `<button id="map-card-close" type="button" class="plate-close-btn" aria-label="关闭图版说明">×</button>`;

  function anomalyHtml(it) {
    const p = it.p;
    const k = KIND[p.kind] || KIND.omen;
    const th = levelInfo(p.threat);
    const zn = levelInfo(p.zone);
    const prec = p.prec === "exact" ? "exact" : "region";
    const coord = `${fmtCoord(it, prec)} · ${PREC[p.prec] || "大致位置"}${p.unc ? ` ±${p.unc} km` : ""}`;
    const why = p.zoneWhy && WHY[p.zoneWhy] ? `（${WHY[p.zoneWhy]}）` : "";
    return `
      <div class="plate-card-top">
        <span class="plate-fig-label">${escapeHtml(`${k.fig} · ${ROMAN[p.threat]} — ${p.latin || ""}`)}</span>
        ${closeBtn}
      </div>
      <h3 class="plate-zh-title">${escapeHtml(p.name)}</h3>
      <div class="plate-coords-line">${escapeHtml(coord)}</div>
      <dl class="mythos-meta">
        <dt>威胁等级</dt><dd>${escapeHtml(`${ROMAN[p.threat]} · ${th.zh}`)} <span class="mythos-la">${escapeHtml(th.la)}</span></dd>
        <dt>所在区域</dt><dd>${escapeHtml(`${ROMAN[p.zone]} · ${zn.zh}${why}`)}</dd>
      </dl>
      <p class="plate-summary">${escapeHtml(p.summary || "")}</p>
      ${p.adapt ? section("本站改编", p.adapt) : ""}
      ${p.human ? section("人类对策", p.human) : ""}
      <div class="plate-actions">
        <button id="mythos-card-zoom" type="button" class="plate-btn">拉近观测</button>
        ${primaryAction(p)}
      </div>
      <div class="plate-footnote mythos-foot">
        <span class="${k.cls}">${escapeHtml(k.badge)}</span>
        ${sourceLine(p)}
      </div>`;
  }

  function bastionHtml(it) {
    const p = it.p;
    const sanct = p.type === "sanctuary";
    const fig = sanct
      ? `${p.glyph || ""}︎ ${p.planet || ""} — ${p.latin || ""}`
      : `${BASTION_FIG[p.type] || "PRAESIDIVM"} — ${p.latin || ""}`;
    const kindTxt = sanct ? `七曜圣城 · ${p.glyph || ""}︎ ${p.metal || ""}之城` : BASTION[p.type] || "据点";
    const canon = /CC BY-SA/.test(p.srcLicense || "");
    const badge = canon ? ["plate-badge-canon", "SCP 原典"] : ["plate-badge-orig", "本站设定"];
    const z0 = levelInfo(0);
    return `
      <div class="plate-card-top">
        <span class="plate-fig-label">${escapeHtml(fig)}</span>
        ${closeBtn}
      </div>
      <h3 class="plate-zh-title">${escapeHtml(p.name)}</h3>
      <div class="plate-coords-line">${escapeHtml(fmtCoord(it, "city"))}</div>
      <dl class="mythos-meta">
        <dt>类别</dt><dd>${escapeHtml(kindTxt)}</dd>
        <dt>结界半径</dt><dd>${escapeHtml(String(p.ward ?? "—"))} km</dd>
        <dt>所在区域</dt><dd>0 · ${escapeHtml(z0.zh || "圣域")} <span class="mythos-la">${escapeHtml(z0.la || "SANCTVM")}</span></dd>
      </dl>
      ${p.motto ? `<div class="mythos-motto">${escapeHtml(p.motto)}</div>` : ""}
      <p class="plate-summary">${escapeHtml(p.summary || "")}</p>
      ${p.role ? section(canon ? "本站改编" : "职能", p.role) : ""}
      <div class="plate-actions">
        <button id="mythos-card-zoom" type="button" class="plate-btn">拉近观测</button>
        ${primaryAction(p)}
      </div>
      <div class="plate-footnote mythos-foot">
        <span class="${badge[0]}">${badge[1]}</span>
        ${sourceLine(p)}
      </div>`;
  }

  // 点开时飞到的缩放级：圣城看得见结界圈，异常看得见误差圈
  function focusZoom(it) {
    const p = it.p;
    if (p.layer === "bastion") return p.type === "sanctuary" ? 5.4 : 7;
    const u = p.unc || 0;
    return u >= 400 ? 3.8 : u >= 100 ? 5.2 : u >= 20 ? 6.8 : p.prec === "exact" ? 9 : 7.5;
  }
  function closeZoom(it) {
    const p = it.p;
    if (p.layer === "bastion") return p.type === "sanctuary" ? 10.5 : 12;
    if (p.prec === "exact" && !(p.unc >= 20)) return 13.5;
    return Math.min(focusZoom(it) + 1.6, 11);
  }

  function renderCard(it) {
    const card = document.getElementById("map-site-card");
    if (!card) return;
    openId = it.p.id;
    card.innerHTML = it.p.layer === "anomaly" ? anomalyHtml(it) : bastionHtml(it);
    card.classList.add("open", "mythos-plate");
    card.scrollTop = 0;
    card.querySelector("#map-card-close")?.addEventListener("click", () => closeCard(false));
    card.querySelector("#mythos-card-zoom")?.addEventListener("click", () => {
      const z = closeZoom(it);
      map.flyTo({ center: [it.lon, it.lat], zoom: z, pitch: z >= 12 ? 45 : 0, duration: 1500, essential: true });
    });
    hooks.onCardOpen?.(it.p.id);
    refreshChrome();
  }

  function closeCard(silent = false) {
    if (!openId) return;
    openId = null;
    const card = document.getElementById("map-site-card");
    card?.classList.remove("mythos-plate");
    if (!silent) {
      card?.classList.remove("open");
      hooks.onCardClose?.();
    }
    refreshChrome();
  }

  function openById(id, { camera = "fly" } = {}) {
    const it = items.get(id);
    if (!it) return false;
    renderCard(it);
    if (camera === "fly") {
      map.flyTo({ center: [it.lon, it.lat], zoom: Math.max(map.getZoom(), focusZoom(it)), duration: 1200, essential: true });
    } else if (camera === "jump") {
      map.jumpTo({
        center: [it.lon, it.lat],
        zoom: focusZoom(it),
        pitch: 0,
        bearing: 0,
        padding: { left: 0, top: 0, right: 0, bottom: 0 },
      });
    }
    return true;
  }

  function figLabel() {
    const it = openId && items.get(openId);
    if (!it) return null;
    const p = it.p;
    if (p.layer === "bastion") {
      return p.type === "sanctuary" ? `FIG. ${p.glyph}︎ — ${p.latin}` : `FIG. ${BASTION_FIG[p.type] || ""} — ${p.latin}`;
    }
    return `FIG. ${ROMAN[p.threat]} — ${p.latin}`;
  }

  const searchList = [...items.values()].sort((a, b) => (a.p.rank ?? 99) - (b.p.rank ?? 99));
  function search(raw) {
    const q = String(raw || "").trim().toLowerCase();
    const pool = q
      ? searchList.filter(({ p }) => [p.name, p.latin, p.id].some((s) => s && String(s).toLowerCase().includes(q)))
      : searchList.filter(({ p }) => p.type === "sanctuary");
    return pool.slice(0, 16).map(({ p }) => ({
      id: p.id,
      name: p.name,
      tag:
        p.layer === "bastion"
          ? p.type === "sanctuary"
            ? `${p.glyph}︎ 圣城`
            : BASTION[p.type] || "据点"
          : `${(KIND[p.kind] || KIND.omen).tag} · ${ROMAN[p.threat]}`,
    }));
  }

  // ── 读数条、准星、图例 ──
  const stage = document.getElementById("stage-map") || document.body;
  const readout = document.createElement("div");
  readout.id = "mythos-readout";
  readout.setAttribute("role", "status");
  const cross = document.createElement("div");
  cross.id = "mythos-crosshair";
  cross.setAttribute("aria-hidden", "true");
  stage.append(readout, cross);

  function zoneAtPoint(lon, lat) {
    lon = ((((lon + 180) % 360) + 360) % 360) - 180;
    for (const w of wardRings) {
      if (haversineKm(lon, lat, w.lon, w.lat) <= w.km) return { level: 0, ward: w.name };
    }
    for (const lv of zoneIndex) {
      for (const poly of lv.polys) {
        const [x0, y0, x1, y1] = poly.bbox;
        if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
        if (inRing(poly.rings[0], lon, lat) && !poly.rings.slice(1).some((h) => inRing(h, lon, lat))) {
          return { level: lv.level };
        }
      }
    }
    return { level: 1 };
  }

  let readKey = "";
  function updateReadout() {
    const show = groupOn.zones && !openId && map.getZoom() >= 3.1;
    readout.classList.toggle("open", show);
    cross.classList.toggle("open", show);
    if (!show) return;
    const c = map.getCenter();
    const z = zoneAtPoint(c.lng, c.lat);
    const key = `${z.level}|${z.ward || ""}`;
    if (key === readKey) return;
    readKey = key;
    const L = levelInfo(z.level);
    const rule = z.ward ? `${z.ward}的结界之内。${(L.rule || "").replace(/^[^。]*。/, "")}` : L.rule;
    readout.innerHTML = `<span class="mr-lv">${ROMAN[z.level]}</span><span class="mr-zh">${escapeHtml(L.zh)}</span><span class="mr-la">${escapeHtml(L.la)}</span><span class="mr-rule">${escapeHtml(rule)}</span>`;
  }

  function fillLegends() {
    const share = meta.share || {};
    const pct = (v) => `${Math.round((v || 0) * 100)}%`;
    const rows = [5, 4, 3, 2].map((L) => {
      const info = levelInfo(L);
      return `<span class="ml-sw" data-lv="${L}"></span><span class="ml-name">${ROMAN[L]} · ${escapeHtml(info.zh)} <span class="ml-la">${escapeHtml(info.la)}</span></span><span class="ml-pct">${pct(share[L])}</span>`;
    });
    rows.push(
      `<span class="ml-sw" data-lv="1"></span><span class="ml-name">0–I · 圣域与平靖</span><span class="ml-pct">${pct((share[0] || 0) + (share[1] || 0))}</span>`
    );
    for (const el of document.querySelectorAll("[data-mythos-legend]")) el.innerHTML = rows.join("");
    const c = meta.counts || {};
    const cnt = document.getElementById("mythos-hero-count");
    if (cnt && c.anomalies) {
      cnt.textContent = `${zhNum(c.anomalies)}处异常 · ${zhNum(c.bastionTypes?.sanctuary ?? 7)}座圣城 · ${zhNum(c.corridors || 0)}条结界航线`;
    }
  }

  function setGroup(name, on) {
    if (!(name in groupOn)) return;
    groupOn[name] = on;
    for (const id of GROUPS[name] || []) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    }
    document.querySelectorAll(`[data-mythos="${name}"]`).forEach((b) => {
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    if (!on && name !== "zones" && name !== "orbits" && openId) {
      const p = items.get(openId)?.p;
      if (p && ((name === "anomalies" && p.layer === "anomaly") || (name === "bastions" && p.layer === "bastion"))) {
        closeCard(false);
      }
    }
    refreshChrome();
  }
  document.querySelectorAll("[data-mythos]").forEach((btn) => {
    btn.setAttribute("aria-pressed", "true");
    btn.addEventListener("click", () => setGroup(btn.dataset.mythos, !groupOn[btn.dataset.mythos]));
  });

  // ── 七曜天球（只在全球视图） ──
  const SVGNS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const orbSvg = el("svg", { id: "mythos-orbits", "aria-hidden": "true", focusable: "false" });
  const orbRoot = el("g");
  orbSvg.appendChild(orbRoot);
  const orbRings = PLANETS.map(([glyph, la, period], k) => {
    const circle = el("circle", { class: "orb-ring", cx: 0, cy: 0, r: 100 });
    const start = (k * 137.5 + 20) % 360;
    const arm = el("g", { transform: `rotate(${start})` });
    const holder = el("g", { transform: "translate(100,0)" });
    const spin = el("g", { transform: `rotate(${-start})` });
    const dot = el("circle", { class: "orb-dot", cx: 0, cy: 0, r: 10 });
    const sym = el("text", { class: "orb-glyph", x: 0, y: 0.5, "text-anchor": "middle", "dominant-baseline": "central" });
    sym.textContent = `${glyph}︎`;
    const name = el("text", { class: "orb-la", x: 0, y: 22, "text-anchor": "middle" });
    name.textContent = la;
    spin.append(dot, sym, name);
    holder.appendChild(spin);
    arm.appendChild(holder);
    if (!reduceMotion) {
      const dur = `${(90 * Math.pow(period / 27.32, 0.35)).toFixed(1)}s`;
      arm.appendChild(
        el("animateTransform", { attributeName: "transform", type: "rotate", from: start, to: start + 360, dur, repeatCount: "indefinite" })
      );
      spin.appendChild(
        el("animateTransform", { attributeName: "transform", type: "rotate", from: -start, to: -start - 360, dur, repeatCount: "indefinite" })
      );
    }
    orbRoot.append(circle, arm);
    return { k, circle, holder };
  });
  const yug = el("circle", { class: "orb-ring orb-yug", cx: 0, cy: 0, r: 100 });
  const yugLabel = el("text", { class: "orb-la orb-yug-la", "text-anchor": "middle" });
  yugLabel.textContent = "YVGGOTH · 不在七曜之列";
  orbRoot.append(yug, yugLabel);
  map.getContainer().appendChild(orbSvg);

  function limb() {
    const c = map.getCenter();
    const pc = map.project(c);
    let R = 0;
    for (let deg = 56; deg <= 90; deg += 2) {
      const pq = map.project(destPoint(c.lng, c.lat, deg, 90));
      const d = Math.hypot(pq.x - pc.x, pq.y - pc.y);
      if (Number.isFinite(d) && d > R) R = d;
    }
    return { cx: pc.x, cy: pc.y, R };
  }
  let orbOpen = false;
  function updateOrbits() {
    const want = groupOn.orbits && !openId && map.getZoom() < 2.8 && map.getPitch() < 12;
    if (want !== orbOpen) {
      orbOpen = want;
      orbSvg.classList.toggle("open", want);
    }
    if (!want) return;
    const { cx, cy, R } = limb();
    if (!(R > 20)) return;
    orbRoot.setAttribute("transform", `translate(${cx.toFixed(1)},${cy.toFixed(1)})`);
    for (const o of orbRings) {
      const r = (R * (1.12 + 0.1 * o.k)).toFixed(1);
      o.circle.setAttribute("r", r);
      o.holder.setAttribute("transform", `translate(${r},0)`);
    }
    const ry = R * 1.86;
    yug.setAttribute("r", ry.toFixed(1));
    const W = orbSvg.clientWidth || window.innerWidth;
    const H = orbSvg.clientHeight || window.innerHeight;
    let placed = false;
    for (const deg of [-62, 62, -35, 35, -118, 118, -145, 145]) {
      const x = cx + ry * Math.cos(deg * RAD);
      const y = cy + ry * Math.sin(deg * RAD);
      if (x > 110 && x < W - 110 && y > 80 && y < H - 70) {
        yugLabel.setAttribute("x", (x - cx).toFixed(1));
        yugLabel.setAttribute("y", (y - cy - 6).toFixed(1));
        placed = true;
        break;
      }
    }
    yugLabel.style.display = placed ? "" : "none";
  }

  function refreshChrome() {
    updateReadout();
    updateOrbits();
  }
  let moveRaf = 0;
  map.on("move", () => {
    if (!orbOpen || moveRaf) return;
    moveRaf = requestAnimationFrame(() => {
      moveRaf = 0;
      updateOrbits();
    });
  });
  map.on("moveend", refreshChrome);
  window.addEventListener("resize", refreshChrome);

  fillLegends();
  refreshChrome();

  return {
    applyTheme,
    openById,
    closeCard,
    has: (id) => items.has(id),
    get isCardOpen() {
      return Boolean(openId);
    },
    hitAt: (point) => Boolean(hitAt(point)),
    search,
    figLabel,
    setGroup,
    refresh: refreshChrome,
  };
}
