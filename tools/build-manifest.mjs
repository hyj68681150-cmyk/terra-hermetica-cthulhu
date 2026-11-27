#!/usr/bin/env node
/**
 * tools/build-manifest.mjs
 * Zero-dependency manifest builder & validator for Theologia Caerulea Archive.
 * Validates:
 *  1. Unique `id` across all JSON entries, Markdown chapters, and Play cases
 *  2. Required fields (`id`, `category`, `title`, `provenance`, `summary`), `category` in 7-shelf taxonomy (incl. `guides`),
 *     and timeline fields (`eraLabel`, `yearSort`)
 *  3. Optional `bodyPath` Markdown dossiers/guides: file exists, front matter matches `id`,
 *     every `[[id]]` resolves, `::: doc` `type`/`origin`/`clearance` valid, `::: figure` `src` pattern valid,
 *     missing figure `.webp` = warning (or error under `--strict`), outputs `bodyChars` and `readingMinutes`
 *  4. Valid `geo` bounds (-90 <= lat <= 90, -180 <= lon <= 180) when present
 *  5. Every ID in `relatedIds`, `relatedEntries`, and explicit `[[entryId|...]]` links exists in entries
 *  6. Branching SAN play scripts in `data/play/index.json` & `data/play/case-*.json`
 *  7. GeoJSON features in `data/map/*.geojson` reference valid `entryId` (when present)
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
const PLAY_DIR = path.join(PLAY_DIR_PATH());
const MAP_DIR = path.join(DATA_DIR, "map");

function PLAY_DIR_PATH() {
  return path.join(DATA_DIR, "play");
}

const STRICT_MODE = process.argv.includes("--strict");

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const VALID_CATEGORIES = new Set([
  "guides",
  "entities",
  "scp",
  "sites",
  "goi",
  "timeline",
  "codices",
]);
const VALID_DOC_TYPES = new Set([
  "report",
  "interview",
  "test-log",
  "exploration",
  "notes",
  "letter",
  "clipping",
  "incident",
  "memo",
  "transcript",
]);
const VALID_DOC_ORIGINS = new Set(["canon", "original"]);
const VALID_FIGURE_SRC_RE = /^assets\/plates\/[a-z0-9][a-z0-9-]*-\d{2,3}\.webp$/;
const BODY_CHAR_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaffA-Za-z0-9]/g;
const ATTR_RE = /(\w+)=(?:"([^"]*)"|(\S+))/g;

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
  const m = mdText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
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
    } else if (/^-?\d+(\.\d+)?$/.test(v)) {
      v = Number(v);
    }
    meta[k] = v;
  }
  return { meta, body: m[2].trim() };
}

function parseAttrs(str) {
  const attrs = {};
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(str)) !== null) {
    attrs[m[1]] = m[2] !== undefined ? m[2] : m[3];
  }
  return attrs;
}

function checkExplicitWikiLinks(text, relPath, entryIds, errors) {
  if (typeof text !== "string") return;
  const re = /\[\[([^\|\]]+)(?:\|[^\]]+)?\]\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const targetId = m[1].trim();
    if (!ID_RE.test(targetId)) {
      errors.push(`[${relPath}] invalid wikilink id format '[[${targetId}]]'`);
    } else if (!entryIds.has(targetId)) {
      errors.push(`[${relPath}] wikilink '[[${targetId}]]' does not exist in entries`);
    }
  }
}

function validateAndMeasureBodyMarkdown(bodyRelPath, expectedId, entryIds, errors, warnings) {
  const normRel = String(bodyRelPath || "").replace(/\\/g, "/").replace(/^\.?\//, "");
  if (!normRel.startsWith("data/") || normRel.includes("..") || !normRel.endsWith(".md")) {
    errors.push(`[${expectedId}] invalid bodyPath '${bodyRelPath}' (must be data/.../*.md)`);
    return { bodyChars: 0 };
  }
  const absPath = path.join(ROOT, normRel);
  if (!fs.existsSync(absPath)) {
    errors.push(`[${expectedId}] bodyPath file does not exist: '${normRel}'`);
    return { bodyChars: 0 };
  }

  let meta;
  let body;
  try {
    const raw = fs.readFileSync(absPath, "utf8");
    ({ meta, body } = parseFrontMatter(raw, normRel));
  } catch (err) {
    errors.push(`[${normRel}] ${err.message}`);
    return { bodyChars: 0 };
  }

  if (meta.id && String(meta.id) !== expectedId) {
    errors.push(`[${normRel}] front matter id '${meta.id}' does not match entry id '${expectedId}'`);
  }

  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let inBlock = null;
  let bodyChars = 0;
  const nonMarkerLines = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const s = line.trim();

    if (inBlock === null && s.startsWith(":::") && s.length > 3) {
      const parts = s.slice(3).trim();
      const spIdx = parts.search(/\s/);
      const kind = spIdx < 0 ? parts : parts.slice(0, spIdx);
      const attrPart = spIdx < 0 ? "" : parts.slice(spIdx + 1);
      const attrs = parseAttrs(attrPart);
      inBlock = kind;

      if (kind === "doc") {
        if (!attrs.type || !VALID_DOC_TYPES.has(attrs.type)) {
          errors.push(
            `[${normRel}:${idx + 1}] invalid doc type '${attrs.type || ""}' (allowed: ${[...VALID_DOC_TYPES].join(", ")})`
          );
        }
        if (!attrs.origin || !VALID_DOC_ORIGINS.has(attrs.origin)) {
          errors.push(
            `[${normRel}:${idx + 1}] invalid doc origin '${attrs.origin || ""}' (allowed: canon, original)`
          );
        }
        if (attrs.clearance !== undefined) {
          const cl = Number(attrs.clearance);
          if (!Number.isInteger(cl) || cl < 1 || cl > 5) {
            errors.push(`[${normRel}:${idx + 1}] invalid doc clearance '${attrs.clearance}' (must be 1..5)`);
          }
        }
      } else if (kind === "figure") {
        if (!attrs.src || !VALID_FIGURE_SRC_RE.test(attrs.src)) {
          errors.push(
            `[${normRel}:${idx + 1}] invalid figure src '${attrs.src || ""}' (must match assets/plates/<entry-id>-NN.webp)`
          );
        } else {
          const plateAbs = path.join(ROOT, attrs.src);
          if (!fs.existsSync(plateAbs)) {
            const msg = `[${normRel}:${idx + 1}] missing figure plate image '${attrs.src}'`;
            if (STRICT_MODE) errors.push(msg);
            else warnings.push(msg);
          }
        }
      } else {
        errors.push(`[${normRel}:${idx + 1}] unsupported directive '::: ${kind}'`);
      }
      continue;
    }

    if (s === ":::") {
      if (inBlock === null) {
        errors.push(`[${normRel}:${idx + 1}] stray closing ':::' without open block`);
      }
      inBlock = null;
      continue;
    }

    if (inBlock !== null && s.startsWith(":::") && s.length > 3) {
      errors.push(`[${normRel}:${idx + 1}] nested '${s}' inside unclosed '::: ${inBlock}' block`);
      continue;
    }

    const matches = line.match(BODY_CHAR_RE);
    if (matches) bodyChars += matches.length;
    nonMarkerLines.push(line);
  }

  if (inBlock !== null) {
    errors.push(`[${normRel}] unclosed '::: ${inBlock}' block at end of file`);
  }

  checkExplicitWikiLinks(nonMarkerLines.join("\n"), normRel, entryIds, errors);
  return { bodyChars, normRel };
}

const errors = [];
const warnings = [];
const seenIds = new Map();
const entryIds = new Set();
const entries = [];
const rawEntries = [];

// Pass 1: Read all entry JSON files and register all entryIds
for (const file of walkFiles(ENTRIES_DIR, ".json")) {
  const relPath = path.relative(ROOT, file).replace(/\\/g, "/");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const req of ["id", "category", "title", "provenance", "summary"]) {
    if (!data[req]) errors.push(`[${relPath}] missing required field '${req}'`);
  }
  if (data.id && !ID_RE.test(data.id)) {
    errors.push(`[${relPath}] invalid id format '${data.id}' (must match ^[a-z0-9][a-z0-9-]*$)`);
  }
  if (data.category && !VALID_CATEGORIES.has(data.category)) {
    errors.push(
      `[${relPath}] invalid category '${data.category}' (allowed: ${[...VALID_CATEGORIES].join(", ")})`
    );
  }
  if (data.mapSiteId && !ID_RE.test(data.mapSiteId)) {
    errors.push(`[${relPath}] invalid mapSiteId format '${data.mapSiteId}'`);
  }
  if (data.category === "timeline") {
    if (typeof data.eraLabel !== "string" || !data.eraLabel.trim()) {
      errors.push(`[${relPath}] timeline entry missing 'eraLabel'`);
    }
    if (typeof data.yearSort !== "number" || Number.isNaN(data.yearSort)) {
      errors.push(`[${relPath}] timeline entry missing numeric 'yearSort'`);
    }
  }
  if (Array.isArray(data.cluesGranted)) {
    for (const c of data.cluesGranted) {
      if (!c?.id || !ID_RE.test(c.id)) {
        errors.push(`[${relPath}] invalid cluesGranted id '${c?.id}'`);
      }
    }
  }
  if (seenIds.has(data.id)) {
    errors.push(`[${relPath}] duplicate id '${data.id}' (already in ${seenIds.get(data.id)})`);
  } else if (data.id) {
    seenIds.set(data.id, relPath);
    entryIds.add(data.id);
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
}

// Pass 2: Validate cross-references, inline [[entryId]] links, and optional bodyPath Markdown files
for (const { relPath, data } of rawEntries) {
  for (const rid of data.relatedIds || []) {
    if (!entryIds.has(rid)) {
      errors.push(`[${relPath}] relatedId '${rid}' does not exist in entries`);
    }
  }
  if (data.mapSiteId && !entryIds.has(data.mapSiteId)) {
    errors.push(`[${relPath}] mapSiteId '${data.mapSiteId}' does not exist in entries`);
  }
  checkExplicitWikiLinks(data.summary, relPath, entryIds, errors);
  if (data.overview) {
    checkExplicitWikiLinks(data.overview, relPath, entryIds, errors);
  }
  for (const sec of data.sections || []) {
    for (const p of sec.paragraphs || []) {
      checkExplicitWikiLinks(p, relPath, entryIds, errors);
    }
  }
  for (const lg of data.logs || []) {
    checkExplicitWikiLinks(lg.content, relPath, entryIds, errors);
  }

  let bodyChars = 0;
  let normBodyPath = null;
  if (data.bodyPath) {
    const res = validateAndMeasureBodyMarkdown(
      data.bodyPath,
      data.id,
      entryIds,
      errors,
      warnings
    );
    bodyChars = res.bodyChars || 0;
    normBodyPath = res.normRel || String(data.bodyPath);
  } else {
    // Measure inline JSON prose character count for entries without external bodyPath
    const inlineBlob = [
      data.summary || "",
      data.overview || "",
      data.proc || "",
      data.log || "",
      ...(data.sections || []).flatMap((s) => s.paragraphs || []),
      ...(data.logs || []).map((l) => l.content || ""),
    ].join("\n");
    const m = inlineBlob.match(BODY_CHAR_RE);
    bodyChars = m ? m.length : 0;
  }

  const readingMinutes =
    typeof data.readingMinutes === "number" && data.readingMinutes > 0
      ? Math.round(data.readingMinutes)
      : Math.max(1, Math.round(bodyChars / 420));

  const entryManifestObj = {
    id: data.id,
    category: data.category,
    code: data.code || "",
    title: data.title,
    aliases: data.aliases || [],
    clearance: data.clearance ?? 1,
    provenance: data.provenance,
    ...(data.provenanceLabel ? { provenanceLabel: data.provenanceLabel } : {}),
    summary: data.summary,
    ...(normBodyPath ? { bodyPath: normBodyPath } : {}),
    bodyChars,
    readingMinutes,
    geo: data.geo || null,
    mapSiteId: data.mapSiteId || null,
    ...(data.eraLabel ? { eraLabel: data.eraLabel } : {}),
    ...(typeof data.yearSort === "number" ? { yearSort: data.yearSort } : {}),
    path: relPath,
    updatedAt: data.updatedAt || "2026-11-26",
  };
  entries.push(entryManifestObj);
}

// Scan novels (book.json + ch-*.md)
const novels = [];
if (fs.existsSync(NOVELS_DIR)) {
  for (const dirEnt of fs.readdirSync(NOVELS_DIR, { withFileTypes: true })) {
    if (!dirEnt.isDirectory()) continue;
    const bookDir = path.join(NOVELS_DIR, dirEnt.name);
    const bookJsonPath = path.join(bookDir, "book.json");
    if (!fs.existsSync(bookJsonPath)) continue;
    const bookRel = path.relative(ROOT, bookJsonPath).replace(/\\/g, "/");
    const book = JSON.parse(fs.readFileSync(bookJsonPath, "utf8"));
    if (!book.bookId || !ID_RE.test(String(book.bookId))) {
      errors.push(`[${bookRel}] invalid bookId '${book.bookId}'`);
    }
    const mdFiles = walkFiles(bookDir, ".md");
    const chapters = mdFiles
      .map((mf) => {
        const rel = path.relative(ROOT, mf).replace(/\\/g, "/");
        const { meta, body } = parseFrontMatter(fs.readFileSync(mf, "utf8"), rel);
        for (const req of ["id", "title", "provenance"]) {
          if (!meta[req]) errors.push(`[${rel}] missing front matter '${req}'`);
        }
        if (meta.id && !ID_RE.test(String(meta.id))) {
          errors.push(`[${rel}] invalid id format '${meta.id}'`);
        }
        if (meta.clueId && !ID_RE.test(String(meta.clueId))) {
          errors.push(`[${rel}] invalid clueId format '${meta.clueId}'`);
        }
        if (seenIds.has(meta.id)) {
          errors.push(`[${rel}] duplicate id '${meta.id}'`);
        } else if (meta.id) {
          seenIds.set(meta.id, rel);
        }
        checkExplicitWikiLinks(body, rel, entryIds, errors);
        return {
          id: meta.id,
          chapterNumber: Number(meta.chapterNumber) || 1,
          title: meta.title,
          provenance: meta.provenance,
          estimatedMinutes: Number(meta.estimatedMinutes) || Math.max(1, Math.round(body.length / 380)),
          ...(meta.clueId ? { clueId: String(meta.clueId) } : {}),
          ...(meta.clueTitle ? { clueTitle: String(meta.clueTitle) } : {}),
          ...(typeof meta.clueXp === "number" ? { clueXp: meta.clueXp } : {}),
          charCount: body.length,
          path: rel,
        };
      })
      .sort((a, b) => a.chapterNumber - b.chapterNumber);

    novels.push({
      bookId: book.bookId,
      title: book.title,
      provenance: book.provenance,
      ...(book.provenanceLabel ? { provenanceLabel: book.provenanceLabel } : {}),
      summary: book.summary,
      chapters,
      updatedAt: book.updatedAt || "2026-11-27",
    });
  }
}

// Scan & validate branching SAN investigation scripts (data/play/index.json & case-*.json)
const playCases = [];
if (fs.existsSync(PLAY_DIR)) {
  const indexPath = path.join(PLAY_DIR, "index.json");
  const indexRel = path.relative(ROOT, indexPath).replace(/\\/g, "/");
  const caseFiles = walkFiles(PLAY_DIR, ".json").filter((f) => path.basename(f) !== "index.json");

  let indexCaseIds = null;
  if (fs.existsSync(indexPath)) {
    const idxData = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    const idxArr = Array.isArray(idxData) ? idxData : idxData.cases || idxData.playCases;
    if (!Array.isArray(idxArr)) {
      errors.push(`[${indexRel}] must contain a 'cases' array`);
    } else {
      indexCaseIds = new Set();
      for (const item of idxArr) {
        if (!item.caseId || !ID_RE.test(item.caseId)) {
          errors.push(`[${indexRel}] invalid caseId '${item.caseId}'`);
        } else {
          indexCaseIds.add(item.caseId);
        }
      }
    }
  } else if (caseFiles.length > 0) {
    errors.push(`[data/play/index.json] missing play index.json`);
  }

  for (const cf of caseFiles) {
    const rel = path.relative(ROOT, cf).replace(/\\/g, "/");
    const cdata = JSON.parse(fs.readFileSync(cf, "utf8"));
    for (const req of ["caseId", "title", "subtitle", "provenance", "summary", "startNode", "nodes"]) {
      if (!cdata[req]) errors.push(`[${rel}] missing required field '${req}'`);
    }
    if (cdata.caseId && !ID_RE.test(cdata.caseId)) {
      errors.push(`[${rel}] invalid caseId '${cdata.caseId}'`);
    }
    if (indexCaseIds && cdata.caseId && !indexCaseIds.has(cdata.caseId)) {
      errors.push(`[${rel}] caseId '${cdata.caseId}' missing from data/play/index.json`);
    }
    if (seenIds.has(cdata.caseId)) {
      errors.push(`[${rel}] duplicate id '${cdata.caseId}'`);
    } else if (cdata.caseId) {
      seenIds.set(cdata.caseId, rel);
    }

    const nodes = cdata.nodes && typeof cdata.nodes === "object" ? cdata.nodes : {};
    const nodeKeys = new Set(Object.keys(nodes));
    if (cdata.startNode && !nodeKeys.has(cdata.startNode)) {
      errors.push(`[${rel}] startNode '${cdata.startNode}' does not exist in nodes`);
    }
    for (const [nid, node] of Object.entries(nodes)) {
      if (!ID_RE.test(nid)) {
        errors.push(`[${rel}] node id '${nid}' must match ^[a-z0-9][a-z0-9-]*$`);
      }
      if (!node.title || !Array.isArray(node.paragraphs) || node.paragraphs.length === 0) {
        errors.push(`[${rel}] node '${nid}' must have title and non-empty paragraphs[]`);
      }
      for (const p of node.paragraphs || []) {
        checkExplicitWikiLinks(p, `${rel}#${nid}`, entryIds, errors);
      }
      if (node.grantClue?.id && !ID_RE.test(node.grantClue.id)) {
        errors.push(`[${rel}] node '${nid}' has invalid grantClue.id '${node.grantClue.id}'`);
      }
      for (const rid of node.relatedEntries || []) {
        if (!entryIds.has(rid)) {
          errors.push(`[${rel}] node '${nid}' relatedEntries '${rid}' does not exist in entries`);
        }
      }
      if (!node.endingType) {
        if (!Array.isArray(node.choices) || node.choices.length === 0) {
          errors.push(`[${rel}] non-ending node '${nid}' must have choices[]`);
        }
      }
      for (const ch of node.choices || []) {
        if (!ch.next || !ID_RE.test(ch.next)) {
          errors.push(`[${rel}] node '${nid}' choice has invalid next '${ch.next}'`);
        } else if (!nodeKeys.has(ch.next)) {
          errors.push(`[${rel}] node '${nid}' choice.next '${ch.next}' does not exist in nodes`);
        }
        if (ch.requiresClue && !ID_RE.test(ch.requiresClue)) {
          errors.push(`[${rel}] node '${nid}' choice has invalid requiresClue '${ch.requiresClue}'`);
        }
        if (ch.grantClue?.id && !ID_RE.test(ch.grantClue.id)) {
          errors.push(`[${rel}] node '${nid}' choice has invalid grantClue.id '${ch.grantClue.id}'`);
        }
      }
    }

    playCases.push({
      caseId: cdata.caseId,
      title: cdata.title,
      subtitle: cdata.subtitle,
      provenance: cdata.provenance,
      ...(cdata.provenanceLabel ? { provenanceLabel: cdata.provenanceLabel } : {}),
      recommendedClearance: cdata.recommendedClearance ?? 1,
      initialSan: cdata.initialSan ?? 90,
      initialHume: cdata.initialHume ?? 0.85,
      summary: cdata.summary,
      path: rel,
    });
  }
}

// Validate GeoJSON map features if data/map/*.geojson exists
const mapFiles = walkFiles(MAP_DIR, ".geojson");
for (const mf of mapFiles) {
  const rel = path.relative(ROOT, mf).replace(/\\/g, "/");
  const gj = JSON.parse(fs.readFileSync(mf, "utf8"));
  for (const feat of gj.features || []) {
    const fid = feat.properties?.id;
    const eid = feat.properties?.entryId;
    const tid = feat.properties?.targetEntryId;
    if (fid && !ID_RE.test(fid)) {
      errors.push(`[${rel}] feature id '${fid}' must match ^[a-z0-9][a-z0-9-]*$`);
    }
    if (eid && !ID_RE.test(eid)) {
      errors.push(`[${rel}] feature '${fid || ""}' entryId '${eid}' must match ^[a-z0-9][a-z0-9-]*$`);
    }
    if (tid && !ID_RE.test(tid)) {
      errors.push(`[${rel}] feature '${fid || ""}' targetEntryId '${tid}' must match ^[a-z0-9][a-z0-9-]*$`);
    }
    if (eid && !entryIds.has(eid)) {
      errors.push(`[${rel}] feature '${feat.properties?.id || ""}' references missing entryId '${eid}'`);
    }
    if (tid && !entryIds.has(tid)) {
      errors.push(`[${rel}] feature '${feat.properties?.id || ""}' references missing targetEntryId '${tid}'`);
    }
    if (feat.geometry?.type === "Point") {
      const [lon, lat] = feat.geometry.coordinates || [];
      if (typeof lon !== "number" || lon < -180 || lon > 180 || typeof lat !== "number" || lat < -90 || lat > 90) {
        errors.push(`[${rel}] feature '${feat.properties?.id}' has invalid [lon, lat]: ${JSON.stringify(feat.geometry.coordinates)}`);
      }
    } else if (feat.geometry?.type === "LineString") {
      const coords = feat.geometry.coordinates || [];
      if (coords.length < 10) {
        errors.push(`[${rel}] LineString '${fid}' has only ${coords.length} points (must be great-circle arc >= 10 points)`);
      }
      for (let i = 1; i < coords.length; i++) {
        if (Math.abs(coords[i][0] - coords[i - 1][0]) > 90) {
          errors.push(`[${rel}] LineString '${fid}' crosses antimeridian without splitting into MultiLineString`);
          break;
        }
      }
    } else if (feat.geometry?.type === "MultiLineString") {
      const lines = feat.geometry.coordinates || [];
      const totalPts = lines.reduce((s, seg) => s + seg.length, 0);
      if (totalPts < 10) {
        errors.push(`[${rel}] MultiLineString '${fid}' has only ${totalPts} points`);
      }
      for (const seg of lines) {
        for (let i = 1; i < seg.length; i++) {
          if (Math.abs(seg[i][0] - seg[i - 1][0]) > 90) {
            errors.push(`[${rel}] MultiLineString '${fid}' segment jumps > 90 deg longitude`);
            break;
          }
        }
      }
    }
  }
}

if (warnings.length > 0) {
  console.warn(`Manifest warnings (${warnings.length}):`);
  for (const w of warnings) console.warn("  [warn]", w);
}

if (errors.length > 0) {
  console.error("Manifest validation FAILED:");
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}

const manifest = {
  generatedBy: "tools/build-manifest.mjs",
  updatedAt: "2026-11-27",
  counts: {
    entries: entries.length,
    novels: novels.length,
    playCases: playCases.length,
    mapFiles: mapFiles.length,
  },
  entries,
  novels,
  playCases,
};

fs.writeFileSync(path.join(DATA_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(
  `Manifest built & validated cleanly: ${entries.length} entries, ${novels.length} novels, ${playCases.length} play cases, ${mapFiles.length} map files.`
);
