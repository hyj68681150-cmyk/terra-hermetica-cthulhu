/**
 * js/views/entry.js
 * Full Archival Entry Reader (#/entry/<id>)
 * Desktop 2-column layout (minmax(0, 1fr) 310px), mobile Infobox right below title,
 * per-section once-only autolinking, Clearance-gated logs, clue collection,
 * related back-links, and provenance/CC BY-SA 3.0 colophon.
 */

import { escapeHtml } from "../sanitize.js";
import { PANTHEON_SIGILS, CITY_SIGILS } from "../sigils.js";
import { ARCHIVE_CATEGORIES } from "./home.js";
import { buildEntryMapHref } from "./category.js";

const VALID_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

const CAT_TITLE_MAP = Object.fromEntries(
  ARCHIVE_CATEGORIES.map((c) => [c.slug, c.title])
);

const GENERIC_CATEGORY_SIGILS = {
  sites: `<svg class="sigil-lg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="19"/><circle cx="24" cy="24" r="9"/><line x1="24" y1="3" x2="24" y2="11"/><line x1="24" y1="37" x2="24" y2="45"/><line x1="3" y1="24" x2="11" y2="24"/><line x1="37" y1="24" x2="45" y2="24"/><circle cx="24" cy="24" r="2.2"/></svg>`,
  scp: `<svg class="sigil-lg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="19"/><polygon points="24,8 38,33 10,33"/><circle cx="24" cy="25" r="5"/></svg>`,
  goi: `<svg class="sigil-lg" viewBox="0 0 48 48"><polygon points="24,5 41,15 41,33 24,43 7,33 7,15"/><circle cx="24" cy="24" r="7"/><line x1="24" y1="5" x2="24" y2="17"/><line x1="24" y1="31" x2="24" y2="43"/></svg>`,
  timeline: `<svg class="sigil-lg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="19"/><line x1="24" y1="9" x2="24" y2="24"/><line x1="24" y1="24" x2="34" y2="30"/><circle cx="24" cy="24" r="2.5"/></svg>`,
  codices: `<svg class="sigil-lg" viewBox="0 0 48 48"><rect x="10" y="7" width="28" height="34" stroke-width="1.5"/><line x1="15" y1="15" x2="33" y2="15"/><line x1="15" y1="22" x2="33" y2="22"/><line x1="15" y1="29" x2="27" y2="29"/><circle cx="24" cy="35" r="2"/></svg>`,
  entities: `<svg class="sigil-lg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="19"/><ellipse cx="24" cy="24" rx="15" ry="7"/><circle cx="24" cy="24" r="3"/></svg>`,
};

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

function formatPrecisionLabel(precision) {
  if (precision === "exact") return "精确坐标 (0.0001°)";
  if (precision === "city") return "城市级锚点 (0.1°)";
  if (precision === "region") return "区域级坐标 (0.1°)";
  if (precision === "approx") return "概略坐标 (0.1°)";
  return "";
}

function pickEmblemSvg(item) {
  if (item.artType && PANTHEON_SIGILS[item.artType]) {
    return PANTHEON_SIGILS[item.artType];
  }
  if (item.legacyCityId && CITY_SIGILS[item.legacyCityId]) {
    return CITY_SIGILS[item.legacyCityId].replace('class="ico-city"', 'class="sigil-lg"');
  }
  return GENERIC_CATEGORY_SIGILS[item.category] || GENERIC_CATEGORY_SIGILS.codices;
}

function resolveRelatedEntries(item, manifestEntries) {
  const byId = new Map();
  for (const m of manifestEntries) {
    if (m && m.id) byId.set(m.id, m);
  }

  const picked = [];
  const seen = new Set([item.id]);

  const addById = (id) => {
    if (!id || seen.has(id)) return;
    const found = byId.get(id);
    if (!found) return;
    seen.add(id);
    picked.push(found);
  };

  // 1. Explicit item.relatedIds
  if (Array.isArray(item.relatedIds)) {
    for (const rid of item.relatedIds) {
      addById(rid);
    }
  }

  // 2. Direct mapSiteId counterpart
  if (item.mapSiteId) {
    addById(item.mapSiteId);
  }

  // 3. Back-links from other entries if relatedIds has < 3 items
  if (picked.length < 3) {
    const cleanShortTitle = String(item.title || "")
      .replace(/（[^）]*）/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/^[IVXLCDM]+\s*·\s*/i, "")
      .split(/\s*·\s*/)[0]
      .trim();

    for (const cand of manifestEntries) {
      if (!cand || seen.has(cand.id)) continue;
      const refsByRelated =
        Array.isArray(cand.relatedIds) && cand.relatedIds.includes(item.id);
      const refsBySite =
        cand.mapSiteId === item.id ||
        (item.mapSiteId && cand.mapSiteId === item.mapSiteId);
      const refsInSummary =
        String(cand.summary || "").includes(item.id) ||
        (cleanShortTitle.length >= 2 &&
          String(cand.summary || "").includes(cleanShortTitle));

      if (refsByRelated || refsBySite || refsInSummary) {
        addById(cand.id);
        if (picked.length >= 6) break;
      }
    }
  }

  // 4. Same-category neighbors fallback if still < 3
  if (picked.length < 3) {
    for (const cand of manifestEntries) {
      if (!cand || seen.has(cand.id)) continue;
      if (cand.category === item.category) {
        addById(cand.id);
        if (picked.length >= 4) break;
      }
    }
  }

  return picked.slice(0, 6);
}

function normalizeCluesList(item) {
  if (!item.cluesGranted) return [];
  const raw = Array.isArray(item.cluesGranted)
    ? item.cluesGranted
    : [item.cluesGranted];
  return raw.filter((c) => c && VALID_ID_RE.test(String(c.id || "")));
}

export async function renderEntryView(rootEl, entryId, ctx) {
  if (!rootEl) return;
  if (typeof rootEl.__wikiCleanup === "function") {
    rootEl.__wikiCleanup();
    rootEl.__wikiCleanup = null;
  }

  const cleanId = String(entryId || "")
    .split("?")[0]
    .replace(/^\/+|\/+$/g, "")
    .trim();

  const [manifest, autolinkIndex] = await Promise.all([
    ctx.getManifest(),
    ctx.getAutolinkIndex(),
  ]);
  const manifestEntries = Array.isArray(manifest?.entries) ? manifest.entries : [];

  let item = null;
  if (VALID_ID_RE.test(cleanId)) {
    try {
      item = await ctx.fetchEntry(cleanId);
    } catch (_) {
      item = null;
    }
  }

  if (!item) {
    rootEl.innerHTML = `
      <div class="wiki-page wiki-entry-page">
        <nav class="wiki-breadcrumb" aria-label="面包屑导航">
          <a href="#/">档案馆大厅</a>
          <span class="wiki-bc-sep">/</span>
          <span>未收录卷宗</span>
        </nav>
        <div class="wiki-empty-box">
          <div class="lapidary-serif">LACVNA ARCHIVI · NOT FOVND</div>
          <h1 class="wiki-empty-title">档案库未收录：${escapeHtml(cleanId || "未知编号")}</h1>
          <p class="wiki-empty-desc">馆藏目录中不存在该词条编号。您可使用全站检索查询相近编号，或返回档案馆大厅。</p>
          <div class="wiki-dossier-actions" style="justify-content:center;">
            <a class="bp-btn active" href="#/search?q=${encodeURIComponent(cleanId)}">在全馆检索相近词条 →</a>
            <a class="bp-btn" href="#/">返回档案馆大厅</a>
            <a class="bp-btn" href="#/map">打开铜版蓝色舆图</a>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Record entry read (+10 XP on first read, idempotent)
  ctx.clearance.recordEntryRead(item.id, item.title);

  const renderArticleDom = () => {
    const clState = ctx.clearance.getClearanceState();
    const collectedIds = new Set((clState.clues || []).map((c) => c.id));
    const badge = getBadgeMeta(item.provenance, item.provenanceLabel);
    const catSlug = VALID_ID_RE.test(String(item.category || ""))
      ? item.category
      : "scp";
    const catName = CAT_TITLE_MAP[catSlug] || catSlug;
    const itemClearance = Math.max(1, Number(item.clearance) || 1);
    const codeLabel = item.code || item.id.toUpperCase();

    // Coordinate & Map / Gallery links (strictly guarded on geo / mapSiteId and artType / legacyCityId)
    const coordStr = formatEntryCoord(item.geo);
    const precisionStr = item.geo ? formatPrecisionLabel(item.geo.precision) : "";
    const mapHref = buildEntryMapHref(item);

    const hasGalleryLink = Boolean(item.artType || item.legacyCityId);
    const galleryHref = item.artType
      ? "#/gallery/pantheon"
      : "#/gallery/astrolabe";
    const galleryBtnText = item.artType
      ? "前往视觉展厅查看圣像 →"
      : "前往视觉展厅查看星象仪 →";

    // Infobox rows
    const infoboxRows = Array.isArray(item.infobox) ? [...item.infobox] : [];
    if (
      item.eraLabel &&
      !infoboxRows.some((r) => String(r.label).includes("纪元"))
    ) {
      infoboxRows.unshift({
        label: "纪元分期",
        value: item.eraLabel,
        original: item.provenance === "original",
      });
    }

    const infoboxRowsHtml = infoboxRows
      .map(
        (r) => `
        <div class="wiki-ib-row">
          <dt class="wiki-ib-label">${escapeHtml(r.label)}</dt>
          <dd class="wiki-ib-val">
            <span>${escapeHtml(r.value)}</span>
            ${r.original ? '<span class="orig-field-tag">本站设定</span>' : ""}
          </dd>
        </div>`
      )
      .join("");

    // Clues granted box
    const cluesGranted = normalizeCluesList(item);
    const cluesBoxHtml =
      cluesGranted.length > 0
        ? `
        <div class="wiki-clue-box">
          <div class="wiki-clue-box-head">
            <span class="lapidary-serif">INDICIA ARCHIVI · 现场调查线索</span>
            <span class="wiki-lv-pill">Clearance XP</span>
          </div>
          <div class="wiki-clue-list">
            ${cluesGranted
              .map((cl) => {
                const done = collectedIds.has(cl.id);
                const xpVal = Math.max(5, Number(cl.xp) || 20);
                return done
                  ? `<div class="wiki-clue-collected">已收录现场线索：${escapeHtml(cl.title)}（+${xpVal} XP）</div>`
                  : `<button type="button" class="bp-btn active wiki-clue-btn" data-grant-clue="${escapeHtml(cl.id)}" data-clue-title="${escapeHtml(cl.title)}" data-clue-xp="${xpVal}">收录本卷现场线索：${escapeHtml(cl.title)} (+${xpVal} XP)</button>`;
              })
              .join("")}
          </div>
        </div>`
        : "";

    // Overview paragraph (fresh Set for overview)
    const overviewHtml = ctx.autolink.renderProseWithLinks(item.summary || "", {
      autolinkIndex,
      excludeId: item.id,
      currentClearance: clState.level,
      redactPrefix: `${item.id}-sum`,
      linkedSet: new Set(),
    });

    // Epigraph (scripture or motto)
    const epigraphRaw = item.scripture || item.motto || "";
    const epigraphHtml = epigraphRaw
      ? `<blockquote class="wiki-entry-epigraph">${escapeHtml(epigraphRaw)}</blockquote>`
      : "";

    // Structured sections (each section gets its OWN fresh Set() so each term autolinks once per section!)
    const sectionsArr = Array.isArray(item.sections) ? item.sections : [];
    const allSectionText = sectionsArr
      .map((s) =>
        [
          s.heading || "",
          ...(Array.isArray(s.paragraphs) ? s.paragraphs : [s.content || ""]),
        ].join(" ")
      )
      .join(" ");

    const sectionsHtml = sectionsArr
      .map((sec, sIdx) => {
        const secLinkedSet = new Set();
        const paras = Array.isArray(sec.paragraphs)
          ? sec.paragraphs
          : String(sec.content || "")
              .split(/\n{2,}/)
              .filter(Boolean);
        return `
          <section class="wiki-article-section">
            <h2 class="wiki-section-h2">${escapeHtml(sec.heading || `卷宗章节 ${sIdx + 1}`)}</h2>
            <div class="wiki-section-prose">
              ${paras
                .map(
                  (p, pIdx) =>
                    `<p class="prose-read">${ctx.autolink.renderProseWithLinks(p, {
                      autolinkIndex,
                      excludeId: item.id,
                      currentClearance: clState.level,
                      redactPrefix: `${item.id}-s${sIdx}-p${pIdx}`,
                      linkedSet: secLinkedSet,
                    })}</p>`
                )
                .join("")}
            </div>
          </section>
        `;
      })
      .join("");

    // Containment / Garrison procedures (item.proc) if present and not duplicated
    const hasProc =
      item.proc && !allSectionText.includes(String(item.proc).slice(0, 18));
    const procHtml = hasProc
      ? (() => {
          const procSet = new Set();
          return `
            <section class="wiki-article-section">
              <h2 class="wiki-section-h2">
                特殊收容与驻防规程
                <span class="orig-field-tag">本站设定</span>
              </h2>
              <div class="wiki-section-prose">
                <p class="prose-read">${ctx.autolink.renderProseWithLinks(item.proc, {
                  autolinkIndex,
                  excludeId: item.id,
                  currentClearance: clState.level,
                  redactPrefix: `${item.id}-proc`,
                  linkedSet: procSet,
                })}</p>
              </div>
            </section>
          `;
        })()
      : "";

    // Terrain / Architecture / Crowd details if present and not duplicated
    const hasSiteGeoNotes =
      (item.terrain || item.arch || item.crowd) &&
      !allSectionText.includes(String(item.terrain || item.arch || "").slice(0, 12));
    const siteGeoNotesHtml = hasSiteGeoNotes
      ? (() => {
          const geoSet = new Set();
          const rows = [
            item.terrain ? ["地势与水文", item.terrain] : null,
            item.arch ? ["核心圣城建筑", item.arch] : null,
            item.crowd ? ["驻防与行旅动态", item.crowd] : null,
          ].filter(Boolean);
          return `
            <section class="wiki-article-section">
              <h2 class="wiki-section-h2">地形剖面与城防形制</h2>
              <div class="wiki-section-prose">
                ${rows
                  .map(
                    ([k, v], idx) =>
                      `<p class="prose-read"><strong>${escapeHtml(k)}：</strong>${ctx.autolink.renderProseWithLinks(
                        v,
                        {
                          autolinkIndex,
                          excludeId: item.id,
                          currentClearance: clState.level,
                          redactPrefix: `${item.id}-geo${idx}`,
                          linkedSet: geoSet,
                        }
                      )}</p>`
                  )
                  .join("")}
              </div>
            </section>
          `;
        })()
      : "";

    // Logs: item.log (single string) + item.logs (array of { title, minClearance, content })
    const logBlocks = [];
    if (item.log) {
      logBlocks.push({
        title: "附卷监理备忘录",
        minClearance: 1,
        content: item.log,
      });
    }
    if (Array.isArray(item.logs)) {
      for (const lg of item.logs) {
        if (lg && (lg.content || Array.isArray(lg.paragraphs))) {
          logBlocks.push(lg);
        }
      }
    }

    const logsSectionHtml =
      logBlocks.length > 0
        ? `
        <section class="wiki-article-section">
          <h2 class="wiki-section-h2">机密实验与调查附卷</h2>
          <div class="wiki-logs-stack">
            ${logBlocks
              .map((lg, lIdx) => {
                const minLv = Math.max(1, Number(lg.minClearance) || 1);
                const lgTitle = lg.title || `档案附卷记录 #${lIdx + 1}`;
                if (clState.level < minLv) {
                  return `
                    <div class="wiki-clearance-lock-panel">
                      <div class="wiki-lock-top">
                        <span class="wiki-lock-badge">[机密附录 · 需 Clearance Lv.${minLv} 解锁]</span>
                        <span class="wiki-lv-pill">当前 Lv.${clState.level}</span>
                      </div>
                      <div class="wiki-lock-title">${escapeHtml(lgTitle)}</div>
                      <p class="wiki-lock-desc">
                        本段附卷受第 ${minLv} 级神学保密协议封存。通过调阅馆藏词条、收集现场线索或前往调查终端完成案件可提升权限等级。
                      </p>
                      <div class="wiki-lock-actions">
                        <a class="bp-btn active" href="#/play">进入权限与调查终端 →</a>
                      </div>
                    </div>
                  `;
                }

                const logLinkedSet = new Set();
                const logParas = Array.isArray(lg.paragraphs)
                  ? lg.paragraphs
                  : String(lg.content || "")
                      .split(/\n{2,}/)
                      .filter(Boolean);
                return `
                  <details class="wiki-log-details" open>
                    <summary class="wiki-log-summary">
                      <span class="wiki-log-lv">[Lv.${minLv} 已解密]</span>
                      <span>${escapeHtml(lgTitle)}</span>
                    </summary>
                    <div class="wiki-log-body">
                      ${logParas
                        .map(
                          (lp, pIdx) =>
                            `<p class="prose-read">${ctx.autolink.renderProseWithLinks(
                              lp,
                              {
                                autolinkIndex,
                                excludeId: item.id,
                                currentClearance: clState.level,
                                redactPrefix: `${item.id}-log${lIdx}-p${pIdx}`,
                                linkedSet: logLinkedSet,
                              }
                            )}</p>`
                        )
                        .join("")}
                    </div>
                  </details>
                `;
              })
              .join("")}
          </div>
        </section>
      `
        : "";

    // Related entries
    const relatedItems = resolveRelatedEntries(item, manifestEntries);
    const relatedHtml =
      relatedItems.length > 0
        ? `
        <section class="wiki-article-section">
          <h2 class="wiki-section-h2">关联馆藏卷宗</h2>
          <div class="wiki-related-grid">
            ${relatedItems
              .map((rel) => {
                const rb = getBadgeMeta(rel.provenance, rel.provenanceLabel);
                return `
                  <a class="wiki-related-card" href="#/entry/${encodeURIComponent(rel.id)}" data-entry-preview="${escapeHtml(rel.id)}">
                    <div class="wiki-related-top">
                      <span class="wiki-related-code">${escapeHtml(rel.code || rel.category.toUpperCase())}</span>
                      <span class="${rb.cls}">${escapeHtml(rb.text)}</span>
                    </div>
                    <div class="wiki-related-title">${escapeHtml(rel.title)}</div>
                  </a>
                `;
              })
              .join("")}
          </div>
        </section>
      `
        : "";

    // Provenance & License Box
    const attributionLines = [];
    if (item.provenanceLabel) attributionLines.push(`文献属性：${item.provenanceLabel}`);
    else attributionLines.push(`文献属性：${badge.text}`);
    if (item.authorCredit) attributionLines.push(`原典署名：${item.authorCredit}`);
    if (item.coordSource) attributionLines.push(`地理考据：${item.coordSource}`);

    rootEl.innerHTML = `
      <div class="wiki-page wiki-entry-page">
        <nav class="wiki-breadcrumb" aria-label="面包屑导航">
          <a href="#/">档案馆大厅</a>
          <span class="wiki-bc-sep">/</span>
          <a href="#/category/${encodeURIComponent(catSlug)}">${escapeHtml(catName)}</a>
          <span class="wiki-bc-sep">/</span>
          <span>${escapeHtml(codeLabel)}</span>
        </nav>

        <div class="wiki-entry-layout">
          <header class="wiki-entry-header">
            <div class="wiki-entry-kicker-row">
              <span class="wiki-entry-code">${escapeHtml(codeLabel)}</span>
              <span class="${badge.cls}">${escapeHtml(badge.text)}</span>
              <span class="wiki-lv-pill">Clearance Lv.${itemClearance}</span>
            </div>
            <h1 class="wiki-entry-title">${escapeHtml(item.title)}</h1>
            ${
              item.sub
                ? `<p class="wiki-entry-subtitle">${escapeHtml(item.sub)}</p>`
                : ""
            }
          </header>

          <aside class="wiki-infobox-aside" aria-label="词条铜版图版与元数据">
            <div class="wiki-ib-plate">
              <div class="wiki-ib-plate-top">
                <span class="lapidary-serif">FIGVRA ARCHIVI</span>
                <span class="wiki-ib-plate-lv">LV.${itemClearance}</span>
              </div>
              <div class="wiki-ib-emblem" aria-hidden="true">
                ${pickEmblemSvg(item)}
              </div>
              <div class="wiki-ib-plate-code">${escapeHtml(codeLabel)}</div>
              ${
                item.fig
                  ? `<div class="wiki-ib-plate-caption">${escapeHtml(item.fig)}</div>`
                  : ""
              }
            </div>

            <div class="wiki-ib-badges-row">
              <span class="${badge.cls}">${escapeHtml(badge.text)}</span>
              <span class="wiki-lv-pill">保密等级 Lv.${itemClearance}</span>
            </div>

            ${
              infoboxRowsHtml || coordStr
                ? `<dl class="wiki-ib-dl">
                    ${infoboxRowsHtml}
                    ${
                      coordStr
                        ? `<div class="wiki-ib-row">
                            <dt class="wiki-ib-label">经纬坐标</dt>
                            <dd class="wiki-ib-val">
                              <span class="wiki-ib-coord">${escapeHtml(coordStr)}</span>
                              ${
                                precisionStr
                                  ? `<span class="wiki-ib-precision">${escapeHtml(precisionStr)}</span>`
                                  : ""
                              }
                            </dd>
                          </div>`
                        : ""
                    }
                  </dl>`
                : ""
            }

            ${
              mapHref || hasGalleryLink
                ? `<div class="wiki-ib-actions">
                    ${
                      mapHref
                        ? `<a class="bp-btn active wiki-ib-btn" href="${escapeHtml(mapHref)}">在铜版舆图定位 →</a>`
                        : ""
                    }
                    ${
                      hasGalleryLink
                        ? `<a class="bp-btn wiki-ib-btn" href="${galleryHref}">${galleryBtnText}</a>`
                        : ""
                    }
                  </div>`
                : ""
            }
          </aside>

          <article class="wiki-entry-main">
            <section class="wiki-entry-overview">
              <p class="prose-read wiki-lead-prose">${overviewHtml}</p>
            </section>

            ${epigraphHtml}
            ${cluesBoxHtml}
            ${sectionsHtml}
            ${procHtml}
            ${siteGeoNotesHtml}
            ${logsSectionHtml}
            ${relatedHtml}

            <section class="wiki-provenance-box" aria-label="出处署名与版权声明">
              <div class="lapidary-serif">FONTES ET LICENTIA · 出处与共享协议</div>
              <p class="wiki-prov-meta">${escapeHtml(attributionLines.join(" · "))}</p>
              <p class="wiki-prov-legal">
                本词条涉及的 SCP 基金会原典概念源自 <a href="https://scp-wiki.wikidot.com/" target="_blank" rel="noopener">SCP Foundation Wiki</a> 及 <a href="https://scp-wiki-cn.wikidot.com/" target="_blank" rel="noopener">SCP基金会中文维基</a>，克苏鲁神话原典源自 H.P. 洛夫克拉夫特公有领域作品；全站内容依 <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.zh-hans" target="_blank" rel="noopener">CC BY-SA 3.0 协议</a> 发布共享。免责声明：本站为虚构创作百科，所涉坐标、地点与任何真实机构无关。
              </p>
            </section>
          </article>
        </div>
      </div>
    `;
  };

  renderArticleDom();

  const onRootClick = (e) => {
    const clueBtn = e.target.closest?.("[data-grant-clue]");
    if (clueBtn) {
      const id = clueBtn.dataset.grantClue;
      const title = clueBtn.dataset.clueTitle || id;
      const xp = Number(clueBtn.dataset.clueXp) || 20;
      const res = ctx.clearance.grantClue({
        id,
        title,
        xp,
        source: item.id,
      });
      if (res.granted && !res.leveledUp) {
        ctx.clearance.showClearanceToast(
          `已收录现场线索：${title}（+${xp} XP · 当前 Lv.${res.level}）`
        );
      }
      renderArticleDom();
    }
  };

  rootEl.addEventListener("click", onRootClick);

  let prevRenderedLevel = ctx.clearance.getClearanceState().level;
  const offClearance = ctx.clearance.onClearanceChange((nextState) => {
    if (nextState.level !== prevRenderedLevel) {
      prevRenderedLevel = nextState.level;
      renderArticleDom();
    }
  });

  rootEl.__wikiCleanup = () => {
    rootEl.removeEventListener("click", onRootClick);
    offClearance?.();
  };
}
