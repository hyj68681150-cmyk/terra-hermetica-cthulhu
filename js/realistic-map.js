/**
 * js/realistic-map.js
 * Realistic Satellite + Paper Archival + Night Lights 3D Globe (#/map)
 * Powered by self-hosted MapLibre GL JS v6.18.0 (BSD-3).
 *
 * Strictly zero national/disputed borders ("国界线不要画"):
 *  - No `boundary` source-layer is ever added.
 *  - `place` labels exclude country/state/province classes and mask disputed zones via `within`.
 */
import {
  Map as MapLibreMap,
  NavigationControl,
  AttributionControl,
  ScaleControl,
} from "../vendor/maplibre-gl@6.18.0/maplibre-gl.mjs";
import { escapeHtml } from "./sanitize.js";

const DEFAULT_BASEMAP = "satellite";

const EOX_ATTRIB =
  'Sentinel-2 cloudless - <a href="https://s2maps.eu" target="_blank" rel="noopener">https://s2maps.eu</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 &amp; 2017, CC BY 4.0)';
const OFM_ATTRIB =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const MAPTERHORN_ATTRIB =
  '<a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">&copy; Mapterhorn</a>';
const NASA_ATTRIB =
  'Imagery: <a href="https://earthobservatory.nasa.gov/features/NightLights" target="_blank" rel="noopener">NASA Black Marble / Blue Marble</a>';

// 4.2.6: Add name:en / name:latin as 3rd tier before raw native script
const CJK_NAME_EXPR = [
  "coalesce",
  ["get", "name:zh-Hans"],
  ["get", "name:zh"],
  ["get", "name:en"],
  ["get", "name:latin"],
  ["get", "name"],
];

// 4.2.7: Disputed-area polygon mask (Zangnan / South Tibet, Aksai Chin, Diaoyu Islands, South China Sea Islands)
const DISPUTED_LABEL_MASK = {
  type: "MultiPolygon",
  coordinates: [
    // Zangnan / South Tibet (south of Lhasa & Nyingchi)
    [[[91.5, 26.8], [97.6, 26.8], [97.6, 29.45], [91.5, 29.45], [91.5, 26.8]]],
    // Aksai Chin / eastern border sector
    [[[77.4, 33.2], [80.6, 33.2], [80.6, 36.1], [77.4, 36.1], [77.4, 33.2]]],
    // Diaoyu Islands
    [[[123.1, 25.5], [124.8, 25.5], [124.8, 26.1], [123.1, 26.1], [123.1, 25.5]]],
    // South China Sea Islands
    [[[109.6, 3.5], [119.5, 3.5], [119.5, 21.1], [116.0, 21.1], [111.0, 17.5], [109.6, 3.5]]],
  ],
};

// Synchronous site camera lookup so #/map/<siteId> starts MapLibre at t=0ms without waiting on places.geojson
const QUICK_SITE_CAM = {
  "site-rlyeh": [-126.7167, -47.15, 5, 0],
  "site-alexandria": [29.8856, 31.214, 12, 0],
  "site-2000": [-110.498, 44.462, 10, 60],
  "site-001": [47.4395, 31.0044, 12, 0],
  "site-prague": [14.3965, 50.0933, 13, 0],
  "site-13": [-103.965, 29.475, 10, 45],
  "site-cairo": [31.1308, 29.976, 13, 0],
  "site-antarctica": [113.1667, -76.25, 5, 0],
  "site-penglai": [120.7522, 37.8283, 12, 0],
  "site-baikal": [107.42, 53.24, 9, 0],
  "site-arkham": [-70.865, 42.548, 11, 0],
  "site-innsmouth": [-70.768, 42.682, 11, 0],
  "site-leng": [73.535, 39.035, 9, 0],
  "site-3000-bengal": [88.5, 11.5, 5, 0],
};

const LEGACY_TO_SITE_ID = {
  rlyeh: "site-rlyeh",
  alexandria: "site-alexandria",
  site2000: "site-2000",
  gate001: "site-001",
  prague: "site-prague",
  site13: "site-13",
  cairo: "site-cairo",
  antarctica: "site-antarctica",
  penglai: "site-penglai",
  baikal: "site-baikal",
  arkham: "site-arkham",
  leng: "site-leng",
};

const EMPTY_FC = { type: "FeatureCollection", features: [] };

function geodesicCircleRing([lonDeg, latDeg], radiusKm, steps = 40) {
  const R = 6371;
  const lat1 = (latDeg * Math.PI) / 180;
  const lon1 = (lonDeg * Math.PI) / 180;
  const d = radiusKm / R;
  const ring = [];
  for (let i = 0; i <= steps; i++) {
    const brng = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
    const lon2 =
      lon1 +
      Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    ring.push([Number(((lon2 * 180) / Math.PI).toFixed(4)), Number(((lat2 * 180) / Math.PI).toFixed(4))]);
  }
  ring[ring.length - 1] = [...ring[0]];
  return ring;
}

function buildPrecisionRangeGeoJSON(places) {
  const features = [];
  for (const p of places) {
    if (p.precision === "exact") continue;
    const radKm = p.precision === "city" ? 1.6 : 3.4;
    features.push({
      type: "Feature",
      properties: {
        id: p.id,
        entryId: p.entryId,
        name_zh: p.name_zh,
        layer: p.layer,
        precision: p.precision,
        rangeLabel: `${p.name_zh}\n（${p.precision === "city" ? "城市级范围" : "区域级范围"}）`,
      },
      geometry: {
        type: "Polygon",
        coordinates: [geodesicCircleRing([p.lon, p.lat], radKm, 40)],
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function formatSiteCoord(lat, lon, precision) {
  const digits = precision === "exact" ? 4 : 1;
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(digits)}°${ns}, ${Math.abs(lon).toFixed(digits)}°${ew}`;
}

export function buildSolarTerminatorGeoJSON(date = new Date()) {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - startOfYear) / 86400000;
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  const gamma = ((2 * Math.PI) / 365.24) * (dayOfYear - 1 + (utcHours - 12) / 24);
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma);
  const eqTimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const subSolarLon = ((((12 - utcHours - eqTimeMin / 60) * 15) % 360) + 540) % 360 - 180;
  const tanDecl = Math.abs(Math.tan(decl)) < 1e-4 ? 1e-4 : Math.tan(decl);
  const nightPoleLat = decl <= 0 ? 85.0511 : -85.0511;

  const curve = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    const ha = ((lon - subSolarLon) * Math.PI) / 180;
    const latRad = Math.atan(-Math.cos(ha) / tanDecl);
    const latDeg = Math.max(-85.05, Math.min(85.05, (latRad * 180) / Math.PI));
    curve.push([lon, Number(latDeg.toFixed(4))]);
  }

  const ring = [[-180, nightPoleLat], ...curve, [180, nightPoleLat], [-180, nightPoleLat]];

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { kind: "night-hemisphere", utc: date.toISOString() },
        geometry: { type: "Polygon", coordinates: [ring] },
      },
      {
        type: "Feature",
        properties: { kind: "terminator-line" },
        geometry: { type: "LineString", coordinates: curve },
      },
    ],
  };
}

function createArchivalIconData(kind) {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const cx = size / 2;
  const cy = size / 2;

  const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 30);
  grad.addColorStop(0, "rgba(19, 38, 230, 0.42)");
  grad.addColorStop(1, "rgba(19, 38, 230, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle =
    kind === "scp" ? "#0d1cb8" : kind === "mythos" ? "#1326e6" : kind === "theology" ? "#1633f0" : "#1b38c8";
  ctx.strokeStyle = "#fbf8f1";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(251, 248, 241, 0.55)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, 14.5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (kind === "scp") {
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 12.5, cy + Math.sin(a) * 12.5);
      ctx.lineTo(cx + Math.cos(a) * 6.5, cy + Math.sin(a) * 6.5);
      ctx.stroke();
    }
  } else if (kind === "mythos") {
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.quadraticCurveTo(cx, cy - 8, cx + 10, cy);
    ctx.quadraticCurveTo(cx, cy + 8, cx - 10, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "theology") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 11);
    ctx.lineTo(cx + 9, cy);
    ctx.lineTo(cx, cy + 11);
    ctx.lineTo(cx - 9, cy);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 2.8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
      const x = cx + Math.cos(a) * 9.5;
      const y = cy + Math.sin(a) * 9.5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  return ctx.getImageData(0, 0, size, size);
}

// 4.2.6 + 4.2.7: Rank-controlled place filter with z4-10 major cities/capitals, z>=13 minor places, & disputed mask
const PLACE_FILTER_EXPR = [
  "all",
  ["!", ["within", DISPUTED_LABEL_MASK]],
  [
    "step",
    ["zoom"],
    // z < 6: capitals and global tier-1..3 cities only
    [
      "all",
      ["==", ["get", "class"], "city"],
      ["any", ["==", ["get", "capital"], 2], ["<=", ["coalesce", ["get", "rank"], 99], 3]],
    ],
    6,
    // 6 <= z < 8: capitals and rank <= 4 cities
    [
      "all",
      ["==", ["get", "class"], "city"],
      ["any", ["==", ["get", "capital"], 2], ["<=", ["coalesce", ["get", "rank"], 99], 4]],
    ],
    8,
    // 8 <= z < 10: capitals and rank <= 6 cities
    [
      "all",
      ["==", ["get", "class"], "city"],
      ["any", ["==", ["get", "capital"], 2], ["<=", ["coalesce", ["get", "rank"], 99], 6]],
    ],
    10,
    // 10 <= z < 13: cities and major towns (rank <= 10), NO hamlets/villages/neighbourhoods
    [
      "all",
      ["in", ["get", "class"], ["literal", ["city", "town"]]],
      ["<=", ["coalesce", ["get", "rank"], 9], 10],
    ],
    13,
    // z >= 13: allow towns, villages, suburbs, neighbourhoods, islands (still zero country/state/province)
    [
      "in",
      ["get", "class"],
      ["literal", ["city", "town", "village", "suburb", "quarter", "neighbourhood", "hamlet", "island"]],
    ],
  ],
];

function buildUnifiedStyle(initialTerminator) {
  return {
    version: 8,
    name: "Theologia Caerulea Realistic & Archival Atlas",
    projection: {
      type: ["interpolate", ["linear"], ["zoom"], 5.5, "vertical-perspective", 6.8, "mercator"],
    },
    sky: {
      "sky-color": "#050a1c",
      "sky-horizon-blend": 0.38,
      "horizon-color": "#4f7ff7",
      "horizon-fog-blend": 0.55,
      "fog-color": "#0c1738",
      "fog-ground-blend": 0.25,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.88, 5, 0.45, 8, 0],
    },
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      "blue-marble-fallback": {
        type: "image",
        url: "./assets/fallback/nasa-blue-marble-3857.jpg",
        coordinates: [
          [-180, 85.0511287],
          [180, 85.0511287],
          [180, -85.0511287],
          [-180, -85.0511287],
        ],
      },
      "s2cloudless-2016": {
        type: "raster",
        tiles: [
          "https://a.tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg",
          "https://b.tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg",
          "https://c.tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg",
          "https://d.tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg",
        ],
        tileSize: 256,
        maxzoom: 15,
        attribution: EOX_ATTRIB,
      },
      "viirs-night": {
        type: "raster",
        tiles: [
          "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/2012-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
        ],
        tileSize: 256,
        maxzoom: 8,
        attribution: NASA_ATTRIB,
      },
      openmaptiles: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        attribution: OFM_ATTRIB,
      },
      "terrain-dem": {
        type: "raster-dem",
        tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
        encoding: "terrarium",
        tileSize: 512,
        maxzoom: 14,
        attribution: MAPTERHORN_ATTRIB,
      },
      "hillshade-dem": {
        type: "raster-dem",
        tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
        encoding: "terrarium",
        tileSize: 512,
        maxzoom: 14,
      },
      "terrain-aws": {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 14,
        attribution: "Terrain: Mapzen / AWS Open Data",
      },
      "solar-terminator": {
        type: "geojson",
        data: initialTerminator,
        maxzoom: 4,
        tolerance: 0.8,
      },
      "archive-zones": {
        type: "geojson",
        data: "./data/map/zones.geojson",
        maxzoom: 8,
        tolerance: 0.5,
      },
      "archive-routes": {
        type: "geojson",
        data: "./data/map/routes.geojson",
        maxzoom: 7,
        tolerance: 0.5,
      },
      "archive-precision-ranges": {
        type: "geojson",
        data: EMPTY_FC,
        maxzoom: 14,
      },
      "archive-places": {
        type: "geojson",
        data: EMPTY_FC,
        maxzoom: 12,
        cluster: true,
        clusterMaxZoom: 3,
        clusterRadius: 34,
      },
    },
    layers: [
      {
        id: "bg-base",
        type: "background",
        paint: { "background-color": "#060b19" },
      },
      {
        id: "fallback-blue-marble",
        type: "raster",
        source: "blue-marble-fallback",
        layout: { visibility: "none" },
        paint: { "raster-opacity": 1 },
      },
      {
        id: "sat-eox-layer",
        type: "raster",
        source: "s2cloudless-2016",
        layout: { visibility: "visible" },
        paint: {
          "raster-fade-duration": 0,
          "raster-contrast": 0.06,
          "raster-saturation": 0.04,
        },
      },
      {
        id: "night-viirs-layer",
        type: "raster",
        source: "viirs-night",
        layout: { visibility: "none" },
        paint: {
          "raster-fade-duration": 0,
          "raster-brightness-min": 0.02,
          "raster-contrast": 0.15,
        },
      },
      {
        id: "paper-landcover",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landcover",
        layout: { visibility: "none" },
        paint: {
          "fill-color": "#ece5d5",
          "fill-opacity": 0.45,
        },
      },
      {
        id: "vector-water-fill",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        layout: { visibility: "none" },
        paint: { "fill-color": "#dfe5f2" },
      },
      {
        id: "vector-coastline",
        type: "line",
        source: "openmaptiles",
        "source-layer": "water",
        layout: { visibility: "none" },
        paint: {
          "line-color": "rgba(19, 38, 230, 0.35)",
          "line-width": 0.9,
        },
      },
      {
        id: "terrain-hillshade",
        type: "hillshade",
        source: "hillshade-dem",
        layout: { visibility: "none" },
        paint: {
          "hillshade-exaggeration": 0.28,
          "hillshade-shadow-color": "#0b132b",
          "hillshade-highlight-color": "#ffffff",
          "hillshade-accent-color": "#1326e6",
        },
      },
      {
        id: "terminator-night-fill",
        type: "fill",
        source: "solar-terminator",
        maxzoom: 7,
        filter: ["==", ["get", "kind"], "night-hemisphere"],
        layout: { visibility: "visible" },
        paint: {
          "fill-color": "#040818",
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.36, 5, 0.22, 7, 0],
        },
      },
      {
        id: "terminator-twilight-line",
        type: "line",
        source: "solar-terminator",
        maxzoom: 7,
        filter: ["==", ["get", "kind"], "terminator-line"],
        layout: { visibility: "visible" },
        paint: {
          "line-color": "rgba(138, 178, 255, 0.42)",
          "line-width": 1.2,
          "line-dasharray": [3, 3],
        },
      },
      {
        id: "vector-waterways",
        type: "line",
        source: "openmaptiles",
        "source-layer": "waterway",
        minzoom: 10,
        paint: {
          "line-color": "rgba(82, 148, 255, 0.68)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.7, 14, 2.2],
        },
      },
      {
        id: "vector-roads-casing",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        minzoom: 10,
        paint: {
          "line-color": "rgba(10, 16, 34, 0.55)",
          "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 10, 1.2, 14, 4.2, 17, 11],
        },
      },
      {
        id: "vector-roads-inner",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        minzoom: 10,
        paint: {
          "line-color": [
            "match",
            ["get", "class"],
            ["motorway", "trunk", "primary"],
            "rgba(255, 244, 214, 0.88)",
            ["secondary", "tertiary"],
            "rgba(244, 247, 255, 0.78)",
            "rgba(232, 238, 252, 0.62)",
          ],
          "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 10, 0.7, 14, 2.6, 17, 8],
        },
      },
      {
        id: "vector-buildings-3d",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 15,
        filter: ["!=", ["get", "hide_3d"], true],
        paint: {
          "fill-extrusion-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "render_height"], 10],
            0,
            "#dfd9cc",
            30,
            "#cfd9f2",
            80,
            "#9eb4f5",
          ],
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.84,
        },
      },
      {
        id: "vector-road-labels",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "transportation_name",
        minzoom: 15.2,
        layout: {
          "symbol-placement": "line",
          "text-field": CJK_NAME_EXPR,
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
        },
        paint: {
          "text-color": "#f5f7ff",
          "text-halo-color": "rgba(10, 15, 30, 0.88)",
          "text-halo-width": 1.4,
        },
      },
      {
        id: "vector-water-labels",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "water_name",
        minzoom: 10,
        filter: ["!", ["within", DISPUTED_LABEL_MASK]],
        layout: {
          "text-field": CJK_NAME_EXPR,
          "text-font": ["Noto Sans Italic"],
          "text-size": 12.5,
        },
        paint: {
          "text-color": "#b8d4ff",
          "text-halo-color": "rgba(8, 16, 42, 0.85)",
          "text-halo-width": 1.4,
        },
      },
      {
        id: "vector-place-labels",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        minzoom: 4,
        filter: PLACE_FILTER_EXPR,
        layout: {
          "text-field": CJK_NAME_EXPR,
          "text-font": ["Noto Sans Bold"],
          "text-size": ["match", ["get", "class"], "city", 14.5, "town", 13, 12.2],
          "text-max-width": 8,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(10, 18, 48, 0.9)",
          "text-halo-width": 1.6,
        },
      },
      // =====================================================================
      // KLEIN-BLUE ARCHIVAL OVERLAY LAYERS (Zones, Great-Circle Routes, Sites)
      // =====================================================================
      {
        id: "archive-zones-fill",
        type: "fill",
        source: "archive-zones",
        paint: {
          "fill-color": "#1326e6",
          "fill-opacity": 0.14,
        },
      },
      {
        id: "archive-zones-line",
        type: "line",
        source: "archive-zones",
        paint: {
          "line-color": "#4d73ff",
          "line-width": 1.6,
          "line-dasharray": [4, 3],
        },
      },
      // 4.2.9: Precision range rings for city/region points at z >= 11
      {
        id: "archive-precision-fill",
        type: "fill",
        source: "archive-precision-ranges",
        minzoom: 11,
        paint: {
          "fill-color": "#1326e6",
          "fill-opacity": 0.13,
        },
      },
      {
        id: "archive-precision-line",
        type: "line",
        source: "archive-precision-ranges",
        minzoom: 11,
        paint: {
          "line-color": "rgba(160, 192, 255, 0.85)",
          "line-width": 1.4,
          "line-dasharray": [4, 3],
        },
      },
      {
        id: "archive-precision-label",
        type: "symbol",
        source: "archive-precision-ranges",
        minzoom: 11,
        layout: {
          "text-field": ["get", "rangeLabel"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#0d1cb8",
          "text-halo-width": 1.6,
        },
      },
      {
        id: "archive-routes-glow",
        type: "line",
        source: "archive-routes",
        paint: {
          "line-color": "rgba(19, 38, 230, 0.34)",
          "line-width": 4.2,
        },
      },
      {
        id: "archive-routes-line",
        type: "line",
        source: "archive-routes",
        paint: {
          "line-color": "#7aa2ff",
          "line-width": 1.5,
          "line-dasharray": [3, 3],
        },
      },
      {
        id: "archive-clusters",
        type: "circle",
        source: "archive-places",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#0d1cb8",
          "circle-radius": ["step", ["get", "point_count"], 16, 4, 20],
          "circle-stroke-width": 2.4,
          "circle-stroke-color": "#fbf8f1",
        },
      },
      {
        id: "archive-cluster-count",
        type: "symbol",
        source: "archive-places",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["to-string", ["get", "point_count"]],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      },
      // 4.2.9: Hide pinpoint marker at z >= 11 when precision != "exact" (replaced by range circle!)
      {
        id: "archive-places-pulse",
        type: "circle",
        source: "archive-places",
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["any", ["==", ["get", "precision"], "exact"], ["<", ["zoom"], 11]],
        ],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 13, 8, 18, 14, 22],
          "circle-color": "rgba(19, 38, 230, 0.22)",
          "circle-stroke-color": "rgba(140, 178, 255, 0.65)",
          "circle-stroke-width": 1.2,
        },
      },
      {
        id: "archive-places-icon",
        type: "symbol",
        source: "archive-places",
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["any", ["==", ["get", "precision"], "exact"], ["<", ["zoom"], 11]],
        ],
        layout: {
          "icon-image": [
            "match",
            ["get", "layer"],
            "scp",
            "arch-scp",
            "mythos",
            "arch-mythos",
            "theology",
            "arch-theology",
            "arch-goi",
          ],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 1, 0.78, 8, 0.94, 14, 1.06],
          "icon-allow-overlap": true,
          "text-field": ["step", ["zoom"], ["get", "name_zh"], 4, ["get", "labelWithDepth"]],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 1, 12.5, 8, 13.5, 13, 14.5],
          "text-offset": [0, 1.35],
          "text-anchor": "top",
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#0d1cb8",
          "text-halo-width": 1.8,
        },
      },
    ],
  };
}

// 4.2.3: Omitted parameters ALWAYS reset to defaults (never sticky!)
export function parseMapSubRoute(rest = "") {
  const [pathPart, queryPart = ""] = String(rest || "").split("?");
  const params = new URLSearchParams(queryPart);
  const rawMode = params.get("mode");
  const mode = rawMode && ["satellite", "paper", "night"].includes(rawMode) ? rawMode : DEFAULT_BASEMAP;
  const layer = params.get("layer") || "all";
  const terrainParam = params.get("terrain");
  const terrain = terrainParam === null ? true : terrainParam !== "0";
  const siteParam = params.get("site") || null;

  const atMatch = pathPart.match(
    /^@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z(?:,(\d+(?:\.\d+)?)p)?(?:,(-?\d+(?:\.\d+)?)b)?/i
  );
  if (atMatch) {
    return {
      hasCamera: true,
      lat: parseFloat(atMatch[1]),
      lon: parseFloat(atMatch[2]),
      zoom: parseFloat(atMatch[3]),
      pitch: atMatch[4] !== undefined ? parseFloat(atMatch[4]) : 0,
      bearing: atMatch[5] !== undefined ? parseFloat(atMatch[5]) : 0,
      siteId: siteParam,
      mode,
      layer,
      terrain,
    };
  }

  const trimmed = pathPart.replace(/^\/+|\/+$/g, "");
  if (trimmed) {
    return {
      hasCamera: false,
      siteId: trimmed,
      mode,
      layer,
      terrain,
    };
  }

  return {
    hasCamera: false,
    siteId: siteParam,
    mode,
    layer,
    terrain,
  };
}

export async function createRealisticEarthController({ onOpenEntry }) {
  // 4.2.1: Fetch places.geojson IN PARALLEL with MapLibre initialization!
  const placesPromise = fetch("./data/map/places.geojson").then((r) => r.json());
  let places = [];

  let basemapMode = DEFAULT_BASEMAP;
  let terrainOn = true;
  let activeLayerFilter = "all";
  let selectedSiteId = null;
  let suppressHashWrite = false;

  // 4.2.5: Consecutive failure counters + 60s auto-recovery timers
  let s2ConsecErr = 0;
  let ofmConsecErr = 0;
  let mhConsecErr = 0;
  let fallbackS2Triggered = false;
  let fallbackOfmTriggered = false;
  let fallbackDemTriggered = false;
  let s2RetryTimer = null;
  let ofmRetryTimer = null;
  let demRetryTimer = null;

  const parsedInit = parseMapSubRoute(
    window.location.hash.startsWith("#/map") ? window.location.hash.slice(6) : ""
  );
  basemapMode = parsedInit.mode;
  terrainOn = parsedInit.terrain;

  let initCenter = [22.0, 20.0];
  let initZoom = 1.45;
  let initPitch = 0;
  let initBearing = 0;

  if (parsedInit.hasCamera) {
    initCenter = [parsedInit.lon, parsedInit.lat];
    initZoom = parsedInit.zoom;
    initPitch = parsedInit.pitch;
    initBearing = parsedInit.bearing;
    selectedSiteId = parsedInit.siteId ? LEGACY_TO_SITE_ID[parsedInit.siteId] || parsedInit.siteId : null;
  } else if (parsedInit.siteId) {
    const normId = LEGACY_TO_SITE_ID[parsedInit.siteId] || parsedInit.siteId;
    const cam = QUICK_SITE_CAM[normId];
    if (cam) {
      initCenter = [cam[0], cam[1]];
      initZoom = cam[2];
      initPitch = cam[3];
    }
    selectedSiteId = normId;
  }

  const tStart = performance.now();
  const initialTerminator = buildSolarTerminatorGeoJSON(new Date());
  const isMobile = window.matchMedia("(max-width: 860px), (pointer: coarse)").matches;

  // 4.2.2: Start pixelRatio at min(devicePixelRatio, 2) on ALL devices; adapt 2 -> 1.5 -> 1 if flight p50 > 33ms
  let currentMaxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  const map = new MapLibreMap({
    container: "maplibre-canvas-host",
    style: buildUnifiedStyle(initialTerminator),
    center: initCenter,
    zoom: initZoom,
    pitch: initPitch,
    bearing: initBearing,
    pixelRatio: currentMaxPixelRatio,
    localIdeographFontFamily:
      '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", "Microsoft YaHei", serif',
    attributionControl: false,
    maxPitch: 78,
    fadeDuration: 0,
    validateStyle: false,
    refreshExpiredTiles: false,
    maxParallelImageRequests: isMobile ? 8 : 16,
    workerCount: isMobile ? 2 : 4,
  });

  map.addControl(
    new AttributionControl({
      compact: isMobile,
      customAttribution: [
        OFM_ATTRIB,
        MAPTERHORN_ATTRIB,
        NASA_ATTRIB,
        "档案图层: 蓝色神学档案馆 (CC BY-SA 3.0)",
      ],
    }),
    "bottom-right"
  );
  map.addControl(new ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-left");
  map.addControl(new NavigationControl({ visualizePitch: true, showCompass: true }), "bottom-right");

  for (const kind of ["scp", "mythos", "theology", "goi"]) {
    map.addImage(`arch-${kind}`, createArchivalIconData(kind), { pixelRatio: 2 });
  }

  // Populate places GeoJSON as soon as parallel fetch finishes
  const applyPlacesData = (placesGeo) => {
    places = placesGeo.features.map((f) => ({
      ...f.properties,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }));
    const setSources = () => {
      const srcP = map.getSource("archive-places");
      const srcR = map.getSource("archive-precision-ranges");
      if (srcP) srcP.setData(placesGeo);
      if (srcR) srcR.setData(buildPrecisionRangeGeoJSON(places));
      if (selectedSiteId) {
        const hit = places.find((p) => p.id === selectedSiteId || p.entryId === selectedSiteId);
        if (hit) renderSiteCard(hit, true);
      }
    };
    if (map.getSource("archive-places")) setSources();
    else map.once("styledata", setSources);
  };
  placesPromise.then(applyPlacesData).catch((err) => console.warn("[map] places.geojson failed:", err));

  const showBanner = (msg) => {
    const b = document.getElementById("map-fallback-banner");
    if (!b) return;
    b.textContent = msg;
    b.classList.add("open");
  };
  const hideBannerIfHealthy = () => {
    if (!fallbackS2Triggered && !fallbackOfmTriggered && !fallbackDemTriggered) {
      document.getElementById("map-fallback-banner")?.classList.remove("open");
    }
  };

  // 4.2.5: Reset consecutive failure count whenever any tile from that source succeeds
  map.on("data", (e) => {
    if (e.dataType !== "source" || !e.tile) return;
    if (e.sourceId === "s2cloudless-2016") s2ConsecErr = 0;
    else if (e.sourceId === "openmaptiles") ofmConsecErr = 0;
    else if (e.sourceId === "terrain-dem" || e.sourceId === "hillshade-dem") mhConsecErr = 0;
  });

  // 4.2.5: Consecutive failure fallback + 60s auto-retry + console.warn for unexpected errors
  map.on("error", (ev) => {
    const msg = String(ev?.error?.message || "");
    const srcId = ev?.sourceId || "";
    if (srcId === "s2cloudless-2016") {
      if (!fallbackS2Triggered) {
        s2ConsecErr++;
        if (s2ConsecErr >= 4 && map.getLayer("fallback-blue-marble")) {
          fallbackS2Triggered = true;
          map.setLayoutProperty("fallback-blue-marble", "visibility", "visible");
          map.setLayoutProperty("sat-eox-layer", "visibility", "none");
          showBanner("卫星瓦片连续受限，已临时切换内置 NASA Blue Marble 底图（60 秒后自动重试）。");
          clearTimeout(s2RetryTimer);
          s2RetryTimer = setTimeout(() => {
            fallbackS2Triggered = false;
            s2ConsecErr = 0;
            applyBasemapAndTerrain();
            hideBannerIfHealthy();
          }, 60000);
        }
      }
    } else if (srcId === "openmaptiles") {
      if (!fallbackOfmTriggered) {
        ofmConsecErr++;
        if (ofmConsecErr >= 5) {
          fallbackOfmTriggered = true;
          for (const lid of [
            "vector-waterways",
            "vector-roads-casing",
            "vector-roads-inner",
            "vector-buildings-3d",
            "vector-road-labels",
            "vector-water-labels",
            "vector-place-labels",
          ]) {
            if (map.getLayer(lid)) map.setLayoutProperty(lid, "visibility", "none");
          }
          showBanner("OpenFreeMap 矢量服务连续超时，已临时降级为纯卫星影像（60 秒后自动重试）。");
          clearTimeout(ofmRetryTimer);
          ofmRetryTimer = setTimeout(() => {
            fallbackOfmTriggered = false;
            ofmConsecErr = 0;
            for (const lid of [
              "vector-waterways",
              "vector-roads-casing",
              "vector-roads-inner",
              "vector-buildings-3d",
              "vector-road-labels",
              "vector-water-labels",
              "vector-place-labels",
            ]) {
              if (map.getLayer(lid)) map.setLayoutProperty(lid, "visibility", "visible");
            }
            applyBasemapAndTerrain();
            hideBannerIfHealthy();
          }, 60000);
        }
      }
    } else if (srcId === "terrain-dem" || srcId === "hillshade-dem") {
      if (!fallbackDemTriggered) {
        mhConsecErr++;
        if (mhConsecErr >= 4 && terrainOn) {
          fallbackDemTriggered = true;
          try {
            map.setTerrain({ source: "terrain-aws", exaggeration: 1.2 });
          } catch (_) {}
          clearTimeout(demRetryTimer);
          demRetryTimer = setTimeout(() => {
            fallbackDemTriggered = false;
            mhConsecErr = 0;
            applyBasemapAndTerrain();
            hideBannerIfHealthy();
          }, 60000);
        }
      }
    } else if (msg && !msg.includes("404") && !msg.includes("AbortError")) {
      console.warn("[map]", ev?.error || msg);
    }
  });

  // 4.2.4: Engage 3D terrain BEFORE flight starts whenever destination zoom >= 4.2 or pitch >= 8
  function ensureTerrainForTarget(targetZoom = map.getZoom(), targetPitch = map.getPitch()) {
    if (!map.getLayer("bg-base")) return;
    const demSource = fallbackDemTriggered ? "terrain-aws" : "terrain-dem";
    const wantTerrain =
      terrainOn && (map.getZoom() >= 4.2 || targetZoom >= 4.2 || map.getPitch() >= 8 || targetPitch >= 8);
    if (wantTerrain) {
      if (!map.getTerrain()) {
        map.setTerrain({ source: demSource, exaggeration: 1.2 });
      }
    } else if (!terrainOn || (map.getZoom() < 3.8 && targetZoom < 3.8 && map.getPitch() < 5 && targetPitch < 5)) {
      if (map.getTerrain()) {
        map.setTerrain(null);
      }
    }
  }

  // 4.2.2 + 4.2.4: Wrap flyTo & easeTo so terrain engages before takeoff AND pixelRatio adapts 2 -> 1.5 -> 1 if p50 > 33ms
  const origFlyTo = map.flyTo.bind(map);
  const origEaseTo = map.easeTo.bind(map);

  function attachAdaptiveDprSampler(durationMs) {
    if (currentMaxPixelRatio <= 1 || (durationMs !== undefined && durationMs < 600)) return;
    const times = [];
    const t0 = performance.now();
    const onRender = () => times.push(performance.now());
    const onEnd = () => {
      map.off("render", onRender);
      map.off("moveend", onEnd);
      if (performance.now() - t0 < 550 || times.length < 8) return;
      const deltas = [];
      for (let i = 1; i < times.length; i++) deltas.push(times[i] - times[i - 1]);
      deltas.sort((a, b) => a - b);
      const p50 = deltas[Math.floor(deltas.length * 0.5)];
      if (p50 > 33) {
        const nextRatio = currentMaxPixelRatio > 1.5 ? 1.5 : 1;
        if (nextRatio < currentMaxPixelRatio) {
          currentMaxPixelRatio = nextRatio;
          map.setPixelRatio(currentMaxPixelRatio);
        }
      }
    };
    map.on("render", onRender);
    map.on("moveend", onEnd);
  }

  map.flyTo = function (options = {}, eventData) {
    ensureTerrainForTarget(options.zoom ?? map.getZoom(), options.pitch ?? map.getPitch());
    attachAdaptiveDprSampler(options.duration ?? 1500);
    return origFlyTo(options, eventData);
  };

  map.easeTo = function (options = {}, eventData) {
    ensureTerrainForTarget(options.zoom ?? map.getZoom(), options.pitch ?? map.getPitch());
    attachAdaptiveDprSampler(options.duration ?? 800);
    return origEaseTo(options, eventData);
  };

  function syncUrlHash() {
    if (suppressHashWrite) return;
    if (!window.location.hash.startsWith("#/map") && window.location.hash !== "" && window.location.hash !== "#/") {
      return;
    }
    const c = map.getCenter();
    const z = map.getZoom();
    const p = Math.round(map.getPitch());
    const b = Math.round(map.getBearing());
    let camPart = `@${c.lat.toFixed(4)},${c.lng.toFixed(4)},${z.toFixed(2)}z`;
    if (p > 0 || b !== 0) camPart += `,${p}p,${b}b`;
    const qp = new URLSearchParams();
    if (basemapMode !== DEFAULT_BASEMAP) qp.set("mode", basemapMode);
    if (!terrainOn) qp.set("terrain", "0");
    if (activeLayerFilter !== "all") qp.set("layer", activeLayerFilter);
    if (selectedSiteId) qp.set("site", selectedSiteId);
    const qs = qp.toString();
    const nextHash = `#/map/${camPart}${qs ? "?" + qs : ""}`;
    if (window.location.hash !== nextHash) {
      history.replaceState(null, "", nextHash);
    }
  }

  function applyBasemapAndTerrain(targetZoom = map.getZoom(), targetPitch = map.getPitch()) {
    if (!map.isStyleLoaded() && !map.getLayer("bg-base")) return;
    const isSat = basemapMode === "satellite";
    const isPaper = basemapMode === "paper";
    const isNight = basemapMode === "night";
    document.getElementById("stage-map")?.setAttribute("data-basemap", basemapMode);

    document.querySelectorAll("[data-basemap]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.basemap === basemapMode);
    });
    const terBtn = document.getElementById("btn-map-terrain");
    if (terBtn) {
      terBtn.classList.toggle("active", terrainOn);
      terBtn.textContent = `3D 地形: ${terrainOn ? "开" : "关"}`;
    }

    map.setPaintProperty("bg-base", "background-color", isPaper ? "#f5f0e6" : "#050916");
    map.setSky(
      isPaper
        ? {
            "sky-color": "#efe8d8",
            "sky-horizon-blend": 0.45,
            "horizon-color": "#cbd5f0",
            "horizon-fog-blend": 0.5,
            "fog-color": "#f5f0e6",
            "fog-ground-blend": 0.3,
            "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.55, 6, 0],
          }
        : isNight
          ? {
              "sky-color": "#03050c",
              "sky-horizon-blend": 0.35,
              "horizon-color": "#263c85",
              "horizon-fog-blend": 0.6,
              "fog-color": "#080d1c",
              "fog-ground-blend": 0.3,
              "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.78, 6, 0],
            }
          : {
              "sky-color": "#050a1c",
              "sky-horizon-blend": 0.38,
              "horizon-color": "#4f7ff7",
              "horizon-fog-blend": 0.55,
              "fog-color": "#0c1738",
              "fog-ground-blend": 0.25,
              "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.88, 5, 0.45, 8, 0],
            }
    );

    map.setLayoutProperty("sat-eox-layer", "visibility", isSat && !fallbackS2Triggered ? "visible" : "none");
    map.setLayoutProperty("fallback-blue-marble", "visibility", isSat && fallbackS2Triggered ? "visible" : "none");
    map.setLayoutProperty("night-viirs-layer", "visibility", isNight ? "visible" : "none");

    map.setLayoutProperty("terminator-night-fill", "visibility", isSat ? "visible" : "none");
    map.setLayoutProperty("terminator-twilight-line", "visibility", isSat ? "visible" : "none");

    map.setLayoutProperty("paper-landcover", "visibility", isPaper ? "visible" : "none");
    map.setLayoutProperty("vector-water-fill", "visibility", isPaper || isNight ? "visible" : "none");
    map.setLayoutProperty("vector-coastline", "visibility", isPaper || isNight ? "visible" : "none");
    if (isPaper) {
      map.setPaintProperty("vector-water-fill", "fill-color", "#dfe6f4");
      map.setPaintProperty("vector-coastline", "line-color", "rgba(19, 38, 230, 0.42)");
    } else if (isNight) {
      map.setPaintProperty("vector-water-fill", "fill-color", "rgba(7, 11, 22, 0.72)");
      map.setPaintProperty("vector-coastline", "line-color", "rgba(115, 144, 250, 0.32)");
    }

    if (!fallbackOfmTriggered) {
      const roadMinZ = isSat ? 10 : 5;
      map.setLayerZoomRange("vector-roads-casing", roadMinZ, 24);
      map.setLayerZoomRange("vector-roads-inner", roadMinZ, 24);
      map.setLayerZoomRange("vector-waterways", isSat ? 10 : 5, 24);
      map.setLayerZoomRange("vector-place-labels", 4, 24);
      map.setLayerZoomRange("vector-water-labels", isSat ? 10 : 4, 24);

      if (isPaper) {
        map.setPaintProperty("vector-roads-casing", "line-color", "rgba(29, 31, 36, 0.22)");
        map.setPaintProperty("vector-roads-inner", "line-color", "#4a5060");
        map.setPaintProperty("vector-waterways", "line-color", "rgba(19, 38, 230, 0.55)");
        map.setPaintProperty("vector-place-labels", "text-color", "#1d1f24");
        map.setPaintProperty("vector-place-labels", "text-halo-color", "rgba(245, 240, 230, 0.95)");
        map.setPaintProperty("vector-road-labels", "text-color", "#2d323d");
        map.setPaintProperty("vector-road-labels", "text-halo-color", "rgba(245, 240, 230, 0.95)");
        map.setPaintProperty("vector-water-labels", "text-color", "#1326e6");
        map.setPaintProperty("vector-water-labels", "text-halo-color", "rgba(245, 240, 230, 0.95)");
        map.setPaintProperty("vector-buildings-3d", "fill-extrusion-color", "#dcd4c2");
        map.setPaintProperty("archive-places-icon", "text-color", "#0d1cb8");
        map.setPaintProperty("archive-places-icon", "text-halo-color", "#fbf8f1");
        map.setPaintProperty("archive-precision-label", "text-color", "#0d1cb8");
        map.setPaintProperty("archive-precision-label", "text-halo-color", "#fbf8f1");
        map.setPaintProperty("archive-routes-line", "line-color", "#1326e6");
      } else {
        map.setPaintProperty("vector-roads-casing", "line-color", "rgba(10, 16, 34, 0.55)");
        map.setPaintProperty(
          "vector-roads-inner",
          "line-color",
          isNight ? "rgba(148, 168, 224, 0.42)" : "rgba(248, 244, 228, 0.82)"
        );
        map.setPaintProperty("vector-waterways", "line-color", "rgba(82, 148, 255, 0.68)");
        map.setPaintProperty("vector-place-labels", "text-color", isNight ? "#e4e9f5" : "#ffffff");
        map.setPaintProperty("vector-place-labels", "text-halo-color", "rgba(10, 18, 48, 0.92)");
        map.setPaintProperty("vector-road-labels", "text-color", "#f5f7ff");
        map.setPaintProperty("vector-road-labels", "text-halo-color", "rgba(10, 15, 30, 0.88)");
        map.setPaintProperty("vector-water-labels", "text-color", "#b8d4ff");
        map.setPaintProperty("vector-water-labels", "text-halo-color", "rgba(8, 16, 42, 0.85)");
        map.setPaintProperty("vector-buildings-3d", "fill-extrusion-color", isNight ? "#26314d" : "#d8deed");
        map.setPaintProperty("archive-places-icon", "text-color", "#ffffff");
        map.setPaintProperty("archive-places-icon", "text-halo-color", "#0d1cb8");
        map.setPaintProperty("archive-precision-label", "text-color", "#ffffff");
        map.setPaintProperty("archive-precision-label", "text-halo-color", "#0d1cb8");
        map.setPaintProperty("archive-routes-line", "line-color", "#7aa2ff");
      }
    }

    ensureTerrainForTarget(targetZoom, targetPitch);

    if (terrainOn && isPaper) {
      map.setLayoutProperty("terrain-hillshade", "visibility", "visible");
      map.setPaintProperty("terrain-hillshade", "hillshade-exaggeration", 0.48);
      map.setPaintProperty("terrain-hillshade", "hillshade-shadow-color", "#7a7262");
    } else {
      map.setLayoutProperty("terrain-hillshade", "visibility", "none");
    }
  }

  function applyArchiveLayerFilter(layerVal) {
    activeLayerFilter = layerVal;
    document.querySelectorAll("[data-archlayer]").forEach((b) => {
      b.classList.toggle("active", b.dataset.archlayer === layerVal);
    });
    const baseUnclustered = [
      "all",
      ["!", ["has", "point_count"]],
      ["any", ["==", ["get", "precision"], "exact"], ["<", ["zoom"], 11]],
    ];
    const filterExpr =
      layerVal === "all"
        ? baseUnclustered
        : layerVal === "theology-goi"
          ? ["all", baseUnclustered, ["in", ["get", "layer"], ["literal", ["theology", "goi"]]]]
          : ["all", baseUnclustered, ["==", ["get", "layer"], layerVal]];

    if (map.getLayer("archive-places-icon")) map.setFilter("archive-places-icon", filterExpr);
    if (map.getLayer("archive-places-pulse")) map.setFilter("archive-places-pulse", filterExpr);

    const zoneRouteFilter =
      layerVal === "all"
        ? null
        : layerVal === "theology-goi"
          ? ["in", ["get", "layer"], ["literal", ["theology", "goi"]]]
          : ["==", ["get", "layer"], layerVal];
    for (const lid of [
      "archive-zones-fill",
      "archive-zones-line",
      "archive-precision-fill",
      "archive-precision-line",
      "archive-precision-label",
      "archive-routes-glow",
      "archive-routes-line",
    ]) {
      if (map.getLayer(lid)) map.setFilter(lid, zoneRouteFilter);
    }
  }

  function renderSiteCard(site, skipHashSync = false) {
    const card = document.getElementById("map-site-card");
    if (!card) return;
    if (!site) {
      selectedSiteId = null;
      card.classList.remove("open");
      if (!skipHashSync) syncUrlHash();
      return;
    }
    selectedSiteId = site.id;
    const provLabel =
      site.provenance === "scp-canon"
        ? "SCP 维基原典 (CC BY-SA 3.0)"
        : site.provenance === "cthulhu-canon"
          ? "克苏鲁神话原典 (公有领域)"
          : "本站原创设定 (CC BY-SA 3.0)";
    const badgeCls =
      site.provenance === "scp-canon"
        ? "badge-gold"
        : site.provenance === "cthulhu-canon"
          ? "badge-cyan"
          : "badge-crimson";
    const coordDisplay = formatSiteCoord(site.lat, site.lon, site.precision);
    const entryHref = `#/entry/${encodeURIComponent(site.entryId)}`;

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; border-bottom:1px solid var(--border); padding-bottom:8px;">
        <div>
          <span class="${badgeCls}">${escapeHtml(provLabel)}</span>
          <h3 class="condensed-monument" style="font-size:20px; margin-top:6px; display:block;">${escapeHtml(site.name_zh)}</h3>
          <div style="font-size:12.5px; color:var(--ink-sec);">${escapeHtml(site.name_en)}</div>
        </div>
        <button id="map-card-close" type="button" class="bp-btn" style="padding:4px 10px;">× 关闭</button>
      </div>
      <div class="infobox-list" style="margin-top:2px;">
        <div class="infobox-item"><span class="infobox-label">经纬度：</span><span class="infobox-val">${escapeHtml(coordDisplay)}</span></div>
        <div class="infobox-item"><span class="infobox-label">真实高程/水深：</span><span class="infobox-val">${escapeHtml(site.elevDisplay)}</span></div>
        <div class="infobox-item" style="grid-column:1 / -1;"><span class="infobox-label">坐标依据：</span><span class="infobox-val">${escapeHtml(site.coordSource)}</span>${site.provenance === "original" ? '<span class="orig-field-tag">本站设定</span>' : ""}</div>
      </div>
      <p class="desc-copy">${escapeHtml(site.summary)}</p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        <button id="map-card-zoom-street" type="button" class="bp-btn">拉近查看地貌 (${site.realElevationM < -100 ? "z7" : "z15"})</button>
        <a id="map-card-open-entry" class="bp-btn active" style="text-decoration:none; text-align:center;" href="${escapeHtml(entryHref)}">打开档案 →</a>
      </div>
    `;
    card.classList.add("open");
    card.querySelector("#map-card-close")?.addEventListener("click", () => renderSiteCard(null));
    card.querySelector("#map-card-zoom-street")?.addEventListener("click", () => {
      const targetZ = site.realElevationM < -100 ? 7 : 15.5;
      map.flyTo({
        center: [site.lon, site.lat],
        zoom: targetZ,
        pitch: site.realElevationM < -100 ? 0 : 55,
        duration: 1600,
      });
    });
    if (!skipHashSync) syncUrlHash();
  }

  map.once("load", () => {
    window.__earthLoadMs = Number((performance.now() - tStart).toFixed(1));
    applyBasemapAndTerrain(initZoom, initPitch);
    applyArchiveLayerFilter(parsedInit.layer);
    if (selectedSiteId && places.length) {
      const hit = places.find((p) => p.id === selectedSiteId || p.entryId === selectedSiteId);
      if (hit) renderSiteCard(hit, true);
    }
    window.__earthMapLoaded = true;
  });

  setInterval(() => {
    const src = map.getSource("solar-terminator");
    if (src) src.setData(buildSolarTerminatorGeoJSON(new Date()));
  }, 60000);

  map.on("moveend", () => {
    applyBasemapAndTerrain();
    syncUrlHash();
  });

  const handleMarkerClick = (e) => {
    const feat = e.features?.[0];
    if (!feat) return;
    const hit = places.find((p) => p.id === feat.properties.id);
    if (hit) {
      renderSiteCard(hit);
      map.flyTo({
        center: [hit.lon, hit.lat],
        zoom: Math.max(map.getZoom(), hit.defaultZoom || 8),
        duration: 1100,
      });
    }
  };
  map.on("click", "archive-places-icon", handleMarkerClick);
  map.on("click", "archive-precision-fill", handleMarkerClick);

  map.on("click", "archive-clusters", async (e) => {
    const feat = e.features?.[0];
    if (!feat) return;
    const clusterId = feat.properties.cluster_id;
    const src = map.getSource("archive-places");
    const zoom = await src.getClusterExpansionZoom(clusterId);
    map.easeTo({ center: feat.geometry.coordinates, zoom, duration: 700 });
  });

  for (const lid of ["archive-places-icon", "archive-precision-fill", "archive-clusters"]) {
    map.on("mouseenter", lid, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", lid, () => {
      map.getCanvas().style.cursor = "";
    });
  }

  document.querySelectorAll("[data-basemap]").forEach((btn) => {
    btn.addEventListener("click", () => {
      basemapMode = btn.dataset.basemap;
      applyBasemapAndTerrain();
      syncUrlHash();
    });
  });

  document.getElementById("btn-map-terrain")?.addEventListener("click", () => {
    terrainOn = !terrainOn;
    applyBasemapAndTerrain();
    syncUrlHash();
  });

  document.querySelectorAll("[data-archlayer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyArchiveLayerFilter(btn.dataset.archlayer);
      syncUrlHash();
    });
  });

  const searchInput = document.getElementById("map-place-search");
  const searchResults = document.getElementById("map-search-results");
  function updateSearchDropdown(raw) {
    if (!searchResults) return;
    const q = String(raw || "").trim().toLowerCase();
    const list = !q
      ? places
      : places.filter(
          (p) =>
            p.name_zh.toLowerCase().includes(q) ||
            p.name_en.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q) ||
            p.z12RealDesc.toLowerCase().includes(q)
        );
    searchResults.innerHTML = list.length
      ? list
          .map(
            (p) => `
          <button type="button" class="map-search-item" data-pid="${escapeHtml(p.id)}">
            <span><b>${escapeHtml(p.name_zh)}</b> <span style="font-size:12px; color:var(--ink-sec);">${escapeHtml(p.code)}</span></span>
            <span style="font-size:12px; color:var(--klein);">${escapeHtml(p.elevDisplay)}</span>
          </button>`
          )
          .join("")
      : `<div style="padding:8px 10px; font-size:13.5px; color:var(--ink-sec);">未匹配到档案地点</div>`;

    searchResults.querySelectorAll(".map-search-item").forEach((b) => {
      b.addEventListener("click", () => {
        const hit = places.find((x) => x.id === b.dataset.pid);
        searchResults.classList.remove("open");
        if (hit) {
          renderSiteCard(hit);
          map.flyTo({
            center: [hit.lon, hit.lat],
            zoom: hit.defaultZoom || 11,
            pitch: hit.id === "site-2000" ? 55 : 0,
            duration: 1400,
          });
        }
      });
    });
  }

  if (searchInput && searchResults) {
    searchInput.addEventListener("focus", () => {
      updateSearchDropdown(searchInput.value);
      searchResults.classList.add("open");
    });
    searchInput.addEventListener("input", () => {
      updateSearchDropdown(searchInput.value);
      searchResults.classList.add("open");
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#map-search-wrap")) {
        searchResults.classList.remove("open");
      }
    });
  }

  // 4.2.3: Every omitted parameter resets cleanly to default
  function applySubRoute(rest) {
    const parsed = parseMapSubRoute(rest);
    suppressHashWrite = true;
    try {
      basemapMode = parsed.mode;
      terrainOn = parsed.terrain;
      applyArchiveLayerFilter(parsed.layer);

      if (parsed.hasCamera) {
        if (!parsed.siteId) {
          renderSiteCard(null, true);
        } else {
          const norm = LEGACY_TO_SITE_ID[parsed.siteId] || parsed.siteId;
          selectedSiteId = norm;
          const hit = places.find((p) => p.id === norm || p.entryId === norm);
          if (hit) renderSiteCard(hit, true);
        }
        applyBasemapAndTerrain(parsed.zoom, parsed.pitch);
        map.jumpTo({
          center: [parsed.lon, parsed.lat],
          zoom: parsed.zoom,
          pitch: parsed.pitch,
          bearing: parsed.bearing,
        });
      } else if (parsed.siteId) {
        const norm = LEGACY_TO_SITE_ID[parsed.siteId] || parsed.siteId;
        selectedSiteId = norm;
        const hit = places.find((p) => p.id === norm || p.entryId === norm);
        const cam = QUICK_SITE_CAM[norm];
        const targetLon = hit ? hit.lon : cam ? cam[0] : 22.0;
        const targetLat = hit ? hit.lat : cam ? cam[1] : 20.0;
        const targetZoom = hit ? hit.defaultZoom || 11 : cam ? cam[2] : 11;
        const targetPitch = norm === "site-2000" ? 60 : cam ? cam[3] : 0;
        applyBasemapAndTerrain(targetZoom, targetPitch);
        map.jumpTo({
          center: [targetLon, targetLat],
          zoom: targetZoom,
          pitch: targetPitch,
          bearing: 0,
        });
        if (hit) renderSiteCard(hit, true);
      } else {
        renderSiteCard(null, true);
        applyBasemapAndTerrain(1.45, 0);
        map.jumpTo({ center: [22.0, 20.0], zoom: 1.45, pitch: 0, bearing: 0 });
      }
    } finally {
      suppressHashWrite = false;
    }
    map.resize();
  }

  const controller = {
    map,
    get places() {
      return places;
    },
    get pixelRatio() {
      return map.getPixelRatio();
    },
    applySubRoute,
    clearSelection() {
      renderSiteCard(null);
    },
    setBasemap(m) {
      basemapMode = m;
      applyBasemapAndTerrain();
      syncUrlHash();
    },
    selectSite(idOrLegacy) {
      const norm = LEGACY_TO_SITE_ID[idOrLegacy] || idOrLegacy;
      window.location.hash = `#/map/${encodeURIComponent(norm)}`;
    },
    resize() {
      map.resize();
    },
  };

  window.__earthMapApi = controller;
  return controller;
}
