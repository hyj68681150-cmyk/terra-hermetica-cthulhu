/**
 * js/realistic-map.js
 * Copperplate Klein-Blue & Realistic 3D Globe (#/map) — Visual System v5
 * Powered by self-hosted MapLibre GL JS v6.18.0 (BSD-3).
 *
 * Visual Grammar (05 Section 3):
 *  - Default "copperplate" mode: desaturated Sentinel-2 etched over #0a1890 Klein blue + white hairlines.
 *  - Switchable "realistic" true-color toggle, monochrome Klein-blue "paper", & silver-white "night" modes.
 *  - Roman numerals (I–XIV) + monochrome planetary symbols (☉ ☽ ♄ ☿, U+FE0E text presentation).
 *  - Strictly zero national/disputed borders ("国界线不要画") & disputed-zone `within` label mask.
 */
import { Map as MapLibreMap, ScaleControl } from "../vendor/maplibre-gl@6.18.0/maplibre-gl.mjs";
import { escapeHtml } from "./sanitize.js";

const DEFAULT_BASEMAP = "copperplate";

const CJK_NAME_EXPR = [
  "coalesce",
  ["get", "name:zh-Hans"],
  ["get", "name:zh"],
  ["get", "name:en"],
  ["get", "name:latin"],
  ["get", "name"],
];

// Planetary symbols with U+FE0E Variation Selector-15 (strictly monochrome glyph, never emoji)
export const LAYER_GLYPH = {
  theology: "☉\uFE0E",
  mythos: "☽\uFE0E",
  scp: "♄\uFE0E",
  goi: "☿\uFE0E",
};

const SITE_LATIN_SLUG = {
  "site-rlyeh": "R'LYEH",
  "site-alexandria": "ALEXANDRIA",
  "site-2000": "YELLOWSTONE · SCP-MM",
  "site-001": "MESOPOTAMIA · PORTA",
  "site-prague": "PRAGA · ALAGADDA",
  "site-13": "BIG BEND · SITE-XIII",
  "site-cairo": "MEMPHIS · GIZA",
  "site-antarctica": "MONTES INSANIAE",
  "site-penglai": "PENGLAI · MARE",
  "site-baikal": "BAIKAL · SCP-DCX",
  "site-arkham": "ARKHAM · OSTIVM",
  "site-innsmouth": "INNSMOVTH · SCOPVLVS",
  "site-leng": "PAMIR · LENG",
  "site-3000-bengal": "SINVS GANGETICVS",
};

const DISPUTED_LABEL_MASK = {
  type: "MultiPolygon",
  coordinates: [
    [[[91.5, 26.8], [97.6, 26.8], [97.6, 29.45], [91.5, 29.45], [91.5, 26.8]]],
    [[[77.4, 33.2], [80.6, 33.2], [80.6, 36.1], [77.4, 36.1], [77.4, 33.2]]],
    [[[123.1, 25.5], [124.8, 25.5], [124.8, 26.1], [123.1, 26.1], [123.1, 25.5]]],
    [[[109.6, 3.5], [119.5, 3.5], [119.5, 21.1], [116.0, 21.1], [111.0, 17.5], [109.6, 3.5]]],
  ],
};

const QUICK_SITE_CAM = {
  "site-rlyeh": [-126.7167, -47.15, 5, 0],
  "site-alexandria": [29.8856, 31.214, 12, 0],
  "site-2000": [-110.498, 44.462, 10, 60],
  "site-001": [47.4395, 31.0044, 12, 0],
  "site-prague": [14.3965, 50.0933, 13, 0],
  "site-13": [-103.965, 29.475, 10.5, 28],
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

// Roman numeral expression for cluster point_count (II .. XIV)
const CLUSTER_ROMAN_EXPR = [
  "match",
  ["get", "point_count"],
  2, "II",
  3, "III",
  4, "IV",
  5, "V",
  6, "VI",
  7, "VII",
  8, "VIII",
  9, "IX",
  10, "X",
  11, "XI",
  12, "XII",
  13, "XIII",
  14, "XIV",
  ["to-string", ["get", "point_count"]],
];

function geodesicCircleRing([lonDeg, latDeg], radiusKm, steps = 48) {
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
        layer: p.layer,
        precision: p.precision,
      },
      geometry: {
        type: "Polygon",
        coordinates: [geodesicCircleRing([p.lon, p.lat], radKm, 48)],
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function formatSiteCoord(lat, lon, precision) {
  const digits = precision === "exact" ? 4 : 1;
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(digits)}°${ns} · ${Math.abs(lon).toFixed(digits)}°${ew}`;
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

/**
 * 05 Section 3.1: Small solid dot + two concentric hairline rings (no glow sticker).
 */
function createHairlineMarkerIcon(strokeHex) {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const cx = size / 2;
  const cy = size / 2;

  // Outer hairline ring (0.8px @ 1x -> 1.5px @ 2x)
  ctx.strokeStyle = strokeHex === "#ffffff" ? "rgba(255, 255, 255, 0.40)" : "rgba(10, 24, 144, 0.42)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.stroke();

  // Inner hairline ring
  ctx.strokeStyle = strokeHex === "#ffffff" ? "rgba(255, 255, 255, 0.82)" : "rgba(10, 24, 144, 0.85)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, 13, 0, Math.PI * 2);
  ctx.stroke();

  // Crisp 4 cardinal tick marks on outer ring
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22);
    ctx.lineTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26);
    ctx.stroke();
  }

  // Solid center point
  ctx.fillStyle = strokeHex;
  ctx.beginPath();
  ctx.arc(cx, cy, 4.4, 0, Math.PI * 2);
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

// 05 Section 3.1 + 4.2.6 + 4.2.7: Only city & town, rank-controlled, with z4-10 capitals/major cities & disputed mask
const PLACE_FILTER_EXPR = [
  "all",
  ["!", ["within", DISPUTED_LABEL_MASK]],
  [
    "step",
    ["zoom"],
    // z < 6: capitals & global rank <= 3 cities
    [
      "all",
      ["==", ["get", "class"], "city"],
      ["any", ["==", ["get", "capital"], 2], ["<=", ["coalesce", ["get", "rank"], 99], 3]],
    ],
    6,
    // 6 <= z < 8: capitals & rank <= 4 cities
    [
      "all",
      ["==", ["get", "class"], "city"],
      ["any", ["==", ["get", "capital"], 2], ["<=", ["coalesce", ["get", "rank"], 99], 4]],
    ],
    8,
    // 8 <= z < 10: capitals & rank <= 6 cities
    [
      "all",
      ["==", ["get", "class"], "city"],
      ["any", ["==", ["get", "capital"], 2], ["<=", ["coalesce", ["get", "rank"], 99], 6]],
    ],
    10,
    // 10 <= z < 13: city & major town (rank <= 9)
    [
      "all",
      ["in", ["get", "class"], ["literal", ["city", "town"]]],
      ["<=", ["coalesce", ["get", "rank"], 9], 9],
    ],
    13,
    // z >= 13: city & town only (keeps copperplate street map clean & airy per 05 Section 3.1)
    ["in", ["get", "class"], ["literal", ["city", "town"]]],
  ],
];

function buildUnifiedStyle(initialTerminator) {
  return {
    version: 8,
    name: "Theologia Caerulea Copperplate & Realistic Atlas",
    projection: {
      type: ["interpolate", ["linear"], ["zoom"], 5.5, "vertical-perspective", 6.8, "mercator"],
    },
    sky: {
      "sky-color": "#061066",
      "sky-horizon-blend": 0.48,
      "horizon-color": "#1c3fd6",
      "horizon-fog-blend": 0.68,
      "fog-color": "#0a1890",
      "fog-ground-blend": 0.48,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.90, 5, 0.45, 8, 0],
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
      },
      "viirs-night": {
        type: "raster",
        tiles: [
          "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/2012-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
        ],
        tileSize: 256,
        maxzoom: 8,
      },
      openmaptiles: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
      },
      "terrain-dem": {
        type: "raster-dem",
        tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
        encoding: "terrarium",
        tileSize: 512,
        maxzoom: 14,
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
      // Deep Klein-Blue Ground Plate (#0a1890 default)
      {
        id: "bg-base",
        type: "background",
        paint: { "background-color": "#0a1890" },
      },
      {
        id: "fallback-blue-marble",
        type: "raster",
        source: "blue-marble-fallback",
        layout: { visibility: "none" },
        paint: {
          "raster-saturation": -1,
          "raster-contrast": 0.28,
          "raster-opacity": 0.58,
        },
      },
      // Default Copperplate Desaturated Satellite over #0a1890 (fades to 0.35 at z>=14 per 3.2.F!)
      {
        id: "sat-eox-layer",
        type: "raster",
        source: "s2cloudless-2016",
        layout: { visibility: "visible" },
        paint: {
          "raster-fade-duration": 0,
          "raster-saturation": -1,
          "raster-contrast": 0.28,
          "raster-brightness-min": 0.03,
          "raster-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.58, 13, 0.56, 14.2, 0.35],
        },
      },
      // Desaturated Silver-White Night Lights over Deep Klein Blue (05 Section 3.1/3.2.A)
      {
        id: "night-viirs-layer",
        type: "raster",
        source: "viirs-night",
        layout: { visibility: "none" },
        paint: {
          "raster-fade-duration": 0,
          "raster-saturation": -1,
          "raster-contrast": 0.36,
          "raster-brightness-min": 0.02,
          "raster-opacity": 0.82,
        },
      },
      // Monochrome Paper & Night Water / Coastlines (Strictly Blue + White, NO boundary layers!)
      {
        id: "vector-water-fill",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        layout: { visibility: "none" },
        paint: { "fill-color": "#e6ecfa" },
      },
      {
        id: "vector-coastline",
        type: "line",
        source: "openmaptiles",
        "source-layer": "water",
        layout: { visibility: "none" },
        paint: {
          "line-color": "rgba(10, 24, 144, 0.45)",
          "line-width": 0.8,
        },
      },
      // Monochrome Klein-Blue Hillshade for Paper Mode
      {
        id: "terrain-hillshade",
        type: "hillshade",
        source: "hillshade-dem",
        layout: { visibility: "none" },
        paint: {
          "hillshade-exaggeration": 0.24,
          "hillshade-shadow-color": "#0d1cb8",
          "hillshade-highlight-color": "#ffffff",
          "hillshade-accent-color": "#0a1890",
        },
      },
      // Semi-transparent Deep Klein-Blue Solar Terminator
      {
        id: "terminator-night-fill",
        type: "fill",
        source: "solar-terminator",
        maxzoom: 7,
        filter: ["==", ["get", "kind"], "night-hemisphere"],
        layout: { visibility: "visible" },
        paint: {
          "fill-color": "#030838",
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.38, 5, 0.22, 7, 0],
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
          "line-color": "rgba(255, 255, 255, 0.28)",
          "line-width": 0.75,
        },
      },
      // Hairline Waterways & Roads (Etched White Lines on Copperplate, Klein-Blue on Paper)
      {
        id: "vector-waterways",
        type: "line",
        source: "openmaptiles",
        "source-layer": "waterway",
        minzoom: 10,
        paint: {
          "line-color": "rgba(255, 255, 255, 0.42)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 15, 1.4],
        },
      },
      {
        id: "vector-roads-casing",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        minzoom: 10,
        layout: { visibility: "none" },
        paint: {
          "line-color": "rgba(6, 12, 32, 0.50)",
          "line-width": ["interpolate", ["exponential", 1.35], ["zoom"], 10, 1.1, 14, 3.6, 17, 9],
        },
      },
      {
        id: "vector-roads-inner",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        minzoom: 10,
        paint: {
          "line-color": "rgba(255, 255, 255, 0.58)",
          "line-width": ["interpolate", ["exponential", 1.35], ["zoom"], 10, 0.5, 14, 1.0, 17, 2.2],
        },
      },
      // 05 Section 3.2.F: Street-Level White Hairline Building Footprints (z >= 14)
      {
        id: "vector-building-outlines",
        type: "line",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 14,
        paint: {
          "line-color": "rgba(255, 255, 255, 0.46)",
          "line-width": 0.75,
        },
      },
      // 05 Section 3.2.F: Uniform Pale Ice-Blue-White 3D Extruded Buildings at 0.55 Opacity (z >= 15)
      {
        id: "vector-buildings-3d",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 15,
        filter: ["!=", ["get", "hide_3d"], true],
        paint: {
          "fill-extrusion-color": "#dce6ff",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.55,
        },
      },
      // Labels: Noto Sans Regular, wide tracking, soft subtle halo (NO country/state/boundary!)
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
          "text-size": 11.5,
          "text-letter-spacing": 0.08,
        },
        paint: {
          "text-color": "rgba(255, 255, 255, 0.85)",
          "text-halo-color": "rgba(8, 18, 112, 0.82)",
          "text-halo-width": 0.9,
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
          "text-size": 12,
          "text-letter-spacing": 0.14,
        },
        paint: {
          "text-color": "rgba(255, 255, 255, 0.78)",
          "text-halo-color": "rgba(8, 18, 112, 0.78)",
          "text-halo-width": 0.9,
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
          "text-font": ["Noto Sans Regular"],
          "text-size": ["match", ["get", "class"], "city", 13.5, 12],
          "text-letter-spacing": 0.14,
          "text-max-width": 8,
        },
        paint: {
          "text-color": "rgba(255, 255, 255, 0.88)",
          "text-halo-color": "rgba(6, 15, 96, 0.82)",
          "text-halo-width": 0.9,
        },
      },

      // =====================================================================
      // HAIRLINE ARCHIVAL OVERLAY LAYERS (Zones, Precision Rings, 0.8px Routes, Roman Markers)
      // =====================================================================
      {
        id: "archive-zones-fill",
        type: "fill",
        source: "archive-zones",
        paint: {
          "fill-color": "#ffffff",
          "fill-opacity": 0.06,
        },
      },
      {
        id: "archive-zones-line",
        type: "line",
        source: "archive-zones",
        paint: {
          "line-color": "rgba(255, 255, 255, 0.42)",
          "line-width": 0.85,
        },
      },
      // 4.2.9: Semi-transparent uncertainty circle at z >= 11 for city/region points (no duplicate text!)
      {
        id: "archive-precision-fill",
        type: "fill",
        source: "archive-precision-ranges",
        minzoom: 11,
        paint: {
          "fill-color": "#ffffff",
          "fill-opacity": 0.09,
        },
      },
      {
        id: "archive-precision-line",
        type: "line",
        source: "archive-precision-ranges",
        minzoom: 11,
        paint: {
          "line-color": "rgba(255, 255, 255, 0.62)",
          "line-width": 0.9,
        },
      },
      // 05 Section 3.1: 0.8px 50%-opacity solid white great-circle routes (NO glow layer!)
      {
        id: "archive-routes-line",
        type: "line",
        source: "archive-routes",
        paint: {
          "line-color": "rgba(255, 255, 255, 0.50)",
          "line-width": 0.85,
        },
      },
      // Clustered Double-Hairline Rings with Roman Numeral Counts (II .. XIV)
      {
        id: "archive-clusters-outer",
        type: "circle",
        source: "archive-places",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "rgba(8, 20, 128, 0.55)",
          "circle-radius": ["step", ["get", "point_count"], 17, 4, 21],
          "circle-stroke-width": 0.85,
          "circle-stroke-color": "rgba(255, 255, 255, 0.45)",
        },
      },
      {
        id: "archive-clusters",
        type: "circle",
        source: "archive-places",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "rgba(8, 20, 128, 0.82)",
          "circle-radius": ["step", ["get", "point_count"], 13, 4, 16],
          "circle-stroke-width": 0.95,
          "circle-stroke-color": "#ffffff",
        },
      },
      {
        id: "archive-cluster-count",
        type: "symbol",
        source: "archive-places",
        filter: ["has", "point_count"],
        layout: {
          "text-field": CLUSTER_ROMAN_EXPR,
          "text-font": ["Noto Sans Regular"],
          "text-size": 11.5,
          "text-letter-spacing": 0.08,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      },
      // Individual Hairline Double-Ring Markers (dot hides at z>=11 when precision != exact, label stays centered!)
      {
        id: "archive-places-icon",
        type: "symbol",
        source: "archive-places",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": "arch-dot-light",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 1, 0.72, 8, 0.88, 14, 0.96],
          "icon-allow-overlap": true,
          "text-field": [
            "step",
            ["zoom"],
            ["concat", ["get", "roman"], " · ", ["get", "name_zh"]],
            5,
            ["concat", ["get", "roman"], " · ", ["get", "labelWithDepth"]],
          ],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 1, 11.5, 8, 12.5, 13, 13],
          "text-letter-spacing": 0.12,
          "text-offset": [0, 1.25],
          "text-anchor": "top",
          "text-allow-overlap": true,
        },
        paint: {
          "icon-opacity": [
            "step",
            ["zoom"],
            1,
            11,
            ["case", ["==", ["get", "precision"], "exact"], 1, 0],
          ],
          "text-color": "#ffffff",
          "text-halo-color": "rgba(7, 18, 118, 0.78)",
          "text-halo-width": 0.9,
        },
      },
    ],
  };
}

export function parseMapSubRoute(rest = "") {
  const [pathPart, queryPart = ""] = String(rest || "").split("?");
  const params = new URLSearchParams(queryPart);
  const rawMode = params.get("mode");
  const normMode = rawMode === "satellite" ? "realistic" : rawMode;
  const mode =
    normMode && ["copperplate", "realistic", "paper", "night"].includes(normMode) ? normMode : DEFAULT_BASEMAP;
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
  const placesPromise = fetch("./data/map/places.geojson").then((r) => r.json());
  let places = [];

  let basemapMode = DEFAULT_BASEMAP; // copperplate | realistic | paper | night
  let lastNonRealisticMode = "copperplate";
  let terrainOn = true;
  let scanlinesOn = true;
  let activeLayerFilter = "all";
  let selectedSiteId = null;
  let suppressHashWrite = false;
  let heroOffsetApplied = null;

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
  let initZoom = 1.46;
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
    transformRequest: (url, resourceType) => {
      if (resourceType === "Glyphs" && url.includes("Noto%20Sans%20Regular/0-255.pbf")) {
        return { url: new URL("./vendor/fonts/Noto-Sans-Regular-0-255.pbf", window.location.href).href };
      }
      return { url };
    },
  });

  // Custom hairline ScaleControl only (zero MapLibre default white Navigation/Attribution widgets!)
  map.addControl(new ScaleControl({ maxWidth: 96, unit: "metric" }), "bottom-left");

  map.addImage("arch-dot-light", createHairlineMarkerIcon("#ffffff"), { pixelRatio: 2 });
  map.addImage("arch-dot-ink", createHairlineMarkerIcon("#0a1890"), { pixelRatio: 2 });

  // Global Hero & Left-1/3 Globe Offset Choreography (Hermes 0:04 Framing)
  function syncGlobalHeroAndFigureTag(targetZoom = map.getZoom()) {
    const hero = document.getElementById("map-global-hero");
    const figEl = document.getElementById("corner-fig-label");
    const wideDesktop = window.innerWidth > 960;
    const showGlobalHero = targetZoom < 3.1 && !selectedSiteId;

    if (hero) {
      hero.classList.toggle("hidden-hero", !showGlobalHero);
    }

    const wantLeftPad = wideDesktop && showGlobalHero ? 320 : 0;
    if (heroOffsetApplied !== wantLeftPad) {
      heroOffsetApplied = wantLeftPad;
      map.setPadding({ left: wantLeftPad, top: 0, right: 0, bottom: 0 });
    }

    if (figEl) {
      if (selectedSiteId && places.length) {
        const hit = places.find((p) => p.id === selectedSiteId || p.entryId === selectedSiteId);
        if (hit) {
          const slug = SITE_LATIN_SLUG[hit.id] || hit.id.toUpperCase();
          figEl.textContent = `FIG. ${hit.roman || "I"} — ${slug} · ${LAYER_GLYPH[hit.layer] || ""}`;
          return;
        }
      }
      if (basemapMode === "night") {
        figEl.textContent = "FIG. IV — NOX ORBIS";
      } else if (basemapMode === "paper") {
        figEl.textContent = "FIG. V — CHARTA ARCHIVI";
      } else if (targetZoom >= 8 && places.length) {
        const c = map.getCenter();
        let nearest = null;
        let bestD = Infinity;
        for (const p of places) {
          const d = Math.hypot(p.lon - c.lng, p.lat - c.lat);
          if (d < bestD) {
            bestD = d;
            nearest = p;
          }
        }
        if (nearest && bestD < 2.2) {
          const slug = SITE_LATIN_SLUG[nearest.id] || nearest.id.toUpperCase();
          figEl.textContent = `FIG. ${nearest.roman || "I"} — ${slug} · ${LAYER_GLYPH[nearest.layer] || ""}`;
          return;
        }
        figEl.textContent = "FIG. I — ORBIS TERRARVM";
      } else {
        figEl.textContent = "FIG. I — ORBIS TERRARVM";
      }
    }
  }

  syncGlobalHeroAndFigureTag(initZoom);

  const applyPlacesData = (placesGeo) => {
    places = placesGeo.features.map((f, idx) => ({
      ...f.properties,
      roman: f.properties.roman || String(idx + 1),
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
      syncGlobalHeroAndFigureTag();
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

  map.on("data", (e) => {
    if (e.dataType !== "source" || !e.tile) return;
    if (e.sourceId === "s2cloudless-2016") s2ConsecErr = 0;
    else if (e.sourceId === "openmaptiles") ofmConsecErr = 0;
    else if (e.sourceId === "terrain-dem" || e.sourceId === "hillshade-dem") mhConsecErr = 0;
  });

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
            "vector-building-outlines",
            "vector-buildings-3d",
            "vector-road-labels",
            "vector-water-labels",
            "vector-place-labels",
          ]) {
            if (map.getLayer(lid)) map.setLayoutProperty(lid, "visibility", "none");
          }
          showBanner("OpenFreeMap 矢量服务连续超时，已临时降级为纯影像底图（60 秒后自动重试）。");
          clearTimeout(ofmRetryTimer);
          ofmRetryTimer = setTimeout(() => {
            fallbackOfmTriggered = false;
            ofmConsecErr = 0;
            for (const lid of [
              "vector-waterways",
              "vector-roads-inner",
              "vector-building-outlines",
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
    const tz = options.zoom ?? map.getZoom();
    ensureTerrainForTarget(tz, options.pitch ?? map.getPitch());
    syncGlobalHeroAndFigureTag(tz);
    attachAdaptiveDprSampler(options.duration ?? 1500);
    return origFlyTo(options, eventData);
  };

  map.easeTo = function (options = {}, eventData) {
    const tz = options.zoom ?? map.getZoom();
    ensureTerrainForTarget(tz, options.pitch ?? map.getPitch());
    syncGlobalHeroAndFigureTag(tz);
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
    const isCopper = basemapMode === "copperplate";
    const isReal = basemapMode === "realistic";
    const isPaper = basemapMode === "paper";
    const isNight = basemapMode === "night";
    const hasSat = isCopper || isReal;

    if (basemapMode !== "realistic") lastNonRealisticMode = basemapMode;

    document.getElementById("stage-map")?.setAttribute("data-basemap", basemapMode);
    document.body.setAttribute("data-map-basemap", basemapMode);

    document.querySelectorAll("[data-basemap]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.basemap === basemapMode);
    });
    document.getElementById("btn-map-realistic")?.classList.toggle("active", isReal);
    const terBtn = document.getElementById("btn-map-terrain");
    if (terBtn) terBtn.classList.toggle("active", terrainOn);

    // Background & Sky Atmosphere (Strictly Klein Blue + White in copperplate/paper/night)
    map.setPaintProperty(
      "bg-base",
      "background-color",
      isPaper ? "#f6f4ee" : isNight ? "#040a3d" : isReal ? "#040814" : "#0a1890"
    );
    map.setSky(
      isPaper
        ? {
            "sky-color": "#eef1fa",
            "sky-horizon-blend": 0.45,
            "horizon-color": "#c5d1f5",
            "horizon-fog-blend": 0.5,
            "fog-color": "#f6f4ee",
            "fog-ground-blend": 0.3,
            "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.45, 6, 0],
          }
        : isNight
          ? {
              "sky-color": "#020629",
              "sky-horizon-blend": 0.36,
              "horizon-color": "#1a35b8",
              "horizon-fog-blend": 0.6,
              "fog-color": "#040a3d",
              "fog-ground-blend": 0.3,
              "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.82, 6, 0],
            }
          : isReal
            ? {
                "sky-color": "#050a1c",
                "sky-horizon-blend": 0.38,
                "horizon-color": "#4f7ff7",
                "horizon-fog-blend": 0.55,
                "fog-color": "#0c1738",
                "fog-ground-blend": 0.25,
                "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.88, 5, 0.45, 8, 0],
              }
            : {
                "sky-color": "#061066",
                "sky-horizon-blend": 0.48,
                "horizon-color": "#1c3fd6",
                "horizon-fog-blend": 0.68,
                "fog-color": "#0a1890",
                "fog-ground-blend": 0.48,
                "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.90, 5, 0.45, 8, 0],
              }
    );

    // Satellite raster properties (Copperplate desaturated vs Realistic true-color)
    map.setLayoutProperty("sat-eox-layer", "visibility", hasSat && !fallbackS2Triggered ? "visible" : "none");
    map.setLayoutProperty("fallback-blue-marble", "visibility", hasSat && fallbackS2Triggered ? "visible" : "none");
    if (isCopper) {
      map.setPaintProperty("sat-eox-layer", "raster-saturation", -1);
      map.setPaintProperty("sat-eox-layer", "raster-contrast", 0.28);
      map.setPaintProperty("sat-eox-layer", "raster-brightness-min", 0.03);
      map.setPaintProperty("sat-eox-layer", "raster-opacity", [
        "interpolate",
        ["linear"],
        ["zoom"],
        0,
        0.58,
        13,
        0.56,
        14.2,
        0.35,
      ]);
      map.setPaintProperty("fallback-blue-marble", "raster-saturation", -1);
      map.setPaintProperty("fallback-blue-marble", "raster-opacity", 0.58);
    } else if (isReal) {
      map.setPaintProperty("sat-eox-layer", "raster-saturation", 0.04);
      map.setPaintProperty("sat-eox-layer", "raster-contrast", 0.06);
      map.setPaintProperty("sat-eox-layer", "raster-brightness-min", 0);
      map.setPaintProperty("sat-eox-layer", "raster-opacity", 1);
      map.setPaintProperty("fallback-blue-marble", "raster-saturation", 0);
      map.setPaintProperty("fallback-blue-marble", "raster-opacity", 1);
    }

    map.setLayoutProperty("night-viirs-layer", "visibility", isNight ? "visible" : "none");

    // Solar Terminator on Copperplate & Realistic globes
    map.setLayoutProperty("terminator-night-fill", "visibility", hasSat ? "visible" : "none");
    map.setLayoutProperty("terminator-twilight-line", "visibility", hasSat ? "visible" : "none");

    // Monochrome Paper & Night Water / Coastlines
    map.setLayoutProperty("vector-water-fill", "visibility", isPaper || isNight ? "visible" : "none");
    map.setLayoutProperty("vector-coastline", "visibility", isPaper || isNight ? "visible" : "none");
    if (isPaper) {
      map.setPaintProperty("vector-water-fill", "fill-color", "#e5ecfa");
      map.setPaintProperty("vector-coastline", "line-color", "rgba(10, 24, 144, 0.45)");
    } else if (isNight) {
      map.setPaintProperty("vector-water-fill", "fill-color", "rgba(4, 10, 61, 0.78)");
      map.setPaintProperty("vector-coastline", "line-color", "rgba(255, 255, 255, 0.24)");
    }

    // Vector Roads, Building Outlines, 3D Buildings & Archival Overlays
    if (!fallbackOfmTriggered) {
      const roadMinZ = hasSat ? 10 : 5;
      map.setLayerZoomRange("vector-roads-casing", roadMinZ, 24);
      map.setLayerZoomRange("vector-roads-inner", roadMinZ, 24);
      map.setLayerZoomRange("vector-waterways", hasSat ? 10 : 5, 24);
      map.setLayerZoomRange("vector-place-labels", 4, 24);
      map.setLayerZoomRange("vector-water-labels", hasSat ? 10 : 4, 24);
      map.setLayoutProperty("vector-roads-casing", "visibility", isReal ? "visible" : "none");
      map.setLayoutProperty("vector-building-outlines", "visibility", "visible");

      if (isPaper) {
        map.setPaintProperty("vector-roads-inner", "line-color", "rgba(10, 24, 144, 0.44)");
        map.setPaintProperty("vector-waterways", "line-color", "rgba(10, 24, 144, 0.52)");
        map.setPaintProperty("vector-building-outlines", "line-color", "rgba(10, 24, 144, 0.34)");
        map.setPaintProperty("vector-buildings-3d", "fill-extrusion-color", "#dfe7fa");
        map.setPaintProperty("vector-buildings-3d", "fill-extrusion-opacity", 0.62);
        map.setPaintProperty("vector-place-labels", "text-color", "#0a1890");
        map.setPaintProperty("vector-place-labels", "text-halo-color", "rgba(246, 244, 238, 0.94)");
        map.setPaintProperty("vector-road-labels", "text-color", "rgba(10, 24, 144, 0.82)");
        map.setPaintProperty("vector-road-labels", "text-halo-color", "rgba(246, 244, 238, 0.94)");
        map.setPaintProperty("vector-water-labels", "text-color", "rgba(13, 28, 184, 0.80)");
        map.setPaintProperty("vector-water-labels", "text-halo-color", "rgba(246, 244, 238, 0.94)");

        map.setLayoutProperty("archive-places-icon", "icon-image", "arch-dot-ink");
        map.setPaintProperty("archive-places-icon", "text-color", "#0a1890");
        map.setPaintProperty("archive-places-icon", "text-halo-color", "rgba(246, 244, 238, 0.94)");
        map.setPaintProperty("archive-routes-line", "line-color", "rgba(10, 24, 144, 0.44)");
        map.setPaintProperty("archive-zones-fill", "fill-color", "#0a1890");
        map.setPaintProperty("archive-zones-line", "line-color", "rgba(10, 24, 144, 0.44)");
        map.setPaintProperty("archive-precision-fill", "fill-color", "#0a1890");
        map.setPaintProperty("archive-precision-line", "line-color", "rgba(10, 24, 144, 0.58)");
        map.setPaintProperty("archive-clusters-outer", "circle-color", "rgba(246, 244, 238, 0.72)");
        map.setPaintProperty("archive-clusters-outer", "circle-stroke-color", "rgba(10, 24, 144, 0.42)");
        map.setPaintProperty("archive-clusters", "circle-color", "#f6f4ee");
        map.setPaintProperty("archive-clusters", "circle-stroke-color", "#0a1890");
        map.setPaintProperty("archive-cluster-count", "text-color", "#0a1890");
      } else {
        map.setPaintProperty(
          "vector-roads-inner",
          "line-color",
          isNight ? "rgba(255, 255, 255, 0.34)" : "rgba(255, 255, 255, 0.62)"
        );
        map.setPaintProperty("vector-waterways", "line-color", "rgba(255, 255, 255, 0.42)");
        map.setPaintProperty("vector-building-outlines", "line-color", "rgba(255, 255, 255, 0.46)");
        map.setPaintProperty("vector-buildings-3d", "fill-extrusion-color", "#dce6ff");
        map.setPaintProperty("vector-buildings-3d", "fill-extrusion-opacity", 0.55);
        map.setPaintProperty("vector-place-labels", "text-color", "rgba(255, 255, 255, 0.88)");
        map.setPaintProperty(
          "vector-place-labels",
          "text-halo-color",
          isReal ? "rgba(8, 14, 32, 0.85)" : "rgba(6, 15, 96, 0.82)"
        );
        map.setPaintProperty("vector-road-labels", "text-color", "rgba(255, 255, 255, 0.85)");
        map.setPaintProperty("vector-road-labels", "text-halo-color", "rgba(8, 18, 112, 0.82)");
        map.setPaintProperty("vector-water-labels", "text-color", "rgba(255, 255, 255, 0.78)");
        map.setPaintProperty("vector-water-labels", "text-halo-color", "rgba(8, 18, 112, 0.78)");

        map.setLayoutProperty("archive-places-icon", "icon-image", "arch-dot-light");
        map.setPaintProperty("archive-places-icon", "text-color", "#ffffff");
        map.setPaintProperty("archive-places-icon", "text-halo-color", "rgba(7, 18, 118, 0.80)");
        map.setPaintProperty("archive-routes-line", "line-color", "rgba(255, 255, 255, 0.50)");
        map.setPaintProperty("archive-zones-fill", "fill-color", "#ffffff");
        map.setPaintProperty("archive-zones-line", "line-color", "rgba(255, 255, 255, 0.42)");
        map.setPaintProperty("archive-precision-fill", "fill-color", "#ffffff");
        map.setPaintProperty("archive-precision-line", "line-color", "rgba(255, 255, 255, 0.62)");
        map.setPaintProperty("archive-clusters-outer", "circle-color", "rgba(8, 20, 128, 0.55)");
        map.setPaintProperty("archive-clusters-outer", "circle-stroke-color", "rgba(255, 255, 255, 0.45)");
        map.setPaintProperty("archive-clusters", "circle-color", "rgba(8, 20, 128, 0.85)");
        map.setPaintProperty("archive-clusters", "circle-stroke-color", "#ffffff");
        map.setPaintProperty("archive-cluster-count", "text-color", "#ffffff");
      }
    }

    ensureTerrainForTarget(targetZoom, targetPitch);

    if (terrainOn && isPaper) {
      map.setLayoutProperty("terrain-hillshade", "visibility", "visible");
    } else {
      map.setLayoutProperty("terrain-hillshade", "visibility", "none");
    }

    syncGlobalHeroAndFigureTag(targetZoom);
  }

  function applyArchiveLayerFilter(layerVal) {
    activeLayerFilter = layerVal;
    document.querySelectorAll("[data-archlayer]").forEach((b) => {
      b.classList.toggle("active", b.dataset.archlayer === layerVal);
    });
    const baseUnclustered = ["!", ["has", "point_count"]];
    const filterExpr =
      layerVal === "all"
        ? baseUnclustered
        : ["all", baseUnclustered, ["==", ["get", "layer"], layerVal]];

    if (map.getLayer("archive-places-icon")) map.setFilter("archive-places-icon", filterExpr);

    const zoneRouteFilter = layerVal === "all" ? null : ["==", ["get", "layer"], layerVal];
    for (const lid of [
      "archive-zones-fill",
      "archive-zones-line",
      "archive-precision-fill",
      "archive-precision-line",
      "archive-routes-line",
    ]) {
      if (map.getLayer(lid)) map.setFilter(lid, zoneRouteFilter);
    }
  }

  // 05 Section 3.2.E: Copperplate Figure Plate Caption ("图版说明")
  function renderSiteCard(site, skipHashSync = false) {
    const card = document.getElementById("map-site-card");
    if (!card) return;
    if (!site) {
      selectedSiteId = null;
      card.classList.remove("open");
      syncGlobalHeroAndFigureTag();
      if (!skipHashSync) syncUrlHash();
      return;
    }
    selectedSiteId = site.id;
    const isOrig = site.provenance === "original";
    const badgeCls = isOrig ? "plate-badge-orig" : "plate-badge-canon";
    const badgeTxt = isOrig
      ? "本站设定"
      : site.provenance === "scp-canon"
        ? "SCP 原典"
        : "洛氏原典";
    const precTxt =
      site.precision === "exact" ? "精确坐标" : site.precision === "city" ? "城市级范围" : "区域级范围";
    const coordDisplay = formatSiteCoord(site.lat, site.lon, site.precision);
    const slug = SITE_LATIN_SLUG[site.id] || site.id.toUpperCase();
    const glyph = LAYER_GLYPH[site.layer] || "";
    const entryHref = `#/entry/${encodeURIComponent(site.entryId)}`;

    card.innerHTML = `
      <div class="plate-card-top">
        <span class="plate-fig-label">FIG. ${escapeHtml(site.roman || "I")} — ${escapeHtml(slug)} · ${escapeHtml(glyph)}</span>
        <button id="map-card-close" type="button" class="plate-close-btn" aria-label="关闭图版说明">×</button>
      </div>
      <h3 class="plate-zh-title">${escapeHtml(site.name_zh)}</h3>
      <div class="plate-coords-line">${escapeHtml(coordDisplay)}</div>
      <p class="plate-summary">${escapeHtml(site.summary)}</p>
      <div class="plate-actions">
        <button id="map-card-zoom-street" type="button" class="plate-btn">拉近观测 (${site.realElevationM < -100 ? "z7" : "z15"})</button>
        <a id="map-card-open-entry" class="plate-btn primary" href="${escapeHtml(entryHref)}">查阅卷宗 →</a>
      </div>
      <div class="plate-footnote">
        <span class="${badgeCls}">${escapeHtml(badgeTxt)}</span>
        <span>${escapeHtml(precTxt)}</span>
        <span>·</span>
        <span>${escapeHtml(site.elevDisplay)}</span>
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
        duration: 1500,
      });
    });
    syncGlobalHeroAndFigureTag();
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

  map.on("zoom", () => {
    const z = map.getZoom();
    const hero = document.getElementById("map-global-hero");
    if (hero) hero.classList.toggle("hidden-hero", z >= 3.1 || Boolean(selectedSiteId));
  });

  map.on("moveend", () => {
    applyBasemapAndTerrain();
    syncUrlHash();
  });

  window.addEventListener("resize", () => {
    syncGlobalHeroAndFigureTag();
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

  // Bind Compact Hairline Controls & Popovers
  document.querySelectorAll("[data-basemap]").forEach((btn) => {
    btn.addEventListener("click", () => {
      basemapMode = btn.dataset.basemap;
      applyBasemapAndTerrain();
      syncUrlHash();
    });
  });

  document.getElementById("btn-map-realistic")?.addEventListener("click", () => {
    basemapMode = basemapMode === "realistic" ? lastNonRealisticMode || "copperplate" : "realistic";
    applyBasemapAndTerrain();
    syncUrlHash();
  });

  document.getElementById("btn-map-terrain")?.addEventListener("click", () => {
    terrainOn = !terrainOn;
    applyBasemapAndTerrain();
    syncUrlHash();
  });

  const popLayers = document.getElementById("popover-layers");
  const popSearch = document.getElementById("popover-search");
  const btnLayers = document.getElementById("btn-pop-layers");
  const btnSearch = document.getElementById("btn-pop-search");
  const searchInput = document.getElementById("map-place-search");
  const searchResults = document.getElementById("map-search-results");

  function updateSearchDropdown(raw) {
    if (!searchResults) return;
    const q = String(raw || "").trim().toLowerCase();
    const list = !q
      ? places
      : places.filter(
          (p) =>
            String(p.roman || "").toLowerCase() === q ||
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
            <span><span style="font-family:var(--font-latin-inscr); margin-right:6px;">${escapeHtml(p.roman)}.</span>${escapeHtml(p.name_zh)}</span>
            <span style="font-size:11.5px; opacity:0.72;">${escapeHtml(LAYER_GLYPH[p.layer] || "")}</span>
          </button>`
          )
          .join("")
      : `<div style="padding:8px 6px; font-size:13px; opacity:0.72;">未匹配到档案坐标</div>`;

    searchResults.querySelectorAll(".map-search-item").forEach((b) => {
      b.addEventListener("click", () => {
        const hit = places.find((x) => x.id === b.dataset.pid);
        popSearch?.classList.remove("open");
        btnSearch?.classList.remove("active");
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

  btnLayers?.addEventListener("click", (e) => {
    e.stopPropagation();
    const next = !popLayers?.classList.contains("open");
    popLayers?.classList.toggle("open", next);
    btnLayers.classList.toggle("active", next);
    popSearch?.classList.remove("open");
    btnSearch?.classList.remove("active");
  });

  btnSearch?.addEventListener("click", (e) => {
    e.stopPropagation();
    const next = !popSearch?.classList.contains("open");
    popSearch?.classList.toggle("open", next);
    btnSearch.classList.toggle("active", next);
    popLayers?.classList.remove("open");
    btnLayers?.classList.remove("active");
    if (next) {
      updateSearchDropdown(searchInput?.value || "");
      setTimeout(() => searchInput?.focus(), 40);
    }
  });

  searchInput?.addEventListener("input", () => updateSearchDropdown(searchInput.value));

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#map-ctrl-cluster")) {
      popLayers?.classList.remove("open");
      popSearch?.classList.remove("open");
      btnLayers?.classList.remove("active");
      btnSearch?.classList.remove("active");
    }
    if (!e.target.closest("#btn-attrib-mobile") && !e.target.closest("#map-attrib-bar")) {
      document.getElementById("map-attrib-bar")?.classList.remove("mob-open");
    }
  });

  document.querySelectorAll("[data-archlayer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyArchiveLayerFilter(btn.dataset.archlayer);
      syncUrlHash();
    });
  });

  document.getElementById("btn-map-scanlines")?.addEventListener("click", (e) => {
    scanlinesOn = !scanlinesOn;
    document.getElementById("stage-map")?.setAttribute("data-scanlines", scanlinesOn ? "on" : "off");
    e.currentTarget.classList.toggle("active", scanlinesOn);
    e.currentTarget.textContent = `铜版扫描线: ${scanlinesOn ? "开" : "关"}`;
  });

  // Custom Hairline Zoom & Compass Stack
  document.getElementById("btn-zoom-in")?.addEventListener("click", () => map.zoomIn({ duration: 300 }));
  document.getElementById("btn-zoom-out")?.addEventListener("click", () => map.zoomOut({ duration: 300 }));
  document.getElementById("btn-reset-north")?.addEventListener("click", () =>
    map.easeTo({ bearing: 0, pitch: 0, duration: 450 })
  );

  // Mobile ⓘ Attribution Toggle
  document.getElementById("btn-attrib-mobile")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("map-attrib-bar")?.classList.toggle("mob-open");
  });

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
        applyBasemapAndTerrain(1.46, 0);
        map.jumpTo({ center: [22.0, 20.0], zoom: 1.46, pitch: 0, bearing: 0 });
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
      basemapMode = m === "satellite" ? "realistic" : m;
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
