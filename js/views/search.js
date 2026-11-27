/**
 * js/views/search.js
 * Full-Site Archival Search (#/search?q=<kw>)
 * Strict /\bSCP-(\d+)\b/i word-boundary validation, natural-language reverse matching
 * with top coordinate answer card, cross-category + novel + playCase coverage,
 * zero hallucinated fallback, and full escapeHtml XSS safety.
 */

import { escapeHtml } from "../sanitize.js";
import { formatPlainSummary } from "../autolink.js";
import { ARCHIVE_CATEGORIES } from "./home.js";
import { buildEntryMapHref } from "./category.js";

const CAT_LABEL_MAP = Object.fromEntries(
  ARCHIVE_CATEGORIES.map((c) => [c.slug, c.title])
);

const SUGGESTED_CHIPS = [
  "SCP-2317",
  "SCP-173",
  "拉莱耶在哪",
  "亚历山大坐标",
  "守门人是谁",
  "破碎之神",
];

function getBadgeMeta(provenance, provenanceLabel) {
  if (provenance === "original") {
    return { cls: "badge-original", text: provenanceLabel || "本站设定" };
  }
  if (provenance === "cthulhu-canon") {
    return { cls: "badge-canon", text: provenanceLabel || "克苏鲁原典" };
  }
  return { cls: "badge-canon", text: provenanceLabel || "SCP原典" };
}

function formatEntryCoord(geo) {
  if (!geo || typeof geo.lat !== "number" || typeof geo.lon !== "number") {
    return "";
  }
  const digits = geo.precision === "exact" ? 4 : 1;
  const ns = geo.lat >= 0 ? "N" : "S";
  const ew = geo.lon >= 0 ? "E" : "W";
  return `${Math.abs(geo.lat).toFixed(digits)}°${ns}, ${Math.abs(geo.lon).toFixed(digits)}°${ew}`;
}

function extractQueryValue(queryStr) {
  if (queryStr instanceof URLSearchParams) {
    return String(queryStr.get("q") || "").trim();
  }
  const raw = String(queryStr ?? "").trim();
  if (!raw) {
    const hash = typeof window !== "undefined" ? String(window.location.hash || "") : "";
    const qIdx = hash.indexOf("?");
    if (qIdx >= 0) {
      const sp = new URLSearchParams(hash.slice(qIdx + 1));
      return String(sp.get("q") || "").trim();
    }
    return "";
  }
  if (raw.startsWith("?") || raw.includes("q=")) {
    const sp = new URLSearchParams(raw.replace(/^\?/, ""));
    if (sp.has("q")) return String(sp.get("q") || "").trim();
  }
  return raw;
}

function extractEntryKeywords(entry) {
  const keys = new Set();
  const addClean = (s) => {
    const t = String(s ?? "").trim();
    if (t.length >= 2) keys.add(t.toLowerCase());
  };

  if (entry.title) {
    addClean(entry.title);
    const stripped = String(entry.title)
      .replace(/（[^）]*）/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/^[IVXLCDM]+\s*·\s*/i, "")
      .trim();
    addClean(stripped);
    for (const part of stripped.split(/\s*[·&×]\s*/)) {
      addClean(part.replace(/^[IVXLCDM]+\s+/i, ""));
    }
  }
  if (entry.code) addClean(entry.code);
  for (const al of entry.aliases || []) {
    addClean(al);
    const cleanAl = String(al || "")
      .replace(/（[^）]*）/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/^[IVXLCDM]+\s*·\s*/i, "")
      .trim();
    addClean(cleanAl);
  }
  return [...keys];
}

function parseNaturalIntent(rawQuery) {
  const q = String(rawQuery ?? "").trim();
  const isLocationIntent =
    /在哪|哪里|什么地方|何处|位置|坐标|经纬|怎么去|位于|海域/.test(q);
  const isIdentityIntent =
    /是谁|是什么|何人|来历|职责|分级|收容等级/.test(q);

  const coreSubject = q
    .replace(
      /(请问|告诉我|帮我查|查询|检索|在哪里?|在哪儿?|在什么地方|位于何处|位于哪里|的具体位置|位置|的?经纬度?|的?坐标(是多少)?|是谁|是什么异常|是什么|怎么去|有哪些|的?档案|的?资料|[？?。！!，,、\s]+)/gi,
      " "
    )
    .trim();

  const tokens = coreSubject
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 1);

  return {
    raw: q,
    rawLower: q.toLowerCase(),
    coreSubject,
    coreLower: coreSubject.toLowerCase(),
    tokens,
    isLocationIntent,
    isIdentityIntent,
  };
}

function findClosestScpEntries(entries, targetNum, count = 3) {
  const candidates = [];
  const seenScpNums = new Set();

  // Prefer category === "scp" first so primary containment files rank cleanly
  const orderedPool = [...entries].sort((a, b) => {
    const pa = a.category === "scp" ? 0 : 1;
    const pb = b.category === "scp" ? 0 : 1;
    return pa - pb || String(a.id).localeCompare(String(b.id));
  });

  for (const e of orderedPool) {
    const blob = `${e.code || ""} ${e.title || ""} ${(e.aliases || []).join(" ")}`;
    const m = blob.match(/\bSCP-(\d+)\b/i);
    if (!m) continue;
    const num = parseInt(m[1], 10);
    if (Number.isNaN(num) || seenScpNums.has(num)) continue;
    seenScpNums.add(num);
    candidates.push({
      entry: e,
      scpNum: num,
      diff: Math.abs(num - targetNum),
    });
  }

  candidates.sort((a, b) => a.diff - b.diff || a.scpNum - b.scpNum);
  return candidates.slice(0, count).map((c) => c.entry);
}

function executeArchiveSearch(rawQuery, { entries, novels, playCases }) {
  const intent = parseNaturalIntent(rawQuery);
  const byId = new Map(entries.map((e) => [e.id, e]));

  // 1. Strict word-boundary check for SCP-\d+ queries
  const scpMatch = rawQuery.match(/\bSCP-(\d+)\b/i);
  if (scpMatch) {
    const numStr = scpMatch[1];
    const targetNum = parseInt(numStr, 10);
    const canonicalCode = `SCP-${numStr.toUpperCase()}`;
    // Word boundary ensures SCP-173 NEVER matches SCP-1730
    const exactScpRe = new RegExp(`\\bSCP-${numStr}\\b`, "i");

    const exactEntries = entries.filter((e) => {
      return (
        exactScpRe.test(e.code || "") ||
        exactScpRe.test(e.title || "") ||
        (Array.isArray(e.aliases) && e.aliases.some((a) => exactScpRe.test(a))) ||
        exactScpRe.test(e.summary || "")
      );
    });

    if (exactEntries.length === 0) {
      return {
        unrecordedScpCode: canonicalCode,
        closestScpEntries: findClosestScpEntries(entries, targetNum, 3),
        entryHits: [],
        novelHits: [],
        caseHits: [],
        topDirectAnswer: null,
        intent,
      };
    }

    exactEntries.sort((a, b) => {
      const aPrimary = exactScpRe.test(a.code || "") || exactScpRe.test(a.title || "") ? 0 : 1;
      const bPrimary = exactScpRe.test(b.code || "") || exactScpRe.test(b.title || "") ? 0 : 1;
      if (aPrimary !== bPrimary) return aPrimary - bPrimary;
      const catOrder = { scp: 0, entities: 1, sites: 2 };
      return (catOrder[a.category] ?? 9) - (catOrder[b.category] ?? 9);
    });

    const top = exactEntries[0];
    const linkedSite = top.geo ? top : top.mapSiteId ? byId.get(top.mapSiteId) : null;

    return {
      unrecordedScpCode: "",
      closestScpEntries: [],
      entryHits: exactEntries,
      novelHits: [],
      caseHits: [],
      topDirectAnswer:
        intent.isLocationIntent || intent.isIdentityIntent || linkedSite?.geo
          ? { entry: top, geoSource: linkedSite }
          : null,
      intent,
    };
  }

  // 2. General + Natural-Language Reverse Matching across all 6 entry categories, novels & playCases
  const scoredEntries = [];
  for (const e of entries) {
    let score = 0;
    const idL = String(e.id || "").toLowerCase();
    const codeL = String(e.code || "").toLowerCase();
    const titleL = String(e.title || "").toLowerCase();
    const sumL = String(e.summary || "").toLowerCase();
    const eraL = String(e.eraLabel || "").toLowerCase();
    const entryKeys = extractEntryKeywords(e);

    // Forward match (entry fields contain query or cleaned core subject)
    const termsToCheck = [intent.rawLower, intent.coreLower, ...intent.tokens].filter(
      (t) => t.length >= 1
    );

    for (const term of termsToCheck) {
      if (idL === term || codeL === term || titleL === term) {
        score = Math.max(score, 120);
      } else if (titleL.includes(term)) {
        score = Math.max(score, 95);
      } else if (codeL.includes(term)) {
        score = Math.max(score, 90);
      } else if (entryKeys.some((k) => k === term)) {
        score = Math.max(score, 92);
      } else if (entryKeys.some((k) => k.includes(term) && term.length >= 2)) {
        score = Math.max(score, 82);
      } else if (eraL.includes(term) && term.length >= 2) {
        score = Math.max(score, 74);
      } else if (sumL.includes(term) && term.length >= 2) {
        score = Math.max(score, 56);
      }
    }

    // Natural-language reverse match (user question contains entry's canonical name/alias, e.g. "拉莱耶在哪")
    for (const k of entryKeys) {
      if (k.length < 2) continue;
      if (/^[ivxlcdm]+$/i.test(k)) continue;
      if (k === "scp" || k === "goi" || k === "基金会") continue;
      if (intent.rawLower.includes(k)) {
        score = Math.max(score, 88 + Math.min(20, k.length * 2));
      }
    }

    if (score > 0) {
      if (intent.isLocationIntent && e.geo) {
        score += 18;
      } else if (intent.isLocationIntent && e.mapSiteId) {
        score += 6;
      }
      if (intent.isIdentityIntent && (e.category === "entities" || e.category === "scp")) {
        score += 12;
      }
      scoredEntries.push({ entry: e, score });
    }
  }

  scoredEntries.sort(
    (a, b) => b.score - a.score || String(a.entry.id).localeCompare(String(b.entry.id))
  );
  const entryHits = scoredEntries.map((s) => s.entry);

  // Match novels (books & chapters)
  const novelHits = [];
  for (const book of novels) {
    const bookBlob = `${book.bookId || ""} ${book.title || ""} ${book.summary || ""}`.toLowerCase();
    const matchedChs = (book.chapters || []).filter((ch) => {
      const chBlob = `${ch.id || ""} ${ch.title || ""}`.toLowerCase();
      return (
        chBlob.includes(intent.rawLower) ||
        (intent.coreLower.length >= 2 && chBlob.includes(intent.coreLower))
      );
    });
    const bookMatches =
      bookBlob.includes(intent.rawLower) ||
      (intent.coreLower.length >= 2 && bookBlob.includes(intent.coreLower));

    if (bookMatches || matchedChs.length > 0) {
      novelHits.push({ book, matchedChapters: matchedChs });
    }
  }

  // Match playCases
  const caseHits = playCases.filter((c) => {
    const blob = `${c.caseId || ""} ${c.title || ""} ${c.subtitle || ""} ${c.summary || ""}`.toLowerCase();
    return (
      blob.includes(intent.rawLower) ||
      (intent.coreLower.length >= 2 && blob.includes(intent.coreLower))
    );
  });

  let topDirectAnswer = null;
  if (entryHits.length > 0 && (intent.isLocationIntent || intent.isIdentityIntent || entryHits[0].geo)) {
    const top = entryHits[0];
    const geoSource = top.geo ? top : top.mapSiteId ? byId.get(top.mapSiteId) : null;
    if (intent.isLocationIntent || intent.isIdentityIntent || scoredEntries[0].score >= 92) {
      topDirectAnswer = { entry: top, geoSource };
    }
  }

  return {
    unrecordedScpCode: "",
    closestScpEntries: [],
    entryHits,
    novelHits,
    caseHits,
    topDirectAnswer,
    intent,
  };
}

function renderEntryHitCard(item, clLevel) {
  const badge = getBadgeMeta(item.provenance, item.provenanceLabel);
  const catName = CAT_LABEL_MAP[item.category] || item.category;
  const coordStr = formatEntryCoord(item.geo);
  const mapHref = buildEntryMapHref(item);
  const lv = Math.max(1, Number(item.clearance) || 1);

  return `
    <article class="wiki-dossier-card">
      <div class="wiki-dossier-card-body">
        <div class="wiki-dossier-top">
          <span class="wiki-dossier-code">${escapeHtml(item.code || catName)}</span>
          <div class="wiki-dossier-badges">
            <span class="wiki-cat-pill">${escapeHtml(catName)}</span>
            <span class="${badge.cls}">${escapeHtml(badge.text)}</span>
            <span class="wiki-lv-pill">Lv.${lv}</span>
          </div>
        </div>
        <h3 class="wiki-dossier-title">
          <a href="#/entry/${encodeURIComponent(item.id)}" data-entry-preview="${escapeHtml(item.id)}">${escapeHtml(item.title)}</a>
        </h3>
        ${
          coordStr
            ? `<div class="wiki-dossier-coord">坐标：${escapeHtml(coordStr)}</div>`
            : ""
        }
        <p class="wiki-dossier-summary">${formatPlainSummary(item.summary, clLevel)}</p>
      </div>
      <div class="wiki-dossier-actions">
        <a class="bp-btn active" href="#/entry/${encodeURIComponent(item.id)}" data-entry-preview="${escapeHtml(item.id)}">查阅完整卷宗 →</a>
        ${
          mapHref
            ? `<a class="bp-btn" href="${escapeHtml(mapHref)}">舆图定位 →</a>`
            : ""
        }
      </div>
    </article>
  `;
}

export async function renderSearchView(rootEl, queryStr, ctx) {
  if (!rootEl) return;
  if (typeof rootEl.__wikiCleanup === "function") {
    rootEl.__wikiCleanup();
    rootEl.__wikiCleanup = null;
  }

  const initialQ = extractQueryValue(queryStr);
  const manifest = await ctx.getManifest();
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const novels = Array.isArray(manifest?.novels) ? manifest.novels : [];

  let playCases = Array.isArray(manifest?.playCases) ? manifest.playCases : [];
  if (playCases.length === 0 && typeof ctx.fetchJson === "function") {
    try {
      const idxData = await ctx.fetchJson("data/play/index.json");
      if (Array.isArray(idxData?.cases)) playCases = idxData.cases;
      else if (Array.isArray(idxData)) playCases = idxData;
    } catch (_) {}
  }

  const clState = ctx.clearance.getClearanceState();

  rootEl.innerHTML = `
    <div class="wiki-page wiki-search-page">
      <nav class="wiki-breadcrumb" aria-label="面包屑导航">
        <a href="#/">档案馆大厅</a>
        <span class="wiki-bc-sep">/</span>
        <span>全馆检索终端</span>
      </nav>

      <header class="wiki-cat-header">
        <div class="lapidary-serif">INDEX INQVISITIONIS · 全馆跨卷宗检索</div>
        <h1 class="wiki-cat-page-title">档案馆检索终端</h1>
        <p class="wiki-cat-page-desc">
          检索范围覆盖全部六类馆藏卷宗、连载小说与互动调查剧本；支持完整 SCP 编号精确校验及“拉莱耶在哪”等自然语言提问。
        </p>
      </header>

      <section class="wiki-search-hub">
        <form class="wiki-search-form" data-role="search-page-form" role="search">
          <div class="wiki-search-input-wrap">
            <input
              type="search"
              class="wiki-search-input"
              data-role="search-page-input"
              value="${escapeHtml(initialQ)}"
              autocomplete="off"
              placeholder="输入编号或提问（如：SCP-2317 / SCP-173 / 拉莱耶在哪 / 亚历山大坐标）..."
              aria-label="全站检索词"
            />
            <button type="submit" class="bp-btn active wiki-search-submit">检索</button>
          </div>
        </form>
        <div class="wiki-quick-chips">
          <span class="wiki-quick-label">示例检索：</span>
          ${SUGGESTED_CHIPS.map(
            (chip) =>
              `<a class="wiki-chip" href="#/search?q=${encodeURIComponent(chip)}">${escapeHtml(chip)}</a>`
          ).join("")}
        </div>
      </section>

      <section class="wiki-search-results-host" data-role="search-results-host"></section>

      <footer class="cc-footer">
        版权声明：SCP 相关原典词条遵循 <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.zh-hans" target="_blank" rel="noopener">CC BY-SA 3.0 协议</a>；克苏鲁神话原典属公有领域；线框徽章标示本站原创设定。本站为虚构创作作品，地点与真实机构无关。
      </footer>
    </div>
  `;

  const formEl = rootEl.querySelector('[data-role="search-page-form"]');
  const inputEl = rootEl.querySelector('[data-role="search-page-input"]');
  const resultsHost = rootEl.querySelector('[data-role="search-results-host"]');

  const renderQueryOutput = (qVal) => {
    if (!resultsHost) return;
    const q = String(qVal ?? "").trim();

    if (!q) {
      resultsHost.innerHTML = `
        <div class="wiki-empty-box">
          <div class="lapidary-serif">PARATVS AD QVAERENDVM</div>
          <h2 class="wiki-empty-title">请输入检索词或选择上方快捷提问</h2>
          <p class="wiki-empty-desc">
            当前索引已载入 ${entries.length} 份档案卷宗、${novels.length} 部连载小说与 ${playCases.length} 份现场调查案卷。未收录的 SCP 编号将如实告知并列出最接近的馆藏档案。
          </p>
        </div>
      `;
      return;
    }

    const res = executeArchiveSearch(q, { entries, novels, playCases });

    // Case 1: Exact SCP-XXXX queried, but NOT recorded in the archive!
    if (res.unrecordedScpCode) {
      resultsHost.innerHTML = `
        <div class="wiki-unrecorded-banner" role="status">
          <div class="lapidary-serif">LACVNA CONTENTIONIS · EXACT CODE CHECK</div>
          <h2 class="wiki-unrecorded-title">档案库未收录：${escapeHtml(res.unrecordedScpCode)}</h2>
          <p class="wiki-unrecorded-desc">
            经完整词边界校验，本馆当前未收录编号 <strong>${escapeHtml(res.unrecordedScpCode)}</strong> 的档案（绝不以相近长编号冒充命中）。以下列出馆藏中编号最接近的 ${res.closestScpEntries.length} 份 SCP 收容卷宗供参阅：
          </p>
        </div>
        ${
          res.closestScpEntries.length > 0
            ? `<div class="wiki-search-group">
                <h3 class="wiki-search-group-title">相近编号馆藏推荐（${res.closestScpEntries.length} 卷）</h3>
                <div class="wiki-dossier-grid">
                  ${res.closestScpEntries
                    .map((item) => renderEntryHitCard(item, clState.level))
                    .join("")}
                </div>
              </div>`
            : ""
        }
      `;
      return;
    }

    const totalHits =
      res.entryHits.length + res.novelHits.length + res.caseHits.length;

    // Case 2: Zero matches anywhere (100% honest, XSS-safe, zero hallucinated text)
    if (totalHits === 0) {
      resultsHost.innerHTML = `
        <div class="wiki-empty-box" role="status">
          <div class="lapidary-serif">NVLLVM RESPONSVM</div>
          <h2 class="wiki-empty-title">档案库未收录：“${escapeHtml(q)}”</h2>
          <p class="wiki-empty-desc">
            在全部六类档案卷宗、连载小说与互动调查剧本中均未找到与“${escapeHtml(q)}”匹配的记录。请尝试缩短关键词或按分类目录浏览。
          </p>
          <div class="wiki-dossier-actions" style="justify-content:center;">
            <a class="bp-btn active" href="#/category/scp">浏览收容档案 →</a>
            <a class="bp-btn" href="#/category/entities">浏览实体与神祇 →</a>
            <a class="bp-btn" href="#/category/sites">浏览地点与站点 →</a>
          </div>
        </div>
      `;
      return;
    }

    // Optional Direct Answer Card (highlighted at top for location / coordinate / identity queries)
    let directCardHtml = "";
    if (res.topDirectAnswer) {
      const { entry: top, geoSource } = res.topDirectAnswer;
      const badge = getBadgeMeta(top.provenance, top.provenanceLabel);
      const coordText = geoSource?.geo ? formatEntryCoord(geoSource.geo) : "";
      const mapHref = buildEntryMapHref(top) || buildEntryMapHref(geoSource);

      directCardHtml = `
        <section class="wiki-direct-answer-card" aria-label="检索直达摘要与坐标">
          <div class="wiki-direct-top">
            <span class="lapidary-serif">RESPONSVM DIRECTVM · 馆藏直达解析</span>
            <span class="${badge.cls}">${escapeHtml(badge.text)}</span>
          </div>
          <h2 class="wiki-direct-title">
            <a href="#/entry/${encodeURIComponent(top.id)}" data-entry-preview="${escapeHtml(top.id)}">${escapeHtml(top.title)}</a>
          </h2>
          ${
            coordText
              ? `<div class="wiki-direct-coord-box">
                  <span class="wiki-direct-coord-label">档案标定坐标：</span>
                  <strong class="wiki-direct-coord-val">${escapeHtml(coordText)}</strong>
                  ${
                    geoSource && geoSource.id !== top.id
                      ? `<span class="wiki-direct-coord-ref">（关联站点：${escapeHtml(geoSource.title)}）</span>`
                      : ""
                  }
                </div>`
              : ""
          }
          <p class="wiki-direct-summary">${formatPlainSummary(top.summary, clState.level)}</p>
          <div class="wiki-dossier-actions">
            <a class="bp-btn active" href="#/entry/${encodeURIComponent(top.id)}">阅读完整卷宗 →</a>
            ${
              mapHref
                ? `<a class="bp-btn" href="${escapeHtml(mapHref)}">在铜版舆图定位 →</a>`
                : ""
            }
          </div>
        </section>
      `;
    }

    const entriesSectionHtml =
      res.entryHits.length > 0
        ? `
        <div class="wiki-search-group">
          <h2 class="wiki-search-group-title">匹配馆藏卷宗（${res.entryHits.length} 卷）</h2>
          <div class="wiki-dossier-grid">
            ${res.entryHits
              .map((item) => renderEntryHitCard(item, clState.level))
              .join("")}
          </div>
        </div>
      `
        : "";

    const novelsSectionHtml =
      res.novelHits.length > 0
        ? `
        <div class="wiki-search-group">
          <h2 class="wiki-search-group-title">匹配连载小说（${res.novelHits.length} 部）</h2>
          <div class="wiki-dossier-grid">
            ${res.novelHits
              .map(({ book, matchedChapters }) => {
                const badge = getBadgeMeta(book.provenance, book.provenanceLabel);
                return `
                  <article class="wiki-dossier-card">
                    <div class="wiki-dossier-card-body">
                      <div class="wiki-dossier-top">
                        <span class="wiki-dossier-code">NOVEL</span>
                        <span class="${badge.cls}">${escapeHtml(badge.text)}</span>
                      </div>
                      <h3 class="wiki-dossier-title">
                        <a href="#/novel/${encodeURIComponent(book.bookId)}">${escapeHtml(book.title)}</a>
                      </h3>
                      <p class="wiki-dossier-summary">${escapeHtml(book.summary || "")}</p>
                      ${
                        matchedChapters.length > 0
                          ? `<div class="wiki-search-ch-hits">
                              ${matchedChapters
                                .map(
                                  (ch) =>
                                    `<a class="wiki-chip" href="#/novel/${encodeURIComponent(book.bookId)}/${encodeURIComponent(ch.id)}">${escapeHtml(ch.title)} →</a>`
                                )
                                .join("")}
                            </div>`
                          : ""
                      }
                    </div>
                    <div class="wiki-dossier-actions">
                      <a class="bp-btn active" href="#/novel/${encodeURIComponent(book.bookId)}">打开小说阅读器 →</a>
                    </div>
                  </article>
                `;
              })
              .join("")}
          </div>
        </div>
      `
        : "";

    const casesSectionHtml =
      res.caseHits.length > 0
        ? `
        <div class="wiki-search-group">
          <h2 class="wiki-search-group-title">匹配互动调查卷宗（${res.caseHits.length} 案）</h2>
          <div class="wiki-dossier-grid">
            ${res.caseHits
              .map((c) => {
                const badge = getBadgeMeta(
                  c.provenance || "original",
                  c.provenanceLabel
                );
                return `
                  <article class="wiki-dossier-card">
                    <div class="wiki-dossier-card-body">
                      <div class="wiki-dossier-top">
                        <span class="wiki-dossier-code">INQVISITIO</span>
                        <span class="${badge.cls}">${escapeHtml(badge.text)}</span>
                      </div>
                      <h3 class="wiki-dossier-title">
                        <a href="#/play/${encodeURIComponent(c.caseId)}">${escapeHtml(c.title)}</a>
                      </h3>
                      <p class="wiki-dossier-summary">${escapeHtml(c.summary || c.subtitle || "")}</p>
                    </div>
                    <div class="wiki-dossier-actions">
                      <a class="bp-btn active" href="#/play/${encodeURIComponent(c.caseId)}">开始现场调查 →</a>
                    </div>
                  </article>
                `;
              })
              .join("")}
          </div>
        </div>
      `
        : "";

    resultsHost.innerHTML = `
      <div class="wiki-search-stat-line">
        检索词 <strong>“${escapeHtml(q)}”</strong> 共命中 ${totalHits} 项馆藏记录
      </div>
      ${directCardHtml}
      ${entriesSectionHtml}
      ${novelsSectionHtml}
      ${casesSectionHtml}
    `;
  };

  renderQueryOutput(initialQ);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const val = String(inputEl?.value ?? "").trim();
    const targetHash = val
      ? `#/search?q=${encodeURIComponent(val)}`
      : "#/search";
    if (typeof window !== "undefined" && window.location.hash === targetHash) {
      renderQueryOutput(val);
      return;
    }
    if (typeof ctx.navigate === "function") ctx.navigate(targetHash);
    else window.location.hash = targetHash;
  };

  formEl?.addEventListener("submit", handleSearchSubmit);

  rootEl.__wikiCleanup = () => {
    formEl?.removeEventListener("submit", handleSearchSubmit);
  };
}
