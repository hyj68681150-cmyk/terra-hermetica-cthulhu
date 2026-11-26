#!/usr/bin/env node
/**
 * tools/build-manifest.mjs
 * Zero-dependency manifest builder & validator for Theologia Caerulea Archive.
 * Validates:
 *  1. Unique `id` across all JSON entries and Markdown chapters
 *  2. Required fields (`id`, `category`, `title`, `provenance`, `summary`)
 *  3. Valid `geo` bounds (-90 <= lat <= 90, -180 <= lon <= 180) when present
 *  4. Every ID in `relatedIds` exists in the archive
 *  5. GeoJSON features in `data/map/*.geojson` reference valid `entryId` (when present)
 * Outputs: `data/manifest.json`
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const ENTRIES_DIR = path.join(DATA_DIR, "entries");
const NOVELS_DIR = path.join(DATA_DIR, "novels");
const MAP_DIR = path.join(DATA_DIR, "map");

function walkFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(full, ext));
    else if (ent.name.endsWith(ext)) out.push(full);
  }
  return out.sort();
}

function parseFrontMatter(mdText, filePath) {
  const m = mdText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error(`Missing front matter in ${filePath}`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf(":");
    if (idx < 0) continue;
    const k = t.slice(0, idx).trim();
    let v = t.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    } else if (v.startsWith("[") && v.endsWith("]")) {
      v = JSON.parse(v);
    } else if (/^\d+$/.test(v)) {
      v = Number(v);
    }
    meta[k] = v;
  }
  return { meta, body: m[2].trim() };
}

const errors = [];
const seenIds = new Map();
const entries = [];
const rawEntries = [];

for (const file of walkFiles(ENTRIES_DIR, ".json")) {
  const relPath = path.relative(ROOT, file).replace(/\\/g, "/");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const req of ["id", "category", "title", "provenance", "summary"]) {
    if (!data[req]) errors.push(`[${relPath}] missing required field '${req}'`);
  }
  if (seenIds.has(data.id)) {
    errors.push(`[${relPath}] duplicate id '${data.id}' (already in ${seenIds.get(data.id)})`);
  } else {
    seenIds.set(data.id, relPath);
  }
  if (data.geo) {
    const { lat, lon, precision } = data.geo;
    if (typeof lat !== "number" || lat < -90 || lat > 90 || Number.isNaN(lat)) {
      errors.push(`[${relPath}] invalid geo.lat: ${lat}`);
    }
    if (typeof lon !== "number" || lon < -180 || lon > 180 || Number.isNaN(lon)) {
      errors.push(`[${relPath}] invalid geo.lon: ${lon}`);
    }
    if (!["exact", "city", "region", "approx"].includes(precision)) {
      errors.push(`[${relPath}] invalid geo.precision: ${precision}`);
    }
  }
  if (data.infobox && !Array.isArray(data.infobox)) {
    errors.push(`[${relPath}] infobox must be an array of { label, value, original? }`);
  }
  rawEntries.push({ relPath, data });
  entries.push({
    id: data.id,
    category: data.category,
    code: data.code || "",
    title: data.title,
    aliases: data.aliases || [],
    clearance: data.clearance ?? 1,
    provenance: data.provenance,
    summary: data.summary,
    geo: data.geo || null,
    mapSiteId: data.mapSiteId || null,
    path: relPath,
    updatedAt: data.updatedAt || "2026-11-26",
  });
}

// Validate relatedIds
for (const { relPath, data } of rawEntries) {
  for (const rid of data.relatedIds || []) {
    if (!seenIds.has(rid)) {
      errors.push(`[${relPath}] relatedId '${rid}' does not exist in entries`);
    }
  }
}

// Scan novels (book.json + ch-*.md)
const novels = [];
if (fs.existsSync(NOVELS_DIR)) {
  for (const dirEnt of fs.readdirSync(NOVELS_DIR, { withFileTypes: true })) {
    if (!dirEnt.isDirectory()) continue;
    const bookDir = path.join(NOVELS_DIR, dirEnt.name);
    const bookJsonPath = path.join(bookDir, "book.json");
    if (!fs.existsSync(bookJsonPath)) continue;
    const book = JSON.parse(fs.readFileSync(bookJsonPath, "utf8"));
    const mdFiles = walkFiles(bookDir, ".md");
    const chapters = mdFiles.map((mf) => {
      const rel = path.relative(ROOT, mf).replace(/\\/g, "/");
      const { meta, body } = parseFrontMatter(fs.readFileSync(mf, "utf8"), rel);
      for (const req of ["id", "title", "provenance"]) {
        if (!meta[req]) errors.push(`[${rel}] missing front matter '${req}'`);
      }
      if (seenIds.has(meta.id)) {
        errors.push(`[${rel}] duplicate id '${meta.id}'`);
      } else {
        seenIds.set(meta.id, rel);
      }
      return {
        id: meta.id,
        chapterNumber: meta.chapterNumber || 1,
        title: meta.title,
        provenance: meta.provenance,
        charCount: body.length,
        path: rel,
      };
    });
    novels.push({
      bookId: book.bookId,
      title: book.title,
      provenance: book.provenance,
      summary: book.summary,
      chapters,
      updatedAt: book.updatedAt || "2026-11-26",
    });
  }
}

// Validate GeoJSON map features if data/map/*.geojson exists
const mapFiles = walkFiles(MAP_DIR, ".geojson");
for (const mf of mapFiles) {
  const rel = path.relative(ROOT, mf).replace(/\\/g, "/");
  const gj = JSON.parse(fs.readFileSync(mf, "utf8"));
  for (const feat of gj.features || []) {
    const eid = feat.properties?.entryId;
    if (eid && !seenIds.has(eid)) {
      errors.push(`[${rel}] feature '${feat.properties?.id || ""}' references missing entryId '${eid}'`);
    }
    if (feat.geometry?.type === "Point") {
      const [lon, lat] = feat.geometry.coordinates || [];
      if (typeof lon !== "number" || lon < -180 || lon > 180 || typeof lat !== "number" || lat < -90 || lat > 90) {
        errors.push(`[${rel}] feature '${feat.properties?.id}' has invalid [lon, lat]: ${JSON.stringify(feat.geometry.coordinates)}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Manifest validation FAILED:");
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}

const manifest = {
  generatedBy: "tools/build-manifest.mjs",
  updatedAt: "2026-11-26",
  counts: {
    entries: entries.length,
    novels: novels.length,
    mapFiles: mapFiles.length,
  },
  entries,
  novels,
};

fs.writeFileSync(path.join(DATA_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Manifest built & validated cleanly: ${entries.length} entries, ${novels.length} novels, ${mapFiles.length} map files.`);
