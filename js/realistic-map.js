/**
 * js/realistic-map.js
 * Realistic Satellite + Paper Archival + Night Lights 3D Globe (#/map)
 * Powered by self-hosted MapLibre GL JS v6.18.0 (BSD-3).
 *
 * Strictly zero national/disputed borders ("国界线不要画"):
 *  - No `boundary` source-layer is ever added.
 *  - `place` labels exclude country/state/province classes.
 */
import {
  Map as MapLibreMap,
  NavigationControl,
  AttributionControl,
  ScaleControl,
} from "../vendor/maplibre-gl@6.18.0/maplibre-gl.mjs";
import { escapeHtml } from "./sanitize.js";

const EOX_ATTRIB =
  'Sentinel-2 cloudless - <a href="https://s2maps.eu" target="_blank" rel="noopener">https://s2maps.eu</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 &amp; 2017, CC BY 4.0)';
const OFM_ATTRIB =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const MAPTERHORN_ATTRIB =
  '<a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">&copy; Mapterhorn</a>';
const NASA_ATTRIB =
  'Imagery: <a href="https://earthobservatory.nasa.gov/features/NightLights" target="_blank" rel="noopener">NASA Black Marble / Blue Marble</a>';

const CJK_NAME_EXPR = [
  "coalesce",
  ["get", "name:zh-Hans"],
  ["get", "name:zh"],
  ["get", "name"],
];

const PLACE_ALLOWED_CLASSES = [
  "city",
  "town",
  "village",
  "suburb",
  "quarter",
  "neighbourhood",
  "hamlet",
  "island",
];

/**
 * Compute real-time UTC Solar Terminator night-hemisphere polygon.
 */
export function buildSolarTerminatorGeoJSON(date = new Date()) {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - startOfYear) / 86400000;
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  // Solar declination (rad) & subsolar longitude (deg)
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

  const ring = [
    [-180, nightPoleLat],
    ...curve,
    [180, nightPoleLat],
    [-180, nightPoleLat],
  ];

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

  // Soft outer aura
  const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 30);
  grad.addColorStop(0, "rgba(19, 38, 230, 0.42)");
  grad.addColorStop(1, "rgba(19, 38, 230, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.fill();

  // Outer ivory seal ring + Klein-blue medallion
  ctx.fillStyle = kind === "scp" ? "#0d1cb8" : kind === "mythos" ? "#1326e6" : kind === "theology" ? "#1633f0" : "#1b38c8";
  ctx.strokeStyle = "#fbf8f1";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Inner copperplate ring
  ctx.strokeStyle = "rgba(251, 248, 241, 0.55)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, 14.5, 0, Math.PI * 2);
  ctx.stroke();

  // Distinct glyph per layer
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (kind === "scp") {
    // 3 inward containment arrows + core circle
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
    // Eldritch eye / diamond star
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.quadraticCurveTo(cx, cy - 8, cx + 10, cy);
    ctx.quadraticCurveTo(cx, cy + 8, cx - 10, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "theology") {
    // Hermetic octagram / astrolabe diamond
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
    // GOI hexagon + center node
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
      "archive-places": {
        type: "geojson",
        data: "./data/map/places.geojson",
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
      // Paper & Night natural water / landcover (strictly NO boundary layers!)
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
        paint: {
          "fill-color": "#dfe5f2",
        },
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
      // Hillshade relief (activated when terrainOn && zoom >= 4.2 or in paper mode)
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
      // Solar Terminator on Satellite Globe
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
      // Waterways
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
      // Roads (z >= 10 in satellite hybrid, z >= 6 in paper/night)
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
      // 3D Extruded Buildings at z >= 15!
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
      // Road & Water & City/Town Labels (NO country/state/boundary layers!)
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
        minzoom: 10,
        filter: ["in", ["get", "class"], ["literal", PLACE_ALLOWED_CLASSES]],
        layout: {
          "text-field": CJK_NAME_EXPR,
          "text-font": ["Noto Sans Bold"],
          "text-size": [
            "match",
            ["get", "class"],
            "city",
            15,
            "town",
            13.5,
            12.5,
          ],
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
      // Clustered Klein-blue Seals (low zoom)
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
        paint: {
          "text-color": "#ffffff",
        },
      },
      // Individual Klein-blue Archival Markers
      {
        id: "archive-places-pulse",
        type: "circle",
        source: "archive-places",
        filter: ["!", ["has", "point_count"]],
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
        filter: ["!", ["has", "point_count"]],
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
          "text-field": [
            "step",
            ["zoom"],
            ["get", "name_zh"],
            4,
            ["get", "labelWithDepth"],
          ],
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

export function parseMapSubRoute(rest = "") {
  const [pathPart, queryPart = ""] = String(rest || "").split("?");
  const params = new URLSearchParams(queryPart);
  const mode = params.get("mode") || null; // satellite | paper | night
  const layer = params.get("layer") || "all";
  const terrainParam = params.get("terrain");
  const siteParam = params.get("site") || null;

  // Check @lat,lon,zz[,pitchp[,bearingb]]
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
      terrain: terrainParam === null ? null : terrainParam !== "0",
    };
  }

  // Check site-<id> or legacy city id
  const trimmed = pathPart.replace(/^\/+|\/+$/g, "");
  if (trimmed) {
    return {
      hasCamera: false,
      siteId: trimmed,
      mode,
      layer,
      terrain: terrainParam === null ? null : terrainParam !== "0",
    };
  }

  return {
    hasCamera: false,
    siteId: siteParam,
    mode,
    layer,
    terrain: terrainParam === null ? null : terrainParam !== "0",
  };
}

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

export async function createRealisticEarthController({ onOpenEntry }) {
  const placesGeo = await (await fetch("./data/map/places.geojson")).json();
  const places = placesGeo.features.map((f) => ({
    ...f.properties,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));

  let basemapMode = "satellite"; // satellite | paper | night
  let terrainOn = true;
  let activeLayerFilter = "all";
  let selectedSiteId = null;
  let suppressHashWrite = false;
  let s2ErrCount = 0;
  let ofmErrCount = 0;
  let mhErrCount = 0;
  let fallbackS2Triggered = false;
  let fallbackOfmTriggered = false;
  let fallbackDemTriggered = false;

  const parsedInit = parseMapSubRoute(
    window.location.hash.startsWith("#/map") ? window.location.hash.slice(6) : ""
  );
  if (parsedInit.mode && ["satellite", "paper", "night"].includes(parsedInit.mode)) {
    basemapMode = parsedInit.mode;
  }
  if (parsedInit.terrain !== null) terrainOn = parsedInit.terrain;

  let initCenter = [22.0, 20.0];
  let initZoom = 1.45;
  let initPitch = 0;
  let initBearing = 0;

  if (parsedInit.hasCamera) {
    initCenter = [parsedInit.lon, parsedInit.lat];
    initZoom = parsedInit.zoom;
    initPitch = parsedInit.pitch;
    initBearing = parsedInit.bearing;
  } else if (parsedInit.siteId) {
    const normId = LEGACY_TO_SITE_ID[parsedInit.siteId] || parsedInit.siteId;
    const hit = places.find((p) => p.id === normId || p.entryId === normId);
    if (hit) {
      initCenter = [hit.lon, hit.lat];
      initZoom = hit.defaultZoom || 11;
      selectedSiteId = hit.id;
    }
  }

  const tStart = performance.now();
  const initialTerminator = buildSolarTerminatorGeoJSON(new Date());
  const isMobile = window.matchMedia("(max-width: 860px), (pointer: coarse)").matches;

  const map = new MapLibreMap({
    container: "maplibre-canvas-host",
    style: buildUnifiedStyle(initialTerminator),
    center: initCenter,
    zoom: initZoom,
    pitch: initPitch,
    bearing: initBearing,
    pixelRatio: Math.min(window.devicePixelRatio || 1, isMobile ? 1 : 2),
    localIdeographFontFamily:
      '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", "Microsoft YaHei", serif',
    attributionControl: false,
    maxPitch: 78,
    fadeDuration: 0,
    validateStyle: false,
    refreshExpiredTiles: false,
    maxParallelImageRequests: isMobile ? 4 : 16,
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

  // Register custom Klein-blue archival icons right away
  for (const kind of ["scp", "mythos", "theology", "goi"]) {
    map.addImage(`arch-${kind}`, createArchivalIconData(kind), { pixelRatio: 2 });
  }

  const showBanner = (msg) => {
    const b = document.getElementById("map-fallback-banner");
    if (!b) return;
    b.textContent = msg;
    b.classList.add("open");
  };

  // Silent out-of-zoom & graceful network fallback handler (03 Section 3.2 & 3.8.3)
  map.on("error", (ev) => {
    const msg = String(ev?.error?.message || "");
    const srcId = ev?.sourceId || "";
    // Silently swallow expected tile 404/abort errors while counting consecutive source failures
    if (srcId === "s2cloudless-2016" && !fallbackS2Triggered) {
      s2ErrCount++;
      if (s2ErrCount >= 4 && map.getLayer("fallback-blue-marble")) {
        fallbackS2Triggered = true;
        map.setLayoutProperty("fallback-blue-marble", "visibility", "visible");
        map.setLayoutProperty("sat-eox-layer", "visibility", "none");
        showBanner("卫星瓦片连接受限，已自动切换至仓库内置 NASA Blue Marble 离线底图。");
      }
    } else if (srcId === "openmaptiles" && !fallbackOfmTriggered) {
      ofmErrCount++;
      if (ofmErrCount >= 5) {
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
        showBanner("OpenFreeMap 矢量道路服务暂不可达，已降级为纯卫星影像模式。");
      }
    } else if ((srcId === "terrain-dem" || srcId === "hillshade-dem") && !fallbackDemTriggered) {
      mhErrCount++;
      if (mhErrCount >= 4 && terrainOn) {
        fallbackDemTriggered = true;
        try {
          map.setTerrain({ source: "terrain-aws", exaggeration: 1.2 });
        } catch (_) {}
      }
    } else if (msg && !msg.includes("404") && !msg.includes("AbortError") && !msg.includes("Failed to fetch")) {
      // Unexpected style/internal issue
    }
  });

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
    if (basemapMode !== "satellite") qp.set("mode", basemapMode);
    if (!terrainOn) qp.set("terrain", "0");
    if (selectedSiteId) qp.set("site", selectedSiteId);
    const qs = qp.toString();
    const nextHash = `#/map/${camPart}${qs ? "?" + qs : ""}`;
    if (window.location.hash !== nextHash) {
      history.replaceState(null, "", nextHash);
    }
  }

  function applyBasemapAndTerrain() {
    if (!map.isStyleLoaded() && !map.getLayer("bg-base")) return;
    const isSat = basemapMode === "satellite";
    const isPaper = basemapMode === "paper";
    const isNight = basemapMode === "night";
    document.getElementById("stage-map")?.setAttribute("data-basemap", basemapMode);

    // Sync HUD buttons
    document.querySelectorAll("[data-basemap]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.basemap === basemapMode);
    });
    const terBtn = document.getElementById("btn-map-terrain");
    if (terBtn) {
      terBtn.classList.toggle("active", terrainOn);
      terBtn.textContent = `3D 地形: ${terrainOn ? "开" : "关"}`;
    }

    // Background & Sky Atmosphere
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

    // Raster imagery visibility
    map.setLayoutProperty(
      "sat-eox-layer",
      "visibility",
      isSat && !fallbackS2Triggered ? "visible" : "none"
    );
    map.setLayoutProperty(
      "fallback-blue-marble",
      "visibility",
      isSat && fallbackS2Triggered ? "visible" : "none"
    );
    map.setLayoutProperty("night-viirs-layer", "visibility", isNight ? "visible" : "none");

    // Solar terminator only on Satellite mode
    map.setLayoutProperty("terminator-night-fill", "visibility", isSat ? "visible" : "none");
    map.setLayoutProperty("terminator-twilight-line", "visibility", isSat ? "visible" : "none");

    // Vector coastlines & water fill for Paper and Night modes
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

    // Vector road minzoom & colors: z >= 10 in satellite, z >= 5 in paper/night
    if (!fallbackOfmTriggered) {
      const roadMinZ = isSat ? 10 : 5;
      const placeMinZ = isSat ? 10 : 4;
      map.setLayerZoomRange("vector-roads-casing", roadMinZ, 24);
      map.setLayerZoomRange("vector-roads-inner", roadMinZ, 24);
      map.setLayerZoomRange("vector-waterways", isSat ? 10 : 5, 24);
      map.setLayerZoomRange("vector-place-labels", placeMinZ, 24);
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
        map.setPaintProperty(
          "vector-buildings-3d",
          "fill-extrusion-color",
          isNight ? "#26314d" : "#d8deed"
        );
        map.setPaintProperty("archive-places-icon", "text-color", "#ffffff");
        map.setPaintProperty("archive-places-icon", "text-halo-color", "#0d1cb8");
        map.setPaintProperty("archive-routes-line", "line-color", "#7aa2ff");
      }
    }

    // 3D Terrain & Hillshade:
    // - Engage 3D terrain mesh when zoom >= 4.2 or pitch >= 8 (only when stationary/settled, not mid-flight)
    // - Engage hillshade ONLY in paper mode (satellite imagery already contains natural relief shading)
    const demSource = fallbackDemTriggered ? "terrain-aws" : "terrain-dem";
    const needDemNow = terrainOn && !map.isMoving() && (map.getZoom() >= 4.2 || map.getPitch() >= 8);
    if (needDemNow) {
      if (!map.getTerrain()) map.setTerrain({ source: demSource, exaggeration: 1.2 });
    } else if (!terrainOn || (map.getZoom() < 4.0 && map.getPitch() < 5)) {
      if (map.getTerrain()) map.setTerrain(null);
    }

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
    const baseUnclustered = ["!", ["has", "point_count"]];
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
      "archive-routes-glow",
      "archive-routes-line",
    ]) {
      if (map.getLayer(lid)) map.setFilter(lid, zoneRouteFilter);
    }
  }

  function renderSiteCard(site) {
    const card = document.getElementById("map-site-card");
    if (!card) return;
    if (!site) {
      selectedSiteId = null;
      card.classList.remove("open");
      syncUrlHash();
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

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; border-bottom:1px solid var(--border); padding-bottom:8px;">
        <div>
          <span class="${badgeCls}">${escapeHtml(provLabel)}</span>
          <h3 class="condensed-monument" style="font-size:20px; margin-top:6px; display:block;">${escapeHtml(site.name_zh)}</h3>
          <div style="font-size:12.5px; color:var(--ink-sec); font-family:monospace,sans-serif;">${escapeHtml(site.name_en)} · 精度: ${escapeHtml(site.precision)}</div>
        </div>
        <button id="map-card-close" class="bp-btn" style="padding:4px 10px;">× 关闭</button>
      </div>
      <div class="infobox-list" style="margin-top:2px;">
        <div class="infobox-item"><span class="infobox-label">经纬度：</span><span class="infobox-val">${Math.abs(site.lat).toFixed(4)}°${site.lat >= 0 ? "N" : "S"}, ${Math.abs(site.lon).toFixed(4)}°${site.lon >= 0 ? "E" : "W"}</span></div>
        <div class="infobox-item"><span class="infobox-label">真实高程/水深：</span><span class="infobox-val">${escapeHtml(site.elevDisplay)}</span></div>
        <div class="infobox-item" style="grid-column:1 / -1;"><span class="infobox-label">坐标依据：</span><span class="infobox-val">${escapeHtml(site.coordSource)}</span>${site.provenance === "original" ? '<span class="orig-field-tag">本站设定</span>' : ""}</div>
      </div>
      <p class="desc-copy">${escapeHtml(site.summary)}</p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        <button id="map-card-zoom-street" class="bp-btn">拉近查看地貌 (${site.realElevationM < -100 ? "z7" : "z15"})</button>
        <button id="map-card-open-entry" class="bp-btn active">打开档案 →</button>
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
    card.querySelector("#map-card-open-entry")?.addEventListener("click", () => {
      onOpenEntry(site.entryId);
    });
    syncUrlHash();
  }

  map.once("load", () => {
    window.__earthLoadMs = Number((performance.now() - tStart).toFixed(1));
    applyBasemapAndTerrain();
    if (parsedInit.layer && parsedInit.layer !== "all") {
      applyArchiveLayerFilter(parsedInit.layer);
    }
    if (selectedSiteId) {
      const hit = places.find((p) => p.id === selectedSiteId);
      if (hit) renderSiteCard(hit);
    }
    window.__earthMapLoaded = true;
  });

  // Update UTC Solar Terminator every 60 seconds (03 Section 3.2)
  setInterval(() => {
    const src = map.getSource("solar-terminator");
    if (src) src.setData(buildSolarTerminatorGeoJSON(new Date()));
  }, 60000);

  map.on("moveend", () => {
    applyBasemapAndTerrain();
    syncUrlHash();
  });

  // Click on individual marker
  map.on("click", "archive-places-icon", (e) => {
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
  });

  // Click on cluster circle -> expand zoom
  map.on("click", "archive-clusters", async (e) => {
    const feat = e.features?.[0];
    if (!feat) return;
    const clusterId = feat.properties.cluster_id;
    const src = map.getSource("archive-places");
    const zoom = await src.getClusterExpansionZoom(clusterId);
    map.easeTo({ center: feat.geometry.coordinates, zoom, duration: 700 });
  });

  for (const lid of ["archive-places-icon", "archive-clusters"]) {
    map.on("mouseenter", lid, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", lid, () => {
      map.getCanvas().style.cursor = "";
    });
  }

  // Bind HUD controls
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
    });
  });

  // Bind On-Map Place Search Box
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
          <button class="map-search-item" data-pid="${escapeHtml(p.id)}">
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

  function applySubRoute(rest) {
    const parsed = parseMapSubRoute(rest);
    suppressHashWrite = true;
    try {
      if (parsed.mode && ["satellite", "paper", "night"].includes(parsed.mode) && parsed.mode !== basemapMode) {
        basemapMode = parsed.mode;
        applyBasemapAndTerrain();
      }
      if (parsed.terrain !== null && parsed.terrain !== terrainOn) {
        terrainOn = parsed.terrain;
        applyBasemapAndTerrain();
      }
      if (parsed.hasCamera) {
        map.jumpTo({
          center: [parsed.lon, parsed.lat],
          zoom: parsed.zoom,
          pitch: parsed.pitch,
          bearing: parsed.bearing,
        });
        applyBasemapAndTerrain();
        if (parsed.siteId) {
          const norm = LEGACY_TO_SITE_ID[parsed.siteId] || parsed.siteId;
          const hit = places.find((p) => p.id === norm || p.entryId === norm);
          if (hit) renderSiteCard(hit);
        }
      } else if (parsed.siteId) {
        const norm = LEGACY_TO_SITE_ID[parsed.siteId] || parsed.siteId;
        const hit = places.find((p) => p.id === norm || p.entryId === norm);
        if (hit) {
          map.jumpTo({
            center: [hit.lon, hit.lat],
            zoom: hit.defaultZoom || 11,
            pitch: hit.id === "site-2000" ? 60 : 0,
            bearing: 0,
          });
          renderSiteCard(hit);
        }
      }
    } finally {
      suppressHashWrite = false;
    }
    map.resize();
  }

  const controller = {
    map,
    places,
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
      const hit = places.find((p) => p.id === norm || p.entryId === norm);
      if (hit) {
        window.location.hash = `#/map/${hit.id}`;
      }
    },
    resize() {
      map.resize();
    },
  };

  window.__earthMapApi = controller;
  return controller;
}
